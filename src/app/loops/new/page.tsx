import { requireUser } from "@/lib/auth";
import { createLoop } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/forms";
import { ordinal } from "@/lib/format";

export const metadata = { title: "New group" };

export default async function NewLoop() {
  await requireUser("/loops/new");
  return (
    <div className="container narrow page">
      <p className="eyebrow">New group</p>
      <h1 style={{ marginTop: 6, marginBottom: 20 }}>Start a new loop</h1>
      <ActionForm action={createLoop} className="card stack" hideMessage>
        <label className="field">
          <span>Group name</span>
          <input type="text" name="name" required maxLength={80} placeholder="The Old Roommates" autoFocus />
        </label>
        <label className="field">
          <span>Description <span className="muted">(optional)</span></span>
          <input type="text" name="description" maxLength={300} placeholder="Keeping up since sophomore year" />
        </label>
        <label className="field">
          <span>Issue day each month</span>
          <select name="publish_day" defaultValue="1">
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>{ordinal(d)} of the month</option>
            ))}
          </select>
          <p className="hint">
            The newsletter goes out on this day. Ten days before, everyone is asked to suggest questions; six days before,
            the questions are locked in and everyone answers.
          </p>
        </label>
        <label className="field">
          <span>Invite friends <span className="muted">(optional — you can do this later)</span></span>
          <textarea name="invites" rows={3} style={{ minHeight: 90 }} placeholder="maya@example.com, sam@example.com" />
          <p className="hint">Separate emails with commas or new lines. Each person gets an invite email.</p>
        </label>
        <div><SubmitButton pendingText="Creating…">Create group</SubmitButton></div>
      </ActionForm>
    </div>
  );
}

