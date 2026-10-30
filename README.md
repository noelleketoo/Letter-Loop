# Blink Loop ✉

A monthly newsletter written by you and your friends. Each month:

| When (before issue day) | What happens |
|---|---|
| 10 days | Everyone gets an email: **"What should we ask this month?"** — they suggest questions |
| 6 days | Questions lock (topped up with starter questions if fewer than 4). Everyone gets **"Time to answer"** with the list |
| 2 days | **Last-call reminder** goes only to people who haven't answered |
| Issue day | Answers + photos are compiled into the newsletter and **emailed to everyone**. Friends can comment online |

Admins can also do any step early from the issue page, change dates, reorder/remove questions, and manage members.

**Stack:** Next.js 16 · Postgres · Vercel Blob (photos) · Gmail SMTP or Resend (email) · Vercel Cron (daily scheduler).
Sign-in is passwordless (email links). Works on phones and desktops, light and dark mode.

---

## Deploy it (about 20 minutes, all free tiers)

### 1. Put the code on GitHub
Create an empty repo on github.com, then from this folder:
```bash
git remote add origin https://github.com/YOUR-NAME/letter-loop.git
git push -u origin main
```

### 2. Create the Vercel project
1. Go to [vercel.com/new](https://vercel.com/new), sign in with GitHub, and import the repo. Don't deploy yet if it asks — or let it fail once, that's fine.
2. In the project, open **Storage** → **Create Database** → **Neon (Postgres)** → connect it to the project. This adds `DATABASE_URL` automatically. Tables are created on first use.
3. In **Storage** again → **Create** → **Blob** → connect it. This adds `BLOB_READ_WRITE_TOKEN` (for photos).

### 3. Set up email (pick one)

**Option A — Gmail (easiest, no domain needed).** Use a Gmail account for the app:
1. Turn on 2-Step Verification for that Google account.
2. Create an App Password at [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords).
3. Use these env vars: `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_USER=you@gmail.com`, `SMTP_PASS=<the 16-char app password>`, `EMAIL_FROM=Blink Loop <you@gmail.com>`.
   (Gmail allows ~500 emails/day — plenty for friend groups.)

**Option B — Resend (best deliverability, needs a domain you own).** Sign up at resend.com, verify your domain, create an API key, and set `RESEND_API_KEY` and `EMAIL_FROM=Blink Loop <hello@yourdomain.com>`. Without a verified domain, Resend only delivers to your own address.

### 4. Add the remaining environment variables
In Vercel → **Settings → Environment Variables**:

| Name | Value |
|---|---|
| `APP_URL` | Your site URL, e.g. `https://letter-loop.vercel.app` (no trailing slash) |
| `CRON_SECRET` | Any long random string (Vercel Cron uses it automatically) |
| email vars | from step 3 |

### 5. Deploy
**Deployments → Redeploy.** Open your URL, sign in with your email, create a group and invite friends.

The daily scheduler (`vercel.json`) runs at 15:00 UTC and is safe to run any number of times. You can trigger it manually:
```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://YOUR-APP.vercel.app/api/cron
```

---

## Run locally
Needs Node 20+ and a Postgres database.
```bash
npm install
cp .env.example .env.local   # set DATABASE_URL, APP_URL=http://localhost:3000, CRON_SECRET
npm run dev
```
With no email provider configured, emails aren't sent — view them at <http://localhost:3000/dev/outbox>. Photos are saved to `.data/uploads` when no Blob token is set.

## Customizing
- Timing of each step: `src/lib/schedule.ts` (`QUESTIONS_OPEN_DAYS`, `ANSWERS_OPEN_DAYS`, `REMINDER_DAYS`)
- Starter questions: `src/lib/question-bank.ts`
- Email designs: `src/lib/email.ts` and `src/lib/schedule.ts`
- Colors and fonts: `src/app/globals.css`
