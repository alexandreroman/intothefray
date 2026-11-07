// Decodes a card image before an <img> of the same URL draws it. A cached image still has to be
// decoded before it shows, and on a weak device decoding an AVIF card at the screen's pixel ratio
// takes tens of ms: a face that appears mid-motion would show empty, or hitch the motion. Decoded
// ahead, the browser's own cache of decoded images has it ready. The image is held only until its
// decode settles: nothing here keeps it.

/** A decode on its way: settled once the image is decoded, or has failed to be. */
export interface Decode {
  /** Resolves as the decode settles; never rejects. */
  readonly done: Promise<void>;
  readonly settled: boolean;
}

/**
 * Starts decoding the image at that URL, at that fetch priority. Where the browser cannot decode
 * ahead (no HTMLImageElement.decode), there is nothing to wait for: the decode is settled at once.
 * A failed decode settles as a good one does: the <img> falls back on its own (CardFace.svelte).
 */
export function decodeImage(url: string, priority: 'low' | 'auto' = 'auto'): Decode {
  if (typeof HTMLImageElement.prototype.decode !== 'function') {
    return { done: Promise.resolve(), settled: true };
  }
  const image = new Image();
  image.fetchPriority = priority;
  image.src = url;
  let settled = false;
  const done = image
    .decode()
    .catch(() => {})
    .then(() => {
      settled = true;
    });
  return {
    done,
    get settled() {
      return settled;
    },
  };
}
