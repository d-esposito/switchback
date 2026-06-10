import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useGame } from "../game/store";
import { getDeviceId } from "../lib/ids";
import { PEAK } from "../game/config";

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
  const open = useGame((s) => s.registerOpen);
  const setOpen = useGame((s) => s.setRegisterOpen);
  const profile = useGame((s) => s.profile);
  const data = useQuery(api.signatures.list, open ? { peakId: PEAK.id } : "skip");
  const sign = useMutation(api.signatures.sign);
  const [justSigned, setJustSigned] = useState(false);
  const [already, setAlready] = useState(false);

  if (!open || !profile) return null;

  const doSign = async () => {
    const fresh = await sign({
      peakId: PEAK.id,
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
        <h2>{PEAK.name} Register</h2>
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
