import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import Hand from './Hand.svelte';
import handSource from './Hand.svelte?raw';
import { interaction } from './interaction.svelte';
import { fanPositions, HAND_CARD, HAND_REST_SCALE, restingFanPositions } from './layout';
import { motion } from './motion.svelte';
import type { CardView as TableCard, PackFace } from '../lib/types';

const NAMES: Record<string, string> = {
  '01003': 'Backflip',
  '01005': 'Swinging Web Kick',
  '01088': 'Energy',
};

function handCard(id: string, code: string): TableCard {
  return { id, code, face: 0, back: 'player', owner: 0, zone: 'hand', x: 0, y: 0, z: 0 };
}

function faceOf(card: TableCard): PackFace | null {
  const name = card.code ? NAMES[card.code] : undefined;
  return name ? { name, type: 'event', size: 'std', images: [`${card.code}.png`] } : null;
}

const CARDS = [handCard('h1', '01003'), handCard('h2', '01005'), handCard('h3', '01088')];

function handList(): HTMLElement {
  return screen.getByRole('list', { name: 'Your hand' });
}

function handCards(): HTMLElement[] {
  return within(handList()).getAllByRole('listitem');
}

/** The declarations of a rule of the hand's stylesheet. */
function rule(selector: string): string {
  const pattern = new RegExp(`\\n {2}${selector.replace(/[.]/g, '\\.')} \\{([^}]*)\\}`);
  return pattern.exec(handSource)?.[1] ?? '';
}

afterEach(() => {
  vi.restoreAllMocks();
  interaction.reset();
  motion.stop();
});

describe('Hand', () => {
  it('renders one card per hand id in order', () => {
    render(Hand, { cards: CARDS, faceOf });

    const names = handCards().map((item) => within(item).getByRole('img').getAttribute('alt'));
    expect(names).toEqual(['Backflip', 'Swinging Web Kick', 'Energy']);
    expect(handCards().map((item) => item.dataset.id)).toEqual(['h1', 'h2', 'h3']);
    expect(
      within(handCards()[0] as HTMLElement)
        .getByRole('img')
        .getAttribute('src'),
    ).toBe('01003.png');
  });

  it('lays the resting fan out for the base cards, and spreads it for the raised ones', async () => {
    vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(1200);
    const raised = { w: 238, h: 333 };
    const props = { cards: CARDS, faceOf, cardSize: raised, restCardSize: HAND_CARD };
    const { rerender } = render(Hand, props);
    const xs = () => handCards().map((item) => item.style.getPropertyValue('--x'));

    const resting = restingFanPositions(3, 1200, HAND_CARD.w, raised.w).map(
      (slot) => `${slot.x}px`,
    );
    expect(xs()).toEqual(resting);

    await rerender({ ...props, open: true });
    const raisedFan = fanPositions(3, 1200, raised.w).map((slot) => `${slot.x}px`);
    expect(xs()).toEqual(raisedFan);
    expect(raisedFan).not.toEqual(resting);
  });

  it('draws the resting hand as large as its base card at HAND_REST_SCALE', async () => {
    const { rerender } = render(Hand, { cards: CARDS, faceOf });
    expect(handList().style.getPropertyValue('--rest-scale')).toBe(`${HAND_REST_SCALE}`);

    await rerender({ cards: CARDS, faceOf, cardSize: { w: 238, h: 333 }, restCardSize: HAND_CARD });
    expect(Number(handList().style.getPropertyValue('--rest-scale'))).toBeCloseTo(0.6374, 4);
  });

  it('lays the cards out on the fan of the measured width', () => {
    vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(1200);
    render(Hand, { cards: CARDS, faceOf });

    // The card size comes from one place: the layout.
    expect(handList().style.getPropertyValue('--card-w')).toBe(`${HAND_CARD.w}px`);
    expect(handList().style.getPropertyValue('--card-h')).toBe(`${HAND_CARD.h}px`);

    const slots = fanPositions(3, 1200);
    // Set on the card, for both its drawn card and its hit area.
    expect(handCards().map((item) => item.style.getPropertyValue('--rot'))).toEqual(
      slots.map((slot) => `${slot.angle}deg`),
    );
    expect(handCards().map((item) => item.style.getPropertyValue('--ty'))).toEqual(
      slots.map((slot) => `${slot.y}px`),
    );
    expect(handCards().map((item) => item.style.getPropertyValue('--x'))).toEqual(
      slots.map((slot) => `${slot.x}px`),
    );
  });

  it('open state follows the pointer band', async () => {
    // Every card measures 600..732 × 700..885 on the screen.
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: 600, y: 700, width: 132, height: 185 }),
    );
    const { container } = render(Hand, { cards: CARDS, faceOf });
    const hand = handList();
    const veil = container.querySelector('.veil');
    const isOpen = () => hand.classList.contains('open');

    await fireEvent.pointerMove(window, { clientX: 650, clientY: 690 });
    expect(isOpen()).toBe(false);

    // Above the cards' top by less than the resting margin (6).
    await fireEvent.pointerMove(window, { clientX: 650, clientY: 696 });
    expect(isOpen()).toBe(true);
    expect(veil?.classList).toContain('open');

    // Open, the band grows by 24 on each side, down to the bottom of the window.
    await fireEvent.pointerMove(window, { clientX: 580, clientY: 680 });
    expect(isOpen()).toBe(true);
    await fireEvent.pointerMove(window, { clientX: 740, clientY: 2000 });
    expect(isOpen()).toBe(true);

    await fireEvent.pointerMove(window, { clientX: 650, clientY: 670 });
    expect(isOpen()).toBe(false);
    expect(veil?.classList).not.toContain('open');

    // Beside the cards, at the bottom: still closed.
    await fireEvent.pointerMove(window, { clientX: 590, clientY: 800 });
    expect(isOpen()).toBe(false);
  });

  it('the band covers the tilted cards beyond their slots', async () => {
    // The slots measure 600..732 × 700..885, the tilted cards 60 more on each side.
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      if (this.classList.contains('fan')) {
        return DOMRect.fromRect({ x: 540, y: 700, width: 252, height: 185 });
      }
      return DOMRect.fromRect({ x: 600, y: 700, width: 132, height: 185 });
    });
    render(Hand, { cards: CARDS, faceOf });
    const isOpen = () => handList().classList.contains('open');

    await fireEvent.pointerMove(window, { clientX: 650, clientY: 800 });
    expect(isOpen()).toBe(true);

    // On a tilted card, beyond its slot and the open margin (24): still open.
    await fireEvent.pointerMove(window, { clientX: 550, clientY: 800 });
    expect(isOpen()).toBe(true);
    await fireEvent.pointerMove(window, { clientX: 780, clientY: 800 });
    expect(isOpen()).toBe(true);

    // Beyond the tilted card and the open margin: lowered.
    await fireEvent.pointerMove(window, { clientX: 510, clientY: 800 });
    expect(isOpen()).toBe(false);
  });

  it('a drawn card waiting for its copy is hidden, and left out of the band until it lands', async () => {
    // h1 measures 600..732 on the screen, the others 900..1032.
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      const x = this.closest<HTMLElement>('.hcard')?.dataset.id === 'h1' ? 600 : 900;
      return DOMRect.fromRect({ x, y: 700, width: 132, height: 185 });
    });
    motion.drawing.add('h1');
    render(Hand, { cards: CARDS, faceOf });
    expect(handCards()[0]?.classList).toContain('arriving');

    await fireEvent.pointerMove(window, { clientX: 650, clientY: 800 });
    // Whatever measures the band as the hand is drawn is done.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(handList().classList).not.toContain('open');

    // Landed: it shows, and the band, measured again, takes it in under the resting pointer.
    motion.drawing.delete('h1');
    await waitFor(() => expect(handList().classList).toContain('open'));
    expect(handCards()[0]?.classList).not.toContain('arriving');
  });

  it('keeps the cards sliding to their other fan in the band', async () => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: 600, y: 700, width: 132, height: 185 }),
    );
    // jsdom has no Web Animations: every card runs a CSS transition, as when the hand opens.
    class FakeTransition {
      playState = 'running';
    }
    vi.stubGlobal('CSSTransition', FakeTransition);
    Object.defineProperty(Element.prototype, 'getAnimations', {
      configurable: true,
      value: () => [new FakeTransition()],
    });
    try {
      render(Hand, { cards: CARDS, faceOf });

      await fireEvent.pointerMove(window, { clientX: 650, clientY: 800 });
      expect(handList().classList).toContain('open');
      await fireEvent.pointerMove(window, { clientX: 652, clientY: 798 });
      expect(handList().classList).toContain('open');
    } finally {
      Reflect.deleteProperty(Element.prototype, 'getAnimations');
      vi.unstubAllGlobals();
    }
  });

  it('closes when the pointer leaves the window', async () => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: 600, y: 700, width: 132, height: 185 }),
    );
    render(Hand, { cards: CARDS, faceOf });

    await fireEvent.pointerMove(window, { clientX: 650, clientY: 800 });
    expect(handList().classList).toContain('open');

    await fireEvent.pointerLeave(document.documentElement);
    expect(handList().classList).not.toContain('open');
  });

  it('an empty hand never opens', async () => {
    render(Hand, { cards: [], faceOf });

    await fireEvent.pointerMove(window, { clientX: 0, clientY: 0 });
    expect(handList().classList).not.toContain('open');
  });

  it('hovering a card hovers it, with no preview', async () => {
    render(Hand, { cards: CARDS, faceOf });

    await fireEvent.pointerEnter(handCards()[1] as HTMLElement);
    expect(interaction.hovered).toEqual({ kind: 'hand', id: 'h2' });
    expect(interaction.previewed).toBeNull();
  });

  it('picks the hovered card from its place at rest, which the pop never moves', () => {
    render(Hand, { cards: CARDS, faceOf });
    for (const card of handCards()) {
      // The hit area comes before the drawn card, which lets the pointer through to it.
      expect([...card.children].map((child) => child.className.split(' ')[0])).toEqual([
        'hit',
        'foot',
        'fan',
      ]);
    }
    // Only the hit area takes the pointer, on the card's resting transform.
    expect(rule('.hcard')).toMatch(/pointer-events: none;/);
    expect(rule('.fan')).toMatch(/pointer-events: none;/);
    expect(rule('.hit')).toMatch(/pointer-events: auto;/);
    expect(rule('.hit')).toMatch(/transform: translateY\(var\(--ty\)\) rotate\(var\(--rot\)\);/);
    // The pop (hover, tap selection) changes the drawn card only, never the hit area.
    const popRules = [...handSource.matchAll(/\n {2}([^{}\n]*(?::hover|\.locked)[^{}]*)\{/g)].map(
      (match) => match[1] ?? '',
    );
    expect(popRules.length).toBeGreaterThan(0);
    for (const selector of popRules) {
      expect(selector).not.toContain('.hit');
      expect(selector).not.toContain('.foot');
    }
  });

  it('keeps a card popped under it, down to the bottom of the screen; the gap slot has no foot', () => {
    // A hand card dragged back over the fan, where it would slot in second.
    interaction.press({ kind: 'hand', id: 'h1' }, {
      button: 0,
      pointerId: 1,
      clientX: 0,
      clientY: 0,
      preventDefault: () => {},
    } as unknown as PointerEvent);
    interaction.lift('h1', ['h1']);
    interaction.handGap = 1;
    const { container } = render(Hand, { cards: CARDS, faceOf });

    const cards = handCards();
    expect(cards.map((card) => card.dataset.id)).toEqual(['h2', 'h3']);
    for (const card of cards) {
      expect(card.querySelector(':scope > .foot')).not.toBeNull();
    }
    const gap = container.querySelector('.hcard.gap');
    expect(gap).not.toBeNull();
    expect(gap?.querySelector('.foot')).toBeNull();

    // Upright, from the card's bottom on the arc down to the bottom of the hand (the window's), not
    // past it; it takes the pointer.
    const foot = rule('.foot');
    expect(foot).toMatch(/pointer-events: auto;/);
    expect(foot).toMatch(/top: calc\(100% \+ var\(--ty\)\);/);
    expect(foot).toMatch(/bottom: calc\(-1 \* var\(--pad-bottom\)\);/);
    expect(foot).not.toMatch(/transform/);
  });

  it('turns a landscape card a quarter to fit its slot', () => {
    const landscape = (card: TableCard): PackFace | null => {
      const face = faceOf(card);
      return face && { ...face, size: 'land' };
    };
    render(Hand, { cards: [handCard('h1', '01003')], faceOf: landscape });

    const image = within(handList()).getByRole('img', { name: 'Backflip' });
    expect(image.closest('.land-in-portrait')).not.toBeNull();
  });

  it('shows the back of a card it may not read', () => {
    localStorage.setItem('itf-theme', 'minimal');
    try {
      render(Hand, { cards: [{ ...handCard('h1', '01003'), faceDown: true }], faceOf });
      expect(within(handList()).getByRole('img', { name: 'Player card back' })).toBeTruthy();
    } finally {
      localStorage.clear();
    }
  });
});

describe('Hand raised by a tap', () => {
  it('Escape lowers it and takes the key (preventDefault); lowered, it leaves the key alone', async () => {
    render(Hand, { cards: CARDS, faceOf });
    const hand = handList();
    const [first] = handCards();
    await fireEvent.pointerDown(first!, { pointerType: 'touch' });
    await fireEvent.click(first!);
    expect(hand.classList).toContain('open');

    // fireEvent reports false for a prevented event.
    expect(await fireEvent.keyDown(window, { key: 'Escape' })).toBe(false);
    expect(hand.classList).not.toContain('open');
    expect(await fireEvent.keyDown(window, { key: 'Escape' })).toBe(true);
  });
});
