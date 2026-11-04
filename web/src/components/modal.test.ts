import { openModal } from './modal.svelte';

const page = document.documentElement;

/** Gives the page the width jsdom never lays out: as wide as the window, or narrower by a scrollbar. */
function setPageWidth(width: number): void {
  Object.defineProperty(page, 'clientWidth', { configurable: true, value: width });
}

describe('openModal', () => {
  beforeEach(() => {
    // No classic scrollbar: the page is as wide as the window.
    setPageWidth(window.innerWidth);
  });

  afterEach(() => {
    // Back to jsdom's own clientWidth, on the prototype.
    delete (page as { clientWidth?: number }).clientWidth;
  });

  it('locks the page scroll while a dialog is open', () => {
    const close = openModal();
    expect(page.classList).toContain('scroll-locked');

    close();
    expect(page.classList).not.toContain('scroll-locked');
  });

  it('keeps the page locked until the last dialog closes', () => {
    const closeFirst = openModal();
    const closeSecond = openModal();

    closeFirst();
    expect(page.classList).toContain('scroll-locked');

    closeSecond();
    expect(page.classList).not.toContain('scroll-locked');
  });

  it('does not unlock the page when the same dialog closes twice', () => {
    const closeFirst = openModal();
    const closeSecond = openModal();

    closeFirst();
    closeFirst();
    expect(page.classList).toContain('scroll-locked');

    closeSecond();
    expect(page.classList).not.toContain('scroll-locked');
  });

  it("keeps the room of the page's scrollbar while it is locked", () => {
    setPageWidth(window.innerWidth - 15);

    const close = openModal();
    expect(page.classList).toContain('scroll-locked-gutter');

    close();
    expect(page.classList).not.toContain('scroll-locked-gutter');
  });

  it('keeps no room for a scrollbar the page does not have', () => {
    const close = openModal();
    expect(page.classList).not.toContain('scroll-locked-gutter');

    close();
  });
});
