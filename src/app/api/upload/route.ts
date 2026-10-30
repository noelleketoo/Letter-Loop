import { currentUser } from "@/lib/auth";
import { one, newId } from "@/lib/db";
import { isAllowedImage, savePhoto } from "@/lib/storage";

const MAX_BYTES = 4.4 * 1024 * 1024; // Vercel functions accept bodies up to 4.5 MB
const MAX_PHOTOS = 6;

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "You've been signed out. Refresh and sign in again." }, { status: 401 });

  const form = await request.formData();
  const questionId = String(form.get("questionId") ?? "");
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "No file uploaded." }, { status: 400 });
  if (!isAllowedImage(file.type)) return Response.json({ error: "Please upload a photo (JPEG, PNG, WebP or GIF)." }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "That photo is too large." }, { status: 413 });

  const q = await one<{ status: string; loop_id: string }>(
    `select i.status, i.loop_id from questions q join issues i on i.id = q.issue_id
     join memberships m on m.loop_id = i.loop_id and m.user_id = $2 where q.id = $1`,
    [questionId, user.id],
  );
  if (!q) return Response.json({ error: "Question not found." }, { status: 404 });
  if (q.status !== "answers") return Response.json({ error: "This issue isn't open for answers." }, { status: 400 });

  const answer = (await one<{ id: string }>(
    `insert into answers (id, question_id, user_id) values ($1, $2, $3)
     on conflict (question_id, user_id) do update set updated_at = now() returning id`,
    [newId(), questionId, user.id],
  ))!;
  const count = await one<{ n: number }>(`select count(*)::int as n from photos where answer_id = $1`, [answer.id]);
  if ((count?.n ?? 0) >= MAX_PHOTOS) {
    return Response.json({ error: `You can add up to ${MAX_PHOTOS} photos per answer.` }, { status: 400 });
  }

  try {
    const url = await savePhoto(file, q.loop_id);
    const photo = (await one<{ id: string; url: string }>(
      `insert into photos (id, answer_id, url) values ($1, $2, $3) returning id, url`,
      [newId(), answer.id, url],
    ))!;
    return Response.json(photo);
  } catch (err) {
    console.error(err);
    return Response.json({ error: (err as Error).message || "Upload failed." }, { status: 500 });
  }
}
