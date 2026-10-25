import { fireEvent, render, screen, within } from '@testing-library/svelte';
import SidePanel from './SidePanel.svelte';
import { interaction } from './interaction.svelte';
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

/** The callbacks and ids the panel takes, which these tests do not look at. */
const PANEL = { onundo: () => {}, ontoggle: () => {}, controls: 'history-panel' };

function historyLines(): HTMLElement[] {
  return within(screen.getByRole('list', { name: 'History' })).getAllByRole('listitem');
}

afterEach(() => {
  interaction.highlighted = new Set();
});

describe('SidePanel', () => {
  it('history shows newest first with struck undone lines', () => {
    render(SidePanel, { log: LOG, ...PANEL });

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

  it('names a card in the viewer language, else as the server wrote it', () => {
    const rhino = { card: '01094', face: 0 };
    const unknown = { card: '99999', face: 0 };
    render(SidePanel, {
      log: [
        line({
          text: 'flipped Rhino (stage II) and Bomb Scare',
          parts: [
            { text: 'flipped ' },
            { text: 'Rhino', card: true, ref: rhino },
            { text: ' (stage II) and ' },
            { text: 'Bomb Scare', card: true, ref: unknown },
          ],
        }),
      ],
      ...PANEL,
      nameOf: (ref) => (ref.card === '01094' ? 'Rhino FR' : undefined),
    });

    const text = historyLines()[0]?.querySelector('.txt');
    expect(text?.textContent).toBe('Alex flipped Rhino FR (stage II) and Bomb Scare');
    expect([...(text?.querySelectorAll('b.card') ?? [])].map((b) => b.textContent)).toEqual([
      'Rhino FR',
      'Bomb Scare',
    ]);
  });

  it('undo button disabled without undo', async () => {
    const onundo = vi.fn();
    const { rerender } = render(SidePanel, { ...PANEL, log: LOG, onundo });

    const undo = screen.getByRole('button', { name: 'Undo last action' });
    expect(undo.getAttribute('aria-disabled')).toBe('true');
    expect(undo.dataset.tip).toBe('Nothing of yours to undo');
    await fireEvent.click(undo);
    expect(onundo).not.toHaveBeenCalled();

    await rerender({ ...PANEL, log: LOG, onundo, canUndo: true });
    expect(undo.getAttribute('aria-disabled')).toBe('false');
    expect(undo.hasAttribute('data-tip')).toBe(false);
    await fireEvent.click(undo);
    expect(onundo).toHaveBeenCalledOnce();
  });

  it('offers to collapse, and says what it controls', async () => {
    const ontoggle = vi.fn();
    render(SidePanel, { ...PANEL, log: LOG, ontoggle });
    const collapse = screen.getByRole('button', { name: 'Collapse history' });
    expect(collapse.getAttribute('aria-expanded')).toBe('true');
    expect(collapse.getAttribute('aria-controls')).toBe('history-panel');
    expect(collapse.dataset.tip).toBe('Collapse history');
    await fireEvent.click(collapse);
    expect(ontoggle).toHaveBeenCalledOnce();
  });

  it('collapsed, shows a strip with Expand and an Undo icon, and no history', async () => {
    const onundo = vi.fn();
    const ontoggle = vi.fn();
    const props = { log: LOG, onundo, ontoggle, collapsed: true, controls: 'history-panel' };
    const { rerender } = render(SidePanel, props);

    expect(screen.queryByRole('list', { name: 'History' })).toBeNull();
    expect(screen.queryByRole('heading')).toBeNull();
    const expand = screen.getByRole('button', { name: 'Expand history' });
    expect(expand.getAttribute('aria-expanded')).toBe('false');
    expect(expand.getAttribute('aria-controls')).toBe('history-panel');
    await fireEvent.click(expand);
    expect(ontoggle).toHaveBeenCalledOnce();

    // Undo, as an icon: off with nothing to undo, the tip saying why.
    const undo = screen.getByRole('button', { name: 'Undo last action' });
    expect(undo.textContent?.trim()).toBe('');
    expect(undo.getAttribute('aria-disabled')).toBe('true');
    expect(undo.dataset.tip).toBe('Nothing of yours to undo');
    await fireEvent.click(undo);
    expect(onundo).not.toHaveBeenCalled();

    await rerender({ ...props, canUndo: true });
    expect(undo.getAttribute('aria-disabled')).toBe('false');
    expect(undo.dataset.tip).toBe('Undo last action');
    await fireEvent.click(undo);
    expect(onundo).toHaveBeenCalledOnce();
  });

  it('titles its history, and holds no preview', () => {
    render(SidePanel, { log: LOG, ...PANEL });
    const titles = screen.getAllByRole('heading').map((heading) => heading.textContent);
    expect(titles).toEqual(['History']);
    expect(screen.queryByLabelText('Card preview')).toBeNull();
  });

  it('shows each line time first', () => {
    render(SidePanel, { log: LOG, ...PANEL });
    const [newest] = historyLines() as [HTMLElement];
    expect(newest.firstElementChild?.textContent).toBe('14:03');
  });

  it('hovering a line highlights its cards', async () => {
    const log = [line({ text: 'exhausted Spider-Man', cards: ['c1', 'c2'] })];
    render(SidePanel, { log, ...PANEL });

    const [entry] = historyLines() as [HTMLElement];
    await fireEvent.pointerEnter(entry);
    expect([...interaction.highlighted]).toEqual(['c1', 'c2']);

    await fireEvent.pointerLeave(entry);
    expect(interaction.highlighted.size).toBe(0);
  });

  it('a truncated line shows its full text over the list while hovered', async () => {
    const log = [
      line({ text: 'played a short card', at: at(14, 4) }),
      line({ text: 'moved a card with a very long name to the encounter discard', at: at(14, 5) }),
    ];
    render(SidePanel, { log, ...PANEL });
    const [long, short] = historyLines() as [HTMLElement, HTMLElement];

    // jsdom lays nothing out: the long line's text says it overflows.
    const text = long.querySelector('.txt') as HTMLElement;
    Object.defineProperty(text, 'scrollWidth', { value: 400 });
    Object.defineProperty(text, 'clientWidth', { value: 200 });

    await fireEvent.pointerEnter(short);
    expect(short.querySelector('.full')).toBeNull();
    await fireEvent.pointerLeave(short);

    await fireEvent.pointerEnter(long);
    const full = long.querySelector('.full');
    // The same line, time first, only unclipped.
    expect(full?.firstElementChild?.textContent).toBe('14:05');
    expect(full?.querySelector('.whole')?.textContent).toBe(text.textContent);
    expect(full?.querySelector('.whole')?.classList).not.toContain('txt');

    await fireEvent.pointerLeave(long);
    expect(long.querySelector('.full')).toBeNull();
  });

  it('a hovered line that leaves the list stops highlighting', async () => {
    const log = [
      line({ text: 'exhausted Spider-Man', cards: ['c1'] }),
      line({ text: 'readied Spider-Man', cards: ['c1'] }),
    ];
    const { rerender } = render(SidePanel, { log, ...PANEL });

    // The newest line is gone with no pointerleave (a new history, say).
    await fireEvent.pointerEnter(historyLines()[0] as HTMLElement);
    expect([...interaction.highlighted]).toEqual(['c1']);
    await rerender({ log: log.slice(0, 1), ...PANEL });
    expect(interaction.highlighted.size).toBe(0);
  });

  it('a line that a later change merged into bumps', async () => {
    const animate = vi.fn();
    const original = Element.prototype.animate;
    Element.prototype.animate = animate as unknown as typeof Element.prototype.animate;
    try {
      const first = line({ text: 'added 1 damage to Spider-Man', at: at(14, 5) });
      const other = line({ text: 'drew 1 card', at: at(14, 4) });
      const { rerender } = render(SidePanel, {
        log: [other, first],
        ...PANEL,
      });
      expect(animate).not.toHaveBeenCalled();

      const merged = { ...first, text: 'set damage on Spider-Man to 2', at: at(14, 6) };
      await rerender({ log: [other, merged], ...PANEL });
      expect(animate).toHaveBeenCalledOnce();
      expect(animate.mock.contexts[0]).toBe(historyLines()[0]);
      expect(animate.mock.calls[0]?.[0]).toEqual([{ backgroundColor: '#2a3a66' }, {}]);

      // Merged again: it bumps again. A new line slides in instead.
      const again = { ...merged, text: 'set damage on Spider-Man to 3', at: at(14, 7) };
      await rerender({ log: [other, again], ...PANEL });
      expect(animate).toHaveBeenCalledTimes(2);
      await rerender({
        log: [other, again, line({ text: 'drew 2 cards' })],
        ...PANEL,
      });
      expect(animate).toHaveBeenCalledTimes(2);
    } finally {
      Element.prototype.animate = original;
    }
  });

  it('shows card names in bold, the rest of the line plain', () => {
    const replaced = line({
      text: 'replaced the villain Rhino (stage I) with Rhino (stage II)',
      parts: [
        { text: 'replaced the villain ' },
        { text: 'Rhino', card: true },
        { text: ' (stage I) with ' },
        { text: 'Rhino', card: true },
        { text: ' (stage II)' },
      ],
    });
    render(SidePanel, { log: [replaced], ...PANEL });

    const text = (historyLines()[0] as HTMLElement).querySelector('.txt') as HTMLElement;
    expect(text.textContent).toBe(
      'Alex replaced the villain Rhino (stage I) with Rhino (stage II)',
    );
    const bold = [...text.querySelectorAll('b')];
    expect(bold.map((b) => b.textContent)).toEqual(['Rhino', 'Rhino']);
    expect(bold.every((b) => b.classList.contains('card'))).toBe(true);
    // The brackets stay dimmed and plain.
    expect(within(text).getByText('(stage I)').classList).toContain('aside');
    expect(within(text).getByText('(stage I)').tagName).not.toBe('B');
  });

  it('never makes player text bold or markup', () => {
    const log = [
      line({ who: '**Bob**', text: "shuffled <b>x</b>'s deck" }),
      line({
        who: '<b>x</b>',
        text: "moved Rhino to **Bob**'s set-aside cards",
        parts: [
          { text: 'moved ' },
          { text: 'Rhino', card: true },
          { text: " to **Bob**'s set-aside cards" },
        ],
      }),
    ];
    render(SidePanel, { log, ...PANEL });

    const [moved, shuffled] = historyLines().map((l) => l.querySelector('.txt') as HTMLElement) as [
      HTMLElement,
      HTMLElement,
    ];
    expect(shuffled.querySelector('b')).toBeNull();
    expect(shuffled.textContent).toBe("**Bob** shuffled <b>x</b>'s deck");
    expect([...moved.querySelectorAll('b')].map((b) => b.textContent)).toEqual(['Rhino']);
    expect(moved.textContent).toBe("<b>x</b> moved Rhino to **Bob**'s set-aside cards");
  });

  it('keeps card names bold in the full text of a truncated line', async () => {
    const log = [
      line({
        text: 'exhausted Spider-Man',
        parts: [{ text: 'exhausted ' }, { text: 'Spider-Man', card: true }],
      }),
    ];
    render(SidePanel, { log, ...PANEL });
    const entry = historyLines()[0] as HTMLElement;
    const text = entry.querySelector('.txt') as HTMLElement;
    Object.defineProperty(text, 'scrollWidth', { value: 400 });
    Object.defineProperty(text, 'clientWidth', { value: 200 });

    await fireEvent.pointerEnter(entry);

    const whole = entry.querySelector('.full .whole') as HTMLElement;
    expect([...whole.querySelectorAll('b.card')].map((b) => b.textContent)).toEqual(['Spider-Man']);
  });
});
