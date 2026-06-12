import { useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { heightAt } from "./terrain";
import { useGame, showToast, uiCaptured } from "./store";
import { playerPosRef } from "./sharedRefs";

/** A little stack of three stones. Player-built, persistent, visible to all. */
function CairnStack({ x, z }: { x: number; z: number }) {
  const y = heightAt(x, z);
  return (
    <group position={[x, y, z]}>
      <mesh position={[0, 0.12, 0]}>
        <dodecahedronGeometry args={[0.22, 0]} />
        <meshStandardMaterial color="#8b8275" flatShading />
      </mesh>
      <mesh position={[0.02, 0.34, 0.01]} rotation={[0.2, 0.8, 0.1]}>
        <dodecahedronGeometry args={[0.16, 0]} />
        <meshStandardMaterial color="#7c7468" flatShading />
      </mesh>
      <mesh position={[-0.01, 0.5, 0]} rotation={[0.5, 0.2, 0.3]}>
        <dodecahedronGeometry args={[0.1, 0]} />
        <meshStandardMaterial color="#948b7d" flatShading />
      </mesh>
    </group>
  );
}

/** Renders all cairns and lets the local player build one with B. */
export function Cairns() {
  const cairns = useQuery(api.cairns.list);
  const build = useMutation(api.cairns.build);
  const lastBuilt = useRef(0);
  const profile = useGame((s) => s.profile);

  const name = profile?.name;
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== "KeyB" || !name || uiCaptured()) return;
      const now = Date.now();
      if (now - lastBuilt.current < 5000) return; // gentle rate limit
      const p = playerPosRef.current;
      lastBuilt.current = now;
      void build({ x: p.x, y: heightAt(p.x, p.z), z: p.z, builtBy: name });
      showToast("You stacked a cairn. It will outlast your hike.");
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [build, name]);

  const rendered = useMemo(
    () => (cairns ?? []).map((c) => <CairnStack key={c.id} x={c.x} z={c.z} />),
    [cairns]
  );

  return <>{rendered}</>;
}
