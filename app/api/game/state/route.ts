import { getRedis } from "@/lib/redis";
import { getSessionAddress } from "@/lib/session";
import { sanitize, withDecay } from "@/lib/game";

export async function GET() {
  const address = await getSessionAddress();
  if (!address) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const now = Date.now();
  const redis = getRedis();
  const raw = await redis.get(`turtle:${address}`);
  const state = withDecay(sanitize(raw, now), now);
  await redis.set(`turtle:${address}`, state);
  return Response.json({ state, now, address });
}
