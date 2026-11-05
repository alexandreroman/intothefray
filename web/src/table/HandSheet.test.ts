import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { createRawSnippet, flushSync } from 'svelte';
import HandSheet from './HandSheet.svelte';
import sheetSource from './HandSheet.svelte?raw';
import { interaction } from './interaction.svelte';
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

function renderSheet(props: { cards?: TableCard[]; withPicker?: boolean } = {}) {
  const handlers = {
    onplay: vi.fn(),
    ondiscard: vi.fn(),
    onmore: vi.fn(),
    onclose: vi.fn(),
  };
  const picker = createRawSnippet(() => ({
    render: () => '<button type="button">Spider-Man</button>',
  }));
  const view = render(HandSheet, {
    cards: props.cards ?? CARDS,
    faceOf,
    seat: 1,
    area: 'p1',
    landscape: false,
    picker: props.withPicker ? picker : undefined,
    ...handlers,
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
  const pattern = new RegExp(`\\n {2}${selector.replace(/[.]/g, '\\.')} \\{([^}]*)\\}`);
  return pattern.exec(sheetSource)?.[1] ?? '';
}

afterEach(() => {
  vi.restoreAllMocks();
  interaction.reset();
});

describe('HandSheet', () => {
  it('is a sheet that shows the hand count and each card face', () => {
    renderSheet();

    expect(screen.getByRole('dialog', { name: 'Your hand' })).toBeTruthy();
    expect(screen.getByText('Your hand · 3')).toBeTruthy();
    expect(cardItems()).toHaveLength(3);
    expect(screen.getByRole('img', { name: 'Swinging Web Kick' })).toBeTruthy();
  });

  it('renders the picker in the header when given', () => {
    renderSheet({ withPicker: true });

    const header = screen.getByText('Your hand · 3').closest('header')!;
    expect(within(header).getByRole('button', { name: 'Spider-Man' })).toBeTruthy();
  });

  it('says so when the hand is empty, with no actions', () => {
    renderSheet({ cards: [] });

    expect(screen.getByText('No cards in hand')).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Cards in hand' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Play' })).toBeNull();
  });

  it('acts on the first card before any scroll', async () => {
    const { onplay, ondiscard, onmore } = renderSheet();

    await fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    await fireEvent.click(screen.getByRole('button', { name: 'More…' }));

    expect(onplay).toHaveBeenCalledWith('h1');
    expect(ondiscard).toHaveBeenCalledWith('h1');
    expect(onmore).toHaveBeenCalledWith('h1');
  });

  it('acts on the card the carousel snapped to the centre', async () => {
    const { onplay, ondiscard, onmore } = renderSheet();

    layOut(212);
    await fireEvent.scroll(carousel());
    await fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    await fireEvent.click(screen.getByRole('button', { name: 'More…' }));

    expect(onplay).toHaveBeenCalledWith('h2');
    expect(ondiscard).toHaveBeenCalledWith('h2');
    expect(onmore).toHaveBeenCalledWith('h2');
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
    expect(cardItems().map((item) => item.dataset.id)).toEqual(['h1', 'h2', 'h3']);
    for (const item of cardItems()) {
      expect(item.classList.contains('hcard')).toBe(true);
      expect(item.querySelector('.fan img')).toBeTruthy();
    }
  });

  it('scrolls sideways only, leaving vertical moves to the drag', () => {
    expect(rule('.hand')).toContain('touch-action: pan-x;');
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
});
