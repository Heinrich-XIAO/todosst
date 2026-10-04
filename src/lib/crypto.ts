"use client";

// Task node payload: the storage format for a todo row, as plain JSON.
//
// `encryptString`/`decryptString` are generic AES-GCM helpers used only by the
// downloadable backup file (src/lib/vaultFile.ts) to protect it with a
// passphrase the user chooses. Nothing here touches server storage — task rows
// are plaintext.

export type PlainNode = {
  v: 2;
  title: string;
  isCompleted: boolean;
  parentId: string | null; // Id<"todos"> as string, null = root
  order: number;
  metadata: {
    description?: string;
    // local midnight of the due day (see src/lib/due.ts) — legacy rows may
    // hold UTC midnight; normalizeDueAt migrates them on read
    dueAt?: number | null;
    // time of day for the due date, minutes since local midnight — unset =
    // date-only due (midnight), so "x minutes before" lands the evening
    // before (see dueInstant in src/lib/due.ts)
    dueTimeMin?: number;
    // reminders (see src/lib/reminders.ts) — only the derived remindAt
    // timestamps are mirrored to the server in plaintext
    reminder?: {
      enabled: boolean;
      offsetsMin?: number[]; // minutes before dueAt (default [15, 5])
    } | null;
    priority?: "low" | "med" | "high" | null;
    tags?: string[];
    icon?: string;
    color?: string;
    // recurrence (see src/lib/recur.ts) — internally always counts,
    // checkbox vs tally vs time is a rendering mode only
    recur?: string; // RFC 5545 RRULE string (jakubroztocil/rrule)
    mode?: "check" | "count" | "time";
    threshold?: number; // check mode: checked iff count >= threshold (default 1); time mode: goal in minutes; count mode: goal (unset = ∞ — tally never auto-completes)
    stepMin?: number; // time mode: minutes per + click (default 15)
    graceHours?: number; // window lock grace past midnight (default 4)
    counts?: Record<string, number>; // current window only (day-index -> count; time mode stores minutes); full history lives in todoHistory
    // auto-habit meta-task (see src/lib/ritual.ts) — the first-visit offer
    // creates "open todosst ~daily"; the app checks it whenever the today view
    // reaches all clear, feeding its heatmap as a side effect of the ritual
    habit?: boolean;
    // negative (avoid) task — recurring only (see src/lib/negative.ts): you
    // never complete it, you log slips; a window is held when it ends with
    // slips within tolerance. Slips reuse the counts storage.
    neg?: boolean;
    // slips tolerated per window (default 0) — held iff slips <= tol
    tol?: number;
    // epoch ms of the most recent transition into completed (plain tasks and
    // non-recurring tally/time thresholds); null = open. Unset on legacy rows
    // and never stamped for past-window credits (those are historical).
    completedAt?: number | null;
    // windowDay -> confirmation timestamp of manual "held" confirmations
    holds?: Record<string, number>;
  };
};

/** Parse a stored node, validating the parts the UI relies on. */
export function parseNode(json: string): PlainNode {
  const raw = JSON.parse(json) as unknown;
  if (!raw || typeof raw !== "object") throw new Error("invalid node payload");
  const n = raw as PlainNode;
  if (n.v !== 2) throw new Error("invalid node payload");
  if (typeof n.title !== "string" || typeof n.isCompleted !== "boolean") {
    throw new Error("invalid node payload");
  }
  if (n.parentId !== null && typeof n.parentId !== "string") throw new Error("invalid parentId");
  if (typeof n.order !== "number" || !Number.isFinite(n.order)) n.order = 0;
  if (!n.metadata || typeof n.metadata !== "object") n.metadata = {};
  return n;
}

export function encodeNode(node: PlainNode): string {
  return JSON.stringify(node);
}

/**
 * Rebuild a v2 payload from a source node, applying field overrides.
 * Every write site goes through this so no field can be silently dropped when
 * constructing the updated node.
 */
export function toPlainNode(
  src: Pick<PlainNode, "title" | "isCompleted" | "parentId" | "order" | "metadata">,
  overrides?: Partial<Omit<PlainNode, "v">>
): PlainNode {
  // Pick only payload fields — src is often a full TreeNode (with children,
  // depth, _raw…); serializing those would bloat the row and corrupt the
  // stored payload.
  return {
    v: 2,
    title: src.title,
    isCompleted: src.isCompleted,
    parentId: src.parentId,
    order: src.order,
    metadata: src.metadata,
    ...overrides,
  };
}

// ---------- AES-GCM, for the passphrase-protected backup file ----------

const IV_BYTES = 12;

function bufToBase64(buf: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
  return btoa(binary);
}

function base64ToBuf(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function encryptString(key: CryptoKey, plaintext: string): Promise<{ iv: string; ciphertext: string }> {
  const iv = new Uint8Array(IV_BYTES);
  crypto.getRandomValues(iv);
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as unknown as BufferSource },
    key,
    new TextEncoder().encode(plaintext) as unknown as BufferSource
  );
  return { iv: bufToBase64(iv), ciphertext: bufToBase64(new Uint8Array(ct)) };
}

export async function decryptString(key: CryptoKey, ivB64: string, ciphertextB64: string): Promise<string> {
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBuf(ivB64) as unknown as BufferSource },
    key,
    base64ToBuf(ciphertextB64) as unknown as BufferSource
  );
  return new TextDecoder().decode(pt);
}
