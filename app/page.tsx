"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useConnect, useSignMessage } from "wagmi";
import { base } from "wagmi/chains";
import { createSiweMessage } from "viem/siwe";
import {
  type ActionKey,
  type GameState,
  DAILY_XP_CAP,
  formatCooldown,
  levelInfo,
  moodLine,
  stageName,
} from "@/lib/game";
import { detectBaseApp } from "@/lib/baseApp";
import styles from "./page.module.css";

const ACTIONS: { key: ActionKey; label: string; emoji: string }[] = [
  { key: "feed", label: "Feed", emoji: "🍎" },
  { key: "wash", label: "Wash", emoji: "🫧" },
  { key: "swim", label: "Send to sea", emoji: "🌊" },
];

type Env = "checking" | "inside" | "outside";

export default function Home() {
  /* ------------------------- environment gate ------------------------ */
  const [env, setEnv] = useState<Env>("checking");
  const [bypass, setBypass] = useState(false);

  useEffect(() => {
    // The injected provider can appear a moment after page load,
    // so poll briefly before declaring "not the Base App".
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
  const autoConnectTried = useRef(false);

  const inApp = env === "inside" || bypass;

  useEffect(() => {
    if (!inApp || isConnected || autoConnectTried.current) return;
    if (connectors.length === 0) return;
    autoConnectTried.current = true;
    connect({ connector: connectors[0] });
  }, [inApp, isConnected, connectors, connect]);

  /* ------------------------- session + state ------------------------ */
  const [state, setState] = useState<GameState | null>(null);
  const [needSignIn, setNeedSignIn] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [pendingAction, setPendingAction] = useState<ActionKey | null>(null);
  const [errMsg, setErrMsg] = useState("");
  const serverDelta = useRef(0);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch("/api/game/state", { cache: "no-store" });
      if (res.status === 401) {
        setNeedSignIn(true);
        setState(null);
        return;
      }
      if (!res.ok) throw new Error("state failed");
      const data = (await res.json()) as { state: GameState; now: number };
      serverDelta.current = data.now - Date.now();
      setState(data.state);
      setNeedSignIn(false);
      setErrMsg("");
    } catch {
      setErrMsg("Connection hiccup. Retrying…");
    }
  }, []);

  useEffect(() => {
    if (inApp && isConnected) fetchState();
  }, [inApp, isConnected, fetchState]);

  // Refresh from the server once a minute while playing.
  useEffect(() => {
    if (!state) return;
    const timer = setInterval(fetchState, 60_000);
    return () => clearInterval(timer);
  }, [state, fetchState]);

  const signIn = useCallback(async () => {
    if (!address) return;
    setSigningIn(true);
    setErrMsg("");
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
      setErrMsg("Sign-in didn't go through. Try again.");
    } finally {
      setSigningIn(false);
    }
  }, [address, signMessageAsync, fetchState]);

  const doAction = useCallback(
    async (key: ActionKey) => {
      if (pendingAction) return;
      setPendingAction(key);
      try {
        const res = await fetch("/api/game/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: key }),
        });
        if (res.status === 401) {
          setNeedSignIn(true);
          setState(null);
          return;
        }
        const data = (await res.json()) as { state: GameState; now: number };
        serverDelta.current = data.now - Date.now();
        setState(data.state);
      } catch {
        setErrMsg("Action didn't reach the server. Try again.");
      } finally {
        setPendingAction(null);
      }
    },
    [pendingAction],
  );

  /* --------------------------- 1s ui clock --------------------------- */
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const [bounce, setBounce] = useState(false);
  const bounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wobble = useCallback(() => {
    setBounce(true);
    if (bounceTimer.current) clearTimeout(bounceTimer.current);
    bounceTimer.current = setTimeout(() => setBounce(false), 600);
  }, []);

  const copyLink = useCallback(() => {
    navigator.clipboard?.writeText("https://basedturtle.com").catch(() => {});
  }, []);

  /* ------------------------------ screens ---------------------------- */

  if (env === "checking") {
    return (
      <main className={styles.page}>
        <div className={styles.loading}>🐢</div>
      </main>
    );
  }

  if (!inApp) {
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
          <button
            type="button"
            className={styles.ghostLink}
            onClick={() => setBypass(true)}
          >
            continue in browser (test mode)
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
          {errMsg && <p className={styles.error}>{errMsg}</p>}
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
          {errMsg && <p className={styles.error}>{errMsg}</p>}
        </div>
      </main>
    );
  }

  /* ------------------------------- game ------------------------------ */

  const { level, into, next } = levelInfo(state.xp);
  const turtleSize = Math.min(72 + level * 6, 168);
  const shortAddr = address
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : "";
  const serverNow = Date.now() + serverDelta.current;

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
          <p className={styles.greeting}>gm · {shortAddr}</p>
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
          const waitMs = readyAt - serverNow;
          const onCooldown = waitMs > 0;
          const busy = pendingAction === action.key;
          return (
            <button
              key={action.key}
              type="button"
              className={styles.actionButton}
              disabled={onCooldown || pendingAction !== null}
              onClick={() => {
                wobble();
                doAction(action.key);
              }}
            >
              <span className={styles.actionEmoji}>{action.emoji}</span>
              <span className={styles.actionLabel}>
                {busy ? "…" : onCooldown ? formatCooldown(waitMs) : action.label}
              </span>
            </button>
          );
        })}
      </section>

      {errMsg && <p className={styles.error}>{errMsg}</p>}

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
