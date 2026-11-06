// The owner frames and their piles in dock mode (spec 3.7): the table hands them where its
// projection draws them (dockLayout.ts); the piles draw themselves at 60 % from there, the frame at
// its drawn box, while the name line and the chips keep the frame's full width.
import { render, within } from '@testing-library/svelte';
import type { PileView as TablePile } from '../lib/types';
import { DOCK_MODE_KEY } from './dockMode';
import { pile } from './fixtures.testing';
import { ownerFrames } from './layout';
import Surface, { type OwnerBox } from './Surface.svelte';
import type { ComponentProps } from 'svelte';
import surfaceSource from './Surface.svelte?raw';

const PILES: TablePile[] = [
  pile('encounter', { kind: 'encounter', owner: -1, x: 0, y: 70, count: 20 }),
  pile('encounterDiscard', { kind: 'encounterDiscard', owner: -1, x: 130, y: 70, count: 2 }),
];

// The villain's frame is { x: -10, y: 60, w: 262, h: 177 }.
const FRAME = ownerFrames(PILES)[0]!;
const VICTORY = [{ kind: 'victory', pile: 'victory', label: 'Victory display', count: 1 }] as const;
const OWNERS: OwnerBox[] = [
  { frame: FRAME, name: 'Villain', color: 'var(--villain)', outOfPlay: [...VICTORY] },
];

// The same as dock mode's projection hands them: the frame drawn at -6, 24, 157.2 × 106.2, the
// deck and discard 6 inside it, the discard 78 to the right.
const DRAWN_PILES: TablePile[] = [
  { ...PILES[0]!, x: 0, y: 30 },
  { ...PILES[1]!, x: 78, y: 30 },
];
const DRAWN_OWNERS: OwnerBox[] = [
  {
    ...OWNERS[0]!,
    frame: { ...FRAME, x: -6, y: 24, w: 157.2, h: 106.2 },
    nameRoom: 262,
  },
];

function renderSurface(dock: boolean, markers: SurfaceProps['markers'] = {}) {
  return render(Surface, {
    props: {
      cards: [],
      piles: dock ? DRAWN_PILES : PILES,
      owners: dock ? DRAWN_OWNERS : OWNERS,
      topOf: () => undefined,
      faceOf: () => null,
      captionOf: () => undefined,
      onbrowse: () => {},
      width: 1000,
      height: 1000,
      markers,
    },
    context: new Map([[DOCK_MODE_KEY, { current: dock }]]),
  });
}

type SurfaceProps = ComponentProps<typeof Surface>;

function element(container: HTMLElement, selector: string): HTMLElement {
  const found = container.querySelector<HTMLElement>(selector);
  if (!found) {
    throw new Error(`no ${selector}`);
  }
  return found;
}

/** The left, top, width and height an element is drawn at, in table units. */
function placed(el: HTMLElement): number[] {
  return [el.style.left, el.style.top, el.style.width, el.style.height].map(Number.parseFloat);
}

function expectPlaced(el: HTMLElement, expected: number[]): void {
  const actual = placed(el);
  expected.forEach((value, i) => expect(actual[i]).toBeCloseTo(value, 6));
}

describe('Surface in dock mode', () => {
  it('draws each owner frame at its drawn box', () => {
    const { container } = renderSurface(true);

    expectPlaced(element(container, '.ownerbox'), [-6, 24, 157.2, 106.2]);
  });

  it('draws the piles at 60 % from their drawn corner, as their hit areas', () => {
    const { container } = renderSurface(true);

    expectPlaced(element(container, '.pile[data-id="encounter"]'), [0, 30, 67.2, 94.2]);
    expectPlaced(element(container, '.pile[data-id="encounterDiscard"]'), [78, 30, 67.2, 94.2]);
  });

  it('puts the chips on the drawn frame, over the frame width as it would be at full size', () => {
    const { container } = renderSurface(true);

    const chips = element(container, '.chips');
    expect(chips.style.left).toBe('-6px');
    expect(chips.style.top).toBe('24px');
    expect(chips.style.getPropertyValue('--frame-w')).toBe('262px');
  });

  it('draws the markers at 60 % from their drawn corner, their art zoomed with them', () => {
    const { container } = renderSurface(true, {
      firstPlayer: { x: 300, y: 40 },
      active: { x: 200, y: 140 },
    });

    const token = element(container, '.marker[data-marker="firstPlayer"]');
    expectPlaced(token, [300, 40, 50.4, 42]);
    expect(token.classList).toContain('scaled');
    expect(token.style.getPropertyValue('--scale')).toBe('0.6');
    expectPlaced(element(container, '.marker[data-marker="active"]'), [200, 140, 42, 42]);
  });

  it('lets the owner name use up to the full-size frame width', () => {
    const { container } = renderSurface(true);

    const box = element(container, '.ownerbox');
    expect(box.style.getPropertyValue('--name-room')).toBe('262px');
    const owner = /\n {2}\.owner \{([^}]*)\}/.exec(surfaceSource)?.[1];
    expect(owner).toMatch(/max-width: max\(\s*calc\(var\(--name-room, 100%\) - /);
  });
});

describe('the chip lines and the avatars in dock mode (F-U12, F-U13)', () => {
  const ASIDE = { kind: 'aside', pile: 'aside', label: 'Set-aside cards', count: 0 } as const;
  // Hercules's frame holds four piles (deck, discard and two side piles): drawn 313.2 wide, twice
  // the villain's 157.2, both from −6.
  const VILLAIN: OwnerBox = {
    frame: { owner: -1, x: -6, y: 24, w: 157.2, h: 106.2 },
    nameRoom: 262,
    name: 'Villain',
    color: 'var(--villain)',
    avatar: 'rhino.png',
    outOfPlay: [...VICTORY, ASIDE],
  };
  const HERCULES: OwnerBox = {
    frame: { owner: 0, x: -6, y: 200, w: 313.2, h: 106.2 },
    nameRoom: 522,
    name: 'Alex · Hercules',
    color: 'var(--p1)',
    avatar: 'hercules.png',
    tip: '5 cards in hand',
    outOfPlay: [{ ...ASIDE, pile: 'aside:p0' }],
  };

  function renderOwners(owners: OwnerBox[], dock = true) {
    return render(Surface, {
      props: {
        cards: [],
        piles: [],
        owners,
        topOf: () => undefined,
        faceOf: () => null,
        captionOf: () => undefined,
        onbrowse: () => {},
        width: 1000,
        height: 1000,
        markers: {},
      },
      context: new Map([[DOCK_MODE_KEY, { current: dock }]]),
    });
  }

  it('ends every chip line at one right edge, the furthest any line needs, whatever the frame widths', () => {
    const { container } = renderOwners([VILLAIN, HERCULES]);

    // Each line needs its drawn frame's width, or its chips past its avatar when wider.
    const surface = element(container, '.surface');
    expect(surface.style.getPropertyValue('--lines-right')).toBe(
      'max(' +
        '-6px + max(157.2px, 2 * var(--chip-room) + var(--avatar-room) + 8 * var(--lu)), ' +
        '-6px + max(313.2px, 1 * var(--chip-room) + var(--avatar-room) + 8 * var(--lu)))',
    );
    const lines = [...container.querySelectorAll<HTMLElement>('.chips')];
    expect(lines.map((line) => line.style.left)).toEqual(['-6px', '-6px']);
    expect(lines.map((line) => line.style.getPropertyValue('--line-w'))).toEqual([
      'calc(var(--lines-right) - -6px)',
      'calc(var(--lines-right) - -6px)',
    ]);
    const chips = /\n {2}\.chips \{([^}]*)\}/.exec(surfaceSource)?.[1];
    expect(chips).toMatch(/width: var\(\s*--line-w,/);
  });

  it("measures a line that shows its name by the name's room", () => {
    const deck: OwnerBox = {
      frame: { owner: -1, label: 'Hydra Patrol', x: 300, y: 24, w: 157.2, h: 106.2 },
      nameRoom: 262,
      name: 'Hydra Patrol',
      color: 'var(--villain)',
      outOfPlay: [ASIDE],
    };
    const { container } = renderOwners([deck]);

    expect(element(container, '.surface').style.getPropertyValue('--lines-right')).toBe(
      'max(300px + max(262px, 1 * var(--chip-room) + var(--name-min) + 8 * var(--lu)))',
    );
    expect(element(container, '.owner').textContent).toBe('Hydra Patrol');
  });

  it("shows the owner's avatar where the name starts, the full name as its name and tooltip", () => {
    const { container } = renderOwners([VILLAIN, HERCULES]);

    const hero = element(container, '.ownerbox[data-owner="0"]');
    const avatar = within(hero).getByRole('img', { name: 'Alex · Hercules' });
    expect(avatar.dataset.tip).toBe('Alex · Hercules');
    expect(avatar.querySelector('img')?.getAttribute('src')).toBe('hercules.png');
    expect(hero.querySelector('.owner')).toBeNull();
    expect(hero.dataset.tip).toBe('5 cards in hand');
    expect(hero.textContent).toContain('5 cards in hand');
    expect(
      within(element(container, '.ownerbox[data-owner="-1"]')).getByRole('img', {
        name: 'Villain',
      }),
    ).toBeTruthy();
  });

  it("draws the avatar the chips' height, on their line, in a 2 screen px ring", () => {
    const declarations = (selector: string) =>
      new RegExp(`\\n {2}${selector.replace(/[.]/g, '\\.')} \\{([^}]*)\\}`).exec(
        surfaceSource,
      )?.[1] ?? '';
    const chipHeight = /height: (calc\(22 \* var\(--lu\)\));/.exec(declarations('.chips'))?.[1];
    expect(chipHeight).toBe('calc(22 * var(--lu))');
    expect(declarations('.surface')).toContain(`--avatar: ${chipHeight};`);
    expect(declarations('.surface')).toContain('--avatar-ring: calc(2px / var(--z, 1));');
    // The chips lie from 30 to 8 units above the frame, as the avatar does.
    expect(declarations('.chips')).toContain('margin-top: calc(-30 * var(--lu));');
    expect(declarations('.avatar')).toContain('bottom: calc(100% + 2px + 8 * var(--lu));');
  });

  it('draws a plain disc of the owner colour for an owner with no hero', () => {
    const { container } = renderOwners([{ ...HERCULES, avatar: null }]);

    const avatar = within(element(container, '.ownerbox')).getByRole('img', {
      name: 'Alex · Hercules',
    });
    expect(avatar.classList).toContain('empty');
    expect(avatar.querySelector('img')).toBeNull();
  });

  it('leaves the chip lines their own widths out of dock mode', () => {
    const owners = [VILLAIN, HERCULES].map(({ avatar: _, nameRoom: __, ...owner }) => owner);
    const { container } = renderOwners(owners, false);

    expect(element(container, '.surface').style.getPropertyValue('--lines-right')).toBe('');
    const lines = [...container.querySelectorAll<HTMLElement>('.chips')];
    expect(lines.map((line) => line.style.getPropertyValue('--line-w'))).toEqual(['', '']);
    expect(lines.map((line) => line.style.getPropertyValue('--frame-w'))).toEqual([
      '157.2px',
      '313.2px',
    ]);
  });
});

describe('Surface out of dock mode', () => {
  it('draws the frames and their piles full size', () => {
    const { container } = renderSurface(false);

    const box = element(container, '.ownerbox');
    expectPlaced(box, [-10, 60, 262, 177]);
    expect(box.style.getPropertyValue('--name-room')).toBe('');
    expectPlaced(element(container, '.pile[data-id="encounter"]'), [0, 70, 112, 157]);
    expectPlaced(element(container, '.pile[data-id="encounterDiscard"]'), [130, 70, 112, 157]);
    expect(element(container, '.chips').style.getPropertyValue('--frame-w')).toBe('262px');
  });

  it('draws the markers full size', () => {
    const { container } = renderSurface(false, { firstPlayer: { x: 460, y: 450 } });

    const token = element(container, '.marker[data-marker="firstPlayer"]');
    expectPlaced(token, [460, 450, 84, 70]);
    expect(token.classList).not.toContain('scaled');
    expect(token.style.getPropertyValue('--scale')).toBe('');
  });
});
