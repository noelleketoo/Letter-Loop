"use client";

import { useEffect, useRef, useState } from "react";
import { removePhoto, saveAnswer } from "@/app/actions";
import { useAutoGrow } from "./forms";

type Photo = { id: string; url: string };
type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

const MAX_PHOTOS = 6;
const MAX_EDGE = 2000;

/** Downscale big phone photos in the browser so uploads are fast and fit server limits. */
async function shrink(file: File): Promise<Blob> {
  if (file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1.5 * 1024 * 1024 && file.type !== "image/heic") return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", 0.85));
  } catch {
    return file; // browser can't decode it (e.g. HEIC on desktop Chrome); send as-is
  }
}

export function AnswerEditor({
  questionId,
  index,
  question,
  author,
  initialBody,
  initialPhotos,
}: {
  questionId: string;
  index: number;
  question: string;
  author?: string | null;
  initialBody: string;
  initialPhotos: Photo[];
}) {
  const [body, setBody] = useState(initialBody);
  const [photos, setPhotos] = useState<Photo[]>(initialPhotos);
  const [uploading, setUploading] = useState(0);
  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const lastSaved = useRef(initialBody);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const textarea = useAutoGrow(body);

  async function save(value: string) {
    if (timer.current) clearTimeout(timer.current);
    if (value === lastSaved.current) return;
    setState("saving");
    try {
      const res = await saveAnswer(questionId, value);
      if (!res.ok) throw new Error(res.error);
      lastSaved.current = value;
      setState("saved");
      setError(null);
    } catch (e) {
      setState("error");
      setError((e as Error).message || "Couldn't save. Check your connection.");
    }
  }

  function onChange(value: string) {
    setBody(value);
    setState("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save(value), 1200);
  }

  // Warn before leaving with unsaved text.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (state === "dirty" || state === "saving" || uploading) e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [state, uploading]);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    const room = MAX_PHOTOS - photos.length - uploading;
    const list = Array.from(files).slice(0, Math.max(0, room));
    if (files.length > list.length) setError(`You can add up to ${MAX_PHOTOS} photos per answer.`);
    // Make sure the answer text is saved too, so the answer row exists with the latest text.
    if (body !== lastSaved.current) await save(body);
    setUploading((n) => n + list.length);
    for (const file of list) {
      try {
        const blob = await shrink(file);
        const fd = new FormData();
        fd.append("questionId", questionId);
        fd.append("file", blob, file.name.replace(/\.\w+$/, "") + (blob.type === "image/jpeg" ? ".jpg" : ""));
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        const data = await res.json().catch(() => ({ error: "Upload failed." }));
        if (!res.ok) throw new Error(data.error || "Upload failed.");
        setPhotos((p) => [...p, data]);
        setState("saved");
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (fileInput.current) fileInput.current.value = "";
  }

  async function onRemove(id: string) {
    const prev = photos;
    setPhotos((p) => p.filter((x) => x.id !== id));
    const res = await removePhoto(id);
    if (!res.ok) {
      setPhotos(prev);
      setError("Couldn't remove that photo.");
    }
  }

  const label = {
    idle: body || photos.length ? "Saved" : "",
    dirty: "Unsaved changes…",
    saving: "Saving…",
    saved: "✓ Saved",
    error: "",
  }[state];

  return (
    <section className="card answer-card" id={`q-${questionId}`}>
      <div className="qhead">
        <span className="qnum">{index}.</span>
        <div className="grow">
          <h3>{question}</h3>
          {author && <p className="small muted" style={{ marginTop: 2 }}>Asked by {author}</p>}
        </div>
      </div>
      <textarea
        ref={textarea}
        value={body}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => save(body)}
        placeholder="Write your answer…"
        aria-label={question}
      />
      <div className="photo-grid" style={{ marginTop: 12 }}>
        {photos.map((p) => (
          <div key={p.id} className="photo-tile">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt="" loading="lazy" />
            <button type="button" className="remove" aria-label="Remove photo" onClick={() => onRemove(p.id)}>✕</button>
          </div>
        ))}
        {Array.from({ length: uploading }, (_, i) => (
          <div key={`u${i}`} className="photo-tile uploading">Uploading…</div>
        ))}
        {photos.length + uploading < MAX_PHOTOS && (
          <button type="button" className="add-photo" onClick={() => fileInput.current?.click()}>
            <span><span className="plus">+</span>Add photo</span>
          </button>
        )}
      </div>
      <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => onFiles(e.target.files)} />
      <div className="row between" style={{ marginTop: 10 }}>
        <span className={`save-state ${error ? "error" : ""}`} role="status">{error ?? label}</span>
        {error && state === "error" && (
          <button type="button" className="linkbtn small" onClick={() => save(body)}>Try again</button>
        )}
      </div>
    </section>
  );
}
