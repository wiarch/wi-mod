import type { FetchExternalRequest, FetchExternalResponse } from "./types";
import { PROVIDER_BASE } from "./types";

function buildUrl(req: FetchExternalRequest): string {
  const path = String(req.path || "");
  if (!path.startsWith("/") || path.includes("://") || path.includes("..")) {
    throw new Error("path inválido");
  }
  const query = { ...(req.query || {}) };
  const key = String(req.apiKey || "").trim();
  if (key && (req.provider === "rawg" || req.provider === "steam")) {
    if (!query.key) query.key = key;
  }
  const base = PROVIDER_BASE[req.provider];
  const qs = new URLSearchParams(query).toString();
  return qs ? `${base}${path}?${qs}` : `${base}${path}`;
}

function authHeaders(req: FetchExternalRequest): Record<string, string> {
  const key = String(req.apiKey || "").trim();
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(req.headers || {}),
  };
  if (req.provider === "nexus" && key) {
    headers.apikey = key;
    headers["Application-Name"] = "wi-mod";
    headers["Application-Version"] = "0.7.5";
  }
  if (req.provider === "curseforge" && key) {
    headers["x-api-key"] = key;
  }
  return headers;
}

/** fetch del navegador (CORS). Nexus/CurseForge REST suelen fallar sin proxy. */
export async function webFetchExternal(
  req: FetchExternalRequest,
): Promise<FetchExternalResponse> {
  const method = (req.method || "GET").toUpperCase();
  const url = buildUrl(req);
  const headers = authHeaders(req);
  const init: RequestInit = { method, headers };
  if (method === "POST" && req.body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(req.body);
  }
  const res = await fetch(url, init);
  const text = await res.text();
  let body: unknown = null;
  if (text.trim()) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  const outHeaders: Record<string, string> = {};
  res.headers.forEach((value, key) => {
    outHeaders[key.toLowerCase()] = value;
  });
  if (!res.ok) {
    const detail =
      (body && typeof body === "object" &&
        (("message" in body && String((body as { message: unknown }).message)) ||
          ("error" in body && String((body as { error: unknown }).error)))) ||
      "La API respondió con error.";
    throw new Error(`HTTP ${res.status}: ${detail}`);
  }
  return { status: res.status, ok: res.ok, headers: outHeaders, body };
}
