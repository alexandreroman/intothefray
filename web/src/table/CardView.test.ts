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
  it("a face-down side card shows its back captioned with its deck's label", () => {
    render(CardView, {
      card: tableCard({ code: undefined, faceDown: true, home: 'side:p0:0' }),
      face: null,
      caption: 'Labor',
    });
    const back = screen.getByRole('img', { name: 'Labor card back' });
    expect(back.querySelector('img')?.getAttribute('src')).toBe(HERO_BACK);
    expect(back.querySelector('.caption')?.textContent).toBe('LABOR');
  });

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

  it('marks a landscape card, whose statuses lie along its top', () => {
    const land = render(CardView, { card: tableCard(), face: face({ size: 'land' }) });
    expect(cardElement(land.container).classList.contains('land')).toBe(true);
    land.unmount();

    const portrait = render(CardView, { card: tableCard(), face: face() });
    expect(cardElement(portrait.container).classList.contains('land')).toBe(false);
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

  it('shows the Retaliate value on its tab, even at 1', () => {
    const two = render(CardView, { card: tableCard({ status: { retaliate: 2 } }), face: face() });
    expect(two.container.querySelector('.st.retaliate')?.textContent).toBe('Retaliate 2');
    two.unmount();

    const one = render(CardView, { card: tableCard({ status: { retaliate: 1 } }), face: face() });
    expect(one.container.querySelector('.st.retaliate')?.textContent).toBe('Retaliate 1');
  });

  it('shows all five statuses in order', () => {
    const card = tableCard({
      status: { locked: 1, retaliate: 3, tough: 2, confused: 1, stunned: 1 },
    });
    const { container } = render(CardView, { card, face: face() });

    const tabs = [...container.querySelectorAll<HTMLElement>('.statuses .st')];
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'Stunned',
      'Confused',
      'Tough ×2',
      'Retaliate 3',
      'Locked',
    ]);
    expect(tabs.map((tab) => tab.dataset.counter)).toEqual([
      'status:stunned',
      'status:confused',
      'status:tough',
      'status:retaliate',
      'status:locked',
    ]);
  });

  it('shows the Locked status with a small lock', () => {
    const card = tableCard({ status: { locked: 1 } });
    const { container } = render(CardView, { card, face: face() });

    const tab = container.querySelector('.st.locked');
    expect(tab?.textContent).toBe('Locked');
    expect(tab?.querySelector('svg.lock')).not.toBeNull();
  });

  it('shows each modifier with its sign in stat order, a penalty in red', () => {
    const card = tableCard({ mods: { hp: -2, rec: 1, atk: -2, def: 1, thw: 0 } });
    const { container } = render(CardView, { card, face: face() });

    const badges = [...container.querySelectorAll<HTMLElement>('.mods .mod')];
    expect(badges.map((badge) => badge.textContent)).toEqual([
      '−2 ATK',
      '+1 DEF',
      '+1 REC',
      '−2 HP',
    ]);
    // The token pill finds every modifier by its counter name.
    expect(badges.map((badge) => badge.dataset.counter)).toEqual([
      'modifier:atk',
      'modifier:def',
      'modifier:rec',
      'modifier:hp',
    ]);
    expect(badges.map((badge) => badge.classList.contains('neg'))).toEqual([
      true,
      false,
      false,
      true,
    ]);
  });

  it('shows no modifier row when there is none', () => {
    const { container } = render(CardView, {
      card: tableCard({ mods: { atk: 0 } }),
      face: face(),
    });
    expect(container.querySelector('.mods')).toBeNull();
  });

  /** The counter names of the tokens in each group of the card. */
  function tokenGroups(container: HTMLElement): Record<string, string[]> {
    const groups: Record<string, string[]> = {};
    for (const group of container.querySelectorAll<HTMLElement>('.tokens')) {
      const where = ['middle', 'bottom-right', 'top-right'].find((c) =>
        group.classList.contains(c),
      );
      groups[where ?? '?'] = [...group.querySelectorAll<HTMLElement>('[data-counter]')].map(
        (tok) => tok.dataset.counter ?? '',
      );
    }
    return groups;
  }

  it.each([
    ['portrait', 'std'],
    ['landscape', 'land'],
  ] as const)(
    'piles damage then counters up bottom right on a %s classic card, threat in its middle',
    (_, size) => {
      const card = tableCard({ tokens: { dmg: 4, thr: 2, gen: 1 }, status: { stunned: 1 } });
      const { container } = render(CardView, { card, face: face({ type: 'ally', size }) });

      expect(tokenGroups(container)).toEqual({
        middle: ['token:thr'],
        // In the order they pile up from the corner.
        'bottom-right': ['token:dmg', 'token:gen'],
      });
      expect(container.querySelector('.tok.dmg')?.textContent).toBe('4');
      expect(cardElement(container).classList.contains('scheme')).toBe(false);
    },
  );

  it.each([
    ['a portrait side scheme', 'side_scheme', 'std'],
    ['a landscape main scheme', 'main_scheme', 'land'],
  ] as const)(
    'puts threat top right and piles the others up bottom right on %s',
    (_, type, size) => {
      const card = tableCard({ tokens: { dmg: 4, thr: 2, gen: 1 } });
      const { container } = render(CardView, { card, face: face({ type, size }) });

      expect(tokenGroups(container)).toEqual({
        // In the order they pile up from the corner.
        'bottom-right': ['token:dmg', 'token:gen'],
        'top-right': ['token:thr'],
      });
      // The token pill finds every token by its counter name.
      expect(container.querySelector('[data-counter="token:thr"]')?.textContent).toBe('2');
      expect(cardElement(container).classList.contains('scheme')).toBe(true);
    },
  );

  it('draws only the corners that hold a token on a scheme', () => {
    const card = tableCard({ tokens: { thr: 3 } });
    const { container } = render(CardView, { card, face: face({ type: 'main_scheme' }) });
    expect(tokenGroups(container)).toEqual({ 'top-right': ['token:thr'] });
  });

  it('a face-down scheme is not known to be one: its tokens sit in the middle', () => {
    const card = tableCard({ faceDown: true, tokens: { thr: 3 } });
    const { container } = render(CardView, { card, face: face({ type: 'side_scheme' }) });
    expect(tokenGroups(container)).toEqual({ middle: ['token:thr'] });
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
