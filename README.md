# todosst — Next.js + Convex + Convex Auth

A minimal, real-time todo app with **Next.js 16**, **Convex**, and **Convex Auth** (email/password) — works on any `*.vercel.app` domain, no custom domain required.

![Next.js](https://img.shields.io/badge/Next.js-16-black) ![Convex](https://img.shields.io/badge/Convex-1.45-orange) ![Convex%20Auth](https://img.shields.io/badge/Convex%20Auth-Password-green)

Features:
- 🔐 Secure email/password auth via `@convex-dev/auth` (scrypt hashing, HttpOnly SameSite=Lax cookies, CSRF-safe)
- 🌐 Works on `*.vercel.app` out of the box — no Clerk, no custom domain
- ⚡ Real-time sync with Convex (queries + mutations + indexes)
- ✏️ Create / toggle / edit (double-click) / delete / clear completed
- 🔍 Filter: All / Active / Completed + remaining count
- 🎨 Polished Tailwind v4 UI, responsive

## Stack

- **Next.js 16** (App Router, `src/` dir, Turbopack)
- **Convex** for backend (`convex/schema.ts`, `convex/todos.ts`, `convex/auth.config.ts`, `convex/auth.ts`)
- **Convex Auth** with `Password` provider (`@convex-dev/auth`, `@auth/core`)

## Getting Started

```bash
bun install
cp .env.example .env.local
bunx convex dev --once        # generates types, pushes schema (local at 127.0.0.1:3210), sets SITE_URL/JWKS/JWT_PRIVATE_KEY
bun dev                       # http://localhost:3000
```

No Clerk setup needed. Just run `npx @convex-dev/auth` once (already done) — it creates `convex/auth.ts`, `convex/http.ts`, and sets `SITE_URL`, `JWKS`, `JWT_PRIVATE_KEY` in your Convex deployment.

### Optional — email (Resend) for verification / password reset

Convex Auth Password supports `verify` and `reset` via Resend. To enable:

```bash
bun add resend @oslojs/crypto
# create convex/ResendOTP.ts per https://labs.convex.dev/auth/config/passwords
# then in convex/auth.ts: Password({ verify: ResendOTP, reset: ResendOTPPasswordReset })
bunx convex env set AUTH_RESEND_KEY re_xxx
bunx convex env set AUTH_EMAIL_FROM "Todos <onboarding@resend.dev>"
```

Without it, sign-up/sign-in works purely with email+password — perfect for `*.vercel.app`.

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
   (plus optional `AUTH_RESEND_KEY` if using Resend).

4. Deploy: `vercel` or push to GitHub. Works on `*.vercel.app` — no custom domain required.

## Security

- Passwords never stored plain-text — `Password` provider hashes with **scrypt** (via `@auth/core`).
- Validation: email normalized to lowercase + regex, password `8–128` chars, title `1–200` chars, all trimmed.
- Authorization: every `convex/todos.ts:20` checks `ctx.auth.getUserIdentity()` and verifies `todo.userId === identity.subject` (prevents IDOR).
- Cookies: `HttpOnly`, `Secure` (in prod), `SameSite=Lax` via Convex Auth; CSRF protected (mutations only via POST, `convexAuthNextjsMiddleware` at `src/proxy.ts:1`).
- Rate limiting: `authRateLimits` table auto-limits failed sign-ins.
- No user enumeration: generic “Invalid email or password” errors in `src/components/AuthForm.tsx:48`.

## Project structure

```
convex/
  auth.config.ts   — { domain: process.env.CONVEX_SITE_URL } for Convex Auth
  auth.ts          — convexAuth({ providers: [Password] })
  http.ts          — auth.addHttpRoutes
  schema.ts        — ...authTables + todos table
  todos.ts         — list/create/toggle/updateTitle/remove/clearCompleted (all per-user)
  users.ts         — viewer query (current user)
src/
  app/
    layout.tsx     — ConvexAuthNextjsServerProvider + ConvexClientProvider
    page.tsx       — Header + TodoApp (force-dynamic)
    signin/page.tsx — AuthForm
  components/
    ConvexClientProvider.tsx — ConvexAuthNextjsProvider
    Header.tsx     — Authenticated/Unauthenticated + signOut
    AuthForm.tsx   — email/password tabs, validation, useAuthActions().signIn("password")
    TodoApp.tsx    — input, list, filters, inline edit, realtime (Authenticated/Unauthenticated)
  proxy.ts         — convexAuthNextjsMiddleware
```

## Scripts

```bash
bun dev              # next dev (turbopack)
bun run build        # next build
bunx convex dev      # watch convex functions
bunx convex env list # list deployment env vars
```

## License

MIT
