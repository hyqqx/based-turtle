import { getRedis } from "@/lib/redis";
import { getSessionAddress } from "@/lib/session";
import { applyGm, sanitize } from "@/lib/game";
import { verifyActionTx } from "@/lib/verifyTx";

export const maxDuration = 30;

/* Daily GM check-in: requires a real Base transaction. */
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
  if (typeof hash !== "string" || !(await verifyActionTx(hash, address, "gm"))) {
    return Response.json({ error: "tx not verified" }, { status: 400 });
  }

  const now = Date.now();
  const redis = getRedis();
  const key = `turtle:${address}`;
  const raw = await redis.get(key);
  const result = applyGm(sanitize(raw, now), now);

  await redis.set(key, result.state);
  if (result.ok) {
    await redis.zadd("lb:xp", { score: result.state.xp, member: address });
  }

  return Response.json(
    { ok: result.ok, state: result.state, now },
    { status: result.ok ? 200 : 429 },
  );
}
