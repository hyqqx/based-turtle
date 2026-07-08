import { createPublicClient, http, stringToHex } from "viem";
import { base } from "viem/chains";
import { getRedis } from "./redis";

const client = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL || "https://mainnet.base.org"),
});

/** Marker the client embeds into transaction calldata. */
export function actionMarker(kind: string): `0x${string}` {
  return stringToHex(`basedturtle:${kind}`);
}

/** Verifies that `hash` is a fresh, successful Base transaction sent by
 *  `address` to itself, carrying the expected action marker, and that it
 *  has not been spent on another action before. */
export async function verifyActionTx(
  hash: string,
  address: string,
  kind: string,
): Promise<boolean> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) return false;
  try {
    const receipt = await client.waitForTransactionReceipt({
      hash: hash as `0x${string}`,
      timeout: 25_000,
    });
    if (receipt.status !== "success") return false;

    const tx = await client.getTransaction({ hash: hash as `0x${string}` });
    const addr = address.toLowerCase();
    if (tx.from.toLowerCase() !== addr) return false;
    if ((tx.to ?? "").toLowerCase() !== addr) return false;

    const marker = actionMarker(kind).slice(2).toLowerCase();
    const input = (tx.input ?? "0x").slice(2).toLowerCase();
    if (!input.startsWith(marker)) return false;

    // Each transaction pays for exactly one action.
    const unused = await getRedis().set(`usedtx:${hash.toLowerCase()}`, 1, {
      nx: true,
      ex: 60 * 60 * 24 * 30,
    });
    return unused === "OK";
  } catch {
    return false;
  }
}
