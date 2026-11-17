import { convexAuthNextjsMiddleware } from "@convex-dev/auth/nextjs/server";

// Persistent 30-day cookies; the default session cookies vanish whenever a
// phone kills the browser.
export default convexAuthNextjsMiddleware(async () => {}, { cookieConfig: { maxAge: 30 * 24 * 60 * 60 } });

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
