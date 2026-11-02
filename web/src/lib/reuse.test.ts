import { isSameData, reuseUnchanged } from './reuse';
import type { CardView, PileView, TableView, View } from './types';

const card = (id: string, extra: Partial<CardView> = {}): CardView => ({
  id,
  code: '01001',
  face: 0,
  back: 'player',
  owner: 0,
  zone: 'table',
  x: 0,
  y: 0,
  z: 1,
  ...extra,
});

const pile = (id: string, extra: Partial<PileView> = {}): PileView => ({
  id,
  kind: 'deck',
  owner: 0,
  x: 0,
  y: 0,
  count: 30,
  ...extra,
});

const view = (table?: Partial<TableView>): View => ({
  id: 'g1',
  phase: 'playing',
  you: { role: 'player', color: 0, host: true },
  players: [],
  spectators: 0,
  config: { scenario: 'rhino', difficulty: 'standard', standard: '', expert: '', modulars: [] },
  table: table && { cards: [], piles: [], stages: [], firstPlayer: { x: 0, y: 0 }, ...table },
  log: [],
});

// Each server message parses into new objects: a deep copy stands for the next message.
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe('reuseUnchanged', () => {
  it('keeps the previous object of an unchanged card and pile', () => {
    const prev = view({ cards: [card('a'), card('b')], piles: [pile('d')] });
    const next = copy(prev);

    const shared = reuseUnchanged(prev, next);

    expect(shared.table?.cards[0]).toBe(prev.table?.cards[0]);
    expect(shared.table?.cards[1]).toBe(prev.table?.cards[1]);
    expect(shared.table?.piles[0]).toBe(prev.table?.piles[0]);
  });

  it('takes the next object of a changed card and pile', () => {
    const prev = view({ cards: [card('a'), card('b')], piles: [pile('d')] });
    const next = view({
      cards: [card('a', { x: 40 }), card('b')],
      piles: [pile('d', { count: 29 })],
    });

    const shared = reuseUnchanged(prev, next);

    expect(shared.table?.cards[0]).toBe(next.table?.cards[0]);
    expect(shared.table?.cards[1]).toBe(prev.table?.cards[1]);
    expect(shared.table?.piles[0]).toBe(next.table?.piles[0]);
  });

  it('takes new cards as they come and drops removed ones, in the next order', () => {
    const prev = view({ cards: [card('a'), card('b')] });
    const next = view({ cards: [card('c'), card('a')] });

    const shared = reuseUnchanged(prev, next);

    expect(shared.table?.cards).toHaveLength(2);
    expect(shared.table?.cards[0]).toBe(next.table?.cards[0]);
    expect(shared.table?.cards[1]).toBe(prev.table?.cards[0]);
  });

  it('compares nested tokens, status and modifiers deeply', () => {
    const tokened = card('a', { tokens: { damage: 2 }, status: { stunned: 1 }, mods: { atk: 1 } });
    const prev = view({ cards: [tokened, card('b', { tokens: { damage: 2 } })] });
    const next = view({ cards: [copy(tokened), card('b', { tokens: { damage: 3 } })] });

    const shared = reuseUnchanged(prev, next);

    expect(shared.table?.cards[0]).toBe(tokened);
    expect(shared.table?.cards[1]).toBe(next.table?.cards[1]);
  });

  it('returns the next view itself without a previous table', () => {
    const next = view({ cards: [card('a')] });

    expect(reuseUnchanged(null, next)).toBe(next);
    expect(reuseUnchanged(view(), next)).toBe(next);
  });

  it('returns a new view and leaves the previous one as it was', () => {
    const prev = view({ cards: [card('a')] });
    const before = copy(prev);
    const prevCards = prev.table?.cards;
    const next = view({ cards: [card('a', { x: 40 })] });

    const shared = reuseUnchanged(prev, next);

    expect(shared).not.toBe(next);
    expect(shared).not.toBe(prev);
    expect(prev).toEqual(before);
    expect(prev.table?.cards).toBe(prevCards);
    expect(next.table?.cards[0]?.x).toBe(40);
  });
});

describe('isSameData', () => {
  it('ignores the order of keys', () => {
    expect(isSameData({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 })).toBe(true);
  });

  it('tells apart different values, keys and array items', () => {
    expect(isSameData({ a: 1 }, { a: 2 })).toBe(false);
    expect(isSameData({ a: 1 }, { b: 1 })).toBe(false);
    expect(isSameData({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(isSameData([1, 2], [2, 1])).toBe(false);
    expect(isSameData([1, 2], [1, 2, 3])).toBe(false);
    expect(isSameData({ a: [] }, { a: {} })).toBe(false);
    expect(isSameData({ a: null }, { a: {} })).toBe(false);
  });

  it('holds a key whose value is undefined as absent', () => {
    expect(isSameData({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(isSameData({ a: 1 }, { a: 1, b: undefined })).toBe(true);
    expect(isSameData({ a: undefined }, { b: 1 })).toBe(false);
  });
});
