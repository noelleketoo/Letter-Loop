import { promises as fs } from "fs";
import path from "path";
import { newId } from "./db";

export const LOCAL_UPLOAD_DIR = path.join(process.cwd(), ".data", "uploads");

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
};

export function isAllowedImage(type: string): boolean {
  return type in EXT;
}

/** Store an uploaded photo and return its public URL. Uses Vercel Blob when configured. */
export async function savePhoto(file: File, folder: string): Promise<string> {
  const name = `${folder}/${newId(16)}.${EXT[file.type] ?? "jpg"}`;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    const blob = await put(`photos/${name}`, file, { access: "public", contentType: file.type });
    return blob.url;
  }
  if (process.env.VERCEL) throw new Error("Photo storage isn't set up. Connect a Vercel Blob store to this project.");
  const dest = path.join(LOCAL_UPLOAD_DIR, name);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, Buffer.from(await file.arrayBuffer()));
  return `/api/files/${name}`;
}

export async function deletePhoto(url: string): Promise<void> {
  try {
    if (url.startsWith("/api/files/")) {
      const rel = url.slice("/api/files/".length);
      const dest = path.join(LOCAL_UPLOAD_DIR, rel);
      if (dest.startsWith(LOCAL_UPLOAD_DIR)) await fs.unlink(dest);
    } else if (process.env.BLOB_READ_WRITE_TOKEN) {
      const { del } = await import("@vercel/blob");
      await del(url);
    }
  } catch (err) {
    console.error("Failed to delete photo", url, err);
  }
}
