// A view's motions measure the page before they start anything (motion.animate): a write between
// two measures would make the browser lay the page out again, once per card, in the view's first
// frame.
import { motion } from './motion.svelte';
import type { Anim } from './animate';
import type { CardView, PileView, TableView } from '../lib/types';
import { card } from './fixtures.testing';

const DISCARD: PileView = {
  id: 'disc',
  kind: 'discard',
  owner: 0,
  x: 0,
  y: 0,
  count: 0,
  cards: [],
};

function table(cards: CardView[], piles: PileView[]): TableView {
  return { cards, piles, stages: [] } as unknown as TableView;
}

/** A card or pile on the surface, placed by its style (see fakeRect). */
function placedBox(className: string, id: string, left: number, top: number): HTMLElement {
  const element = document.createElement('div');
  element.className = className;
  element.dataset.id = id;
  Object.assign(element.style, {
    left: `${left}px`,
    top: `${top}px`,
    width: '112px',
    height: '157px',
  });
  const shade = document.createElement('div');
  shade.className = 'shade';
  element.append(shade);
  return element;
}

/** What the page was asked, in order: a measure ("read") or a change ("write"). */
let log: string[] = [];

function fakeRect(this: HTMLElement): DOMRect {
  log.push('read: rect');
  const left = Number.parseFloat(this.style.left) || 0;
  const top = Number.parseFloat(this.style.top) || 0;
  const width = Number.parseFloat(this.style.width) || 0;
  const height = Number.parseFloat(this.style.height) || 0;
  return { left, top, width, height, right: left + width, bottom: top + height } as DOMRect;
}

function fakeAnimate(this: Element): Animation {
  log.push(`write: animate ${(this as HTMLElement).dataset.id ?? this.className}`);
  return { finished: new Promise(() => {}), cancel: () => {} } as unknown as Animation;
}

let originals: {
  animate: typeof Element.prototype.animate;
  rect: typeof HTMLElement.prototype.getBoundingClientRect;
};

beforeEach(() => {
  log = [];
  originals = {
    animate: Element.prototype.animate,
    rect: HTMLElement.prototype.getBoundingClientRect,
  };
  Element.prototype.animate = fakeAnimate as unknown as typeof Element.prototype.animate;
  HTMLElement.prototype.getBoundingClientRect = fakeRect;
  for (const side of ['offsetWidth', 'offsetHeight'] as const) {
    vi.spyOn(HTMLElement.prototype, side, 'get').mockImplementation(function (this: HTMLElement) {
      log.push(`read: ${side}`);
      return Number.parseFloat(side === 'offsetWidth' ? this.style.width : this.style.height) || 0;
    });
  }
  const computed = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
    log.push('read: computed style');
    return computed(element, pseudo);
  });
  const append = Element.prototype.append;
  vi.spyOn(Element.prototype, 'append').mockImplementation(function (this: Element, ...nodes) {
    if (this.isConnected) {
      log.push('write: append');
    }
    append.apply(this, nodes);
  });
});

afterEach(() => {
  Element.prototype.animate = originals.animate;
  HTMLElement.prototype.getBoundingClientRect = originals.rect;
  motion.stop();
  motion.flights = [];
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('a view landing', () => {
  it('measures every card, pile and style before it starts any motion', async () => {
    const app = document.createElement('div');
    app.className = 'app';
    const surface = document.createElement('div');
    surface.className = 'surface';
    const a = placedBox('card', 'a', 0, 0);
    const b = placedBox('card', 'b', 200, 0);
    const c = placedBox('card', 'c', 400, 0);
    const d = placedBox('card', 'd', 600, 0);
    const e = placedBox('card', 'e', 0, 300);
    const discard = placedBox('card pile', 'disc', 800, 0);
    discard.append(Object.assign(document.createElement('div'), { className: 'art' }));
    surface.append(a, b, c, d, e, discard);
    app.append(surface);
    document.body.append(app);

    const before = table(
      ['a', 'b', 'c', 'd', 'e'].map((id) => card(id)),
      [DISCARD],
    );
    const after = table(
      [card('a'), card('b'), card('c'), card('d'), card('e', { zone: 'pile' })],
      [{ ...DISCARD, count: 1, cards: ['e'] }],
    );
    const anims: Anim[] = [
      {
        kind: 'move',
        id: 'a',
        from: { zone: 'table', x: 0, y: 0 },
        to: { zone: 'table', x: 50, y: 50 },
      },
      {
        kind: 'move',
        id: 'b',
        from: { zone: 'table', x: 200, y: 0 },
        to: { zone: 'table', x: 250, y: 50 },
      },
      { kind: 'flip', id: 'c' },
      { kind: 'turnIn', id: 'd' },
      { kind: 'tilt', id: 'b', exhausted: true },
      { kind: 'glow', id: 'a', color: 1 },
      { kind: 'fly', id: 'e', toPile: 'disc' },
      { kind: 'shuffle', pile: 'disc' },
    ];
    const playing = motion.animate(app, anims, { before, after }, 1);
    // The new view draws the moved cards in their new places.
    a.style.left = '50px';
    a.style.top = '50px';
    b.style.left = '250px';
    b.style.top = '50px';
    log = [];
    await playing;

    const firstWrite = log.findIndex((entry) => entry.startsWith('write'));
    expect(firstWrite).toBeGreaterThan(0);
    expect(log.slice(firstWrite).filter((entry) => entry.startsWith('read'))).toEqual([]);
    // Everything started all the same.
    for (const id of ['a', 'b', 'c', 'd']) {
      expect(log).toContain(`write: animate ${id}`);
    }
    expect(log).toContain('write: append');
    expect(motion.flights.map((flight) => flight.card?.id)).toEqual(['e']);
  });
});
