const ROOT_URL =
  process.env.NEXT_PUBLIC_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000');

/**
 * MiniApp configuration object. Must follow the Farcaster MiniApp specification.
 *
 * @see {@link https://miniapps.farcaster.xyz/docs/guides/publishing}
 */
export const farcasterConfig = {
  accountAssociation: {
    header: "",
    payload: "",
    signature: ""
  },
  miniapp: {
    version: "1",
    name: "Based Turtle",
    subtitle: "Your tiny turtle on Base",
    description: "Adopt a tiny turtle: feed it, wash it and send it to the sea. Come back every day to keep it happy and grow it from Baby to Giant.",
    screenshotUrls: [`${ROOT_URL}/turtle-screenshot.png`],
    iconUrl: `${ROOT_URL}/turtle-icon.png`,
    splashImageUrl: `${ROOT_URL}/turtle-splash.png`,
    splashBackgroundColor: "#071A33",
    homeUrl: ROOT_URL,
    webhookUrl: `${ROOT_URL}/api/webhook`,
    primaryCategory: "games",
    tags: ["game", "pet", "tamagotchi", "turtle", "base"],
    heroImageUrl: `${ROOT_URL}/turtle-hero.png`,
    tagline: "Feed. Wash. Grow.",
    ogTitle: "Based Turtle",
    ogDescription: "A tiny tamagotchi turtle living on Base. Feed it, wash it, grow it.",
    ogImageUrl: `${ROOT_URL}/turtle-hero.png`,
  },
} as const;
