# todosst agent

A todo app whose whole behavior is a small JavaScript program you own. You describe what you want in plain words. An agent edits the program. The app runs it.

```js
// routines/power-bank.js
task("Get my power bank", { repeat: "daily", from: "06:00", until: "10:00" });
task("Charge power bank", { repeat: "daily", from: "20:00", after: "Get my power bank" });
```

## How it works

- **The program.** Each `.js` file calls `task(title, options)` and `note(text)`. Options cover repeats (`daily`, `weekdays`, `mon,thu`, `every 3 days`, `weekly`, functions), time windows (`from`, `until`), goals and units, dependencies (`after`), and arbitrary conditions (`when: (ctx) => ...`). The runtime is `src/lib/runtime.ts`, tested in `src/lib/runtime.test.ts`.
- **Running it.** The browser evaluates the program in a Web Worker (`src/lib/program.worker.ts`) against the completion log, so user code cannot touch the page and an infinite loop is killed after 2 seconds.
- **The agent.** `src/lib/agentLoop.ts` drives Claude Opus 5.5 (through Hack Club AI, relayed by `convex/agent.ts`) with tools to write, edit and delete files, run the draft program, read history, and log progress. The system prompt and tool schemas are in `convex/agentSpec.ts`. The draft is committed in one mutation when the agent finishes.
- **Every change is undoable.** `convex/program.ts` records each agent turn and hand edit as a message with before/after file contents. Undo restores a file only if nothing changed it since.
- **Completions** are an append-only log (`convex/log.ts`). Unchecking writes a negative entry.

## Develop

```bash
bun install
bunx convex dev        # project todosst-agent
bunx next dev
bun test && bun run lint && bunx tsc --noEmit
```

Convex env: `JWT_PRIVATE_KEY`, `JWKS`, `SITE_URL`, `HACKCLUB_AI_API_KEY`.
