const COLORS = ["#c2410c", "#b45309", "#4d7c0f", "#0f766e", "#1d4ed8", "#7c3aed", "#be185d", "#9f1239", "#0e7490", "#a16207"];

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
