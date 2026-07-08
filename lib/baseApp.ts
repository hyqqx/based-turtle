/* Best-effort detection of the Base App in-app browser.
   Signals: injected wallet provider flags and the user agent string.
   All checks live here so tuning after real-device tests is a
   one-file change. */

type InjectedProvider = {
  isBaseApp?: boolean;
  isCoinbaseWallet?: boolean;
  isCoinbaseBrowser?: boolean;
  providers?: InjectedProvider[];
};

export function detectBaseApp(): boolean {
  if (typeof window === "undefined") return false;

  const eth = (window as { ethereum?: InjectedProvider }).ethereum;
  const list: InjectedProvider[] = eth
    ? [eth, ...(Array.isArray(eth.providers) ? eth.providers : [])]
    : [];
  const flagged = list.some(
    (p) => p?.isBaseApp || p?.isCoinbaseWallet || p?.isCoinbaseBrowser,
  );

  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const uaHit = /base\s?app|coinbase/i.test(ua);

  return Boolean(flagged || uaHit);
}
