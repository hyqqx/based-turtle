import { toHex } from "viem";

/* Builder code attribution. The daily GM is a zero-value transaction
   from the player to themselves, carrying the builder code in calldata.
   This is what Base reads to credit transactions to this app. No smart
   contract, no deploy, no cost beyond gas (which the paymaster covers). */

export const BUILDER_CODE = "bc_38rhf8j7";

/** Base Sepolia? No: we ship on Base mainnet (chain 8453). */
export const BASE_CHAIN_ID = 8453;

/** Encode a short tagged memo as hex calldata. Format: "BT:gm:<code>"
   so it's human-readable in explorers and unambiguous to parse. */
export function gmCalldata(): `0x${string}` {
  return toHex(`BT:gm:${BUILDER_CODE}`);
}

export function actionCalldata(action: string): `0x${string}` {
  return toHex(`BT:${action}:${BUILDER_CODE}`);
}

/** Optional paymaster: if NEXT_PUBLIC_PAYMASTER_URL is set, calls are
   sponsored (gasless for players). If not set, the player pays the
   (tiny) Base gas themselves and everything still works. */
export function paymasterCapabilities():
  | { paymasterService: { url: string } }
  | undefined {
  const url = process.env.NEXT_PUBLIC_PAYMASTER_URL;
  return url ? { paymasterService: { url } } : undefined;
}
