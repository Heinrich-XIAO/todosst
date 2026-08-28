import { AuthForm } from "@/components/AuthForm";

export const dynamic = "force-dynamic";

export default function SignInPage() {
  return (
    <div className="flex min-h-[calc(100vh-56px)] flex-col items-center px-4 py-12">
      <AuthForm defaultMode="signIn" />
    </div>
  );
}
