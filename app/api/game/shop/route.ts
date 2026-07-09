import { getRedis } from "@/lib/redis";
import { getSessionAddress } from "@/lib/session";
import { applyBuy, applyEquip, sanitize } from "@/lib/game";

/* Buy or equip a background. Prices and ownership are checked here,
   never on the client. */
export async function POST(req: Request) {
  const address = await getSessionAddress();
  if (!address) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let action: unknown;
  let id: unknown;
  try {
    const body = (await req.json()) as { action?: unknown; id?: unknown };
    action = body.action;
    id = body.id;
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  if (typeof id !== "string" || (action !== "buy" && action !== "equip")) {
    return Response.json({ error: "bad request" }, { status: 400 });
  }

  const now = Date.now();
  const redis = getRedis();
  const key = `turtle:${address}`;
  const raw = await redis.get(key);
  const state = sanitize(raw, now);

  const result =
    action === "buy" ? applyBuy(state, id, now) : applyEquip(state, id, now);

  await redis.set(key, result.state);

  return Response.json(
    {
      ok: result.ok,
      reason: "reason" in result ? result.reason : undefined,
      state: result.state,
      now,
    },
    { status: result.ok ? 200 : 400 },
  );
}
