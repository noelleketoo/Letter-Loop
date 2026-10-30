import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { query, type User } from "@/lib/db";
import { currentIssue, today } from "@/lib/schedule";
import { ordinal } from "@/lib/format";
import { deleteLoop, leaveLoop, removeMember, resendInvite, setRole, updateLoop } from "@/app/actions";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/forms";
import { Avatar } from "@/components/Avatar";

export const metadata = { title: "Group settings" };

export default async function Settings({
  params,
  searchParams,
}: {
  params: Promise<{ loopId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { loopId } = await params;
  const { error } = await searchParams;
  const { user, loop, isAdmin } = await requireMember(loopId, `/loops/${loopId}/settings`);
  const members = await query<User & { role: string; joined_at: Date | null }>(
    `select u.*, m.role, m.joined_at from memberships m join users u on u.id = m.user_id
     where m.loop_id = $1 order by m.role, m.created_at`,
    [loopId],
  );
  const issue = await currentIssue(loopId);

  return (
    <div className="container narrow page stack" style={{ "--gap": "20px" } as React.CSSProperties}>
      <div>
        <Link href={`/loops/${loopId}`} className="small">← {loop.name}</Link>
        <h1 style={{ marginTop: 8 }}>{isAdmin ? "Settings" : "Members"}</h1>
      </div>

      {error === "last-admin" && (
        <p className="form-error">You're the only admin. Make someone else an admin before leaving, or delete the group.</p>
      )}
      {error === "confirm" && <p className="form-error">Type the group name exactly to confirm deleting it.</p>}

      {isAdmin && (
        <section className="card">
          <ActionForm action={updateLoop.bind(null, loopId)} className="stack">
            <h3>Group details</h3>
            <label className="field">
              <span>Name</span>
              <input type="text" name="name" required maxLength={80} defaultValue={loop.name} />
            </label>
            <label className="field">
              <span>Description</span>
              <input type="text" name="description" maxLength={300} defaultValue={loop.description} />
            </label>
            <div className="grid two">
              <label className="field">
                <span>Issue day each month</span>
                <select name="publish_day" defaultValue={String(loop.publish_day)}>
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>{ordinal(d)}</option>
                  ))}
                </select>
              </label>
              {issue && (
                <label className="field">
                  <span>This issue's date (#{issue.number})</span>
                  <input type="date" name="next_date" min={today()} defaultValue={issue.publish_date} />
                </label>
              )}
            </div>
            <div><SubmitButton>Save changes</SubmitButton></div>
          </ActionForm>
        </section>
      )}

      <section className="card">
        <h3 style={{ marginBottom: 8 }}>Members ({members.length})</h3>
        <div>
          {members.map((m) => (
            <div key={m.id} className="member">
              <Avatar name={m.name} email={m.email} />
              <div className="meta">
                <div>
                  <b>{m.name || m.email.split("@")[0]}</b>
                  {m.id === user.id && <span className="muted small"> (you)</span>}{" "}
                  {m.role === "admin" && <span className="pill" style={{ marginLeft: 4 }}>Admin</span>}{" "}
                  {!m.joined_at && <span className="pill accent" style={{ marginLeft: 4 }}>Invited</span>}
                </div>
                <div className="email">{m.email}</div>
              </div>
              {isAdmin && m.id !== user.id && (
                <details className="admin" style={{ position: "relative" }}>
                  <summary className="icon-btn" aria-label={`Manage ${m.email}`}>⋯</summary>
                  <div className="card" style={{ position: "absolute", right: 0, top: 42, zIndex: 5, padding: 12, display: "grid", gap: 8, minWidth: 190 }}>
                    {!m.joined_at && (
                      <form action={resendInvite.bind(null, loopId, m.id)}>
                        <SubmitButton className="btn secondary small block" pendingText="Sending…">Resend invite</SubmitButton>
                      </form>
                    )}
                    <form action={setRole.bind(null, loopId, m.id, m.role === "admin" ? "member" : "admin")}>
                      <SubmitButton className="btn secondary small block">
                        {m.role === "admin" ? "Remove admin" : "Make admin"}
                      </SubmitButton>
                    </form>
                    <ConfirmButton
                      action={removeMember.bind(null, loopId, m.id)}
                      message={`Remove ${m.name || m.email} from ${loop.name}?`}
                      className="btn danger small block"
                    >
                      Remove from group
                    </ConfirmButton>
                  </div>
                </details>
              )}
            </div>
          ))}
        </div>
        <p className="small muted" style={{ marginTop: 12 }}>
          To invite people, use the invite box on the <Link href={`/loops/${loopId}`}>group page</Link>.
        </p>
      </section>

      <section className="card stack">
        <h3>Leave group</h3>
        <p className="muted small">You'll stop getting emails and won't see new issues.</p>
        <div>
          <ConfirmButton action={leaveLoop.bind(null, loopId)} message={`Leave ${loop.name}?`}>
            Leave {loop.name}
          </ConfirmButton>
        </div>
      </section>

      {isAdmin && (
        <section className="card stack danger-zone">
          <h3>Delete group</h3>
          <p className="muted small">
            Permanently deletes the group, every issue, answer and photo. This can't be undone. Type <b>{loop.name}</b> to confirm.
          </p>
          <form action={deleteLoop.bind(null, loopId)} className="inline-form wrap-sm">
            <input type="text" name="confirm" placeholder={loop.name} required autoComplete="off" />
            <SubmitButton className="btn danger" pendingText="Deleting…">Delete forever</SubmitButton>
          </form>
        </section>
      )}
    </div>
  );
}
