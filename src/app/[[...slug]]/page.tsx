import { TodoApp } from "@/components/TodoApp";
import { Header } from "@/components/Header";

export const dynamic = "force-dynamic";

// Handles all paths: "/", "/host hackathon", "/a/b/../c" etc.
// Client `!cd` uses window.history.pushState to change URL without reload;
// this catch-all ensures direct loads / refreshes render the same UI instead of 404.
export default function CatchAllPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Header />
      <main className="flex flex-1 flex-col items-center px-4 py-10 sm:px-0">
        <TodoApp />
      </main>
    </div>
  );
}
