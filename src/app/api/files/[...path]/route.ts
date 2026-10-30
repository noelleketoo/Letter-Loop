import { promises as fs } from "fs";
import path from "path";
import { LOCAL_UPLOAD_DIR } from "@/lib/storage";

const TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
};

// Serves photos stored on local disk (development only; production uses Vercel Blob).
export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path: parts } = await ctx.params;
  const file = path.join(LOCAL_UPLOAD_DIR, ...parts);
  if (!file.startsWith(LOCAL_UPLOAD_DIR + path.sep)) return new Response("Not found", { status: 404 });
  try {
    const data = await fs.readFile(file);
    const ext = file.split(".").pop() ?? "";
    return new Response(new Uint8Array(data), {
      headers: { "Content-Type": TYPES[ext] ?? "application/octet-stream", "Cache-Control": "public, max-age=31536000, immutable" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
