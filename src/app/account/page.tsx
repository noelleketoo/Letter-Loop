import { requireUser } from "@/lib/auth";
import { logout, saveProfile } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Avatar } from "@/components/Avatar";

export const metadata = { title: "Account" };

export default async function Account() {
  const user = await requireUser("/account");
  return (
    <div className="container tiny page stack" style={{ "--gap": "20px" } as React.CSSProperties}>
      <div className="row">
        <Avatar name={user.name} email={user.email} size="lg" />
        <div>
          <h1 style={{ fontSize: 28 }}>{user.name}</h1>
          <p className="muted small">{user.email}</p>
        </div>
      </div>
      <div className="card">
        <ActionForm action={saveProfile} className="stack">
          <input type="hidden" name="next" value="/account" />
          <label className="field">
            <span>Display name</span>
            <input type="text" name="name" required maxLength={60} defaultValue={user.name ?? ""} />
          </label>
          <div><SubmitButton>Save</SubmitButton></div>
        </ActionForm>
      </div>
      <form action={logout}>
        <SubmitButton className="btn secondary block" pendingText="Signing out…">Sign out</SubmitButton>
      </form>
    </div>
  );
}
