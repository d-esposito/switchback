import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useMutation } from "convex/react";
import * as THREE from "three";
import { api } from "../../convex/_generated/api";
import { Character } from "./Character";
import { heightAt, meshHeightAt, normalAt } from "./terrain";
import { useGame, timeOfDay, showToast } from "./store";
import { weatherAt } from "./weather";
import { net } from "./net";
import { playerPosRef, resourceNodesRef, resourceVersionRef, ropesRef, tentsRef, stepRef, teleportRef, planeRef, tvRef } from "./sharedRefs";
import { isAvailable, collect, type ResourceNode } from "./resources";
import { getDeviceId } from "../lib/ids";
import {
  SPAWN, PEAKS, ZONES, PLAY_RADIUS,
  WALK_SPEED, RUN_SPEED, CLIMB_SPEED, JUMP_VEL, GRAVITY, SCRAMBLE_NY, BLOCK_NY,
  STAMINA_RUN_DRAIN, STAMINA_SCRAMBLE_DRAIN, STAMINA_CLIMB_DRAIN, STAMINA_JUMP_COST,
  STAMINA_REGEN_IDLE, STAMINA_REGEN_WALK, CAMPFIRE_REGEN_MULT, CAMPFIRE_RADIUS,
  SEND_MIN_INTERVAL_MS,
  BOARD_TURN, BOARD_GRIP, BOARD_BRAKE_GRIP, BOARD_DRAG, BOARD_DRAG_TUCK,
  BOARD_DRAG_BRAKE, BOARD_MAX_SPEED, BOARD_OLLIE_VEL, BOARD_AIRBORNE_GAP,
} from "./config";

const CAM_DIST = 5.4;
const REGISTER_RADIUS = 4;
const GATHER_RADIUS = 2.5;
const ROPE_ASSIST_RADIUS = 5;
const TENT_AURA_RADIUS = 5;

const KIND_LABEL: Record<ResourceNode["kind"], string> = {
  sticks: "a stick",
  stones: "a stone",
  thatch: "thatch",
};

function nearestNode(x: number, z: number): ResourceNode | null {
  let best: ResourceNode | null = null;
  let bestD = GATHER_RADIUS;
  for (const n of resourceNodesRef.current) {
    if (!isAvailable(n)) continue;
    const d = Math.hypot(n.x - x, n.z - z);
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return best;
}

function nearAny(list: { x: number; z: number }[], x: number, z: number, r: number): boolean {
  return list.some((p) => Math.hypot(p.x - x, p.z - z) < r);
}

const TAU = Math.PI * 2;
function angWrap(a: number): number {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}
/** frame-rate-independent exponential approach of a toward b */
function damp(a: number, b: number, lambda: number, dt: number): number {
  return a + (b - a) * (1 - Math.exp(-lambda * dt));
}
// scratch vectors for the snowboard physics (avoid per-frame allocation)
const bN = new THREE.Vector3();
const bFwd = new THREE.Vector3();
const bLat = new THREE.Vector3();

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
  const flying = useRef(false);
  // snowboard: gravity-fed carving down the fall line. boardVel is the full
  // 3D velocity (constrained onto the slope plane each frame).
  const boarding = useRef(false);
  const boardVel = useRef(new THREE.Vector3());
  const tuckP = useRef(0); // 0..1 eased tuck amount
  const boardStopT = useRef(0); // time spent stopped, for auto-dismount
  // live pose signals for the local rider's Character (lean/tuck/brake)
  const boardAnim = useRef({ lean: 0, tuck: 0, brake: 0 });
  const stepPhase = useRef(0);
  const lamp = useRef<THREE.SpotLight>(null!);
  const lampTarget = useRef<THREE.Object3D>(null!);
  const lastSent = useRef({ t: 0, x: 0, y: 0, z: 0, rotY: 0, anim: "idle" });

  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const gatherMut = useMutation(api.crafting.gather);
  const placeRopeMut = useMutation(api.crafting.placeRope);
  const placeTentMut = useMutation(api.crafting.placeTent);
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
      const state = useGame.getState();
      // the command bar (and other panels) own the keyboard while open
      if (state.commandOpen) {
        keys.current = {};
        return;
      }
      keys.current[e.code] = true;
      const p = pos.current;

      if (e.code === "KeyE") {
        // hop out of / into the plane first
        if (flying.current) {
          flying.current = false;
          planeRef.parked = { x: p.x + 3, z: p.z, rot: heading.current };
          showToast("You hop out. The plane waits politely.");
          return;
        }
        const parked = planeRef.parked;
        if (parked && Math.hypot(p.x - parked.x, p.z - parked.z) < 4) {
          flying.current = true;
          boarding.current = false;
          planeRef.parked = null;
          showToast("Contact! W boost · S slow · mouse steers · E to hop out");
          return;
        }
        const tv = tvRef.current;
        if (tv) {
          tv.act();
          return;
        }
        const near = PEAKS.find(
          (pk) => Math.hypot(p.x - pk.x, p.z - pk.z) < REGISTER_RADIUS
        );
        if (near) {
          setActivePeak(near.id);
          document.exitPointerLock();
          return;
        }
        const node = nearestNode(p.x, p.z);
        if (node) {
          collect(node);
          resourceVersionRef.current += 1;
          void gatherMut({ deviceId, kind: node.kind });
          showToast(`Gathered ${KIND_LABEL[node.kind]}.`);
        }
      }
      if (e.code === "KeyC") {
        const atCamp =
          ZONES.some(
            (zn) => Math.hypot(p.x - zn.camp.x, p.z - zn.camp.z) < CAMPFIRE_RADIUS
          ) || nearAny(tentsRef.current, p.x, p.z, TENT_AURA_RADIUS);
        if (atCamp) {
          state.setCraftOpen(true);
          document.exitPointerLock();
        } else {
          showToast("Find a campfire or tent to craft.");
        }
      }
      if (e.code === "KeyR") {
        if (state.gear.ropes < 1) {
          showToast("No rope coils — craft one at a campfire (1 stick + 4 thatch).");
        } else if (normalAt(p.x, p.z).y >= SCRAMBLE_NY) {
          showToast("Ropes anchor on steep ground — find a slope.");
        } else {
          void placeRopeMut({ deviceId, x: p.x, y: p.y, z: p.z });
          showToast("Fixed line placed. Any hiker can use it.");
        }
      }
      if (e.code === "KeyT") {
        if (state.gear.tents < 1) {
          showToast("No tent — craft one at a campfire (5 sticks + 4 thatch).");
        } else if (normalAt(p.x, p.z).y < 0.82) {
          showToast("Too steep to pitch a tent here.");
        } else {
          void placeTentMut({ deviceId, x: p.x, y: p.y, z: p.z });
          showToast("Tent pitched — a camp for every hiker.");
        }
      }
      // Space (rising edge only): drop in / ollie / step off the snowboard.
      // The plain ground jump stays polled in the frame loop below.
      if (e.code === "Space" && !e.repeat && !flying.current) {
        const bv = boardVel.current;
        if (boarding.current) {
          if (grounded.current) {
            // ollie while riding — pop straight up, keep momentum
            bv.y = BOARD_OLLIE_VEL;
            grounded.current = false;
          } else {
            // pressed again mid-air → step off and land on your feet
            boarding.current = false;
            vy.current = bv.y; // hand vertical momentum to the walk controller
            showToast("You pull the board off and land on your feet.");
          }
        } else if (!grounded.current && state.gear.snowboard) {
          // mid-jump drop-in: a little extra pop, then start carving downhill
          boarding.current = true;
          boardStopT.current = 0;
          tuckP.current = 0;
          const n = normalAt(p.x, p.z);
          const dmag = Math.hypot(n.x, n.z);
          if (dmag > 0.02) {
            heading.current = Math.atan2(n.x, n.z); // point down the fall line
            bv.set((n.x / dmag) * 6, 4, (n.z / dmag) * 6);
          } else {
            bv.set(Math.sin(heading.current) * 5, 4, Math.cos(heading.current) * 5);
          }
          showToast("🏂 Drop in! A/D carve · W tuck · S brake/slide · space ollie · space mid-air to step off");
        }
      }
      if (e.code === "KeyQ") waveUntil.current = performance.now() + 1900;
      if (e.code === "Escape") {
        if (state.activePeak || state.craftOpen) {
          setActivePeak(null);
          state.setCraftOpen(false);
        } else {
          state.setSettingsOpen(!state.settingsOpen);
        }
      }
    };
    const up = (e: KeyboardEvent) => (keys.current[e.code] = false);
    const click = () => {
      const s = useGame.getState();
      if (!s.activePeak && !s.craftOpen) gl.domElement.requestPointerLock();
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
  }, [gl, setPointerLocked, setActivePeak, deviceId, gatherMut, placeRopeMut, placeTentMut]);

  // wire the spotlight to its target object (both exist after first mount)
  useEffect(() => {
    lamp.current.target = lampTarget.current;
  }, []);

  // remember where we are so a reload in this tab resumes in place
  useEffect(() => {
    const save = () => {
      const p = playerPosRef.current;
      sessionStorage.setItem(
        "switchback:lastPos",
        JSON.stringify({ x: p.x, y: p.y, z: p.z, rotY: heading.current })
      );
    };
    const onHide = () => document.visibilityState === "hidden" && save();
    window.addEventListener("beforeunload", save);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("beforeunload", save);
      document.removeEventListener("visibilitychange", onHide);
    };
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
        p.set(warp.x, meshHeightAt(warp.x, warp.z), warp.z);
        vy.current = 0;
        boarding.current = false;
        w.__tbWarp = undefined;
      }
    }

    // slash-command effects (consumed once per frame)
    if (teleportRef.current) {
      const t = teleportRef.current;
      teleportRef.current = null;
      p.set(t.x, meshHeightAt(t.x, t.z), t.z);
      vy.current = 0;
      boarding.current = false;
    }
    if (teleportRef.launch > 0) {
      vy.current = teleportRef.launch;
      grounded.current = false;
      teleportRef.launch = 0;
    }
    if (teleportRef.refill) {
      stamina.current = 100;
      teleportRef.refill = false;
    }

    const ui = useGame.getState();
    let nearFire = false;
    let speed = 0;
    let nY = 1;

    if (flying.current) {
      // --- the /plane easter egg: arcade flight along the camera's aim ---
      const boost = k.KeyW ? 46 : k.KeyS ? 14 : 28;
      const cosP = Math.cos(pitch.current);
      const fx = -Math.sin(yaw.current) * cosP;
      const fy = -Math.sin(pitch.current);
      const fz = -Math.cos(yaw.current) * cosP;
      p.x += fx * boost * dt;
      p.y += fy * boost * dt;
      p.z += fz * boost * dt;
      const rr = Math.hypot(p.x, p.z);
      if (rr > PLAY_RADIUS) {
        p.x *= PLAY_RADIUS / rr;
        p.z *= PLAY_RADIUS / rr;
      }
      const gnd = meshHeightAt(p.x, p.z);
      if (p.y < gnd + 1.2) p.y = gnd + 1.2; // belly-skim, never crash
      if (p.y > 380) p.y = 380;
      heading.current = Math.atan2(fx, fz);
      speed = boost;
      speedRef.current = boost;
      grounded.current = false;
      vy.current = 0;
      anim.current = "fly";
      setResting(false);
      setStamina(stamina.current);
    } else if (boarding.current) {
      // --- snowboard: gravity down the fall line, edge-grip carving ----------
      const v = boardVel.current;
      const steer = (k.KeyA ? 1 : 0) - (k.KeyD ? 1 : 0);
      const tuck = !!(k.KeyW || k.ShiftLeft || k.ShiftRight);
      const braking = !!k.KeyS;
      tuckP.current = damp(tuckP.current, tuck ? 1 : 0, 8, dt);

      bN.copy(normalAt(p.x, p.z));
      const slopeMag = Math.hypot(bN.x, bN.z);

      // gravity, then cancel any velocity into the surface (stay on the slope)
      v.y -= GRAVITY * dt;
      if (grounded.current) {
        const vn = v.dot(bN);
        if (vn < 0) v.addScaledVector(bN, -vn);
      }

      let sp = v.length();
      // steering: turn slows with speed and while tucking; releasing the steer
      // straightens toward travel, then drifts back to the local fall line so
      // you can never hold a turn straight up the mountain
      const sRate = (BOARD_TURN / (1 + sp * 0.013)) * (1 - 0.45 * tuckP.current);
      heading.current += steer * sRate * dt;
      if (sp > 2 && Math.abs(steer) < 0.5) {
        const velYaw = Math.atan2(v.x, v.z);
        heading.current += angWrap(velYaw - heading.current) * Math.min(1, 4.5 * dt);
        if (slopeMag > 0.03) {
          const downYaw = Math.atan2(bN.x, bN.z);
          heading.current += angWrap(downYaw - heading.current) * Math.min(1, 0.7 * dt);
        }
      }
      // braking carves the board across the line of travel for a sideways skid
      if (braking && sp > 3) {
        const velYaw = Math.atan2(v.x, v.z);
        const side = boardAnim.current.lean >= 0 ? 1 : -1;
        heading.current += angWrap(velYaw + side * 1.1 - heading.current) * Math.min(1, 3 * dt);
      }
      heading.current = angWrap(heading.current);

      if (grounded.current) {
        // edge grip: forward speed is kept, lateral (sideways) speed bleeds off.
        // Braking loosens the edge, so momentum keeps sliding sideways — a skid.
        bFwd.set(Math.sin(heading.current), 0, Math.cos(heading.current));
        bFwd.addScaledVector(bN, -bFwd.dot(bN)).normalize();
        bLat.crossVectors(bN, bFwd).normalize();
        const vF = v.dot(bFwd);
        const vL = v.dot(bLat);
        const grip = braking ? BOARD_BRAKE_GRIP : BOARD_GRIP;
        const vL2 = vL * Math.exp(-grip * dt);
        v.copy(bFwd).multiplyScalar(vF).addScaledVector(bLat, vL2);

        // drag: tuck for speed, brake to scrub it hard
        let drag = braking ? BOARD_DRAG_BRAKE : tuck ? BOARD_DRAG_TUCK : BOARD_DRAG;
        sp = v.length();
        v.multiplyScalar(Math.max(0, 1 - drag * sp * dt));

        // anti-stall: a gentle nudge toward the local downhill so you never get
        // stuck in a dip — never along the heading, so you can't climb
        if (sp < 2.5 && slopeMag > 0.04) {
          v.x += bN.x * 6 * dt;
          v.z += bN.z * 6 * dt;
        }
      }

      // terminal speed
      sp = v.length();
      if (sp > BOARD_MAX_SPEED) {
        v.multiplyScalar(BOARD_MAX_SPEED / sp);
        sp = BOARD_MAX_SPEED;
      }

      // integrate, soft world boundary
      p.addScaledVector(v, dt);
      const rr = Math.hypot(p.x, p.z);
      if (rr > PLAY_RADIUS) {
        p.x *= PLAY_RADIUS / rr;
        p.z *= PLAY_RADIUS / rr;
      }

      // ground contact: snap to the surface, or leave it for air off a lip
      const gnd = meshHeightAt(p.x, p.z);
      if (grounded.current) {
        if (p.y - gnd > BOARD_AIRBORNE_GAP) grounded.current = false;
        else p.y = gnd;
      } else if (p.y <= gnd) {
        p.y = gnd;
        grounded.current = true;
        const vn = v.dot(bN); // land: shed the into-slope component
        if (vn < 0) v.addScaledVector(bN, -vn);
      }

      // carve lean follows the steer, scaled by speed; fed to the rider pose
      const leanTarget = steer * THREE.MathUtils.clamp(sp / 9, 0, 1);
      boardAnim.current.lean = damp(boardAnim.current.lean, leanTarget, 10, dt);
      boardAnim.current.tuck = tuckP.current;
      boardAnim.current.brake = damp(boardAnim.current.brake, braking ? 1 : 0, 10, dt);

      // chase cam eases to trail the board (mouse still overrides)
      yaw.current += angWrap(heading.current + Math.PI - yaw.current) * Math.min(1, dt * 2.5);

      // coast to a stop → step off automatically (no getting stuck)
      if (grounded.current && sp < 1.1) {
        boardStopT.current += dt;
        if (boardStopT.current > 0.5) {
          boarding.current = false;
          showToast("You coast to a stop and step off the board.");
        }
      } else {
        boardStopT.current = 0;
      }

      speed = sp;
      speedRef.current = sp;
      anim.current = "snowboard";
      setResting(false);
      stamina.current = THREE.MathUtils.clamp(stamina.current + STAMINA_REGEN_WALK * dt, 0, 100);
      setStamina(stamina.current);
    } else {

    // --- movement intent (camera-relative) ---
    let ix = 0;
    let iz = 0;
    if (k.KeyW) iz -= 1;
    if (k.KeyS) iz += 1;
    if (k.KeyA) ix -= 1;
    if (k.KeyD) ix += 1;
    const hasInput =
      (ix !== 0 || iz !== 0) && !ui.activePeak && !ui.craftOpen && !ui.commandOpen;

    const wantRun = !!k.ShiftLeft || !!k.ShiftRight;
    const canRun = stamina.current > 0.5;
    speed = hasInput ? (wantRun && canRun ? RUN_SPEED : WALK_SPEED) : 0;

    // --- slope tiers ---
    nY = normalAt(p.x, p.z).y;
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
          // climbing: slow, expensive, possible only while stamina lasts.
          // A fixed line placed by any hiker makes the going faster.
          climbing = true;
          const roped = nearAny(ropesRef.current, p.x, p.z, ROPE_ASSIST_RADIUS);
          const climbSpeed = CLIMB_SPEED * (roped ? 1.35 : 1);
          const scale = (climbSpeed * dt) / Math.hypot(dx, dz);
          dx *= scale;
          dz *= scale;
          speed = climbSpeed;
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
    const ground = meshHeightAt(p.x, p.z);
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
    nearFire =
      ZONES.some((zn) => Math.hypot(p.x - zn.camp.x, p.z - zn.camp.z) < CAMPFIRE_RADIUS) ||
      nearAny(tentsRef.current, p.x, p.z, TENT_AURA_RADIUS);
    const rainNow = weatherAt(ui.clock).rain;
    const roped = climbing && nearAny(ropesRef.current, p.x, p.z, ROPE_ASSIST_RADIUS);
    let ds = 0;
    if (speed > WALK_SPEED + 0.1 && !climbing) ds -= STAMINA_RUN_DRAIN;
    if (scrambling) ds -= STAMINA_SCRAMBLE_DRAIN * (ui.gear.walkingStick ? 0.65 : 1);
    if (climbing) {
      ds -= STAMINA_CLIMB_DRAIN * (rainNow > 0.05 ? 1.4 : 1) * (roped ? 0.5 : 1);
    }
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

    } // end walking physics

    // --- visuals ---
    group.current.position.copy(p);
    group.current.rotation.y = heading.current;
    playerPosRef.current = { x: p.x, y: p.y, z: p.z };

    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__tb = {
        x: p.x, y: p.y, z: p.z,
        stamina: stamina.current, anim: anim.current, speed, nY,
        boarding: boarding.current, grounded: grounded.current,
        boardSpeed: boardVel.current.length(),
        heading: heading.current, lean: boardAnim.current.lean, tuck: tuckP.current,
        keys: { ...keys.current },
      };
    }

    // --- camera ---
    const cx = p.x + Math.sin(yaw.current) * Math.cos(pitch.current) * CAM_DIST;
    const cz = p.z + Math.cos(yaw.current) * Math.cos(pitch.current) * CAM_DIST;
    const cy = p.y + 1.6 + Math.sin(pitch.current) * CAM_DIST;
    const camGround = meshHeightAt(cx, cz) + 0.45;
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

    // --- interaction prompt (plane > register > gather > craft) ---
    let promptText: string | null = null;
    if (flying.current) {
      promptText = "Press E — hop out";
    } else if (boarding.current) {
      promptText = "Space mid-air — step off the board";
    } else if (!ui.activePeak && !ui.craftOpen) {
      const parked = planeRef.parked;
      const nearPlane = parked && Math.hypot(p.x - parked.x, p.z - parked.z) < 4;
      const nearPeak = nearPlane
        ? null
        : PEAKS.find((pk) => Math.hypot(p.x - pk.x, p.z - pk.z) < REGISTER_RADIUS);
      const node = nearPlane || nearPeak ? null : nearestNode(p.x, p.z);
      if (nearPlane) {
        promptText = "Press E — hop in the plane";
      } else if (tvRef.current) {
        promptText = tvRef.current.label;
      } else if (nearPeak) {
        promptText = `Press E — sign the ${nearPeak.name} register`;
      } else if (node) {
        promptText = `Press E — gather ${KIND_LABEL[node.kind]}`;
      } else if (nearFire) {
        promptText = "Press C — craft";
      }
    }
    setPrompt(promptText);

    // --- footstep pulses for the audio engine (not while riding) ---
    if (grounded.current && speed > 0.5 && !boarding.current) {
      const before = Math.sin(stepPhase.current);
      stepPhase.current += dt * 2.1 * speed;
      if (Math.sin(stepPhase.current) >= 0 && before < 0) {
        stepRef.current += 1;
        const h = heightAt(p.x, p.z);
        stepRef.surface = h > 100 ? "snow" : nY < 0.62 || h > 68 ? "rock" : "grass";
      }
    }

    // --- network sync over the party socket: ~12.5 Hz while moving,
    // instant on anim transitions (start/stop/jump/wave) ---
    const now = performance.now();
    const ls = lastSent.current;
    const animChanged = anim.current !== ls.anim;
    const movedEnough =
      Math.hypot(p.x - ls.x, p.y - ls.y, p.z - ls.z) > 0.12 ||
      Math.abs(heading.current - ls.rotY) > 0.1;
    const due =
      animChanged || // e.g. stopping — pins the exact end position immediately
      (movedEnough && now - ls.t > SEND_MIN_INTERVAL_MS);
    if (due) {
      lastSent.current = {
        t: now, x: p.x, y: p.y, z: p.z, rotY: heading.current, anim: anim.current,
      };
      net.sendPos(p.x, p.y, p.z, heading.current, anim.current);
    }
  });

  const profile = useGame((s) => s.profile)!;

  return (
    <>
      <group ref={group}>
        <Character
          colors={profile.colors}
          hatStyle={profile.hatStyle}
          anim="idle"
          animRef={anim}
          speedRef={speedRef}
          boardAnimRef={boardAnim}
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
