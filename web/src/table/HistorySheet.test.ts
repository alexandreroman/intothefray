import { fireEvent, render, screen, within } from '@testing-library/svelte';
import HistorySheet, { unread } from './HistorySheet.svelte';
import sheetSource from './HistorySheet.svelte?raw';
import { DOCK_MODE_KEY } from './dockMode';
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

function renderSheet(props: Partial<{ log: LogView[]; canUndo: boolean; dock: boolean }> = {}) {
  const { dock = false, ...rest } = props;
  const onundo = vi.fn();
  const onclose = vi.fn();
  render(HistorySheet, {
    props: { log: LOG, canUndo: true, onundo, onclose, ...rest },
    context: new Map([[DOCK_MODE_KEY, { current: dock }]]),
  });
  return { onundo, onclose };
}

/** The declarations of a rule of the sheet's stylesheet. */
function rule(selector: string): string {
  const pattern = new RegExp(`\\n {2}${selector.replace(/[.]/g, '\\.')} \\{([^}]*)\\}`);
  return pattern.exec(sheetSource)?.[1] ?? '';
}

function historyLines(): HTMLElement[] {
  return within(screen.getByRole('list', { name: 'History' })).getAllByRole('listitem');
}

describe('unread', () => {
  const OPENED = '2026-11-05T10:00:00Z';

  it('counts the lines written after the history was last seen', () => {
    const log = [
      line({ at: '2026-11-05T09:59:00Z' }),
      line({ at: OPENED }),
      line({ at: '2026-11-05T10:00:05Z' }),
    ];
    expect(unread(log, OPENED)).toBe(1);
    expect(unread(log, '2026-11-05T10:00:05Z')).toBe(0);
  });

  it('has nothing to count before the history was ever seen', () => {
    expect(unread([line({ at: OPENED })], null)).toBe(0);
  });

  it('counts a line written after an undo removed the last line seen', () => {
    const afterUndo = [line({ at: '2026-11-05T09:59:00Z' }), line({ at: '2026-11-05T10:00:07Z' })];
    expect(unread(afterUndo, OPENED)).toBe(1);
  });

  it('compares times, not their spelling: fractions of a second and offsets', () => {
    const log = [
      line({ at: '2026-11-05T10:00:00.25Z' }),
      line({ at: '2026-11-05T11:00:00+01:00' }),
    ];
    expect(unread(log, '2026-11-05T10:00:00.1Z')).toBe(1);
  });
});

describe('HistorySheet', () => {
  it('is a sheet named History that closes on Escape', async () => {
    const { onclose } = renderSheet();

    expect(screen.getByRole('dialog', { name: 'History' })).toBeTruthy();
    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(onclose).toHaveBeenCalledOnce();
  });

  it('shows the log newest first, worded as the side column', () => {
    renderSheet();

    const lines = historyLines();
    expect(lines.map((l) => l.querySelector('.txt')?.textContent?.trim())).toEqual([
      'Sam undid “drew 1 card”',
      'Sam drew 1 card',
      'Alex started the game (Rhino, Bomb Scare)',
    ]);
    const [newest, undone, oldest] = lines as [HTMLElement, HTMLElement, HTMLElement];
    expect(undone.classList).toContain('undone');
    expect(newest.classList).not.toContain('undone');
    expect(within(newest).getByText('Sam').getAttribute('style')).toContain('color: var(--p2)');
    expect(within(oldest).getByText('(Rhino, Bomb Scare)').classList).toContain('aside');
    expect(within(oldest).getByText('14:01').classList).toContain('t');
  });

  it('names a card in the viewer language, else as the server wrote it', () => {
    const rhino = { card: '01094', face: 0 };
    const unknown = { card: '99999', face: 0 };
    render(HistorySheet, {
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
      canUndo: false,
      onundo: () => {},
      onclose: () => {},
      nameOf: (ref) => (ref.card === '01094' ? 'Rhino FR' : undefined),
    });

    const text = historyLines()[0]?.querySelector('.txt');
    expect(text?.textContent?.trim()).toBe('Alex flipped Rhino FR (stage II) and Bomb Scare');
    expect([...(text?.querySelectorAll('b.card') ?? [])].map((b) => b.textContent)).toEqual([
      'Rhino FR',
      'Bomb Scare',
    ]);
  });

  it('undoes the last action from the button at the bottom', async () => {
    const { onundo } = renderSheet();

    const button = screen.getByRole('button', { name: 'Undo last action' });
    expect(button.getAttribute('aria-disabled')).toBe('false');
    await fireEvent.click(button);
    expect(onundo).toHaveBeenCalledOnce();
  });

  it('says why there is nothing to undo, and does nothing', async () => {
    const { onundo } = renderSheet({ canUndo: false });

    const button = screen.getByRole('button', { name: 'Undo last action' });
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.dataset.tip).toBe('Nothing of yours to undo');
    await fireEvent.click(button);
    expect(onundo).not.toHaveBeenCalled();
  });

  it('is at most 62 % of the window high outside dock mode', () => {
    renderSheet();

    expect(screen.getByRole('dialog', { name: 'History' }).style.maxHeight).toBe('62%');
  });

  describe('in dock mode', () => {
    it('may take the whole height', () => {
      renderSheet({ dock: true });

      const sheet = screen.getByRole('dialog', { name: 'History' });
      expect(sheet.classList).toContain('dock');
      expect(sheet.style.maxHeight).toBe('');
    });

    it('draws compact 40 px lines, Undo pinned at the bottom', () => {
      renderSheet({ dock: true });

      expect(document.querySelector('.history')?.classList).toContain('dock');
      expect(rule('.history.dock .e')).toContain('min-height: 40px;');
      expect(rule('.undo')).toContain('position: sticky;');
      expect(rule('.undo')).toContain('bottom: 0;');
    });
  });
});
