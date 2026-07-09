import { getRedis } from "@/lib/redis";
import { getSessionAddress } from "@/lib/session";
import { applyMinigame, sanitize } from "@/lib/game";

/* Reward for a mini-game run. Score is clamped and the reward is capped
   per day server-side, so a forged score can't mint unlimited XP. */
export async function POST(req: Request) {
  const address = await getSessionAddress();
  if (!address) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let score: unknown;
  try {
    score = ((await req.json()) as { score?: unknown }).score;
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  if (typeof score !== "number" || !Number.isFinite(score) || score < 0) {
    return Response.json({ error: "bad score" }, { status: 400 });
  }

  const redis = getRedis();

  const rlKey = `mg:rl:${address}`;
  const hits = await redis.incr(rlKey);
  if (hits === 1) await redis.expire(rlKey, 60);
  if (hits > 10) {
    return Response.json({ error: "slow down" }, { status: 429 });
  }

  const now = Date.now();
  const key = `turtle:${address}`;
  const raw = await redis.get(key);
  const result = applyMinigame(sanitize(raw, now), score, now);

  await redis.set(key, result.state);
  if (result.earned > 0) {
    await redis.zadd("lb:xp", { score: result.state.xp, member: address });
  }

  return Response.json({
    ok: result.ok,
    earned: result.earned,
    coins: result.coins,
    state: result.state,
    now,
  });
}
