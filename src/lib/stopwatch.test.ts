// @ts-nocheck — runs under `bun test` (bun:test types not installed)
import { describe, expect, it } from "bun:test";
import {
  awayGapMs,
  appendSession,
  commitSession,
  crossedPayloadThreshold,
  discardTimer,
  excludeAway,
  finishSession,
  formatElapsed,
  liveElapsedMs,
  pauseTimer,
  resumeTimer,
  startTimer,
  totalMs,
} from "./stopwatch";

const meta = () => ({});

describe("formatElapsed", () => {
  it("renders h:mm:ss", () => {
    expect(formatElapsed(0)).toBe("0:00:00");
    expect(formatElapsed(12_340)).toBe("0:00:12");
    expect(formatElapsed(754_000)).toBe("0:12:34");
    expect(formatElapsed(3_903_000)).toBe("1:05:03");
  });
});

describe("start/pause/resume", () => {
  it("start binds windowDay and begins running", () => {
    const m = startTimer(meta(), 1000, 20000);
    const t = m.timer;
    expect(t.state).toBe("running");
    expect(t.startedAt).toBe(1000);
    expect(t.elapsedMs).toBe(0);
    expect(t.resumeAt).toBe(1000);
    expect(t.windowDay).toBe(20000);
  });

  it("start is a no-op when a timer already exists", () => {
    const m = startTimer(meta(), 1000, 5);
    expect(startTimer(m, 9999, 7)).toBe(m);
  });

  it("pause accumulates the running stretch and drops resumeAt", () => {
    const m = startTimer(meta(), 1000, 5);
    const p = pauseTimer(m, 6500);
    expect(p.timer.state).toBe("paused");
    expect(p.timer.elapsedMs).toBe(5500);
    expect(p.timer.resumeAt).toBeUndefined();
  });

  it("resume restarts the stretch without touching accumulated ms", () => {
    const p = pauseTimer(startTimer(meta(), 1000, 5), 6500);
    const r = resumeTimer(p, 9000);
    expect(r.timer.state).toBe("running");
    expect(r.timer.elapsedMs).toBe(5500);
    expect(r.timer.resumeAt).toBe(9000);
  });

  it("liveElapsedMs derives from timestamps", () => {
    const running = startTimer(meta(), 1000, 5);
    expect(liveElapsedMs(running.timer, 1000)).toBe(0);
    expect(liveElapsedMs(running.timer, 8000)).toBe(7000);
    const paused = pauseTimer(running, 6500);
    expect(liveElapsedMs(paused.timer, 99_999)).toBe(5500);
  });
});

describe("finish/append/commit", () => {
  it("finishSession records start, end and net ms", () => {
    const m = startTimer(meta(), 1000, 5);
    const p = pauseTimer(m, 6000); // 5s stretch
    const r = resumeTimer(p, 20_000);
    const s = finishSession(r.timer, 25_000); // +5s running
    expect(s).toEqual({ s: 1000, e: 25_000, ms: 10_000 });
  });

  it("commitSession appends and clears the timer", () => {
    const m = startTimer(meta(), 1000, 42);
    const { metadata, session, windowDay } = commitSession(m, 11_000);
    expect(metadata.timer).toBeUndefined();
    expect(windowDay).toBe(42);
    expect(session).toEqual({ s: 1000, e: 11_000, ms: 10_000 });
    expect(metadata.sessions).toHaveLength(1);
  });

  it("totalMs sums sessions and append drops oldest past the safety net", () => {
    let m = meta();
    for (let i = 0; i < 205; i++) {
      m = appendSession(m, { s: i, e: i + 1, ms: 1 });
    }
    expect(m.sessions).toHaveLength(200);
    expect(m.sessions[0].s).toBe(5);
    expect(totalMs(m.sessions)).toBe(200);
    expect(totalMs(undefined)).toBe(0);
  });

  it("discard clears the timer without recording", () => {
    const m = appendSession(startTimer(meta(), 1000, 5), { s: 1, e: 2, ms: 1 });
    const d = discardTimer(m);
    expect(d.timer).toBeUndefined();
    expect(d.sessions).toHaveLength(1);
    expect(discardTimer(m)).not.toBe(m);
  });
});

describe("away gap", () => {
  it("gap counts only the away window of the current stretch", () => {
    // running since resumeAt 1000; closedAt 5000, back at 11_000 -> away 6000
    const timer = { startedAt: 0, elapsedMs: 1000, state: "running", resumeAt: 1000, windowDay: 5 };
    expect(awayGapMs(timer, 5000, 11_000)).toBe(6000);
    // stretch resumed after close: only the [resumeAt, now] overlap is "away"
    const later = { startedAt: 0, elapsedMs: 0, state: "running", resumeAt: 7000, windowDay: 5 };
    expect(awayGapMs(later, 5000, 11_000)).toBe(4000);
    expect(awayGapMs({ ...later, resumeAt: 11_000 }, 5000, 11_000)).toBe(0);
    // paused -> nothing running
    expect(awayGapMs({ ...timer, state: "paused" }, 5000, 11_000)).toBe(0);
  });

  it("excludeAway keeps only the pre-close portion of the stretch", () => {
    // running since resumeAt 1000; closed at 5000; back at 11_000.
    // don't count: keep 4000ms (open time 1000->5000), drop the 6000 away gap
    const timer = { startedAt: 0, elapsedMs: 1000, state: "running", resumeAt: 1000, windowDay: 5 };
    const m = excludeAway({ timer }, 5000, 11_000);
    expect(m.timer.elapsedMs).toBe(5000);
    expect(m.timer.resumeAt).toBe(11_000);
    expect(liveElapsedMs(m.timer, 12_000)).toBe(6000);
  });

  it("excludeAway drops stretches that began after close (other device)", () => {
    // resumed at 10_000 while this device was away since 5000 -> nothing kept
    const timer = { startedAt: 0, elapsedMs: 0, state: "running", resumeAt: 10_000, windowDay: 5 };
    const m = excludeAway({ timer }, 5000, 11_000);
    expect(m.timer.elapsedMs).toBe(0);
    expect(m.timer.resumeAt).toBe(11_000);
    // closed timestamp in the future / paused are no-ops on elapsed
    expect(liveElapsedMs(m.timer, 12_000)).toBe(1000);
  });
});

describe("crossedPayloadThreshold", () => {
  it("returns the highest newly crossed threshold", () => {
    expect(crossedPayloadThreshold(0, 500)).toBeNull();
    expect(crossedPayloadThreshold(500, 1025)).toBe(1024);
    expect(crossedPayloadThreshold(1025, 2000)).toBeNull();
    expect(crossedPayloadThreshold(1000, 8000)).toBe(7168);
    expect(crossedPayloadThreshold(7168, 8500)).toBe(8090);
  });
});
