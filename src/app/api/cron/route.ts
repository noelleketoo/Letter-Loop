import { runScheduler } from "@/lib/schedule";

export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const log = await runScheduler();
  return Response.json({ ok: true, log });
}
