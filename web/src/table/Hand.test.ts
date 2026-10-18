import { fireEvent, render, screen, within } from '@testing-library/svelte';
import Hand from './Hand.svelte';
import { hover } from './hover.svelte';
import { fanPositions } from './layout';
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

afterEach(() => {
  vi.restoreAllMocks();
  hover.reset();
});

describe('Hand', () => {
  it('renders one card per hand id in order', () => {
    render(Hand, { cards: CARDS, faceOf });

    const names = handCards().map((item) => within(item).getByRole('img').getAttribute('alt'));
    expect(names).toEqual(['Backflip', 'Swinging Web Kick', 'Energy']);
    expect(
      within(handCards()[0] as HTMLElement)
        .getByRole('img')
        .getAttribute('src'),
    ).toBe('01003.png');
  });

  it('lays the cards out on the fan of the measured width', () => {
    vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(1200);
    render(Hand, { cards: CARDS, faceOf });

    const slots = fanPositions(3, 1200);
    const fans = handCards().map((item) => item.querySelector<HTMLElement>('.fan'));
    expect(fans.map((fan) => fan?.style.getPropertyValue('--rot'))).toEqual(
      slots.map((slot) => `${slot.angle}deg`),
    );
    expect(fans.map((fan) => fan?.style.getPropertyValue('--ty'))).toEqual(
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

  it('hovering a card shows it in the preview', async () => {
    render(Hand, { cards: CARDS, faceOf });

    await fireEvent.pointerEnter(handCards()[1] as HTMLElement);
    expect(hover.hovered).toEqual({ kind: 'card', id: 'h2' });
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
