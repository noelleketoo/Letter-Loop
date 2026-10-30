import { redirect } from "next/navigation";
import { currentUser, safeRedirect } from "@/lib/auth";
import { requestLogin } from "@/app/actions";
import { LoginForm } from "@/components/forms";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const user = await currentUser();
  if (user) redirect(safeRedirect(next));
  return (
    <div className="container tiny page">
      <div className="card stack">
        <div>
          <p className="eyebrow">Welcome</p>
          <h1 style={{ marginTop: 6 }}>Sign in</h1>
          <p className="muted" style={{ marginTop: 8 }}>
            No passwords — we'll email you a link. New here? The same link creates your account.
          </p>
        </div>
        {error === "expired" && (
          <p className="form-error">That sign-in link has expired or was already used. Enter your email for a fresh one.</p>
        )}
        <LoginForm action={requestLogin} next={safeRedirect(next)} />
      </div>
    </div>
  );
}
