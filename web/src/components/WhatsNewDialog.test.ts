import { fireEvent, render, screen, within } from '@testing-library/svelte';
import WhatsNewDialog from './WhatsNewDialog.svelte';
import type { NewsEntry } from '../lib/news';

const ENTRIES: NewsEntry[] = [
  {
    id: '2026-11-01-villains',
    date: '2026-11-01',
    title: 'New villains',
    text: 'Five more villains to beat.',
    image: { src: 'https://img.example/villains.webp', alt: 'The five villains' },
  },
  { id: '2026-10-29-decks', date: '2026-10-29', title: 'More decks', text: 'Play several decks.' },
];

function renderDialog(unread: string[] = []) {
  const onclose = vi.fn();
  render(WhatsNewDialog, { entries: ENTRIES, unread: new Set(unread), onclose });
  return { onclose };
}

describe('WhatsNewDialog', () => {
  it('lists every entry, newest first, with its date, title and text', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog', { name: "What's new" });
    const items = within(dialog).getAllByRole('listitem');

    expect(items).toHaveLength(2);
    // The header's megaphone is decoration: the dialog is named by its title alone.
    expect(dialog.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    const [first, second] = items as [HTMLElement, HTMLElement];
    expect(within(first).getByRole('heading', { name: 'New villains' })).toBeTruthy();
    expect(within(first).getByText('1 Nov 2026').getAttribute('datetime')).toBe('2026-11-01');
    expect(within(first).getByText('Five more villains to beat.')).toBeTruthy();
    expect(within(second).getByRole('heading', { name: 'More decks' })).toBeTruthy();
    expect(within(second).getByText('29 Oct 2026')).toBeTruthy();
  });

  it('shows an entry thumbnail beside its text, loaded lazily', () => {
    renderDialog();
    const image = screen.getByRole('img', { name: 'The five villains' });

    expect(image.getAttribute('src')).toBe('https://img.example/villains.webp');
    expect(image.getAttribute('loading')).toBe('lazy');
    expect(image.getAttribute('width')).toBe('112');
    expect(image.getAttribute('height')).toBe('84');
    // Beside the text: the illustrated entry lays the two out, the other has its text alone.
    const [first, second] = screen.getAllByRole('listitem') as [HTMLElement, HTMLElement];
    expect(first.classList.contains('illustrated')).toBe(true);
    expect(second.classList.contains('illustrated')).toBe(false);
    expect(screen.getAllByRole('img')).toHaveLength(1);
  });

  it('tags the unread entries as new', () => {
    renderDialog(['2026-11-01-villains']);
    const [first, second] = screen.getAllByRole('listitem') as [HTMLElement, HTMLElement];

    expect(within(first).queryByText('New')).toBeTruthy();
    expect(within(second).queryByText('New')).toBeNull();
  });

  it('closes with its main button, which has the focus', async () => {
    const { onclose } = renderDialog();
    const close = screen.getByRole('button', { name: 'Close' });

    expect(document.activeElement).toBe(close);
    expect(close.className).toContain('btn-primary');
    expect(close.className).toContain('compact');
    await fireEvent.click(close);
    expect(onclose).toHaveBeenCalledOnce();
  });

  it('closes with Escape', async () => {
    const { onclose } = renderDialog();

    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(onclose).toHaveBeenCalledOnce();
  });

  describe('list height', () => {
    /** Entries of their own, newest first. */
    function entriesOf(count: number): NewsEntry[] {
      return Array.from({ length: count }, (_, i) => {
        const day = String(20 - i).padStart(2, '0');
        return {
          id: `2026-10-${day}-n${i}`,
          date: `2026-10-${day}`,
          title: `News ${i}`,
          text: 'Text.',
        };
      });
    }

    // jsdom lays nothing out: the list's top at 96px, its entries 120px high from 100px (after its
    // 4px of padding), each the next one down.
    beforeEach(() => {
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
        this: Element,
      ) {
        const index =
          this.tagName === 'LI' ? [...(this.parentElement?.children ?? [])].indexOf(this) : -1;
        const top = index >= 0 ? 100 + 120 * index : 96;
        return { top, bottom: top + 120, left: 0, right: 500, width: 500, height: 120 } as DOMRect;
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    function list(): HTMLElement {
      return screen.getByRole('list');
    }

    it('shows the first three entries, and scrolls to the others', () => {
      render(WhatsNewDialog, {
        entries: entriesOf(5),
        unread: new Set<string>(),
        onclose: () => {},
      });

      // From the list's top to the fourth entry's: its padding and three entries.
      expect(list().style.maxHeight).toBe(`${100 + 3 * 120 - 96}px`);
    });

    it('takes the height of three entries or fewer', () => {
      render(WhatsNewDialog, {
        entries: entriesOf(3),
        unread: new Set<string>(),
        onclose: () => {},
      });

      expect(list().style.maxHeight).toBe('');
    });
  });
});
