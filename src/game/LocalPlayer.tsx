import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useMutation } from "convex/react";
import * as THREE from "three";
import { api } from "../../convex/_generated/api";
import { Character } from "./Character";
import { heightAt, normalAt } from "./terrain";
import { useGame, timeOfDay } from "./store";
import { playerPosRef } from "./sharedRefs";
import { getDeviceId } from "../lib/ids";
import {
  SPAWN, PEAKS, CAMPFIRE, PLAY_RADIUS,
  WALK_SPEED, RUN_SPEED, CLIMB_SPEED, JUMP_VEL, GRAVITY, SCRAMBLE_NY, BLOCK_NY,
  STAMINA_RUN_DRAIN, STAMINA_SCRAMBLE_DRAIN, STAMINA_CLIMB_DRAIN, STAMINA_JUMP_COST,
  STAMINA_REGEN_IDLE, STAMINA_REGEN_WALK, CAMPFIRE_REGEN_MULT, CAMPFIRE_RADIUS,
  SEND_MIN_INTERVAL_MS, IDLE_HEARTBEAT_MS,
} from "./config";

const CAM_DIST = 5.4;
const REGISTER_RADIUS = 4;

export function LocalPlayer() {
  const group = useRef<THREE.Group>(null!);
  const keys = useRef<Record<string, boolean>>({});
  // camera yaw: 0 puts the camera at +z looking toward the peak (−z)
  const yaw = useRef(0);
  const pitch = useRef(0.32);
  const vy = useRef(0);
  const grounded = useRef(true);
  const heading = useRef(Math.PI);
  const speedRef = useRef(0);
  const stamina = useRef(100);
  const anim = useRef("idle");
  const waveUntil = useRef(0);
  const lamp = useRef<THREE.SpotLight>(null!);
  const lampTarget = useRef<THREE.Object3D>(null!);
  const lastSent = useRef({ t: 0, x: 0, y: 0, z: 0, rotY: 0, anim: "idle" });

  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const move = useMutation(api.players.move);
  const deviceId = useMemo(getDeviceId, []);

  const setStamina = useGame((s) => s.setStamina);
  const setResting = useGame((s) => s.setResting);
  const setPrompt = useGame((s) => s.setPrompt);
  const setPointerLocked = useGame((s) => s.setPointerLocked);
  const setActivePeak = useGame((s) => s.setActivePeak);
  const resumeAt = useGame((s) => s.resumeAt);

  const pos = useRef(
    new THREE.Vector3(
      resumeAt?.x ?? SPAWN.x,
      0,
      resumeAt?.z ?? SPAWN.z
    )
  );
  if (resumeAt) {
    heading.current = resumeAt.rotY;
    yaw.current = resumeAt.rotY + Math.PI; // camera behind the hiker
  }

  // input + pointer lock
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      keys.current[e.code] = true;
      if (e.code === "KeyE") {
        const near = PEAKS.find(
          (pk) => Math.hypot(pos.current.x - pk.x, pos.current.z - pk.z) < REGISTER_RADIUS
        );
        if (near) {
          setActivePeak(near.id);
          document.exitPointerLock();
        }
      }
      if (e.code === "KeyQ") waveUntil.current = performance.now() + 1900;
      if (e.code === "Escape") setActivePeak(null);
    };
    const up = (e: KeyboardEvent) => (keys.current[e.code] = false);
    const click = () => {
      if (!useGame.getState().activePeak) gl.domElement.requestPointerLock();
    };
    const lockChange = () => setPointerLocked(document.pointerLockElement === gl.domElement);
    const mouse = (e: MouseEvent) => {
      if (document.pointerLockElement !== gl.domElement) return;
      yaw.current -= e.movementX * 0.0023;
      pitch.current = THREE.MathUtils.clamp(pitch.current + e.movementY * 0.0021, -0.4, 1.1);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("mousemove", mouse);
    document.addEventListener("pointerlockchange", lockChange);
    gl.domElement.addEventListener("click", click);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("mousemove", mouse);
      document.removeEventListener("pointerlockchange", lockChange);
      gl.domElement.removeEventListener("click", click);
    };
  }, [gl, setPointerLocked, setActivePeak]);

  // wire the spotlight to its target object (both exist after first mount)
  useEffect(() => {
    lamp.current.target = lampTarget.current;
  }, []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const k = keys.current;
    const p = pos.current;

    if (import.meta.env.DEV) {
      const w = window as unknown as Record<string, unknown>;
      // automation hook: window.__tbLook = {yaw, pitch} steers the camera
      const look = w.__tbLook as { yaw?: number; pitch?: number } | undefined;
      if (look) {
        if (look.yaw !== undefined) yaw.current = look.yaw;
        if (look.pitch !== undefined) pitch.current = look.pitch;
      }
      // automation hook: window.__tbWarp = {x, z} teleports (consumed once)
      const warp = w.__tbWarp as { x: number; z: number } | undefined;
      if (warp) {
        p.set(warp.x, heightAt(warp.x, warp.z), warp.z);
        vy.current = 0;
        w.__tbWarp = undefined;
      }
    }

    // --- movement intent (camera-relative) ---
    let ix = 0;
    let iz = 0;
    if (k.KeyW) iz -= 1;
    if (k.KeyS) iz += 1;
    if (k.KeyA) ix -= 1;
    if (k.KeyD) ix += 1;
    const hasInput = (ix !== 0 || iz !== 0) && !useGame.getState().activePeak;

    const wantRun = !!k.ShiftLeft || !!k.ShiftRight;
    const canRun = stamina.current > 0.5;
    let speed = hasInput ? (wantRun && canRun ? RUN_SPEED : WALK_SPEED) : 0;

    // --- slope tiers ---
    const nY = normalAt(p.x, p.z).y;
    let scrambling = false;
    let climbing = false;
    if (hasInput && speed > 0) {
      const sin = Math.sin(yaw.current);
      const cos = Math.cos(yaw.current);
      let dx = (ix * cos + iz * sin) * speed * dt;
      let dz = (-ix * sin + iz * cos) * speed * dt;

      const aheadX = p.x + dx * 6;
      const aheadZ = p.z + dz * 6;
      const aheadNY = normalAt(aheadX, aheadZ).y;
      const uphill = heightAt(aheadX, aheadZ) > heightAt(p.x, p.z);

      if (uphill && aheadNY < BLOCK_NY) {
        if (stamina.current > 1 && grounded.current) {
          // climbing: slow, expensive, possible only while stamina lasts
          climbing = true;
          const scale = (CLIMB_SPEED * dt) / Math.hypot(dx, dz);
          dx *= scale;
          dz *= scale;
          speed = CLIMB_SPEED;
        } else {
          // no strength left — no purchase on the rock
          dx = 0;
          dz = 0;
          speed = 0;
        }
      } else if (uphill && aheadNY < SCRAMBLE_NY) {
        scrambling = true;
        dx *= 0.45;
        dz *= 0.45;
        speed *= 0.45;
      }

      let nx = p.x + dx;
      let nz = p.z + dz;
      // soft world boundary (the rim does most of the work)
      const r = Math.hypot(nx, nz);
      if (r > PLAY_RADIUS) {
        nx *= PLAY_RADIUS / r;
        nz *= PLAY_RADIUS / r;
      }
      p.x = nx;
      p.z = nz;

      if (speed > 0) {
        const targetHeading = Math.atan2(dx, dz);
        let dh = targetHeading - heading.current;
        while (dh > Math.PI) dh -= Math.PI * 2;
        while (dh < -Math.PI) dh += Math.PI * 2;
        heading.current += dh * Math.min(1, dt * 12);
      }
    }
    speedRef.current = speed;

    // --- vertical: gravity, jump, ground snap ---
    const ground = heightAt(p.x, p.z);
    if (k.Space && grounded.current && stamina.current >= STAMINA_JUMP_COST && nY > BLOCK_NY) {
      vy.current = JUMP_VEL;
      grounded.current = false;
      stamina.current -= STAMINA_JUMP_COST;
    }
    vy.current -= GRAVITY * dt;
    p.y += vy.current * dt;
    if (p.y <= ground) {
      p.y = ground;
      vy.current = 0;
      grounded.current = true;
    }

    // --- stamina ---
    const nearFire = Math.hypot(p.x - CAMPFIRE.x, p.z - CAMPFIRE.z) < CAMPFIRE_RADIUS;
    let ds = 0;
    if (speed > WALK_SPEED + 0.1) ds -= STAMINA_RUN_DRAIN;
    if (scrambling) ds -= STAMINA_SCRAMBLE_DRAIN;
    if (climbing) ds -= STAMINA_CLIMB_DRAIN;
    if (ds === 0) {
      ds = hasInput ? STAMINA_REGEN_WALK : STAMINA_REGEN_IDLE;
      if (nearFire) ds *= CAMPFIRE_REGEN_MULT;
    }
    stamina.current = THREE.MathUtils.clamp(stamina.current + ds * dt, 0, 100);
    setStamina(stamina.current);
    setResting(nearFire && !hasInput);

    // --- anim state ---
    anim.current = climbing
      ? "climb"
      : !grounded.current
        ? "jump"
        : speed > WALK_SPEED + 0.1
          ? "run"
          : speed > 0.1
            ? "walk"
            : performance.now() < waveUntil.current
              ? "wave"
              : "idle";

    // --- visuals ---
    group.current.position.copy(p);
    group.current.rotation.y = heading.current;
    playerPosRef.current = { x: p.x, y: p.y, z: p.z };

    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__tb = {
        x: p.x, y: p.y, z: p.z,
        stamina: stamina.current, anim: anim.current, speed, nY,
        keys: { ...keys.current },
      };
    }

    // --- camera ---
    const cx = p.x + Math.sin(yaw.current) * Math.cos(pitch.current) * CAM_DIST;
    const cz = p.z + Math.cos(yaw.current) * Math.cos(pitch.current) * CAM_DIST;
    const cy = p.y + 1.6 + Math.sin(pitch.current) * CAM_DIST;
    const camGround = heightAt(cx, cz) + 0.45;
    camera.position.set(cx, Math.max(cy, camGround), cz);
    camera.lookAt(p.x, p.y + 1.45, p.z);

    // --- headlamp: on through dusk, night and dawn ---
    const elev = Math.sin((timeOfDay(useGame.getState().clock) - 0.25) * Math.PI * 2);
    const lampOn = elev < 0.06;
    lamp.current.visible = lampOn;
    if (lampOn) {
      lampTarget.current.position.set(
        p.x - Math.sin(heading.current) * -8,
        heightAt(p.x - Math.sin(heading.current) * -8, p.z - Math.cos(heading.current) * -8) + 1,
        p.z - Math.cos(heading.current) * -8
      );
      lamp.current.position.set(p.x, p.y + 1.45, p.z);
    }

    // --- interaction prompt ---
    const nearPeak = PEAKS.find(
      (pk) => Math.hypot(p.x - pk.x, p.z - pk.z) < REGISTER_RADIUS
    );
    setPrompt(
      nearPeak && !useGame.getState().activePeak
        ? `Press E — sign the ${nearPeak.name} register`
        : null
    );

    // --- network sync: ~5 Hz while moving, slow heartbeat while idle ---
    const now = performance.now();
    const ls = lastSent.current;
    const movedEnough =
      Math.hypot(p.x - ls.x, p.y - ls.y, p.z - ls.z) > 0.3 ||
      Math.abs(heading.current - ls.rotY) > 0.2 ||
      anim.current !== ls.anim;
    const due = now - ls.t > (movedEnough ? SEND_MIN_INTERVAL_MS : IDLE_HEARTBEAT_MS);
    if (due && (movedEnough || now - ls.t > IDLE_HEARTBEAT_MS)) {
      lastSent.current = {
        t: now, x: p.x, y: p.y, z: p.z, rotY: heading.current, anim: anim.current,
      };
      void move({
        deviceId, x: p.x, y: p.y, z: p.z, rotY: heading.current, anim: anim.current,
      });
    }
  });

  const profile = useGame((s) => s.profile)!;

  return (
    <>
      <group ref={group}>
        <Character
          colors={profile.colors}
          hatStyle={profile.hatStyle}
          anim={anim.current}
          speedRef={speedRef}
        />
      </group>
      {/* headlamp: world-space spotlight, only visible when dark */}
      <spotLight
        ref={lamp}
        visible={false}
        color="#ffe9bd"
        intensity={60}
        angle={0.45}
        penumbra={0.6}
        distance={30}
        decay={1.6}
      />
      <object3D ref={lampTarget} />
    </>
  );
}
