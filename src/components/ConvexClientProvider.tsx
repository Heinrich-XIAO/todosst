"use client";

import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs";
import { ConvexReactClient } from "convex/react";
import { ReactNode } from "react";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

// Production-safe: if the Convex URL isn't configured (e.g. env vars not set
// on the hosting project), render children without a backend connection so
// pages like /design/* still work instead of 500ing at module load.
const convex =
  convexUrl && convexUrl.startsWith("http")
    ? new ConvexReactClient(convexUrl)
    : null;

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  if (!convex) return <>{children}</>;
  return (
    <ConvexAuthNextjsProvider client={convex}>
      {children}
    </ConvexAuthNextjsProvider>
  );
}
