"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as sound from "@/lib/sound";
import styles from "./TurtleJump.module.css";

/* ------------------------------------------------------------------ */
/*  Turtle Jump: a Doodle-Jump-style climber. The turtle auto-bounces  */
/*  off lily pads; steer left/right by tilting the phone or by tapping */
/*  the screen sides. Falling below the view ends the run. Score is    */
/*  the height climbed; it's sent to the server, which caps the reward.*/
/* ------------------------------------------------------------------ */

const W = 360;
const H = 560;
const GRAVITY = 0.28;
const JUMP_V = -9.2;
const MOVE = 4.4;
const PAD_W = 66;
const PAD_H = 14;
const TURTLE_R = 20;

type Pad = { x: number; y: number };

interface Props {
  onClose: () => void;
  onScore: (score: number) => Promise<number | null>;
}

export default function TurtleJump({ onClose, onScore }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<"ready" | "playing" | "over">("ready");
  const [score, setScore] = useState(0);
  const [earned, setEarned] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // live game state kept in refs so the loop doesn't re-render each frame
  const dirRef = useRef(0); // -1 left, +1 right, 0 none (from taps)
  const tiltRef = useRef(0); // -1..1 from device orientation
  const runRef = useRef<{
    x: number;
    y: number;
    vy: number;
    pads: Pad[];
    best: number;
    alive: boolean;
  } | null>(null);
  const rafRef = useRef<number | null>(null);

  const makePads = useCallback((count: number, fromY: number): Pad[] => {
    const pads: Pad[] = [];
    let y = fromY;
    for (let i = 0; i < count; i++) {
      pads.push({ x: Math.random() * (W - PAD_W), y });
      y -= 70 + Math.random() * 40;
    }
    return pads;
  }, []);

  const start = useCallback(() => {
    const pads = makePads(10, H - 40);
    pads[0].x = W / 2 - PAD_W / 2; // guaranteed pad under the turtle
    runRef.current = {
      x: W / 2,
      y: H - 80,
      vy: JUMP_V,
      pads,
      best: 0,
      alive: true,
    };
    setScore(0);
    setEarned(null);
    setPhase("playing");
    sound.playPop();
  }, [makePads]);

  const finish = useCallback(async () => {
    const run = runRef.current;
    if (!run) return;
    const finalScore = Math.floor(run.best);
    setScore(finalScore);
    setPhase("over");
    sound.playWaves(1.2);
    setSubmitting(true);
    try {
      const got = await onScore(finalScore);
      setEarned(got);
    } finally {
      setSubmitting(false);
    }
  }, [onScore]);

  // main loop
  useEffect(() => {
    if (phase !== "playing") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const loop = () => {
      const run = runRef.current;
      if (!run || !run.alive) return;

      const steer = dirRef.current !== 0 ? dirRef.current : tiltRef.current;
      run.x += steer * MOVE;
      if (run.x < -TURTLE_R) run.x = W + TURTLE_R;
      if (run.x > W + TURTLE_R) run.x = -TURTLE_R;

      run.vy += GRAVITY;
      run.y += run.vy;

      // scroll world down when turtle climbs past the midline
      if (run.y < H * 0.42) {
        const dy = H * 0.42 - run.y;
        run.y = H * 0.42;
        run.best += dy;
        for (const p of run.pads) p.y += dy;
      }

      // recycle pads that fell off the bottom
      for (const p of run.pads) {
        if (p.y > H) {
          p.y = -10;
          p.x = Math.random() * (W - PAD_W);
        }
      }

      // bounce when falling onto a pad
      if (run.vy > 0) {
        for (const p of run.pads) {
          if (
            run.x + TURTLE_R * 0.6 > p.x &&
            run.x - TURTLE_R * 0.6 < p.x + PAD_W &&
            run.y + TURTLE_R > p.y &&
            run.y + TURTLE_R < p.y + PAD_H + 12
          ) {
            run.vy = JUMP_V;
            sound.playPop();
            break;
          }
        }
      }

      // death: fell below the screen
      if (run.y - TURTLE_R > H) {
        run.alive = false;
        finish();
        return;
      }

      setScore(Math.floor(run.best));

      // ---- draw ----
      ctx.clearRect(0, 0, W, H);
      // water gradient
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#0b3b75");
      g.addColorStop(1, "#071a33");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      // pads (lily pads)
      for (const p of run.pads) {
        ctx.fillStyle = "#3ed598";
        roundRect(ctx, p.x, p.y, PAD_W, PAD_H, 7);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.15)";
        roundRect(ctx, p.x + 6, p.y + 3, PAD_W - 12, 4, 2);
        ctx.fill();
      }

      // turtle (simple top-down)
      ctx.save();
      ctx.translate(run.x, run.y);
      ctx.fillStyle = "#2e9e63";
      ctx.beginPath();
      ctx.arc(0, 0, TURTLE_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#47c481";
      ctx.beginPath();
      ctx.arc(0, 0, TURTLE_R * 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#7fcf9b";
      ctx.beginPath();
      ctx.arc(0, -TURTLE_R - 3, 7, 0, Math.PI * 2); // head
      ctx.fill();
      ctx.restore();

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [phase, finish]);

  // device tilt steering
  useEffect(() => {
    if (phase !== "playing") return;
    const onTilt = (e: DeviceOrientationEvent) => {
      const gamma = e.gamma ?? 0; // left/right tilt in degrees
      tiltRef.current = Math.max(-1, Math.min(1, gamma / 30));
    };
    window.addEventListener("deviceorientation", onTilt);
    return () => window.removeEventListener("deviceorientation", onTilt);
  }, [phase]);

  // tap-side steering (works without tilt permission)
  const press = useCallback((dir: number) => {
    dirRef.current = dir;
  }, []);
  const release = useCallback(() => {
    dirRef.current = 0;
  }, []);

  return (
    <div className={styles.overlay}>
      <div className={styles.frame}>
        <div className={styles.top}>
          <span className={styles.score}>▲ {score}</span>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className={styles.stage}>
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            className={styles.canvas}
          />

          {phase === "playing" && (
            <>
              <button
                className={styles.touchLeft}
                onPointerDown={() => press(-1)}
                onPointerUp={release}
                onPointerLeave={release}
                aria-label="Left"
              />
              <button
                className={styles.touchRight}
                onPointerDown={() => press(1)}
                onPointerUp={release}
                onPointerLeave={release}
                aria-label="Right"
              />
            </>
          )}

          {phase === "ready" && (
            <div className={styles.panel}>
              <h2 className={styles.title}>TURTLE JUMP</h2>
              <p className={styles.hint}>
                Bounce up the lily pads. Tilt your phone, or hold the left and
                right sides of the screen to steer.
              </p>
              <button className={styles.play} onClick={start}>
                Start climbing
              </button>
            </div>
          )}

          {phase === "over" && (
            <div className={styles.panel}>
              <h2 className={styles.title}>Splash! 🌊</h2>
              <p className={styles.big}>▲ {score}</p>
              <p className={styles.hint}>
                {submitting
                  ? "Saving your climb…"
                  : earned && earned > 0
                    ? `+${earned} XP for your turtle`
                    : "No XP left today, but nice climb!"}
              </p>
              <div className={styles.row}>
                <button className={styles.play} onClick={start}>
                  Again
                </button>
                <button className={styles.ghost} onClick={onClose}>
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
