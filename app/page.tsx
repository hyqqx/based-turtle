"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMiniApp } from "./providers/MiniAppProvider";
import styles from "./page.module.css";

/* ------------------------------------------------------------------ */
/*  Game constants. Tune freely: times are in milliseconds.            */
/*  NOTE: this is the visual v1. Real game logic moves server-side     */
/*  later so progress can't be cheated.                                */
/* ------------------------------------------------------------------ */

const DECAY_PER_HOUR = { food: 10, clean: 8, energy: 6 } as const;
const ACTION_GAIN = 30;
const ACTION_XP = 10;
const DAILY_XP_CAP = 150;

// Short cooldowns for testing. Raise before launch.
const COOLDOWN_MS = {
  feed: 60_000, // 1 min
  wash: 90_000, // 1.5 min
  swim: 120_000, // 2 min
} as const;

const STORAGE_KEY = "based-turtle-save-v1";

type ActionKey = keyof typeof COOLDOWN_MS;

interface Stats {
  food: number;
  clean: number;
  energy: number;
}

interface SaveState {
  stats: Stats;
  xp: number;
  xpToday: number;
  dayKey: string;
  cooldowns: Record<ActionKey, number>;
  lastUpdate: number;
}

/* ------------------------------ helpers ---------------------------- */

const clamp = (v: number) => Math.min(100, Math.max(0, v));
const todayKey = () => new Date().toISOString().slice(0, 10);

function freshState(): SaveState {
  return {
    stats: { food: 80, clean: 80, energy: 80 },
    xp: 0,
    xpToday: 0,
    dayKey: todayKey(),
    cooldowns: { feed: 0, wash: 0, swim: 0 },
    lastUpdate: Date.now(),
  };
}

/** Rebuild a valid state from whatever is in storage, so a broken
 *  or outdated save never crashes the game. */
function parseSave(raw: string | null): SaveState {
  const fresh = freshState();
  if (!raw) return fresh;
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    const num = (v: unknown, fallback: number) =>
      typeof v === "number" && Number.isFinite(v) ? v : fallback;
    const stats = (data.stats ?? {}) as Record<string, unknown>;
    const cds = (data.cooldowns ?? {}) as Record<string, unknown>;
    return {
      stats: {
        food: clamp(num(stats.food, fresh.stats.food)),
        clean: clamp(num(stats.clean, fresh.stats.clean)),
        energy: clamp(num(stats.energy, fresh.stats.energy)),
      },
      xp: Math.max(0, num(data.xp, 0)),
      xpToday: Math.max(0, num(data.xpToday, 0)),
      dayKey: typeof data.dayKey === "string" ? data.dayKey : fresh.dayKey,
      cooldowns: {
        feed: num(cds.feed, 0),
        wash: num(cds.wash, 0),
        swim: num(cds.swim, 0),
      },
      lastUpdate: num(data.lastUpdate, Date.now()),
    };
  } catch {
    return fresh;
  }
}

function withDecay(state: SaveState, now: number): SaveState {
  const hours = Math.max(0, (now - state.lastUpdate) / 3_600_000);
  const day = todayKey();
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

function levelInfo(xp: number) {
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

function stageName(level: number): string {
  if (level < 3) return "Baby";
  if (level < 6) return "Young";
  if (level < 10) return "Teen";
  if (level < 15) return "Adult";
  return "Giant";
}

function moodLine(stats: Stats): string {
  const min = Math.min(stats.food, stats.clean, stats.energy);
  if (min >= 70) return "Feeling based ✨";
  if (min < 35 && stats.food === min) return "I'm hungry…";
  if (min < 35 && stats.clean === min) return "I could use a bath 🫧";
  if (min < 35 && stats.energy === min) return "Sleepy… the sea would help";
  return "Doing okay 🌊";
}

function formatCooldown(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/* ------------------------------ actions ---------------------------- */

const ACTIONS: { key: ActionKey; label: string; emoji: string }[] = [
  { key: "feed", label: "Feed", emoji: "🍎" },
  { key: "wash", label: "Wash", emoji: "🫧" },
  { key: "swim", label: "Send to sea", emoji: "🌊" },
];

/* ------------------------------ component -------------------------- */

export default function Home() {
  const { context } = useMiniApp();
  const [state, setState] = useState<SaveState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [bounce, setBounce] = useState(false);
  const bounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load the save and apply offline decay.
  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // Storage unavailable: start fresh.
    }
    setState(withDecay(parseSave(raw), Date.now()));
  }, []);

  // Persist every change.
  useEffect(() => {
    if (!state) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage unavailable: play without saving.
    }
  }, [state]);

  // One-second clock: cooldown labels tick and stats decay live.
  useEffect(() => {
    const timer = setInterval(() => {
      const ts = Date.now();
      setNow(ts);
      setState((s) => (s ? withDecay(s, ts) : s));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const wobble = useCallback(() => {
    setBounce(true);
    if (bounceTimer.current) clearTimeout(bounceTimer.current);
    bounceTimer.current = setTimeout(() => setBounce(false), 600);
  }, []);

  const doAction = useCallback(
    (key: ActionKey) => {
      const ts = Date.now();
      setState((prev) => {
        if (!prev) return prev;
        const s = withDecay(prev, ts);
        if (s.cooldowns[key] > ts) return s;
        const gainXp = Math.min(ACTION_XP, Math.max(0, DAILY_XP_CAP - s.xpToday));
        const stats = { ...s.stats };
        if (key === "feed") stats.food = clamp(stats.food + ACTION_GAIN);
        if (key === "wash") stats.clean = clamp(stats.clean + ACTION_GAIN);
        if (key === "swim") stats.energy = clamp(stats.energy + ACTION_GAIN);
        return {
          ...s,
          stats,
          xp: s.xp + gainXp,
          xpToday: s.xpToday + gainXp,
          cooldowns: { ...s.cooldowns, [key]: ts + COOLDOWN_MS[key] },
        };
      });
      wobble();
    },
    [wobble],
  );

  if (!state) {
    return (
      <main className={styles.page}>
        <div className={styles.loading}>🐢</div>
      </main>
    );
  }

  const { level, into, next } = levelInfo(state.xp);
  const turtleSize = Math.min(72 + level * 6, 168);
  const userName = context?.user?.displayName;

  const bars: { label: string; value: number; barClass: string }[] = [
    { label: "FOOD", value: state.stats.food, barClass: styles.barFood },
    { label: "CLEAN", value: state.stats.clean, barClass: styles.barClean },
    { label: "ENERGY", value: state.stats.energy, barClass: styles.barEnergy },
  ];

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.wordmark}>BASED TURTLE</h1>
          <p className={styles.greeting}>gm{userName ? `, ${userName}` : ""}</p>
        </div>
        <div className={styles.levelChip}>
          LVL {level} · {stageName(level)}
        </div>
      </header>

      <section className={styles.lagoon}>
        <button
          type="button"
          className={styles.turtleButton}
          onClick={wobble}
          aria-label="Pet the turtle"
        >
          <span
            className={`${styles.turtle} ${bounce ? styles.turtleBounce : ""}`}
            style={{ fontSize: turtleSize }}
          >
            🐢
          </span>
        </button>
      </section>
      <p className={styles.mood}>{moodLine(state.stats)}</p>

      <section className={styles.stats}>
        {bars.map((bar) => (
          <div key={bar.label} className={styles.statRow}>
            <span className={styles.statLabel}>{bar.label}</span>
            <div className={styles.track}>
              <div
                className={`${styles.fill} ${bar.barClass}`}
                style={{ width: `${bar.value}%` }}
              />
            </div>
            <span className={styles.statValue}>{Math.round(bar.value)}</span>
          </div>
        ))}
      </section>

      <section className={styles.actions}>
        {ACTIONS.map((action) => {
          const readyAt = state.cooldowns[action.key];
          const waitMs = readyAt - now;
          const onCooldown = waitMs > 0;
          return (
            <button
              key={action.key}
              type="button"
              className={styles.actionButton}
              disabled={onCooldown}
              onClick={() => doAction(action.key)}
            >
              <span className={styles.actionEmoji}>{action.emoji}</span>
              <span className={styles.actionLabel}>
                {onCooldown ? formatCooldown(waitMs) : action.label}
              </span>
            </button>
          );
        })}
      </section>

      <footer className={styles.footer}>
        <div className={styles.xpRow}>
          <span>
            XP {into}/{next}
          </span>
          <span>
            today {state.xpToday}/{DAILY_XP_CAP}
          </span>
        </div>
        <div className={styles.xpTrack}>
          <div
            className={styles.xpFill}
            style={{ width: `${Math.min(100, (into / next) * 100)}%` }}
          />
        </div>
      </footer>
    </main>
  );
}
