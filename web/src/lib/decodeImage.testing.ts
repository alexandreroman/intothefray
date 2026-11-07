// Test helpers for HTMLImageElement.decode: jsdom has none, so a test gives images one that records
// each decode asked for and settles it when the test says.

/** A decode asked for: the image's URL and fetch priority, and how the test settles it. */
interface StubbedDecode {
  url: string | null;
  priority: string;
  resolve: () => void;
  reject: () => void;
}

/**
 * Gives every image a decode that records its call and settles only when the test says so; restore
 * takes it away again.
 */
export function stubImageDecode(): { calls: StubbedDecode[]; restore: () => void } {
  const calls: StubbedDecode[] = [];
  Object.defineProperty(HTMLImageElement.prototype, 'decode', {
    configurable: true,
    writable: true,
    value: function (this: HTMLImageElement): Promise<void> {
      return new Promise<void>((resolve, reject) => {
        calls.push({
          url: this.getAttribute('src'),
          priority: this.fetchPriority,
          resolve,
          reject: () => reject(new Error('The image cannot be decoded.')),
        });
      });
    },
  });
  const restore = () => {
    delete (HTMLImageElement.prototype as { decode?: unknown }).decode;
  };
  return { calls, restore };
}
