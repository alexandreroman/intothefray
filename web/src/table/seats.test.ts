import { creditedSeat, ownSeats, seatColor, seatLabel, seatOf } from './seats';
import type { CardView, PileView, View } from '../lib/types';

function card(id: string, owner: number): CardView {
  return { id, code: '01001', face: 0, back: 'player', owner, zone: 'table', x: 0, y: 0, z: 1 };
}

function pile(id: string, owner: number): PileView {
  return { id, kind: 'deck', owner, x: 0, y: 0, count: 10 };
}

/** Alex (colour 0) plays two decks, p0 and p1 (Spider-Man); Sam (colour 1) one, p2. */
function makeView(
  you: View['you'] = { role: 'player', name: 'Alex', color: 0, host: true, areas: ['p0', 'p1'] },
): View {
  return {
    id: 'g1',
    phase: 'playing',
    you,
    players: [
      {
        name: 'Alex',
        color: 0,
        host: true,
        ready: true,
        decks: [
          { area: 'p0', hero: '01010', heroName: 'Iron Man', ready: true, handCount: 5 },
          { area: 'p1', hero: '01001', heroName: 'Spider-Man', ready: true, handCount: 4 },
        ],
      },
      {
        name: 'Sam',
        color: 1,
        host: false,
        ready: true,
        decks: [{ area: 'p2', hero: '01029', heroName: 'She-Hulk', ready: true, handCount: 6 }],
      },
    ],
    spectators: 0,
    config: { scenario: 'rhino', difficulty: 'standard', standard: '', expert: '', modulars: [] },
    table: {
      cards: [
        card('alex1', 1),
        card('sam', 2),
        card('enemy', -1),
        { ...card('h', 1), zone: 'hand' },
      ],
      piles: [pile('deck:p1', 1), pile('deck:p2', 2), { ...pile('enc', -1), kind: 'encounter' }],
      stages: [],
      firstPlayer: { x: 0, y: 0 },
    },
    log: [],
  };
}

const SPECTATOR: View['you'] = { role: 'spectator', color: -1, host: false };

describe('seatOf', () => {
  it('reads the seat of an area', () => {
    expect(seatOf('p2')).toBe(2);
  });
});

describe('ownSeats', () => {
  it("lists the viewer's seats in order", () => {
    expect(ownSeats(makeView())).toEqual([0, 1]);
  });

  it('is empty for a spectator or an unknown token', () => {
    expect(ownSeats(makeView(SPECTATOR))).toEqual([]);
    expect(ownSeats(makeView({ color: -1, host: false }))).toEqual([]);
  });
});

describe('creditedSeat', () => {
  it('credits the owner of an own card or pile', () => {
    const view = makeView();
    expect(creditedSeat({ kind: 'card', id: 'alex1' }, view, 0)).toBe(1);
    expect(creditedSeat({ kind: 'hand', id: 'h' }, view, 0)).toBe(1);
    expect(creditedSeat({ kind: 'pile', id: 'deck:p1' }, view, 0)).toBe(1);
  });

  it('credits the selected deck for a shared or foreign element', () => {
    const view = makeView();
    expect(creditedSeat({ kind: 'card', id: 'enemy' }, view, 0)).toBe(0);
    expect(creditedSeat({ kind: 'card', id: 'sam' }, view, 1)).toBe(1);
    expect(creditedSeat({ kind: 'pile', id: 'enc' }, view, 1)).toBe(1);
    expect(creditedSeat({ kind: 'card', id: 'gone' }, view, 0)).toBe(0);
  });

  it('credits nothing without a selection, nor for a spectator', () => {
    expect(creditedSeat({ kind: 'card', id: 'enemy' }, makeView(), null)).toBeUndefined();
    expect(creditedSeat({ kind: 'card', id: 'alex1' }, makeView(SPECTATOR), 0)).toBeUndefined();
  });
});

describe('seatColor', () => {
  it("is the colour of the seat's player", () => {
    const view = makeView();
    expect(seatColor(view, 1)).toBe(0);
    expect(seatColor(view, 2)).toBe(1);
    expect(seatColor(view, 3)).toBeNull();
  });
});

describe('seatLabel', () => {
  it('adds the hero to the name of a player with several decks', () => {
    const view = makeView();
    expect(seatLabel(view, 1)).toBe('Alex · Spider-Man');
    expect(seatLabel(view, 2)).toBe('Sam');
  });

  it('is empty for an unknown seat', () => {
    expect(seatLabel(makeView(), 3)).toBe('');
  });
});
