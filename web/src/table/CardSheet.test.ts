import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import CardSheet from './CardSheet.svelte';
import sheetSource from './CardSheet.svelte?raw';
import countersSource from './CardCounters.svelte?raw';
import { DOCK_MODE_KEY } from './dockMode';
import {
  LANDSCAPE_PHONE,
  mockScreen,
  PHONE,
  resizeScreen,
  type TestScreen,
} from '../lib/screen.testing';
import { MAX_COUNT, type ActionItem } from './actions';
import { MOVE_EASING, TILT_MS } from './motion.svelte';
import type { ContextEntry, ContextHeader } from './contextItems';
import type { SheetCounter, StackCard } from './inspector';
import { stubImageDecode } from '../lib/decodeImage.testing';

// Whether the viewer prefers reduced motion; the tests of the motion turn it on and off.
const motion = vi.hoisted(() => ({ reduced: false }));

vi.mock('svelte/motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('svelte/motion')>()),
  prefersReducedMotion: {
    get current() {
      return motion.reduced;
    },
  },
}));

const HEADER: ContextHeader = {
  eyebrow: 'Villain · Stage I',
  name: 'Rhino',
  color: '#a66bff',
  label: 'Rhino, Villain, stage I',
};

/** A pile's header: the sheet's accessible name gives its kind and count. */
const DECK_HEADER: ContextHeader = {
  eyebrow: 'Villain',
  name: 'Encounter deck',
  count: 29,
  color: '#a66bff',
  label: 'Encounter deck, 29 cards',
};

/** A face-down card's header (contextItems.cardHeader). */
const FACE_DOWN_HEADER: ContextHeader = {
  eyebrow: 'Face down',
  name: 'Face-down card',
  color: '#a66bff',
  label: 'Face-down card',
};

function item(id: string, extra: Partial<ActionItem> = {}): ActionItem {
  return { id, label: id.charAt(0).toUpperCase() + id.slice(1), group: 0, ...extra };
}

const EXHAUST = item('exhaust', { key: 'E', default: true });
const FLIP = item('flip', { key: 'F' });
const DISCARD = item('discard', { key: 'X', group: 2 });
const TO_HAND = item('hand', { label: 'Hand' });
const TO_DECK = item('deck', { label: 'Deck', disabled: true, reason: 'The deck is full' });

const ENTRIES: ContextEntry[] = [
  { kind: 'action', item: EXHAUST },
  { kind: 'action', item: FLIP },
  { kind: 'separator' },
  { kind: 'action', item: DISCARD },
  {
    kind: 'submenu',
    id: 'moveTo',
    label: 'Move to…',
    disabled: false,
    entries: [
      { kind: 'action', item: TO_HAND },
      { kind: 'separator' },
      { kind: 'action', item: TO_DECK },
    ],
  },
];

const DAMAGE: SheetCounter = {
  kind: 'token',
  name: 'dmg',
  label: 'Damage',
  value: 3,
  signed: false,
};
const STUNNED: SheetCounter = {
  kind: 'status',
  name: 'stunned',
  label: 'Stunned',
  value: 1,
  signed: false,
};

const TOUGH: SheetCounter = {
  kind: 'status',
  name: 'tough',
  label: 'Tough',
  value: 1,
  signed: false,
};

function modifier(value: number): SheetCounter {
  return { kind: 'modifier', name: 'def', label: 'DEF', value, signed: true };
}

function renderSheet(
  props: {
    entries?: ContextEntry[];
    note?: string;
    counters?: SheetCounter[];
    dock?: boolean;
    stack?: StackCard[];
    cardId?: string;
    header?: ContextHeader;
    images?: string[];
    nextImages?: string[];
    landscape?: boolean;
    exhausted?: boolean;
    tilts?: boolean;
  } = {},
) {
  const onrun = vi.fn();
  const onstep = vi.fn();
  const onclose = vi.fn();
  const onpick = vi.fn();
  const result = render(CardSheet, {
    props: {
      header: props.header ?? HEADER,
      entries: props.entries ?? ENTRIES,
      note: props.note,
      images: props.images ?? ['rhino.png'],
      nextImages: props.nextImages,
      landscape: props.landscape,
      exhausted: props.exhausted,
      tilts: props.tilts,
      counters: props.counters ?? [],
      stack: props.stack,
      // Rhino, a table card, unless the test says otherwise: an undefined cardId is a pile.
      cardId: 'cardId' in props ? props.cardId : 'rhino',
      onrun,
      onstep,
      onpick,
      onclose,
    },
    context: new Map([[DOCK_MODE_KEY, { current: props.dock ?? false }]]),
  });
  return { ...result, onrun, onstep, onpick, onclose };
}

// Rhino with two cards tucked under it, the second one face down.
const STACK: StackCard[] = [
  { id: 'rhino', name: 'Rhino', images: ['rhino.png'], landscape: false },
  { id: 'armor', name: 'Armored Rhino', images: ['armor.png'], landscape: false },
  { id: 'hidden', name: 'Face-down card', images: ['back.png'], landscape: false },
];

const ARMOR_HEADER: ContextHeader = {
  eyebrow: 'Attachment',
  name: 'Armored Rhino',
  color: '#a66bff',
  label: 'Armored Rhino, Attachment',
};

/** A tablet on its side, with a finger: neither dock mode nor a phone on its side. */
const TOUCH_TABLET: TestScreen = { width: 1180, height: 820, touch: true };
/** The same tablet upright. */
const TOUCH_TABLET_UPRIGHT: TestScreen = { width: 820, height: 1180, touch: true };

/** The strip of the stack under the card, if shown. */
/** The carousel of the stack in place of the card, if shown. */
function carousel(): HTMLElement | null {
  return screen.queryByRole('group', { name: 'Attached cards' });
}

/** The cards of the carousel, in order. */
function slides(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('.inspector:not(.measure) .slide')];
}

function slideOf(id: string): HTMLElement {
  return slides().find((slide) => slide.dataset.id === id)!;
}

/** The neighbours of the centred card, which a tap centres. */
function peeks(): HTMLElement[] {
  return within(carousel()!).getAllByRole('button');
}

/** Lays an element out sideways, as jsdom does not: its left edge and its width, in px. */
function placeBox(element: HTMLElement, left: number, width: number): void {
  element.getBoundingClientRect = () => new DOMRect(left, 0, width, 100);
}

/** The declarations of a rule of the sheet's stylesheet, at the given indent. */
function rule(selector: string, indent = 2): string {
  const escaped = selector.replace(/[.()[\]*+]/g, (c) => `\\${c}`);
  const pattern = new RegExp(`\\n {${indent}}${escaped} \\{([^}]*)\\}`);
  return pattern.exec(sheetSource)?.[1] ?? '';
}

/** The pages of the entries, as high as given: jsdom lays nothing out. */
function pagesOf(height: number): HTMLElement {
  const pages = document.querySelector<HTMLElement>('.inspector .pages')!;
  Object.defineProperty(pages, 'offsetHeight', { configurable: true, value: height });
  return pages;
}

/** The card's column, beside it or under it, where its header and counters are. */
function side(): HTMLElement {
  return document.querySelector<HTMLElement>('.inspector .side')!;
}

describe('CardSheet', () => {
  it.each([
    ['a card', HEADER, 'rhino', 'Rhino, Villain, stage I'],
    ['a face-down card', FACE_DOWN_HEADER, 'rhino', 'Face-down card'],
    ['a pile', DECK_HEADER, undefined, 'Encounter deck, 29 cards'],
  ])(
    'draws no title line for %s, the sheet named by its whole header',
    (_, header, cardId, label) => {
      renderSheet({ header, cardId });

      // What it is, its type, stage, owner or count, is heard in the sheet's name, not shown.
      const sheet = screen.getByRole('dialog', { name: label });
      expect(within(sheet).queryByText(header.name)).toBeNull();
      expect(within(sheet).queryByText(header.eyebrow)).toBeNull();
      expect(within(sheet).queryByText('29')).toBeNull();
      // The column starts with the entries.
      expect(side().firstElementChild?.classList).toContain('pages');
    },
  );

  it('shows the card face, named for screen readers', () => {
    renderSheet();

    const sheet = screen.getByRole('dialog', { name: 'Rhino, Villain, stage I' });
    expect(within(sheet).getByRole('img', { name: 'Rhino' }).getAttribute('src')).toBe('rhino.png');
  });

  it('runs an action without closing itself', async () => {
    const { onrun, onclose } = renderSheet();

    await fireEvent.click(screen.getByRole('button', { name: 'Flip' }));

    expect(onrun).toHaveBeenCalledWith(FLIP);
    expect(onclose).not.toHaveBeenCalled();
  });

  /** The tiles of the page shown, not those of the hidden copy that measures the sheet. */
  function shownTiles(): HTMLElement[] {
    return [...document.querySelectorAll<HTMLElement>('.inspector:not(.measure) .page .tile')];
  }

  /** The groups of the page shown: a grid of tiles each, the lines between them as 'sep'. */
  function shownGroups(): (string | string[])[] {
    const groups = document.querySelectorAll('.inspector:not(.measure) .page .group');
    return [...groups].flatMap((group) => {
      const tiles = [...group.querySelectorAll('.tiles > .tile')].map((tile) => tile.textContent);
      return group.querySelector(':scope > .sep') === null ? [tiles] : ['sep', tiles];
    });
  }

  it('draws every entry as a tile, in the order of the menu', () => {
    renderSheet();

    expect(document.querySelector('.inspector:not(.measure) .row')).toBeNull();
    expect(shownTiles().map((tile) => tile.textContent)).toEqual([
      'Exhaust',
      'Flip',
      'Discard',
      'Move to…›',
    ]);
    expect(shownTiles().every((tile) => tile.localName === 'button')).toBe(true);
  });

  it('keeps the order of the menu with the default entry in the middle of its group', () => {
    const ready = item('ready', { default: true });
    renderSheet({
      entries: [
        { kind: 'action', item: FLIP },
        { kind: 'action', item: ready },
        { kind: 'separator' },
        { kind: 'action', item: DISCARD },
      ],
    });

    expect(shownTiles().map((tile) => tile.textContent)).toEqual(['Flip', 'Ready', 'Discard']);
  });

  it('lays each group out as a grid of its own, a thin line between groups', () => {
    renderSheet();

    expect(shownGroups()).toEqual([['Exhaust', 'Flip'], 'sep', ['Discard', 'Move to…›']]);
    expect(rule('.sep')).toContain('height: 1px;');
    expect(rule('.tiles')).toContain('display: grid;');
    const grids = document.querySelectorAll<HTMLElement>('.inspector:not(.measure) .page .tiles');
    // jsdom lays nothing out: two tiles go two by two.
    expect([...grids].map((grid) => grid.dataset.layout)).toEqual(['pairs', 'pairs']);
  });

  it('lays out the tiles of a group as lib/buttonGrid.ts names their layout', () => {
    expect(rule('.tiles')).toContain('grid-template-columns: minmax(0, 1fr);');
    expect(rule(".tiles:global([data-layout='pairs'])")).toContain(
      'grid-template-columns: repeat(2, minmax(0, 1fr));',
    );
    expect(rule(".tiles:global([data-layout='pairs-last'])")).toContain(
      'grid-template-columns: repeat(2, minmax(0, 1fr));',
    );
    expect(rule(".tiles:global([data-layout='pairs-last']) > .tile:last-child")).toContain(
      'grid-column: 1 / -1;',
    );
    expect(rule(".tiles:global([data-layout='row'])")).toContain(
      'grid-template-columns: repeat(3, minmax(0, 1fr));',
    );
  });

  it('gives the last of three tiles that have no room for a row the whole width, not the default', () => {
    renderSheet({
      entries: [
        { kind: 'action', item: EXHAUST },
        { kind: 'action', item: FLIP },
        { kind: 'action', item: item('ready') },
      ],
    });

    const grid = document.querySelector<HTMLElement>('.inspector:not(.measure) .page .tiles')!;
    expect(grid.dataset.layout).toBe('pairs-last');
    expect(grid.lastElementChild?.textContent).toBe('Ready');
  });

  it('draws tiles 44 px high, their labels centred on one line', () => {
    const tile = rule('.tile');
    expect(tile).toContain('min-height: 44px;');
    expect(tile).toContain('justify-content: center;');
    expect(tile).toContain('background: var(--panel-2);');
    expect(tile).toContain('border-radius: 10px;');
    const label = rule('.tile .label');
    expect(label).toContain('white-space: nowrap;');
    expect(rule('.label')).toContain('text-overflow: ellipsis;');
  });

  it('sets no entry apart: the default one is a tile like the others', () => {
    renderSheet();

    const exhaust = screen.getByRole('button', { name: 'Exhaust' });
    expect(exhaust.className).toBe(screen.getByRole('button', { name: 'Flip' }).className);
    expect(exhaust.classList.contains('default')).toBe(false);
    expect(sheetSource).not.toContain('.default');
    expect(sheetSource).not.toContain('var(--accent');
  });

  it('draws a submenu as a tile, its label followed by a ›', () => {
    renderSheet();

    const moveTo = screen.getByRole('button', { name: 'Move to…' });
    expect(moveTo.classList).toContain('tile');
    expect(moveTo.dataset.submenu).toBe('moveTo');
    expect(moveTo.querySelector('.opens')?.textContent).toBe('›');
  });

  it('runs a tile', async () => {
    const { onrun } = renderSheet();

    await fireEvent.click(screen.getByRole('button', { name: 'Discard' }));

    expect(onrun).toHaveBeenCalledWith(DISCARD);
  });

  it('shows no key hints', () => {
    const { container } = renderSheet();

    expect(container.querySelector('kbd')).toBeNull();
    expect(screen.queryByText('E')).toBeNull();
    expect(screen.queryByText('X')).toBeNull();
  });

  it('opens a submenu in the sheet, with a Back row', async () => {
    renderSheet();

    await fireEvent.click(screen.getByRole('button', { name: 'Move to…' }));
    const back = screen.getByRole('button', { name: /Back/ });
    expect(back.classList).toContain('row');
    // The Back row, the whole width, over the submenu's own tiles.
    expect(back.nextElementSibling?.classList).toContain('groups');
    expect(screen.getByRole('button', { name: 'Hand' }).classList).toContain('tile');

    expect(screen.queryByRole('button', { name: 'Exhaust' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Discard' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Hand' })).toBeTruthy();

    await fireEvent.click(screen.getByRole('button', { name: /Back/ }));

    expect(screen.getByRole('button', { name: 'Exhaust' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Hand' })).toBeNull();
  });

  it('goes back to its main page once a submenu entry runs', async () => {
    const stunned = item('stunned', { label: 'Stunned' });
    const { onrun, onclose } = renderSheet({
      entries: [
        { kind: 'action', item: EXHAUST },
        { kind: 'separator' },
        {
          kind: 'submenu',
          id: 'statuses',
          label: 'Add a status',
          disabled: false,
          entries: [{ kind: 'action', item: stunned }],
        },
      ],
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Add a status' }));

    await fireEvent.click(screen.getByRole('button', { name: 'Stunned' }));

    expect(onrun).toHaveBeenCalledExactlyOnceWith(stunned);
    expect(onclose).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Back/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Exhaust' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add a status' }));
  });

  it('stays on the submenu page after an entry that stays open, to choose it again', async () => {
    const dmg = item('dmg', { label: 'Damage', staysOpen: true });
    const { onrun, onclose } = renderSheet({
      entries: [
        { kind: 'action', item: EXHAUST },
        { kind: 'separator' },
        {
          kind: 'submenu',
          id: 'tokens',
          label: 'Add a token',
          disabled: false,
          entries: [{ kind: 'action', item: dmg }],
        },
      ],
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Add a token' }));
    const damage = screen.getByRole('button', { name: 'Damage' });
    damage.focus();

    await fireEvent.click(damage);
    await fireEvent.click(damage);

    expect(onrun.mock.calls).toEqual([[dmg], [dmg]]);
    expect(onclose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Back/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Exhaust' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Damage' })).toBe(damage);
    expect(document.activeElement).toBe(damage);
  });

  it(
    "holds the main page's height in a submenu, which scrolls in it, " +
      'and lets it go back on the main page',
    async () => {
      renderSheet();
      const pages = pagesOf(233);

      await fireEvent.click(screen.getByRole('button', { name: 'Move to…' }));
      expect(pages.style.height).toBe('233px');
      expect(pages.classList).toContain('held');
      expect(rule('.pages.held > .page')).toContain('overflow-y: auto;');
      expect(rule('.pages')).toContain('flex: none;');

      await fireEvent.click(screen.getByRole('button', { name: /Back/ }));
      expect(pages.style.height).toBe('');
      expect(pages.classList).not.toContain('held');
    },
  );

  it("holds the main page's height when a submenu entry runs and the sheet stays", async () => {
    renderSheet();
    const pages = pagesOf(233);
    await fireEvent.click(screen.getByRole('button', { name: 'Move to…' }));

    await fireEvent.click(screen.getByRole('button', { name: 'Hand' }));

    expect(screen.getByRole('button', { name: 'Exhaust' })).toBeTruthy();
    expect(pages.style.height).toBe('');
  });

  it('hides a refused entry in a submenu', async () => {
    renderSheet();
    await fireEvent.click(screen.getByRole('button', { name: 'Move to…' }));

    expect(screen.getByRole('button', { name: 'Hand' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Deck' })).toBeNull();
    expect(screen.queryByText('The deck is full')).toBeNull();
    expect(document.querySelector('.sep')).toBeNull();
  });

  it('hides a refused action and submenu', () => {
    const tapped = item('exhaust', { default: true, disabled: true, reason: 'Locked' });
    const discard = item('discard', { disabled: true, reason: 'This card has no discard pile' });
    renderSheet({
      entries: [
        { kind: 'action', item: tapped },
        { kind: 'action', item: FLIP },
        { kind: 'separator' },
        { kind: 'action', item: discard },
        {
          kind: 'submenu',
          id: 'moveTo',
          label: 'Move to…',
          disabled: true,
          reason: 'Not yours',
          entries: [],
        },
      ],
    });

    expect(screen.getByRole('button', { name: 'Flip' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Exhaust' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Discard' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Move to…' })).toBeNull();
    expect(screen.queryByText('Locked')).toBeNull();
    expect(document.querySelector('.sep')).toBeNull();
  });

  it('hides a submenu whose entries are all refused', () => {
    renderSheet({
      entries: [
        { kind: 'action', item: FLIP },
        {
          kind: 'submenu',
          id: 'moveTo',
          label: 'Move to…',
          disabled: false,
          entries: [{ kind: 'action', item: TO_DECK }],
        },
      ],
    });

    expect(screen.queryByRole('button', { name: 'Move to…' })).toBeNull();
  });

  it('closes an open submenu whose entries all become refused', async () => {
    const { rerender } = renderSheet();
    await fireEvent.click(screen.getByRole('button', { name: 'Move to…' }));

    const refusedHand = { ...TO_HAND, disabled: true, reason: 'Full' };
    await rerender({
      entries: [
        { kind: 'action', item: FLIP },
        {
          kind: 'submenu',
          id: 'moveTo',
          label: 'Move to…',
          disabled: false,
          entries: [{ kind: 'action', item: refusedHand }],
        },
      ],
    });

    expect(screen.queryByRole('button', { name: /Back/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Flip' })).toBeTruthy();
  });

  it('shows the note alone when every entry is refused', () => {
    renderSheet({ entries: [{ kind: 'action', item: TO_DECK }], note: 'Belongs to Sam' });

    expect(screen.getByText('Belongs to Sam')).toBeTruthy();
    expect(screen.queryAllByRole('button')).toEqual([]);
  });

  it('shows only the note when there are no entries', () => {
    renderSheet({ entries: [], note: 'Belongs to Sam' });

    expect(screen.getByText('Belongs to Sam')).toBeTruthy();
    expect(screen.queryAllByRole('button')).toEqual([]);
  });

  describe('the counters on the card', () => {
    /** The layer of tokens and tabs on the shown face. */
    function onFace(): HTMLElement {
      return document.querySelector<HTMLElement>('.inspector:not(.measure) .face .layer')!;
    }

    it('draws the damage disc and the status tab on the card, with no stepper rows', () => {
      renderSheet({ counters: [DAMAGE, STUNNED] });

      const damage = within(onFace()).getByRole('button', { name: 'Damage, 3' });
      expect(damage.textContent).toBe('3');
      expect(damage.classList).toContain('tok');
      expect(damage.classList).toContain('dmg');
      expect(damage.closest('.tokens')?.classList).toContain('bottom-right');
      const stunned = within(onFace()).getByRole('button', { name: 'Stunned' });
      expect(stunned.textContent?.trim()).toBe('Stunned');
      expect(stunned.classList).toContain('st');
      expect(stunned.closest('.statuses')).toBeTruthy();
      expect(document.querySelector('.counter')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Add one damage' })).toBeNull();
    });

    it('opens a pill on a tapped token, whose + and − step it', async () => {
      const { onstep } = renderSheet({ counters: [DAMAGE] });

      await fireEvent.click(screen.getByRole('button', { name: 'Damage, 3' }));
      const pill = screen.getByRole('group', { name: 'Change damage' });
      expect(within(pill).getByText('3')).toBeTruthy();
      await fireEvent.click(within(pill).getByRole('button', { name: 'Add one damage' }));
      await fireEvent.click(within(pill).getByRole('button', { name: 'Remove one damage' }));

      expect(onstep.mock.calls).toEqual([
        [DAMAGE, 1],
        [DAMAGE, -1],
      ]);
    });

    it('shows the new value in the pill, which stays open', async () => {
      const { rerender } = renderSheet({ counters: [DAMAGE] });

      await fireEvent.click(screen.getByRole('button', { name: 'Damage, 3' }));
      await rerender({ counters: [{ ...DAMAGE, value: 4 }] });

      const pill = screen.getByRole('group', { name: 'Change damage' });
      expect(within(pill).getByText('4')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Damage, 4' }).textContent).toBe('4');
    });

    it('gives a status a − / + pill: + adds one, − takes one away', async () => {
      const { onstep } = renderSheet({ entries: [], counters: [TOUGH] });

      await fireEvent.click(screen.getByRole('button', { name: 'Tough' }));
      const pill = screen.getByRole('group', { name: 'Change tough' });
      expect(within(pill).getAllByRole('button')).toHaveLength(2);
      expect(within(pill).getByText('1')).toBeTruthy();
      await fireEvent.click(within(pill).getByRole('button', { name: 'Add one tough' }));
      await fireEvent.click(within(pill).getByRole('button', { name: 'Remove one tough' }));

      expect(onstep.mock.calls).toEqual([
        [TOUGH, 1],
        [TOUGH, -1],
      ]);
    });

    it('shows a status count of several on its tab and in its pill', async () => {
      const { rerender } = renderSheet({ entries: [], counters: [TOUGH] });

      await fireEvent.click(screen.getByRole('button', { name: 'Tough' }));
      await rerender({ counters: [{ ...TOUGH, value: 2 }] });

      const tab = screen.getByRole('button', { name: 'Tough, 2' });
      expect(tab.textContent?.trim()).toBe('Tough ×2');
      const pill = screen.getByRole('group', { name: 'Change tough' });
      expect(within(pill).getByText('2')).toBeTruthy();
    });

    it('lets a status and its pill go once − takes its last one away', async () => {
      const { onstep, rerender } = renderSheet({ entries: [], counters: [TOUGH] });

      await fireEvent.click(screen.getByRole('button', { name: 'Tough' }));
      await fireEvent.click(screen.getByRole('button', { name: 'Remove one tough' }));
      expect(onstep).toHaveBeenCalledWith(TOUGH, -1);
      await rerender({ counters: [] });
      await tick();

      expect(screen.queryByRole('button', { name: /Tough/ })).toBeNull();
      expect(screen.queryByRole('group', { name: 'Change tough' })).toBeNull();
    });

    it('closes the pill on a press elsewhere, and on a second tap of its token', async () => {
      renderSheet({ counters: [DAMAGE] });
      const damage = screen.getByRole('button', { name: 'Damage, 3' });

      await fireEvent.click(damage);
      await fireEvent.pointerDown(screen.getByRole('button', { name: 'Exhaust' }));
      await tick();
      expect(screen.queryByRole('group', { name: 'Change damage' })).toBeNull();

      await fireEvent.click(damage);
      await fireEvent.click(damage);
      await tick();
      expect(screen.queryByRole('group', { name: 'Change damage' })).toBeNull();
    });

    it('lets the token and its pill go once the counter is down to zero', async () => {
      const { rerender } = renderSheet({ counters: [DAMAGE] });

      await fireEvent.click(screen.getByRole('button', { name: 'Damage, 3' }));
      await rerender({ counters: [] });
      await tick();

      expect(screen.queryByRole('button', { name: /Damage/ })).toBeNull();
      expect(screen.queryByRole('group', { name: 'Change damage' })).toBeNull();
    });

    it('shows a modifier with its sign, and stops it at its largest and smallest', async () => {
      const { rerender } = renderSheet({ counters: [modifier(MAX_COUNT)] });

      await fireEvent.click(screen.getByRole('button', { name: 'DEF, +99' }));
      const add = () =>
        screen.getByRole('button', { name: 'Add one to the DEF modifier' }) as HTMLButtonElement;
      const remove = () =>
        screen.getByRole('button', {
          name: 'Remove one from the DEF modifier',
        }) as HTMLButtonElement;
      expect(add().disabled).toBe(true);
      expect(remove().disabled).toBe(false);

      await rerender({ counters: [modifier(-MAX_COUNT)] });
      expect(screen.getByRole('button', { name: 'DEF, −99' })).toBeTruthy();
      expect(add().disabled).toBe(false);
      expect(remove().disabled).toBe(true);
    });

    it("puts a scheme's threat in the top right corner and its tabs on the left edge", () => {
      const threat: SheetCounter = {
        kind: 'token',
        name: 'thr',
        label: 'Threat',
        value: 5,
        signed: false,
      };
      renderSheet({
        header: { ...HEADER, scheme: true },
        counters: [threat, STUNNED],
        landscape: true,
      });

      const card = onFace().querySelector('.card')!;
      expect(card.classList).toContain('scheme');
      expect(card.classList).toContain('land');
      const chip = screen.getByRole('button', { name: 'Threat, 5' });
      expect(chip.closest('.tokens')?.classList).toContain('top-right');
    });

    it('draws the tokens of the other cards of the stack, as a picture alone', () => {
      const armor: StackCard = { ...STACK[1]!, counters: [{ ...DAMAGE, value: 2 }] };
      renderSheet({ stack: [STACK[0]!, armor, STACK[2]!], cardId: 'rhino' });

      const peek = slideOf('armor');
      const chip = peek.querySelector('.tok.dmg')!;
      expect(chip.textContent).toBe('2');
      const layer = chip.closest<HTMLElement>('.layer')!;
      expect(layer.getAttribute('aria-hidden')).toBe('true');
      // Out of reach: neither focused nor pressed, a tap on it is a tap on the card.
      expect(layer.inert).toBe(true);
      expect(countersSource).toMatch(/\.layer\[inert\] \.tokens,[^}]*pointer-events: none;/);
    });
  });

  describe('the exhausted tilt', () => {
    /** The card drawn in the shown face, which tilts. */
    function tilt(): HTMLElement {
      return document.querySelector<HTMLElement>('.inspector:not(.measure) .face > .tilt')!;
    }

    function face(): HTMLElement {
      return document.querySelector<HTMLElement>('.inspector:not(.measure) .face')!;
    }

    it('draws an exhausted card tilted, a ready one upright', () => {
      const { unmount } = renderSheet({ exhausted: true, tilts: true });
      expect(tilt().classList).toContain('exhausted');
      unmount();

      renderSheet({ exhausted: false, tilts: true });
      expect(tilt().classList).not.toContain('exhausted');
    });

    it('tilts the same card as the view exhausts it, and turns it upright as it readies', async () => {
      const { rerender } = renderSheet({ tilts: true });
      const card = tilt();

      await rerender({ exhausted: true });
      expect(tilt()).toBe(card);
      expect(card.classList).toContain('exhausted');

      await rerender({ exhausted: false });
      expect(tilt()).toBe(card);
      expect(card.classList).not.toContain('exhausted');
    });

    it('reads Ready on the same Exhaust tile as the card tilts', async () => {
      const { rerender } = renderSheet({ tilts: true });
      const tile = screen.getByRole('button', { name: 'Exhaust' });

      const READY = { ...EXHAUST, label: 'Ready' };
      await rerender({
        exhausted: true,
        entries: [{ kind: 'action', item: READY }, ...ENTRIES.slice(1)],
      });

      expect(screen.getByRole('button', { name: 'Ready' })).toBe(tile);
      expect(tilt().classList).toContain('exhausted');
    });

    it('turns the face and its counters together', () => {
      renderSheet({ exhausted: true, tilts: true, counters: [DAMAGE, STUNNED] });

      expect(tilt().querySelector('img')?.getAttribute('src')).toBe('rhino.png');
      expect(within(tilt()).getByRole('button', { name: 'Damage, 3' })).toBeTruthy();
      expect(within(tilt()).getByRole('button', { name: 'Stunned' })).toBeTruthy();
    });

    it('reserves the bounds of a card that can tilt, and not of one that cannot', () => {
      const { unmount } = renderSheet({ tilts: true });
      expect(face().classList).toContain('tilts');
      unmount();

      renderSheet({ tilts: false });
      expect(face().classList).not.toContain('tilts');
    });

    it("turns clockwise by the table's angle on rotate, apart from the face's turn over", () => {
      expect(rule('.tilt.exhausted')).toContain('rotate: var(--exhaust-angle);');
      expect(rule('.tilt.exhausted')).not.toContain('transform');
      // The face turns over on transform and scale; the card in it tilts on rotate alone.
      expect(rule('.tilt')).not.toContain('transform');
      expect(rule('.tilt')).not.toContain('transition');
    });

    it("plays the table's tilt, only without reduced motion", () => {
      renderSheet({ tilts: true });

      const inspector = document.querySelector<HTMLElement>('.inspector:not(.measure)')!;
      expect(inspector.style.getPropertyValue('--tilt-ms')).toBe(`${TILT_MS}ms`);
      expect(inspector.style.getPropertyValue('--tilt-easing')).toBe(MOVE_EASING);
      expect(rule('.tilt', 4)).toContain('transition: rotate var(--tilt-ms) var(--tilt-easing);');
      // Inside the block: its lines are indented by four spaces at least, up to its closing brace.
      expect(sheetSource).toMatch(
        /@media \(prefers-reduced-motion: no-preference\) \{(?:\n {4}.*|\n)*?\n {4}\.tilt \{\n {6}transition: rotate/,
      );
    });

    it('gives a card that can tilt the box of its tilted bounds, and draws it to fill them', () => {
      const inspector = rule('.inspector');
      expect(inspector).toContain('--tilt-cos: cos(var(--exhaust-angle));');
      expect(inspector).toContain('--tilt-sin: sin(var(--exhaust-angle));');
      const face = rule('.face');
      expect(face).toContain('--card-ratio: 5 / 7;');
      expect(face).toContain('--face-ratio: var(--card-ratio);');
      expect(rule('.face.land')).toContain('--card-ratio: 7 / 5;');
      // (r·c + s) / (c + r·s): the width over the height of the card's bounds, tilted.
      const tilted = rule(
        '.face.tilts,\n  .slide.tilts,\n  .spacer.tilts,\n  .visual.stacked.tilts',
      );
      expect(tilted).toContain('(var(--card-ratio) * var(--tilt-cos) + var(--tilt-sin)) /');
      expect(tilted).toContain('(var(--tilt-cos) + var(--card-ratio) * var(--tilt-sin))');
      const drawn = rule('.face.tilts > .tilt');
      expect(drawn).toContain(
        'width: calc(100% * var(--card-ratio) / (var(--card-ratio) * var(--tilt-cos) + var(--tilt-sin)));',
      );
      expect(drawn).toContain(
        'height: calc(100% / (var(--tilt-cos) + var(--card-ratio) * var(--tilt-sin)));',
      );
      // Centred in its face, which it fills for a card that cannot tilt.
      const card = rule('.tilt');
      expect(card).toContain('position: absolute;');
      expect(card).toContain('inset: 0;');
      expect(card).toContain('margin: auto;');
    });

    it('carries the shadow and the corners on the card that tilts, not on its face', () => {
      expect(rule('.tilt')).toContain('box-shadow: 4px 6px 16px #000c;');
      expect(rule('.tilt')).toContain('border-radius: var(--card-radius);');
      expect(rule('.face.land > .tilt')).toContain('border-radius: var(--card-radius-land);');
      expect(rule('.face')).not.toContain('box-shadow');
      expect(rule('.face')).not.toContain('border-radius');
      expect(rule('.slide.dim > .face > .tilt')).toContain('box-shadow: 2px 4px 10px #000a;');
    });

    describe('in a stack', () => {
      function tiltOf(id: string): HTMLElement {
        return slideOf(id).querySelector<HTMLElement>('.face > .tilt')!;
      }

      const TILTING: StackCard[] = [
        { ...STACK[0]!, exhausted: false, tilts: true },
        { ...STACK[1]!, exhausted: true, tilts: true },
        { ...STACK[2]!, tilts: false },
      ];

      it('tilts each card by its own state, the shown one as the view says', () => {
        renderSheet({ stack: TILTING, cardId: 'rhino', exhausted: true, tilts: true });

        expect(tiltOf('rhino').classList).toContain('exhausted');
        expect(tiltOf('armor').classList).toContain('exhausted');
        expect(tiltOf('hidden').classList).not.toContain('exhausted');
      });

      it('reserves the tilted bounds of each card that can tilt, its spacer with it', () => {
        renderSheet({ stack: TILTING, cardId: 'armor', tilts: true });

        expect(slides().map((slide) => slide.classList.contains('tilts'))).toEqual([
          true,
          true,
          false,
        ]);
        expect(slideOf('rhino').querySelector('.face')?.classList).toContain('tilts');
        expect(slideOf('hidden').querySelector('.face')?.classList).not.toContain('tilts');
        const spacers = [...document.querySelectorAll('.inspector:not(.measure) .spacer')];
        expect(spacers.map((spacer) => spacer.classList.contains('tilts'))).toEqual([true, false]);
      });

      it('tilts the card the sheet switches to without drawing it again', async () => {
        const { rerender } = renderSheet({ stack: TILTING, cardId: 'rhino', tilts: true });
        const armor = tiltOf('armor');

        await rerender({ cardId: 'armor', header: ARMOR_HEADER, exhausted: true });

        expect(tiltOf('armor')).toBe(armor);
        expect(armor.classList).toContain('exhausted');
        expect(tiltOf('rhino').classList).not.toContain('exhausted');
      });

      it("sizes the carousel by its main card's box, tilted when it can tilt", () => {
        const { unmount } = renderSheet({ stack: TILTING, cardId: 'armor' });
        const visual = () => document.querySelector('.inspector:not(.measure) .visual.stacked')!;
        expect(visual().classList).toContain('tilts');
        unmount();

        renderSheet({
          stack: [{ ...TILTING[0]!, tilts: false }, ...TILTING.slice(1)],
          cardId: 'armor',
        });
        expect(visual().classList).not.toContain('tilts');
        // The main card's portrait box: a landscape box's ratio is its inverse.
        const stacked = rule('.visual.stacked');
        expect(stacked).toContain('--card-ratio: 5 / 7;');
        expect(stacked).toContain('--face-ratio: var(--card-ratio);');
      });
    });
  });

  it('closes on Escape', async () => {
    const { onclose } = renderSheet();

    await fireEvent.keyDown(window, { key: 'Escape' });

    expect(onclose).toHaveBeenCalledOnce();
  });

  describe('in dock mode', () => {
    it('puts every entry in the column, the counters on the card', () => {
      renderSheet({ dock: true, counters: [DAMAGE], note: undefined });

      const sheet = screen.getByRole('dialog', { name: 'Rhino, Villain, stage I' });
      expect(sheet.classList).toContain('dock');
      expect(document.querySelector('.inspector')?.classList).toContain('dock');
      const column = side();
      expect(within(column).queryByRole('button', { name: 'Damage, 3' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Damage, 3' }).closest('.face')).toBeTruthy();
      expect(within(column).getByRole('button', { name: 'Exhaust' })).toBeTruthy();
      expect(within(column).getByRole('button', { name: 'Discard' })).toBeTruthy();
      expect(within(column).getByRole('button', { name: /Move to/ })).toBeTruthy();
      // The face and its column are all the sheet holds.
      expect(document.querySelector('.inspector')?.children).toHaveLength(1);
    });

    it('is not a wide sheet, nor laid out as a tablet', () => {
      renderSheet({ dock: true });

      const sheet = screen.getByRole('dialog', { name: 'Rhino, Villain, stage I' });
      expect(sheet.classList).not.toContain('wide');
      expect(document.querySelector('.inspector')?.classList).not.toContain('tablet');
    });

    it('shows a note in the column too', () => {
      renderSheet({ dock: true, entries: [], note: 'Not your card' });

      expect(within(side()).getByText('Not your card')).toBeTruthy();
    });

    it('drills a submenu down in place, in the column, with a Back row', async () => {
      renderSheet({ dock: true });

      await fireEvent.click(screen.getByRole('button', { name: /Move to/ }));

      const column = side();
      expect(within(column).getByRole('button', { name: /Back/ })).toBeTruthy();
      expect(within(column).getByRole('button', { name: 'Hand' })).toBeTruthy();
      expect(within(column).queryByRole('button', { name: 'Exhaust' })).toBeNull();
    });

    it('upright, puts the card on top, centred, at most 42 % of the screen high', () => {
      const top = rule('.inspector.dock:not(.beside) .top');
      expect(top).toContain('flex-direction: column;');
      expect(top).toContain('align-items: center;');
      expect(rule('.inspector.dock:not(.beside) .visual')).toContain('width: 100%;');
      expect(rule('.inspector.dock .visual')).toContain('align-items: center;');
      expect(rule('.inspector.dock:not(.beside) .visual > .face')).toContain(
        'width: min(100%, calc(42dvh * var(--face-ratio)));',
      );
      expect(rule('.face')).toContain('--card-ratio: 5 / 7;');
      expect(rule('.face')).toContain('--face-ratio: var(--card-ratio);');
      expect(rule('.face')).toContain('aspect-ratio: var(--face-ratio);');
      expect(rule('.face.land')).toContain('--card-ratio: 7 / 5;');
    });

    it('keeps one gutter around the card and its column, the sheet padding its edges by 12 px', () => {
      // The status tabs and modifier badges stand 6 table units out of the card (CardCounters).
      const inspector = rule('.inspector');
      expect(inspector).toContain(
        '--overhang: max(var(--portrait-w) * 6 / 112, var(--landscape-w) * 6 / 157);',
      );
      expect(inspector).toContain('--gutter: calc(var(--overhang) + 12px);');
      expect(rule('.top')).toContain('gap: var(--gutter);');
      const dock = rule('.inspector.dock');
      expect(dock).toContain('--portrait-w: min(100dvw - 24px, 42dvh * 5 / 7);');
      expect(dock).toContain('--landscape-w: min(100dvw - 24px, 42dvh * 7 / 5);');
      expect(dock).toContain('padding: 0 calc(var(--gutter) - 12px) calc(var(--gutter) - 12px);');
    });

    it('upright, lays the header, the counters and the entries full width under the card', () => {
      const column = rule('.inspector.dock .side');
      expect(column).toContain('align-self: stretch;');
      // The whole sheet scrolls (Sheet.svelte), not the column.
      expect(column).not.toContain('overflow-y');
    });

    it('on its side, keeps the card the whole sheet high beside a column that scrolls', () => {
      // Side by side, as beside a tablet's card: the upright rules leave it alone.
      expect(rule('.top')).not.toContain('flex-direction');
      expect(rule('.inspector.dock .visual')).not.toContain('width');
      // The card and its column as high as the sheet's room less the gutter under them.
      const dock = rule('.inspector.dock.beside');
      expect(dock).toContain('--card-room: calc(var(--sheet-room) - var(--gutter) + 12px);');
      expect(dock).toContain('--portrait-w: calc(var(--sheet-room) * 5 / 7);');
      expect(dock).toContain('--landscape-w: calc(var(--sheet-room) * 7 / 5);');
      const face = rule('.inspector.beside .visual > .face');
      expect(face).toContain('height: var(--card-room);');
      expect(face).not.toContain('width');
      const column = rule('.inspector.beside .side');
      expect(column).toContain('max-height: var(--card-room);');
      expect(column).toContain('overflow-y: auto;');
    });

    it('makes every tile 44 px high, and the Back row the whole width', () => {
      expect(rule('.tile')).toContain('min-height: 44px;');
      const row = rule('.row');
      expect(row).toContain('min-height: 44px;');
      expect(row).toContain('width: 100%;');
    });
  });

  describe('on a tablet (outside dock mode)', () => {
    it('puts every entry in the column beside the card, in a wide sheet', () => {
      renderSheet({ dock: false, counters: [DAMAGE] });

      const sheet = screen.getByRole('dialog', { name: 'Rhino, Villain, stage I' });
      expect(sheet.classList).toContain('wide');
      expect(sheet.classList).not.toContain('dock');
      expect(document.querySelector('.inspector')?.classList).toContain('tablet');
      const column = side();
      expect(within(column).getByRole('button', { name: 'Exhaust' })).toBeTruthy();
      expect(within(column).getByRole('button', { name: 'Discard' })).toBeTruthy();
      expect(within(column).getByRole('button', { name: /Move to/ })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Damage, 3' }).closest('.face')).toBeTruthy();
      // The face and its column are all the sheet holds.
      expect(document.querySelector('.inspector')?.children).toHaveLength(1);
    });

    it('shows a note in the column too', () => {
      renderSheet({ dock: false, entries: [], note: 'Not your card' });

      expect(within(side()).getByText('Not your card')).toBeTruthy();
    });

    it('drills a submenu down in place, in the column, with a Back row', async () => {
      renderSheet({ dock: false });

      await fireEvent.click(screen.getByRole('button', { name: /Move to/ }));

      const column = side();
      expect(within(column).getByRole('button', { name: /Back/ })).toBeTruthy();
      expect(within(column).getByRole('button', { name: 'Hand' })).toBeTruthy();
    });

    /** The classes of the inspector shown, not of the hidden copy that measures the sheet. */
    function inspectorClasses(): DOMTokenList {
      return document.querySelector<HTMLElement>('.inspector:not(.measure)')!.classList;
    }

    it('lays the column beside a portrait card, under a landscape one', () => {
      const { unmount } = renderSheet({ dock: false });
      expect(inspectorClasses()).toContain('beside');
      expect(inspectorClasses()).not.toContain('column');
      unmount();

      renderSheet({ dock: false, landscape: true });
      expect(inspectorClasses()).toContain('column');
      expect(inspectorClasses()).not.toContain('beside');
      // Still a wide sheet.
      expect(screen.getByRole('dialog').classList).toContain('wide');
    });

    it("lays a stack out by its main card's orientation, whichever card is shown", () => {
      const scheme: StackCard = { ...STACK[0]!, landscape: true };
      renderSheet({ dock: false, stack: [scheme, STACK[1]!], cardId: 'armor' });

      expect(inspectorClasses()).toContain('column');
    });

    describe("following the screen's orientation", () => {
      afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
      });

      it('on its side, lays a landscape card beside its column, in a sheet as wide as its content', () => {
        mockScreen(TOUCH_TABLET);
        renderSheet({ dock: false, landscape: true });

        expect(inspectorClasses()).toContain('beside');
        expect(inspectorClasses()).toContain('land');
        expect(inspectorClasses()).not.toContain('column');
        const sheet = screen.getByRole('dialog');
        expect(sheet.classList).toContain('wide');
        expect(sheet.classList).toContain('fit');
      });

      it('upright, lays a landscape card above its column, in a wide sheet', () => {
        mockScreen(TOUCH_TABLET_UPRIGHT);
        renderSheet({ dock: false, landscape: true });

        expect(inspectorClasses()).toContain('column');
        expect(inspectorClasses()).not.toContain('beside');
        expect(screen.getByRole('dialog').classList).not.toContain('fit');
      });

      it.each([
        ['on its side', TOUCH_TABLET],
        ['upright', TOUCH_TABLET_UPRIGHT],
      ])('%s, lays a portrait card beside its column, in a wide sheet', (_, screenSize) => {
        mockScreen(screenSize);
        renderSheet({ dock: false });

        expect(inspectorClasses()).toContain('beside');
        expect(inspectorClasses()).not.toContain('land');
        expect(screen.getByRole('dialog').classList).not.toContain('fit');
      });

      it("on its side, lays a stack out beside its column by its main card's orientation", () => {
        mockScreen(TOUCH_TABLET);
        const scheme: StackCard = { ...STACK[0]!, landscape: true };
        renderSheet({ dock: false, stack: [scheme, STACK[1]!], cardId: 'armor' });

        expect(inspectorClasses()).toContain('beside');
        expect(inspectorClasses()).toContain('land');
      });

      it('lays the sheet out again as the tablet turns', async () => {
        const lists = mockScreen(TOUCH_TABLET);
        renderSheet({ dock: false, landscape: true });

        await resizeScreen(lists, TOUCH_TABLET_UPRIGHT);
        expect(inspectorClasses()).toContain('column');
        expect(screen.getByRole('dialog').classList).not.toContain('fit');

        await resizeScreen(lists, TOUCH_TABLET);
        expect(inspectorClasses()).toContain('beside');
        expect(screen.getByRole('dialog').classList).toContain('fit');
      });

      it("leaves dock mode's layout alone, a phone on its side included", () => {
        mockScreen(LANDSCAPE_PHONE);
        renderSheet({ dock: true, landscape: true });

        expect(inspectorClasses()).toContain('dock');
        expect(inspectorClasses()).not.toContain('tablet');
        expect(inspectorClasses()).not.toContain('land');
        expect(screen.getByRole('dialog').classList).not.toContain('fit');
      });

      it.each([
        ['on its side', LANDSCAPE_PHONE, true],
        ['upright', PHONE, false],
      ])('on a phone %s, lays the column beside the card: %s', (_, screenSize, beside) => {
        mockScreen(screenSize);
        renderSheet({ dock: true });

        expect(inspectorClasses().contains('beside')).toBe(beside);
      });
    });

    it('makes a portrait card as high as the room, at most 460 px and 70 % of the screen', () => {
      expect(rule('.inspector.tablet')).toContain('--sheet-room: min(460px, 70dvh);');
      const tablet = rule('.inspector.tablet');
      expect(tablet).toContain('--card-room: var(--sheet-room);');
      expect(tablet).toContain('--portrait-w: calc(var(--sheet-room) * 5 / 7);');
      expect(tablet).toContain('--land-room: calc(var(--sheet-room) * 3 / 4);');
      expect(tablet).toContain('--landscape-w: var(--land-room);');
      // The sheet pads its bottom by 14 px (Sheet.svelte), its sides not at all.
      expect(tablet).toContain('padding: 0 var(--gutter) calc(var(--gutter) - 14px);');
      expect(rule('.inspector.beside .visual > .face')).toContain('height: var(--card-room);');
      // Side by side: the face beside its column.
      expect(rule('.top')).not.toContain('flex-direction');
    });

    it("keeps the column beside a stack level with its shown card, inside the carousel's padding and dots", () => {
      expect(rule('.inspector')).toContain('--carousel-top: 10px;');
      expect(rule('.carousel')).toContain('padding-block: var(--carousel-top) 14px;');
      expect(rule('.inspector.beside .visual.stacked + .side')).toContain(
        'padding-block: var(--carousel-top) calc(var(--carousel-chrome) - var(--carousel-top));',
      );
    });

    it("sizes a portrait stack's carousel as a phone on its side does", () => {
      const stacked = rule('.inspector.beside .visual.stacked');
      expect(stacked).toContain('--slide-h: calc(var(--card-room) - var(--carousel-chrome));');
      expect(stacked).toContain('width: calc(var(--slide-h) * var(--face-ratio) + 88px);');
      expect(rule('.inspector')).toContain('--carousel-chrome: 38px;');
    });

    it('keeps the column beside a portrait card at most as high as it, the only part that scrolls', () => {
      const column = rule('.inspector.beside .side');
      expect(column).toContain('align-self: stretch;');
      expect(column).toContain('max-height: var(--card-room);');
      expect(column).toContain('overflow-y: auto;');
      expect(column).toContain('overscroll-behavior: contain;');
    });

    it("centres the column's content on the card beside it, its auto margins sharing the room", () => {
      // Auto margins rather than justify-content: a column taller than the card starts at its top.
      const firsts =
        '.inspector.beside .side > :first-child,\n  .inspector.beside .pages.held > .page > :first-child';
      const lasts =
        '.inspector.beside .side > :last-child,\n  .inspector.beside .pages.held > .page > :last-child';
      expect(rule(firsts)).toContain('margin-top: auto;');
      expect(rule(lasts)).toContain('margin-bottom: auto;');
      expect(rule('.inspector.beside .side')).not.toContain('justify-content');
      expect(rule('.inspector.dock .side')).toContain('align-self: stretch;');
      // Under the card (dock mode upright, a tablet upright's scheme), the column needs no margin.
      expect(rule('.inspector.column .side')).not.toContain('margin');
    });

    it('on its side, lays a landscape card as wide as the room beside a column of about 340 px', () => {
      expect(rule('.inspector.beside.land')).toContain('--landscape-w: var(--sheet-room);');
      const face = rule('.inspector.tablet.beside .visual > .face.land');
      expect(face).toContain('width: var(--sheet-room);');
      expect(face).toContain('height: auto;');
      // Top-aligned beside its column, which keeps its width rather than growing.
      expect(rule('.top')).toContain('align-items: flex-start;');
      const column = rule('.inspector.beside.land .side');
      expect(column).toContain('width: 340px;');
      expect(column).toContain('flex: 0 1 auto;');
      // At most as high as the room, scrolling past it, as beside a portrait card.
      expect(rule('.inspector.beside .side')).toContain('max-height: var(--card-room);');
      const stacked = rule('.inspector.beside.land .visual.stacked');
      expect(stacked).toContain('--slide-h: calc(var(--sheet-room) * var(--face-ratio));');
      expect(stacked).toContain('--slide-max: 100%;');
      expect(stacked).toContain('width: calc(var(--sheet-room) + 88px);');
    });

    it('measures a side beside a landscape card at the width the sheet will fit it to', () => {
      const copy = rule('.inspector.measure.land');
      expect(copy).toContain('width: max-content;');
      expect(copy).toContain('max-width: calc(100vw - 34px);');
    });

    it('upright, puts a landscape card on top, 3 / 4 as wide as the room, its column full width under it', () => {
      const top = rule('.inspector.column .top');
      expect(top).toContain('flex-direction: column;');
      expect(top).toContain('align-items: center;');
      expect(rule('.inspector.column .visual > .face')).toContain(
        'width: min(var(--land-room), 100%);',
      );
      expect(rule('.inspector.column .visual.stacked')).toContain(
        '--slide-h: calc(var(--land-room) * var(--face-ratio));',
      );
      const column = rule('.inspector.column .side');
      expect(column).toContain('align-self: stretch;');
      // The whole sheet scrolls (Sheet.svelte), not the column.
      expect(column).not.toContain('overflow-y');
    });

    it('draws every entry as a tile, group by group, as on a phone', () => {
      renderSheet({ dock: false });

      expect(shownGroups()).toEqual([['Exhaust', 'Flip'], 'sep', ['Discard', 'Move to…›']]);
    });
  });

  describe('the stack of the card', () => {
    it('shows the stack in a carousel in place of the card, the main card first and centred', () => {
      renderSheet({ stack: STACK, cardId: 'rhino' });

      expect(slides().map((slide) => slide.dataset.id)).toEqual(['rhino', 'armor', 'hidden']);
      expect(slides().map((slide) => slide.getAttribute('aria-current'))).toEqual([
        'true',
        null,
        null,
      ]);
      expect(slides().map((slide) => slide.classList.contains('dim'))).toEqual([false, true, true]);
      // The centred card is the inspector's face, the one that turns over.
      expect(slideOf('rhino').querySelector('.face')).not.toBeNull();
      expect(within(carousel()!).getByRole('img', { name: 'Rhino' })).toBeTruthy();
      // On the line of the card: no strip under it.
      expect(document.querySelector('.inspector .visual > .face')).toBeNull();
      expect(document.querySelector('.inspector .thumbs')).toBeNull();
    });

    it('draws each neighbour with its own face, a face-down card its back', () => {
      renderSheet({ stack: STACK, cardId: 'rhino' });

      const sources = slides().map((slide) => slide.querySelector('img')?.getAttribute('src'));
      expect(sources).toEqual(['rhino.png', 'armor.png', 'back.png']);
    });

    it('shows a dot per card under the carousel, the centred one lit', () => {
      renderSheet({ stack: STACK, cardId: 'rhino' });

      const dots = [...document.querySelectorAll('.inspector:not(.measure) .dots i')];
      expect(dots.map((dot) => dot.classList.contains('on'))).toEqual([true, false, false]);
    });

    it('asks for a tapped neighbour, the centred card having no button', async () => {
      const { onpick, onrun, onclose } = renderSheet({ stack: STACK, cardId: 'rhino' });

      expect(peeks().map((peek) => peek.getAttribute('aria-label'))).toEqual([
        'Armored Rhino',
        'Face-down card',
      ]);
      await fireEvent.click(peeks()[0]!);

      expect(onpick).toHaveBeenCalledExactlyOnceWith('armor');
      expect(onrun).not.toHaveBeenCalled();
      expect(onclose).not.toHaveBeenCalled();
    });

    it('asks for a neighbour picked with Enter or Space', async () => {
      const { onpick } = renderSheet({ stack: STACK, cardId: 'rhino' });

      await fireEvent.keyDown(peeks()[0]!, { key: 'Enter' });
      await fireEvent.keyDown(peeks()[1]!, { key: ' ' });

      expect(onpick.mock.calls).toEqual([['armor'], ['hidden']]);
    });

    it('lays no tap highlight over a tapped neighbour as it glides to the middle', () => {
      expect(rule('.slide')).toContain('-webkit-tap-highlight-color: transparent;');
    });

    /**
     * Lays the carousel out as scrolled by that much, as jsdom does not: 300 px wide, its middle at
     * 150 px, its slides 200 px wide and apart, the first one centred at 0.
     */
    function scrollCarouselTo(offset: number): void {
      placeBox(carousel()!, 0, 300);
      slides().forEach((slide, i) => placeBox(slide, 50 + 200 * i - offset, 200));
    }

    it('asks for the card a swipe brings past the midpoint at once, not once the scroll ends', async () => {
      const { onpick } = renderSheet({ stack: STACK, cardId: 'rhino' });

      // Short of the midpoint between the first two cards, at 100 px: still the first one.
      scrollCarouselTo(95);
      await fireEvent.scroll(carousel()!);
      expect(onpick).not.toHaveBeenCalled();

      // Past it: the second one, right away, while the finger still moves.
      scrollCarouselTo(110);
      await fireEvent.scroll(carousel()!);
      expect(onpick).toHaveBeenCalledExactlyOnceWith('armor');
    });

    it('does not flip back and forth with a finger resting on the midpoint', async () => {
      const { onpick, rerender } = renderSheet({ stack: STACK, cardId: 'rhino' });
      scrollCarouselTo(110);
      await fireEvent.scroll(carousel()!);
      await rerender({ cardId: 'armor', header: ARMOR_HEADER, images: ['armor.png'] });
      onpick.mockClear();

      // Back a hair over the midpoint: still the second card.
      scrollCarouselTo(98);
      await fireEvent.scroll(carousel()!);
      expect(onpick).not.toHaveBeenCalled();

      // Clearly back: the first one again.
      scrollCarouselTo(90);
      await fireEvent.scroll(carousel()!);
      expect(onpick).toHaveBeenCalledExactlyOnceWith('rhino');
    });

    it('leaves the carousel where a swipe has put it: no glide after a swipe', async () => {
      const scrollTo = vi.fn();
      HTMLElement.prototype.scrollTo = scrollTo as unknown as typeof HTMLElement.prototype.scrollTo;
      try {
        const { rerender } = renderSheet({ stack: STACK, cardId: 'rhino' });
        await tick();
        scrollTo.mockClear();

        scrollCarouselTo(110);
        await fireEvent.scroll(carousel()!);
        await rerender({ cardId: 'armor', header: ARMOR_HEADER, images: ['armor.png'] });
        await tick();

        expect(scrollTo).not.toHaveBeenCalled();
      } finally {
        delete (HTMLElement.prototype as Partial<HTMLElement>).scrollTo;
      }
    });

    it('asks for a tapped card at once, and none of those its glide passes', async () => {
      const { onpick, rerender } = renderSheet({ stack: STACK, cardId: 'rhino' });

      await fireEvent.click(peeks()[1]!);
      expect(onpick).toHaveBeenCalledExactlyOnceWith('hidden');
      await rerender({ cardId: 'hidden' });
      onpick.mockClear();

      // Gliding to the third card, the carousel passes the second one: not asked for.
      scrollCarouselTo(200);
      await fireEvent.scroll(carousel()!);
      expect(onpick).not.toHaveBeenCalled();

      // A finger takes over the glide: the card it brings to the middle is asked for.
      await fireEvent.pointerDown(carousel()!);
      scrollCarouselTo(190);
      await fireEvent.scroll(carousel()!);
      expect(onpick).toHaveBeenCalledExactlyOnceWith('armor');
    });

    it('centres the shown card: at once on opening, smoothly as it changes', async () => {
      const scrollTo = vi.fn();
      HTMLElement.prototype.scrollTo = scrollTo as unknown as typeof HTMLElement.prototype.scrollTo;
      try {
        const { rerender } = renderSheet({ stack: STACK, cardId: 'rhino' });
        await tick();
        expect(scrollTo).toHaveBeenLastCalledWith({ left: 0, behavior: 'instant' });

        await rerender({ cardId: 'armor', header: ARMOR_HEADER, images: ['armor.png'] });
        await tick();
        expect(scrollTo).toHaveBeenLastCalledWith({ left: 0, behavior: 'smooth' });
      } finally {
        delete (HTMLElement.prototype as Partial<HTMLElement>).scrollTo;
      }
    });

    it('switches to the tapped card in the same sheet, the carousel kept with the new card centred', async () => {
      const { rerender } = renderSheet({ stack: STACK, cardId: 'rhino' });
      const dialog = screen.getByRole('dialog');
      const shown = carousel();

      await rerender({ cardId: 'armor', header: ARMOR_HEADER, images: ['armor.png'] });

      expect(screen.getByRole('dialog')).toBe(dialog);
      expect(carousel()).toBe(shown);
      expect(screen.getByRole('dialog', { name: 'Armored Rhino, Attachment' })).toBe(dialog);
      expect(slides().map((slide) => slide.getAttribute('aria-current'))).toEqual([
        null,
        'true',
        null,
      ]);
    });

    describe("the page's height through a switch", () => {
      afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
      });

      /** Opens the stack on its main card, its page 233 px high, and switches to the next card. */
      async function switchOn(
        screenSize: TestScreen,
        options: { dock: boolean; stack?: StackCard[] },
      ) {
        mockScreen(screenSize);
        const { rerender } = renderSheet({
          dock: options.dock,
          stack: options.stack ?? STACK,
          cardId: 'rhino',
        });
        const pages = pagesOf(233);
        await rerender({ cardId: 'armor', header: ARMOR_HEADER, images: ['armor.png'] });
        return pages;
      }

      it("keeps the main page's height on a phone upright, as through a submenu", async () => {
        const pages = await switchOn(PHONE, { dock: true });

        expect(pages.style.height).toBe('233px');
        expect(pages.classList).toContain('held');
      });

      it("keeps the main page's height on a tablet upright under a landscape card", async () => {
        const scheme: StackCard = { ...STACK[0]!, landscape: true };
        const pages = await switchOn(TOUCH_TABLET_UPRIGHT, {
          dock: false,
          stack: [scheme, STACK[1]!],
        });

        expect(pages.style.height).toBe('233px');
        expect(pages.classList).toContain('held');
      });

      it('holds no height on a tablet on its side beside a landscape card', async () => {
        const scheme: StackCard = { ...STACK[0]!, landscape: true };
        const pages = await switchOn(TOUCH_TABLET, { dock: false, stack: [scheme, STACK[1]!] });

        expect(pages.style.height).toBe('');
        expect(pages.classList).not.toContain('held');
      });

      it('holds no height on a tablet beside a portrait card: the column takes what the new card needs', async () => {
        const pages = await switchOn(TOUCH_TABLET, { dock: false });

        expect(pages.style.height).toBe('');
        expect(pages.classList).not.toContain('held');
      });

      it('holds no height on a phone on its side, beside the card', async () => {
        const pages = await switchOn(LANDSCAPE_PHONE, { dock: true });

        expect(pages.style.height).toBe('');
        expect(pages.classList).not.toContain('held');
      });

      it("lets a submenu's hold go as it switches beside the card, and holds a later submenu again", async () => {
        mockScreen(TOUCH_TABLET);
        const { rerender } = renderSheet({ dock: false, stack: STACK, cardId: 'rhino' });
        pagesOf(233);
        await fireEvent.click(screen.getByRole('button', { name: 'Move to…' }));

        await rerender({ cardId: 'armor', header: ARMOR_HEADER, images: ['armor.png'] });
        await tick();

        const pages = pagesOf(180);
        expect(pages.style.height).toBe('');
        await fireEvent.click(screen.getByRole('button', { name: 'Move to…' }));
        expect(pages.style.height).toBe('180px');
      });
    });

    it('closes an open submenu as it switches', async () => {
      const { rerender } = renderSheet({ stack: STACK, cardId: 'rhino' });
      await fireEvent.click(screen.getByRole('button', { name: 'Move to…' }));

      await rerender({ cardId: 'armor', header: ARMOR_HEADER, images: ['armor.png'] });
      await tick();

      expect(screen.queryByRole('button', { name: /Back/ })).toBeNull();
      expect(screen.getByRole('button', { name: 'Exhaust' })).toBeTruthy();
    });

    it('shows the card alone, as ever, when it has no stack', () => {
      renderSheet({ stack: [], cardId: 'rhino' });

      expect(carousel()).toBeNull();
      expect(document.querySelector('.inspector .carousel')).toBeNull();
      expect(document.querySelector('.inspector .visual > .face')).not.toBeNull();
      expect(document.querySelector('.inspector .visual.stacked')).toBeNull();
    });

    it('snaps each card to the middle, its neighbours smaller and dimmed at the sides', () => {
      const scroller = rule('.carousel');
      expect(scroller).toContain('overflow-x: auto;');
      expect(scroller).toContain('scroll-snap-type: x mandatory;');
      expect(rule('.slide')).toContain('scroll-snap-align: center;');
      expect(rule('.slide')).toContain('width: var(--slide-w);');
      const dim = rule('.slide.dim');
      expect(dim).toContain('scale: 0.9;');
      expect(dim).toContain('opacity: 0.55;');
    });

    it('keeps the centred card at the size of a card alone, upright and on its side', () => {
      expect(rule('.inspector.dock:not(.beside) .visual.stacked')).toContain('--slide-h: 42dvh;');
      expect(rule('.inspector.dock .visual.stacked')).toContain('--slide-max: 80%;');
      expect(rule('.inspector.beside .visual.stacked')).toContain(
        '--slide-h: calc(var(--card-room) - var(--carousel-chrome));',
      );
    });
  });

  describe('decoding ahead the face a Flip turns the card to', () => {
    let decodes: ReturnType<typeof stubImageDecode>;

    beforeEach(() => {
      decodes = stubImageDecode();
    });

    afterEach(() => decodes.restore());

    function decoded(): { url: string | null; priority: string }[] {
      return decodes.calls.map(({ url, priority }) => ({ url, priority }));
    }

    it('decodes its first image as the sheet opens, at low priority', () => {
      renderSheet({ nextImages: ['rhino-2.png', 'cdb-rhino-2.png'] });

      expect(decoded()).toEqual([{ url: 'rhino-2.png', priority: 'low' }]);
    });

    it('decodes nothing for a card whose other face the viewer does not know', () => {
      renderSheet();

      expect(decoded()).toEqual([]);
    });

    it('decodes the next face of each card the sheet shows, once', async () => {
      const { rerender } = renderSheet({ nextImages: ['rhino-2.png'] });

      // A new array of the same images, as each redraw gives.
      await rerender({ nextImages: ['rhino-2.png'] });
      await rerender({ cardId: 'armor', header: ARMOR_HEADER, nextImages: ['armor-2.png'] });

      expect(decoded().map(({ url }) => url)).toEqual(['rhino-2.png', 'armor-2.png']);
    });
  });

  describe('motion', () => {
    // jsdom has no Web Animations: animations that run until a test finishes them, as Svelte's
    // transitions play them.
    type FakeAnimation = { onfinish: (() => void) | null; cancel: () => void; effect: null };
    let running: FakeAnimation[] = [];
    const animate = vi.fn(function (this: Element) {
      const animation: FakeAnimation = { onfinish: null, cancel: () => {}, effect: null };
      running.push(animation);
      return animation;
    });
    const originalAnimate = Element.prototype.animate;

    /** Plays every animation to its end, and those they start in turn. */
    async function finishAnimations(): Promise<void> {
      await tick();
      while (running.length > 0) {
        running.shift()?.onfinish?.();
        await tick();
      }
    }

    /** The animations of that length: on which element, through which keyframes. */
    function animationsOf(duration: number): { element: Element; keyframes: Keyframe[] }[] {
      return animate.mock.calls.flatMap((call, i) => {
        const [keyframes, options] = call as unknown as [Keyframe[], { duration?: number }?];
        const element = animate.mock.contexts[i] as Element;
        return options?.duration === duration ? [{ element, keyframes }] : [];
      });
    }

    beforeEach(() => {
      Element.prototype.animate = animate as unknown as typeof Element.prototype.animate;
      motion.reduced = false;
    });

    afterEach(async () => {
      await finishAnimations();
      Element.prototype.animate = originalAnimate;
      animate.mockClear();
      running = [];
      motion.reduced = false;
    });

    it('slides a submenu in from the right as the main page leaves to the left, then back', async () => {
      renderSheet();

      await fireEvent.click(screen.getByRole('button', { name: 'Move to…' }));
      // Both pages are there while they slide.
      expect(screen.getByRole('button', { name: /Back/ })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Exhaust' })).toBeTruthy();
      await finishAnimations();
      expect(screen.queryByRole('button', { name: 'Exhaust' })).toBeNull();

      const pages = animationsOf(220).filter(({ element }) => element.classList.contains('page'));
      const enters = pages.find(({ element }) => element.querySelector('.back'));
      const leaves = pages.find(({ element }) => !element.querySelector('.back'));
      expect(enters?.keyframes[0]?.transform).toContain('translate(100%');
      expect(leaves?.keyframes.at(-1)?.transform).toContain('translate(-100%');

      animate.mockClear();
      await fireEvent.click(screen.getByRole('button', { name: /Back/ }));
      await finishAnimations();
      const back = animationsOf(220).filter(({ element }) => element.classList.contains('page'));
      const main = back.find(({ element }) => !element.querySelector('.back'));
      expect(main?.keyframes[0]?.transform).toContain('translate(-100%');
      expect(screen.queryByRole('button', { name: /Back/ })).toBeNull();
    });

    it("keeps the main page's height through the slides into a submenu and back", async () => {
      renderSheet();
      const pages = pagesOf(233);

      await fireEvent.click(screen.getByRole('button', { name: 'Move to…' }));
      await finishAnimations();
      expect(pages.style.height).toBe('233px');

      await fireEvent.click(screen.getByRole('button', { name: /Back/ }));
      // Still sliding back: the size holds until the main page is alone.
      expect(pages.style.height).toBe('233px');
      await finishAnimations();
      expect(pages.style.height).toBe('');
      // The size never eases: only the pages slide.
      expect(animate.mock.contexts).not.toContain(pages);
    });

    it('switches pages at once under reduced motion', async () => {
      motion.reduced = true;
      renderSheet();

      await fireEvent.click(screen.getByRole('button', { name: 'Move to…' }));

      expect(screen.queryByRole('button', { name: 'Exhaust' })).toBeNull();
      expect(animate).not.toHaveBeenCalled();
    });

    it('fades a new token in on the card, and one gone to zero out', async () => {
      const { rerender } = renderSheet({ counters: [] });

      await rerender({ counters: [DAMAGE] });
      await finishAnimations();
      expect(animationsOf(200).some(({ element }) => element.classList.contains('tok'))).toBe(true);

      animate.mockClear();
      await rerender({ counters: [] });
      expect(screen.getByRole('button', { name: 'Damage, 3' })).toBeTruthy();
      await finishAnimations();
      expect(screen.queryByRole('button', { name: 'Damage, 3' })).toBeNull();
      expect(animationsOf(200).some(({ element }) => element.classList.contains('tok'))).toBe(true);
    });

    it('fades out an entry that leaves after an update', async () => {
      const { rerender } = renderSheet();

      await rerender({ entries: ENTRIES.filter((entry) => entry !== ENTRIES[3]) });
      expect(screen.getByRole('button', { name: 'Discard' })).toBeTruthy();
      await finishAnimations();

      expect(screen.queryByRole('button', { name: 'Discard' })).toBeNull();
      const fade = animationsOf(200).find(({ element }) => element.textContent === 'Discard');
      expect(fade?.element.classList).toContain('tile');
      expect(fade?.keyframes[0]).toHaveProperty('opacity');
    });

    it('slides closed a whole group that leaves after an update', async () => {
      const { rerender } = renderSheet();

      await rerender({ entries: ENTRIES.slice(0, 2) });
      expect(screen.getByRole('button', { name: 'Discard' })).toBeTruthy();
      await finishAnimations();

      expect(screen.queryByRole('button', { name: 'Discard' })).toBeNull();
      expect(shownGroups()).toEqual([['Exhaust', 'Flip']]);
      expect(animationsOf(200).some(({ element }) => element.classList.contains('group'))).toBe(
        true,
      );
    });

    it('lights a pressed tile up and sinks it, and lights a pressed row up', () => {
      expect(rule('.tile:active')).toContain('background-color: var(--hover);');
      expect(rule('.tile:active', 4)).toContain('transform: scale(0.96);');
      expect(sheetSource).toMatch(
        /@media \(prefers-reduced-motion: no-preference\) \{\n {4}\.tile \{/,
      );
      expect(rule('.row:active:not(:disabled)')).toContain('background-color: var(--hover);');
    });

    describe('switching to another card of the stack', () => {
      /** The other card's entries: Discard gone, so that an entry leaves as the sheet switches. */
      const ARMOR_ENTRIES = ENTRIES.filter((entry) => entry !== ENTRIES[3]);

      async function switchToArmor(
        rerender: ReturnType<typeof renderSheet>['rerender'],
      ): Promise<void> {
        await rerender({
          cardId: 'armor',
          header: ARMOR_HEADER,
          images: ['armor.png'],
          entries: ARMOR_ENTRIES,
        });
      }

      it('switches the column at once: no fade, no turn, no entry sliding, never an empty column', async () => {
        const { rerender } = renderSheet({ stack: STACK, cardId: 'rhino' });

        await switchToArmor(rerender);

        // The new card's name and entries right away, the old card's gone with nothing in between.
        expect(screen.getByRole('dialog', { name: 'Armored Rhino, Attachment' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Exhaust' })).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Discard' })).toBeNull();
        await finishAnimations();
        expect(animate).not.toHaveBeenCalled();
        expect(slideOf('armor').querySelector('.face img')?.getAttribute('alt')).toBe(
          'Armored Rhino',
        );
      });

      it("keeps every card's face and image through a switch, and the sheet", async () => {
        const { rerender } = renderSheet({ stack: STACK, cardId: 'rhino' });
        const dialog = screen.getByRole('dialog');
        const faces = slides().map((slide) => slide.querySelector('.face'));
        const images = slides().map((slide) => slide.querySelector('img'));

        await switchToArmor(rerender);
        await finishAnimations();

        expect(screen.getByRole('dialog')).toBe(dialog);
        slides().forEach((slide, i) => {
          expect(slide.querySelector('.face')).toBe(faces[i]);
          expect(slide.querySelector('img')).toBe(images[i]);
        });
      });

      it("keeps every card's tokens through a switch, none fading in or out", async () => {
        const counter: SheetCounter = { ...DAMAGE, name: 'gen', label: 'Counter', value: 1 };
        // Table.svelte builds the stack anew on every view: new arrays, new objects.
        const stackWith = (): StackCard[] => [
          { ...STACK[0]!, counters: [{ ...DAMAGE }] },
          { ...STACK[1]!, counters: [{ ...counter }] },
          STACK[2]!,
        ];
        const { rerender } = renderSheet({
          stack: stackWith(),
          cardId: 'rhino',
          counters: [DAMAGE],
        });
        await finishAnimations();
        animate.mockClear();
        const chips = slides().map((slide) => [...slide.querySelectorAll('[data-counter]')]);
        expect(chips.map((list) => list.length)).toEqual([1, 1, 0]);

        await rerender({
          cardId: 'armor',
          header: ARMOR_HEADER,
          images: ['armor.png'],
          counters: [{ ...counter }],
          stack: stackWith(),
        });
        await finishAnimations();

        slides().forEach((slide, i) => {
          // The very same elements: none drawn again, so none fades in.
          const now = [...slide.querySelectorAll('[data-counter]')];
          expect(now).toHaveLength(chips[i]!.length);
          now.forEach((chip, j) => expect(chip).toBe(chips[i]![j]));
        });
        expect(animate).not.toHaveBeenCalled();
        // The shown card's token is the control now, the first card's a picture.
        expect(slideOf('armor').querySelector('.layer')?.getAttribute('aria-hidden')).toBeNull();
        expect(slideOf('rhino').querySelector<HTMLElement>('.layer')?.inert).toBe(true);
        await fireEvent.click(screen.getByRole('button', { name: 'Counter, 1' }));
        expect(screen.getByRole('group', { name: /^Change/ })).toBeTruthy();
      });

      it('switches at once under reduced motion', async () => {
        motion.reduced = true;
        const { rerender } = renderSheet({ stack: STACK, cardId: 'rhino' });

        await switchToArmor(rerender);

        expect(screen.getByRole('dialog', { name: 'Armored Rhino, Attachment' })).toBeTruthy();
        expect(animate).not.toHaveBeenCalled();
      });

      it('still turns the centred card when it flips over', async () => {
        const { rerender } = renderSheet({ stack: STACK, cardId: 'rhino' });

        await rerender({ images: ['rhino-2.png'] });

        expect(animationsOf(180).filter(({ element }) => element.matches('.side'))).toEqual([]);
        const turns = animationsOf(180).filter(({ element }) => element.classList.contains('face'));
        expect(turns).toHaveLength(1);
        expect(slideOf('rhino').contains(turns[0]!.element)).toBe(true);
      });

      it('turns the newly shown card, not the first one, when it flips over after a switch', async () => {
        const { rerender } = renderSheet({ stack: STACK, cardId: 'rhino' });
        await switchToArmor(rerender);

        await rerender({ images: ['armor-2.png'] });

        const turns = animationsOf(180).filter(({ element }) => element.classList.contains('face'));
        expect(turns).toHaveLength(1);
        expect(slideOf('armor').contains(turns[0]!.element)).toBe(true);
      });
    });

    describe('turning the card over', () => {
      const TURNED: ContextHeader = {
        ...HEADER,
        name: 'Rhino II',
        label: 'Rhino II, Villain, stage II',
      };
      const STAGE: ActionItem = item('stage', { label: 'Change card…' });
      const TURNED_ENTRIES: ContextEntry[] = [...ENTRIES, { kind: 'action', item: STAGE }];

      /** The halves of the face's turn: away to edge-on, then back flat with the new side. */
      function turns(): { element: Element; keyframes: Keyframe[] }[] {
        return animationsOf(180).filter(({ element }) => element.classList.contains('face'));
      }

      function faceImage(): HTMLImageElement {
        return document.querySelector<HTMLImageElement>('.inspector .face img')!;
      }

      it('eases the sheet to the size of the new side first, then turns the card over', async () => {
        // jsdom lays nothing out: the old side is 500 px high, the new one, measured aside, 300 px.
        const heights = vi
          .spyOn(HTMLElement.prototype, 'offsetHeight', 'get')
          .mockImplementation(function (this: HTMLElement) {
            if (this.classList.contains('measure')) {
              return 300;
            }
            return this.classList.contains('inspector') ? 500 : 0;
          });
        try {
          const { rerender } = renderSheet();
          const inspector = document.querySelector<HTMLElement>('.inspector')!;

          await rerender({ images: ['rhino-2.png'], header: TURNED, entries: TURNED_ENTRIES });
          await tick();

          // Measured aside, then gone: the sheet eases to that size, the old side still shown.
          expect(document.querySelector('.measure')).toBeNull();
          const resize = animationsOf(200).find(({ element }) => element === inspector);
          expect(resize?.keyframes[0]?.height).toBe('500px');
          expect(resize?.keyframes.at(-1)?.height).toBe('300px');
          expect(turns()).toEqual([]);
          expect(faceImage().getAttribute('src')).toBe('rhino.png');

          // Only once the resize ends does the card turn over.
          expect(running).toHaveLength(1);
          running.shift()?.onfinish?.();
          await tick();
          expect(turns()).toHaveLength(1);
          expect(faceImage().getAttribute('src')).toBe('rhino.png');

          await finishAnimations();
          expect(faceImage().getAttribute('src')).toBe('rhino-2.png');
          expect(screen.getByRole('dialog', { name: 'Rhino II, Villain, stage II' })).toBeTruthy();
        } finally {
          heights.mockRestore();
        }
      });

      it.each([
        ['a tablet', false],
        ['a phone', true],
      ])(
        'measures the new side with its entries in the column, as %s lays them',
        async (_, dock) => {
          const measured: {
            tablet: boolean;
            dock: boolean;
            inColumn: boolean;
            layouts: (string | undefined)[];
          }[] = [];
          const heights = vi
            .spyOn(HTMLElement.prototype, 'offsetHeight', 'get')
            .mockImplementation(function (this: HTMLElement) {
              if (this.classList.contains('measure')) {
                measured.push({
                  tablet: this.classList.contains('tablet'),
                  dock: this.classList.contains('dock'),
                  inColumn: this.querySelector('.side .pages .tile') !== null,
                  layouts: [...this.querySelectorAll<HTMLElement>('.tiles')].map(
                    (grid) => grid.dataset.layout,
                  ),
                });
                return 300;
              }
              return this.classList.contains('inspector') ? 500 : 0;
            });
          try {
            const { rerender } = renderSheet({ dock });

            await rerender({ images: ['rhino-2.png'], header: TURNED, entries: TURNED_ENTRIES });
            await tick();

            // Its groups laid out as the live ones are, by the time the copy is measured.
            expect(measured).toEqual([
              { tablet: !dock, dock, inColumn: true, layouts: ['pairs', 'pairs-last'] },
            ]);
          } finally {
            heights.mockRestore();
          }
        },
      );

      it('on a tablet, keeps the old layout until edge-on as the card turns to the other orientation', async () => {
        // jsdom lays nothing out: the measured copy, in the new side's layout, is 300 px high.
        const measuredLayouts: string[] = [];
        const heights = vi
          .spyOn(HTMLElement.prototype, 'offsetHeight', 'get')
          .mockImplementation(function (this: HTMLElement) {
            if (this.classList.contains('measure')) {
              measuredLayouts.push(this.classList.contains('column') ? 'column' : 'beside');
              return 300;
            }
            return this.classList.contains('inspector') ? 500 : 0;
          });
        try {
          const { rerender } = renderSheet({ dock: false });
          const inspector = document.querySelector<HTMLElement>('.inspector')!;

          await rerender({ images: ['scheme.png'], landscape: true, header: TURNED });
          await tick();

          expect(measuredLayouts).toEqual(['column']);
          expect(inspector.classList).toContain('beside');

          // The resize ends, the card turns away: still the old layout until edge-on.
          running.shift()?.onfinish?.();
          await tick();
          expect(inspector.classList).toContain('beside');

          await finishAnimations();
          expect(inspector.classList).toContain('column');
          expect(inspector.classList).not.toContain('beside');
        } finally {
          heights.mockRestore();
        }
      });

      it('measures a card turning to a face that cannot tilt in its new box, kept until edge-on', async () => {
        const measured: boolean[] = [];
        const heights = vi
          .spyOn(HTMLElement.prototype, 'offsetHeight', 'get')
          .mockImplementation(function (this: HTMLElement) {
            if (this.classList.contains('measure')) {
              measured.push(this.querySelector('.face')?.classList.contains('tilts') ?? true);
              return 300;
            }
            return this.classList.contains('inspector') ? 500 : 0;
          });
        try {
          const { rerender } = renderSheet({ tilts: true });
          const face = document.querySelector<HTMLElement>('.inspector .face')!;

          await rerender({ images: ['rhino-2.png'], header: TURNED, tilts: false });
          await tick();

          expect(measured).toEqual([false]);
          expect(face.classList).toContain('tilts');

          await finishAnimations();
          expect(face.classList).not.toContain('tilts');
        } finally {
          heights.mockRestore();
        }
      });

      it('measures a stack in the boxes its cards take, each by its own tilt', async () => {
        const measured: boolean[][] = [];
        const heights = vi
          .spyOn(HTMLElement.prototype, 'offsetHeight', 'get')
          .mockImplementation(function (this: HTMLElement) {
            if (this.classList.contains('measure')) {
              const boxes = [...this.querySelectorAll('.visual, .slide')];
              measured.push(boxes.map((box) => box.classList.contains('tilts')));
              return 300;
            }
            return this.classList.contains('inspector') ? 500 : 0;
          });
        const stack: StackCard[] = [
          { ...STACK[0]!, tilts: true },
          { ...STACK[1]!, tilts: false },
        ];
        try {
          const { rerender } = renderSheet({ stack, cardId: 'rhino', tilts: true });

          await rerender({ images: ['rhino-2.png'], header: TURNED, tilts: false });
          await tick();

          // The main card shown turns to a face that cannot tilt: the copy takes its new box, the
          // carousel and the main card's slide alike, while the sheet keeps the old one until edge-on.
          expect(measured).toEqual([[false, false, false]]);
          expect(slideOf('rhino').classList).toContain('tilts');
          expect(document.querySelector('.inspector:not(.measure) .visual')?.classList).toContain(
            'tilts',
          );
        } finally {
          heights.mockRestore();
        }
      });

      it('on a tablet on its side, measures a card turning to a scheme beside its column, at its width', async () => {
        mockScreen(TOUCH_TABLET);
        const measured: { land: boolean; width: string }[] = [];
        const heights = vi
          .spyOn(HTMLElement.prototype, 'offsetHeight', 'get')
          .mockImplementation(function (this: HTMLElement) {
            if (this.classList.contains('measure')) {
              measured.push({ land: this.classList.contains('land'), width: this.style.width });
              return 300;
            }
            return this.classList.contains('inspector') ? 500 : 0;
          });
        try {
          const { rerender } = renderSheet({ dock: false });
          const inspector = document.querySelector<HTMLElement>('.inspector')!;
          const sheet = screen.getByRole('dialog');

          await rerender({ images: ['scheme.png'], landscape: true, header: TURNED });
          await tick();

          // Laid out by the sheet's own width rule, not the content's width now.
          expect(measured).toEqual([{ land: true, width: '' }]);
          expect(sheet.classList).not.toContain('fit');

          await finishAnimations();
          expect(inspector.classList).toContain('beside');
          expect(inspector.classList).toContain('land');
          expect(sheet.classList).toContain('fit');
        } finally {
          heights.mockRestore();
          vi.restoreAllMocks();
          vi.unstubAllGlobals();
        }
      });

      it("keeps the face at the card's ratio whatever its scan, as the measured copy draws it", () => {
        // An image would otherwise make the face as tall as the scan's own ratio, which the copy,
        // drawn without one, cannot know.
        expect(rule('.face')).toContain('min-width: 0;');
        expect(rule('.face')).toContain('min-height: 0;');
      });

      it('turns at once, with no resize, when the new side keeps the size', async () => {
        const { rerender } = renderSheet();

        await rerender({ images: ['rhino-2.png'], header: TURNED });

        expect(turns()).toHaveLength(1);
        expect(
          animationsOf(200).filter(({ element }) => element.classList.contains('inspector')),
        ).toEqual([]);
      });

      it('turns the face away to edge-on, lifted, then shows the new side on it', async () => {
        const { rerender } = renderSheet();
        const dialog = screen.getByRole('dialog');

        await rerender({ images: ['rhino-2.png'], header: TURNED, entries: TURNED_ENTRIES });

        // Still the old face as it turns away; the sheet is named for the new side, which the column
        // shows the entries of.
        expect(faceImage().getAttribute('src')).toBe('rhino.png');
        expect(screen.getByRole('dialog', { name: 'Rhino II, Villain, stage II' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Change card…' })).toBeTruthy();
        const away = turns()[0]!;
        expect(away.keyframes[0]?.transform).toContain('rotateY(0deg)');
        expect(away.keyframes.at(-1)?.transform).toContain('rotateY(90deg)');
        expect(away.keyframes.at(-1)?.scale).toBe('1.06');

        await finishAnimations();

        expect(faceImage().getAttribute('src')).toBe('rhino-2.png');
        expect(screen.getByRole('dialog', { name: 'Rhino II, Villain, stage II' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Change card…' })).toBeTruthy();
        const back = turns()[1]!;
        expect(back.keyframes[0]?.transform).toContain('rotateY(90deg)');
        expect(back.keyframes.at(-1)?.transform).toContain('rotateY(0deg)');
        expect(back.keyframes.at(-1)?.scale).toBe('1');
        // The same sheet all along: it never slides out and in again.
        expect(screen.getByRole('dialog')).toBe(dialog);
      });

      it("changes the column at once as the card turns: the old side's entries never linger", async () => {
        const REVEAL = item('reveal');
        const deckEntries: ContextEntry[] = [
          { kind: 'action', item: REVEAL },
          { kind: 'separator' },
          { kind: 'action', item: DISCARD },
        ];
        const { rerender } = renderSheet({ entries: deckEntries });
        await finishAnimations();
        animate.mockClear();

        await rerender({ images: ['rhino-2.png'], header: TURNED, entries: TURNED_ENTRIES });

        // From the update on, before any animation ends: the new side's entries alone, none fading
        // or sliding out, while the face still shows the old side as it turns away.
        expect(screen.queryByRole('button', { name: 'Reveal' })).toBeNull();
        expect(screen.getByRole('button', { name: 'Exhaust' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Change card…' })).toBeTruthy();
        expect(faceImage().getAttribute('src')).toBe('rhino.png');
        expect(running).toHaveLength(1);

        running.shift()?.onfinish?.();
        await tick();
        expect(faceImage().getAttribute('src')).toBe('rhino-2.png');
        expect(screen.queryByRole('button', { name: 'Reveal' })).toBeNull();
        // The face alone moves: it turns away, then back flat.
        const moved = animate.mock.contexts as Element[];
        expect(moved.filter((element) => !element.classList.contains('face'))).toEqual([]);
      });

      it(
        "turns a deck's back over to the card revealed on it, " +
          'renamed at once, its counters once edge-on',
        async () => {
          const { rerender } = renderSheet({ header: DECK_HEADER, cardId: undefined });
          await rerender({ images: ['encounter-back.png'] });
          await finishAnimations();
          animate.mockClear();
          expect(screen.getByRole('dialog', { name: 'Encounter deck, 29 cards' })).toBeTruthy();

          await rerender({
            header: TURNED,
            cardId: 'rhino',
            images: ['rhino-2.png'],
            counters: [DAMAGE],
          });

          expect(faceImage().getAttribute('src')).toBe('encounter-back.png');
          expect(screen.getByRole('dialog', { name: 'Rhino II, Villain, stage II' })).toBeTruthy();
          expect(screen.queryByRole('button', { name: 'Damage, 3' })).toBeNull();
          expect(turns()).toHaveLength(1);

          await finishAnimations();

          expect(faceImage().getAttribute('src')).toBe('rhino-2.png');
          expect(screen.getByRole('button', { name: 'Damage, 3' })).toBeTruthy();
        },
      );

      it('renames the sheet at once as the card turns face down, the measured copy as its column', async () => {
        const measuredFirst: (string | undefined)[] = [];
        const heights = vi
          .spyOn(HTMLElement.prototype, 'offsetHeight', 'get')
          .mockImplementation(function (this: HTMLElement) {
            if (this.classList.contains('measure')) {
              const first = this.querySelector('.side')?.firstElementChild?.className;
              measuredFirst.push(first?.split(' ')[0]);
              return 300;
            }
            return this.classList.contains('inspector') ? 500 : 0;
          });
        try {
          const { rerender } = renderSheet();

          await rerender({ header: FACE_DOWN_HEADER, images: ['back.png'] });
          await tick();

          // The old face turns away; the sheet already names the new side, its column starting
          // with the entries, as the copy that measured it.
          expect(faceImage().getAttribute('src')).toBe('rhino.png');
          expect(screen.getByRole('dialog', { name: 'Face-down card' })).toBeTruthy();
          expect(side().firstElementChild?.classList).toContain('pages');
          expect(measuredFirst).toEqual(['pages']);
        } finally {
          heights.mockRestore();
        }
      });

      it('turns over to a landscape face once edge-on', async () => {
        const { rerender } = renderSheet();

        await rerender({ images: ['scheme.png'], landscape: true });
        expect(document.querySelector('.inspector .face')?.classList).not.toContain('land');

        await finishAnimations();
        expect(document.querySelector('.inspector .face')?.classList).toContain('land');
      });

      describe("waiting edge-on for the new side's image", () => {
        let decodes: ReturnType<typeof stubImageDecode>;

        beforeEach(() => {
          decodes = stubImageDecode();
          vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        });

        afterEach(() => {
          vi.useRealTimers();
          decodes.restore();
        });

        /** Lets the promises of a decode settle, and the sheet draw what follows. */
        async function settleDecode(): Promise<void> {
          for (let i = 0; i < 5; i++) {
            await Promise.resolve();
          }
          await tick();
        }

        /** Opens the sheet, then turns the card to Rhino II: its face turns away, still Rhino. */
        async function turnToRhinoII(): Promise<void> {
          const { rerender } = renderSheet();
          await finishAnimations();
          animate.mockClear();
          await rerender({ images: ['rhino-2.png', 'cdb-rhino-2.png'], header: TURNED });
        }

        /** The turn reaches edge-on. */
        async function reachEdgeOn(): Promise<void> {
          expect(turns()).toHaveLength(1);
          running.shift()?.onfinish?.();
          await tick();
        }

        it('decodes the first image of the new side as the update brings it', async () => {
          await turnToRhinoII();

          expect(decodes.calls.map(({ url, priority }) => ({ url, priority }))).toEqual([
            { url: 'rhino-2.png', priority: 'auto' },
          ]);
        });

        it('shows the new side at once edge-on when its image is decoded by then', async () => {
          await turnToRhinoII();
          decodes.calls[0]!.resolve();
          await settleDecode();

          await reachEdgeOn();

          expect(faceImage().getAttribute('src')).toBe('rhino-2.png');
          expect(turns()).toHaveLength(2);
          expect(vi.getTimerCount()).toBe(0);
        });

        it('holds the card edge-on until the image is decoded', async () => {
          await turnToRhinoII();
          await reachEdgeOn();
          expect(faceImage().getAttribute('src')).toBe('rhino.png');
          expect(turns()).toHaveLength(1);

          decodes.calls[0]!.resolve();
          await settleDecode();

          expect(faceImage().getAttribute('src')).toBe('rhino-2.png');
          expect(turns()).toHaveLength(2);
          expect(vi.getTimerCount()).toBe(0);
        });

        it('waits no more than 150 ms for an image that is slow to decode', async () => {
          await turnToRhinoII();
          await reachEdgeOn();

          vi.advanceTimersByTime(149);
          await tick();
          expect(faceImage().getAttribute('src')).toBe('rhino.png');

          vi.advanceTimersByTime(1);
          await tick();
          expect(faceImage().getAttribute('src')).toBe('rhino-2.png');
          expect(turns()).toHaveLength(2);

          // The decode that settles later changes nothing more.
          decodes.calls[0]!.resolve();
          await settleDecode();
          expect(turns()).toHaveLength(2);
        });

        it('turns on as soon as the image fails to decode', async () => {
          await turnToRhinoII();
          await reachEdgeOn();

          decodes.calls[0]!.reject();
          await settleDecode();

          expect(faceImage().getAttribute('src')).toBe('rhino-2.png');
          expect(turns()).toHaveLength(2);
        });

        it('neither decodes nor waits under reduced motion', async () => {
          motion.reduced = true;
          const { rerender } = renderSheet();

          await rerender({ images: ['rhino-2.png'], header: TURNED });

          expect(faceImage().getAttribute('src')).toBe('rhino-2.png');
          expect(decodes.calls).toEqual([]);
        });
      });

      it('changes the face at once under reduced motion', async () => {
        motion.reduced = true;
        const { rerender } = renderSheet();

        await rerender({ images: ['rhino-2.png'], header: TURNED });

        expect(faceImage().getAttribute('src')).toBe('rhino-2.png');
        expect(screen.getByRole('dialog', { name: 'Rhino II, Villain, stage II' })).toBeTruthy();
        expect(turns()).toEqual([]);
      });

      it('does not turn when the face stays the same', async () => {
        const { rerender } = renderSheet();

        // A new array of the same images, as each redraw gives.
        await rerender({ images: ['rhino.png'], entries: TURNED_ENTRIES, counters: [DAMAGE] });

        expect(screen.getByRole('button', { name: 'Change card…' })).toBeTruthy();
        expect(turns()).toEqual([]);
      });
    });
  });
});
