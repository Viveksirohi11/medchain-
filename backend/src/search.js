// ADVANCED SEARCH (pure functions, no blockchain needed -> easy to unit-test).
//
// Users can type plain words:            paracetamol
// ...or field filters (like Gmail/GitHub): drug:amoxicillin status:active holder:"CityCare Pharmacy"
// ...and/or use the filter form, which arrives as separate query params.
// Every term must match (AND). Matching is case-insensitive "contains".

const FIELD_ALIASES = {
  drug: "drug", medicine: "drug",
  mfr: "mfr", manufacturer: "mfr",
  holder: "holder", custodian: "holder",
  status: "status",
  form: "form",
  id: "id", batch: "id",
  expiring: "expiringInDays",
  flagged: "flagged",
};

/** "drug:para status:active  cold  holder:\"City Care\"" -> { terms: ["cold"], drug: "para", ... } */
function parseQuery(q = "") {
  const out = { terms: [] };
  const re = /(\w+):("[^"]*"|\S+)|"([^"]*)"|(\S+)/g;
  let m;
  while ((m = re.exec(q))) {
    const [, key, val, quoted, word] = m;
    const field = key && FIELD_ALIASES[key.toLowerCase()];
    if (field) out[field] = val.replace(/^"|"$/g, "");
    else out.terms.push((key ? `${key}:${val}` : quoted ?? word).toLowerCase());
  }
  return out;
}

const has = (hay, needle) => String(hay ?? "").toLowerCase().includes(String(needle).toLowerCase());
const toSec = (d) => (d ? Math.floor(new Date(d).getTime() / 1000) : null);

/** Does batch `b` satisfy the filters? `skip` lets us ignore one filter when computing facets. */
function matches(b, f, skip) {
  const m = b.meta || {};
  if (f.terms.length) {
    const hay = [b.id, m.drugName, m.strength, m.form, m.notes, b.manufacturerName, b.manufacturer, b.custodianName, b.custodian, b.status].join(" ").toLowerCase();
    if (!f.terms.every((t) => hay.includes(t))) return false;
  }
  if (f.drug && !has(`${m.drugName} ${m.strength}`, f.drug)) return false;
  if (f.mfr && !(has(b.manufacturerName, f.mfr) || has(b.manufacturer, f.mfr))) return false;
  if (f.holder && !(has(b.custodianName, f.holder) || has(b.custodian, f.holder))) return false;
  if (f.form && !has(m.form, f.form)) return false;
  if (f.id && String(b.id) !== String(f.id).replace(/^#/, "")) return false;
  if (skip !== "status" && f.status && b.status !== f.status.toLowerCase()) return false;
  if (f.expiresFrom && b.expiresAt < toSec(f.expiresFrom)) return false;
  if (f.expiresTo && b.expiresAt > toSec(f.expiresTo) + 86399) return false;
  if (f.expiringInDays && !(b.status === "active" && b.daysToExpiry <= Number(f.expiringInDays))) return false;
  if (f.minDispensedPct && b.dispensedPct < Number(f.minDispensedPct)) return false;
  if (f.maxDispensedPct && b.dispensedPct > Number(f.maxDispensedPct)) return false;
  if (f.flagged === "true" || f.flagged === true) if (b.duplicateScans === 0) return false;
  return true;
}

/** Tiny relevance score so the best matches float to the top. */
function score(b, f) {
  let s = 0;
  const name = (b.meta?.drugName || "").toLowerCase();
  for (const t of f.terms) {
    if (name.startsWith(t)) s += 5;
    else if (name.includes(t)) s += 3;
    if ((b.manufacturerName || "").toLowerCase().includes(t)) s += 2;
  }
  return s;
}

const SORTERS = {
  id: (b) => b.id,
  expiry: (b) => b.expiresAt,
  drug: (b) => (b.meta?.drugName || "").toLowerCase(),
  dispensed: (b) => b.dispensedPct,
  alerts: (b) => b.duplicateScans,
  relevance: (b) => b.score,
};

function searchBatches(batches, params = {}) {
  // Query-string filters (form) override anything typed in the search box.
  const f = { ...parseQuery(params.q), ...Object.fromEntries(Object.entries(params).filter(([k, v]) => k !== "q" && v !== undefined && v !== "")) };
  f.terms = f.terms || [];

  let rows = batches.filter((b) => matches(b, f)).map((b) => ({ ...b, score: score(b, f) }));

  const facets = { status: { active: 0, recalled: 0, expired: 0 } };
  for (const b of batches) if (matches(b, f, "status")) facets.status[b.status]++;

  const hasText = f.terms.length > 0;
  const sort = SORTERS[params.sort] ? params.sort : hasText ? "relevance" : "id";
  const dir = (params.order || (sort === "id" || sort === "relevance" ? "desc" : "asc")) === "asc" ? 1 : -1;
  const key = SORTERS[sort];
  rows.sort((a, b) => (key(a) < key(b) ? -dir : key(a) > key(b) ? dir : b.id - a.id));

  const limit = Math.min(Math.max(parseInt(params.limit) || 10, 1), 50);
  const page = Math.max(parseInt(params.page) || 1, 1);
  const total = rows.length;
  return {
    total,
    page,
    limit,
    pages: Math.max(Math.ceil(total / limit), 1),
    items: rows.slice((page - 1) * limit, page * limit),
    facets,
  };
}

module.exports = { parseQuery, searchBatches };
