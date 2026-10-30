import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container tiny page">
      <div className="card empty stack">
        <div className="big">🔍</div>
        <h1>Page not found</h1>
        <p className="muted">That page doesn't exist, or you don't have access to it.</p>
        <div><Link href="/" className="btn">Go home</Link></div>
      </div>
    </div>
  );
}
