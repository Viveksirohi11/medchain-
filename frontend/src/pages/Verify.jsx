import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { drugTitle, fmtDate } from "../utils";

const TONE = { Genuine: "good", AlreadyDispensed: "warn", Expired: "warn", Recalled: "bad", Invalid: "bad", UnknownBatch: "bad" };
const ICON = { good: "✅", warn: "⚠️", bad: "⛔" };

export default function Verify() {
  const [payload, setPayload] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function check(text = payload) {
    setBusy(true); setError(""); setResult(null);
    try { setResult(await api.post("/verify", { payload: text })); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  // Convenience for demos: grab a real pack from the first active batch.
  async function loadSample() {
    setError("");
    try {
      const { items } = await api.get("/batches", { status: "active", limit: 1 });
      const units = await api.get(`/batches/${items[0].id}/units`, { limit: 1 });
      setPayload(JSON.stringify(units.items[0].qr));
    } catch (e) { setError(e.message); }
  }

  const tone = result && TONE[result.status];
  return (
    <>
      <h1>Verify a medicine pack</h1>
      <p className="muted">Scan the QR on the pack and paste its text here (a real phone app would use the camera). It is free: no wallet, no gas.</p>
      <div className="card">
        <textarea rows={5} value={payload} onChange={(e) => setPayload(e.target.value)} placeholder='{"b":1,"s":"MC-XXXXXXXX-...","p":["0x..."]}' />
        <div className="row">
          <button className="btn primary" disabled={!payload.trim() || busy} onClick={() => check()}>{busy ? "Checking…" : "Verify"}</button>
          <button className="btn" onClick={loadSample}>Load a sample pack</button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {result && (
        <div className={`result ${tone}`}>
          <div className="big">{ICON[tone]} {result.status === "Genuine" ? "Looks genuine" : result.status}</div>
          <p>{result.message}</p>
          {result.batch && (
            <p className="muted">
              <Link to={`/batches/${result.batch.id}`}>{drugTitle(result.batch)}</Link> · {result.batch.manufacturerName} · expires {fmtDate(result.batch.expiresAt)}
              {" · "}details {result.batch.metadataVerified ? "match the blockchain ✔" : "could not be verified"}
            </p>
          )}
        </div>
      )}
    </>
  );
}
