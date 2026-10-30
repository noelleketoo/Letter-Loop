import Link from "next/link";
import { emailProvider } from "@/lib/email";

export const metadata = { title: "Check your email" };

export default async function CheckEmail({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  const devOutbox = emailProvider() === "none" && process.env.NODE_ENV !== "production";
  return (
    <div className="container tiny page">
      <div className="card stack" style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48 }}>📬</div>
        <h1>Check your email</h1>
        <p className="muted">
          We sent a sign-in link to <b style={{ color: "var(--ink)" }}>{email || "your inbox"}</b>. Open it on this device to sign in.
        </p>
        <p className="small muted">Can't find it? Check spam, or <Link href="/login">try again</Link>.</p>
        {devOutbox && (
          <p className="banner small">
            Dev mode: no email provider is configured, so emails go to the <Link href="/dev/outbox">local outbox</Link>.
          </p>
        )}
      </div>
    </div>
  );
}
