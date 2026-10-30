import { promises as fs } from "fs";
import path from "path";

export type Email = { to: string; subject: string; html: string; text: string };

export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fromAddress(): string {
  return process.env.EMAIL_FROM || process.env.SMTP_USER || "Blink Loop <onboarding@resend.dev>";
}

export function emailProvider(): "resend" | "smtp" | "none" {
  if (process.env.RESEND_API_KEY) return "resend";
  if (process.env.SMTP_HOST && process.env.SMTP_USER) return "smtp";
  return "none";
}

export async function sendEmail(email: Email): Promise<void> {
  const provider = emailProvider();
  if (provider === "resend") {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: fromAddress(), to: [email.to], subject: email.subject, html: email.html, text: email.text }),
    });
    if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);
    return;
  }
  if (provider === "smtp") {
    const nodemailer = await import("nodemailer");
    const port = Number(process.env.SMTP_PORT || 465);
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    await transport.sendMail({ from: fromAddress(), ...email });
    return;
  }
  // No provider configured: keep a local outbox so the app is usable in development.
  console.log(`\n[email:not-sent] To: ${email.to}\nSubject: ${email.subject}\n${email.text}\n`);
  if (process.env.NODE_ENV !== "production") {
    const dir = path.join(process.cwd(), ".data");
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, "outbox.json");
    let list: (Email & { sentAt: string })[] = [];
    try {
      list = JSON.parse(await fs.readFile(file, "utf8"));
    } catch {}
    list.unshift({ ...email, sentAt: new Date().toISOString() });
    await fs.writeFile(file, JSON.stringify(list.slice(0, 200), null, 2));
  }
}

/** Send many emails, never letting one failure stop the rest. */
export async function sendAll(emails: Email[]): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  for (const e of emails) {
    try {
      await sendEmail(e);
      sent++;
    } catch (err) {
      failed++;
      console.error(`Failed to send "${e.subject}" to ${e.to}:`, err);
    }
  }
  return { sent, failed };
}

// ---- Layout -------------------------------------------------------------------

type LayoutOpts = {
  preheader: string;
  heading: string;
  intro: string; // trusted HTML
  button?: { label: string; url: string };
  body?: string; // trusted HTML
  footer?: string; // trusted HTML
};

export function layout(o: LayoutOpts): string {
  const btn = o.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0"><tr><td style="border-radius:999px;background:#d4507a">
        <a href="${esc(o.button.url)}" style="display:inline-block;padding:14px 28px;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px">${esc(o.button.label)}</a>
      </td></tr></table>`
    : "";
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#fcf3f5">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(o.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fcf3f5"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #f1e2e8;border-radius:16px">
    <tr><td style="padding:32px 28px 8px;font-family:Georgia,'Times New Roman',serif;color:#2d2438">
      <div style="font-family:Helvetica,Arial,sans-serif;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#d4507a;font-weight:700">◎ Blink Loop</div>
      <h1 style="font-size:28px;line-height:1.25;margin:14px 0 12px;font-weight:600">${esc(o.heading)}</h1>
      <div style="font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:#514662">${o.intro}</div>
      ${btn}
      ${o.body ?? ""}
    </td></tr>
    <tr><td style="padding:8px 28px 28px;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#8b8098">
      ${o.footer ?? ""}
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

export function formatDate(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
}

// ---- Specific emails ---------------------------------------------------------------

export function loginEmail(to: string, link: string): Email {
  return {
    to,
    subject: "Your Blink Loop sign-in link",
    html: layout({
      preheader: "Tap to sign in — the link expires in an hour.",
      heading: "Sign in to Blink Loop",
      intro: "Tap the button below to sign in. This link works once and expires in an hour.",
      button: { label: "Sign in", url: link },
      footer: "If you didn't ask for this, you can safely ignore this email.",
    }),
    text: `Sign in to Blink Loop:\n${link}\n\nThis link works once and expires in an hour.`,
  };
}

export function inviteEmail(to: string, inviter: string, loopName: string, link: string): Email {
  return {
    to,
    subject: `${inviter} invited you to “${loopName}”`,
    html: layout({
      preheader: `Join ${loopName} — a monthly newsletter written by friends.`,
      heading: `You're invited to ${loopName}`,
      intro: `<p style="margin:0 0 12px"><strong>${esc(inviter)}</strong> started a monthly newsletter with friends, and wants you in it.</p>
        <p style="margin:0">Here's how it works: each month everyone suggests a few questions, then everyone answers them — with words and photos. On issue day, the answers are put together into a newsletter and sent to the whole group.</p>`,
      button: { label: `Join ${loopName}`, url: link },
      footer: "This invite link is good for 14 days.",
    }),
    text: `${inviter} invited you to join "${loopName}" on Blink Loop, a monthly newsletter with friends.\n\nJoin here: ${link}`,
  };
}
