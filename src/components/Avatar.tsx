const COLORS = ["#d4507a", "#7488e0", "#9b6bd6", "#e07a5f", "#3f9c8f", "#c0609e", "#5b8fd1", "#d9822b", "#8a6fd1", "#2f8a68"];

export function Avatar({ name, email, size }: { name?: string | null; email?: string; size?: "sm" | "lg" }) {
  const label = (name || email || "?").trim();
  const initials = label
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  let hash = 0;
  for (const ch of email || label) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span className={`avatar ${size ?? ""}`} style={{ background: COLORS[hash % COLORS.length] }} title={label} aria-hidden>
      {initials}
    </span>
  );
}
