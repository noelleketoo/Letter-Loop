import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser, peekLoginToken, safeRedirect } from "@/lib/auth";
import { confirmLogin } from "@/app/actions";
import { SubmitButton } from "@/components/forms";

export const metadata = { title: "Sign in" };

// The link in the email lands here. We ask for a tap before using the token, because
// some email providers pre-open links to scan them, which would burn a one-time token.
export default async function Verify({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const pending = token ? await peekLoginToken(token) : null;
  const user = await currentUser();
  if (pending && user && user.email === pending.email) redirect(safeRedirect(pending.redirect_to));

  return (
    <div className="container tiny page">
      <div className="card stack" style={{ textAlign: "center" }}>
        {pending ? (
          <>
            <div style={{ fontSize: 48 }}>👋</div>
            <h1>Welcome back</h1>
            <p className="muted">Continue as <b style={{ color: "var(--ink)" }}>{pending.email}</b></p>
            <form action={confirmLogin}>
              <input type="hidden" name="token" value={token} />
              <SubmitButton className="btn block" pendingText="Signing in…">Continue</SubmitButton>
            </form>
          </>
        ) : (
          <>
            <div style={{ fontSize: 48 }}>⌛</div>
            <h1>This link has expired</h1>
            <p className="muted">Sign-in links only work once and expire after a while. Get a fresh one below.</p>
            <Link href="/login" className="btn block">Get a new link</Link>
          </>
        )}
      </div>
    </div>
  );
}
