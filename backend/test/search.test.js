const test = require("node:test");
const assert = require("node:assert");
const { parseQuery, searchBatches } = require("../src/search");

const day = 86400, now = Math.floor(Date.now() / 1000);
const mk = (id, over = {}) => ({
  id, status: "active", expiresAt: now + 100 * day, daysToExpiry: 100, dispensedPct: 0, duplicateScans: 0,
  manufacturer: "0xAAA", manufacturerName: "Aarav Pharma", custodian: "0xBBB", custodianName: "CityCare Pharmacy",
  meta: { drugName: "Paracetamol", strength: "500 mg", form: "Tablet", notes: "" }, ...over,
});
const data = [
  mk(1),
  mk(2, { meta: { drugName: "Amoxicillin", strength: "250 mg", form: "Capsule", notes: "" }, dispensedPct: 50 }),
  mk(3, { status: "recalled", duplicateScans: 2 }),
  mk(4, { status: "active", daysToExpiry: 10, expiresAt: now + 10 * day, manufacturerName: "Kaveri Labs" }),
];

test("parseQuery splits fields and free words", () => {
  const p = parseQuery('para drug:amox status:recalled holder:"City Care"');
  assert.deepStrictEqual(p.terms, ["para"]);
  assert.strictEqual(p.drug, "amox");
  assert.strictEqual(p.status, "recalled");
  assert.strictEqual(p.holder, "City Care");
});
test("free text is case-insensitive and AND-ed", () => {
  assert.strictEqual(searchBatches(data, { q: "PARACETAMOL tablet" }).total, 3);
  assert.strictEqual(searchBatches(data, { q: "capsule paracetamol" }).total, 0);
});
test("field syntax + facets", () => {
  const r = searchBatches(data, { q: "drug:paracetamol" });
  assert.strictEqual(r.total, 3);
  assert.strictEqual(r.facets.status.recalled, 1);
});
test("filters: status, flagged, expiring, dispensed range", () => {
  assert.deepStrictEqual(searchBatches(data, { status: "recalled" }).items.map((b) => b.id), [3]);
  assert.deepStrictEqual(searchBatches(data, { flagged: "true" }).items.map((b) => b.id), [3]);
  assert.deepStrictEqual(searchBatches(data, { q: "expiring:30" }).items.map((b) => b.id), [4]);
  assert.deepStrictEqual(searchBatches(data, { minDispensedPct: "40" }).items.map((b) => b.id), [2]);
});
test("sorting and pagination", () => {
  const r = searchBatches(data, { sort: "expiry", order: "asc", limit: 2, page: 2 });
  assert.strictEqual(r.pages, 2);
  assert.strictEqual(r.items.length, 2);
  assert.strictEqual(searchBatches(data, { sort: "drug", order: "asc" }).items[0].meta.drugName, "Amoxicillin");
});
