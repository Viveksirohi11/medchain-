import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useActor } from "../actor.jsx";

const nextYear = () => new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10);

export default function CreateBatch() {
  const { actor } = useActor();
  const navigate = useNavigate();
  const [form, setForm] = useState({ drugName: "", strength: "", form: "Tablet", quantity: 20, expiresOn: nextYear(), notes: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  if (actor?.role !== "manufacturer")
    return (<><h1>Register a new batch</h1><p className="muted">Only licensed manufacturers can register batches. Choose a manufacturer in “Acting as” (top right).</p></>);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const batch = await api.post("/batches", { ...form, quantity: Number(form.quantity), manufacturer: actor.address });
      navigate(`/batches/${batch.id}`);
    } catch (err) { setError(err.message); setBusy(false); }
  }

  return (
    <>
      <h1>Register a new batch</h1>
      <p className="muted">The server makes random secret serials, builds a Merkle tree, and puts only its root on the blockchain.</p>
      <form className="card stack" onSubmit={submit}>
        <label>Medicine name<input required value={form.drugName} onChange={set("drugName")} placeholder="Ibuprofen" /></label>
        <label>Strength<input value={form.strength} onChange={set("strength")} placeholder="400 mg" /></label>
        <label>Form<select value={form.form} onChange={set("form")}>{["Tablet", "Capsule", "Syrup", "Injection", "Ointment"].map((f) => <option key={f}>{f}</option>)}</select></label>
        <label>Number of packs (max 500 in demo)<input type="number" min="1" max="500" required value={form.quantity} onChange={set("quantity")} /></label>
        <label>Expiry date<input type="date" required value={form.expiresOn} onChange={set("expiresOn")} /></label>
        <label>Notes<input value={form.notes} onChange={set("notes")} /></label>
        {error && <p className="error">{error}</p>}
        <button className="btn primary" disabled={busy}>{busy ? "Waiting for the blockchain…" : `Register as ${actor.name}`}</button>
      </form>
    </>
  );
}
