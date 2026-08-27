import { TodoApp } from "@/components/TodoApp";
import { Header } from "@/components/Header";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex flex-1 flex-col items-center px-4 py-10 sm:px-6 sm:py-12">
        {/* Title */}
        <div className="mb-8 text-center">
          <h1 className="text-[30px] font-[650] tracking-tight text-zinc-900">
            Your tasks, in sync
          </h1>
          <p className="mt-2 text-sm leading-6 text-zinc-500">
            Fast, private, and real-time — powered by Next.js, Convex & Clerk.
          </p>
        </div>

        <TodoApp />

        {/* Footer hint for setup */}
        <div className="mt-10 flex items-center gap-2 text-xs text-zinc-400">
          <span className="h-px w-8 bg-zinc-200" />
          <span>Double-click to edit • Data stored in Convex • Auth by Clerk</span>
          <span className="h-px w-8 bg-zinc-200" />
        </div>
      </main>

      <footer className="border-t border-zinc-200 bg-white/60 py-4 text-center text-xs text-zinc-500 backdrop-blur">
        Built with Next.js 16 · Convex · Clerk · Tailwind v4
      </footer>
    </div>
  );
}
