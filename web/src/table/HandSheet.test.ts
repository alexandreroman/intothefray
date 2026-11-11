import { createEvent, fireEvent, render, screen, within } from '@testing-library/svelte';
import { createRawSnippet, flushSync } from 'svelte';
import HandSheet from './HandSheet.svelte';
import sheetSource from './HandSheet.svelte?raw';
import { interaction } from './interaction.svelte';
import { motion } from './motion.svelte';
import { DOCK_MODE_KEY } from './dockMode';
import type { CardView as TableCard, PackFace } from '../lib/types';

const NAMES: Record<string, string> = {
  '01003': 'Backflip',
  '01005': 'Swinging Web Kick',
  '01088': 'Energy',
};

function handCard(id: string, code: string): TableCard {
  return { id, code, face: 0, back: 'player', owner: 1, zone: 'hand', x: 0, y: 0, z: 0 };
}

function faceOf(card: TableCard): PackFace | null {
  const name = card.code ? NAMES[card.code] : undefined;
  return name ? { name, type: 'event', size: 'std', images: [`${card.code}.png`] } : null;
}

const CARDS = [handCard('h1', '01003'), handCard('h2', '01005'), handCard('h3', '01088')];

function renderSheet(
  props: {
    cards?: TableCard[];
    withPicker?: boolean;
    landscape?: boolean;
    canDiscard?: (id: string) => boolean;
  } = {},
) {
  const handlers = {
    onplay: vi.fn(),
    ondiscard: vi.fn(),
    onclose: vi.fn(),
  };
  const picker = createRawSnippet(() => ({
    render: () => '<button type="button">Spider-Man</button>',
  }));
  const view = render(HandSheet, {
    props: {
      cards: props.cards ?? CARDS,
      faceOf,
      seat: 1,
      landscape: props.landscape ?? false,
      canDiscard: props.canDiscard ?? (() => true),
      picker: props.withPicker ? picker : undefined,
      ...handlers,
    },
    // The hand sheet opens from the dock only.
    context: new Map([[DOCK_MODE_KEY, { current: true }]]),
  });
  return { ...handlers, view };
}

function carousel(): HTMLElement {
  return screen.getByRole('list', { name: 'Cards in hand' });
}

function cardItems(): HTMLElement[] {
  return within(carousel()).getAllByRole('listitem');
}

/** Lays the carousel out 300 px wide, with its cards 200 px wide side by side, scrolled `scroll` px. */
function layOut(scroll: number): void {
  const box = (left: number, width: number) =>
    DOMRect.fromRect({ x: left, y: 0, width, height: 280 });
  vi.spyOn(carousel(), 'getBoundingClientRect').mockReturnValue(box(0, 300));
  cardItems().forEach((item, i) => {
    vi.spyOn(item, 'getBoundingClientRect').mockReturnValue(box(50 + i * 212 - scroll, 200));
  });
}

/** The declarations of a rule of the sheet's stylesheet. */
function rule(selector: string): string {
  const escaped = selector.replace(/[.()[\]*+]/g, (c) => `\\${c}`);
  const pattern = new RegExp(`\\n {2}${escaped} \\{([^}]*)\\}`);
  return pattern.exec(sheetSource)?.[1] ?? '';
}

afterEach(() => {
  vi.restoreAllMocks();
  interaction.reset();
  motion.drawing.clear();
});

/** Fires a touch event of one finger at (x, y), at `at` ms; tells whether it was let through. */
async function touch(
  target: Element,
  type: 'touchStart' | 'touchMove' | 'touchEnd',
  x: number,
  y: number,
  at: number,
): Promise<boolean> {
  const point = { identifier: 1, clientX: x, clientY: y };
  const touches = type === 'touchEnd' ? [] : [point];
  const event = createEvent[type](target, { touches, changedTouches: [point] });
  Object.defineProperty(event, 'timeStamp', { value: at });
  return fireEvent(target, event);
}

/** The header's title: "Your hand", then the hand size. */
function title(): HTMLElement {
  return screen.getByText('Your hand', { selector: '.title' });
}

describe('HandSheet', () => {
  it('is a sheet that shows the hand count and each card face', () => {
    renderSheet();

    expect(screen.getByRole('dialog', { name: 'Your hand' })).toBeTruthy();
    // The size in the piles' capsule, after the words, no middle dot between them.
    expect(title().textContent).toBe('Your hand 3');
    expect(title().querySelector('.count')?.classList.contains('count-pill')).toBe(true);
    expect(title().querySelector('.count')?.textContent).toBe('3');
    expect(cardItems()).toHaveLength(3);
    expect(screen.getByRole('img', { name: 'Swinging Web Kick' })).toBeTruthy();
  });

  it('hides a card still drawing in its slot, its count stepping up as it lands', () => {
    motion.drawing.add('h3');
    renderSheet();

    expect(title().querySelector('.count')?.textContent).toBe('2');
    const arriving = cardItems().map((item) => item.classList.contains('arriving'));
    expect(arriving).toEqual([false, false, true]);
    expect(rule('.hcard.arriving')).toMatch(/opacity: 0;/);

    motion.drawing.delete('h3');
    flushSync();
    expect(title().querySelector('.count')?.textContent).toBe('3');
    expect(cardItems().some((item) => item.classList.contains('arriving'))).toBe(false);
  });

  it('renders the picker in the header when given', () => {
    renderSheet({ withPicker: true });

    const header = title().closest('header')!;
    expect(within(header).getByRole('button', { name: 'Spider-Man' })).toBeTruthy();
  });

  it('says so when the hand is empty, with no actions', () => {
    renderSheet({ cards: [] });

    expect(screen.getByText('No cards in hand')).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Cards in hand' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Play' })).toBeNull();
  });

  it('acts on the first card before any scroll', async () => {
    const { onplay, ondiscard } = renderSheet();

    await fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Discard' }));

    expect(onplay).toHaveBeenCalledWith('h1');
    expect(ondiscard).toHaveBeenCalledWith('h1');
  });

  it('acts on the card the carousel snapped to the centre', async () => {
    const { onplay, ondiscard } = renderSheet();

    layOut(212);
    await fireEvent.scroll(carousel());
    await fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Discard' }));

    expect(onplay).toHaveBeenCalledWith('h2');
    expect(ondiscard).toHaveBeenCalledWith('h2');
  });

  it('leaves Discard out for a centred card that has no discard pile, Play then alone on its line', async () => {
    renderSheet({ canDiscard: (id) => id !== 'h2' });

    expect(screen.getByRole('button', { name: 'Discard' })).toBeTruthy();

    layOut(212);
    await fireEvent.scroll(carousel());
    expect(screen.queryByRole('button', { name: 'Discard' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
    // A lone button takes the whole width, as buttonGrid lays one out.
    expect(rule('.actions button:only-child')).toContain('grid-column: 1 / -1;');
  });

  it('marks the centred card and its dot', async () => {
    const { view } = renderSheet();

    layOut(424);
    await fireEvent.scroll(carousel());

    expect(cardItems().map((item) => item.getAttribute('aria-current'))).toEqual([
      null,
      null,
      'true',
    ]);
    const dots = [...view.container.ownerDocument.querySelectorAll('.dots i')];
    expect(dots.map((dot) => dot.classList.contains('on'))).toEqual([false, false, true]);
  });

  it('keeps acting on a card in range when the centred one leaves the hand', async () => {
    const { onplay, view } = renderSheet();

    layOut(424);
    await fireEvent.scroll(carousel());
    await view.rerender({ cards: CARDS.slice(0, 2) });
    await fireEvent.click(screen.getByRole('button', { name: 'Play' }));

    expect(onplay).toHaveBeenCalledWith('h2');
  });

  it('is marked up for the drag layer as the seat hand', () => {
    renderSheet();

    const root = carousel();
    expect(root.classList.contains('hand')).toBe(true);
    expect(root.dataset.seat).toBe('1');
    // A carousel: a finger moving sideways on a card scrolls it, and only an upward move drags.
    expect(root.dataset.carousel).toBeDefined();
    expect(cardItems().map((item) => item.dataset.id)).toEqual(['h1', 'h2', 'h3']);
    for (const item of cardItems()) {
      expect(item.classList.contains('hcard')).toBe(true);
      expect(item.querySelector('.fan img')).toBeTruthy();
    }
  });

  it('scrolls sideways only, leaving vertical moves to the drag and two fingers to the page zoom', () => {
    expect(rule('.hand')).toContain('touch-action: pan-x pinch-zoom;');
    expect(rule('.hand')).toContain('scroll-snap-type: x mandatory;');
    expect(rule('.hcard')).toContain('scroll-snap-align: center;');
  });

  it('presses a card as a hand card', async () => {
    const press = vi.spyOn(interaction, 'press').mockImplementation(() => {});
    renderSheet();

    await fireEvent.pointerDown(cardItems()[1]!, { pointerId: 3, button: 0 });

    expect(press).toHaveBeenCalledOnce();
    expect(press.mock.calls[0]![0]).toEqual({ kind: 'hand', id: 'h2' });
  });

  it('starts a hold on a real press of a card, the sheet freezing nothing', async () => {
    renderSheet();

    await fireEvent.pointerDown(cardItems()[1]!, { pointerId: 3, button: 0 });

    expect(interaction.held?.element).toEqual({ kind: 'hand', id: 'h2' });
  });

  it('stays open on a press alone', () => {
    const { onclose } = renderSheet();

    interaction.held = {
      element: { kind: 'hand', id: 'h2' },
      pointerId: 3,
      start: { x: 0, y: 0 },
      moved: false,
      card: null,
      lifted: [],
    };
    flushSync();

    expect(onclose).not.toHaveBeenCalled();
  });

  it('closes once the press becomes a drag', () => {
    const { onclose } = renderSheet();

    interaction.held = {
      element: { kind: 'hand', id: 'h2' },
      pointerId: 3,
      start: { x: 0, y: 0 },
      moved: true,
      card: 'h2',
      lifted: ['h2'],
    };
    flushSync();

    expect(onclose).toHaveBeenCalledOnce();
  });

  describe('a finger on a card', () => {
    const finger = { pointerId: 3, pointerType: 'touch', isPrimary: true, button: 0 };

    it('swiping down drags the sheet down and closes it, no card drag started', async () => {
      const { onclose } = renderSheet();
      const card = cardItems()[1]!;

      await fireEvent.pointerDown(card, { ...finger, clientX: 150, clientY: 200 });
      await touch(card, 'touchStart', 150, 200, 0);
      expect(await touch(card, 'touchMove', 150, 220, 100)).toBe(false);
      await touch(card, 'touchMove', 150, 300, 400);
      expect(screen.getByRole('dialog', { name: 'Your hand' }).style.transform).toBe(
        'translateY(80px)',
      );
      await touch(card, 'touchEnd', 150, 300, 800);

      expect(onclose).toHaveBeenCalledOnce();
      expect(interaction.dragging).toBeNull();
    });

    it('moving up is left to the card drag', async () => {
      const { onclose } = renderSheet();
      const card = cardItems()[1]!;

      await touch(card, 'touchStart', 150, 200, 0);
      expect(await touch(card, 'touchMove', 150, 180, 50)).toBe(true);
      await touch(card, 'touchMove', 150, 100, 100);
      await touch(card, 'touchEnd', 150, 100, 150);

      expect(onclose).not.toHaveBeenCalled();
    });
  });

  describe('the screen used to the full', () => {
    it('is a dock sheet', () => {
      renderSheet();

      expect(screen.getByRole('dialog', { name: 'Your hand' }).classList).toContain('dock');
    });

    it('has a one-line header, the hero first', () => {
      renderSheet({ withPicker: true });

      const header = title().closest('header')!;
      expect(header.firstElementChild?.textContent).toBe('Spider-Man');
      expect(rule('header')).toContain('white-space: nowrap;');
    });

    it('sizes the card so that the actions fit under it, upright', () => {
      const body = rule('.body');
      expect(body).toContain('--card-h: calc(var(--sheet-room, 85dvh) - var(--chrome));');
      expect(body).toContain('--card-w: min(80%, calc(var(--card-h) * 185 / 259));');
      expect(rule('.actions button')).toContain('min-height: 48px;');
    });

    it('lights a pressed action up, and darkens a pressed Play, as the primary button', () => {
      // Their own rules outweigh every button's press (tokens.css): they give it back.
      expect(rule('.actions button:active')).toContain('background-color: var(--hover);');
      expect(rule('.actions .play:active')).toContain('background-color: var(--accent-deep);');
    });

    it('holds the carousel and its dots together', () => {
      renderSheet();

      const stage = carousel().parentElement!;
      expect(stage.classList).toContain('stage');
      expect(stage.querySelector('.dots')).toBeTruthy();
    });

    it('on its side, puts the header and the stacked actions right of a full-height carousel', () => {
      renderSheet({ landscape: true });

      expect(document.querySelector('.body')?.classList).toContain('landscape');
      const side = rule('.body.landscape');
      expect(side).toContain(
        "grid-template-areas:\n      'stage head'\n      'stage .'\n      'stage actions';",
      );
      expect(side).toContain('--card-w: calc(var(--card-h) * 185 / 259);');
      expect(rule('.body.landscape .actions')).toContain('grid-template-columns: 1fr;');
    });

    it('shows the hero avatar 32 px round with a 2 px ring, the whole ring inside the header', () => {
      const avatar = rule('header :global(.deck-avatar)');
      expect(avatar).toContain('width: 32px;');
      expect(avatar).toContain('height: 32px;');
      expect(avatar).toContain('box-shadow: 0 0 0 2px var(--seat);');
      // The ring reaches 2 px past the avatar: the header leaves that much room on its left, and
      // its 40 px line leaves 4 px above and below the 32 px avatar.
      const header = rule('header');
      expect(header).toContain('align-items: center;');
      expect(header).toContain('min-height: 40px;');
      expect(header).toContain('padding: 0 0 4px 2px;');
    });
  });

  describe('the actions', () => {
    it('are Play and Discard alone, Play first and twice as wide upright', () => {
      renderSheet();

      const actions = document.querySelector<HTMLElement>('.actions')!;
      const buttons = within(actions).getAllByRole('button');
      expect(buttons.map((button) => button.textContent)).toEqual(['Play', 'Discard']);
      expect(rule('.actions')).toContain('grid-template-columns: 2fr 1fr;');
    });

    it('keeps a label on one line, cut short if it must', () => {
      const button = rule('.actions button');
      expect(button).toContain('white-space: nowrap;');
      expect(button).toContain('text-overflow: ellipsis;');
      expect(button).toContain('overflow: hidden;');
    });
  });
});
