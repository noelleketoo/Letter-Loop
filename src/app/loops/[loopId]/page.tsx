import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { query, type Issue, type User } from "@/lib/db";
import { formatDate } from "@/lib/email";
import { currentIssue, issueTimeline, monthLabel, today, upcomingPublishDate } from "@/lib/schedule";
import { inviteMembers, startNextIssue } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Avatar } from "@/components/Avatar";
import { Timeline } from "@/components/Timeline";

export default async function LoopHome({
  params,
  searchParams,
}: {
  params: Promise<{ loopId: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { loopId } = await params;
  const { created } = await searchParams;
  const { user, loop, isAdmin } = await requireMember(loopId);

  const [members, issue, published] = await Promise.all([
    query<User & { joined_at: Date | null }>(
      `select u.*, m.joined_at from memberships m join users u on u.id = m.user_id where m.loop_id = $1 order by m.created_at`,
      [loopId],
    ),
    currentIssue(loopId),
    query<Issue & { answer_count: number }>(
      `select i.*, (select count(distinct a.user_id)::int from answers a join questions q on q.id = a.question_id
         where q.issue_id = i.id and (a.body <> '' or exists (select 1 from photos p where p.answer_id = a.id))) as answer_count
       from issues i where i.loop_id = $1 and i.status = 'published' order by i.number desc`,
      [loopId],
    ),
  ]);

  let progress = { total: 0, mine: 0, questions: 0 };
  if (issue) {
    const r = await query<{ total: number; mine: number }>(
      `select count(*)::int as total,
         count(*) filter (where exists (select 1 from answers a where a.question_id = q.id and a.user_id = $2
           and (a.body <> '' or exists (select 1 from photos p where p.answer_id = a.id))))::int as mine
       from questions q where q.issue_id = $1`,
      [issue.id, user.id],
    );
    progress = { total: r[0].total, mine: r[0].mine, questions: r[0].total };
  }
  const nextDate = issue ? issue.publish_date : await upcomingPublishDate(loop);
  const t = issueTimeline(nextDate);
  const issueUrl = issue ? `/loops/${loopId}/issues/${issue.id}` : "";

  return (
    <div className="container narrow page stack" style={{ "--gap": "20px" } as React.CSSProperties}>
      <div>
        <div className="row between" style={{ alignItems: "flex-start" }}>
          <div className="grow">
            <h1>{loop.name}</h1>
            {loop.description && <p className="lead" style={{ marginTop: 6 }}>{loop.description}</p>}
          </div>
          <Link href={`/loops/${loopId}/settings`} className="btn secondary small">
            {isAdmin ? "Settings" : "Members"}
          </Link>
        </div>
        <div className="row" style={{ marginTop: 14 }}>
          <div className="avatars">
            {members.slice(0, 8).map((m) => <Avatar key={m.id} name={m.name} email={m.email} />)}
          </div>
          <span className="muted small">
            {members.length} {members.length === 1 ? "member" : "members"}
            {members.some((m) => !m.joined_at) && ` · ${members.filter((m) => !m.joined_at).length} invited`}
          </span>
        </div>
      </div>

      {created && (
        <div className="banner ok">
          <b>Your group is ready! 🎉</b> Invite your friends below. They'll get an email with a link to join.
        </div>
      )}

      <section className="card stack">
        <div className="row between">
          <div>
            <p className="eyebrow">{issue ? `Issue #${issue.number}` : "Next issue"}</p>
            <h2 style={{ marginTop: 4 }}>{monthLabel(nextDate)}</h2>
          </div>
          {issue?.status === "questions" && <span className="pill">Collecting questions</span>}
          {issue?.status === "answers" && <span className="pill accent"><span className="dot" />Answering now</span>}
        </div>

        {issue?.status === "questions" && (
          <>
            <p>
              Suggest questions you'd love everyone to answer. {progress.questions > 0 && (
                <span className="muted">{progress.questions} suggested so far.</span>
              )}{" "}
              Answering starts <b>{formatDate(t.answersOpen)}</b>.
            </p>
            <div><Link href={issueUrl} className="btn">Suggest a question</Link></div>
          </>
        )}
        {issue?.status === "answers" && (
          <>
            <p>
              You've answered <b>{progress.mine} of {progress.total}</b> questions. Everything goes out on{" "}
              <b>{formatDate(issue.publish_date)}</b>.
            </p>
            <div>
              <Link href={issueUrl} className="btn">{progress.mine ? "Keep writing" : "Write my answers"}</Link>
            </div>
          </>
        )}
        {!issue && (
          <>
            <p>
              The next issue comes out <b>{formatDate(nextDate)}</b>. We'll email everyone to suggest questions on{" "}
              {formatDate(t.questionsOpen)}.
            </p>
            {isAdmin && (
              <form action={startNextIssue.bind(null, loopId)}>
                <SubmitButton className="btn secondary" pendingText="Starting…">Start collecting questions now</SubmitButton>
              </form>
            )}
          </>
        )}
        <hr className="divider" style={{ margin: "4px 0" }} />
        <Timeline publishDate={nextDate} issue={issue} todayStr={today()} />
      </section>

      <section className="card stack">
        <div>
          <h3>Invite friends</h3>
          <p className="muted small" style={{ marginTop: 4 }}>They'll get an email invite. Anyone in the group can invite people.</p>
        </div>
        <ActionForm action={inviteMembers.bind(null, loopId)} className="stack">
          <div className="inline-form wrap-sm">
            <input type="text" name="emails" placeholder="friend@example.com, another@example.com" required inputMode="email" autoCapitalize="off" />
            <SubmitButton pendingText="Sending…">Send invites</SubmitButton>
          </div>
        </ActionForm>
      </section>

      <section className="stack">
        <h2>Past issues</h2>
        {published.length === 0 ? (
          <p className="muted">No issues yet. The first one arrives {formatDate(nextDate)}.</p>
        ) : (
          <div className="grid two">
            {published.map((p) => (
              <Link key={p.id} href={`/loops/${loopId}/issues/${p.id}`} className="card card-link flat">
                <p className="eyebrow">Issue #{p.number}</p>
                <h3 style={{ marginTop: 4, fontSize: 22 }}>{monthLabel(p.publish_date)}</h3>
                <p className="muted small" style={{ marginTop: 6 }}>
                  {p.answer_count} {p.answer_count === 1 ? "person" : "people"} wrote in
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
