// Shared *content* for the ten /design/* pages. Server-safe: pure data, no
// React components, no client hooks — the gallery imports this directly.

export type DesignMeta = {
  n: number;
  name: string;
  tagline: string;
  blurb: string;
  /** three-color palette used by the gallery card preview */
  swatch: string[];
  /** true when the design's page background is dark */
  dark: boolean;
};

export const DESIGN_META: DesignMeta[] = [
  {
    n: 1,
    name: "Brutalist Mono",
    tagline: "Hard borders. No gradients. Done means done.",
    blurb: "Cream paper, 3px black rules, offset block shadows and uppercase monospace. Every surface is a stamped card.",
    swatch: ["#f4f1ea", "#000000", "#ffe600"],
    dark: false,
  },
  {
    n: 2,
    name: "Pastel Cloud",
    tagline: "Soft rounds for heavy days.",
    blurb: "Warm off-white, fat corner radii, pill buttons and candy accents. The gentlest way to close a day.",
    swatch: ["#fff8f3", "#b9a4ff", "#7fd8c0"],
    dark: false,
  },
  {
    n: 3,
    name: "Midnight Neon",
    tagline: "Your vault, glowing after hours.",
    blurb: "Near-black indigo, hairline glow, cyan and magenta signals. A dashboard that reads like a cockpit.",
    swatch: ["#07070f", "#22e6ff", "#ff3ea5"],
    dark: true,
  },
  {
    n: 4,
    name: "Paper Journal",
    tagline: "A notebook that encrypts itself.",
    blurb: "Serif display on warm stock, ruled lines, red-pen annotations and marginalia. Ink, not pixels.",
    swatch: ["#f6f1e6", "#1b2a4a", "#c8452f"],
    dark: false,
  },
  {
    n: 5,
    name: "Aurora Glass",
    tagline: "Frosted panes over deep color.",
    blurb: "A slow gradient mesh behind translucent panels — blur, hairline highlights and quiet depth.",
    swatch: ["#0b1020", "#6a5cff", "#22d3ee"],
    dark: true,
  },
  {
    n: 6,
    name: "Terminal Green",
    tagline: "todo$ — type it, clear it.",
    blurb: "Phosphor green on CRT black, ASCII frames, a blinking caret and a boot sequence for a header.",
    swatch: ["#001100", "#3dff7a", "#0a3d14"],
    dark: true,
  },
  {
    n: 7,
    name: "Swiss Grid",
    tagline: "Order is a feature.",
    blurb: "Pure white, black Helvetica-weight type, one signal red, and a baseline grid you can feel.",
    swatch: ["#ffffff", "#0a0a0a", "#e63329"],
    dark: false,
  },
  {
    n: 8,
    name: "Oceanic Depth",
    tagline: "Sink in. Surface clear.",
    blurb: "Teal-to-ink gradient, wave dividers and buoyant glass cards. Pressure that calms rather than crushes.",
    swatch: ["#03222c", "#12b3c4", "#eafffb"],
    dark: true,
  },
  {
    n: 9,
    name: "Sunset Editorial",
    tagline: "Big type for small tasks.",
    blurb: "Cream stock, burnt orange blocks, oversized display numerals. A magazine spread that ships software.",
    swatch: ["#fdf0e4", "#e2571f", "#2b1a13"],
    dark: false,
  },
  {
    n: 10,
    name: "Forest Zen",
    tagline: "Quiet software for loud minds.",
    blurb: "Sage and stone, generous whitespace, a whisper of grain. Nothing blinks, nothing shouts.",
    swatch: ["#eef1ea", "#3f5d45", "#cfd8c6"],
    dark: false,
  },
];

export function metaFor(n: number): DesignMeta | undefined {
  return DESIGN_META.find((d) => d.n === n);
}

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export type DemoTask = {
  id: number;
  title: string;
  done: boolean;
  /** directory / recurrence annotation shown as a chip */
  tag?: string;
  /** completed today's window (for habit rows) */
  count?: number;
  goal?: number;
};

export const STARTER_TASKS: DemoTask[] = [
  { id: 1, title: "write email template for outreach", done: false, tag: "/host hackathon" },
  { id: 2, title: "buy coffee beans", done: true, tag: "/grocery" },
  { id: 3, title: "stretch", done: false, tag: "~daily", count: 1, goal: 1 },
  { id: 4, title: "read 20 pages", done: false, tag: "~daily", count: 0, goal: 1 },
  { id: 5, title: "ship the taxes folder", done: false, tag: "/taxes" },
];

export const FEATURES: { title: string; body: string; index: string }[] = [
  {
    index: "01",
    title: "Encrypted before it leaves you",
    body: "Titles, structure, metadata and completion history are AES-GCM-256 ciphertext. Keys derive from your password with PBKDF2-SHA-256 at 310k iterations — the server never sees a word.",
  },
  {
    index: "02",
    title: "Folders are just tasks",
    body: "Any task can hold sub-tasks, so hierarchy has one shape instead of two. The URL is your working directory: /host hackathon/outreach is a place you can be.",
  },
  {
    index: "03",
    title: "One box, five grammars",
    body: "Create, nest, navigate and schedule from a single input with tab-completion. Slash a path, bang a command, wave a recurrence token — the box parses all of it.",
  },
  {
    index: "04",
    title: "Recurrence as windows",
    body: "RRULE-driven occurrence windows with checkbox, tally and time modes, thresholds, grace hours, and a GitHub-style past-year heatmap per task.",
  },
  {
    index: "05",
    title: "Today is the daily ritual",
    body: "Open windows and anything due land on one surface. Closing the last one fires the all-clear band — misses are free, pairs aren't.",
  },
  {
    index: "06",
    title: "Works on the train",
    body: "Thoughts captured offline park in a vault-encrypted IndexedDB outbox and replay on the next online open, in the directory you were standing in.",
  },
];

export const GRAMMAR: { input: string; action: string }[] = [
  { input: "buy coffee beans", action: "creates a task in the current directory" },
  { input: "/host hackathon/outreach write email", action: "creates the nested path, final segment is the task" },
  { input: "/grocery/", action: "creates or reuses an empty directory" },
  { input: "!cd ../side-quests", action: "navigates the working directory" },
  { input: "stretch ~daily", action: "recurring task — the token is stripped from the title" },
  { input: "!help", action: "opens the input grammar panel" },
];

export const RECURRENCE_TOKENS: string[] = [
  "~daily",
  "~weekly",
  "~weekdays",
  "~monthly",
  "~yearly",
  "~every 3d",
  "~every 2w mon,thu",
];

export const SPECS: { k: string; v: string }[] = [
  { k: "Framework", v: "Next.js 16 · App Router" },
  { k: "Backend", v: "Convex · real-time sync" },
  { k: "Cipher", v: "AES-GCM-256" },
  { k: "Key derivation", v: "PBKDF2-SHA-256 · 310k" },
  { k: "Recurrence", v: "RFC 5545 RRULE" },
  { k: "Offline", v: "encrypted IndexedDB outbox" },
  { k: "Auth", v: "username + password" },
  { k: "Client", v: "React 19 · Tailwind v4" },
];

/** 53 weeks × 7 days of deterministic contribution levels (0–4). */
export const HEAT_LEVELS: number[] = (() => {
  let s = 20261003;
  const out: number[] = [];
  for (let i = 0; i < 371; i++) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const r = (s >>> 17) % 100;
    out.push(r < 34 ? 0 : r < 56 ? 1 : r < 76 ? 2 : r < 92 ? 3 : 4);
  }
  return out;
})();

export const STATS: { k: string; v: string }[] = [
  { k: "310k", v: "PBKDF2 iterations" },
  { k: "0", v: "plaintext bytes sent" },
  { k: "10s", v: "undo window" },
  { k: "48h", v: "max grace hours" },
];
