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

  it('shows an entry image, loaded lazily', () => {
    renderDialog();
    const image = screen.getByRole('img', { name: 'The five villains' });

    expect(image.getAttribute('src')).toBe('https://img.example/villains.webp');
    expect(image.getAttribute('loading')).toBe('lazy');
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
});
