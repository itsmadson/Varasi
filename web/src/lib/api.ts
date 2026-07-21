// Single-origin API client. The Next rewrite proxies /api and /catalog to the
// Go control-plane, which in turn fronts eoAPI. The JWT rides in Authorization.

const TOKEN_KEY = "varasi.token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string) {
  localStorage.setItem(TOKEN_KEY, t);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(path, { ...init, headers });
  if (res.status === 401 && typeof window !== "undefined") {
    clearToken();
  }
  if (!res.ok) {
    let msg = res.statusText;
    try {
      msg = (await res.json()).error ?? msg;
    } catch {}
    throw new ApiError(res.status, msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  login: (email: string, password: string) =>
    request<{ token: string; org_id: string; role: string; email: string }>(
      "/api/v1/auth/login",
      { method: "POST", body: JSON.stringify({ email, password }) },
    ),
  register: (body: Record<string, unknown>) =>
    request<{ token: string }>("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  me: () => request<{ email: string; org_id: string; role: string }>("/api/v1/me"),
  projects: () => request<{ projects: Project[] }>("/api/v1/projects"),
  watchAreas: () => request<GeoJSONFC>("/api/v1/watch-areas"),
  jobs: () => request<{ jobs: Job[] }>("/api/v1/jobs"),

  // Catalog (via authenticated proxy)
  collections: () => request<{ collections: Collection[] }>("/catalog/stac/collections"),
  search: (body: Record<string, unknown>) =>
    request<StacFC>("/catalog/stac/search", { method: "POST", body: JSON.stringify(body) }),
};

// Tile URL for a STAC item (titiler-pgstac via proxy). Token can't ride tile
// requests, so raster proxy tiles are fetched with the header-less <img>/GL path;
// for the demo the proxy allows them through the same session cookie-less path.
export function itemTileJson(collection: string, itemId: string) {
  return `/catalog/raster/collections/${collection}/items/${itemId}/WebMercatorQuad/tilejson.json?assets=data`;
}
export function itemPreview(collection: string, itemId: string, size = 256) {
  return `/catalog/raster/collections/${collection}/items/${itemId}/preview.png?assets=data&max_size=${size}`;
}

export type Project = {
  id: string;
  name: string;
  slug: string;
  description: string;
  collections: string[];
  created_at: string;
};
export type Job = {
  id: string;
  kind: string;
  status: string;
  progress: number;
  error?: string | null;
  created_at: string;
};
export type Collection = { id: string; title?: string; description?: string };
export type StacItem = {
  id: string;
  collection: string;
  bbox: number[];
  geometry: GeoJSON.Geometry;
  properties: Record<string, unknown>;
  assets: Record<string, { href: string }>;
};
export type StacFC = { features: StacItem[]; numberMatched?: number };
export type GeoJSONFC = { type: "FeatureCollection"; features: GeoJSON.Feature[] };
