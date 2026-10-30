import type { Issue } from "@/lib/db";
import { issueTimeline } from "@/lib/schedule";
import { formatDate } from "@/lib/email";

export function Timeline({ publishDate, issue, todayStr }: { publishDate: string; issue: Issue | null; todayStr: string }) {
  const t = issueTimeline(publishDate);
  const status = issue?.status;
  const steps = [
    {
      label: "Suggest questions",
      date: t.questionsOpen,
      done: status === "answers" || status === "published",
      now: status === "questions",
    },
    {
      label: "Answer questions",
      date: t.answersOpen,
      done: status === "published",
      now: status === "answers" && todayStr < t.reminder,
    },
    {
      label: "Last-call reminder",
      date: t.reminder,
      done: status === "published" || (status === "answers" && !!issue?.reminder_sent_at),
      now: status === "answers" && todayStr >= t.reminder,
    },
    { label: "Newsletter goes out", date: t.publish, done: status === "published", now: false },
  ];
  return (
    <ol className="timeline">
      {steps.map((s) => (
        <li key={s.label} className={s.done ? "done" : s.now ? "now" : ""}>
          <div>
            <div className="t-label">{s.label}</div>
            <div className="t-date">{formatDate(s.date)}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}
