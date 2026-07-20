const BASE = import.meta.env.VITE_API_BASE || "";

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json() : null;
  if (!res.ok) {
    const err = new Error(body?.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return body;
}

export const api = {
  login: (username, password) => request("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  signup: (username, password) => request("/api/auth/signup", { method: "POST", body: JSON.stringify({ username, password }) }),
  logout: () => request("/api/auth/logout", { method: "POST" }),
  me: () => request("/api/auth/me"),
  adminHint: () => request("/api/auth/admin-hint"),
  changePassword: (newPassword) => request("/api/auth/change-password", { method: "POST", body: JSON.stringify({ newPassword }) }),

  listProjects: () => request("/api/projects"),
  getProject: (id) => request(`/api/projects/${id}`),
  createProject: (name, data) => request("/api/projects", { method: "POST", body: JSON.stringify({ name, data }) }),
  updateProject: (id, patch) => request(`/api/projects/${id}`, { method: "PUT", body: JSON.stringify(patch) }),
  deleteProject: (id) => request(`/api/projects/${id}`, { method: "DELETE" }),

  /* public share links — enable/disable are owner-only; getSharedProject is
     the PUBLIC fetch behind the lenient server bucket (no session needed) */
  enableShare: (id) => request(`/api/projects/${id}/share`, { method: "POST" }),
  disableShare: (id) => request(`/api/projects/${id}/share`, { method: "DELETE" }),
  getSharedProject: (token) => request(`/api/share/${encodeURIComponent(token)}`),

  listAssets: (projectId) => request(projectId ? `/api/assets?project=${encodeURIComponent(projectId)}` : "/api/assets"),
  uploadAsset: ({ name, mime, dataUrl, projectId }) => request("/api/assets", { method: "POST", body: JSON.stringify({ name, mime, dataUrl, ...(projectId ? { projectId } : {}) }) }),
  deleteAsset: (id) => request(`/api/assets/${id}`, { method: "DELETE" }),
};
