import { TodoApp } from "@/components/TodoApp";
import { Header } from "@/components/Header";

export const dynamic = "force-dynamic";

// Handles all paths: "/", "/host hackathon", "/a/b/../c" etc.
// Client `!cd` uses window.history.pushState to change URL without reload;
// this catch-all ensures direct loads / refreshes render the same UI instead of 404.
export default function CatchAllPage() {
  return (
    // mobile is viewport-locked: the header stays put and main owns the one
    // scroll region per view (today pins its carousel, tree scrolls its list).
    // Desktop reverts to plain document flow.
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-background text-foreground md:h-auto md:min-h-screen md:overflow-visible">
      <Header />
      <main className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto overscroll-contain sm:pt-10 md:overflow-visible md:pb-10">
        <TodoApp />
      </main>
    </div>
  );
}
