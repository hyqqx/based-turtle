import { cookies } from "next/headers";
import { getRedis } from "./redis";

const COOKIE_NAME = "bt_session";
const SESSION_TTL = 60 * 60 * 24 * 7; // 7 days

export async function createSession(address: string): Promise<void> {
  const id = crypto.randomUUID();
  await getRedis().set(`session:${id}`, address, { ex: SESSION_TTL });
  const jar = await cookies();
  jar.set(COOKIE_NAME, id, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: SESSION_TTL,
    path: "/",
  });
}

export async function getSessionAddress(): Promise<string | null> {
  const jar = await cookies();
  const id = jar.get(COOKIE_NAME)?.value;
  if (!id) return null;
  const address = await getRedis().get<string>(`session:${id}`);
  return address ?? null;
}
