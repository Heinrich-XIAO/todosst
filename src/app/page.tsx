import { TodoApp } from "@/components/TodoApp";
import { Header } from "@/components/Header";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Header />
      <main className="flex flex-1 flex-col items-center px-4 py-10 sm:px-0">
        <TodoApp />
        <p className="mt-6 text-xs opacity-40">press enter to add · click text to edit</p>
      </main>
      <footer className="border-t border-foreground/10 py-4 text-center text-xs opacity-40">todosst · queue</footer>
    </div>
  );
}
