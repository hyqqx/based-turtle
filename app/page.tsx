"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  useAccount,
  useBalance,
  useConnect,
  useSendCalls,
  useSendTransaction,
  useSignMessage,
} from "wagmi";
import { waitForCallsStatus } from "@wagmi/core";
import { base } from "wagmi/chains";
import { createSiweMessage } from "viem/siwe";
import { stringToHex } from "viem";
import dynamic from "next/dynamic";
import {
  type ActionKey,
  type GameState,
  BACKGROUNDS,
  DAILY_XP_CAP,
  formatCooldown,
  levelInfo,
  moodFace,
  moodKey,
  moodLine,
  stageName,
  streakBoostPct,
  todayKey,
} from "@/lib/game";
import { DATA_SUFFIX, PAYMASTER_URL } from "@/lib/onchain";
import { detectBaseApp } from "@/lib/baseApp";
import { config } from "@/lib/wagmi";
import * as sound from "@/lib/sound";
import styles from "./page.module.css";

// three.js is heavy: load it only on the client, after first paint.
const Turtle3D = dynamic(() => import("./components/Turtle3D"), {
  ssr: false,
  loading: () => <span className={styles.turtle3dLoading}>🐢</span>,
});

const TurtleJump = dynamic(() => import("./components/TurtleJump"), {
  ssr: false,
});

const ACTIONS: { key: ActionKey; label: string; emoji: string }[] = [
  { key: "feed", label: "Feed", emoji: "🍎" },
  { key: "wash", label: "Wash", emoji: "🫧" },
  { key: "swim", label: "Send to sea", emoji: "🌊" },
];

type Env = "checking" | "inside" | "outside";
type Scene = ActionKey | null;
type LbRow = { address: string; xp: number };

/** Action marker + ERC-8021 builder-code suffix. */
function txData(kind: string): `0x${string}` {
  return (stringToHex(`basedturtle:${kind}`) +
    DATA_SUFFIX.slice(2)) as `0x${string}`;
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export default function Home() {
  /* ------------------------- environment gate ------------------------ */
  const [env, setEnv] = useState<Env>("checking");
  const [mutedUi, setMutedUi] = useState(false);

  useEffect(() => {
    sound.loadMuted();
    setMutedUi(sound.isMuted());
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (detectBaseApp()) {
        setEnv("inside");
        clearInterval(timer);
      } else if (tries >= 8) {
        setEnv("outside");
        clearInterval(timer);
      }
    }, 200);
    return () => clearInterval(timer);
  }, []);

  /* ----------------------------- wallet ----------------------------- */
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending: connecting } = useConnect();
  const { signMessageAsync } = useSignMessage();
  const { sendTransactionAsync } = useSendTransaction();
  const { sendCallsAsync } = useSendCalls();
  const { data: balance } = useBalance({ address, chainId: base.id });
  const autoConnectTried = useRef(false);

  useEffect(() => {
    if (env !== "inside" || isConnected || autoConnectTried.current) return;
    if (connectors.length === 0) return;
    autoConnectTried.current = true;
    connect({ connector: connectors[0] });
  }, [env, isConnected, connectors, connect]);

  /* ------------------------- session + state ------------------------ */
  const [state, setState] = useState<GameState | null>(null);
  const [needSignIn, setNeedSignIn] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [busy, setBusy] = useState<ActionKey | "gm" | null>(null);
  const [note, setNote] = useState("");
  const serverDelta = useRef(0);

  const acceptState = useCallback((data: { state: GameState; now: number }) => {
    serverDelta.current = data.now - Date.now();
    setState(data.state);
  }, []);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch("/api/game/state", { cache: "no-store" });
      if (res.status === 401) {
        setNeedSignIn(true);
        setState(null);
        return;
      }
      if (!res.ok) throw new Error("state failed");
      acceptState((await res.json()) as { state: GameState; now: number });
      setNeedSignIn(false);
      setNote("");
    } catch {
      setNote("Connection hiccup. Retrying…");
    }
  }, [acceptState]);

  useEffect(() => {
    if (env === "inside" && isConnected) fetchState();
  }, [env, isConnected, fetchState]);

  useEffect(() => {
    if (!state) return;
    const timer = setInterval(fetchState, 60_000);
    return () => clearInterval(timer);
  }, [state, fetchState]);

  const signIn = useCallback(async () => {
    if (!address) return;
    setSigningIn(true);
    setNote("");
    try {
      const nonceRes = await fetch("/api/auth/nonce", { cache: "no-store" });
      const { nonce } = (await nonceRes.json()) as { nonce: string };
      const message = createSiweMessage({
        address,
        chainId: base.id,
        domain: window.location.host,
        nonce,
        uri: window.location.origin,
        version: "1",
        statement: "Sign in to Based Turtle",
      });
      const signature = await signMessageAsync({ message });
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, signature }),
      });
      if (!res.ok) throw new Error("verify failed");
      await fetchState();
    } catch {
      setNote("Sign-in didn't go through. Try again.");
    } finally {
      setSigningIn(false);
    }
  }, [address, signMessageAsync, fetchState]);

  /* --------------------- scenes, sounds, level-up -------------------- */
  const [scene, setScene] = useState<Scene>(null);
  const sceneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [levelUpTo, setLevelUpTo] = useState<number | null>(null);
  const prevLevel = useRef<number | null>(null);

  const playScene = useCallback((key: ActionKey) => {
    setScene(key);
    if (key === "feed") sound.playMunch();
    if (key === "wash") sound.playShower();
    if (key === "swim") sound.playWaves();
    if (sceneTimer.current) clearTimeout(sceneTimer.current);
    sceneTimer.current = setTimeout(() => setScene(null), 4500);
  }, []);

  useEffect(() => {
    if (!state) return;
    const level = levelInfo(state.xp).level;
    if (prevLevel.current !== null && level > prevLevel.current) {
      setLevelUpTo(level);
      sound.playLevelUp();
      setTimeout(() => setLevelUpTo(null), 2600);
    }
    prevLevel.current = level;
  }, [state]);

  const toggleMute = useCallback(() => {
    const next = !sound.isMuted();
    sound.setMuted(next);
    setMutedUi(next);
  }, []);

  /* ------------------------- onchain actions ------------------------- */
  /* With a paymaster configured, calls are sponsored and players pay
     nothing. Without one, a transaction needs a little ETH on Base, so
     we check the balance first and quietly fall back to offchain rather
     than throwing a wallet error at the player. */

  const sendGameTx = useCallback(
    async (kind: string): Promise<string | null> => {
      if (!address) return null;
      const data = txData(kind);
      try {
        if (PAYMASTER_URL) {
          const { id } = await sendCallsAsync({
            calls: [{ to: address, value: BigInt(0), data }],
            capabilities: { paymasterService: { url: PAYMASTER_URL } },
          });
          const result = await waitForCallsStatus(config, {
            id,
            timeout: 30_000,
          });
          const hash = result.receipts?.[0]?.transactionHash;
          return hash ?? null;
        }
        if (!balance || balance.value === BigInt(0)) return null;
        return await sendTransactionAsync({
          to: address,
          value: BigInt(0),
          data,
        });
      } catch {
        return null; // rejected, out of gas, or paymaster declined
      }
    },
    [address, balance, sendCallsAsync, sendTransactionAsync],
  );

  const gasless = Boolean(PAYMASTER_URL);
  const hasGas = Boolean(balance && balance.value > BigInt(0));
  const canGoOnchain = gasless || hasGas;

  const doAction = useCallback(
    async (key: ActionKey) => {
      if (busy) return;
      setBusy(key);
      setNote("");
      try {
        const hash = await sendGameTx(key);
        if (!hash && canGoOnchain) {
          setNote("Transaction skipped: half XP this time.");
        }
        const res = await fetch("/api/game/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: key, hash }),
        });
        if (res.status === 401) {
          setNeedSignIn(true);
          setState(null);
          return;
        }
        const data = (await res.json()) as {
          ok: boolean;
          state: GameState;
          now: number;
        };
        acceptState(data);
        if (data.ok) playScene(key);
      } catch {
        setNote("Action didn't reach the server. Try again.");
      } finally {
        setBusy(null);
      }
    },
    [busy, sendGameTx, canGoOnchain, acceptState, playScene],
  );

  const doGm = useCallback(async () => {
    if (busy) return;
    setBusy("gm");
    setNote("");
    try {
      const hash = await sendGameTx("gm");
      const res = await fetch("/api/game/gm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hash }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        onchain?: boolean;
        state?: GameState;
        now?: number;
      };
      if (data.state && data.now) {
        acceptState({ state: data.state, now: data.now });
      }
      if (data.ok) {
        sound.playGm();
        if (!data.onchain) {
          setNote("GM saved offchain. Add a little ETH on Base for full XP.");
        }
      }
    } catch {
      setNote("GM didn't reach the server. Try again.");
    } finally {
      setBusy(null);
    }
  }, [busy, sendGameTx, acceptState]);

  /* ---------------------------- leaderboard --------------------------- */
  const [lbOpen, setLbOpen] = useState(false);
  const [lb, setLb] = useState<{
    top: LbRow[];
    me: { address: string; rank: number | null; xp: number };
  } | null>(null);
  const [lbError, setLbError] = useState("");

  const openLb = useCallback(async () => {
    setLbOpen(true);
    setLb(null);
    setLbError("");
    sound.playPop();
    try {
      const res = await fetch("/api/game/leaderboard", { cache: "no-store" });
      if (!res.ok) throw new Error("lb failed");
      setLb(
        (await res.json()) as {
          top: LbRow[];
          me: { address: string; rank: number | null; xp: number };
        },
      );
    } catch {
      setLbError("Couldn't load the leaderboard. Try again in a moment.");
    }
  }, []);

  /* ------------------------------ taps ------------------------------- */
  /* Taps are batched: the counter climbs instantly on screen and is
     flushed to the server shortly after the player stops tapping. */
  const [pendingTaps, setPendingTaps] = useState(0);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [coinPop, setCoinPop] = useState(0);

  const flushTaps = useCallback(async () => {
    const count = pendingTaps;
    if (count <= 0) return;
    setPendingTaps(0);
    try {
      const res = await fetch("/api/game/tap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taps: count }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { state: GameState; now: number };
      acceptState(data);
    } catch {
      /* the taps are lost, not the game */
    }
  }, [pendingTaps, acceptState]);

  const [bounce, setBounce] = useState(false);
  const bounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tapTurtle = useCallback(() => {
    setBounce(true);
    sound.playPop();
    if (bounceTimer.current) clearTimeout(bounceTimer.current);
    bounceTimer.current = setTimeout(() => setBounce(false), 400);

    setPendingTaps((n) => n + 1);
    setCoinPop((n) => n + 1);
    setTimeout(() => setCoinPop((n) => Math.max(0, n - 1)), 900);

    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(() => void flushTaps(), 900);
  }, [flushTaps]);

  /* ------------------------------ shop -------------------------------- */
  const [shopOpen, setShopOpen] = useState(false);
  const [shopBusy, setShopBusy] = useState<string | null>(null);

  const shopAction = useCallback(
    async (action: "buy" | "equip", id: string) => {
      setShopBusy(id);
      try {
        const res = await fetch("/api/game/shop", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, id }),
        });
        const data = (await res.json()) as {
          ok: boolean;
          reason?: string;
          state: GameState;
          now: number;
        };
        if (data.state && data.now) acceptState(data);
        if (data.ok) sound.playPop();
      } catch {
        /* keep the panel open, nothing changed */
      } finally {
        setShopBusy(null);
      }
    },
    [acceptState],
  );

  /* ---------------------------- mini-game ----------------------------- */
  const [jumpOpen, setJumpOpen] = useState(false);

  const submitMinigame = useCallback(
    async (finalScore: number): Promise<number | null> => {
      try {
        const res = await fetch("/api/game/minigame", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ score: finalScore }),
        });
        if (!res.ok) return null;
        const data = (await res.json()) as {
          earned: number;
          state: GameState;
          now: number;
        };
        acceptState({ state: data.state, now: data.now });
        return data.earned;
      } catch {
        return null;
      }
    },
    [acceptState],
  );

  /* --------------------------- 1s ui clock ---------------------------- */
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const copyLink = useCallback(() => {
    navigator.clipboard?.writeText("https://basedturtle.com").catch(() => {});
  }, []);

  /* ------------------------------ screens ----------------------------- */

  if (env === "checking") {
    return (
      <main className={styles.page}>
        <div className={styles.loading}>🐢</div>
      </main>
    );
  }

  if (env === "outside") {
    return (
      <main className={styles.page}>
        <div className={styles.centerCard}>
          <span className={styles.bigTurtle}>🐢</span>
          <h1 className={styles.wordmark}>BASED TURTLE</h1>
          <p className={styles.centerText}>
            This game lives inside the Base App. Open{" "}
            <span className={styles.domain}>basedturtle.com</span> there to
            play.
          </p>
          <button type="button" className={styles.bigButton} onClick={copyLink}>
            Copy link
          </button>
        </div>
      </main>
    );
  }

  if (!isConnected) {
    return (
      <main className={styles.page}>
        <div className={styles.centerCard}>
          <span className={styles.bigTurtle}>🐢</span>
          <h1 className={styles.wordmark}>BASED TURTLE</h1>
          <p className={styles.centerText}>
            Connect your wallet to meet your turtle.
          </p>
          <button
            type="button"
            className={styles.bigButton}
            disabled={connecting || connectors.length === 0}
            onClick={() => connect({ connector: connectors[0] })}
          >
            {connecting ? "Connecting…" : "Connect wallet"}
          </button>
          {note && <p className={styles.error}>{note}</p>}
        </div>
      </main>
    );
  }

  if (needSignIn || !state) {
    return (
      <main className={styles.page}>
        <div className={styles.centerCard}>
          <span className={styles.bigTurtle}>🐢</span>
          <h1 className={styles.wordmark}>BASED TURTLE</h1>
          {needSignIn ? (
            <>
              <p className={styles.centerText}>
                One signature and your turtle is saved to your wallet, on any
                device.
              </p>
              <button
                type="button"
                className={styles.bigButton}
                disabled={signingIn}
                onClick={signIn}
              >
                {signingIn ? "Check your wallet…" : "Sign in to play"}
              </button>
            </>
          ) : (
            <p className={styles.centerText}>Waking the turtle…</p>
          )}
          {note && <p className={styles.error}>{note}</p>}
        </div>
      </main>
    );
  }

  /* ------------------------------- game ------------------------------- */

  const { level, into, next } = levelInfo(state.xp);
  const serverNow = Date.now() + serverDelta.current;
  const gmDone = state.lastGm === todayKey();
  const boost = streakBoostPct(state.streak);
  const mood = moodKey(state.stats);
  const coinsShown = state.coins + pendingTaps;

  const bars: { label: string; value: number; barClass: string }[] = [
    { label: "FOOD", value: state.stats.food, barClass: styles.barFood },
    { label: "CLEAN", value: state.stats.clean, barClass: styles.barClean },
    { label: "ENERGY", value: state.stats.energy, barClass: styles.barEnergy },
    { label: "ACTIVITY", value: state.stats.fun, barClass: styles.barFun },
  ];

  return (
    <main className={`${styles.page} ${styles[`bg_${state.background}`] ?? ""}`}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.wordmark}>BASED TURTLE</h1>
          <p className={styles.greeting}>gm · {address ? short(address) : ""}</p>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.levelChip}>
            LVL {level} · {stageName(level)}
          </div>
          <div className={styles.chipRow}>
            <span className={styles.streakChip}>
              🔥 {state.streak}
              {boost > 0 ? ` · +${boost}%` : ""}
            </span>
            <span className={styles.coinChip}>
              🪙 {coinsShown}
              {coinPop > 0 && <span className={styles.coinPop}>+{coinPop}</span>}
            </span>
            <button
              type="button"
              className={styles.iconButton}
              onClick={() => {
                setShopOpen(true);
                sound.playPop();
              }}
              aria-label="Shop"
            >
              🛍️
            </button>
            <button
              type="button"
              className={styles.iconButton}
              onClick={openLb}
              aria-label="Leaderboard"
            >
              🏆
            </button>
            <button
              type="button"
              className={styles.iconButton}
              onClick={toggleMute}
              aria-label="Sound"
            >
              {mutedUi ? "🔇" : "🔊"}
            </button>
          </div>
        </div>
      </header>

      <section className={styles.lagoon}>
        <button
          type="button"
          className={`${styles.turtleButton} ${styles.turtle3dWrap} ${
            bounce ? styles.turtleBounce : ""
          } ${levelUpTo ? styles.turtleGrow : ""}`}
          onClick={tapTurtle}
          aria-label="Tap the turtle to earn coins"
        >
          <Turtle3D level={level} />
        </button>
      </section>

      <p className={styles.mood}>
        <span className={styles.moodFace}>{moodFace(mood)}</span>{" "}
        {moodLine(state.stats)}
      </p>

      {!gmDone && (
        <button
          type="button"
          className={styles.gmButton}
          disabled={busy !== null}
          onClick={doGm}
        >
          {busy === "gm"
            ? "Confirming…"
            : `⛅ Daily GM · keep the streak${gasless ? " · free" : ""}`}
        </button>
      )}

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
          const waitMs = readyAt - serverNow;
          const onCooldown = waitMs > 0;
          const isBusy = busy === action.key;
          return (
            <button
              key={action.key}
              type="button"
              className={styles.actionButton}
              disabled={onCooldown || busy !== null}
              onClick={() => doAction(action.key)}
            >
              <span className={styles.actionEmoji}>{action.emoji}</span>
              <span className={styles.actionLabel}>
                {isBusy
                  ? "…"
                  : onCooldown
                    ? formatCooldown(waitMs)
                    : action.label}
              </span>
            </button>
          );
        })}
      </section>

      <button
        type="button"
        className={styles.miniGameButton}
        onClick={() => {
          sound.playPop();
          setJumpOpen(true);
        }}
      >
        🪷 Play Turtle Jump · earn XP & coins
      </button>

      {note && <p className={styles.error}>{note}</p>}

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

      {scene && (
        <div className={`${styles.scene} ${styles[`scene_${scene}`]}`}>
          {scene === "feed" && (
            <>
              <span className={styles.sceneProp}>🍳</span>
              <span className={styles.sceneTurtle}>🐢</span>
              <span className={styles.scenePlate}>🍎🥬🍤</span>
              <p className={styles.sceneText}>Nom nom in the kitchen…</p>
            </>
          )}
          {scene === "wash" && (
            <>
              <span className={styles.showerHead}>🚿</span>
              <span className={styles.sceneTurtle}>🐢</span>
              <div className={styles.drops}>
                {Array.from({ length: 14 }).map((_, i) => (
                  <span
                    key={i}
                    className={styles.drop}
                    style={{
                      left: `${8 + i * 6.4}%`,
                      animationDelay: `${(i % 7) * 0.18}s`,
                    }}
                  >
                    💧
                  </span>
                ))}
              </div>
              <p className={styles.sceneText}>Scrub scrub in the shower…</p>
            </>
          )}
          {scene === "swim" && (
            <>
              <span className={styles.swimTurtle}>🐢</span>
              <div className={styles.waves}>🌊🌊🌊🌊🌊</div>
              <p className={styles.sceneText}>Off to the open sea…</p>
            </>
          )}
        </div>
      )}

      {levelUpTo && (
        <div className={styles.levelUp}>
          <span className={styles.levelUpBadge}>LEVEL {levelUpTo}!</span>
          <span className={styles.levelUpSpark}>✨🐢✨</span>
          <p className={styles.sceneText}>Your turtle grew up a little</p>
        </div>
      )}

      {shopOpen && (
        <div className={styles.lbOverlay} onClick={() => setShopOpen(false)}>
          <div className={styles.lbPanel} onClick={(e) => e.stopPropagation()}>
            <div className={styles.lbHead}>
              <span>🛍️ SHOP · 🪙 {state.coins}</span>
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => setShopOpen(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <p className={styles.shopHint}>
              Tap your turtle to earn coins. 1 tap = 1 coin.
            </p>
            <ul className={styles.shopList}>
              {BACKGROUNDS.map((item) => {
                const owned = state.backgrounds.includes(item.id);
                const active = state.background === item.id;
                const affordable = state.coins >= item.price;
                return (
                  <li key={item.id} className={styles.shopRow}>
                    <span className={styles.shopEmoji}>{item.emoji}</span>
                    <span className={styles.shopName}>{item.name}</span>
                    {active ? (
                      <span className={styles.shopActive}>active</span>
                    ) : owned ? (
                      <button
                        type="button"
                        className={styles.shopBtn}
                        disabled={shopBusy !== null}
                        onClick={() => shopAction("equip", item.id)}
                      >
                        Use
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={styles.shopBtn}
                        disabled={!affordable || shopBusy !== null}
                        onClick={() => shopAction("buy", item.id)}
                      >
                        🪙 {item.price}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      {lbOpen && (
        <div className={styles.lbOverlay} onClick={() => setLbOpen(false)}>
          <div className={styles.lbPanel} onClick={(e) => e.stopPropagation()}>
            <div className={styles.lbHead}>
              <span>🏆 LEADERBOARD</span>
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => setLbOpen(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            {lbError ? (
              <p className={styles.error}>{lbError}</p>
            ) : !lb ? (
              <p className={styles.centerText}>Loading…</p>
            ) : lb.top.length === 0 ? (
              <p className={styles.centerText}>
                No turtles ranked yet. Feed yours and be the first!
              </p>
            ) : (
              <>
                <ul className={styles.lbList}>
                  {lb.top.map((row, i) => (
                    <li
                      key={row.address}
                      className={`${styles.lbRow} ${
                        address &&
                        row.address.toLowerCase() === address.toLowerCase()
                          ? styles.lbMe
                          : ""
                      }`}
                    >
                      <span className={styles.lbRank}>{i + 1}</span>
                      <span className={styles.lbAddr}>{short(row.address)}</span>
                      <span className={styles.lbXp}>
                        LVL {levelInfo(row.xp).level} · {row.xp} XP
                      </span>
                    </li>
                  ))}
                </ul>
                {lb.me.rank !== null && lb.me.rank > 20 && (
                  <p className={styles.lbYou}>
                    You: #{lb.me.rank} · {lb.me.xp} XP
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {jumpOpen && (
        <TurtleJump
          onClose={() => setJumpOpen(false)}
          onScore={submitMinigame}
        />
      )}
    </main>
  );
}
