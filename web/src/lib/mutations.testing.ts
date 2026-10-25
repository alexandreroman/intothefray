// Test helpers for code that watches the DOM with a MutationObserver.

/** Waits for the pending MutationObserver callbacks, which run as microtasks. */
export function mutationsDelivered(): Promise<void> {
  return new Promise((resolve) => queueMicrotask(resolve));
}
