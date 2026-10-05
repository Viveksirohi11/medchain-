import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import StatusBadge from "../components/StatusBadge.jsx";
import { drugTitle, fmtDateTime, shortAddr } from "../utils";

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [soon, setSoon] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api.get("/stats"), api.get("/alerts"), api.get("/batches", { expiringInDays: 60, sort: "expiry", limit: 5 })])
      .then(([s, a, e]) => { setStats(s); setAlerts(a); setSoon(e.items); })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="error">{error} — is the backend running and seeded? See README.</p>;
  if (!stats) return <p>Loading…</p>;

  const cards = [
    ["Batches", stats.batches], ["Active", stats.active], ["Recalled", stats.recalled],
    ["Packs registered", stats.packsRegistered], ["Packs sold", stats.packsDispensed], ["Clone alerts", stats.duplicateAlerts],
  ];
  return (
    <>
      <h1>Dashboard</h1>
      <div className="cards">
        {cards.map(([label, value]) => (
          <div className="card stat" key={label}><div className="num">{value}</div><div className="muted">{label}</div></div>
        ))}
      </div>

      <div className="grid2">
        <section className="card">
          <h2>🚨 Cloned-pack alerts</h2>
          {alerts.length === 0 && <p className="muted">No duplicate scans yet.</p>}
          <ul className="plain">
            {alerts.slice(0, 6).map((a) => (
              <li key={a.tx}>
                <Link to={`/batches/${a.batchId}`}>Batch #{a.batchId}</Link> — same serial sold again at {shortAddr(a.scanner)}
                <div className="muted">{fmtDateTime(a.at)}</div>
              </li>
            ))}
          </ul>
          <Link to="/batches?flagged=true">See all flagged batches →</Link>
        </section>

        <section className="card">
          <h2>⏳ Expiring within 60 days</h2>
          {soon.length === 0 && <p className="muted">Nothing expiring soon.</p>}
          <ul className="plain">
            {soon.map((b) => (
              <li key={b.id}><Link to={`/batches/${b.id}`}>{drugTitle(b)}</Link> <StatusBadge status={b.status} /> <span className="muted">· {b.daysToExpiry} days left</span></li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
