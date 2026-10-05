import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { useActor } from "../actor.jsx";
import Pager from "../components/Pager.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { drugTitle, fmtDate, fmtDateTime, shortAddr } from "../utils";

export default function BatchDetail() {
  const { id } = useParams();
  const { actors, actor } = useActor();
  const [batch, setBatch] = useState(null);
  const [units, setUnits] = useState(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");

  const nameOf = (addr) => actors.find((a) => a.address.toLowerCase() === addr?.toLowerCase())?.name || shortAddr(addr);

  const load = useCallback(() => {
    api.get(`/batches/${id}`).then(setBatch).catch((e) => setError(e.message));
    api.get(`/batches/${id}/units`, { page, limit: 8 }).then(setUnits).catch(() => setUnits(null));
  }, [id, page]);
  useEffect(load, [load]);

  // Wraps any action: shows a spinner, reports errors, refreshes the page data.
  async function run(fn, success) {
    setBusy(true); setError(""); setNotice("");
    try { const out = await fn(); setNotice(typeof success === "function" ? success(out) : success); load(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  if (error && !batch) return <p className="error">{error}</p>;
  if (!batch) return <p>Loading…</p>;

  const isActive = batch.status === "active";
  const holdsIt = actor && actor.address.toLowerCase() === batch.custodian.toLowerCase();
  const canTransfer = holdsIt && isActive && ["manufacturer", "distributor"].includes(actor.role);
  const canSell = holdsIt && isActive && actor.role === "pharmacy";
  const canRecall = actor && batch.status !== "recalled" && (actor.role === "regulator" || actor.address.toLowerCase() === batch.manufacturer.toLowerCase());
  const targets = actors.filter((a) => ["distributor", "pharmacy"].includes(a.role) && a.address !== actor?.address);

  const describe = (h) => {
    switch (h.type) {
      case "registered": return `Registered by ${nameOf(h.by)}`;
      case "custody": return `Custody: ${nameOf(h.from)} → ${nameOf(h.to)}`;
      case "dispensed": return `A pack was sold by ${nameOf(h.by)}`;
      case "duplicate": return `🚨 Duplicate scan at ${nameOf(h.scanner)} (cloned pack?)`;
      case "recalled": return `⛔ Recalled by ${nameOf(h.by)}`;
      default: return h.type;
    }
  };

  return (
    <>
      <p><Link to="/batches">← All batches</Link></p>
      <h1>{drugTitle(batch)} <StatusBadge status={batch.status} /></h1>
      <p className="muted">Batch #{batch.id} · {batch.meta.form} {batch.meta.notes && `· ${batch.meta.notes}`}</p>
      {notice && <p className="notice">{notice}</p>}
      {error && <p className="error">{error}</p>}

      <div className="grid2">
        <section className="card">
          <h2>Details</h2>
          <dl>
            <dt>Manufacturer</dt><dd>{batch.manufacturerName || shortAddr(batch.manufacturer)}</dd>
            <dt>Currently held by</dt><dd>{batch.custodianName || shortAddr(batch.custodian)} <span className="muted">({batch.hops} hand-overs)</span></dd>
            <dt>Packs sold</dt><dd>{batch.dispensed} of {batch.quantity}</dd>
            <dt>Expires</dt><dd>{fmtDate(batch.expiresAt)}</dd>
            <dt>Clone alerts</dt><dd>{batch.duplicateScans}</dd>
            <dt>Details integrity</dt>
            <dd>{batch.metadataVerified ? <span className="badge good">Matches on-chain hash ✔</span> : <span className="badge bad">Not verified</span>}</dd>
            <dt>Merkle root</dt><dd className="mono">{shortAddr(batch.merkleRoot)}</dd>
          </dl>
        </section>

        <section className="card">
          <h2>Actions {actor ? <span className="muted">as {actor.name}</span> : null}</h2>
          {!actor && <p className="muted">Choose who you are in “Acting as” (top right) to move, sell or recall this batch.</p>}
          {canTransfer && (
            <div className="stack">
              <label>Hand over to
                <select value={target} onChange={(e) => setTarget(e.target.value)}>
                  <option value="">Select…</option>
                  {targets.map((a) => <option key={a.address} value={a.address}>{a.name} · {a.role}</option>)}
                </select>
              </label>
              <button className="btn primary" disabled={!target || busy} onClick={() => run(() => api.post(`/batches/${id}/transfer`, { from: actor.address, to: target }), "Custody transferred.")}>Transfer custody</button>
            </div>
          )}
          {canRecall && (
            <div className="stack">
              <label>Recall reason<input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. failed lab test" /></label>
              <button className="btn danger" disabled={busy} onClick={() => window.confirm("Recall this whole batch?") && run(() => api.post(`/batches/${id}/recall`, { by: actor.address, reason }), "Batch recalled.")}>Recall batch</button>
            </div>
          )}
          {actor && !canTransfer && !canRecall && !canSell && <p className="muted">No actions available for {actor.role} on this batch.</p>}
          {canSell && <p className="muted">Pick a pack below and press “Sell”.</p>}
        </section>
      </div>

      <section className="card">
        <h2>Journey</h2>
        <ol className="timeline">
          {batch.history.map((h, i) => (<li key={i}><strong>{describe(h)}</strong><div className="muted">{fmtDateTime(h.at)}</div></li>))}
        </ol>
      </section>

      {units && (
        <section className="card">
          <h2>Packs (demo view)</h2>
          <p className="muted">Real serials are secret until printed. This list exists so you can try the full flow.</p>
          <div className="tablewrap"><table>
            <thead><tr><th>Serial</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {units.items.map((u) => (
                <tr key={u.serial}>
                  <td className="mono">{u.serial}</td>
                  <td><StatusBadge status={u.status} /></td>
                  <td className="actions">
                    <button className="btn small" onClick={() => { navigator.clipboard?.writeText(JSON.stringify(u.qr)); setNotice("QR text copied. Paste it on the Verify page."); }}>Copy QR</button>
                    {canSell && <button className="btn small primary" disabled={busy} onClick={() => run(() => api.post(`/batches/${id}/dispense`, { pharmacy: actor.address, serial: u.serial }), (r) => r.duplicate ? "🚨 Already sold! Duplicate scan logged on-chain." : "Pack sold and recorded.")}>Sell</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <Pager page={units.page} pages={Math.ceil(units.total / units.limit)} onChange={setPage} />
        </section>
      )}
    </>
  );
}
