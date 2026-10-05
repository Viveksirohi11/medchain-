export const shortAddr = (a = "") => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
export const fmtDate = (sec) => new Date(sec * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
export const fmtDateTime = (sec) => new Date(sec * 1000).toLocaleString();
export const who = (name, addr) => name || shortAddr(addr);
export const drugTitle = (b) => [b.meta?.drugName, b.meta?.strength].filter(Boolean).join(" ") || `Batch #${b.id}`;
