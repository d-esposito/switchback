import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useGame, timeOfDay, type Colors } from "./store";

interface CharacterProps {
  colors: Colors;
  hatStyle: string;
  /** "idle" | "walk" | "run" | "jump" | "climb" | "wave" */
  anim: string;
  /**
   * Live anim override read every frame. The local player animates via refs
   * without re-rendering, so without this its Character would be stuck on the
   * mount-time anim prop (waves/jumps visible to everyone but yourself).
   */
  animRef?: React.RefObject<string>;
  /** Optional: live speed for foot-sync; falls back to anim presets */
  speedRef?: React.RefObject<number>;
}

const ANIM_SPEED: Record<string, number> = {
  idle: 0, walk: 4.3, run: 7.6, jump: 2, climb: 2.2, wave: 0,
};

// rest height of the torso group; legs pivot at the hip just below it
const BODY_Y = 0.78;

/**
 * Procedural low-poly hiker, ~1.5m tall, feet at local origin.
 * All limbs are animated in code so we ship zero model assets.
 */
export function Character({ colors, hatStyle, anim, animRef, speedRef }: CharacterProps) {
  const legL = useRef<THREE.Group>(null!);
  const legR = useRef<THREE.Group>(null!);
  const armL = useRef<THREE.Group>(null!);
  const armR = useRef<THREE.Group>(null!);
  const body = useRef<THREE.Group>(null!);
  const lampDot = useRef<THREE.Mesh>(null!);
  const phase = useRef(Math.random() * 10);

  useFrame((_, dt) => {
    const a = animRef?.current ?? anim;
    const speed = speedRef?.current ?? ANIM_SPEED[a] ?? 0;
    const moving = speed > 0.3 && a !== "jump" && a !== "climb" && a !== "wave";
    phase.current += dt * (moving ? 2.1 * speed : 2.5);
    const p = phase.current;

    // headlamp dot glows from dusk to dawn for every hiker
    const elev = Math.sin((timeOfDay(useGame.getState().clock) - 0.25) * Math.PI * 2);
    lampDot.current.visible = elev < 0.06;

    // wave is the only anim that twists the arm sideways — relax it otherwise
    if (a !== "wave") {
      armR.current.rotation.z = THREE.MathUtils.lerp(armR.current.rotation.z, 0, 0.2);
    }

    if (a === "climb") {
      // alternating overhead reaches
      armL.current.rotation.x = -2.5 + Math.sin(p) * 0.5;
      armR.current.rotation.x = -2.5 + Math.sin(p + Math.PI) * 0.5;
      legL.current.rotation.x = 0.5 + Math.sin(p + Math.PI) * 0.3;
      legR.current.rotation.x = 0.5 + Math.sin(p) * 0.3;
      body.current.position.y = BODY_Y;
    } else if (a === "wave") {
      armR.current.rotation.x = -2.7;
      armR.current.rotation.z = Math.sin(p * 3.2) * 0.45;
      armL.current.rotation.x = THREE.MathUtils.lerp(armL.current.rotation.x, 0, 0.15);
      legL.current.rotation.x = THREE.MathUtils.lerp(legL.current.rotation.x, 0, 0.1);
      legR.current.rotation.x = THREE.MathUtils.lerp(legR.current.rotation.x, 0, 0.1);
      body.current.position.y = BODY_Y;
    } else if (a === "jump") {
      legL.current.rotation.x = THREE.MathUtils.lerp(legL.current.rotation.x, 0.55, 0.2);
      legR.current.rotation.x = THREE.MathUtils.lerp(legR.current.rotation.x, -0.35, 0.2);
      armL.current.rotation.x = THREE.MathUtils.lerp(armL.current.rotation.x, -2.4, 0.15);
      armR.current.rotation.x = THREE.MathUtils.lerp(armR.current.rotation.x, -2.4, 0.15);
      body.current.position.y = BODY_Y;
    } else if (moving) {
      const amp = Math.min(0.75, 0.2 + speed * 0.07);
      legL.current.rotation.x = Math.sin(p) * amp;
      legR.current.rotation.x = Math.sin(p + Math.PI) * amp;
      armL.current.rotation.x = Math.sin(p + Math.PI) * amp * 0.8;
      armR.current.rotation.x = Math.sin(p) * amp * 0.8;
      body.current.position.y = BODY_Y + Math.abs(Math.sin(p)) * 0.04;
    } else {
      const sway = Math.sin(p * 0.6) * 0.05;
      legL.current.rotation.x = THREE.MathUtils.lerp(legL.current.rotation.x, 0, 0.1);
      legR.current.rotation.x = THREE.MathUtils.lerp(legR.current.rotation.x, 0, 0.1);
      armL.current.rotation.x = sway;
      armR.current.rotation.x = -sway;
      body.current.position.y = BODY_Y + Math.sin(p * 0.6) * 0.012;
    }
  });

  return (
    <group>
      {/* legs pivot at hip height */}
      <group ref={legL} position={[-0.11, 0.64, 0]}>
        <mesh position={[0, -0.32, 0]}>
          <boxGeometry args={[0.15, 0.64, 0.17]} />
          <meshStandardMaterial color={colors.pants} flatShading />
        </mesh>
      </group>
      <group ref={legR} position={[0.11, 0.64, 0]}>
        <mesh position={[0, -0.32, 0]}>
          <boxGeometry args={[0.15, 0.64, 0.17]} />
          <meshStandardMaterial color={colors.pants} flatShading />
        </mesh>
      </group>

      {/* torso + head + hat + pack move together */}
      <group ref={body} position={[0, BODY_Y, 0]}>
        {/* pelvis bridges the hip pivots so legs and torso read as one body */}
        <mesh position={[0, -0.05, 0]}>
          <boxGeometry args={[0.36, 0.24, 0.24]} />
          <meshStandardMaterial color={colors.pants} flatShading />
        </mesh>
        <mesh position={[0, 0.26, 0]}>
          <boxGeometry args={[0.44, 0.52, 0.28]} />
          <meshStandardMaterial color={colors.shirt} flatShading />
        </mesh>

        {/* arms pivot at shoulders */}
        <group ref={armL} position={[-0.28, 0.42, 0]}>
          <mesh position={[0, -0.24, 0]}>
            <boxGeometry args={[0.11, 0.5, 0.13]} />
            <meshStandardMaterial color={colors.shirt} flatShading />
          </mesh>
        </group>
        <group ref={armR} position={[0.28, 0.42, 0]}>
          <mesh position={[0, -0.24, 0]}>
            <boxGeometry args={[0.11, 0.5, 0.13]} />
            <meshStandardMaterial color={colors.shirt} flatShading />
          </mesh>
        </group>

        {/* head */}
        <mesh position={[0, 0.66, 0]}>
          <sphereGeometry args={[0.17, 12, 10]} />
          <meshStandardMaterial color={colors.skin} flatShading />
        </mesh>

        {/* headlamp dot — visible across the valley at night */}
        <mesh ref={lampDot} position={[0, 0.7, 0.16]} visible={false}>
          <boxGeometry args={[0.09, 0.05, 0.05]} />
          <meshStandardMaterial
            color="#fff3c8"
            emissive="#ffe9a8"
            emissiveIntensity={3.5}
          />
        </mesh>

        {/* hat */}
        {hatStyle === "cap" && (
          <group position={[0, 0.78, 0]}>
            <mesh>
              <cylinderGeometry args={[0.155, 0.165, 0.1, 10]} />
              <meshStandardMaterial color={colors.hat} flatShading />
            </mesh>
            <mesh position={[0, -0.02, 0.16]} rotation={[0.12, 0, 0]}>
              <boxGeometry args={[0.2, 0.03, 0.16]} />
              <meshStandardMaterial color={colors.hat} flatShading />
            </mesh>
          </group>
        )}
        {hatStyle === "beanie" && (
          <mesh position={[0, 0.78, 0]}>
            <sphereGeometry args={[0.165, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
            <meshStandardMaterial color={colors.hat} flatShading />
          </mesh>
        )}

        {/* backpack */}
        <mesh position={[0, 0.26, -0.21]}>
          <boxGeometry args={[0.32, 0.4, 0.15]} />
          <meshStandardMaterial color={colors.pack} flatShading />
        </mesh>
        <mesh position={[0, 0.05, -0.2]}>
          <boxGeometry args={[0.26, 0.1, 0.12]} />
          <meshStandardMaterial color={colors.pack} flatShading />
        </mesh>
      </group>
    </group>
  );
}
