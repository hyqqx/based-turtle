import { Attribution } from "ox/erc8021";

/* ------------------------------------------------------------------ */
/*  Builder Code attribution (ERC-8021).                               */
/*                                                                     */
/*  Inside the Base App, Base auto-appends the builder code of a       */
/*  registered app. Everywhere else we must append it ourselves, so    */
/*  we always add the suffix: a duplicate is harmless, a missing one   */
/*  loses attribution.                                                 */
/*                                                                     */
/*  Docs: docs.base.org/apps/builder-codes/app-developers              */
/* ------------------------------------------------------------------ */

// New project (play.basedturtle.com, app_id 6a4eff1ff31b796e48ec5a53).
export const BUILDER_CODE = "bc_jbssjozm";

/** ERC-8021 data suffix. For bc_jbssjozm this resolves to
 *  0x62635f6a6273736a6f7a6d0b0080218021802180218021802180218021,
 *  which matches the encoded string shown in the Base Dashboard. */
export const DATA_SUFFIX = Attribution.toDataSuffix({ codes: [BUILDER_CODE] });

export const BASE_CHAIN_ID = 8453;

/** Optional CDP paymaster. When set, actions are gasless for players.
 *  See docs.base.org/base-account/improve-ux/sponsor-gas/paymasters
 *
 *  NOTE: leave this UNSET for now. Turning it on needs three other changes
 *  first (a contract to allowlist, a proxy for this URL, and a rewrite of
 *  the server-side tx check) - see the chat notes. */
export const PAYMASTER_URL = process.env.NEXT_PUBLIC_PAYMASTER_URL ?? "";
