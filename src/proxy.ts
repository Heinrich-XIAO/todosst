import { convexAuthNextjsMiddleware } from "@convex-dev/auth/nextjs/server";

export default convexAuthNextjsMiddleware(
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

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
