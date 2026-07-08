import { Redis } from "@upstash/redis";

/* Lazy singleton: keys are read at request time, not at build time.
   Vercel injects KV_REST_API_URL / KV_REST_API_TOKEN via the Upstash
   integration. Secrets never live in the repo. */
let client: Redis | null = null;

export function getRedis(): Redis {
  if (!client) {
    const url = process.env.KV_REST_API_URL;
    const token = process.env.KV_REST_API_TOKEN;
    if (!url || !token) {
      throw new Error("Upstash env vars are missing");
    }
    client = new Redis({ url, token });
  }
  return client;
}
