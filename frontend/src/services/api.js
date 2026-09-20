// Single place for all backend calls. Requests go through the Vite proxy (/api -> :8000).
const BASE = "/api";

export class ApiError extends Error {
  constructor(message, { status = 0, details = [], kind = "api" } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details; // [{ field, message }] from the backend
    this.kind = kind;       // "network" | "api"
  }
}

const UNREACHABLE =
  "Can't reach the simulation server. Start the backend (uvicorn app.main:app --port 8000) and run the simulation again.";

async function request(path, options) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, options);
  } catch {
    throw new ApiError(UNREACHABLE, { kind: "network" });
  }

  let body = null;
  try {
    body = await res.json();
  } catch {
    /* empty or non-JSON body */
  }

  if (!res.ok) {
    const err = body?.error;
    // The Vite proxy answers 5xx with no JSON body when FastAPI is down.
    if (!err && res.status >= 500) throw new ApiError(UNREACHABLE, { status: res.status, kind: "network" });
    throw new ApiError(err?.message ?? `The server returned an error (${res.status}).`, {
      status: res.status,
      details: err?.details ?? [],
    });
  }
  return body;
}

export const getHealth = () => request("/health");

export const getInterventions = () => request("/interventions");

export const getScenarios = () => request("/scenarios");

const post = (path) => (payload) =>
  request(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });

export const previewInterventions = post("/interventions/preview");

export const compare = post("/compare");

export const simulate = (payload) =>
  request("/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
