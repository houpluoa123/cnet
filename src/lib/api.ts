/**
 * Safe fetch wrapper that intercepts relative `/api/` paths and redirects them
 * to the configured VPS Node.js Backend URL (if custom backend is specified in local storage).
 * Includes automatic fallback to the local host if the custom backend fails.
 */
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const originalUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  let url = originalUrl;

  const storedBackend = localStorage.getItem('znet_backend_url');
  const envBackend = (import.meta as any).env?.VITE_API_BASE_URL;
  let backendUrl = storedBackend || envBackend || '';

  let hasCustomBackend = false;
  if (url.startsWith('/api/') && backendUrl) {
    hasCustomBackend = true;
    if (backendUrl.endsWith('/')) {
      backendUrl = backendUrl.slice(0, -1);
    }
    url = `${backendUrl}${url}`;
  }

  try {
    if (input instanceof Request) {
      const newRequest = new Request(url, input);
      return await window.fetch(newRequest, init);
    }
    return await window.fetch(url, init);
  } catch (error: any) {
    // If a custom backend failed to fetch (DNS, CORS, offline, mixed content block, etc.)
    // Fallback to local server/relative path immediately so the app doesn't break!
    if (hasCustomBackend) {
      console.warn(`[ZNet API] Custom backend connection failed for ${url}. Falling back to default relative path: ${originalUrl}`, error);
      try {
        if (input instanceof Request) {
          const fallbackRequest = new Request(originalUrl, input);
          return await window.fetch(fallbackRequest, init);
        }
        return await window.fetch(originalUrl, init);
      } catch (fallbackError) {
        throw fallbackError;
      }
    }
    throw error;
  }
}
