import Link from "next/link";
import { TodoApp } from "@/components/TodoApp";
import { Header } from "@/components/Header";

export const dynamic = "force-dynamic";

// Handles all paths: "/", "/host hackathon", "/a/b/../c" etc.
// Client `!cd` uses window.history.pushState to change URL without reload;
// this catch-all ensures direct loads / refreshes render the same UI instead of 404.
export default function CatchAllPage() {
  // Production-safe: the interactive vault needs a configured Convex backend.
  // When the host has no NEXT_PUBLIC_CONVEX_URL (backend never provisioned),
  // show a static notice instead of throwing inside client auth/convex hooks.
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white px-4 text-center text-black" style={{ fontFamily: "system-ui" }}>
        <p className="text-xs font-bold uppercase tracking-[0.3em] opacity-60">todosst</p>
        <h1 className="mt-3 text-3xl sm:text-5xl font-black">Backend not connected.</h1>
        <p className="mt-3 max-w-md text-sm opacity-70">
          This deployment has no Convex backend configured yet — the live vault needs
          NEXT_PUBLIC_CONVEX_URL plus the auth secrets from the deploy guide.
        </p>
        <Link href="/design" className="mt-6 bg-black px-6 py-3 text-sm font-bold text-white min-h-[48px] flex items-center">
          Browse the 10 designs →
        </Link>
      </div>
    );
  }
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Header />
      <main className="flex flex-1 flex-col items-center sm:pt-10 md:pb-10">
        <TodoApp />
      </main>
    </div>
  );
}
