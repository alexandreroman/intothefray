import {
  creditedSeat,
  creditedSeatAmong,
  ownerLook,
  ownSeats,
  seatColor,
  seatFullLabel,
  seatHero,
  seatOf,
} from './seats';
import type { View } from '../lib/types';
import { card, pile, playingView, seated, spectatorYou } from './fixtures.testing';

/** Alex (colour 0) plays two decks, p0 and p1 (Spider-Man); Sam (colour 1) one, p2. */
function makeView(
  you: View['you'] = { role: 'player', name: 'Alex', color: 0, host: true, areas: ['p0', 'p1'] },
): View {
  return playingView({
    you,
    players: [
      seated(
        'Alex',
        0,
        [
          { area: 'p0', hero: '01010', heroName: 'Iron Man', handCount: 5 },
          { area: 'p1', hero: '01001', heroName: 'Spider-Man', handCount: 4 },
        ],
        true,
      ),
      seated('Sam', 1, [{ area: 'p2', hero: '01029', heroName: 'She-Hulk', handCount: 6 }]),
    ],
    table: {
      cards: [
        card('alex1', { owner: 1 }),
        card('sam', { owner: 2 }),
        card('enemy', { owner: -1 }),
        card('h', { owner: 1, zone: 'hand' }),
      ],
      piles: [
        pile('deck:p1', { owner: 1 }),
        pile('deck:p2', { owner: 2 }),
        pile('enc', { kind: 'encounter' }),
      ],
      firstPlayer: { x: 0, y: 0 },
    },
  });
}

const SPECTATOR: View['you'] = spectatorYou();

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

describe('creditedSeatAmong', () => {
  it('credits the first own element: a card before its shared pile', () => {
    const view = makeView();
    const touched = [
      { kind: 'card', id: 'alex1' },
      { kind: 'pile', id: 'enc' },
    ] as const;
    expect(creditedSeatAmong(touched, view, 0)).toBe(1);
    expect(creditedSeatAmong([{ kind: 'card', id: 'enemy' }, ...touched], view, 0)).toBe(1);
    expect(creditedSeatAmong([{ kind: 'card', id: 'sam' }], view, 0)).toBe(0);
    expect(creditedSeatAmong([], view, 1)).toBe(1);
  });
});

describe('seatHero', () => {
  it('names the hero of a deck of a player with several decks only', () => {
    const view = makeView();
    expect(seatHero(view, 1)).toBe('Spider-Man');
    expect(seatHero(view, 2)).toBe('');
    expect(seatHero(view, 3)).toBe('');
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

describe('seatFullLabel', () => {
  it("adds the deck's hero to the name of every player, one deck or several", () => {
    const view = makeView();
    expect(seatFullLabel(view, 1)).toBe('Alex · Spider-Man');
    expect(seatFullLabel(view, 2)).toBe('Sam · She-Hulk');
  });

  it('is the name alone for a deck without a hero yet', () => {
    const view = makeView();
    view.players[1]!.decks = [{ area: 'p2', ready: false, handCount: 0 }];
    expect(seatFullLabel(view, 2)).toBe('Sam');
  });

  it('is empty for an unknown seat', () => {
    expect(seatFullLabel(makeView(), 3)).toBe('');
  });
});

describe('ownerLook', () => {
  it('names and colours a seat after its player, as its owner frame', () => {
    expect(ownerLook(makeView(), 2)).toEqual({ name: 'Sam · She-Hulk', color: 'var(--p2)' });
  });

  it('is the villain for the encounter', () => {
    expect(ownerLook(makeView(), -1)).toEqual({ name: 'Villain', color: 'var(--villain)' });
  });

  it('is a muted player number for a seat nobody sits at', () => {
    expect(ownerLook(makeView(), 3)).toEqual({ name: 'Player 4', color: 'var(--muted)' });
  });
});
