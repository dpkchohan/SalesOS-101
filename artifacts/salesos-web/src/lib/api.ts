/**
 * Returns an absolute URL pointing to the API server.
 *
 * In development (Replit) or when VITE_API_BASE_URL is not set, `path` is
 * returned as-is (relative URL — same origin).
 *
 * When VITE_API_BASE_URL is set (e.g. Railway on Vercel deployments), the
 * base URL is prepended so the request goes cross-origin to the API server.
 *
 * @param path  Must start with "/", e.g. "/api/import/preview"
 */
export function getApiUrl(path: string): string {
  const base = import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, "") ?? "";
  return `${base}${path}`;
}
