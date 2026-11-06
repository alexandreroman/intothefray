import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import CardSheet from './CardSheet.svelte';
import sheetSource from './CardSheet.svelte?raw';
import { DOCK_MODE_KEY } from './dockMode';
import { MAX_MODIFIER, type ActionItem } from './actions';
import type { ContextEntry, ContextHeader } from './contextItems';
import type { SheetCounter, StackCard } from './inspector';

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
    landscape?: boolean;
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
      images: ['rhino.png'],
      landscape: props.landscape,
      counters: props.counters ?? [],
      stack: props.stack,
      cardId: props.cardId,
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

/** The block of the sheet's stylesheet under an at-rule, such as '@media (max-height: 500px)'. */
function block(atRule: string): string {
  const start = sheetSource.indexOf(`\n  ${atRule} {`);
  if (start === -1) {
    return '';
  }
  const end = sheetSource.indexOf('\n  }\n', start);
  return sheetSource.slice(start, end);
}

/** The declarations of a rule inside a block of the stylesheet (block), at four spaces. */
function ruleIn(source: string, selector: string): string {
  const escaped = selector.replace(/[.()[\]*+]/g, (c) => `\\${c}`);
  const pattern = new RegExp(`\\n {4}${escaped} \\{([^}]*)\\}`);
  return pattern.exec(source)?.[1] ?? '';
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
  it('centres the name, with a pile count beside it, and room around them', () => {
    expect(rule('.nameline')).toContain('justify-content: center;');
    // Room above and below the name, and on its sides, so that a long name never meets an edge.
    expect(rule('.nameline')).toContain('padding: 10px 12px;');
    expect(rule('.name')).toContain('text-align: center;');
  });

  it('cuts a long name on one line with an ellipsis, the count kept whole beside it', () => {
    const name = rule('.name');
    expect(name).toContain('min-width: 0;');
    expect(name).toContain('overflow: hidden;');
    expect(name).toContain('text-overflow: ellipsis;');
    expect(name).toContain('white-space: nowrap;');
    expect(name).not.toContain('overflow-wrap');
    expect(rule('.count')).toContain('flex: none;');
  });

  it('shows a cut name whole in a tooltip (overflowTip)', async () => {
    renderSheet();
    const name = document.querySelector<HTMLElement>('.inspector .name')!;
    // jsdom lays nothing out: the name is wider than its box.
    Object.defineProperty(name, 'scrollWidth', { configurable: true, value: 300 });
    Object.defineProperty(name, 'clientWidth', { configurable: true, value: 120 });

    await fireEvent.pointerOver(name);

    expect(name.dataset.tip).toBe('Rhino');
  });

  it('is a dialog named by its whole header, showing the card face and the name alone', () => {
    renderSheet();

    // The type, stage and owner are heard in its name, not shown: no eyebrow line takes room.
    const sheet = screen.getByRole('dialog', { name: 'Rhino, Villain, stage I' });
    expect(within(sheet).getByRole('img', { name: 'Rhino' }).getAttribute('src')).toBe('rhino.png');
    expect(within(sheet).getByText('Rhino', { selector: '.name' })).toBeTruthy();
    expect(within(sheet).queryByText('Villain · Stage I')).toBeNull();
    expect(sheet.querySelector('.eyebrow')).toBeNull();
  });

  it("shows a pile's count", () => {
    render(CardSheet, {
      header: {
        eyebrow: 'Villain',
        name: 'Encounter deck',
        count: 29,
        color: '#a66bff',
        label: 'Encounter deck',
      },
      entries: ENTRIES,
      images: [],
      counters: [],
      onrun: vi.fn(),
      onstep: vi.fn(),
      onclose: vi.fn(),
    });

    expect(screen.getByText('29')).toBeTruthy();
  });

  it('runs a main action without closing itself', async () => {
    const { onrun, onclose } = renderSheet();

    await fireEvent.click(screen.getByRole('button', { name: 'Flip' }));

    expect(onrun).toHaveBeenCalledWith(FLIP);
    expect(onclose).not.toHaveBeenCalled();
  });

  it('draws the first group as large buttons, the default one marked', () => {
    renderSheet();

    const exhaust = screen.getByRole('button', { name: 'Exhaust' });
    expect(exhaust.classList.contains('main')).toBe(true);
    expect(exhaust.classList.contains('default')).toBe(true);
    expect(screen.getByRole('button', { name: 'Flip' }).classList.contains('default')).toBe(false);
    expect(screen.getByRole('button', { name: 'Discard' }).classList.contains('main')).toBe(false);
  });

  it('runs a row', async () => {
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

    expect(screen.queryByRole('button', { name: 'Exhaust' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Discard' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Hand' })).toBeTruthy();

    await fireEvent.click(screen.getByRole('button', { name: /Back/ }));

    expect(screen.getByRole('button', { name: 'Exhaust' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Hand' })).toBeNull();
  });

  it('goes back to its main page once a submenu entry runs', async () => {
    const dmg = item('dmg', { label: 'Damage' });
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

    await fireEvent.click(screen.getByRole('button', { name: 'Damage' }));

    expect(onrun).toHaveBeenCalledExactlyOnceWith(dmg);
    expect(onclose).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Back/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Exhaust' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add a token' }));
  });

  it("holds the main page's height in a submenu, which scrolls in it, and lets it go back on the main page", async () => {
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
  });

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

  it('hides a refused main action, row and submenu', () => {
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

    expect(screen.getByRole('button', { name: 'Flip' }).classList.contains('main')).toBe(true);
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

    it('gives a status a single ✕, which removes one', async () => {
      const { onstep } = renderSheet({ entries: [], counters: [STUNNED] });

      await fireEvent.click(screen.getByRole('button', { name: 'Stunned' }));
      const pill = screen.getByRole('group', { name: 'Change stunned' });
      expect(within(pill).getAllByRole('button')).toHaveLength(1);
      await fireEvent.click(within(pill).getByRole('button', { name: 'Remove stunned' }));

      expect(onstep).toHaveBeenCalledWith(STUNNED, -1);
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
      const { rerender } = renderSheet({ counters: [modifier(MAX_MODIFIER)] });

      await fireEvent.click(screen.getByRole('button', { name: 'DEF, +99' }));
      const add = () =>
        screen.getByRole('button', { name: 'Add one to the DEF modifier' }) as HTMLButtonElement;
      const remove = () =>
        screen.getByRole('button', {
          name: 'Remove one from the DEF modifier',
        }) as HTMLButtonElement;
      expect(add().disabled).toBe(true);
      expect(remove().disabled).toBe(false);

      await rerender({ counters: [modifier(-MAX_MODIFIER)] });
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
      expect(chip.tagName).toBe('SPAN');
      expect(chip.closest('.layer')?.getAttribute('aria-hidden')).toBe('true');
    });
  });

  it('closes on Escape', async () => {
    const { onclose } = renderSheet();

    await fireEvent.keyDown(window, { key: 'Escape' });

    expect(onclose).toHaveBeenCalledOnce();
  });

  describe('in dock mode', () => {
    it('puts every entry in the column with the header, the counters on the card', () => {
      renderSheet({ dock: true, counters: [DAMAGE], note: undefined });

      const sheet = screen.getByRole('dialog', { name: 'Rhino, Villain, stage I' });
      expect(sheet.classList).toContain('dock');
      expect(document.querySelector('.inspector')?.classList).toContain('dock');
      const column = side();
      expect(within(column).getByText('Rhino', { selector: '.name' })).toBeTruthy();
      expect(within(column).queryByRole('button', { name: 'Damage, 3' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Damage, 3' }).closest('.face')).toBeTruthy();
      expect(within(column).getByRole('button', { name: 'Exhaust' })).toBeTruthy();
      expect(within(column).getByRole('button', { name: 'Discard' })).toBeTruthy();
      expect(within(column).getByRole('button', { name: /Move to/ })).toBeTruthy();
      // The face and its column are all the sheet holds.
      expect(document.querySelector('.inspector')?.children).toHaveLength(1);
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

    it('leaves the entries under the card outside dock mode', () => {
      renderSheet({ dock: false });

      expect(within(side()).queryByRole('button', { name: 'Exhaust' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Exhaust' })).toBeTruthy();
    });

    it('upright, puts the card on top, centred, at most 42 % of the screen high', () => {
      const top = rule('.inspector.dock .top');
      expect(top).toContain('flex-direction: column;');
      expect(top).toContain('align-items: center;');
      expect(rule('.inspector.dock .face')).toContain(
        'width: min(100%, calc(42dvh * var(--face-ratio)));',
      );
      expect(rule('.face')).toContain('--face-ratio: 5 / 7;');
      expect(rule('.face')).toContain('aspect-ratio: var(--face-ratio);');
      expect(rule('.face.land')).toContain('--face-ratio: 7 / 5;');
    });

    it('upright, lays the header, the counters and the entries full width under the card', () => {
      const column = rule('.inspector.dock .side');
      expect(column).toContain('align-self: stretch;');
      expect(column).toContain('container-type: inline-size;');
      // The whole sheet scrolls (Sheet.svelte), not the column.
      expect(column).not.toContain('overflow-y');
    });

    it('on its side, keeps the card the whole sheet high beside a column that scrolls', () => {
      const side = block('@media (max-height: 500px)');
      expect(ruleIn(side, '.inspector.dock .top')).toContain('flex-direction: row;');
      const face = ruleIn(side, '.inspector.dock .face');
      expect(face).toContain('height: var(--sheet-room);');
      expect(face).toContain('width: auto;');
      const column = ruleIn(side, '.inspector.dock .side');
      expect(column).toContain('max-height: var(--sheet-room);');
      expect(column).toContain('overflow-y: auto;');
    });

    it('makes every entry 44 px high, the main ones two per row in a wide column', () => {
      expect(rule('.inspector.dock .main')).toContain('min-height: 44px;');
      expect(rule('.inspector.dock .row')).toContain('min-height: 44px;');
      expect(rule('.inspector.dock .main-grid')).toContain(
        'grid-template-columns: minmax(0, 1fr);',
      );
      expect(rule('.inspector.dock .main-grid', 4)).toContain(
        'grid-template-columns: repeat(2, minmax(0, 1fr));',
      );
      expect(sheetSource).toMatch(/@container \(min-width: \d+px\)/);
    });
  });

  describe('the main buttons on a phone: never one alone on the last line', () => {
    /** The first group of `count` actions, the second one the default. */
    function mainEntries(count: number): ContextEntry[] {
      return Array.from({ length: count }, (_, i) => ({
        kind: 'action',
        item: item(`action${i}`, { default: i === 1 ? true : undefined }),
      }));
    }

    /** The grid of the main buttons shown, not the hidden copy that measures the sheet. */
    function mainGrid(): HTMLElement {
      return document.querySelector<HTMLElement>('.inspector:not(.measure) .main-grid')!;
    }

    it.each([
      [1, 'single'],
      [2, 'pairs'],
      [3, 'lead'],
      [4, 'pairs'],
    ])('lays %i buttons out as %s on a narrow phone', (count, layout) => {
      renderSheet({ dock: true, entries: mainEntries(count) });

      expect(mainGrid().dataset.layout).toBe(layout);
    });

    it('puts the default button on top of three that have no room for a row', () => {
      renderSheet({ dock: true, entries: mainEntries(3) });

      const buttons = within(mainGrid()).getAllByRole('button');
      expect(buttons.map((button) => button.textContent)).toEqual([
        'Action1',
        'Action0',
        'Action2',
      ]);
      expect(buttons[0]!.classList).toContain('default');
      expect(
        rule(".inspector.dock .main-grid:global([data-layout='lead']) > .main:first-child"),
      ).toContain('grid-column: 1 / -1;');
    });

    it('gives a lone button the whole width, and three in a row a third each', () => {
      expect(rule(".inspector.dock .main-grid:global([data-layout='single'])", 4)).toContain(
        'grid-template-columns: minmax(0, 1fr);',
      );
      expect(rule(".inspector.dock .main-grid:global([data-layout='row'])", 4)).toContain(
        'grid-template-columns: repeat(3, minmax(0, 1fr));',
      );
    });

    it('keeps a label on one line, cut short if it must', () => {
      const label = rule('.main .label');
      expect(label).toContain('white-space: nowrap;');
      expect(label).toContain('text-overflow: ellipsis;');
      expect(label).toContain('overflow: hidden;');
    });
  });

  describe('the stack of the card (F-U15)', () => {
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

    it('asks for the card a swipe leaves in the middle, once the scroll settles', async () => {
      vi.useFakeTimers();
      try {
        const { onpick } = renderSheet({ stack: STACK, cardId: 'rhino' });
        // jsdom lays nothing out: the carousel 300 px wide, its slides 200 px apart, the second
        // one in the middle after the swipe.
        placeBox(carousel()!, 0, 300);
        slides().forEach((slide, i) => placeBox(slide, 50 + 200 * (i - 1), 200));

        await fireEvent.scroll(carousel()!);
        expect(slides()[1]!.classList).not.toContain('dim');
        expect(onpick).not.toHaveBeenCalled();
        await fireEvent.scroll(carousel()!);
        vi.advanceTimersByTime(200);

        expect(onpick).toHaveBeenCalledExactlyOnceWith('armor');
      } finally {
        vi.useRealTimers();
      }
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
      expect(screen.getByText('Armored Rhino', { selector: '.name' })).toBeTruthy();
      expect(slides().map((slide) => slide.getAttribute('aria-current'))).toEqual([
        null,
        'true',
        null,
      ]);
    });

    it("keeps the main page's height through a switch, as through a submenu", async () => {
      const { rerender } = renderSheet({ stack: STACK, cardId: 'rhino' });
      const pages = pagesOf(233);

      await rerender({ cardId: 'armor', header: ARMOR_HEADER, images: ['armor.png'] });

      expect(pages.style.height).toBe('233px');
      expect(pages.classList).toContain('held');
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
      expect(rule('.inspector.dock .visual.stacked')).toContain('--slide-h: 42dvh;');
      const side = block('@media (max-height: 500px)');
      expect(ruleIn(side, '.inspector.dock .visual.stacked')).toContain(
        '--slide-h: calc(var(--sheet-room) - var(--carousel-chrome));',
      );
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

    it('slides an entry that leaves after an update closed', async () => {
      const { rerender } = renderSheet();

      await rerender({ entries: ENTRIES.filter((entry) => entry !== ENTRIES[3]) });
      expect(screen.getByRole('button', { name: 'Discard' })).toBeTruthy();
      await finishAnimations();

      expect(screen.queryByRole('button', { name: 'Discard' })).toBeNull();
      expect(
        animationsOf(200).some(({ element }) => element.textContent?.trim() === 'Discard'),
      ).toBe(true);
    });

    it('sinks a pressed button, darkens the default one, and lights a pressed row', () => {
      const moving = block('@media (prefers-reduced-motion: no-preference)');
      expect(ruleIn(moving, '.main:active')).toContain('transform: scale(0.96);');
      expect(rule('.main.default:active')).toContain('background: var(--accent-deep);');
      expect(rule('.row:active:not(:disabled)')).toContain('background-color: var(--hover);');
    });

    describe('switching to another card of the stack (F-U15)', () => {
      /** The halves of the fade of the card's column, out then in: the carousel scrolls itself. */
      function fades(): { element: Element; keyframes: Keyframe[] }[] {
        return animationsOf(90).filter(({ element }) => element.matches('.side'));
      }

      it('fades the column out and in with the new card, without turning the card over', async () => {
        const { rerender } = renderSheet({ stack: STACK, cardId: 'rhino' });

        await rerender({ cardId: 'armor', header: ARMOR_HEADER, images: ['armor.png'] });

        // Still the old card's column as it fades out.
        expect(screen.getByText('Rhino', { selector: '.name' })).toBeTruthy();
        const out = fades();
        expect(out).toHaveLength(1);
        expect(out[0]?.keyframes.map((frame) => frame.opacity)).toEqual([1, 0]);

        await finishAnimations();

        expect(screen.getByText('Armored Rhino', { selector: '.name' })).toBeTruthy();
        const back = fades().slice(1);
        expect(back).toHaveLength(1);
        expect(back[0]?.keyframes.map((frame) => frame.opacity)).toEqual([0, 1]);
        expect(animationsOf(180)).toEqual([]);
        expect(animationsOf(200)).toEqual([]);
        // The face is now the centred slide's.
        expect(slideOf('armor').querySelector('.face img')?.getAttribute('alt')).toBe(
          'Armored Rhino',
        );
      });

      it('switches at once under reduced motion', async () => {
        motion.reduced = true;
        const { rerender } = renderSheet({ stack: STACK, cardId: 'rhino' });

        await rerender({ cardId: 'armor', header: ARMOR_HEADER, images: ['armor.png'] });

        expect(screen.getByText('Armored Rhino', { selector: '.name' })).toBeTruthy();
        expect(animate).not.toHaveBeenCalled();
      });

      it('still turns the centred card when it flips over', async () => {
        const { rerender } = renderSheet({ stack: STACK, cardId: 'rhino' });

        await rerender({ images: ['rhino-2.png'] });

        expect(fades()).toEqual([]);
        const turns = animationsOf(180).filter(({ element }) => element.classList.contains('face'));
        expect(turns).toHaveLength(1);
        expect(slideOf('rhino').contains(turns[0]!.element)).toBe(true);
      });
    });

    describe('turning the card over (F-U9)', () => {
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
          expect(screen.getByText('Rhino II', { selector: '.name' })).toBeTruthy();
        } finally {
          heights.mockRestore();
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

      it('turns the face away to edge-on, lifted, then shows the new side, its name and entries', async () => {
        const { rerender } = renderSheet();
        const dialog = screen.getByRole('dialog');

        await rerender({ images: ['rhino-2.png'], header: TURNED, entries: TURNED_ENTRIES });

        // Still the old side, its name and entries, as it turns away.
        expect(faceImage().getAttribute('src')).toBe('rhino.png');
        expect(screen.getByText('Rhino', { selector: '.name' })).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Change card…' })).toBeNull();
        const away = turns()[0]!;
        expect(away.keyframes[0]?.transform).toContain('rotateY(0deg)');
        expect(away.keyframes.at(-1)?.transform).toContain('rotateY(90deg)');
        expect(away.keyframes.at(-1)?.scale).toBe('1.06');

        await finishAnimations();

        expect(faceImage().getAttribute('src')).toBe('rhino-2.png');
        expect(screen.getByText('Rhino II', { selector: '.name' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Change card…' })).toBeTruthy();
        const back = turns()[1]!;
        expect(back.keyframes[0]?.transform).toContain('rotateY(90deg)');
        expect(back.keyframes.at(-1)?.transform).toContain('rotateY(0deg)');
        expect(back.keyframes.at(-1)?.scale).toBe('1');
        // The same sheet all along: it never slides out and in again.
        expect(screen.getByRole('dialog')).toBe(dialog);
      });

      it("turns a deck's back over to the card revealed on it, its count and counters switching once edge-on", async () => {
        const deck: ContextHeader = {
          ...HEADER,
          name: 'Encounter deck',
          label: 'Encounter deck',
          count: 20,
        };
        const { rerender } = renderSheet();
        await rerender({ header: deck, images: ['encounter-back.png'] });
        await finishAnimations();
        animate.mockClear();

        await rerender({ header: TURNED, images: ['rhino-2.png'], counters: [DAMAGE] });

        expect(faceImage().getAttribute('src')).toBe('encounter-back.png');
        expect(
          screen.getByText('20', { selector: '.count' }).classList.contains('count-pill'),
        ).toBe(true);
        expect(screen.queryByRole('button', { name: 'Damage, 3' })).toBeNull();
        expect(turns()).toHaveLength(1);

        await finishAnimations();

        expect(faceImage().getAttribute('src')).toBe('rhino-2.png');
        expect(document.querySelector('.inspector .count')).toBeNull();
        expect(screen.getByRole('button', { name: 'Damage, 3' })).toBeTruthy();
      });

      it('turns over to a landscape face once edge-on', async () => {
        const { rerender } = renderSheet();

        await rerender({ images: ['scheme.png'], landscape: true });
        expect(document.querySelector('.inspector .face')?.classList).not.toContain('land');

        await finishAnimations();
        expect(document.querySelector('.inspector .face')?.classList).toContain('land');
      });

      it('changes the face at once under reduced motion', async () => {
        motion.reduced = true;
        const { rerender } = renderSheet();

        await rerender({ images: ['rhino-2.png'], header: TURNED });

        expect(faceImage().getAttribute('src')).toBe('rhino-2.png');
        expect(screen.getByText('Rhino II', { selector: '.name' })).toBeTruthy();
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
