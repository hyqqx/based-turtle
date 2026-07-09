import { getRedis } from "@/lib/redis";
import { getSessionAddress } from "@/lib/session";

type Row = { address: string; xp: number };

/** Upstash may return a flat [member, score, ...] array or a list of
 *  { member, score } objects depending on version. Handle both. */
function parseRange(raw: unknown): Row[] {
  if (!Array.isArray(raw)) return [];
  const rows: Row[] = [];

  if (raw.length > 0 && typeof raw[0] === "object" && raw[0] !== null) {
    for (const item of raw as { member?: unknown; score?: unknown }[]) {
      if (typeof item?.member === "string") {
        rows.push({ address: item.member, xp: Number(item.score ?? 0) });
      }
    }
    return rows;
  }

  for (let i = 0; i + 1 < raw.length; i += 2) {
    const member = raw[i];
    const score = Number(raw[i + 1]);
    if (typeof member === "string" && Number.isFinite(score)) {
      rows.push({ address: member, xp: score });
    }
  }
  return rows;
}

export async function GET() {
  const address = await getSessionAddress();
  if (!address) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const redis = getRedis();
    const raw = await redis.zrange("lb:xp", 0, 19, {
      rev: true,
      withScores: true,
    });
    const top = parseRange(raw);

    let rank: number | null = null;
    let xp = 0;
    try {
      const [r, s] = await Promise.all([
        redis.zrevrank("lb:xp", address),
        redis.zscore("lb:xp", address),
      ]);
      rank = typeof r === "number" ? r + 1 : null;
      xp = s === null || s === undefined ? 0 : Number(s);
    } catch {
      // ranking is a nice-to-have; the top list still renders
    }

    return Response.json({ top, me: { address, rank, xp } });
  } catch {
    return Response.json(
      { top: [], me: { address, rank: null, xp: 0 }, error: "leaderboard unavailable" },
      { status: 200 },
    );
  }
}
