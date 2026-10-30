import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { query, type Issue, type Loop, type User } from "@/lib/db";
import { formatDate } from "@/lib/email";
import { issueTimeline, monthLabel, upcomingPublishDate } from "@/lib/schedule";
import { Avatar } from "@/components/Avatar";

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await currentUser();
  if (!user) return <Landing />;
  if (!user.name) redirect("/welcome");
  const { error } = await searchParams;

  const loops = await query<Loop & { role: string }>(
    `select l.*, m.role from loops l join memberships m on m.loop_id = l.id where m.user_id = $1 order by l.created_at`,
    [user.id],
  );

  const cards = await Promise.all(
    loops.map(async (loop) => {
      const issues = await query<Issue>(`select * from issues where loop_id = $1 order by number desc limit 2`, [loop.id]);
      const current = issues.find((i) => i.status !== "published") ?? null;
      const latest = issues.find((i) => i.status === "published") ?? null;
      const people = await query<User>(
        `select u.* from memberships m join users u on u.id = m.user_id where m.loop_id = $1 order by m.created_at limit 6`,
        [loop.id],
      );
      const count = await query<{ n: number }>(`select count(*)::int as n from memberships where loop_id = $1`, [loop.id]);
      let answered = 0;
      let total = 0;
      if (current?.status === "answers") {
        const r = await query<{ total: number; mine: number }>(
          `select count(*)::int as total,
             count(*) filter (where exists (select 1 from answers a where a.question_id = q.id and a.user_id = $2
               and (a.body <> '' or exists (select 1 from photos p where p.answer_id = a.id))))::int as mine
           from questions q where q.issue_id = $1`,
          [current.id, user.id],
        );
        total = r[0].total;
        answered = r[0].mine;
      }
      const nextDate = current ? current.publish_date : await upcomingPublishDate(loop);
      return { loop, current, latest, people, memberCount: count[0].n, answered, total, nextDate };
    }),
  );

  return (
    <div className="container page">
      <div className="row between" style={{ marginBottom: 24 }}>
        <div>
          <p className="eyebrow">Hi, {user.name?.split(" ")[0]}</p>
          <h1 style={{ marginTop: 6 }}>Your groups</h1>
        </div>
        <Link href="/loops/new" className="btn">+ New group</Link>
      </div>

      {error === "not-a-member" && (
        <p className="form-error" style={{ marginBottom: 16 }}>
          You're not a member of that group. Ask someone in it to invite {user.email}.
        </p>
      )}

      {cards.length === 0 ? (
        <div className="card empty stack">
          <div className="big">💌</div>
          <h2>Start your first group</h2>
          <p className="muted" style={{ maxWidth: 420, margin: "12px auto 0" }}>
            Invite a few friends, and once a month everyone answers the same questions. We'll put it all together into a newsletter.
          </p>
          <div><Link href="/loops/new" className="btn">Create a group</Link></div>
        </div>
      ) : (
        <div className="grid two">
          {cards.map(({ loop, current, latest, people, memberCount, answered, total, nextDate }) => {
            const t = current ? issueTimeline(current.publish_date) : null;
            return (
              <Link key={loop.id} href={`/loops/${loop.id}`} className="card card-link stack" style={{ "--gap": "14px" } as React.CSSProperties}>
                <div className="row between">
                  <h2 style={{ fontSize: 24 }}>{loop.name}</h2>
                  {current?.status === "answers" && answered < total ? (
                    <span className="pill accent"><span className="dot" />Your turn</span>
                  ) : current?.status === "questions" ? (
                    <span className="pill">Collecting questions</span>
                  ) : current?.status === "answers" ? (
                    <span className="pill ok">✓ Answered</span>
                  ) : null}
                </div>
                <div className="row">
                  <div className="avatars">
                    {people.map((p) => <Avatar key={p.id} name={p.name} email={p.email} size="sm" />)}
                  </div>
                  <span className="muted small">{memberCount} {memberCount === 1 ? "member" : "members"}</span>
                </div>
                <p className="small" style={{ color: "var(--ink-2)" }}>
                  {current?.status === "questions" && t && <>Suggest questions until <b>{formatDate(t.answersOpen)}</b>.</>}
                  {current?.status === "answers" && <>You've answered <b>{answered} of {total}</b> · due <b>{formatDate(current.publish_date)}</b>.</>}
                  {!current && <>Next issue: <b>{formatDate(nextDate)}</b>.</>}
                </p>
                {latest && <p className="small muted">Latest: Issue #{latest.number} · {monthLabel(latest.publish_date)}</p>}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Landing() {
  return (
    <div className="container">
      <section className="hero">
        <p className="eyebrow">A monthly newsletter, written together</p>
        <h1>Stay close to the people you love.</h1>
        <p className="lead">
          Once a month your friends suggest questions, everyone answers with words and photos, and we deliver it all as one
          beautiful newsletter to every inbox.
        </p>
        <div className="row">
          <Link href="/login" className="btn">Start a group — it's free</Link>
          <a href="#how" className="btn secondary">How it works</a>
        </div>
        <div className="envelope" aria-hidden>
          <p className="eyebrow" style={{ marginBottom: 10 }}>The Old Roommates · Issue #12</p>
          <p className="q">What's something that made you laugh this month?</p>
          <div className="a"><Avatar name="Maya Chen" email="maya" size="sm" /><p>My toddler told the mail carrier that our cat “does taxes.”</p></div>
          <div className="a"><Avatar name="Sam Ortiz" email="sam" size="sm" /><p>I got lost in IKEA for forty minutes. Again. Photo evidence attached.</p></div>
        </div>
      </section>
      <section id="how" className="page">
        <h2 style={{ textAlign: "center", marginBottom: 28 }}>How it works</h2>
        <div className="grid three steps">
          <div className="card flat step">
            <h3>Everyone asks</h3>
            <p className="muted" style={{ marginTop: 6 }}>Each month we email the group to suggest questions they're curious about.</p>
          </div>
          <div className="card flat step">
            <h3>Everyone answers</h3>
            <p className="muted" style={{ marginTop: 6 }}>Then everyone gets the final list and answers from their phone or computer — with photos.</p>
          </div>
          <div className="card flat step">
            <h3>Everyone reads</h3>
            <p className="muted" style={{ marginTop: 6 }}>On issue day, all the answers arrive as one newsletter. Comment, reply, and catch up.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
