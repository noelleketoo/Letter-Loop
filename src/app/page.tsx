import Link from "next/link";
import Image from "next/image";
import friends from "@/assets/friends.jpg";
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
      <div className="photo-banner">
        <Image src={friends} alt="" priority placeholder="blur" sizes="(min-width: 960px) 928px, 100vw" />
        <div className="caption">
          <p className="eyebrow">Hi, {user.name?.split(" ")[0]} ♡</p>
          <h1>Blink Loop</h1>
        </div>
      </div>
      <div className="row between" style={{ marginBottom: 20 }}>
        <h2>Your groups</h2>
        <Link href="/loops/new" className="btn small">+ New group</Link>
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
    <div className="container welcome">
      <div className="photo-hero">
        <Image
          src={friends}
          alt="All of us on graduation day"
          priority
          placeholder="blur"
          sizes="(min-width: 960px) 928px, 100vw"
        />
        <div className="caption">
          <h1>Blink Loop</h1>
          <p>Our monthly letter to each other.</p>
        </div>
      </div>
      <div className="card welcome-card">
        <p className="lead">
          Every month we each answer a few questions, add some photos, and it all comes back to everyone as one letter.
        </p>
        <ol className="how">
          <li><span className="n">1</span><span>Everyone suggests questions they want to ask the group.</span></li>
          <li><span className="n">2</span><span>Everyone answers — with words, photos, or both.</span></li>
          <li><span className="n">3</span><span>On letter day, it lands in everyone's inbox.</span></li>
        </ol>
        <div style={{ marginTop: 24 }}>
          <Link href="/login" className="btn block">Sign in</Link>
        </div>
        <p className="small muted" style={{ marginTop: 12 }}>Use the email address you were invited with.</p>
      </div>
    </div>
  );
}
