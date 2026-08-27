# todosst — Next.js + Convex + Clerk

A minimal, real-time todo app with **Next.js 16**, **Convex**, and **Clerk**.

![Next.js](https://img.shields.io/badge/Next.js-16-black) ![Convex](https://img.shields.io/badge/Convex-1.45-orange) ![Clerk](https://img.shields.io/badge/Clerk-7.x-purple)

Features:
- 🔐 Auth with Clerk (per-user private todos)
- ⚡ Real-time sync with Convex (queries + mutations + indexes)
- ✏️ Create / toggle / edit (double-click) / delete / clear completed
- 🔍 Filter: All / Active / Completed + remaining count
- 🎨 Polished Tailwind v4 UI, responsive, dark-aware

## Stack

- **Next.js 16** (App Router, `src/` dir, Turbopack)
- **Convex** for backend (`convex/schema.ts`, `convex/todos.ts`, `convex/auth.config.ts`)
- **Clerk** for auth (`@clerk/nextjs`, `src/proxy.ts`, `ConvexProviderWithClerk`)

## Getting Started

```bash
bun install
cp .env.example .env.local   # fill in Clerk keys
bunx convex dev --once        # generate types / push schema (local deploy at 127.0.0.1:3210)
bun dev                       # http://localhost:3000
```

### 1. Create a Clerk app

1. Go to https://dashboard.clerk.com → **Create application**
2. Copy `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` into `.env.local`
3. In Clerk Dashboard → **JWT Templates** → **New template** → choose **Convex**
   - Copy the **Issuer** URL (e.g. `https://your-app.clerk.accounts.dev`) into `CLERK_JWT_ISSUER_DOMAIN`
4. Set in `.env.local`:
   ```
   NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
   NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
   ```
   and run `bunx convex env set CLERK_JWT_ISSUER_DOMAIN https://your-issuer.clerk.accounts.dev`

### 2. Convex schema

```ts
// convex/schema.ts:8
todos: defineTable({
  title: v.string(),
  isCompleted: v.boolean(),
  userId: v.string(),
}).index("by_user", ["userId"])

// convex/todos.ts:11 — list/toggle/create/updateTitle/remove/clearCompleted
// All scoped to ctx.auth.getUserIdentity().subject
```

### 3. Deploy

Convex: `bunx convex deploy` → set env vars in Convex dashboard  
Vercel: set same env vars and deploy. Or run `bun run build`.

## Project structure

```
convex/
  auth.config.ts   — Clerk JWT issuer for Convex
  schema.ts        — todos table
  todos.ts         — queries & mutations
src/
  app/
    layout.tsx     — Geist fonts + ConvexClientProvider
    page.tsx       — Header + TodoApp
    sign-in/[[...sign-in]]/page.tsx
    sign-up/[[...sign-up]]/page.tsx
  components/
    ConvexClientProvider.tsx — ClerkProvider + ConvexProviderWithClerk (falls back to ConvexProvider in demo mode)
    Header.tsx     — logo + SignedIn/UserButton / SignedOut/SignInButton
    TodoApp.tsx    — input, list, filters, inline edit, realtime
  proxy.ts         — clerkMiddleware
```

## Demo mode

Without Clerk keys the app shows a setup banner and a preview placeholder — Convex local backend still runs at `NEXT_PUBLIC_CONVEX_URL`. Add keys to get full auth + persistence.

## Scripts

```bash
bun dev          # next dev (turbopack)
bun run build    # next build
bunx convex dev  # watch convex functions
```

## License

MIT
