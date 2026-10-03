export type DemoTask = { id: number; title: string; done: boolean; path: string; recur?: string };

export const STARTER_TASKS: DemoTask[] = [
  { id: 1, title: "host hackathon / outreach write email", done: false, path: "/host hackathon", recur: "~weekly" },
  { id: 2, title: "buy coffee beans", done: true, path: "/grocery" },
  { id: 3, title: "stretch", done: false, path: "/health", recur: "~daily" },
  { id: 4, title: "read 20 pages", done: false, path: "/growth", recur: "~daily" },
];

export const DESIGN_META: { n: number; name: string; tagline: string }[] = [
  { n: 1, name: "Brutalist Mono", tagline: "Hard borders. No gradients. Done means done." },
  { n: 2, name: "Pastel Cloud", tagline: "Soft rounds for heavy days." },
  { n: 3, name: "Midnight Neon", tagline: "Your vault, glowing after hours." },
  { n: 4, name: "Paper Journal", tagline: "A notebook that encrypts itself." },
  { n: 5, name: "Aurora Glass", tagline: "Frosted glass over deep color." },
  { n: 6, name: "Retro Terminal", tagline: "todo$ — type it, clear it." },
  { n: 7, name: "Swiss Grid", tagline: "Order is a feature." },
  { n: 8, name: "Oceanic Depth", tagline: "Sink in. Surface clear." },
  { n: 9, name: "Sunset Editorial", tagline: "Big type for small tasks." },
  { n: 10, name: "Forest Zen", tagline: "Quiet software for loud minds." },
];
