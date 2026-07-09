import { getRedis } from "@/lib/redis";
import { sanitize, withDecay, todayKey, moodKey } from "@/lib/game";

/* Daily reminder, sent through the Base Dashboard Notifications API.
   Runs once a day from a Vercel cron; Base itself de-duplicates identical
   notifications within 24h, so nobody gets spammed.
   Docs: docs.base.org/apps/technical-guides/base-notifications */

export const maxDuration = 60;

const API = "https://dashboard.base.org/api/v1/notifications";
const APP_URL = process.env.NEXT_PUBLIC_URL || "https://basedturtle.com";

type Bucket = "hungry" | "dirty" | "sleepy" | "lonely" | "gm";

const MESSAGES: Record<Bucket, { title: string; message: string }> = {
  hungry: { title: "Your turtle is hungry", message: "A quick snack would make its day. 🍎" },
  dirty: { title: "Bath time", message: "Your turtle could use a rinse. 🫧" },
  sleepy: { title: "Sleepy turtle", message: "A swim in the sea would recharge it. 🌊" },
  lonely: { title: "Nobody played today", message: "Your turtle misses you. Tap in for a minute. 🐢" },
  gm: { title: "Keep your streak", message: "Say GM to your turtle and keep the streak alive. 🔥" },
};

async function fetchOptedInUsers(apiKey: string): Promise<string[]> {
  const users: string[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < 10; page++) {
    const url = new URL(`${API}/app/users`);
    url.searchParams.set("app_url", APP_URL);
    url.searchParams.set("notification_enabled", "true");
    url.searchParams.set("limit", "500");
    if (cursor) url.searchParams.set("cursor", cursor);

    const res = await fetch(url, { headers: { "x-api-key": apiKey } });
    if (!res.ok) break;
    const data = (await res.json()) as {
      users?: { address: string }[];
      nextCursor?: string;
    };
    for (const u of data.users ?? []) users.push(u.address);
    if (!data.nextCursor) break;
    cursor = data.nextCursor;
  }
  return users;
}

async function send(
  apiKey: string,
  addresses: string[],
  bucket: Bucket,
): Promise<number> {
  if (addresses.length === 0) return 0;
  const res = await fetch(`${API}/send`, {
    method: "POST",
    headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      app_url: APP_URL,
      wallet_addresses: addresses.slice(0, 1000),
      title: MESSAGES[bucket].title,
      message: MESSAGES[bucket].message,
    }),
  });
  if (!res.ok) return 0;
  const data = (await res.json()) as { sentCount?: number };
  return data.sentCount ?? 0;
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.BASE_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "BASE_API_KEY missing" }, { status: 500 });
  }

  const addresses = await fetchOptedInUsers(apiKey);
  if (addresses.length === 0) {
    return Response.json({ ok: true, users: 0, sent: 0 });
  }

  const redis = getRedis();
  const now = Date.now();
  const today = todayKey();

  // One reminder per player: the most pressing need wins.
  const buckets: Record<Bucket, string[]> = {
    hungry: [], dirty: [], sleepy: [], lonely: [], gm: [],
  };

  for (const address of addresses) {
    try {
      const raw = await redis.get(`turtle:${address}`);
      if (!raw) continue;
      const s = withDecay(sanitize(raw, now), now);
      const { food, clean, energy, fun } = s.stats;
      const worst = Math.min(food, clean, energy, fun);

      if (moodKey(s.stats) !== "happy" && worst < 45) {
        if (worst === food) buckets.hungry.push(address);
        else if (worst === clean) buckets.dirty.push(address);
        else if (worst === energy) buckets.sleepy.push(address);
        else buckets.lonely.push(address);
      } else if (s.lastGm !== today) {
        buckets.gm.push(address);
      }
    } catch {
      // one broken record shouldn't stop the whole run
    }
  }

  let sent = 0;
  for (const key of Object.keys(buckets) as Bucket[]) {
    sent += await send(apiKey, buckets[key], key);
  }

  return Response.json({ ok: true, users: addresses.length, sent });
}
