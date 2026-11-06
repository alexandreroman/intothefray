// The owner frames and their piles in dock mode (spec 3.7): the table hands them where its
// projection draws them (dockLayout.ts); the piles draw themselves at 60 % from there, the frame at
// its drawn box, and the name line keeps within the drawn frame's width.
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

  it('puts the chips on the drawn frame, over its drawn width', () => {
    const { container } = renderSurface(true);

    const chips = element(container, '.chips');
    expect(chips.style.left).toBe('-6px');
    expect(chips.style.top).toBe('24px');
    expect(chips.style.getPropertyValue('--frame-w')).toBe('157.2px');
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

  it('keeps the owner name within the drawn frame width', () => {
    const { container } = renderSurface(true);

    const box = element(container, '.ownerbox');
    expect(box.style.getPropertyValue('--frame-w')).toBe('157.2px');
    expect(box.style.getPropertyValue('--name-room')).toBe('');
  });
});

describe('the chip lines and the avatars in dock mode (F-U13)', () => {
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

  /** The declarations of a rule of Surface.svelte's style, by its selector. */
  function declarations(selector: string): string {
    const escaped = selector.replace(/[.]/g, '\\.');
    return new RegExp(`\\n {2}${escaped} \\{([^}]*)\\}`).exec(surfaceSource)?.[1] ?? '';
  }

  it("starts every chip line's chips right after its avatar, from the left, the same across rows", () => {
    const { container } = renderOwners([VILLAIN, HERCULES]);

    // Every line starts at its frame's left edge, which is the row's: −6 in both rows.
    const lines = [...container.querySelectorAll<HTMLElement>('.chips')];
    expect(lines.map((line) => line.style.left)).toEqual(['-6px', '-6px']);
    for (const line of lines) {
      expect(line.classList).toContain('after-avatar');
      expect(line.querySelector('.name-room')).toBeNull();
    }
    // The avatar ends --avatar-room right of the frame's left edge (the frame's border, the
    // avatar's margin, the avatar and its ring): the chips start --chip-lead past it, as they come.
    expect(declarations('.surface')).toContain(
      '--avatar-room: calc(6px + var(--avatar) + 2 * var(--avatar-ring));',
    );
    expect(declarations('.surface')).toContain('--chip-lead: calc(6 * var(--lu));');
    expect(declarations('.chips.after-avatar')).toContain(
      'padding-left: calc(var(--avatar-room) + var(--chip-lead));',
    );
    expect(surfaceSource).toMatch(
      /\.chips\.after-avatar,\s*\.chips\.after-name \{\s*width: max-content;\s*justify-content: flex-start;/,
    );
    // Victory, then Set-aside, as the owner lists them.
    const villain = lines[0]!;
    expect(
      [...villain.querySelectorAll<HTMLElement>('.chip')].map((chip) => chip.dataset.pile),
    ).toEqual(['victory', 'aside']);
    expect(element(container, '.surface').style.getPropertyValue('--lines-right')).toBe('');
  });

  it('puts the chips of a line that shows its name right after the name', () => {
    const deck: OwnerBox = {
      frame: { owner: -1, label: 'Hydra Patrol', x: 300, y: 24, w: 157.2, h: 106.2 },
      nameRoom: 262,
      name: 'Hydra Patrol',
      color: 'var(--villain)',
      outOfPlay: [ASIDE],
    };
    const { container } = renderOwners([deck]);

    expect(element(container, '.owner').textContent).toBe('Hydra Patrol');
    const line = element(container, '.chips');
    expect(line.classList).toContain('after-name');
    // An unseen copy of the name, from where the name starts, as wide as it shows, holds the room
    // before the chips.
    const room = element(line, '.name-room');
    expect(room.textContent).toBe('Hydra Patrol');
    expect(room.getAttribute('aria-hidden')).toBe('true');
    expect(room.nextElementSibling?.classList).toContain('chip');
    expect(declarations('.name-room')).toContain('visibility: hidden;');
    expect(declarations('.name-room')).toContain(
      'margin: 0 calc(var(--chip-lead) - var(--chip-gap)) 0 6px;',
    );
    expect(declarations('.owner')).toContain('left: 4px;');
  });

  it("cuts a scenario deck's name longer than its drawn frame with an ellipsis, before its chips", () => {
    // A one-pile frame, drawn 79.2 wide (132 at full size).
    const weapons: OwnerBox = {
      frame: { owner: -1, label: 'Experimental Weapons', x: 300, y: 24, w: 79.2, h: 106.2 },
      nameRoom: 132,
      name: 'Experimental Weapons',
      color: 'var(--villain)',
      outOfPlay: [ASIDE],
    };
    const { container } = renderOwners([weapons]);

    // The frame and its chip line both measure the drawn width, not the full-size one.
    const box = element(container, '.ownerbox');
    expect(box.style.getPropertyValue('--frame-w')).toBe('79.2px');
    expect(box.style.getPropertyValue('--chips')).toBe('1');
    expect(element(container, '.chips').style.getPropertyValue('--frame-w')).toBe('79.2px');
    // The room the name has: the frame's drawn width less the name's left inset (the frame's
    // border and 4px), the space before the chips and the chips; never below nothing.
    expect(surfaceSource).toMatch(
      /:is\(\.ownerbox, \.chips\) \{\s*--name-fit: max\(\s*0px,\s*var\(--frame-w\) - 6px - var\(--chip-lead\) - var\(--chips\) \* var\(--chip-room\)\s*\);/,
    );
    // The name, cut to that room on one line with an ellipsis, a tooltip while it is cut, and its
    // unseen copy, which the chips follow, cut the same.
    const name = element(container, '.owner');
    expect(name.classList).toContain('fitted');
    expect(name.textContent).toBe('Experimental Weapons');
    expect(declarations('.owner.fitted')).toContain('max-width: var(--name-fit);');
    expect(declarations('.owner')).toContain('overflow: hidden;');
    expect(declarations('.owner')).toContain('text-overflow: ellipsis;');
    expect(declarations('.owner')).toContain('white-space: nowrap;');
    expect(declarations('.name-room')).toContain('max-width: var(--name-fit);');
  });

  it("gives the tooltip the full name of a cut scenario deck's name", () => {
    const weapons: OwnerBox = {
      frame: { owner: -1, label: 'Experimental Weapons', x: 300, y: 24, w: 79.2, h: 106.2 },
      name: 'Experimental Weapons',
      color: 'var(--villain)',
      outOfPlay: [],
    };
    const { container } = renderOwners([weapons]);

    const name = element(container, '.owner');
    Object.defineProperty(name, 'clientWidth', { value: 40 });
    Object.defineProperty(name, 'scrollWidth', { value: 150 });
    name.dispatchEvent(new Event('pointerover'));
    expect(name.dataset.tip).toBe('Experimental Weapons');
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

  it('leaves the chip lines their own widths, the chips at their right end, out of dock mode', () => {
    const owners = [VILLAIN, HERCULES].map(({ avatar: _, nameRoom: __, ...owner }) => owner);
    const { container } = renderOwners(owners, false);

    const lines = [...container.querySelectorAll<HTMLElement>('.chips')];
    for (const line of lines) {
      expect(line.classList).not.toContain('after-avatar');
      expect(line.classList).not.toContain('after-name');
      expect(line.querySelector('.name-room')).toBeNull();
    }
    expect(declarations('.chips')).toContain('justify-content: flex-end;');
    expect(container.querySelector('.owner.fitted')).toBeNull();
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
