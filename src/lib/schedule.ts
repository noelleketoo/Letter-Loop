import { query, one, newId, type Issue, type Loop, type Question, type User } from "./db";
import { createLoginLink, appUrl } from "./auth";
import { QUESTION_BANK, MIN_QUESTIONS } from "./question-bank";
import { esc, layout, formatDate, sendAll, type Email } from "./email";

// The monthly cycle, counted in days before the issue's publish date.
export const QUESTIONS_OPEN_DAYS = 10; // "Suggest questions" email goes out
export const ANSWERS_OPEN_DAYS = 6; // questions lock, "Time to answer" email goes out
export const REMINDER_DAYS = 2; // reminder to anyone who hasn't answered yet

// ---- Date helpers (all dates are UTC "YYYY-MM-DD") ----------------------------------

export function today(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dateOn(year: number, monthIndex: number, day: number): string {
  return new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10);
}

/** The first date on `publishDay` that is at least `minDaysAway` days after `from`. */
export function nextPublishDate(publishDay: number, from: string, minDaysAway = 0): string {
  const earliest = addDays(from, minDaysAway);
  const d = new Date(`${earliest}T00:00:00Z`);
  let candidate = dateOn(d.getUTCFullYear(), d.getUTCMonth(), publishDay);
  if (candidate < earliest) candidate = dateOn(d.getUTCFullYear(), d.getUTCMonth() + 1, publishDay);
  return candidate;
}

export function issueTimeline(publishDate: string) {
  return {
    questionsOpen: addDays(publishDate, -QUESTIONS_OPEN_DAYS),
    answersOpen: addDays(publishDate, -ANSWERS_OPEN_DAYS),
    reminder: addDays(publishDate, -REMINDER_DAYS),
    publish: publishDate,
  };
}

export function monthLabel(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

// ---- Data helpers -----------------------------------------------------------------

export async function currentIssue(loopId: string): Promise<Issue | null> {
  return one<Issue>(
    `select * from issues where loop_id = $1 and status <> 'published' order by number desc limit 1`,
    [loopId],
  );
}

export async function createIssue(loop: Loop, publishDate: string): Promise<Issue> {
  const last = await one<{ n: number }>(`select coalesce(max(number), 0)::int as n from issues where loop_id = $1`, [
    loop.id,
  ]);
  return (await one<Issue>(
    `insert into issues (id, loop_id, number, publish_date) values ($1, $2, $3, $4) returning *`,
    [newId(), loop.id, (last?.n ?? 0) + 1, publishDate],
  ))!;
}

/** Date for the issue after the latest one in this loop. */
export async function upcomingPublishDate(loop: Loop, now = new Date()): Promise<string> {
  const last = await one<{ publish_date: string }>(
    `select publish_date from issues where loop_id = $1 order by number desc limit 1`,
    [loop.id],
  );
  const from = last ? addDays(last.publish_date, 1) : today(now);
  // Never schedule into the past, and leave at least a few days for answering.
  const floor = today(now) > from ? today(now) : from;
  return nextPublishDate(loop.publish_day, floor, last ? 0 : ANSWERS_OPEN_DAYS + 1);
}

async function members(loopId: string): Promise<User[]> {
  return query<User>(
    `select u.* from memberships m join users u on u.id = m.user_id where m.loop_id = $1 order by m.created_at`,
    [loopId],
  );
}

async function questionsFor(issueId: string): Promise<Question[]> {
  return query<Question>(`select * from questions where issue_id = $1 order by position, created_at`, [issueId]);
}

function firstName(u: User): string {
  return (u.name || u.email.split("@")[0]).split(" ")[0];
}

const footer = (loop: Loop, link: string) =>
  `You're getting this because you're in <strong>${esc(loop.name)}</strong> on Blink Loop. ` +
  `<a href="${esc(link)}" style="color:#8b8098">Manage or leave this group</a>.`;

// ---- Phase transitions --------------------------------------------------------------

/** Atomically claim a one-time step so concurrent cron runs never double-send. */
async function claim(issueId: string, column: string): Promise<boolean> {
  const row = await one(`update issues set ${column} = now() where id = $1 and ${column} is null returning id`, [issueId]);
  return !!row;
}

export async function sendQuestionCall(loop: Loop, issue: Issue): Promise<number> {
  if (!(await claim(issue.id, "question_call_sent_at"))) return 0;
  const t = issueTimeline(issue.publish_date);
  const path = `/loops/${loop.id}/issues/${issue.id}`;
  const emails: Email[] = [];
  for (const m of await members(loop.id)) {
    const link = await createLoginLink(m.email, path, 24 * 14);
    emails.push({
      to: m.email,
      subject: `What should we ask in ${loop.name} #${issue.number}?`,
      html: layout({
        preheader: `Suggest questions for this month's issue — by ${formatDate(t.answersOpen)}.`,
        heading: `What should we ask this month?`,
        intro: `<p style="margin:0 0 12px">Hi ${esc(firstName(m))}! Issue #${issue.number} of <strong>${esc(loop.name)}</strong> comes out on <strong>${formatDate(issue.publish_date)}</strong>.</p>
          <p style="margin:0">Suggest a question or two you'd love to hear everyone answer. Suggestions close on ${formatDate(t.answersOpen)}, then everyone gets the final list to answer.</p>`,
        button: { label: "Suggest a question", url: link },
        footer: footer(loop, `${appUrl()}/loops/${loop.id}`),
      }),
      text: `Hi ${firstName(m)}! Suggest questions for ${loop.name} #${issue.number} (out ${formatDate(issue.publish_date)}). Suggestions close ${formatDate(t.answersOpen)}.\n\n${link}`,
    });
  }
  return (await sendAll(emails)).sent;
}

/** Lock in the questions (topping up from the bank) and email everyone to start answering. */
export async function openAnswers(loop: Loop, issue: Issue): Promise<void> {
  const moved = await one(`update issues set status = 'answers' where id = $1 and status = 'questions' returning id`, [
    issue.id,
  ]);
  if (!moved) return;

  const existing = await questionsFor(issue.id);
  if (existing.length < MIN_QUESTIONS) {
    const used = await query<{ body: string }>(
      `select q.body from questions q join issues i on i.id = q.issue_id where i.loop_id = $1`,
      [loop.id],
    );
    const usedSet = new Set(used.map((u) => u.body.toLowerCase()));
    let pool = QUESTION_BANK.filter((q) => !usedSet.has(q.toLowerCase()));
    if (pool.length < MIN_QUESTIONS) pool = [...QUESTION_BANK];
    // Shuffle so each issue gets a different mix.
    pool = pool.sort(() => Math.random() - 0.5);
    let position = existing.reduce((max, q) => Math.max(max, q.position), 0);
    for (const body of pool.slice(0, MIN_QUESTIONS - existing.length)) {
      position++;
      await query(`insert into questions (id, issue_id, body, position) values ($1, $2, $3, $4)`, [
        newId(),
        issue.id,
        body,
        position,
      ]);
    }
  }
  await sendAnswerCall(loop, issue);
}

async function sendAnswerCall(loop: Loop, issue: Issue): Promise<void> {
  if (!(await claim(issue.id, "answer_call_sent_at"))) return;
  const qs = await questionsFor(issue.id);
  const path = `/loops/${loop.id}/issues/${issue.id}`;
  const list = qs
    .map(
      (q, i) =>
        `<tr><td style="padding:10px 0;border-top:1px solid #f4e6ec;font-family:Georgia,serif;font-size:17px;color:#2d2438"><span style="color:#d4507a;font-weight:700">${i + 1}.</span> ${esc(q.body)}</td></tr>`,
    )
    .join("");
  const emails: Email[] = [];
  for (const m of await members(loop.id)) {
    const link = await createLoginLink(m.email, path, 24 * 14);
    emails.push({
      to: m.email,
      subject: `Time to answer: ${loop.name} #${issue.number}`,
      html: layout({
        preheader: `${qs.length} questions this month — answers due ${formatDate(issue.publish_date)}.`,
        heading: `This month's questions are in`,
        intro: `<p style="margin:0">Hi ${esc(firstName(m))}! Answer as many as you like — add photos too. Everything gets sent to the group on <strong>${formatDate(issue.publish_date)}</strong>.</p>`,
        button: { label: "Write my answers", url: link },
        body: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${list}</table>`,
        footer: footer(loop, `${appUrl()}/loops/${loop.id}`),
      }),
      text: `Hi ${firstName(m)}! This month's questions for ${loop.name}:\n\n${qs.map((q, i) => `${i + 1}. ${q.body}`).join("\n")}\n\nAnswer here: ${link}`,
    });
  }
  await sendAll(emails);
}

export async function sendReminder(loop: Loop, issue: Issue): Promise<number> {
  if (!(await claim(issue.id, "reminder_sent_at"))) return 0;
  const pending = await query<User>(
    `select u.* from memberships m join users u on u.id = m.user_id
     where m.loop_id = $1 and not exists (
       select 1 from answers a join questions q on q.id = a.question_id
       where q.issue_id = $2 and a.user_id = u.id and (a.body <> '' or exists (select 1 from photos p where p.answer_id = a.id))
     )`,
    [loop.id, issue.id],
  );
  const path = `/loops/${loop.id}/issues/${issue.id}`;
  const emails: Email[] = [];
  for (const m of pending) {
    const link = await createLoginLink(m.email, path, 24 * 7);
    emails.push({
      to: m.email,
      subject: `Last call for ${loop.name} #${issue.number}`,
      html: layout({
        preheader: `Answers are due ${formatDate(issue.publish_date)}.`,
        heading: `Don't miss this month's issue`,
        intro: `<p style="margin:0">Hi ${esc(firstName(m))}! ${esc(loop.name)} goes out on <strong>${formatDate(issue.publish_date)}</strong> and we'd love to hear from you. Even one answer or one photo counts.</p>`,
        button: { label: "Answer now", url: link },
        footer: footer(loop, `${appUrl()}/loops/${loop.id}`),
      }),
      text: `Hi ${firstName(m)}! ${loop.name} goes out ${formatDate(issue.publish_date)}. Answer here: ${link}`,
    });
  }
  return (await sendAll(emails)).sent;
}

type IssueContent = {
  question: Question;
  answers: { user: User; body: string; photos: string[] }[];
}[];

export async function issueContent(issueId: string): Promise<IssueContent> {
  const qs = await questionsFor(issueId);
  const rows = await query<{ question_id: string; answer_id: string; body: string; user_id: string; name: string | null; email: string }>(
    `select a.question_id, a.id as answer_id, a.body, u.id as user_id, u.name, u.email
     from answers a join questions q on q.id = a.question_id join users u on u.id = a.user_id
     where q.issue_id = $1 order by a.updated_at`,
    [issueId],
  );
  const photos = await query<{ answer_id: string; url: string }>(
    `select p.answer_id, p.url from photos p join answers a on a.id = p.answer_id join questions q on q.id = a.question_id
     where q.issue_id = $1 order by p.created_at`,
    [issueId],
  );
  return qs.map((question) => ({
    question,
    answers: rows
      .filter((r) => r.question_id === question.id)
      .map((r) => ({
        user: { id: r.user_id, name: r.name, email: r.email } as User,
        body: r.body,
        photos: photos.filter((p) => p.answer_id === r.answer_id).map((p) => p.url),
      }))
      .filter((a) => a.body.trim() || a.photos.length),
  }));
}

export async function publishIssue(loop: Loop, issue: Issue): Promise<void> {
  const moved = await one(
    `update issues set status = 'published', published_at = now() where id = $1 and status <> 'published' returning id`,
    [issue.id],
  );
  if (!moved) return;
  const content = await issueContent(issue.id);
  const answered = content.filter((c) => c.answers.length);
  if (!answered.length) return; // nobody wrote anything; nothing to send

  const contributors = new Set(answered.flatMap((c) => c.answers.map((a) => a.user.id))).size;
  const sections = answered
    .map(
      (c) => `
      <h2 style="font-family:Georgia,serif;font-size:21px;line-height:1.3;margin:32px 0 8px;color:#2d2438;border-top:2px solid #f4e6ec;padding-top:24px">${esc(c.question.body)}</h2>
      ${c.answers
        .map(
          (a) => `
        <div style="margin:18px 0">
          <div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:#d4507a;margin-bottom:4px">${esc(a.user.name || a.user.email)}</div>
          ${a.body.trim() ? `<div style="font-family:Georgia,serif;font-size:16px;line-height:1.6;color:#2d2438;white-space:pre-wrap">${esc(a.body.trim())}</div>` : ""}
          ${a.photos
            .map(
              (url) =>
                `<img src="${esc(url.startsWith("/") ? appUrl() + url : url)}" alt="" width="540" style="display:block;width:100%;max-width:540px;height:auto;border-radius:10px;margin-top:10px">`,
            )
            .join("")}
        </div>`,
        )
        .join("")}`,
    )
    .join("");

  const path = `/loops/${loop.id}/issues/${issue.id}`;
  const emails: Email[] = [];
  for (const m of await members(loop.id)) {
    const link = await createLoginLink(m.email, path, 24 * 14);
    emails.push({
      to: m.email,
      subject: `📬 ${loop.name} #${issue.number} is here`,
      html: layout({
        preheader: `${contributors} ${contributors === 1 ? "friend" : "friends"} wrote in for ${monthLabel(issue.publish_date)}.`,
        heading: `${loop.name} · ${monthLabel(issue.publish_date)}`,
        intro: `<p style="margin:0">Issue #${issue.number} — with answers from ${contributors} ${contributors === 1 ? "friend" : "friends"}. Read it below, or open it online to leave comments.</p>`,
        button: { label: "Read online & comment", url: link },
        body: sections,
        footer: footer(loop, `${appUrl()}/loops/${loop.id}`),
      }),
      text: `${loop.name} #${issue.number} is here! Read it: ${link}\n\n${answered
        .map((c) => `## ${c.question.body}\n\n${c.answers.map((a) => `${a.user.name || a.user.email}:\n${a.body}`).join("\n\n")}`)
        .join("\n\n")}`,
    });
  }
  await sendAll(emails);
}

// ---- The daily job ---------------------------------------------------------------------

/** Advance every loop through its monthly cycle. Safe to run any number of times a day. */
export async function runScheduler(now = new Date()): Promise<string[]> {
  const log: string[] = [];
  const day = today(now);
  const loops = await query<Loop>(`select * from loops`);
  for (const loop of loops) {
    try {
      let issue = await currentIssue(loop.id);
      if (!issue) {
        const publishDate = await upcomingPublishDate(loop, now);
        if (day < issueTimeline(publishDate).questionsOpen) continue;
        issue = await createIssue(loop, publishDate);
        log.push(`${loop.name}: created issue #${issue.number} for ${publishDate}`);
      }
      const t = issueTimeline(issue.publish_date);
      if (issue.status === "questions") {
        if (!issue.question_call_sent_at && day >= t.questionsOpen && day < t.answersOpen) {
          const n = await sendQuestionCall(loop, issue);
          log.push(`${loop.name}: question call sent to ${n}`);
        }
        if (day >= t.answersOpen) {
          await openAnswers(loop, issue);
          log.push(`${loop.name}: answers opened for #${issue.number}`);
          issue = (await one<Issue>(`select * from issues where id = $1`, [issue.id]))!;
        }
      }
      if (issue.status === "answers") {
        if (!issue.reminder_sent_at && day >= t.reminder && day < t.publish) {
          const n = await sendReminder(loop, issue);
          log.push(`${loop.name}: reminder sent to ${n}`);
        }
        if (day >= t.publish) {
          await publishIssue(loop, issue);
          log.push(`${loop.name}: published #${issue.number}`);
        }
      }
    } catch (err) {
      console.error(`Scheduler failed for loop ${loop.id}`, err);
      log.push(`${loop.name}: ERROR ${(err as Error).message}`);
    }
  }
  return log;
}
