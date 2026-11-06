# todosst — a hierarchical todo app

A real-time todo app with **Next.js 16**, **Convex**, and **Convex Auth** — where folders are just tasks and the URL is your working directory.

![Next.js](https://img.shields.io/badge/Next.js-16-black) ![Convex](https://img.shields.io/badge/Convex-1.45-orange)

- 🌲 **Tasks are directories** — any task can have sub-tasks. Navigate with the URL (`/host hackathon/outreach`), breadcrumbs, double-click, or `!cd`.
- ⌨️ **Command-style input** — one input box creates paths, navigates, and attaches recurrence rules, with tab-completion (intellisense).
- 🔁 **Recurrence as windows** — RRULE-driven occurrence windows with checkbox, tally-count, or time (minutes) modes, thresholds/goals, grace hours, and a GitHub-style past-year heatmap per task.
- 📅 **Today view as the daily ritual** — all clear records the day (nudge escalates after two missed days) and auto-checks an optional `open todosst ~daily` habit whose heatmap becomes your streak — tracked locally per device.
- 💾 **Export / import** — download a passphrase-protected backup file (tasks, structure, and completion history) from settings; import it into any account to restore or merge.
- 📴 **Offline capture** — thoughts typed while offline (subway, plane) park in an IndexedDB outbox on the device and replay through the normal create path on the next online open. The service worker caches the app shell so the installed PWA opens without network; captures made at a particular working directory land in that directory on replay.
- 🏁 **The all-clear moment** — closing the day's last window lands hard: a full-bleed inverted band types out "all clear — …" in the input's typewriter voice, holds with a blinking caret, and counts what you did today (reduced-motion aware).
- 🔁 **The loop** — capture what goes wrong in one tap (typed, spoken, or shared from any Android app), sort it later, fix it with a workflow, and find out whether the fix actually held. See [The loop](#the-loop).
- ⚡ Real-time sync with Convex; works on any `*.vercel.app` domain, no custom domain required.
- 🌗 **Light / dark / auto theme** — follows the system by default; the header toggle overrides it and is remembered per device.

## The input box

One input, a few grammars (all tab-completable with ↑↓):

| Input | What it does |
| --- | --- |
| `buy coffee beans` | creates a task in the current directory |
| `/host hackathon/outreach write email template` | creates (or reuses) the nested path, final segment = task |
| `/taxes task without slash` | two-segment shorthand: first word = existing/new dir, rest = task |
| `/grocery/` | creates (or reuses) an empty directory |
| `!cd ../side-quests` | navigates the working directory (relative/absolute, `..`, `.` supported) |
| `!help` | shows the input grammar in a panel |
| `stretch ~daily` | creates a recurring task (recurrence token is stripped from the title) |
| `? slow cold open` | captures a **problem** into the loop inbox (no folder, no decision) |
| `?? header toggle is in the way` | captures a problem about **this app itself** |
| `% try a standing desk` | captures an idea; your own types can claim a sigil too (`& ; $ ^ \| = +`) |

Recurrence tokens: `~daily` `~weekly` `~weekdays` `~monthly` `~yearly`, or `~every 3d`, `~every 2w mon,thu`, `~every 3m`, `~every 1y` (spaces optional). Rules can be edited later in the task's details panel via the graphical + text RRULE editor.

Other keys: typing anywhere focuses the input, `Ctrl/Cmd+F` focuses search, `Esc` cancels edits/dialogs, double-click a folder to descend into it. Drag a task to reorder it among siblings (upper half = above, lower half = below) or hold `Alt` while dropping to nest it as a child. Deleting is undoable for 10 seconds.

## The loop

The tree is for work you have already decided to do. The loop is for everything before that — the thing that annoyed you a minute ago — and for finding out whether fixing it worked. It lives at `/loop` (the **loop** tab).

**Capture is free.** A *signal* is one timestamped "this happened". Type `? text` in the main input, use the capture bar on the loop screen (no sigil needed there), tap the mic, or share text/a link into todosst from any Android app. Signals are append-only; nothing is ever deleted, so every mistake is one tap to undo. Offline captures park in the same outbox as tasks and replay with their original time and an idempotency key, so a capture never counts twice.

**Sort later.** Each inbox signal is either a new thing or one more time an existing thing happened: tap *new problem*, take a *looks like…* suggestion (word-overlap similarity, no AI), pick *same as…*, select several and *combine*, or dismiss. A problem's **rate** (occurrences per week, last 28 days, with a trend arrow) says what is actually loudest. Merging is a pointer, not a destructive edit — split it back out any time. Items link to each other (`blocks`, `caused by`, `relates to`, `fixes`).

**Fixes are experiments.** Start a *run* of a workflow on one or more problems. Ticking the steps is not the end: the run then waits out a *verify window* (default 14 days). Any recurrence inside the window reopens it immediately, with the recurrences attached as evidence; a clean window marks it **held** and resolves the problem. A resolved problem that happens again reopens itself. The runs tab keeps score: *held 3 of 5* per workflow, plus baseline-vs-result rate per run.

**The system is data.** Types (fields, states, sigil), workflows, saved views and rules are versioned definitions you edit in the **system** tab (JSON with live validation and a "what would this do right now" preview). They are changed the way everything else is: friction about the app (`?? …`, or *something about this app is off?*) starts a *change the system* run, the run carries a **draft**, you preview it, apply it, and the same verify window checks whether the annoyance stopped. History is append-only — any version can be restored. Direct save is available when you want to skip the run. Rules are declarative (`3+ in 7 days → move to fixing / start workflow X`), never user code.

**On a phone (Android/Chrome).** Install the PWA; long-press the icon for *Capture a problem* / *Capture by voice*, and todosst shows up in the share sheet. Voice uses the browser's built-in speech recognition (Chrome); where it's missing the mic button hides and your keyboard's mic key still works.

Data model (`convex/schema.ts`): `signals`, `items`, `links`, `runs`, `defs`, `events`. Pure logic (rates, verification verdicts, validation, merge rules, capture grammar) is in `convex/loopLogic.ts` and tested in `src/lib/loopLogic.test.ts`; the client projection is `src/lib/loopModel.ts`; screens are in `src/components/loop/`. An hourly cron (`loop.sweep`) verifies runs whose window ended; opening the app settles anything that came due meanwhile.

## Recurrence model

- A recurring task is **one node** with a stable `/path`. Its RRULE defines occurrence windows (local calendar days).
- The UI always shows the **current window**; past windows are frozen history and feed the heatmap.
- Completions are stored as **counts per window**. Checkbox mode = checked iff `count >= threshold`; tally mode = click to increment/decrement; time mode = count is minutes logged via `+/−` steps, done once the goal (threshold) is reached. Switching modes never loses data.
- **Grace hours** (default 4, max 48) let a count after midnight still land in yesterday's window.

## The daily ritual

The **today** view is the daily surface: recurring tasks with an open window plus anything due today or earlier. Reaching **all clear** is the ritual's completion, and it does three things — all tracked locally per device, the server never learns whether you opened the app:

- it records the day, and open recurring task rows carry their own miss count — days since that task last hit its threshold ("missed 4 days — today is the one that matters", grey on the right of the task, from two missed days on). Misses are free; pairs aren't.
- on the first visit it offers to create `open todosst ~daily` — an auto-habit that checks itself on every all clear, so its past-year heatmap becomes your streak, fed as a side effect of the ritual rather than as another box.

## Stack

- **Next.js 16** (App Router, `src/` dir, Turbopack)
- **Convex** backend: `convex/schema.ts` (todos + todoHistory), `convex/todos.ts`, `convex/history.ts`
- **Convex Auth** with `Password` provider (`@convex-dev/auth`, `@auth/core`)
- **rrule** (RFC 5545) for occurrence windows; Tailwind v4 UI

## Getting Started

```bash
bun install
cp .env.example .env.local
bunx convex dev --once        # generates types, pushes schema (local at 127.0.0.1:3210), sets SITE_URL/JWKS/JWT_PRIVATE_KEY
bun dev                       # http://localhost:3000
```

Sign up with any username + password (8–128 chars).

### Tests

```bash
bun test                      # unit tests (src/lib/*.test.ts)
bun run lint
bunx tsc --noEmit
```

## Deploy to Vercel

1. `bunx convex deploy` — creates production Convex deployment.
2. In Convex dashboard → Settings → Environment Variables, copy `JWT_PRIVATE_KEY`, `JWKS`, and set `SITE_URL=https://<your-app>.vercel.app`.
3. In Vercel dashboard → Environment Variables, set:
   ```
   NEXT_PUBLIC_CONVEX_URL=https://<your-deployment>.convex.cloud
   SITE_URL=https://<your-app>.vercel.app
   JWT_PRIVATE_KEY=...
   JWKS=...
   ```
4. Deploy: `vercel` or push to GitHub. Works on `*.vercel.app` — no custom domain required.

## Security

- **Auth**: username/password via `@convex-dev/auth` (scrypt hashing, HttpOnly SameSite=Lax cookies, CSRF-safe mutations, rate-limited failed sign-ins).
- **Authorization**: every query/mutation checks `ctx.auth.getUserIdentity()` and scopes by stable `userId` (prevents IDOR).
- **Validation**: username normalized to lowercase (3–64 chars), password 8–128 chars, titles 1–200 chars, all trimmed.
- **Backups**: the export file is encrypted with a passphrase you choose (PBKDF2-SHA-256 → AES-GCM-256); the passphrase is never transmitted.

## Project structure

```
convex/
  auth.config.ts   — { domain: process.env.CONVEX_SITE_URL } for Convex Auth
  auth.ts          — convexAuth({ providers: [username+password] })
  http.ts          — auth.addHttpRoutes
  schema.ts        — authTables + todos + todoHistory + push/auto-nudge tables
  todos.ts         — list/create/update/remove/removeMany/migrate (per-user)
  history.ts       — per-todo completion history (list/put/remove/migrate)
  userScope.ts     — shared auth + ownership helpers (requireUserId, requireOwnTodo)
  users.ts         — viewer query
  loop.ts          — the loop engine: signals, items, links, runs, versioned defs, events
  loopLogic.ts     — pure loop logic shared by server + client (rates, verify, validation)
src/
  app/
    layout.tsx     — ConvexAuthNextjsServerProvider + ConvexClientProvider
    [[...slug]]/page.tsx — catch-all: URL path = current working directory; shows AuthForm when signed out
  components/
    ConvexClientProvider.tsx — ConvexAuthNextjsProvider
    TodoApp.tsx    — tree rendering, command input, filters, details panel
    TodayView.tsx  — the daily ritual surface (all clear, miss nudge, habit offer)
    MetadataPanel.tsx — task details (notes, recurrence editor, heatmap)
    RruleEditor.tsx — graphical + text RRULE editor
    Heatmap.tsx    — GitHub-style past-year heatmap
    SettingsPanel.tsx — daily nudge settings, export/import
    loop/            — loop screens: LoopView (shell + capture bar), Inbox, Items, Runs, System, MicButton
    LegacyMigration.tsx — one-time upgrade of pre-plaintext rows
    DeleteUndo.tsx, NoticeDialog.tsx, TypewriterPlaceholder.tsx
    Header.tsx, AuthForm.tsx, Logo.tsx
  lib/
    crypto.ts      — node payload codec + AES-GCM for the backup file
    recur.ts       — windowed recurrence engine, input syntax, counts codec
    ritual.ts      — per-device daily-ritual state (miss streak, habit offer)
    tree.ts        — path/sibling/tree helpers
    grammar.ts     — input grammar registry (commands, `/path`, `~recur`), dispatcher + `!help` source
    cdPath.ts      — `!cd` path resolution
    slashPath.ts   — `/path` creation parsing
    slashComplete.ts — tab-completion intellisense
    vaultFile.ts   — passphrase-protected backup files (export/import)
    outbox.ts      — offline capture outbox (IndexedDB + localStorage fallback)
    loopCapture.ts — signal capture (online send / offline park) + self-noticed friction
    loopModel.ts   — projects loop rows into rates, merges, effective definitions
    useOnline.ts   — connectivity signal (navigator.onLine + events)
    months.ts      — shared MONTHS constant
  proxy.ts         — convexAuthNextjsMiddleware
```

## License

MIT
