// Test helper for the router. It must not import router.svelte.ts: a test that
// stubs the base path loads the router itself, after the stub.

/** Lands on a URL, as a page load or back/forward does, then tells the router. */
export function navigate(path: string): void {
  window.history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
