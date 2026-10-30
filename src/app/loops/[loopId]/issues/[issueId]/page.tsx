import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { one, query, type Issue, type Loop, type User } from "@/lib/db";
import { formatDate } from "@/lib/email";
import { issueTimeline, monthLabel, today } from "@/lib/schedule";
import { QUESTION_BANK } from "@/lib/question-bank";
import { addComment, addQuestion, adminStep, deleteComment, deleteQuestion, moveQuestion } from "@/app/actions";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/forms";
import { Avatar } from "@/components/Avatar";
import { AnswerEditor } from "@/components/AnswerEditor";
import { PhotoGallery } from "@/components/PhotoGallery";
import { Timeline } from "@/components/Timeline";

type Q = { id: string; body: string; position: number; author_id: string | null; author_name: string | null; author_email: string | null };

export default async function IssuePage({
  params,
  searchParams,
}: {
  params: Promise<{ loopId: string; issueId: string }>;
  searchParams: Promise<{ published?: string }>;
}) {
  const { loopId, issueId } = await params;
  const { published } = await searchParams;
  const ctx = await requireMember(loopId, `/loops/${loopId}/issues/${issueId}`);
  const issue = await one<Issue>(`select * from issues where id = $1 and loop_id = $2`, [issueId, loopId]);
  if (!issue) notFound();

  const questions = await query<Q>(
    `select q.id, q.body, q.position, q.author_id, u.name as author_name, u.email as author_email
     from questions q left join users u on u.id = q.author_id where q.issue_id = $1 order by q.position, q.created_at`,
    [issueId],
  );

  return (
    <div className="container narrow page stack" style={{ "--gap": "20px" } as React.CSSProperties}>
      <Link href={`/loops/${loopId}`} className="small">← {ctx.loop.name}</Link>
      {issue.status === "published" ? (
        <Newsletter loop={ctx.loop} issue={issue} questions={questions} user={ctx.user} isAdmin={ctx.isAdmin} justPublished={!!published} />
      ) : issue.status === "questions" ? (
        <SuggestQuestions issue={issue} questions={questions} user={ctx.user} isAdmin={ctx.isAdmin} />
      ) : (
        <WriteAnswers issue={issue} questions={questions} user={ctx.user} isAdmin={ctx.isAdmin} />
      )}
      {ctx.isAdmin && issue.status !== "published" && <AdminPanel loop={ctx.loop} issue={issue} questionCount={questions.length} />}
    </div>
  );
}

// ---- Phase 1: suggest questions ----------------------------------------------------------

function SuggestQuestions({ issue, questions, user, isAdmin }: { issue: Issue; questions: Q[]; user: User; isAdmin: boolean }) {
  const t = issueTimeline(issue.publish_date);
  const ideas = [...QUESTION_BANK].sort(() => Math.random() - 0.5).slice(0, 5);
  return (
    <>
      <header>
        <p className="eyebrow">Issue #{issue.number} · {monthLabel(issue.publish_date)}</p>
        <h1 style={{ marginTop: 6 }}>What should we ask?</h1>
        <p className="lead" style={{ marginTop: 8 }}>
          Suggest questions you'd love to hear everyone answer. On <b>{formatDate(t.answersOpen)}</b> they're locked in and
          everyone starts writing.
        </p>
      </header>

      <section className="card stack">
        <ActionForm action={addQuestion.bind(null, issue.id)} className="stack">
          <label className="field">
            <span>Your question</span>
            <textarea name="body" required maxLength={300} rows={2} style={{ minHeight: 80 }} placeholder="What's the best thing that happened to you this month?" />
          </label>
          <div><SubmitButton pendingText="Adding…">Add question</SubmitButton></div>
        </ActionForm>
        <details>
          <summary className="small" style={{ cursor: "pointer", color: "var(--accent)" }}>Need ideas?</summary>
          <ul className="small muted" style={{ marginTop: 8, paddingLeft: 18 }}>
            {ideas.map((q) => <li key={q} style={{ marginTop: 4 }}>{q}</li>)}
          </ul>
        </details>
      </section>

      <section className="card">
        <h3 style={{ marginBottom: 6 }}>Suggested so far ({questions.length})</h3>
        {questions.length === 0 ? (
          <p className="muted">No questions yet — be the first! If we're short, we'll add a few favorites.</p>
        ) : (
          <QuestionList questions={questions} user={user} isAdmin={isAdmin} canEditOwn />
        )}
      </section>
    </>
  );
}

function QuestionList({ questions, user, isAdmin, canEditOwn }: { questions: Q[]; user: User; isAdmin: boolean; canEditOwn: boolean }) {
  return (
    <ul className="qlist">
      {questions.map((q, i) => (
        <li key={q.id}>
          <span className="qnum">{i + 1}.</span>
          <div className="grow">
            <div className="qtext">{q.body}</div>
            <div className="small muted" style={{ marginTop: 2 }}>
              {q.author_id ? `from ${q.author_id === user.id ? "you" : q.author_name || q.author_email}` : "starter question"}
            </div>
          </div>
          {isAdmin && (
            <>
              <form action={moveQuestion.bind(null, q.id, -1)}>
                <button className="icon-btn" aria-label="Move up" disabled={i === 0}>↑</button>
              </form>
              <form action={moveQuestion.bind(null, q.id, 1)}>
                <button className="icon-btn" aria-label="Move down" disabled={i === questions.length - 1}>↓</button>
              </form>
            </>
          )}
          {(isAdmin || (canEditOwn && q.author_id === user.id)) && (
            <ConfirmButton action={deleteQuestion.bind(null, q.id)} message="Remove this question?" className="icon-btn" pendingText="…">
              ✕
            </ConfirmButton>
          )}
        </li>
      ))}
    </ul>
  );
}

// ---- Phase 2: answer ------------------------------------------------------------------------

async function WriteAnswers({ issue, questions, user, isAdmin }: { issue: Issue; questions: Q[]; user: User; isAdmin: boolean }) {
  const answers = await query<{ id: string; question_id: string; body: string }>(
    `select a.id, a.question_id, a.body from answers a join questions q on q.id = a.question_id
     where q.issue_id = $1 and a.user_id = $2`,
    [issue.id, user.id],
  );
  const photos = await query<{ id: string; answer_id: string; url: string }>(
    `select p.id, p.answer_id, p.url from photos p where p.answer_id = any($1) order by p.created_at`,
    [answers.map((a) => a.id)],
  );
  const writers = await query<User>(
    `select distinct u.* from answers a join questions q on q.id = a.question_id join users u on u.id = a.user_id
     where q.issue_id = $1 and (a.body <> '' or exists (select 1 from photos p where p.answer_id = a.id))`,
    [issue.id],
  );
  return (
    <>
      <header>
        <p className="eyebrow">Issue #{issue.number} · {monthLabel(issue.publish_date)}</p>
        <h1 style={{ marginTop: 6 }}>Your answers</h1>
        <p className="lead" style={{ marginTop: 8 }}>
          Answer as many as you like — everything saves automatically. It all goes out to the group on{" "}
          <b>{formatDate(issue.publish_date)}</b>, and no one sees answers before then.
        </p>
        {writers.length > 0 && (
          <div className="row" style={{ marginTop: 14 }}>
            <div className="avatars">{writers.map((w) => <Avatar key={w.id} name={w.name} email={w.email} size="sm" />)}</div>
            <span className="small muted">
              {writers.map((w) => (w.id === user.id ? "You" : w.name?.split(" ")[0] || w.email)).join(", ")}{" "}
              {writers.length === 1 && writers[0].id !== user.id ? "has" : "have"} written in
            </span>
          </div>
        )}
      </header>
      {questions.map((q, i) => {
        const a = answers.find((x) => x.question_id === q.id);
        return (
          <AnswerEditor
            key={q.id}
            questionId={q.id}
            index={i + 1}
            question={q.body}
            author={q.author_id ? (q.author_id === user.id ? "you" : q.author_name) : null}
            initialBody={a?.body ?? ""}
            initialPhotos={a ? photos.filter((p) => p.answer_id === a.id).map(({ id, url }) => ({ id, url })) : []}
          />
        );
      })}
      <div className="card flat" style={{ textAlign: "center" }}>
        <p>All done? You can close this page — your answers are saved. 💌</p>
      </div>
      {isAdmin && (
        <details className="card flat">
          <summary className="small" style={{ cursor: "pointer", fontWeight: 600 }}>Admin: add or remove questions</summary>
          <div className="stack" style={{ marginTop: 12 }}>
            <QuestionList questions={questions} user={user} isAdmin canEditOwn={false} />
            <ActionForm action={addQuestion.bind(null, issue.id)} className="inline-form wrap-sm">
              <input type="text" name="body" required maxLength={300} placeholder="Add another question" />
              <SubmitButton pendingText="Adding…">Add</SubmitButton>
            </ActionForm>
          </div>
        </details>
      )}
    </>
  );
}

// ---- Phase 3: the newsletter ---------------------------------------------------------------

async function Newsletter({
  loop,
  issue,
  questions,
  user,
  isAdmin,
  justPublished,
}: {
  loop: Loop;
  issue: Issue;
  questions: Q[];
  user: User;
  isAdmin: boolean;
  justPublished: boolean;
}) {
  const answers = await query<{ id: string; question_id: string; body: string; user_id: string; name: string | null; email: string }>(
    `select a.id, a.question_id, a.body, u.id as user_id, u.name, u.email
     from answers a join questions q on q.id = a.question_id join users u on u.id = a.user_id
     where q.issue_id = $1 order by a.updated_at`,
    [issue.id],
  );
  const ids = answers.map((a) => a.id);
  const [photos, comments] = await Promise.all([
    query<{ answer_id: string; url: string }>(`select answer_id, url from photos where answer_id = any($1) order by created_at`, [ids]),
    query<{ id: string; answer_id: string; body: string; user_id: string; name: string | null; email: string }>(
      `select c.id, c.answer_id, c.body, c.user_id, u.name, u.email from comments c join users u on u.id = c.user_id
       where c.answer_id = any($1) order by c.created_at`,
      [ids],
    ),
  ]);
  const visible = answers.filter((a) => a.body.trim() || photos.some((p) => p.answer_id === a.id));
  const contributors = new Set(visible.map((a) => a.user_id)).size;

  return (
    <article className="stack" style={{ "--gap": "8px" } as React.CSSProperties}>
      {justPublished && <div className="banner ok" style={{ marginBottom: 12 }}>Published and emailed to everyone! 🎉</div>}
      <header className="issue-head">
        <p className="eyebrow">{loop.name} · Issue #{issue.number}</p>
        <h1>{monthLabel(issue.publish_date)}</h1>
        <p className="muted" style={{ marginTop: 8 }}>
          {contributors} {contributors === 1 ? "friend" : "friends"} wrote in · {formatDate(issue.publish_date)}
        </p>
      </header>
      {visible.length === 0 && (
        <div className="card empty">
          <div className="big">🍃</div>
          <p className="muted">Nobody wrote in this time. There's always next month!</p>
        </div>
      )}
      {questions.map((q) => {
        const qa = visible.filter((a) => a.question_id === q.id);
        if (!qa.length) return null;
        return (
          <section key={q.id} className="issue-section">
            <h2>{q.body}</h2>
            {qa.map((a) => {
              const cs = comments.filter((c) => c.answer_id === a.id);
              return (
                <div key={a.id} className="answer">
                  <div className="who">
                    <Avatar name={a.name} email={a.email} />
                    <span>{a.name || a.email}</span>
                  </div>
                  {a.body.trim() && <div className="body pre">{a.body.trim()}</div>}
                  <PhotoGallery photos={photos.filter((p) => p.answer_id === a.id).map((p) => p.url)} />
                  <div className="comments">
                    {cs.map((c) => (
                      <div key={c.id} className="comment">
                        <b>{c.user_id === user.id ? "You" : c.name || c.email}</b>
                        <span className="pre">{c.body}</span>
                        {(c.user_id === user.id || isAdmin) && (
                          <form action={deleteComment.bind(null, c.id)} style={{ display: "inline", marginLeft: 8 }}>
                            <button className="linkbtn muted small" aria-label="Delete comment">delete</button>
                          </form>
                        )}
                      </div>
                    ))}
                    <details>
                      <summary className="small" style={{ cursor: "pointer", color: "var(--accent)", padding: "4px 0" }}>
                        {cs.length ? "Reply" : "Leave a comment"}
                      </summary>
                      <ActionForm action={addComment.bind(null, a.id)} className="inline-form" hideMessage>
                        <input type="text" name="body" required maxLength={2000} placeholder={`Reply to ${a.name?.split(" ")[0] || "them"}…`} />
                        <SubmitButton className="btn small" pendingText="…">Send</SubmitButton>
                      </ActionForm>
                    </details>
                  </div>
                </div>
              );
            })}
          </section>
        );
      })}
    </article>
  );
}

// ---- Admin controls ---------------------------------------------------------------------------

async function AdminPanel({ loop, issue, questionCount }: { loop: Loop; issue: Issue; questionCount: number }) {
  const members = await query<User & { answered: number }>(
    `select u.*, (select count(*)::int from answers a join questions q on q.id = a.question_id
       where q.issue_id = $2 and a.user_id = u.id and (a.body <> '' or exists (select 1 from photos p where p.answer_id = a.id))) as answered
     from memberships m join users u on u.id = m.user_id where m.loop_id = $1 order by m.created_at`,
    [loop.id, issue.id],
  );
  const sent = (d: Date | null) => (d ? `sent ${new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : "not sent yet");
  return (
    <section className="card stack" style={{ borderStyle: "dashed" }}>
      <div>
        <p className="eyebrow">Admin</p>
        <h3 style={{ marginTop: 4 }}>Run this issue</h3>
        <p className="small muted" style={{ marginTop: 4 }}>
          Everything below happens automatically on schedule. Use these buttons if you want to move faster.
        </p>
      </div>
      <Timeline publishDate={issue.publish_date} issue={issue} todayStr={today()} />
      {issue.status === "questions" && (
        <div className="stack" style={{ "--gap": "10px" } as React.CSSProperties}>
          <div className="row">
            <ConfirmButton
              action={adminStep.bind(null, issue.id, "question_call")}
              message="Email everyone now asking them to suggest questions?"
            >
              Email “suggest questions” now
            </ConfirmButton>
            <span className="small muted">{sent(issue.question_call_sent_at)}</span>
          </div>
          <div className="row">
            <ConfirmButton
              action={adminStep.bind(null, issue.id, "open_answers")}
              message={`Lock in the ${questionCount} question(s)${questionCount < 4 ? " (we'll top up with starter questions)" : ""} and email everyone to start answering?`}
              className="btn small"
            >
              Lock questions & start answering
            </ConfirmButton>
          </div>
        </div>
      )}
      {issue.status === "answers" && (
        <div className="stack" style={{ "--gap": "10px" } as React.CSSProperties}>
          <div>
            <p className="small" style={{ fontWeight: 600, marginBottom: 6 }}>Who's answered</p>
            <div className="row" style={{ gap: 8 }}>
              {members.map((m) => (
                <span key={m.id} className={`pill ${m.answered ? "ok" : ""}`}>
                  {m.answered ? "✓" : "…"} {m.name?.split(" ")[0] || m.email} {m.answered ? `(${m.answered}/${questionCount})` : ""}
                </span>
              ))}
            </div>
          </div>
          <div className="row">
            <ConfirmButton action={adminStep.bind(null, issue.id, "reminder")} message="Email a reminder to everyone who hasn't answered yet?">
              Send reminder now
            </ConfirmButton>
            <span className="small muted">{sent(issue.reminder_sent_at)}</span>
          </div>
          <div className="row">
            <ConfirmButton
              action={adminStep.bind(null, issue.id, "publish")}
              message="Publish this issue now and email it to everyone? Answers will be locked."
              className="btn small"
            >
              Publish & send now
            </ConfirmButton>
          </div>
        </div>
      )}
      <p className="small muted">
        Want a different date? Change it in <Link href={`/loops/${loop.id}/settings`}>settings</Link>.
      </p>
    </section>
  );
}
