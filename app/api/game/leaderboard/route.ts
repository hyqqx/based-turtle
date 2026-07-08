import { getRedis } from "@/lib/redis";
import { getSessionAddress } from "@/lib/session";

export async function GET() {
  const address = await getSessionAddress();
  if (!address) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const redis = getRedis();
  const flat = await redis.zrange<(string | number)[]>("lb:xp", 0, 19, {
    rev: true,
    withScores: true,
  });

  const top: { address: string; xp: number }[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) {
    top.push({ address: String(flat[i]), xp: Number(flat[i + 1]) });
  }

  const [rank, score] = await Promise.all([
    redis.zrevrank("lb:xp", address),
    redis.zscore("lb:xp", address),
  ]);

  return Response.json({
    top,
    me: {
      address,
      rank: typeof rank === "number" ? rank + 1 : null,
      xp: score === null ? 0 : Number(score),
    },
  });
}
