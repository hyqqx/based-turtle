import { getRedis } from "@/lib/redis";
import { getSessionAddress } from "@/lib/session";
import { applyTaps, sanitize } from "@/lib/game";

/* Taps earn coins. The client batches taps and posts them; the server
   caps the daily total and rate-limits the endpoint, so a script can't
   mint coins faster than a thumb can tap. */
export async function POST(req: Request) {
  const address = await getSessionAddress();
  if (!address) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let taps: unknown;
  try {
    taps = ((await req.json()) as { taps?: unknown }).taps;
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  if (typeof taps !== "number" || !Number.isFinite(taps) || taps <= 0) {
    return Response.json({ error: "bad taps" }, { status: 400 });
  }

  const redis = getRedis();

  // At most 30 tap batches per minute per address.
  const rlKey = `tap:rl:${address}`;
  const hits = await redis.incr(rlKey);
  if (hits === 1) await redis.expire(rlKey, 60);
  if (hits > 30) {
    return Response.json({ error: "slow down" }, { status: 429 });
  }

  const now = Date.now();
  const key = `turtle:${address}`;
  const raw = await redis.get(key);
  const result = applyTaps(sanitize(raw, now), taps, now);
  await redis.set(key, result.state);

  return Response.json({ ok: result.ok, coins: result.coins, state: result.state, now });
}
