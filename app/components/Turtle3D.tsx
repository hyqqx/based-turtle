"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";

/* ------------------------------------------------------------------ */
/*  Low-poly turtle built from primitives. No external model files,    */
/*  no AI art: just geometry, matte materials and soft lighting.       */
/*  Grows smoothly when `level` increases.                             */
/* ------------------------------------------------------------------ */

const SHELL = "#2E9E63";
const SHELL_DARK = "#1F7A4A";
const SHELL_SPOT = "#47C481";
const SKIN = "#7FCF9B";
const SKIN_DARK = "#5FB37E";

function Flipper({
  position,
  rotation,
  scale = 1,
}: {
  position: [number, number, number];
  rotation: [number, number, number];
  scale?: number;
}) {
  return (
    <mesh position={position} rotation={rotation} scale={scale} castShadow>
      <capsuleGeometry args={[0.16, 0.42, 4, 8]} />
      <meshStandardMaterial color={SKIN} roughness={0.7} />
    </mesh>
  );
}

function TurtleMesh({ level }: { level: number }) {
  const group = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);

  // Target scale grows with level, eased toward on every frame so a
  // level-up reads as the turtle physically growing.
  const targetScale = useMemo(() => Math.min(0.7 + level * 0.045, 1.35), [level]);
  const current = useRef(targetScale);

  // Spot pattern on the shell, computed once.
  const spots = useMemo(() => {
    const out: [number, number, number][] = [];
    const ring = 6;
    for (let i = 0; i < ring; i++) {
      const a = (i / ring) * Math.PI * 2;
      out.push([Math.cos(a) * 0.62, 0.28, Math.sin(a) * 0.62]);
    }
    out.push([0, 0.46, 0]);
    return out;
  }, []);

  useFrame((stateFrame, delta) => {
    current.current += (targetScale - current.current) * Math.min(1, delta * 4);
    if (group.current) {
      group.current.scale.setScalar(current.current);
      // gentle bob + sway, like floating in water
      const t = stateFrame.clock.elapsedTime;
      group.current.position.y = Math.sin(t * 1.4) * 0.06;
      group.current.rotation.z = Math.sin(t * 0.8) * 0.04;
      group.current.rotation.y = Math.sin(t * 0.5) * 0.12;
    }
    if (head.current) {
      const t = stateFrame.clock.elapsedTime;
      head.current.rotation.x = Math.sin(t * 1.1) * 0.08;
    }
  });

  return (
    <group ref={group}>
      {/* shell top: squashed sphere */}
      <mesh position={[0, 0.15, 0]} scale={[1, 0.62, 1]} castShadow>
        <sphereGeometry args={[0.9, 32, 24]} />
        <meshStandardMaterial color={SHELL} roughness={0.55} />
      </mesh>
      {/* shell rim */}
      <mesh position={[0, 0.02, 0]} scale={[1, 0.4, 1]}>
        <sphereGeometry args={[0.94, 32, 12]} />
        <meshStandardMaterial color={SHELL_DARK} roughness={0.6} />
      </mesh>
      {/* belly */}
      <mesh position={[0, -0.12, 0]} scale={[1, 0.32, 1]}>
        <sphereGeometry args={[0.86, 24, 12]} />
        <meshStandardMaterial color={SKIN_DARK} roughness={0.8} />
      </mesh>
      {/* spots */}
      {spots.map((p, i) => (
        <mesh key={i} position={p} scale={[1, 0.5, 1]}>
          <sphereGeometry args={[0.17, 12, 8]} />
          <meshStandardMaterial color={SHELL_SPOT} roughness={0.5} />
        </mesh>
      ))}

      {/* head */}
      <group ref={head} position={[0, 0.12, 0.92]}>
        <mesh castShadow>
          <sphereGeometry args={[0.34, 24, 20]} />
          <meshStandardMaterial color={SKIN} roughness={0.7} />
        </mesh>
        {/* eyes */}
        <mesh position={[-0.14, 0.08, 0.24]}>
          <sphereGeometry args={[0.06, 12, 12]} />
          <meshStandardMaterial color="#0d1b2a" roughness={0.3} />
        </mesh>
        <mesh position={[0.14, 0.08, 0.24]}>
          <sphereGeometry args={[0.06, 12, 12]} />
          <meshStandardMaterial color="#0d1b2a" roughness={0.3} />
        </mesh>
      </group>

      {/* four flippers */}
      <Flipper position={[-0.72, -0.05, 0.5]} rotation={[0, 0.5, -0.5]} />
      <Flipper position={[0.72, -0.05, 0.5]} rotation={[0, -0.5, 0.5]} />
      <Flipper position={[-0.72, -0.05, -0.5]} rotation={[0, -0.5, -0.5]} />
      <Flipper position={[0.72, -0.05, -0.5]} rotation={[0, 0.5, 0.5]} />

      {/* tail */}
      <mesh position={[0, 0, -0.95]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.12, 0.34, 8]} />
        <meshStandardMaterial color={SKIN_DARK} roughness={0.8} />
      </mesh>
    </group>
  );
}

export default function Turtle3D({ level = 1 }: { level?: number }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    // WebGL unavailable: fall back to the emoji so the game still works.
    return (
      <span style={{ fontSize: Math.min(72 + level * 6, 168), lineHeight: 1 }}>
        🐢
      </span>
    );
  }

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [0, 1.1, 3.4], fov: 42 }}
      style={{ width: "100%", height: "100%" }}
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0);
      }}
      onError={() => setFailed(true)}
    >
      <ambientLight intensity={0.65} />
      <directionalLight
        position={[3, 5, 4]}
        intensity={1.3}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <directionalLight position={[-4, 2, -2]} intensity={0.35} color="#4cc9f0" />
      <TurtleMesh level={level} />
      {/* soft shadow catcher */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.55, 0]}
        receiveShadow
      >
        <circleGeometry args={[2, 32]} />
        <shadowMaterial opacity={0.18} />
      </mesh>
    </Canvas>
  );
}
