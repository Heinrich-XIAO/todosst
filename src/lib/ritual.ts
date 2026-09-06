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
// free, pairs aren't: from two missed days on, the header nudge escalates.

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

export function dismissHabitOffer(): void {
  const s = loadRitual();
  if (s.habitOfferDismissed) return;
  s.habitOfferDismissed = true;
  saveRitual(s);
}

/** Escalated nudge copy once two consecutive days were missed; null = normal header. */
export function missCopy(misses: number): string | null {
  if (misses < 2) return null;
  return misses === 2
    ? "missed twice — today is the one that matters"
    : `missed ${misses} days — today is the one that matters`;
}