import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { convexAuthNextjsMiddleware } from "@convex-dev/auth/nextjs/server";

const authMiddleware = convexAuthNextjsMiddleware(
  async () => {
    // Allow all routes - TodoApp handles unauthenticated UI (AuthForm on "/").
  },
  {
    // Persistent cookies (seconds). Default `{ maxAge: null }` writes session
    // cookies, which iOS wipes whenever the standalone PWA is terminated —
    // signing people out in under a day. Must match the server-side session
    // durations in @convex-dev/auth (30 days total / 30 days inactivity).
    cookieConfig: { maxAge: 30 * 24 * 60 * 60 },
  },
);

// Production-safe: without a configured Convex backend (missing
// NEXT_PUBLIC_CONVEX_URL) the auth middleware cannot verify tokens, so skip it
// and let pages render instead of 500ing.
export default async function middleware(request: NextRequest) {
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) return NextResponse.next();
  return authMiddleware(request, {} as never);
}

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
