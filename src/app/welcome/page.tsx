import { redirect } from "next/navigation";
import { currentUser, safeRedirect } from "@/lib/auth";
import { saveProfile } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/forms";

export const metadata = { title: "Welcome" };

export default async function Welcome({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const user = await currentUser();
  if (!user) redirect("/login");
  return (
    <div className="container tiny page">
      <div className="card stack">
        <div>
          <p className="eyebrow">One quick thing</p>
          <h1 style={{ marginTop: 6 }}>What should friends call you?</h1>
          <p className="muted" style={{ marginTop: 8 }}>This is the name that appears next to your answers.</p>
        </div>
        <ActionForm action={saveProfile} className="stack">
          <input type="hidden" name="next" value={safeRedirect(next)} />
          <label className="field">
            <span>Your name</span>
            <input type="text" name="name" required maxLength={60} autoComplete="name" defaultValue={user.name ?? ""} autoFocus />
          </label>
          <SubmitButton className="btn block">Continue</SubmitButton>
        </ActionForm>
      </div>
    </div>
  );
}
