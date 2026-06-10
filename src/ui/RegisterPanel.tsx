import { useEffect, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useGame } from "../game/store";
import { getDeviceId } from "../lib/ids";
import { PEAKS } from "../game/config";

function timeAgo(ms: number): string {
  const s = Math.max(1, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function RegisterPanel() {
  const activePeak = useGame((s) => s.activePeak);
  const setActivePeak = useGame((s) => s.setActivePeak);
  const profile = useGame((s) => s.profile);
  const data = useQuery(
    api.signatures.list,
    activePeak ? { peakId: activePeak } : "skip"
  );
  const sign = useMutation(api.signatures.sign);
  const [justSigned, setJustSigned] = useState(false);
  const [already, setAlready] = useState(false);

  // each peak's logbook gets a fresh signing state
  useEffect(() => {
    setJustSigned(false);
    setAlready(false);
  }, [activePeak]);

  const peak = PEAKS.find((p) => p.id === activePeak);
  if (!peak || !profile) return null;

  const setOpen = (open: boolean) => setActivePeak(open ? peak.id : null);

  const doSign = async () => {
    const fresh = await sign({
      peakId: peak.id,
      deviceId: getDeviceId(),
      name: profile.name,
    });
    if (fresh) setJustSigned(true);
    else setAlready(true);
  };

  return (
    <div className="register-backdrop" onClick={() => setOpen(false)}>
      <div className="register" onClick={(e) => e.stopPropagation()}>
        <div className="stamp">{data ? `${data.count} summited` : "…"}</div>
        <h2>{peak.name} Register</h2>
        <p className="meta">elev. high enough to feel it · leave your mark</p>

        {data && data.recent.length === 0 && (
          <p className="empty">The pages are blank. Be the first.</p>
        )}
        <ul>
          {data?.recent.map((r, i) => (
            <li key={i}>
              <span className="sig">{r.name}</span>
              <span className="when">{timeAgo(r.signedAt)}</span>
            </li>
          ))}
        </ul>

        <div className="actions">
          <button className="begin-btn" onClick={doSign} disabled={justSigned || already}>
            {justSigned ? "✓ Signed!" : already ? "Already signed" : "✍ Sign the register"}
          </button>
          <button className="close-btn" onClick={() => setOpen(false)}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
