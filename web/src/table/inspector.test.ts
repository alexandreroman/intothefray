import { arrowItem, type ActionItem } from './actions';
import type { ContextAction, ContextEntry, ContextSeparator, ContextSubmenu } from './contextItems';
import { card } from './fixtures.testing';
import { countersFor, entryGroups, stackCardsOf, visibleEntries } from './inspector';

function action(id: string): ContextAction {
  const item: ActionItem = { id, label: id, group: 0 };
  return { kind: 'action', item };
}

const SEP: ContextSeparator = { kind: 'separator' };

function submenu(id: string): ContextSubmenu {
  return { kind: 'submenu', id, label: id, disabled: false, entries: [action(`${id}-a`)] };
}

function refused(id: string): ContextAction {
  const item: ActionItem = { id, label: id, group: 0, disabled: true, reason: 'No' };
  return { kind: 'action', item };
}

describe('countersFor', () => {
  it('lists the tokens, then the statuses, with their labels', () => {
    const counters = countersFor(card('c', { tokens: { dmg: 3 }, status: { stunned: 1 } }));

    expect(counters).toEqual([
      { kind: 'token', name: 'dmg', label: 'Damage', value: 3, signed: false },
      { kind: 'status', name: 'stunned', label: 'Stunned', value: 1, signed: false },
    ]);
  });

  it('lists a modifier by its stat, signed', () => {
    expect(countersFor(card('c', { mods: { def: 2 } }))).toEqual([
      { kind: 'modifier', name: 'def', label: 'DEF', value: 2, signed: true },
    ]);
  });

  it('follows the order of the menus, not of the card', () => {
    const counters = countersFor(
      card('c', {
        mods: { hp: -1, atk: 1 },
        status: { locked: 1, stunned: 1 },
        tokens: { acc: 1, thr: 2, dmg: 1 },
      }),
    );

    expect(counters.map((counter) => counter.name)).toEqual([
      'dmg',
      'thr',
      'acc',
      'stunned',
      'locked',
      'atk',
      'hp',
    ]);
  });

  it('lists the modifiers in the order of their badges, not of the menu', () => {
    const counters = countersFor(card('c', { mods: { thw: 1, sch: -1, atk: 2, hp: 3 } }));

    expect(counters.map((counter) => counter.name)).toEqual(['atk', 'sch', 'thw', 'hp']);
  });

  it('leaves out the counters at zero, and keeps a negative modifier', () => {
    const counters = countersFor(
      card('c', { tokens: { dmg: 0 }, status: { tough: 0 }, mods: { atk: 0, sch: -2 } }),
    );

    expect(counters).toEqual([
      { kind: 'modifier', name: 'sch', label: 'SCH', value: -2, signed: true },
    ]);
  });

  it('has nothing for a bare card', () => {
    expect(countersFor(card('c'))).toEqual([]);
  });
});

describe('visibleEntries', () => {
  it('leaves out a refused action and a refused submenu, with the separator before them', () => {
    const exhaust = action('exhaust');
    const moveTo: ContextSubmenu = { ...submenu('moveTo'), disabled: true, reason: 'No' };

    expect(visibleEntries([exhaust, SEP, refused('discard'), moveTo])).toEqual([exhaust]);
  });

  it('never doubles a separator up', () => {
    const [a, c] = [action('a'), action('c')];

    expect(visibleEntries([a, SEP, refused('b'), SEP, c])).toEqual([a, SEP, c]);
  });

  it('never leads with a separator', () => {
    const b = action('b');

    expect(visibleEntries([refused('a'), SEP, b])).toEqual([b]);
  });

  it('leaves out a submenu whose entries are all refused', () => {
    const a = action('a');
    const moveTo: ContextSubmenu = {
      ...submenu('moveTo'),
      entries: [refused('hand'), SEP, refused('deck')],
    };

    expect(visibleEntries([a, SEP, moveTo])).toEqual([a]);
  });

  it("leaves out a submenu's refused entries and the separators they strand", () => {
    const hand = action('hand');
    const moveTo: ContextSubmenu = {
      ...submenu('moveTo'),
      entries: [hand, SEP, refused('deck')],
    };

    expect(visibleEntries([moveTo])).toEqual([{ ...moveTo, entries: [hand] }]);
  });

  it('leaves out Draw an arrow, with the separator before it: arrows are not offered on touch', () => {
    const exhaust = action('exhaust');
    const arrow: ContextAction = { kind: 'action', item: arrowItem('c') };

    expect(visibleEntries([exhaust, SEP, arrow])).toEqual([exhaust]);
  });

  it('keeps every entry when none is refused', () => {
    const entries: ContextEntry[] = [action('a'), SEP, submenu('s1')];

    expect(visibleEntries(entries)).toEqual(entries);
  });
});

describe('entryGroups', () => {
  it('splits the entries at their separators, in their order', () => {
    const [a1, a2, a3] = [action('a1'), action('a2'), action('a3')];
    const s1 = submenu('s1');

    expect(entryGroups([a1, a2, SEP, s1, a3, SEP, action('a4')])).toEqual([
      [a1, a2],
      [s1, a3],
      [action('a4')],
    ]);
  });

  it('makes one group of entries with no separator', () => {
    const [a1, a2] = [action('a1'), action('a2')];

    expect(entryGroups([a1, a2])).toEqual([[a1, a2]]);
  });

  it('makes no empty group, at either end or between two separators', () => {
    const [a1, a2] = [action('a1'), action('a2')];

    expect(entryGroups([SEP, a1, SEP, SEP, a2, SEP])).toEqual([[a1], [a2]]);
  });

  it('has no group for no entries', () => {
    expect(entryGroups([])).toEqual([]);
  });
});

describe('stackCardsOf', () => {
  // A main card with two tucked cards, in chain order, then a card on its own.
  const CARDS = [
    card('second', { parent: 'first' }),
    card('main'),
    card('first', { parent: 'main' }),
    card('alone'),
  ];

  it("lists a main card's whole stack, the main card first, in chain order", () => {
    expect(stackCardsOf('main', CARDS)).toEqual(['main', 'first', 'second']);
  });

  it('lists the same stack from a tucked card', () => {
    expect(stackCardsOf('second', CARDS)).toEqual(['main', 'first', 'second']);
    expect(stackCardsOf('first', CARDS)).toEqual(['main', 'first', 'second']);
  });

  it('lists nothing for a card on its own, or one not on the table', () => {
    expect(stackCardsOf('alone', CARDS)).toEqual([]);
    expect(stackCardsOf('gone', CARDS)).toEqual([]);
  });
});
