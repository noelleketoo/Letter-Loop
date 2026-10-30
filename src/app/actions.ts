"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { query, one, newId, type Issue, type Loop, type Question, type User, type Photo } from "@/lib/db";
import {
  consumeLoginToken,
  createLoginLink,
  currentUser,
  endSession,
  findOrCreateUser,
  isValidEmail,
  normalizeEmail,
  recentLoginTokenCount,
  requireMember,
  requireUser,
  safeRedirect,
  startSession,
} from "@/lib/auth";
import { inviteEmail, loginEmail, sendAll, sendEmail } from "@/lib/email";
import {
  createIssue,
  currentIssue,
  openAnswers,
  publishIssue,
  sendQuestionCall,
  sendReminder,
  today,
  upcomingPublishDate,
} from "@/lib/schedule";
import { deletePhoto } from "@/lib/storage";

export type FormState = { error?: string; message?: string; values?: Record<string, string> } | undefined;

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

// ---- Auth ------------------------------------------------------------------------------

export async function requestLogin(_prev: FormState, fd: FormData): Promise<FormState> {
  const email = normalizeEmail(str(fd, "email"));
  const next = safeRedirect(str(fd, "next"));
  if (!isValidEmail(email)) return { error: "That doesn't look like an email address.", values: { email } };
  if ((await recentLoginTokenCount(email)) >= 5) {
    return { error: "Too many sign-in emails requested. Please wait a bit and try again." };
  }
  const link = await createLoginLink(email, next, 1);
  try {
    await sendEmail(loginEmail(email, link));
  } catch (err) {
    console.error(err);
    return { error: "We couldn't send the email. Please try again in a minute." };
  }
  redirect(`/login/check?email=${encodeURIComponent(email)}`);
}

export async function confirmLogin(fd: FormData): Promise<void> {
  const result = await consumeLoginToken(str(fd, "token"));
  if (!result) redirect("/login?error=expired");
  await startSession(result.user.id);
  redirect(result.user.name ? result.redirectTo : `/welcome?next=${encodeURIComponent(result.redirectTo)}`);
}

export async function logout(): Promise<void> {
  await endSession();
  redirect("/");
}

export async function saveProfile(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await currentUser();
  if (!user) redirect("/login");
  const name = str(fd, "name").slice(0, 60);
  if (!name) return { error: "Please enter your name." };
  await query(`update users set name = $1 where id = $2`, [name, user.id]);
  revalidatePath("/", "layout");
  redirect(safeRedirect(str(fd, "next")));
}

// ---- Loops --------------------------------------------------------------------------------

function parseEmails(raw: string): string[] {
  return [...new Set(raw.split(/[\s,;]+/).map(normalizeEmail).filter(Boolean))];
}

function parseDay(raw: string): number {
  const n = Math.round(Number(raw));
  return Number.isFinite(n) ? Math.min(28, Math.max(1, n)) : 1;
}

async function invite(loop: Loop, inviter: User, emails: string[]): Promise<{ added: number; invalid: string[] }> {
  const invalid = emails.filter((e) => !isValidEmail(e));
  const outgoing = [];
  for (const email of emails.filter(isValidEmail)) {
    const user = await findOrCreateUser(email);
    const inserted = await one(
      `insert into memberships (loop_id, user_id, role) values ($1, $2, 'member') on conflict do nothing returning user_id`,
      [loop.id, user.id],
    );
    if (!inserted) continue;
    const link = await createLoginLink(email, `/loops/${loop.id}`, 24 * 14);
    outgoing.push(inviteEmail(email, inviter.name || inviter.email, loop.name, link));
  }
  await sendAll(outgoing);
  return { added: outgoing.length, invalid };
}

export async function createLoop(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser("/loops/new");
  const name = str(fd, "name").slice(0, 80);
  if (!name) return { error: "Give your group a name." };
  const description = str(fd, "description").slice(0, 300);
  const publishDay = parseDay(str(fd, "publish_day"));
  const loop = (await one<Loop>(
    `insert into loops (id, name, description, publish_day, created_by) values ($1, $2, $3, $4, $5) returning *`,
    [newId(), name, description, publishDay, user.id],
  ))!;
  await query(`insert into memberships (loop_id, user_id, role, joined_at) values ($1, $2, 'admin', now())`, [
    loop.id,
    user.id,
  ]);
  await createIssue(loop, await upcomingPublishDate(loop));
  const emails = parseEmails(str(fd, "invites")).filter((e) => e !== user.email);
  if (emails.length) await invite(loop, user, emails);
  redirect(`/loops/${loop.id}?created=1`);
}

export async function inviteMembers(loopId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { user, loop } = await requireMember(loopId);
  const emails = parseEmails(str(fd, "emails"));
  if (!emails.length) return { error: "Enter at least one email address." };
  if (emails.length > 50) return { error: "That's a lot of people! Invite up to 50 at a time." };
  const { added, invalid } = await invite(loop, user, emails);
  revalidatePath(`/loops/${loopId}`, "layout");
  if (invalid.length) return { error: `Skipped invalid address${invalid.length > 1 ? "es" : ""}: ${invalid.join(", ")}` };
  return { message: added ? `Sent ${added} invite${added === 1 ? "" : "s"}.` : "Everyone there is already in the group." };
}

export async function resendInvite(loopId: string, userId: string): Promise<void> {
  const { user, loop, isAdmin } = await requireMember(loopId);
  if (!isAdmin) return;
  const member = await one<User>(
    `select u.* from memberships m join users u on u.id = m.user_id where m.loop_id = $1 and m.user_id = $2 and m.joined_at is null`,
    [loopId, userId],
  );
  if (!member) return;
  const link = await createLoginLink(member.email, `/loops/${loop.id}`, 24 * 14);
  await sendAll([inviteEmail(member.email, user.name || user.email, loop.name, link)]);
  revalidatePath(`/loops/${loopId}/settings`);
}

export async function removeMember(loopId: string, userId: string): Promise<void> {
  const { user, isAdmin } = await requireMember(loopId);
  if (!isAdmin || userId === user.id) return;
  await query(`delete from memberships where loop_id = $1 and user_id = $2`, [loopId, userId]);
  revalidatePath(`/loops/${loopId}`, "layout");
}

export async function setRole(loopId: string, userId: string, role: "admin" | "member"): Promise<void> {
  const { user, isAdmin } = await requireMember(loopId);
  if (!isAdmin || userId === user.id) return;
  await query(`update memberships set role = $3 where loop_id = $1 and user_id = $2`, [loopId, userId, role]);
  revalidatePath(`/loops/${loopId}/settings`);
}

export async function leaveLoop(loopId: string): Promise<void> {
  const { user, isAdmin } = await requireMember(loopId);
  if (isAdmin) {
    const admins = await one<{ n: number }>(
      `select count(*)::int as n from memberships where loop_id = $1 and role = 'admin'`,
      [loopId],
    );
    if ((admins?.n ?? 0) <= 1) redirect(`/loops/${loopId}/settings?error=last-admin`);
  }
  await query(`delete from memberships where loop_id = $1 and user_id = $2`, [loopId, user.id]);
  redirect("/");
}

export async function updateLoop(loopId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { isAdmin } = await requireMember(loopId);
  if (!isAdmin) return { error: "Only admins can change settings." };
  const name = str(fd, "name").slice(0, 80);
  if (!name) return { error: "The group needs a name." };
  await query(`update loops set name = $2, description = $3, publish_day = $4 where id = $1`, [
    loopId,
    name,
    str(fd, "description").slice(0, 300),
    parseDay(str(fd, "publish_day")),
  ]);
  const nextDate = str(fd, "next_date");
  if (nextDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate) || nextDate < today()) {
      return { error: "The next issue date must be today or later." };
    }
    await query(`update issues set publish_date = $2 where loop_id = $1 and status <> 'published'`, [loopId, nextDate]);
  }
  revalidatePath(`/loops/${loopId}`, "layout");
  return { message: "Saved." };
}

export async function deleteLoop(loopId: string, fd: FormData): Promise<void> {
  const { loop, isAdmin } = await requireMember(loopId);
  if (!isAdmin) return;
  if (str(fd, "confirm") !== loop.name) redirect(`/loops/${loopId}/settings?error=confirm`);
  const photos = await query<Photo>(
    `select p.* from photos p join answers a on a.id = p.answer_id join questions q on q.id = a.question_id
     join issues i on i.id = q.issue_id where i.loop_id = $1`,
    [loopId],
  );
  await query(`delete from loops where id = $1`, [loopId]);
  await Promise.all(photos.map((p) => deletePhoto(p.url)));
  redirect("/");
}

// ---- Issues & questions ------------------------------------------------------------------

async function requireIssue(issueId: string) {
  const issue = await one<Issue>(`select * from issues where id = $1`, [issueId]);
  if (!issue) redirect("/");
  const ctx = await requireMember(issue.loop_id);
  return { ...ctx, issue };
}

export async function addQuestion(issueId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { user, issue, isAdmin } = await requireIssue(issueId);
  const body = str(fd, "body").slice(0, 300);
  if (!body) return { error: "Write a question first." };
  if (issue.status === "published" || (issue.status === "answers" && !isAdmin)) {
    return { error: "Questions for this issue are already locked in." };
  }
  const mine = await one<{ n: number }>(
    `select count(*)::int as n from questions where issue_id = $1 and author_id = $2`,
    [issueId, user.id],
  );
  if (!isAdmin && (mine?.n ?? 0) >= 5) return { error: "You can suggest up to 5 questions per issue." };
  const pos = await one<{ p: number }>(`select coalesce(max(position), 0)::int as p from questions where issue_id = $1`, [
    issueId,
  ]);
  await query(`insert into questions (id, issue_id, author_id, body, position) values ($1, $2, $3, $4, $5)`, [
    newId(),
    issueId,
    user.id,
    body,
    (pos?.p ?? 0) + 1,
  ]);
  revalidatePath(`/loops/${issue.loop_id}`, "layout");
  return { message: "Added!" };
}

export async function deleteQuestion(questionId: string): Promise<void> {
  const q = await one<Question>(`select * from questions where id = $1`, [questionId]);
  if (!q) return;
  const { user, issue, isAdmin } = await requireIssue(q.issue_id);
  const canDelete = isAdmin ? issue.status !== "published" : q.author_id === user.id && issue.status === "questions";
  if (!canDelete) return;
  const photos = await query<Photo>(
    `select p.* from photos p join answers a on a.id = p.answer_id where a.question_id = $1`,
    [questionId],
  );
  await query(`delete from questions where id = $1`, [questionId]);
  await Promise.all(photos.map((p) => deletePhoto(p.url)));
  revalidatePath(`/loops/${issue.loop_id}`, "layout");
}

export async function moveQuestion(questionId: string, direction: -1 | 1): Promise<void> {
  const q = await one<Question>(`select * from questions where id = $1`, [questionId]);
  if (!q) return;
  const { issue, isAdmin } = await requireIssue(q.issue_id);
  if (!isAdmin || issue.status === "published") return;
  const all = await query<Question>(`select * from questions where issue_id = $1 order by position, created_at`, [
    issue.id,
  ]);
  const i = all.findIndex((x) => x.id === questionId);
  const j = i + direction;
  if (j < 0 || j >= all.length) return;
  [all[i], all[j]] = [all[j], all[i]];
  for (let k = 0; k < all.length; k++) {
    await query(`update questions set position = $2 where id = $1`, [all[k].id, k + 1]);
  }
  revalidatePath(`/loops/${issue.loop_id}`, "layout");
}

export async function adminStep(
  issueId: string,
  step: "question_call" | "open_answers" | "reminder" | "publish",
): Promise<void> {
  const { loop, issue, isAdmin } = await requireIssue(issueId);
  if (!isAdmin) return;
  if (step === "question_call" && issue.status === "questions") {
    await query(`update issues set question_call_sent_at = null where id = $1`, [issueId]);
    await sendQuestionCall(loop, issue);
  } else if (step === "open_answers" && issue.status === "questions") {
    await openAnswers(loop, issue);
  } else if (step === "reminder" && issue.status === "answers") {
    await query(`update issues set reminder_sent_at = null where id = $1`, [issueId]);
    await sendReminder(loop, issue);
  } else if (step === "publish" && issue.status === "answers") {
    await publishIssue(loop, issue);
    redirect(`/loops/${loop.id}/issues/${issue.id}?published=1`);
  }
  revalidatePath(`/loops/${loop.id}`, "layout");
}

export async function startNextIssue(loopId: string): Promise<void> {
  const { loop, isAdmin } = await requireMember(loopId);
  if (!isAdmin) return;
  let issue = await currentIssue(loopId);
  if (!issue) issue = await createIssue(loop, await upcomingPublishDate(loop));
  redirect(`/loops/${loopId}/issues/${issue.id}`);
}

// ---- Answers -------------------------------------------------------------------------------

export async function saveAnswer(questionId: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "You've been signed out. Refresh and sign in again." };
  const q = await one<Question & { status: string; loop_id: string }>(
    `select q.*, i.status, i.loop_id from questions q join issues i on i.id = q.issue_id
     join memberships m on m.loop_id = i.loop_id and m.user_id = $2
     where q.id = $1`,
    [questionId, user.id],
  );
  if (!q) return { ok: false, error: "Question not found." };
  if (q.status !== "answers") return { ok: false, error: "This issue isn't open for answers." };
  await query(
    `insert into answers (id, question_id, user_id, body) values ($1, $2, $3, $4)
     on conflict (question_id, user_id) do update set body = excluded.body, updated_at = now()`,
    [newId(), questionId, user.id, body.slice(0, 10000)],
  );
  return { ok: true };
}

export async function removePhoto(photoId: string): Promise<{ ok: boolean }> {
  const user = await currentUser();
  if (!user) return { ok: false };
  const photo = await one<Photo & { status: string }>(
    `select p.*, i.status from photos p join answers a on a.id = p.answer_id join questions q on q.id = a.question_id
     join issues i on i.id = q.issue_id where p.id = $1 and a.user_id = $2`,
    [photoId, user.id],
  );
  if (!photo || photo.status !== "answers") return { ok: false };
  await query(`delete from photos where id = $1`, [photoId]);
  await deletePhoto(photo.url);
  return { ok: true };
}

// ---- Comments -------------------------------------------------------------------------------

export async function addComment(answerId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const body = str(fd, "body").slice(0, 2000);
  if (!body) return { error: "Write something first." };
  const ans = await one<{ loop_id: string; issue_id: string; status: string }>(
    `select i.loop_id, i.id as issue_id, i.status from answers a join questions q on q.id = a.question_id
     join issues i on i.id = q.issue_id join memberships m on m.loop_id = i.loop_id and m.user_id = $2
     where a.id = $1`,
    [answerId, user.id],
  );
  if (!ans || ans.status !== "published") return { error: "You can't comment on this." };
  await query(`insert into comments (id, answer_id, user_id, body) values ($1, $2, $3, $4)`, [
    newId(),
    answerId,
    user.id,
    body,
  ]);
  revalidatePath(`/loops/${ans.loop_id}/issues/${ans.issue_id}`);
  return { message: "ok" };
}

export async function deleteComment(commentId: string): Promise<void> {
  const user = await requireUser();
  const c = await one<{ loop_id: string; issue_id: string; user_id: string; role: string }>(
    `select i.loop_id, i.id as issue_id, c.user_id, m.role from comments c join answers a on a.id = c.answer_id
     join questions q on q.id = a.question_id join issues i on i.id = q.issue_id
     join memberships m on m.loop_id = i.loop_id and m.user_id = $2 where c.id = $1`,
    [commentId, user.id],
  );
  if (!c || (c.user_id !== user.id && c.role !== "admin")) return;
  await query(`delete from comments where id = $1`, [commentId]);
  revalidatePath(`/loops/${c.loop_id}/issues/${c.issue_id}`);
}
