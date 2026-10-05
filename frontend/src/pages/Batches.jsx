import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
import Pager from "../components/Pager.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { drugTitle, fmtDate, who } from "../utils";

// All search settings live in the URL (?q=...&status=...), so a search can be bookmarked or shared.
const FILTERS = ["status", "mfr", "holder", "form", "expiresFrom", "expiresTo", "expiringInDays", "minDispensedPct", "maxDispensedPct", "flagged", "sort", "order"];

export default function Batches() {
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState(params.get("q") || "");
  const [showAdvanced, setShowAdvanced] = useState(FILTERS.some((k) => !["sort", "order", "status"].includes(k) && params.get(k)));
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const update = (changes) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) (v === "" || v === false || v == null ? next.delete(k) : next.set(k, v));
    if (!("page" in changes)) next.delete("page"); // new search -> back to page 1
    setParams(next);
  };

  // Debounce typing: wait 300ms after the last keystroke before searching.
  useEffect(() => {
    const t = setTimeout(() => { if (text !== (params.get("q") || "")) update({ q: text }); }, 300);
    return () => clearTimeout(t);
  }, [text]);

  useEffect(() => {
    setError("");
    api.get("/batches", Object.fromEntries(params)).then(setData).catch((e) => setError(e.message));
  }, [params]);

  const val = (k) => params.get(k) || "";
  const clearAll = () => { setText(""); setParams({}); };
  const facets = data?.facets.status;

  return (
    <>
      <h1>Search batches</h1>
      <div className="card">
        <input className="search" value={text} onChange={(e) => setText(e.target.value)}
          placeholder='Try: paracetamol   or   drug:amox status:active   or   holder:"CityCare"' />
        <p className="muted tip">Tip: use <code>drug:</code> <code>mfr:</code> <code>holder:</code> <code>status:</code> <code>form:</code> <code>expiring:30</code> <code>flagged:true</code>. Every word must match.</p>

        <div className="tabs">
          {[["", "All"], ["active", "Active"], ["recalled", "Recalled"], ["expired", "Expired"]].map(([s, label]) => (
            <button key={s} className={`tab ${val("status") === s ? "on" : ""}`} onClick={() => update({ status: s })}>
              {label}{facets && s ? ` (${facets[s]})` : facets ? ` (${facets.active + facets.recalled + facets.expired})` : ""}
            </button>
          ))}
          <button className="btn small" onClick={() => setShowAdvanced(!showAdvanced)}>{showAdvanced ? "Hide" : "Advanced"} filters</button>
          <button className="btn small" onClick={clearAll}>Clear</button>
        </div>

        {showAdvanced && (
          <div className="filters">
            <label>Manufacturer<input value={val("mfr")} onChange={(e) => update({ mfr: e.target.value })} /></label>
            <label>Current holder<input value={val("holder")} onChange={(e) => update({ holder: e.target.value })} /></label>
            <label>Form<input value={val("form")} placeholder="Tablet, Capsule…" onChange={(e) => update({ form: e.target.value })} /></label>
            <label>Expires from<input type="date" value={val("expiresFrom")} onChange={(e) => update({ expiresFrom: e.target.value })} /></label>
            <label>Expires to<input type="date" value={val("expiresTo")} onChange={(e) => update({ expiresTo: e.target.value })} /></label>
            <label>Expiring within (days)<input type="number" min="1" value={val("expiringInDays")} onChange={(e) => update({ expiringInDays: e.target.value })} /></label>
            <label>Sold % (min)<input type="number" min="0" max="100" value={val("minDispensedPct")} onChange={(e) => update({ minDispensedPct: e.target.value })} /></label>
            <label>Sold % (max)<input type="number" min="0" max="100" value={val("maxDispensedPct")} onChange={(e) => update({ maxDispensedPct: e.target.value })} /></label>
            <label className="check"><input type="checkbox" checked={val("flagged") === "true"} onChange={(e) => update({ flagged: e.target.checked ? "true" : "" })} /> Only batches with clone alerts</label>
          </div>
        )}

        <div className="row">
          <label>Sort by
            <select value={val("sort")} onChange={(e) => update({ sort: e.target.value })}>
              <option value="">Best match / newest</option>
              <option value="expiry">Expiry date</option>
              <option value="drug">Drug name</option>
              <option value="dispensed">% sold</option>
              <option value="alerts">Clone alerts</option>
            </select>
          </label>
          <label>Order
            <select value={val("order")} onChange={(e) => update({ order: e.target.value })}>
              <option value="">Default</option><option value="asc">Ascending</option><option value="desc">Descending</option>
            </select>
          </label>
          {data && <span className="muted">{data.total} result{data.total === 1 ? "" : "s"}</span>}
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {!data && !error && <p>Loading…</p>}
      {data && data.items.length === 0 && <p className="muted">No batches match. Try fewer filters.</p>}
      {data && data.items.length > 0 && (
        <div className="card tablewrap">
          <table>
            <thead><tr><th>#</th><th>Medicine</th><th>Manufacturer</th><th>Held by</th><th>Sold</th><th>Expires</th><th>Status</th></tr></thead>
            <tbody>
              {data.items.map((b) => (
                <tr key={b.id}>
                  <td>{b.id}</td>
                  <td><Link to={`/batches/${b.id}`}>{drugTitle(b)}</Link><div className="muted">{b.meta.form}</div></td>
                  <td>{who(b.manufacturerName, b.manufacturer)}</td>
                  <td>{who(b.custodianName, b.custodian)}</td>
                  <td>{b.dispensed}/{b.quantity} <div className="bar"><span style={{ width: `${b.dispensedPct}%` }} /></div></td>
                  <td>{fmtDate(b.expiresAt)}<div className="muted">{b.status === "active" ? `${b.daysToExpiry} days` : ""}</div></td>
                  <td><StatusBadge status={b.status} />{b.duplicateScans > 0 && <span className="badge bad" title="Cloned pack detected">🚨 {b.duplicateScans}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pager page={data.page} pages={data.pages} onChange={(p) => update({ page: p })} />}
    </>
  );
}
