import { getRedis } from "@/lib/redis";
import { getSessionAddress } from "@/lib/session";
import { ACTION_KEYS, type ActionKey, applyAction, sanitize } from "@/lib/game";

export async function POST(req: Request) {
  const address = await getSessionAddress();
  if (!address) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let action: unknown;
  try {
    action = ((await req.json()) as { action?: unknown }).action;
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  if (typeof action !== "string" || !ACTION_KEYS.includes(action as ActionKey)) {
    return Response.json({ error: "unknown action" }, { status: 400 });
  }

  const now = Date.now();
  const redis = getRedis();
  const key = `turtle:${address}`;
  const raw = await redis.get(key);
  const result = applyAction(sanitize(raw, now), action as ActionKey, now);

  await redis.set(key, result.state);
  if (result.ok) {
    // Leaderboard groundwork: sorted set by total XP (UI comes later).
    await redis.zadd("lb:xp", { score: result.state.xp, member: address });
  }

  return Response.json(
    { ok: result.ok, state: result.state, now },
    { status: result.ok ? 200 : 429 },
  );
}
