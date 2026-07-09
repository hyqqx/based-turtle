import { getRedis } from "@/lib/redis";
import { getSessionAddress } from "@/lib/session";
import { applyGm, sanitize } from "@/lib/game";
import { verifyActionTx } from "@/lib/verifyTx";

export const maxDuration = 30;

/* Daily GM check-in. A verified Base transaction earns full XP; without
   one the streak still counts but XP is halved, so a player with an empty
   wallet is never locked out of the game. */
export async function POST(req: Request) {
  const address = await getSessionAddress();
  if (!address) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let hash: unknown;
  try {
    hash = ((await req.json()) as { hash?: unknown }).hash;
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }

  const onchain =
    typeof hash === "string" && (await verifyActionTx(hash, address, "gm"));

  const now = Date.now();
  const redis = getRedis();
  const key = `turtle:${address}`;
  const raw = await redis.get(key);
  const result = applyGm(sanitize(raw, now), now);

  // Offchain GM: keep the streak, halve the XP gained by this call.
  if (result.ok && !onchain) {
    const gained = result.state.xp - sanitize(raw, now).xp;
    const half = Math.floor(gained / 2);
    result.state.xp -= gained - half;
    result.state.xpToday -= gained - half;
  }

  await redis.set(key, result.state);
  if (result.ok) {
    await redis.zadd("lb:xp", { score: result.state.xp, member: address });
  }

  return Response.json(
    { ok: result.ok, onchain, state: result.state, now },
    { status: result.ok ? 200 : 429 },
  );
}
