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

export const BUILDER_CODE = "bc_38rhf8j7";

/** ERC-8021 data suffix, e.g. 0x62635f...8021802180218021 */
export const DATA_SUFFIX = Attribution.toDataSuffix({ codes: [BUILDER_CODE] });

export const BASE_CHAIN_ID = 8453;

/** Optional CDP paymaster. When set, actions are gasless for players.
 *  See docs.base.org/base-account/improve-ux/sponsor-gas/paymasters */
export const PAYMASTER_URL = process.env.NEXT_PUBLIC_PAYMASTER_URL ?? "";
