import { decodeImage } from './decodeImage';
import { stubImageDecode } from './decodeImage.testing';

/** Lets the promises of a decode settle. */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

describe('decodeImage', () => {
  it('is settled at once where the browser cannot decode ahead', () => {
    expect(HTMLImageElement.prototype.decode).toBeUndefined();

    expect(decodeImage('a.avif').settled).toBe(true);
  });

  describe('where the browser decodes ahead', () => {
    let decodes: ReturnType<typeof stubImageDecode>;

    beforeEach(() => {
      decodes = stubImageDecode();
    });

    afterEach(() => decodes.restore());

    it('decodes the image of that URL, at the priority asked for', () => {
      decodeImage('a.avif', 'low');
      decodeImage('b.avif');

      expect(decodes.calls.map(({ url, priority }) => ({ url, priority }))).toEqual([
        { url: 'a.avif', priority: 'low' },
        { url: 'b.avif', priority: 'auto' },
      ]);
    });

    it('is settled once the image is decoded', async () => {
      const decode = decodeImage('a.avif');
      await settle();
      expect(decode.settled).toBe(false);

      decodes.calls[0]!.resolve();
      await decode.done;

      expect(decode.settled).toBe(true);
    });

    it('is settled when the image fails to decode', async () => {
      const decode = decodeImage('missing.avif');

      decodes.calls[0]!.reject();
      await decode.done;

      expect(decode.settled).toBe(true);
    });
  });
});
