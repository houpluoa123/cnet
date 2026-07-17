/**
 * Safe fetch wrapper that intercepts relative `/api/` paths and redirects them
 * to the configured VPS Node.js Backend URL (if custom backend is specified in local storage).
 */
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

  if (url.startsWith('/api/')) {
    const storedBackend = localStorage.getItem('znet_backend_url');
    const envBackend = (import.meta as any).env?.VITE_API_BASE_URL;
    let backendUrl = storedBackend || envBackend || '';

    if (backendUrl) {
      if (backendUrl.endsWith('/')) {
        backendUrl = backendUrl.slice(0, -1);
      }
      url = `${backendUrl}${url}`;
    }
  }

  // Ensure requests are forwarded as Requests correctly
  if (input instanceof Request) {
    const newRequest = new Request(url, input);
    return window.fetch(newRequest, init);
  }

  return window.fetch(url, init);
}
