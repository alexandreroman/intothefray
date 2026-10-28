import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import Hand from './Hand.svelte';
import handSource from './Hand.svelte?raw';
import { interaction } from './interaction.svelte';
import {
  fanPositions,
  HAND_CARD,
  HAND_REST_SCALE,
  RAISED_FAN_SHARE,
  restingFanPositions,
} from './layout';
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

/** No card in these hands has a captioned back. */
function captionOf(): string | undefined {
  return undefined;
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
    render(Hand, { cards: CARDS, faceOf, captionOf, seat: 0 });

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
    const props = {
      cards: CARDS,
      faceOf,
      captionOf,
      seat: 0,
      cardSize: raised,
      restCardSize: HAND_CARD,
    };
    const { rerender } = render(Hand, props);
    const xs = () => handCards().map((item) => item.style.getPropertyValue('--x'));

    const resting = restingFanPositions(3, 1200, HAND_CARD.w, raised.w).map(
      (slot) => `${slot.x}px`,
    );
    expect(xs()).toEqual(resting);

    await rerender({ ...props, open: true });
    const raisedFan = fanPositions(3, RAISED_FAN_SHARE * 1200, raised.w).map(
      (slot) => `${slot.x}px`,
    );
    expect(xs()).toEqual(raisedFan);
    expect(raisedFan).not.toEqual(resting);
  });

  it('spreads the raised fan over 80 % of the hand, in its middle', async () => {
    vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(1200);
    const many = Array.from({ length: 12 }, (_, i) => handCard(`m${i}`, '01003'));
    const raised = { w: 238, h: 333 };
    render(Hand, {
      cards: many,
      faceOf,
      captionOf,
      seat: 0,
      cardSize: raised,
      restCardSize: HAND_CARD,
      open: true,
    });

    expect(RAISED_FAN_SHARE).toBe(0.8);
    const xs = handCards().map((item) => Number.parseFloat(item.style.getPropertyValue('--x')));
    // Too many cards for 960 px: they close up more than they would over the whole 1200.
    expect(xs).toEqual(fanPositions(12, 960, raised.w).map((slot) => slot.x));
    expect(xs).not.toEqual(fanPositions(12, 1200, raised.w).map((slot) => slot.x));
    expect(xs[0]).toBeCloseTo(-xs[11]!);
  });

  it('draws the resting hand as large as its base card at HAND_REST_SCALE', async () => {
    const { rerender } = render(Hand, { cards: CARDS, faceOf, captionOf, seat: 0 });
    expect(handList().style.getPropertyValue('--rest-scale')).toBe(`${HAND_REST_SCALE}`);

    await rerender({
      cards: CARDS,
      faceOf,
      captionOf,
      seat: 0,
      cardSize: { w: 238, h: 333 },
      restCardSize: HAND_CARD,
    });
    expect(Number(handList().style.getPropertyValue('--rest-scale'))).toBeCloseTo(0.6374, 4);
  });

  it('lays the cards out on the fan of the measured width', () => {
    vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(1200);
    render(Hand, { cards: CARDS, faceOf, captionOf, seat: 0 });

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
    const { container } = render(Hand, { cards: CARDS, faceOf, captionOf, seat: 0 });
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
    render(Hand, { cards: CARDS, faceOf, captionOf, seat: 0 });
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

  it('stays raised as the card under the pointer leaves it, until the pointer leaves where it was', async () => {
    // Three cards side by side; with the last one gone, the fan closes up around the middle.
    let lefts: Record<string, number> = { h1: 600, h2: 700, h3: 800 };
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      const id = this.closest<HTMLElement>('.hcard')?.dataset.id ?? '';
      return DOMRect.fromRect({ x: lefts[id] ?? 0, y: 700, width: 132, height: 185 });
    });
    const { rerender } = render(Hand, { cards: CARDS, faceOf, captionOf, seat: 0 });
    const isOpen = () => handList().classList.contains('open');

    // Over the last card, then on its outer part: the open band is 576..956.
    await fireEvent.pointerMove(window, { clientX: 850, clientY: 800 });
    await fireEvent.pointerMove(window, { clientX: 920, clientY: 800 });
    expect(isOpen()).toBe(true);

    // Discarded with a key: the new band (626..906) leaves the resting pointer out.
    lefts = { h1: 650, h2: 750 };
    await rerender({ cards: CARDS.slice(0, 2), faceOf, captionOf, seat: 0 });
    // The band is measured again once the hand has settled.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(handCards().map((item) => item.dataset.id)).toEqual(['h1', 'h2']);
    expect(isOpen()).toBe(true);

    // Where the card was: still raised. Out of where it was too: lowered.
    await fireEvent.pointerMove(window, { clientX: 940, clientY: 800 });
    expect(isOpen()).toBe(true);
    await fireEvent.pointerMove(window, { clientX: 1000, clientY: 800 });
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
    render(Hand, { cards: CARDS, faceOf, captionOf, seat: 0 });
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
      render(Hand, { cards: CARDS, faceOf, captionOf, seat: 0 });

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
    render(Hand, { cards: CARDS, faceOf, captionOf, seat: 0 });

    await fireEvent.pointerMove(window, { clientX: 650, clientY: 800 });
    expect(handList().classList).toContain('open');

    await fireEvent.pointerLeave(document.documentElement);
    expect(handList().classList).not.toContain('open');
  });

  it('an empty hand never opens', async () => {
    render(Hand, { cards: [], faceOf, captionOf, seat: 0 });

    await fireEvent.pointerMove(window, { clientX: 0, clientY: 0 });
    expect(handList().classList).not.toContain('open');
  });

  it('hovering a card hovers it, with no preview', async () => {
    render(Hand, { cards: CARDS, faceOf, captionOf, seat: 0 });

    await fireEvent.pointerEnter(handCards()[1] as HTMLElement);
    expect(interaction.hovered).toEqual({ kind: 'hand', id: 'h2' });
    expect(interaction.previewed).toBeNull();
  });

  it('picks the hovered card from its place at rest, which the pop never moves', () => {
    render(Hand, { cards: CARDS, faceOf, captionOf, seat: 0 });
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

  it('pops the hovered card up, 1.3 times as large, keeping its tilt', () => {
    const pop =
      /\n {2}\.hand:not\(\.pinned, \.inactive\) \.hcard:hover \.fan,\n {2}\.hcard\.locked \.fan \{([^}]*)\}/.exec(
        handSource,
      )?.[1];
    expect(pop).toMatch(
      /transform: translateY\(calc\(var\(--ty\) - 31px\)\) rotate\(var\(--rot\)\) scale\(1\.3\);/,
    );
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
    const { container } = render(Hand, { cards: CARDS, faceOf, captionOf, seat: 0 });

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
    render(Hand, { cards: [handCard('h1', '01003')], faceOf: landscape, captionOf, seat: 0 });

    const image = within(handList()).getByRole('img', { name: 'Backflip' });
    expect(image.closest('.land-in-portrait')).not.toBeNull();
  });

  it('shows the back of a card it may not read', () => {
    localStorage.setItem('itf-theme', 'minimal');
    try {
      render(Hand, {
        cards: [{ ...handCard('h1', '01003'), faceDown: true }],
        faceOf,
        captionOf,
        seat: 0,
      });
      expect(within(handList()).getByRole('img', { name: 'Player card back' })).toBeTruthy();
    } finally {
      localStorage.clear();
    }
  });
});

describe('Hand raised by a tap', () => {
  it('Escape lowers it and takes the key (preventDefault); lowered, it leaves the key alone', async () => {
    render(Hand, { cards: CARDS, faceOf, captionOf, seat: 0 });
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

describe('Hand beside another one', () => {
  // Every card measures 600..732 × 700..885 on the screen.
  function cardsAt600(): void {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: 600, y: 700, width: 132, height: 185 }),
    );
  }

  const isOpen = () => handList().classList.contains('open');

  it('lays its fan out in its own room, glowing in its seat colour', () => {
    render(Hand, {
      cards: CARDS,
      faceOf,
      captionOf,
      seat: 1,
      color: 'var(--p2)',
      inset: { left: 300, right: 450 },
    });

    const hand = handList();
    expect(hand.dataset.seat).toBe('1');
    expect(hand.style.marginLeft).toBe('300px');
    expect(hand.style.marginRight).toBe('450px');
    expect(hand.style.getPropertyValue('--seat')).toBe('var(--p2)');
    // The glow sits behind the cards, from below, in the seat colour; weaker on an inactive hand.
    expect(rule('.hand::before')).toMatch(/radial-gradient\([^;]*var\(--seat\)/);
    expect(rule('.hand::before')).toMatch(/pointer-events: none;/);
    expect(rule('.hand.inactive::before')).toMatch(/opacity: 0\.6;/);
  });

  it('draws its backdrop across the whole table, behind its cards, once for two hands', async () => {
    render(Hand, { cards: CARDS, faceOf, captionOf, seat: 0, inset: { left: 300, right: 200 } });

    // Not on its own box, whose sides lie in from the table's: past them, both ways, far enough
    // to reach the window's edges under the rest scale.
    expect(rule('.hand')).not.toMatch(/background/);
    const backdrop = rule('.hand::after');
    expect(backdrop).toMatch(/background: linear-gradient\(to top, #07090fe6 0%/);
    expect(backdrop).toMatch(/left: -400vw;/);
    expect(backdrop).toMatch(/right: -400vw;/);
    expect(backdrop).toMatch(/z-index: -1;/);
    expect(backdrop).toMatch(/pointer-events: none;/);
    // The inactive hand shares the active one's.
    expect(rule('.hand.inactive::after')).toMatch(/content: none;/);

    // Tinted while a table card would go to a hand, this one or the other one.
    expect(rule('.hand.tinted::after')).toMatch(
      /background: linear-gradient\(to top, #123349f0 0%/,
    );
    expect(handList().classList).not.toContain('tinted');
    interaction.dropOn = { kind: 'hand', id: 'p1' };
    await tick();
    expect(handList().classList).toContain('tinted');
    expect(handList().classList).not.toContain('drop');
  });

  it('is marked inactive, dimmed at the same size, and draws no veil', () => {
    const { container } = render(Hand, { cards: CARDS, faceOf, captionOf, seat: 1, active: false });

    expect(handList().classList).toContain('inactive');
    expect(container.querySelector('.veil')).toBeNull();
    expect(rule('.hand.inactive')).toMatch(/opacity: 0\.8;/);
    expect(rule('.hand.inactive')).not.toMatch(/transform/);
  });

  it('rests at its place beside the other hand, and rises over the middle of its room', async () => {
    vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(1200);
    const props = {
      cards: CARDS,
      faceOf,
      captionOf,
      seat: 1,
      restPlace: { offset: 164, width: 600 },
    };
    const { rerender } = render(Hand, props);
    const xs = () =>
      handCards().map((item) => Number.parseFloat(item.style.getPropertyValue('--x')));

    // Laid out for half the room, 164 px right of its middle as seen: 200 px before the rest scale.
    const resting = restingFanPositions(3, 600, HAND_CARD.w, HAND_CARD.w);
    expect(xs()).toEqual(resting.map((slot) => slot.x + 164 / HAND_REST_SCALE));
    expect(handList().dataset.restX).toBe('164');
    // The glow follows the fan.
    expect(Number.parseFloat(handList().style.getPropertyValue('--fan-x'))).toBeCloseTo(
      164 / HAND_REST_SCALE,
    );

    await rerender({ ...props, open: true });
    expect(xs()).toEqual(fanPositions(3, RAISED_FAN_SHARE * 1200).map((slot) => slot.x));
  });

  it('fades out while the other hand is raised, turning active by no pointer', async () => {
    cardsAt600();
    const onactivate = vi.fn();
    const props = { cards: CARDS, faceOf, captionOf, seat: 1, active: false, onactivate };
    const { rerender } = render(Hand, { ...props, hidden: true });
    expect(handList().classList).toContain('hidden');
    expect(rule('.hand.hidden')).toMatch(/opacity: 0;/);
    expect(rule('.hand.hidden')).toMatch(/visibility: hidden;/);

    await fireEvent.pointerMove(window, { clientX: 650, clientY: 800 });
    expect(onactivate).not.toHaveBeenCalled();

    // Back once the other one lowers.
    await rerender({ ...props, hidden: false });
    expect(handList().classList).not.toContain('hidden');
    await fireEvent.pointerMove(window, { clientX: 652, clientY: 800 });
    expect(onactivate).toHaveBeenCalled();
  });

  it('never opens, and turns active when the pointer comes into its band', async () => {
    cardsAt600();
    const onactivate = vi.fn();
    render(Hand, { cards: CARDS, faceOf, captionOf, seat: 1, active: false, onactivate });

    await fireEvent.pointerMove(window, { clientX: 650, clientY: 690 });
    expect(onactivate).not.toHaveBeenCalled();

    await fireEvent.pointerMove(window, { clientX: 650, clientY: 800 });
    expect(onactivate).toHaveBeenCalled();
    expect(isOpen()).toBe(false);
  });

  it('takes no hover nor press on its cards', async () => {
    render(Hand, { cards: CARDS, faceOf, captionOf, seat: 1, active: false });

    const [card] = handCards();
    await fireEvent.pointerEnter(card!);
    expect(interaction.hovered).toBeNull();
    await fireEvent.pointerDown(card!, { button: 0, pointerId: 1 });
    expect(interaction.held).toBeNull();
    // Nor does it pop under a hovering pointer.
    const popRules = [...handSource.matchAll(/\n {2}([^{}\n]*:hover[^{}]*)\{/g)].map(
      (match) => match[1] ?? '',
    );
    for (const selector of popRules.filter((selector) => selector.includes('.hcard:hover'))) {
      expect(selector).toContain(':not(.pinned, .inactive)');
    }
  });

  it('turns active, without rising, on a tap', async () => {
    const onactivate = vi.fn();
    render(Hand, { cards: CARDS, faceOf, captionOf, seat: 1, active: false, onactivate });

    const [card] = handCards();
    await fireEvent.pointerDown(card!, { pointerType: 'touch' });
    await fireEvent.click(card!);
    expect(onactivate).toHaveBeenCalledOnce();
    expect(isOpen()).toBe(false);
  });

  it('activates nothing while a card is dragged', async () => {
    cardsAt600();
    const onactivate = vi.fn();
    interaction.press({ kind: 'card', id: 't1' }, {
      button: 0,
      pointerId: 1,
      clientX: 0,
      clientY: 0,
      preventDefault: () => {},
    } as unknown as PointerEvent);
    interaction.lift('t1', ['t1']);
    render(Hand, { cards: CARDS, faceOf, captionOf, seat: 1, active: false, onactivate });

    await fireEvent.pointerMove(window, { clientX: 650, clientY: 800 });
    expect(onactivate).not.toHaveBeenCalled();
  });

  it('rises at once when it turns active under the pointer', async () => {
    cardsAt600();
    const props = { cards: CARDS, faceOf, captionOf, seat: 1 };
    const { rerender } = render(Hand, { ...props, active: false, onactivate: () => {} });
    await fireEvent.pointerMove(window, { clientX: 650, clientY: 800 });
    expect(isOpen()).toBe(false);

    await rerender({ ...props, active: true });
    expect(isOpen()).toBe(true);
  });

  it('goes down when it turns inactive, even pinned up by a tap', async () => {
    const props = { cards: CARDS, faceOf, captionOf, seat: 0 };
    const { rerender } = render(Hand, props);
    const [card] = handCards();
    await fireEvent.pointerDown(card!, { pointerType: 'touch' });
    await fireEvent.click(card!);
    expect(isOpen()).toBe(true);

    await rerender({ ...props, active: false });
    expect(isOpen()).toBe(false);
  });

  it("opens no gap for a card of another hand, and takes only a drop meant for its own seat's hand", async () => {
    // A card of seat 0's hand dragged back over the fan.
    interaction.press({ kind: 'hand', id: 'x1' }, {
      button: 0,
      pointerId: 1,
      clientX: 0,
      clientY: 0,
      preventDefault: () => {},
    } as unknown as PointerEvent);
    interaction.lift('x1', ['x1']);
    interaction.handGap = 1;
    const { container } = render(Hand, { cards: CARDS, faceOf, captionOf, seat: 1 });
    expect(container.querySelector('.hcard.gap')).toBeNull();
    expect(isOpen()).toBe(false);

    interaction.dropOn = { kind: 'hand', id: 'p0' };
    await tick();
    expect(handList().classList).not.toContain('drop');
    interaction.dropOn = { kind: 'hand', id: 'p1' };
    await tick();
    expect(handList().classList).toContain('drop');
  });
});
