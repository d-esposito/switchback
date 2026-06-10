import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";

export default function App() {
  const visits = useQuery(api.hello.trailVisits);
  const logVisit = useMutation(api.hello.logVisit);
  const connected = visits !== undefined;

  return (
    <div className="basecamp">
      <h1>⛰ Trailbound</h1>
      <p className="sub">Base camp — infrastructure check</p>
      <div className="card">
        <div className="row">
          <span className={connected ? "dot ok" : "dot"} />
          <span>{connected ? "Connected to Convex" : "Connecting to Convex…"}</span>
        </div>
        <div className="row big">
          <span>Trail register:</span>
          <strong>{visits ?? "—"}</strong>
          <span>visits</span>
        </div>
        <button onClick={() => logVisit()} disabled={!connected}>
          Sign the register
        </button>
        <p className="hint">
          Open this page in two tabs — the count updates live in both. That's
          the same plumbing multiplayer presence will use.
        </p>
      </div>
    </div>
  );
}
