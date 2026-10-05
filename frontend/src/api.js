// One small wrapper around fetch so every page talks to the backend the same way.
async function request(path, options) {
  const res = await fetch("/api" + path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  get: (path, params = {}) => {
    const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== "" && v !== undefined && v !== false));
    const qs = new URLSearchParams(clean).toString();
    return request(path + (qs ? `?${qs}` : ""));
  },
  post: (path, body) =>
    request(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
};
