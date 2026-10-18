import { render, screen } from '@testing-library/svelte';
import CardView from './CardView.svelte';
import { cardByCode, type CardInfo } from '../lib/catalog';
import type { CardView as TableCard, PackFace } from '../lib/types';

vi.mock('../lib/catalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/catalog')>()),
  cardByCode: vi.fn(),
}));

const HERO_BACK = 'https://pub-d27e6715f4ba4529bc9d8fd13938a5a1.r2.dev/cerebro-cards/HeroBack.jpg';

function tableCard(extra: Partial<TableCard> = {}): TableCard {
  return {
    id: 'c1',
    code: '01001a',
    face: 0,
    back: 'player',
    owner: 0,
    zone: 'table',
    area: 'p0',
    x: 120,
    y: 40,
    z: 7,
    ...extra,
  };
}

function info(face: Partial<PackFace>): CardInfo {
  const full: PackFace = {
    name: 'Spider-Man',
    type: 'hero',
    size: 'std',
    images: ['spidey.png'],
    ...face,
  };
  return {
    card: { code: '01001a', faces: [full], back: 'player', quantity: 1 },
    face: 0,
    pack: 'core',
  };
}

function cardElement(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>('.card');
  if (!el) {
    throw new Error('no .card element');
  }
  return el;
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(cardByCode).mockResolvedValue(info({}));
});

afterEach(() => {
  vi.mocked(cardByCode).mockReset();
});

describe('CardView', () => {
  it('face-down card shows the back and does not look up a code', async () => {
    render(CardView, { card: tableCard({ faceDown: true }) });

    const back = await screen.findByRole('img', { name: 'Player card back' });
    expect(back.getAttribute('src')).toBe(HERO_BACK);
    expect(cardByCode).not.toHaveBeenCalled();
  });

  it('a hidden card without a code shows its back without a lookup', async () => {
    render(CardView, { card: tableCard({ code: undefined, back: 'encounter' }) });

    expect(await screen.findByRole('img', { name: 'Encounter card back' })).toBeTruthy();
    expect(cardByCode).not.toHaveBeenCalled();
  });

  it('draws the back when the theme has no images', () => {
    localStorage.setItem('itf-theme', 'minimal');
    render(CardView, { card: tableCard({ faceDown: true }) });

    const back = screen.getByRole('img', { name: 'Player card back' });
    expect(back.tagName).toBe('DIV');
    expect(back.classList.contains('player')).toBe(true);
  });

  it('places the card with the size of its catalog face', async () => {
    vi.mocked(cardByCode).mockResolvedValue(
      info({ size: 'land', images: ['scheme.png'], name: 'Bomb Scare' }),
    );
    const { container } = render(CardView, { card: tableCard() });

    const img = await screen.findByRole('img', { name: 'Bomb Scare' });
    expect(img.getAttribute('src')).toBe('scheme.png');
    expect(img.classList.contains('land')).toBe(true);
    const el = cardElement(container);
    expect(el.style.left).toBe('120px');
    expect(el.style.top).toBe('40px');
    expect(el.style.zIndex).toBe('7');
    expect(el.style.width).toBe('140px');
    expect(el.style.height).toBe('100px');
    expect(cardByCode).toHaveBeenCalledWith('01001a');
  });

  it('a new view of the same card keeps its face without a new lookup', async () => {
    const { rerender } = render(CardView, { card: tableCard() });
    await screen.findByRole('img', { name: 'Spider-Man' });

    await rerender({ card: tableCard({ x: 300, exhausted: true }) });

    expect(screen.getByRole('img', { name: 'Spider-Man' })).toBeTruthy();
    expect(cardByCode).toHaveBeenCalledOnce();
  });

  it('uses the size given by the parent', () => {
    const { container } = render(CardView, { card: tableCard(), size: 'dstd' });
    const el = cardElement(container);
    expect(el.style.width).toBe('140px');
    expect(el.style.height).toBe('200px');
  });

  it('a face-down card is always portrait', () => {
    const { container } = render(CardView, { card: tableCard({ faceDown: true }), size: 'dland' });
    const el = cardElement(container);
    expect(el.style.width).toBe('100px');
    expect(el.style.height).toBe('140px');
  });

  it('a landscape card on a pile keeps a portrait slot and turns its image', async () => {
    vi.mocked(cardByCode).mockResolvedValue(info({ size: 'land', name: 'Bomb Scare' }));
    const { container } = render(CardView, { card: tableCard({ onPile: 'enc' }), size: 'land' });

    await screen.findByRole('img', { name: 'Bomb Scare' });
    const el = cardElement(container);
    expect(el.style.width).toBe('100px');
    expect(el.style.height).toBe('140px');
    expect(container.querySelector('.land-in-portrait img')).toBeTruthy();
  });

  it('tilts an exhausted card', () => {
    const { container } = render(CardView, { card: tableCard({ exhausted: true }) });
    expect(cardElement(container).classList.contains('exhausted')).toBe(true);
  });

  it('tokens and statuses render with their values', () => {
    const card = tableCard({
      tokens: { dmg: 2, thr: 0, gen: 3 },
      status: { stunned: 1, confused: 0, tough: 2 },
    });
    const { container } = render(CardView, { card });

    expect(container.querySelector('.tok.dmg')?.textContent).toBe('2');
    expect(container.querySelector('.tok.thr')).toBeNull();
    expect(container.querySelector('.tok.gen')?.textContent).toBe('3');
    expect(container.querySelector('.st.stunned')?.textContent).toBe('Stunned');
    expect(container.querySelector('.st.confused')).toBeNull();
    expect(container.querySelector('.st.tough')?.textContent).toBe('Tough ×2');
  });

  it('shows no token or status row when there is none', () => {
    const { container } = render(CardView, { card: tableCard({ tokens: { dmg: 0 } }) });
    expect(container.querySelector('.tokens')).toBeNull();
    expect(container.querySelector('.statuses')).toBeNull();
  });
});
