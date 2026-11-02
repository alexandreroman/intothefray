import { describe, expect, it } from 'vitest';
import type { Action, CardView, PileView, View } from '../lib/types';
import { actionsFor, discardPileOf, type ActionItem } from './actions';
import { narratedName } from './animate';
import { pileLabel } from './boxes';
import { dropAction, pileTargets, sourceOf } from './drag';
import { pileBack } from './face';
import { chipsByFrame, footprints, ownerFrames, pileBox } from './layout';
import { card, pile, playingView } from './fixtures.testing';

/** An encounter card nobody owns, in one of the piles. */
function encounterCard(id: string, extra: Partial<CardView> = {}): CardView {
  return card(id, { back: 'encounter', owner: -1, zone: 'pile', z: 0, ...extra });
}

/**
 * A Wrecking Crew table: two encounter scenario decks with their own discard piles, a deck that
 * never discards its cards, no classic encounter deck.
 */
const WRECKER = [
  pile('enc:wrecker', {
    kind: 'encounter',
    label: 'Wrecker',
    compact: true,
    x: 0,
    y: 30,
    discard: 'encd:wrecker',
  }),
  pile('encd:wrecker', {
    kind: 'encounterDiscard',
    label: 'Wrecker',
    compact: true,
    x: 100,
    y: 30,
    cards: ['d1'],
  }),
  pile('enc:thunderball', {
    kind: 'encounter',
    label: 'Thunderball',
    compact: true,
    x: 300,
    y: 30,
    discard: 'encd:thunderball',
  }),
  pile('encd:thunderball', {
    kind: 'encounterDiscard',
    label: 'Thunderball',
    compact: true,
    x: 400,
    y: 30,
  }),
  pile('sdeck:weapons', {
    kind: 'scenarioDeck',
    label: 'Experimental Weapons',
    compact: true,
    x: 600,
    y: 30,
  }),
  pile('vic', { kind: 'victory', count: 1, cards: ['v1'] }),
  pile('saside', { kind: 'aside', count: 1, cards: ['a1'] }),
];

function makeView(piles: PileView[] = WRECKER): View {
  return playingView({
    players: [],
    config: {
      scenario: 'wrecking_crew',
      difficulty: 'standard',
      standard: '',
      expert: '',
      modulars: [],
    },
    table: {
      cards: [encounterCard('d1', { home: 'enc:wrecker' })],
      piles,
      hands: { p0: [] },
      firstPlayer: { x: 0, y: 0 },
    },
  });
}

function menu(id: string, view = makeView()): ActionItem[] {
  const result = actionsFor({ kind: 'pile', id }, view, 'en');
  if (!Array.isArray(result)) {
    throw new Error(`expected items, got "${result.text}"`);
  }
  return result;
}

function run(items: ActionItem[], id: string): Action {
  const result = items.find((it) => it.id === id)?.run?.();
  if (!result || 'ask' in result || 'local' in result) {
    throw new Error(`${id} does not send an action`);
  }
  return result;
}

describe('pileBox', () => {
  it('compact is 80x112', () => {
    expect(pileBox(pile('enc:w', { compact: true }))).toEqual({ w: 80, h: 112 });
    expect(pileBox(pile('enc'))).toEqual({ w: 112, h: 157 });
  });

  it('sizes the footprints', () => {
    const [compact, normal] = footprints(
      [],
      [pile('a', { compact: true }), pile('b')],
      () => 'std',
    );
    expect([compact?.w, compact?.h, normal?.w, normal?.h]).toEqual([80, 112, 112, 157]);
  });
});

describe('scenario deck frames', () => {
  it('one frame per scenario deck named by its label', () => {
    const frames = ownerFrames(WRECKER);
    expect(frames).toEqual([
      { owner: -1, label: 'Wrecker', x: -10, y: 20, w: 200, h: 132 },
      { owner: -1, label: 'Thunderball', x: 290, y: 20, w: 200, h: 132 },
      { owner: -1, label: 'Experimental Weapons', x: 590, y: 20, w: 100, h: 132 },
    ]);
  });

  it('keeps Villain for the classic piles', () => {
    const classic = [
      pile('enc', { kind: 'encounter' }),
      pile('encd', { kind: 'encounterDiscard', x: 130 }),
    ];
    expect(ownerFrames(classic)).toEqual([{ owner: -1, x: -10, y: -10, w: 262, h: 177 }]);
  });

  it('chips on the first villain frame', () => {
    const frames = ownerFrames(WRECKER);
    const chips = chipsByFrame(frames, WRECKER).map((c) => c.map((chip) => chip.pile));
    expect(chips).toEqual([['vic', 'saside'], [], []]);
  });
});

describe('encounter scenario deck', () => {
  it('menu: Reveal default sending its pile id, discard to its own discard', () => {
    const items = menu('enc:wrecker');
    expect(items.find((it) => it.default)?.id).toBe('reveal');
    expect(run(items, 'reveal')).toEqual({ kind: 'reveal', pile: 'enc:wrecker' });
    expect(run(items, 'discard1')).toEqual({ kind: 'discardTop', pile: 'enc:wrecker', n: 1 });
    expect(items.map((it) => it.id)).toEqual(
      expect.arrayContaining(['lookTop', 'search', 'discardTop', 'shuffle']),
    );
  });

  it('deals from its own deck and discards onto its own encd:<key>', () => {
    const view = makeView();
    const source = sourceOf({ kind: 'pile', id: 'enc:wrecker' }, view);
    expect(source).toEqual({ kind: 'encounter', pile: 'enc:wrecker' });
    if (!source) {
      throw new Error('no source');
    }
    expect(pileTargets(source, view)).toEqual([
      { pile: 'encd:wrecker', drop: 'discard', label: 'Discard' },
    ]);
    expect(
      dropAction(
        source,
        { kind: 'table', rect: { left: 0, top: 0, right: 1000, bottom: 1000 } },
        { x: 100, y: 200 },
        'p0',
      ),
    ).toEqual({
      kind: 'deal',
      pile: 'enc:wrecker',
      area: 'p0',
      x: 100,
      y: 200,
    });
  });

  it('the classic deck deals and reveals as before', () => {
    const view = makeView([
      pile('enc', { kind: 'encounter' }),
      pile('encd', { kind: 'encounterDiscard' }),
    ]);
    expect(run(menu('enc', view), 'reveal')).toEqual({ kind: 'reveal' });
    const source = sourceOf({ kind: 'pile', id: 'enc' }, view);
    expect(
      source &&
        dropAction(
          source,
          { kind: 'table', rect: { left: 0, top: 0, right: 1000, bottom: 1000 } },
          { x: 100, y: 200 },
          'p0',
        ),
    ).toEqual({
      kind: 'deal',
      area: 'p0',
      x: 100,
      y: 200,
    });
  });
});

describe('scenarioDeck', () => {
  it('menu has no Deal and no discard without a discard pile', () => {
    const items = menu('sdeck:weapons');
    expect(items.map((it) => it.id)).not.toContain('deal');
    expect(items.find((it) => it.default)?.id).toBe('reveal');
    expect(run(items, 'reveal')).toEqual({ kind: 'reveal', pile: 'sdeck:weapons' });
    expect(items.map((it) => it.id)).not.toContain('discard1');
    // Not dealt from: a drag plays its top card (drag.ts).
    expect(sourceOf({ kind: 'pile', id: 'sdeck:weapons' }, makeView())).toEqual({
      kind: 'deck',
      pile: 'sdeck:weapons',
    });
  });

  it('discards onto its sdisc:<key> when it has one', () => {
    const view = makeView([
      pile('sdeck:x', { kind: 'scenarioDeck', label: 'X', compact: true, discard: 'sdisc:x' }),
      pile('sdisc:x', { kind: 'scenarioDiscard', label: 'X', compact: true }),
    ]);
    expect(run(menu('sdeck:x', view), 'discard1')).toEqual({
      kind: 'discardTop',
      pile: 'sdeck:x',
      n: 1,
    });
    expect(discardPileOf(encounterCard('c', { home: 'sdeck:x' }), view.table?.piles ?? [])).toBe(
      'sdisc:x',
    );
  });

  it('discards onto the encounter discard pile when it names it', () => {
    const view = makeView([
      pile('enc', { kind: 'encounter' }),
      pile('encd', { kind: 'encounterDiscard' }),
      pile('sdeck:weapons', {
        kind: 'scenarioDeck',
        label: 'Experimental Weapons',
        compact: true,
        discard: 'encd',
      }),
    ]);
    const items = menu('sdeck:weapons', view);
    expect(run(items, 'discard1')).toEqual({ kind: 'discardTop', pile: 'sdeck:weapons', n: 1 });
    expect(items.map((it) => it.id)).toContain('discardTop');
    expect(
      discardPileOf(encounterCard('c', { home: 'sdeck:weapons' }), view.table?.piles ?? []),
    ).toBe('encd');
  });

  it('a card of a deck without a discard is never discarded', () => {
    expect(discardPileOf(encounterCard('c', { home: 'sdeck:weapons' }), WRECKER)).toBeNull();
    expect(discardPileOf(encounterCard('c', { home: 'enc:wrecker' }), WRECKER)).toBe(
      'encd:wrecker',
    );
  });
});

describe('scenario pile names', () => {
  it('titles and backs', () => {
    const view = makeView();
    expect(pileLabel(WRECKER[0] as PileView, view)).toBe('Wrecker deck');
    expect(pileLabel(WRECKER[1] as PileView, view)).toBe('Wrecker discard');
    expect(pileLabel(WRECKER[4] as PileView, view)).toBe('Experimental Weapons deck');
    expect(pileBack(WRECKER[4] as PileView)).toBe('encounter');
  });

  it('narratedName "Wrecker\'s encounter deck"', () => {
    const view = makeView();
    expect(narratedName(WRECKER[0] as PileView, undefined, view)).toBe("Wrecker's encounter deck");
    expect(narratedName(WRECKER[1] as PileView, undefined, view)).toBe(
      "Wrecker's encounter discard pile",
    );
    expect(narratedName(WRECKER[4] as PileView, undefined, view)).toBe(
      'the Experimental Weapons deck',
    );
    const disc = pile('sdisc:x', { kind: 'scenarioDiscard', label: 'Experimental Weapons' });
    expect(narratedName(disc, undefined, view)).toBe('the Experimental Weapons discard pile');
  });
});

describe('drop targets of a scenario card', () => {
  it('names the scenario deck it returns to', () => {
    const view = makeView();
    const table = view.table && {
      ...view.table,
      cards: [encounterCard('d1', { home: 'enc:wrecker', zone: 'table' })],
    };
    const source = sourceOf({ kind: 'card', id: 'd1' }, { ...view, table });
    if (!source) {
      throw new Error('no source');
    }
    expect(pileTargets(source, { ...view, table })[0]).toEqual({
      pile: 'enc:wrecker',
      drop: 'top',
      label: 'Top of Wrecker deck',
    });
  });
});
