# todosst — an E2E-encrypted, hierarchical todo vault

A real-time todo app with **Next.js 16**, **Convex**, and **Convex Auth** — where every task is end-to-end encrypted before it leaves your browser, folders are just tasks, and the URL is your working directory.

![Next.js](https://img.shields.io/badge/Next.js-16-black) ![Convex](https://img.shields.io/badge/Convex-1.45-orange) ![E2E](https://img.shields.io/badge/E2E-AES--GCM--256-green)

- 🔐 **End-to-end encrypted** — titles, structure, metadata, and completion history are AES-GCM encrypted client-side (PBKDF2-SHA-256, 310k iterations, per-user salt). The server only ever sees ciphertext.
- 🌲 **Tasks are directories** — any task can have sub-tasks. Navigate with the URL (`/host hackathon/outreach`), breadcrumbs, double-click, or `!cd`.
- ⌨️ **Command-style input** — one input box creates paths, navigates, and attaches recurrence rules, with tab-completion (intellisense).
- 🔁 **Recurrence as windows** — RRULE-driven occurrence windows with checkbox or tally-count modes, thresholds, grace hours, and a GitHub-style past-year heatmap per task.
- 🗝️ **Password change + recovery key** — change the password without touching data; generate a one-time-shown recovery key that unlocks both account and vault.
- 💾 **Encrypted export / import** — download a passphrase-protected backup file (tasks, structure, and completion history) from vault settings; import it into any account to restore or merge.
- ⚡ Real-time sync with Convex; works on any `*.vercel.app` domain, no custom domain required.
- 🌗 **Light / dark / auto theme** — follows the system by default; the header toggle overrides it and is remembered per device.

## The input box

One input, a few grammars (all tab-completable with ↑↓):

| Input | What it does |
| --- | --- |
| `buy coffee beans` | creates a task in the current directory |
| `/host hackathon/outreach write email template` | creates (or reuses) the nested path, final segment = task |
| `/taxes task without slash` | two-segment shorthand: first word = existing/new dir, rest = task |
| `!cd ../side-quests` | navigates the working directory (relative/absolute, `..`, `.` supported) |
| `stretch ~daily` | creates a recurring task (recurrence token is stripped from the title) |

Recurrence tokens: `~daily` `~weekly` `~weekdays` `~monthly` `~yearly`, or `~every 3d`, `~every 2w mon,thu`, `~every 3m`, `~every 1y` (spaces optional). Rules can be edited later in the task's details panel via the graphical + text RRULE editor.

Other keys: typing anywhere focuses the input, `Ctrl/Cmd+F` focuses search, `Esc` cancels edits/dialogs, double-click a folder to descend into it. Drag a task to reorder it among siblings (upper half = above, lower half = below) or hold `Alt` while dropping to nest it as a child. Deleting is undoable for 10 seconds.

## Recurrence model

- A recurring task is **one node** with a stable `/path`. Its RRULE defines occurrence windows (local calendar days).
- The UI always shows the **current window**; past windows are frozen history and feed the heatmap.
- Completions are stored as **counts per window**. Checkbox mode = checked iff `count >= threshold`; tally mode = click to increment/decrement. Switching modes never loses data.
- **Grace hours** (default 4, max 48) let a count after midnight still land in yesterday's window.

## Stack

- **Next.js 16** (App Router, `src/` dir, Turbopack)
- **Convex** backend: `convex/schema.ts` (todos + todoHistory + userSalts + vault tables), `convex/todos.ts`, `convex/history.ts`, `convex/encryption.ts`, `convex/vault.ts`
- **Convex Auth** with `Password` provider (`@convex-dev/auth`, `@auth/core`)
- **rrule** (RFC 5545) for occurrence windows; Tailwind v4 UI

## Getting Started

```bash
bun install
cp .env.example .env.local
bunx convex dev --once        # generates types, pushes schema (local at 127.0.0.1:3210), sets SITE_URL/JWKS/JWT_PRIVATE_KEY
bun dev                       # http://localhost:3000
```

Sign up with any email + password (8–128 chars). Your vault password **is** your encryption password — keep it safe.

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

- **Encryption**: every task payload (`{v:2, title, isCompleted, parentId, order, metadata}`) and every history record is AES-GCM-256 encrypted in the browser (`src/lib/crypto.ts`). The key is derived from your password + a per-user 16-byte salt (PBKDF2-SHA-256, 310k iterations) and lives only in memory. "Store locally" persists the derived key in localStorage for auto-unlock on trusted devices; `lock` / `forget device` clears it.
- **What the server can see**: ciphertext + IV + `userId` for each todo, salt, and auth tables. It cannot correlate history records to specific todos — the todoId lives inside the ciphertext.
- **Auth**: email/password via `@convex-dev/auth` (scrypt hashing, HttpOnly SameSite=Lax cookies, CSRF-safe mutations, rate-limited failed sign-ins).
- **Authorization**: every query/mutation checks `ctx.auth.getUserIdentity()` and scopes by stable `userId` (prevents IDOR).
- **Validation**: email normalized to lowercase, password 8–128 chars, titles 1–200 chars, all trimmed.
- **Recovery**: the vault master key is wrapped once per unlock method. "Change password" re-keys only the wrapper (data untouched, other devices unaffected). A generated **recovery key** (Crockford base32, shown once) unwraps the master key and can sign you in via a `sha256` verifier — the raw recovery key never reaches the server, so the server still cannot unwrap the vault.

## Project structure

```
convex/
  auth.config.ts   — { domain: process.env.CONVEX_SITE_URL } for Convex Auth
  auth.ts          — convexAuth({ providers: [Password] })
  http.ts          — auth.addHttpRoutes
  schema.ts        — authTables + todos + todoHistory + userSalts + vault tables
  todos.ts         — list/create/update/remove/removeMany (per-user, ciphertext payloads)
  history.ts       — per-todo E2E-encrypted completion history (list/put/remove)
  encryption.ts    — per-user salt get/ensure (salt is public, not secret)
  vault.ts         — wrapped vault keys, recovery keys/grants, password change action
  userScope.ts     — shared auth + ownership helpers (requireUserId, requireOwnTodo)
  users.ts         — viewer query
src/
  app/
    layout.tsx     — ConvexAuthNextjsServerProvider + ConvexClientProvider
    [[...slug]]/page.tsx — catch-all: URL path = current working directory
    signin/page.tsx — AuthForm
  components/
    ConvexClientProvider.tsx — ConvexAuthNextjsProvider
    EncryptionContext.tsx    — vault key state, remember-me, lock/unlock
    TodoApp.tsx    — tree rendering, command input, filters, details panel
    MetadataPanel.tsx — task details (notes, recurrence editor, heatmap)
    RruleEditor.tsx — graphical + text RRULE editor
    Heatmap.tsx    — GitHub-style past-year heatmap
    UnlockScreen.tsx — password unlock + recovery-key sign-in
    VaultPanel.tsx — password change, recovery key, export/import, remember-me
    DeleteUndo.tsx, NoticeDialog.tsx, TypewriterPlaceholder.tsx
    Header.tsx, AuthForm.tsx, Logo.tsx
  lib/
    crypto.ts      — PBKDF2 + AES-GCM primitives, payload schemas
    recur.ts       — windowed recurrence engine, input syntax, counts codec
    tree.ts        — path/sibling/tree helpers
    cdPath.ts      — `!cd` path resolution
    slashPath.ts   — `/path` creation parsing
    slashComplete.ts — tab-completion intellisense
    vaultFile.ts   — passphrase-encrypted backup files (export/import)
    months.ts      — shared MONTHS constant
  proxy.ts         — convexAuthNextjsMiddleware
```

## License

MIT
