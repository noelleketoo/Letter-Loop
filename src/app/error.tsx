"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="container tiny page">
      <div className="card empty stack">
        <div className="big">😵</div>
        <h1>Something went wrong</h1>
        <p className="muted">Please try again. If it keeps happening, let the group admin know.</p>
        <div><button className="btn" onClick={() => reset()}>Try again</button></div>
      </div>
    </div>
  );
}
