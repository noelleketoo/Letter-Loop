import { promises as fs } from "fs";
import path from "path";
import { notFound } from "next/navigation";
import type { Email } from "@/lib/email";

export const metadata = { title: "Dev outbox" };

// Development-only: shows emails that would have been sent when no email provider is configured.
export default async function Outbox() {
  if (process.env.NODE_ENV === "production") notFound();
  let emails: (Email & { sentAt: string })[] = [];
  try {
    emails = JSON.parse(await fs.readFile(path.join(process.cwd(), ".data", "outbox.json"), "utf8"));
  } catch {}
  return (
    <div className="container narrow page stack">
      <h1>Dev outbox</h1>
      <p className="muted">No email provider is configured, so emails are stored here instead of being sent. Newest first.</p>
      {emails.length === 0 && <p className="card">No emails yet.</p>}
      {emails.slice(0, 30).map((e, i) => (
        <details key={i} className="card flat" open={i === 0}>
          <summary style={{ cursor: "pointer" }}>
            <b>{e.subject}</b> <span className="muted small">→ {e.to} · {new Date(e.sentAt).toLocaleString()}</span>
          </summary>
          <div className="email-preview" style={{ marginTop: 12 }}>
            <iframe srcDoc={e.html} title={e.subject} sandbox="allow-popups allow-top-navigation-by-user-activation" />
          </div>
        </details>
      ))}
    </div>
  );
}
