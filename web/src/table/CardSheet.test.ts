import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import CardSheet from './CardSheet.svelte';
import sheetSource from './CardSheet.svelte?raw';
import { DOCK_MODE_KEY } from './dockMode';
import { MAX_MODIFIER, type ActionItem } from './actions';
import type { ContextEntry, ContextHeader } from './contextItems';
import type { SheetCounter } from './inspector';

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
  } = {},
) {
  const onrun = vi.fn();
  const onstep = vi.fn();
  const onclose = vi.fn();
  const result = render(CardSheet, {
    props: {
      header: HEADER,
      entries: props.entries ?? ENTRIES,
      note: props.note,
      images: ['rhino.png'],
      counters: props.counters ?? [],
      onrun,
      onstep,
      onclose,
    },
    context: new Map([[DOCK_MODE_KEY, { current: props.dock ?? false }]]),
  });
  return { ...result, onrun, onstep, onclose };
}

/** The declarations of a rule of the sheet's stylesheet, at the given indent. */
function rule(selector: string, indent = 2): string {
  const escaped = selector.replace(/[.()]/g, (c) => `\\${c}`);
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
  const escaped = selector.replace(/[.()]/g, (c) => `\\${c}`);
  const pattern = new RegExp(`\\n {4}${escaped} \\{([^}]*)\\}`);
  return pattern.exec(source)?.[1] ?? '';
}

/** The card's column, beside it or under it, where its header and counters are. */
function side(): HTMLElement {
  return document.querySelector<HTMLElement>('.inspector .side')!;
}

describe('CardSheet', () => {
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

  it('steps a token down and up', async () => {
    const { onstep } = renderSheet({ counters: [DAMAGE] });

    expect(screen.getByText('Damage')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Remove one damage' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Add one damage' }));

    expect(onstep.mock.calls).toEqual([
      [DAMAGE, -1],
      [DAMAGE, 1],
    ]);
  });

  it('gives a status a single button, which removes one', async () => {
    const { onstep } = renderSheet({ entries: [], counters: [STUNNED] });

    expect(screen.getAllByRole('button')).toHaveLength(1);
    await fireEvent.click(screen.getByRole('button', { name: 'Remove stunned' }));

    expect(onstep).toHaveBeenCalledWith(STUNNED, -1);
  });

  it('shows a modifier with its sign, and stops it at its largest', () => {
    renderSheet({ counters: [modifier(MAX_MODIFIER)] });

    expect(screen.getByText('+99')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Add one to the DEF modifier' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole('button', {
          name: 'Remove one from the DEF modifier',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });

  it('stops a modifier at its smallest', () => {
    renderSheet({ counters: [modifier(-MAX_MODIFIER)] });

    expect(screen.getByText('−99')).toBeTruthy();
    expect(
      (
        screen.getByRole('button', {
          name: 'Remove one from the DEF modifier',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole('button', { name: 'Add one to the DEF modifier' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it('closes on Escape', async () => {
    const { onclose } = renderSheet();

    await fireEvent.keyDown(window, { key: 'Escape' });

    expect(onclose).toHaveBeenCalledOnce();
  });

  describe('in dock mode', () => {
    it('puts every entry in the column with the header and the counters', () => {
      renderSheet({ dock: true, counters: [DAMAGE], note: undefined });

      const sheet = screen.getByRole('dialog', { name: 'Rhino, Villain, stage I' });
      expect(sheet.classList).toContain('dock');
      expect(document.querySelector('.inspector')?.classList).toContain('dock');
      const column = side();
      expect(within(column).getByText('Rhino', { selector: '.name' })).toBeTruthy();
      expect(within(column).getByRole('button', { name: 'Add one damage' })).toBeTruthy();
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

    it("eases the sheet's height from one page to the other", async () => {
      renderSheet();

      await fireEvent.click(screen.getByRole('button', { name: 'Move to…' }));
      await finishAnimations();

      const resized = animationsOf(220).find(({ element }) => element.classList.contains('pages'));
      expect(resized?.keyframes).toEqual([
        { height: expect.stringMatching(/px$/) },
        { height: expect.stringMatching(/px$/) },
      ]);
    });

    it('switches pages at once under reduced motion', async () => {
      motion.reduced = true;
      renderSheet();

      await fireEvent.click(screen.getByRole('button', { name: 'Move to…' }));

      expect(screen.queryByRole('button', { name: 'Exhaust' })).toBeNull();
      expect(animate).not.toHaveBeenCalled();
    });

    it('slides a new counter row open, and one gone to zero closed', async () => {
      const { rerender } = renderSheet({ counters: [] });

      await rerender({ counters: [DAMAGE] });
      await finishAnimations();
      expect(animationsOf(200).some(({ element }) => element.classList.contains('counter'))).toBe(
        true,
      );

      animate.mockClear();
      await rerender({ counters: [] });
      expect(screen.getByText('Damage')).toBeTruthy();
      await finishAnimations();
      expect(screen.queryByText('Damage')).toBeNull();
      expect(animationsOf(200).some(({ element }) => element.classList.contains('counter'))).toBe(
        true,
      );
    });

    it('bumps a number as it changes', async () => {
      const { rerender } = renderSheet({ counters: [DAMAGE] });

      await rerender({ counters: [{ ...DAMAGE, value: 4 }] });
      await finishAnimations();

      const bump = animationsOf(160).find(({ element }) => element.classList.contains('value'));
      expect(bump?.element.textContent).toBe('4');
      expect(bump?.keyframes.some((frame) => String(frame.transform).includes('scale(1.15)'))).toBe(
        true,
      );
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
      expect(ruleIn(moving, '.step:active:not(:disabled)')).toContain('transform: scale(0.96);');
      expect(rule('.main.default:active')).toContain('background: var(--accent-deep);');
      expect(rule('.row:active:not(:disabled)')).toContain('background-color: var(--hover);');
    });
  });
});
