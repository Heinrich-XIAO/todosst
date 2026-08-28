import { AuthForm } from "@/components/AuthForm";

export const dynamic = "force-dynamic";

export default function SignInPage() {
  return (
    <div className="flex min-h-[calc(100vh-56px)] flex-col items-center px-4 py-12">
      <AuthForm defaultMode="signIn" />
      <p className="mt-6 max-w-[420px] text-center text-xs leading-5 text-foreground/60">
        Email + password auth via Convex Auth. Works on any <code className="rounded bg-foreground/10 px-1 py-0.5">.vercel.app</code> domain.
      </p>
    </div>
  );
}
