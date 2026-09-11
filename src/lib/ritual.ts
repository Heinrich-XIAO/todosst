"use client";

// Daily-ritual bookkeeping — never-miss-twice + auto-habit (features of the
// today view, see TodayView.tsx / TodoApp.tsx).
//
// Everything here is per-device localStorage, same E2E-safe pattern as the
// reminder "shown" marks: the server never learns whether you opened the app.
// Days are local day indexes (dayIndexLocal in src/lib/recur.ts).
//
// Model: a day is "cleared" when the today view reaches all clear. Missed
// days are the consecutive days before today without a clear — misses are
// free, pairs aren't: from two missed days on, open task rows carry the
// escalation note.

const RITUAL_KEY = "todosst:ritual";

export type RitualStore = {
  v: 1;
  /** first local day the app was opened on this device — miss-streak anchor until the first clear */
  firstDay: number | null;
  /** last local day the today view reached all clear */
  lastClearDay: number | null;
  /** the auto-habit offer was declined — never ask again on this device */
  habitOfferDismissed: boolean;
};

export function emptyRitual(): RitualStore {
  return { v: 1, firstDay: null, lastClearDay: null, habitOfferDismissed: false };
}

function dayOf(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? Math.floor(v) : null;
}

function sanitize(raw: unknown): RitualStore {
  if (!raw || typeof raw !== "object") return emptyRitual();
  const o = raw as Record<string, unknown>;
  return {
    v: 1,
    firstDay: dayOf(o.firstDay),
    lastClearDay: dayOf(o.lastClearDay),
    habitOfferDismissed: o.habitOfferDismissed === true,
  };
}

export function loadRitual(): RitualStore {
  try {
    const raw = localStorage.getItem(RITUAL_KEY);
    if (!raw) return emptyRitual();
    return sanitize(JSON.parse(raw));
  } catch {
    return emptyRitual();
  }
}

function saveRitual(s: RitualStore) {
  try {
    localStorage.setItem(RITUAL_KEY, JSON.stringify(s));
  } catch {}
}

/** Open the app on `today`: anchors firstDay once and returns the current store. */
export function openRitual(today: number): RitualStore {
  const s = loadRitual();
  if (s.firstDay === null) {
    s.firstDay = today;
    saveRitual(s);
  }
  return s;
}

/** Consecutive fully-missed days entering `today` (today itself is still open). */
export function missedDays(today: number, s: Pick<RitualStore, "firstDay" | "lastClearDay">): number {
  if (s.lastClearDay !== null) return Math.max(0, today - s.lastClearDay - 1);
  if (s.firstDay !== null) return Math.max(0, today - s.firstDay);
  return 0;
}

/** All clear reached on `today` — records it; no-op if already recorded. */
export function recordClearDay(today: number): void {
  const s = loadRitual();
  if (s.lastClearDay === today) return;
  s.lastClearDay = today;
  saveRitual(s);
}

/** Current show-up streak: consecutive active days (count > 0) ending today
 * when today already counts, else ending yesterday. Reads the habit task's
 * decrypted per-day counts (day index -> count, same codec as the heatmap);
 * 0 when there is no history yet. */
export function streakOf(today: number, counts: Map<number, number> | null | undefined): number {
  if (!counts) return 0;
  let s = 0;
  for (let d = today; d >= today - 400; d--) {
    const c = counts.get(d) ?? 0;
    if (c > 0) {
      s++;
      continue;
    }
    if (d === today) continue; // today still pending — keep counting from yesterday
    break;
  }
  return s;
}

export function dismissHabitOffer(): void {
  const s = loadRitual();
  if (s.habitOfferDismissed) return;
  s.habitOfferDismissed = true;
  saveRitual(s);
}

/** Escalation note once a task's own miss count reaches two; null = the row
 * renders normal. Shown grey on the right of its recurring task row. */
export function missCopy(misses: number): string | null {
  if (misses < 2) return null;
  return misses === 2
    ? "missed twice — today is the one that matters"
    : `missed ${misses} days — today is the one that matters`;
}

/** Per-task missed days entering `today`: days between today and the last day
 * the task reached its threshold, anchored on the task's creation day when it
 * never cleared. A task cleared today (or "in the future") has none. */
export function taskMissedDays(today: number, lastClearedDay: number | null, createdDay: number | null): number {
  const anchor = lastClearedDay ?? createdDay;
  if (anchor === null || anchor >= today) return 0;
  return today - anchor - 1;
}