"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { FormState } from "@/app/actions";

export function SubmitButton({
  children,
  pendingText,
  className = "btn",
}: {
  children: ReactNode;
  pendingText?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? pendingText ?? "Saving…" : children}
    </button>
  );
}

/** A form bound to a server action that returns { error | message }. */
export function ActionForm({
  action,
  children,
  className,
  hideMessage,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  children: ReactNode;
  className?: string;
  hideMessage?: boolean;
}) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className={className}>
      {children}
      {state?.error && <p className="form-error" role="alert">{state.error}</p>}
      {state?.message && !hideMessage && <p className="form-ok" role="status">{state.message}</p>}
    </form>
  );
}

/** A plain button that submits a server action after a confirm() prompt. */
export function ConfirmButton({
  action,
  message,
  children,
  className = "btn secondary small",
  pendingText = "Working…",
}: {
  action: () => Promise<void>;
  message: string;
  children: ReactNode;
  className?: string;
  pendingText?: string;
}) {
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={ref}
      action={action}
      onSubmit={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
      style={{ display: "inline" }}
    >
      <SubmitButton className={className} pendingText={pendingText}>
        {children}
      </SubmitButton>
    </form>
  );
}

/** Auto-growing textarea. */
export function useAutoGrow(value: string) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight + 2, 120)}px`;
  }, [value]);
  return ref;
}

export function LoginForm({ action, next }: { action: (prev: FormState, fd: FormData) => Promise<FormState>; next: string }) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className="stack">
      <input type="hidden" name="next" value={next} />
      <label className="field">
        <span>Email</span>
        <input
          key={state?.values?.email}
          type="email"
          name="email"
          required
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
          defaultValue={state?.values?.email}
          autoFocus
        />
      </label>
      {state?.error && <p className="form-error" role="alert">{state.error}</p>}
      <SubmitButton className="btn block" pendingText="Sending…">Email me a sign-in link</SubmitButton>
    </form>
  );
}
