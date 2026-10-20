import { AutoHide, SCROLL_THRESHOLD, TOP_BAR_HEIGHT } from './autoHide.svelte';

// A page 2000 px tall, 800 px of it showing: it scrolls up to 1200 px.
const PAGE = { scrollHeight: 2000, clientHeight: 800 };
const END = PAGE.scrollHeight - PAGE.clientHeight;

/** A decision fed with these offsets one after the other, on the page above. */
function scrolledThrough(...offsets: number[]): AutoHide {
  const autoHide = new AutoHide();
  scroll(autoHide, ...offsets);
  return autoHide;
}

function scroll(autoHide: AutoHide, ...offsets: number[]): void {
  for (const offset of offsets) {
    autoHide.scrolled({ offset, ...PAGE });
  }
}

describe('AutoHide', () => {
  it('shows the bar before any scroll', () => {
    expect(new AutoHide().hidden).toBe(false);
  });

  it('hides the bar on a scroll down past its height, and shows it again on a scroll up', () => {
    const autoHide = scrolledThrough(100, 200, 300);
    expect(autoHide.hidden).toBe(true);

    scroll(autoHide, 300 - SCROLL_THRESHOLD);
    expect(autoHide.hidden).toBe(false);
  });

  it('keeps the bar near the top, however far the scroll goes down there', () => {
    expect(scrolledThrough(20, 40, TOP_BAR_HEIGHT).hidden).toBe(false);
  });

  it('shows the bar back near the top, even on a scroll up shorter than the threshold', () => {
    const autoHide = scrolledThrough(TOP_BAR_HEIGHT + 4);
    expect(autoHide.hidden).toBe(true);

    scroll(autoHide, TOP_BAR_HEIGHT);
    expect(autoHide.hidden).toBe(false);
  });

  it('hides the bar only once the scroll down reaches the threshold', () => {
    // Shown at 100 px, after a scroll up.
    const autoHide = scrolledThrough(200, 100);

    scroll(autoHide, 100 + SCROLL_THRESHOLD - 1);
    expect(autoHide.hidden).toBe(false);
    scroll(autoHide, 100 + SCROLL_THRESHOLD);
    expect(autoHide.hidden).toBe(true);
  });

  it('shows the bar only once the scroll up reaches the threshold', () => {
    const autoHide = scrolledThrough(500);
    scroll(autoHide, 500 - SCROLL_THRESHOLD + 1);
    expect(autoHide.hidden).toBe(true);
    scroll(autoHide, 500 - SCROLL_THRESHOLD);
    expect(autoHide.hidden).toBe(false);
  });

  it('ignores jitter: small moves back and forth never toggle the bar', () => {
    const shown = scrolledThrough(400, 300);
    scroll(shown, 306, 302, 308, 303, 309);
    expect(shown.hidden).toBe(false);

    const hidden = scrolledThrough(300);
    scroll(hidden, 294, 299, 293, 298, 292);
    expect(hidden.hidden).toBe(true);
  });

  it('ignores a rubber band bounce at the top', () => {
    const autoHide = scrolledThrough(0, -40, -80, -30, 0);
    expect(autoHide.hidden).toBe(false);
  });

  it('ignores a rubber band bounce at the bottom', () => {
    const autoHide = scrolledThrough(END - 200, END);
    expect(autoHide.hidden).toBe(true);

    // Past the end, then back to it: the offset that counts stays at the end.
    scroll(autoHide, END + 30, END + 80, END + 40, END);
    expect(autoHide.hidden).toBe(true);
  });

  it('ignores a horizontal scroll, which leaves the vertical offset as it is', () => {
    const autoHide = scrolledThrough(400);
    scroll(autoHide, 400, 400, 400);
    expect(autoHide.hidden).toBe(true);

    const shown = scrolledThrough(400, 380);
    scroll(shown, 380, 380);
    expect(shown.hidden).toBe(false);
  });

  it('shows the bar while the content cannot scroll', () => {
    const autoHide = scrolledThrough(400);
    autoHide.scrolled({ offset: 400, scrollHeight: 800, clientHeight: 800 });
    expect(autoHide.hidden).toBe(false);
  });

  it('shows the bar while it is pinned, whatever the scroll', () => {
    const autoHide = scrolledThrough(400);
    autoHide.pin(true);
    expect(autoHide.hidden).toBe(false);

    scroll(autoHide, 600, 900);
    expect(autoHide.hidden).toBe(false);
  });

  it('keeps the bar shown once unpinned, until the next scroll down of the threshold', () => {
    const autoHide = scrolledThrough(400);
    autoHide.pin(true);
    scroll(autoHide, 600);
    autoHide.pin(false);
    expect(autoHide.hidden).toBe(false);

    scroll(autoHide, 601);
    expect(autoHide.hidden).toBe(false);
    scroll(autoHide, 600 + SCROLL_THRESHOLD);
    expect(autoHide.hidden).toBe(true);
  });

  it('starts from where the scroller is, deciding nothing', () => {
    const autoHide = new AutoHide();
    autoHide.startAt({ offset: 400, ...PAGE });
    expect(autoHide.hidden).toBe(false);
    expect(autoHide.offset).toBe(400);

    // A small move from there is not a long scroll down from the top.
    scroll(autoHide, 405);
    expect(autoHide.hidden).toBe(false);
    scroll(autoHide, 400 + SCROLL_THRESHOLD);
    expect(autoHide.hidden).toBe(true);
  });

  it('starts within the scroller range, past an overscroll bounce', () => {
    const autoHide = new AutoHide();
    autoHide.startAt({ offset: END + 60, ...PAGE });
    expect(autoHide.offset).toBe(END);
  });
});
