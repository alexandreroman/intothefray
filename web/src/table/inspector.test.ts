import type { ActionItem } from './actions';
import type { ContextAction, ContextEntry, ContextSeparator, ContextSubmenu } from './contextItems';
import { card } from './fixtures.testing';
import { countersFor, splitEntries } from './inspector';

function action(id: string): ContextAction {
  const item: ActionItem = { id, label: id, group: 0 };
  return { kind: 'action', item };
}

const SEP: ContextSeparator = { kind: 'separator' };

function submenu(id: string): ContextSubmenu {
  return { kind: 'submenu', id, label: id, disabled: false, entries: [action(`${id}-a`)] };
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

describe('splitEntries', () => {
  it('takes the first group as the main actions', () => {
    const [a1, a2, a3] = [action('a1'), action('a2'), action('a3')];

    expect(splitEntries([a1, a2, SEP, a3])).toEqual({ main: [a1, a2], rest: [a3] });
  });

  it('takes at most four main actions, the others leading the rest', () => {
    const [a1, a2, a3, a4, a5] = [
      action('a1'),
      action('a2'),
      action('a3'),
      action('a4'),
      action('a5'),
    ];
    const s1 = submenu('s1');

    expect(splitEntries([a1, a2, a3, a4, a5, SEP, s1])).toEqual({
      main: [a1, a2, a3, a4],
      rest: [a5, SEP, s1],
    });
  });

  it('stops the main actions at a submenu', () => {
    const a1 = action('a1');
    const s1 = submenu('s1');
    const a2 = action('a2');

    expect(splitEntries([a1, s1, a2])).toEqual({ main: [a1], rest: [s1, a2] });
  });

  it('has no main actions when the first entry is a submenu', () => {
    const entries: ContextEntry[] = [submenu('s1'), SEP, action('a1')];

    expect(splitEntries(entries)).toEqual({ main: [], rest: entries });
  });

  it('has nothing for no entries', () => {
    expect(splitEntries([])).toEqual({ main: [], rest: [] });
  });
});
