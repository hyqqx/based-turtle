/* ------------------------------------------------------------------ */
/*  Shared game logic. API routes are authoritative; the client only   */
/*  uses the display helpers. All times are milliseconds.              */
/* ------------------------------------------------------------------ */

export const DECAY_PER_HOUR = {
  food: 10,
  clean: 8,
  energy: 6,
  fun: 9, // "activity": drops when nobody plays with the turtle
} as const;

export const ACTION_GAIN = 30;
export const ACTION_XP_ONCHAIN = 10; // action confirmed by a Base transaction
export const ACTION_XP_OFFCHAIN = 5; // fallback without a transaction
export const GM_XP = 15;
export const DAILY_XP_CAP = 150;
export const MAX_STREAK_BOOST = 15; // percent

/* taps -> coins -> shop */
export const TAP_COINS = 1; // 1 tap = 1 coin
export const TAP_FUN = 0.6; // each tap cheers the turtle up a little
export const DAILY_TAP_CAP = 300; // coins from tapping per day

/* mini-game */
export const MINIGAME_XP_PER_100 = 5;
export const MINIGAME_DAILY_XP_CAP = 60;
export const MINIGAME_FUN = 25;
export const MINIGAME_COINS_PER_100 = 2;

// Short cooldowns for testing. Raise before launch.
export const COOLDOWN_MS = {
  feed: 60_000, // 1 min
  wash: 90_000, // 1.5 min
  swim: 120_000, // 2 min
} as const;

export type ActionKey = keyof typeof COOLDOWN_MS;
export const ACTION_KEYS = Object.keys(COOLDOWN_MS) as ActionKey[];

/* ------------------------------- shop ------------------------------ */

export interface ShopItem {
  id: string;
  name: string;
  price: number;
  emoji: string;
}

export const BACKGROUNDS: ShopItem[] = [
  { id: "lagoon", name: "Lagoon", price: 0, emoji: "🌊" },
  { id: "aquarium", name: "Aquarium", price: 150, emoji: "🐠" },
  { id: "apartment", name: "Apartment", price: 350, emoji: "🛋️" },
  { id: "beach", name: "Beach", price: 600, emoji: "🏖️" },
];

export const BACKGROUND_IDS = BACKGROUNDS.map((b) => b.id);

/* ------------------------------ state ------------------------------ */

export interface Stats {
  food: number;
  clean: number;
  energy: number;
  fun: number;
}

export interface GameState {
  stats: Stats;
  xp: number;
  xpToday: number;
  dayKey: string;
  cooldowns: Record<ActionKey, number>;
  lastUpdate: number;
  streak: number; // consecutive GM days
  lastGm: string; // "YYYY-MM-DD" of the last GM, "" if never
  minigameXpToday: number;
  coins: number;
  tapCoinsToday: number;
  backgrounds: string[]; // owned background ids
  background: string; // active background id
}

/* ------------------------------ helpers ---------------------------- */

export const clamp = (v: number) => Math.min(100, Math.max(0, v));
export const dayOf = (ts: number) => new Date(ts).toISOString().slice(0, 10);
export const todayKey = () => dayOf(Date.now());

export function streakBoostPct(streak: number): number {
  return Math.min(MAX_STREAK_BOOST, Math.max(0, streak) * 3);
}

function boostedXp(baseXp: number, streak: number): number {
  return Math.round(baseXp * (1 + streakBoostPct(streak) / 100));
}

export function freshState(now: number): GameState {
  return {
    stats: { food: 80, clean: 80, energy: 80, fun: 80 },
    xp: 0,
    xpToday: 0,
    dayKey: dayOf(now),
    cooldowns: { feed: 0, wash: 0, swim: 0 },
    lastUpdate: now,
    streak: 0,
    lastGm: "",
    minigameXpToday: 0,
    coins: 0,
    tapCoinsToday: 0,
    backgrounds: ["lagoon"],
    background: "lagoon",
  };
}

/** Rebuild a valid state from whatever was stored, so a broken or
 *  outdated record never crashes the game. */
export function sanitize(data: unknown, now: number): GameState {
  const fresh = freshState(now);
  if (!data || typeof data !== "object") return fresh;
  const d = data as Record<string, unknown>;
  const num = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;
  const stats = (d.stats ?? {}) as Record<string, unknown>;
  const cds = (d.cooldowns ?? {}) as Record<string, unknown>;

  const owned = Array.isArray(d.backgrounds)
    ? d.backgrounds.filter(
        (b): b is string => typeof b === "string" && BACKGROUND_IDS.includes(b),
      )
    : [];
  if (!owned.includes("lagoon")) owned.unshift("lagoon");

  const active =
    typeof d.background === "string" && owned.includes(d.background)
      ? d.background
      : "lagoon";

  return {
    stats: {
      food: clamp(num(stats.food, fresh.stats.food)),
      clean: clamp(num(stats.clean, fresh.stats.clean)),
      energy: clamp(num(stats.energy, fresh.stats.energy)),
      fun: clamp(num(stats.fun, fresh.stats.fun)),
    },
    xp: Math.max(0, num(d.xp, 0)),
    xpToday: Math.max(0, num(d.xpToday, 0)),
    dayKey: typeof d.dayKey === "string" ? d.dayKey : fresh.dayKey,
    cooldowns: {
      feed: num(cds.feed, 0),
      wash: num(cds.wash, 0),
      swim: num(cds.swim, 0),
    },
    lastUpdate: num(d.lastUpdate, now),
    streak: Math.max(0, Math.floor(num(d.streak, 0))),
    lastGm: typeof d.lastGm === "string" ? d.lastGm : "",
    minigameXpToday: Math.max(0, Math.floor(num(d.minigameXpToday, 0))),
    coins: Math.max(0, Math.floor(num(d.coins, 0))),
    tapCoinsToday: Math.max(0, Math.floor(num(d.tapCoinsToday, 0))),
    backgrounds: owned,
    background: active,
  };
}

export function withDecay(state: GameState, now: number): GameState {
  const hours = Math.max(0, (now - state.lastUpdate) / 3_600_000);
  const day = dayOf(now);
  const newDay = day !== state.dayKey;
  return {
    ...state,
    stats: {
      food: clamp(state.stats.food - DECAY_PER_HOUR.food * hours),
      clean: clamp(state.stats.clean - DECAY_PER_HOUR.clean * hours),
      energy: clamp(state.stats.energy - DECAY_PER_HOUR.energy * hours),
      fun: clamp(state.stats.fun - DECAY_PER_HOUR.fun * hours),
    },
    xpToday: newDay ? 0 : state.xpToday,
    minigameXpToday: newDay ? 0 : state.minigameXpToday,
    tapCoinsToday: newDay ? 0 : state.tapCoinsToday,
    dayKey: day,
    lastUpdate: now,
  };
}

/* ---------------------------- game actions -------------------------- */

/** Onchain actions earn full XP, offchain fallback earns half.
 *  Streak adds up to +15%. */
export function applyAction(
  state: GameState,
  key: ActionKey,
  now: number,
  onchain: boolean,
): { ok: boolean; state: GameState } {
  const s = withDecay(state, now);
  if (s.cooldowns[key] > now) return { ok: false, state: s };

  const baseXp = onchain ? ACTION_XP_ONCHAIN : ACTION_XP_OFFCHAIN;
  const gainXp = Math.min(
    boostedXp(baseXp, s.streak),
    Math.max(0, DAILY_XP_CAP - s.xpToday),
  );
  const stats = { ...s.stats };
  if (key === "feed") stats.food = clamp(stats.food + ACTION_GAIN);
  if (key === "wash") stats.clean = clamp(stats.clean + ACTION_GAIN);
  if (key === "swim") stats.energy = clamp(stats.energy + ACTION_GAIN);

  return {
    ok: true,
    state: {
      ...s,
      stats,
      xp: s.xp + gainXp,
      xpToday: s.xpToday + gainXp,
      cooldowns: { ...s.cooldowns, [key]: now + COOLDOWN_MS[key] },
    },
  };
}

/** Daily GM: once per UTC day, keeps the streak alive.
 *  Yesterday's GM continues the streak, a missed day resets it to 1. */
export function applyGm(
  state: GameState,
  now: number,
): { ok: boolean; state: GameState } {
  const s = withDecay(state, now);
  const today = dayOf(now);
  if (s.lastGm === today) return { ok: false, state: s };

  const yesterday = dayOf(now - 86_400_000);
  const streak = s.lastGm === yesterday ? s.streak + 1 : 1;
  const gainXp = Math.min(
    boostedXp(GM_XP, streak),
    Math.max(0, DAILY_XP_CAP - s.xpToday),
  );
  return {
    ok: true,
    state: {
      ...s,
      streak,
      lastGm: today,
      xp: s.xp + gainXp,
      xpToday: s.xpToday + gainXp,
    },
  };
}

/** Taps: 1 tap = 1 coin, capped per day. Tapping also cheers the turtle. */
export function applyTaps(
  state: GameState,
  taps: number,
  now: number,
): { ok: boolean; state: GameState; coins: number } {
  const s = withDecay(state, now);
  const safe = Math.max(0, Math.min(500, Math.floor(taps)));
  const room = Math.max(0, DAILY_TAP_CAP - s.tapCoinsToday);
  const coins = Math.min(safe * TAP_COINS, room);
  return {
    ok: safe > 0,
    coins,
    state: {
      ...s,
      coins: s.coins + coins,
      tapCoinsToday: s.tapCoinsToday + coins,
      stats: { ...s.stats, fun: clamp(s.stats.fun + safe * TAP_FUN) },
    },
  };
}

/** Mini-game reward: score converts to XP and coins, capped per day. */
export function applyMinigame(
  state: GameState,
  score: number,
  now: number,
): { ok: boolean; state: GameState; earned: number; coins: number } {
  const s = withDecay(state, now);
  const safeScore = Math.max(0, Math.min(100_000, Math.floor(score)));

  const rawXp = Math.floor((safeScore / 100) * MINIGAME_XP_PER_100);
  const room = Math.max(0, MINIGAME_DAILY_XP_CAP - s.minigameXpToday);
  const earned = Math.min(rawXp, room, Math.max(0, DAILY_XP_CAP - s.xpToday));
  const coins = Math.floor((safeScore / 100) * MINIGAME_COINS_PER_100);

  return {
    ok: earned > 0 || coins > 0,
    earned,
    coins,
    state: {
      ...s,
      xp: s.xp + earned,
      xpToday: s.xpToday + earned,
      minigameXpToday: s.minigameXpToday + earned,
      coins: s.coins + coins,
      stats: { ...s.stats, fun: clamp(s.stats.fun + MINIGAME_FUN) },
    },
  };
}

/** Buy a background. Fails when unaffordable or already owned. */
export function applyBuy(
  state: GameState,
  id: string,
  now: number,
): { ok: boolean; state: GameState; reason?: string } {
  const s = withDecay(state, now);
  const item = BACKGROUNDS.find((b) => b.id === id);
  if (!item) return { ok: false, state: s, reason: "unknown item" };
  if (s.backgrounds.includes(id)) return { ok: false, state: s, reason: "owned" };
  if (s.coins < item.price)
    return { ok: false, state: s, reason: "not enough coins" };

  return {
    ok: true,
    state: {
      ...s,
      coins: s.coins - item.price,
      backgrounds: [...s.backgrounds, id],
      background: id,
    },
  };
}

/** Equip an owned background. */
export function applyEquip(
  state: GameState,
  id: string,
  now: number,
): { ok: boolean; state: GameState } {
  const s = withDecay(state, now);
  if (!s.backgrounds.includes(id)) return { ok: false, state: s };
  return { ok: true, state: { ...s, background: id } };
}

/* --------------------------- display helpers ----------------------- */

export function levelInfo(xp: number) {
  let level = 1;
  let rest = xp;
  let cost = 50;
  while (rest >= cost) {
    rest -= cost;
    level += 1;
    cost = 50 + (level - 1) * 25;
  }
  return { level, into: rest, next: cost };
}

export function stageName(level: number): string {
  if (level < 3) return "Baby";
  if (level < 6) return "Young";
  if (level < 10) return "Teen";
  if (level < 15) return "Adult";
  return "Giant";
}

export type MoodKey = "happy" | "good" | "meh" | "sad" | "miserable";

/** Mood is the average of all four needs. A neglected turtle stops smiling. */
export function moodScore(stats: Stats): number {
  return (stats.food + stats.clean + stats.energy + stats.fun) / 4;
}

export function moodKey(stats: Stats): MoodKey {
  const m = moodScore(stats);
  if (m >= 80) return "happy";
  if (m >= 60) return "good";
  if (m >= 40) return "meh";
  if (m >= 20) return "sad";
  return "miserable";
}

export function moodFace(key: MoodKey): string {
  if (key === "happy") return "😄";
  if (key === "good") return "🙂";
  if (key === "meh") return "😐";
  if (key === "sad") return "😔";
  return "😢";
}

export function moodLine(stats: Stats): string {
  const key = moodKey(stats);
  const min = Math.min(stats.food, stats.clean, stats.energy, stats.fun);

  if (key === "happy") return "Feeling based ✨";
  if (key === "miserable") return "Please don't forget about me…";

  if (min === stats.food && min < 45) return "I'm hungry…";
  if (min === stats.clean && min < 45) return "I could use a bath 🫧";
  if (min === stats.energy && min < 45) return "Sleepy… the sea would help";
  if (min === stats.fun && min < 45) return "Nobody plays with me anymore";

  return key === "good" ? "Doing okay 🌊" : "Could be better…";
}

export function formatCooldown(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
