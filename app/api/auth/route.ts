import { createPublicClient, http, getAddress } from "viem";
import { base } from "viem/chains";
import { parseSiweMessage } from "viem/siwe";
import { getRedis } from "@/lib/redis";
import { createSession } from "@/lib/session";

const client = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL || "https://mainnet.base.org"),
});

/* Sign-In with Ethereum. Verifies the signature (including Base Account
   smart wallets via ERC-6492) and issues an httpOnly session cookie. */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { message?: string; signature?: string };
    const { message, signature } = body;
    if (typeof message !== "string" || typeof signature !== "string") {
      return Response.json({ error: "bad request" }, { status: 400 });
    }

    const parsed = parseSiweMessage(message);
    if (!parsed.address || !parsed.nonce || !parsed.domain) {
      return Response.json({ error: "bad message" }, { status: 400 });
    }

    // The signed domain must match the host serving this API.
    const host = req.headers.get("host") ?? "";
    if (parsed.domain !== host) {
      return Response.json({ error: "domain mismatch" }, { status: 400 });
    }

    // Nonce is single-use: read and delete atomically.
    const nonceOk = await getRedis().getdel(`nonce:${parsed.nonce}`);
    if (!nonceOk) {
      return Response.json({ error: "bad nonce" }, { status: 400 });
    }

    const valid = await client.verifySiweMessage({
      message,
      signature: signature as `0x${string}`,
    });
    if (!valid) {
      return Response.json({ error: "invalid signature" }, { status: 401 });
    }

    const address = getAddress(parsed.address);
    await createSession(address);
    return Response.json({ ok: true, address });
  } catch {
    return Response.json({ error: "auth failed" }, { status: 500 });
  }
}
