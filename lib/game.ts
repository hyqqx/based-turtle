/* ------------------------------------------------------------------ */
/*  Shared game logic. Used by API routes (authoritative) and by the   */
/*  client (display helpers only). Times are in milliseconds.          */
/* ------------------------------------------------------------------ */

export const DECAY_PER_HOUR = { food: 10, clean: 8, energy: 6 } as const;
export const ACTION_GAIN = 30;
export const ACTION_XP_ONCHAIN = 10; // action confirmed by a Base transaction
export const ACTION_XP_OFFCHAIN = 5; // fallback without a transaction
export const GM_XP = 15;
export const DAILY_XP_CAP = 150;
export const MAX_STREAK_BOOST = 15; // percent

// Short cooldowns for testing. Raise before launch.
export const COOLDOWN_MS = {
  feed: 60_000, // 1 min
  wash: 90_000, // 1.5 min
  swim: 120_000, // 2 min
} as const;

export type ActionKey = keyof typeof COOLDOWN_MS;

export const ACTION_KEYS = Object.keys(COOLDOWN_MS) as ActionKey[];

export interface Stats {
  food: number;
  clean: number;
  energy: number;
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
    stats: { food: 80, clean: 80, energy: 80 },
    xp: 0,
    xpToday: 0,
    dayKey: dayOf(now),
    cooldowns: { feed: 0, wash: 0, swim: 0 },
    lastUpdate: now,
    streak: 0,
    lastGm: "",
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
  return {
    stats: {
      food: clamp(num(stats.food, fresh.stats.food)),
      clean: clamp(num(stats.clean, fresh.stats.clean)),
      energy: clamp(num(stats.energy, fresh.stats.energy)),
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
  };
}

export function withDecay(state: GameState, now: number): GameState {
  const hours = Math.max(0, (now - state.lastUpdate) / 3_600_000);
  const day = dayOf(now);
  return {
    ...state,
    stats: {
      food: clamp(state.stats.food - DECAY_PER_HOUR.food * hours),
      clean: clamp(state.stats.clean - DECAY_PER_HOUR.clean * hours),
      energy: clamp(state.stats.energy - DECAY_PER_HOUR.energy * hours),
    },
    xpToday: day === state.dayKey ? state.xpToday : 0,
    dayKey: day,
    lastUpdate: now,
  };
}

/** Server-side action application. Onchain actions earn full XP,
 *  offchain fallback earns half. Streak adds up to +15%. */
export function applyAction(
  state: GameState,
  key: ActionKey,
  now: number,
  onchain: boolean,
): { ok: boolean; state: GameState } {
  const s = withDecay(state, now);
  if (s.cooldowns[key] > now) {
    return { ok: false, state: s };
  }
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
  if (s.lastGm === today) {
    return { ok: false, state: s };
  }
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

export function moodLine(stats: Stats): string {
  const min = Math.min(stats.food, stats.clean, stats.energy);
  if (min >= 70) return "Feeling based ✨";
  if (min < 35 && stats.food === min) return "I'm hungry…";
  if (min < 35 && stats.clean === min) return "I could use a bath 🫧";
  if (min < 35 && stats.energy === min) return "Sleepy… the sea would help";
  return "Doing okay 🌊";
}

export function formatCooldown(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
