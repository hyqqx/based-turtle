import { getRedis } from "@/lib/redis";

/* One-time SIWE nonce, expires in 5 minutes. */
export async function GET() {
  const nonce = crypto.randomUUID().replace(/-/g, "");
  await getRedis().set(`nonce:${nonce}`, 1, { ex: 300 });
  return Response.json({ nonce });
}
