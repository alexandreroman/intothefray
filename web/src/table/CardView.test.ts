import { render, screen } from '@testing-library/svelte';
import CardView from './CardView.svelte';
import type { CardView as TableCard, PackFace } from '../lib/types';
import { cardBox } from './layout';

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

function face(extra: Partial<PackFace> = {}): PackFace {
  return { name: 'Spider-Man', type: 'hero', size: 'std', images: ['spidey.png'], ...extra };
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
});

describe('CardView', () => {
  it('a face-down card shows its back, whatever face it is given', async () => {
    render(CardView, { card: tableCard({ faceDown: true }), face: face() });

    const back = await screen.findByRole('img', { name: 'Player card back' });
    expect(back.getAttribute('src')).toBe(HERO_BACK);
    expect(screen.queryByRole('img', { name: 'Spider-Man' })).toBeNull();
  });

  it('a hidden card without a code shows its back', async () => {
    render(CardView, { card: tableCard({ code: undefined, back: 'encounter' }), face: null });

    expect(await screen.findByRole('img', { name: 'Encounter card back' })).toBeTruthy();
  });

  it('draws the back when the theme has no images', () => {
    localStorage.setItem('itf-theme', 'minimal');
    render(CardView, { card: tableCard({ faceDown: true }), face: null });

    const back = screen.getByRole('img', { name: 'Player card back' });
    expect(back.tagName).toBe('DIV');
    expect(back.classList.contains('player')).toBe(true);
  });

  it('places the card with the size of the face it is given', () => {
    const scheme = face({ size: 'land', images: ['scheme.png'], name: 'Bomb Scare' });
    const { container } = render(CardView, { card: tableCard(), face: scheme });

    const img = screen.getByRole('img', { name: 'Bomb Scare' });
    expect(img.getAttribute('src')).toBe('scheme.png');
    expect(img.classList.contains('land')).toBe(true);
    const el = cardElement(container);
    expect(el.style.left).toBe('120px');
    expect(el.style.top).toBe('40px');
    expect(el.style.zIndex).toBe('7');
    const land = cardBox('land', {});
    expect(el.style.width).toBe(`${land.w}px`);
    expect(el.style.height).toBe(`${land.h}px`);
    expect(land.w).toBeGreaterThan(land.h);
    expect(el.dataset.id).toBe('c1');
  });

  it('an unknown face is a std placeholder', () => {
    const { container } = render(CardView, { card: tableCard(), face: null });
    const el = cardElement(container);
    const portrait = cardBox('std', {});
    expect(el.style.width).toBe(`${portrait.w}px`);
    expect(el.style.height).toBe(`${portrait.h}px`);
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('a face-down card is always portrait', () => {
    const { container } = render(CardView, {
      card: tableCard({ faceDown: true }),
      face: face({ size: 'dland' }),
    });
    const el = cardElement(container);
    const portrait = cardBox('std', {});
    expect(el.style.width).toBe(`${portrait.w}px`);
    expect(el.style.height).toBe(`${portrait.h}px`);
  });

  it('a landscape card on a pile keeps a portrait slot and turns its image', () => {
    const { container } = render(CardView, {
      card: tableCard({ onPile: 'enc' }),
      face: face({ size: 'land', name: 'Bomb Scare' }),
    });

    expect(screen.getByRole('img', { name: 'Bomb Scare' })).toBeTruthy();
    const el = cardElement(container);
    const portrait = cardBox('std', {});
    expect(el.style.width).toBe(`${portrait.w}px`);
    expect(el.style.height).toBe(`${portrait.h}px`);
    expect(container.querySelector('.land-in-portrait img')).toBeTruthy();
  });

  it('tilts an exhausted card', () => {
    const { container } = render(CardView, { card: tableCard({ exhausted: true }), face: face() });
    expect(cardElement(container).classList.contains('exhausted')).toBe(true);
  });

  it('tokens and statuses render with their values', () => {
    const card = tableCard({
      tokens: { dmg: 2, thr: 0, gen: 3 },
      status: { stunned: 1, confused: 0, tough: 2 },
    });
    const { container } = render(CardView, { card, face: face() });

    expect(container.querySelector('.tok.dmg')?.textContent).toBe('2');
    expect(container.querySelector('.tok.thr')).toBeNull();
    expect(container.querySelector('.tok.gen')?.textContent).toBe('3');
    expect(container.querySelector('.st.stunned')?.textContent).toBe('Stunned');
    expect(container.querySelector('.st.confused')).toBeNull();
    expect(container.querySelector('.st.tough')?.textContent).toBe('Tough ×2');
  });

  it('damage and counters share a row, threat stands apart on the side', () => {
    const card = tableCard({ tokens: { dmg: 4, thr: 2, gen: 1 } });
    const { container } = render(CardView, { card, face: face({ size: 'land' }) });

    const row = container.querySelector('.tokens');
    expect([...(row?.children ?? [])].map((tok) => tok.className)).toEqual([
      expect.stringContaining('dmg'),
      expect.stringContaining('gen'),
    ]);
    const threat = container.querySelector('.tok.thr');
    expect(threat?.textContent).toBe('2');
    expect(threat?.parentElement).toBe(cardElement(container));
    // The token pill finds every token by its counter name.
    expect(threat?.getAttribute('data-counter')).toBe('token:thr');
    expect(row?.querySelector('[data-counter="token:dmg"]')?.textContent).toBe('4');
  });

  it('a lone threat token draws no row', () => {
    const card = tableCard({ tokens: { thr: 3 } });
    const { container } = render(CardView, { card, face: face() });
    expect(container.querySelector('.tokens')).toBeNull();
    expect(container.querySelector('.tok.thr')?.textContent).toBe('3');
  });

  it('shows no token or status row when there is none', () => {
    const { container } = render(CardView, {
      card: tableCard({ tokens: { dmg: 0 } }),
      face: face(),
    });
    expect(container.querySelector('.tokens')).toBeNull();
    expect(container.querySelector('.statuses')).toBeNull();
  });
});
