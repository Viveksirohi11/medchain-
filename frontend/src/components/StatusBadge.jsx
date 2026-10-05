const LABELS = {
  active: "Active", recalled: "Recalled", expired: "Expired",
  Genuine: "Genuine", AlreadyDispensed: "Already sold", Recalled: "Recalled", Expired: "Expired", Invalid: "Invalid", UnknownBatch: "Unknown batch",
};
const TONE = {
  active: "good", Genuine: "good",
  AlreadyDispensed: "warn", expired: "warn", Expired: "warn",
  recalled: "bad", Recalled: "bad", Invalid: "bad", UnknownBatch: "bad",
};
export default function StatusBadge({ status }) {
  return <span className={`badge ${TONE[status] || ""}`}>{LABELS[status] || status}</span>;
}
