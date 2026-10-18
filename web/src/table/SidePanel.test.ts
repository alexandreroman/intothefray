import { fireEvent, render, screen, within } from '@testing-library/svelte';
import SidePanel from './SidePanel.svelte';
import { hover } from './hover.svelte';
import type { LogView } from '../lib/types';

/** An RFC 3339 time that reads hh:mm in the local time zone. */
function at(hours: number, minutes: number): string {
  return new Date(2026, 9, 18, hours, minutes).toISOString();
}

function line(extra: Partial<LogView>): LogView {
  return { who: 'Alex', color: 0, text: '', at: at(14, 5), ...extra };
}

const LOG: LogView[] = [
  line({ text: 'started the game (Rhino, Bomb Scare)', at: at(14, 1) }),
  line({ who: 'Sam', color: 1, text: 'drew 1 card', at: at(14, 2), undone: true }),
  line({ who: 'Sam', color: 1, text: 'undid “drew 1 card”', at: at(14, 3) }),
];

function historyLines(): HTMLElement[] {
  return within(screen.getByRole('list', { name: 'History' })).getAllByRole('listitem');
}

afterEach(() => {
  hover.highlighted = new Set();
});

describe('SidePanel', () => {
  it('history shows newest first with struck undone lines', () => {
    render(SidePanel, { preview: null, log: LOG, onundo: () => {} });

    const lines = historyLines();
    expect(lines.map((l) => l.querySelector('.txt')?.textContent)).toEqual([
      'Sam undid “drew 1 card”',
      'Sam drew 1 card',
      'Alex started the game (Rhino, Bomb Scare)',
    ]);
    const [newest, undone, oldest] = lines as [HTMLElement, HTMLElement, HTMLElement];
    expect(undone.classList).toContain('undone');
    expect(newest.classList).not.toContain('undone');

    // Names in the player colour, the bracketed text dimmed, the time on the right.
    expect(within(newest).getAllByText('Sam')[0]?.getAttribute('style')).toContain(
      'color: var(--p2)',
    );
    expect(within(oldest).getAllByText('(Rhino, Bomb Scare)')[0]?.classList).toContain('aside');
    expect(within(oldest).getAllByText('14:01')[0]?.classList).toContain('t');
  });

  it('leaves system lines uncoloured', () => {
    render(SidePanel, {
      preview: null,
      log: [line({ who: 'Table', color: -1, text: 'shuffled' })],
      onundo: () => {},
    });
    const name = within(historyLines()[0] as HTMLElement).getAllByText('Table')[0];
    expect(name?.getAttribute('style') ?? '').not.toContain('color');
  });

  it('undo button disabled without undo', async () => {
    const onundo = vi.fn();
    const { rerender } = render(SidePanel, { preview: null, log: LOG, onundo });

    const undo = screen.getByRole('button', { name: 'Undo' });
    expect((undo as HTMLButtonElement).disabled).toBe(true);
    expect(undo.title).toBe('Nothing of yours to undo');

    await rerender({ preview: null, log: LOG, onundo, canUndo: true, undoText: 'drew 1 card' });
    expect((undo as HTMLButtonElement).disabled).toBe(false);
    expect(undo.title).toBe('Undo your last action: drew 1 card');
    await fireEvent.click(undo);
    expect(onundo).toHaveBeenCalledOnce();
  });

  it('shows the empty preview frame', () => {
    render(SidePanel, { preview: null, log: [], onundo: () => {} });
    const frame = screen.getByLabelText('Card preview');
    expect(frame.textContent).toContain('Hover a card');
    expect(frame.textContent).toContain('to see it here');
    expect(frame.classList).toContain('empty');
  });

  it('previews a face, adapting to landscape', async () => {
    const face = { kind: 'face' as const, images: ['scheme.png'], name: 'The Break-In!' };
    const { rerender } = render(SidePanel, {
      preview: { ...face, landscape: false },
      log: [],
      onundo: () => {},
    });

    const frame = screen.getByLabelText('Card preview');
    expect(frame.classList).not.toContain('empty');
    expect(screen.getByRole('img', { name: 'The Break-In!' }).getAttribute('src')).toBe(
      'scheme.png',
    );
    expect(frame.querySelector('.art')?.classList).not.toContain('land');

    await rerender({ preview: { ...face, landscape: true }, log: [], onundo: () => {} });
    expect(frame.querySelector('.art')?.classList).toContain('land');
    expect(screen.getByRole('img', { name: 'The Break-In!' }).classList).toContain('land');
  });

  it('previews a card back', () => {
    localStorage.setItem('itf-theme', 'minimal');
    try {
      render(SidePanel, {
        preview: { kind: 'back', back: 'encounter' },
        log: [],
        onundo: () => {},
      });
      expect(screen.getByRole('img', { name: 'Encounter card back' })).toBeTruthy();
    } finally {
      localStorage.clear();
    }
  });

  it('hovering a line highlights its cards', async () => {
    const log = [line({ text: 'exhausted Spider-Man', cards: ['c1', 'c2'] })];
    render(SidePanel, { preview: null, log, onundo: () => {} });

    const [entry] = historyLines() as [HTMLElement];
    await fireEvent.pointerEnter(entry);
    expect([...hover.highlighted]).toEqual(['c1', 'c2']);

    await fireEvent.pointerLeave(entry);
    expect(hover.highlighted.size).toBe(0);
  });

  it('a hovered line that leaves the list stops highlighting', async () => {
    const log = [
      line({ text: 'exhausted Spider-Man', cards: ['c1'] }),
      line({ text: 'readied Spider-Man', cards: ['c1'] }),
    ];
    const { rerender } = render(SidePanel, { preview: null, log, onundo: () => {} });

    // The newest line is gone with no pointerleave (a new history, say).
    await fireEvent.pointerEnter(historyLines()[0] as HTMLElement);
    expect([...hover.highlighted]).toEqual(['c1']);
    await rerender({ preview: null, log: log.slice(0, 1), onundo: () => {} });
    expect(hover.highlighted.size).toBe(0);
  });
});
