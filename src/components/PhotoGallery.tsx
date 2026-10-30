"use client";

import { useEffect, useState } from "react";

export function PhotoGallery({ photos }: { photos: string[] }) {
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!photos.length) return null;
  return (
    <>
      <div className={`photos ${photos.length === 1 ? "single" : ""}`}>
        {photos.map((url) => (
          <button key={url} type="button" onClick={() => setOpen(url)} aria-label="View photo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" loading="lazy" />
          </button>
        ))}
      </div>
      {open && (
        <div className="lightbox" onClick={() => setOpen(null)} role="dialog" aria-modal="true" aria-label="Photo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={open} alt="" />
        </div>
      )}
    </>
  );
}
