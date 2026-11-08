import { layOutSeats } from './seatLayout';

interface Card {
  name: string;
  span: number;
  mine: boolean;
}

interface Free {
  free: string;
}

function card(name: string, span = 1, mine = false): Card {
  return { name, span, mine };
}

/** The free seats a, b, c… up to the count. */
function free(count: number): Free[] {
  return ['a', 'b', 'c', 'd'].slice(0, count).map((letter) => ({ free: letter }));
}

/** The items by name: a card's name, or "free a" for a free seat. */
function names(items: (Card | Free)[]): string[] {
  return items.map((item) => ('name' in item ? item.name : `free ${item.free}`));
}

describe('layOutSeats', () => {
  it("puts the viewer's card first, then the others in seat order, then the free seats", () => {
    const cards = [card('Alex'), card('Sam', 1, true), card('Jo')];

    expect(names(layOutSeats(cards, free(1), 1))).toEqual(['Sam', 'Alex', 'Jo', 'free a']);
  });

  it('keeps the seat order for a spectator, whose card is none of them', () => {
    const cards = [card('Alex'), card('Sam'), card('Jo')];

    expect(names(layOutSeats(cards, free(1), 4))).toEqual(['Alex', 'Sam', 'Jo', 'free a']);
  });

  it('leaves the order as it is when every card fits on its row', () => {
    const cards = [card('Alex', 2, true), card('Sam')];

    expect(names(layOutSeats(cards, free(1), 2))).toEqual(['Alex', 'Sam', 'free a']);
  });

  it('fills the hole before a card over two columns with a free seat, at 2 columns', () => {
    const cards = [card('Alex', 1, true), card('Sam', 2)];

    expect(names(layOutSeats(cards, free(1), 2))).toEqual(['Alex', 'free a', 'Sam']);
  });

  it('counts a card over three or four decks as a whole row, at 2 columns', () => {
    const cards = [card('Alex', 1, true), card('Sam', 3)];

    expect(names(layOutSeats(cards, free(2), 2))).toEqual(['Alex', 'free a', 'Sam', 'free b']);
  });

  it('fills the end of a row with as many free seats as it takes, at 4 columns', () => {
    const cards = [card('Alex', 2, true), card('Sam', 3)];

    expect(names(layOutSeats(cards, free(3), 4))).toEqual([
      'Alex',
      'free a',
      'free b',
      'Sam',
      'free c',
    ]);
  });

  it('fills what it can of a hole with the free seats left, at 4 columns', () => {
    const cards = [card('Alex', 1, true), card('Sam', 4)];

    expect(names(layOutSeats(cards, free(2), 4))).toEqual(['Alex', 'free a', 'free b', 'Sam']);
  });

  it('fills the hole with a later one-deck player when no free seat is left, at 2 columns', () => {
    const cards = [card('Alex', 1, true), card('Sam', 2), card('Jo')];

    expect(names(layOutSeats(cards, [], 2))).toEqual(['Alex', 'Jo', 'Sam']);
  });

  it('prefers a free seat to a later player to fill the hole', () => {
    const cards = [card('Alex', 1, true), card('Sam', 2), card('Jo')];

    expect(names(layOutSeats(cards, free(1), 2))).toEqual(['Alex', 'free a', 'Sam', 'Jo']);
  });

  it('takes the first later card that fits the room left, at 4 columns', () => {
    const cards = [card('Alex', 2, true), card('Sam', 3), card('Jo', 3), card('Kim', 2)];

    expect(names(layOutSeats(cards, [], 4))).toEqual(['Alex', 'Kim', 'Sam', 'Jo']);
  });

  it("never moves the viewer's card, even as a later card fills a hole", () => {
    const cards = [card('Alex', 2), card('Jo'), card('Sam', 1, true)];

    expect(names(layOutSeats(cards, [], 2))).toEqual(['Sam', 'Jo', 'Alex']);
  });

  it('leaves the hole when neither a free seat nor a later card fits it', () => {
    const cards = [card('Alex', 1, true), card('Sam', 2), card('Jo', 2)];

    expect(names(layOutSeats(cards, [], 2))).toEqual(['Alex', 'Sam', 'Jo']);
  });

  it('spans every card over the one column of a phone, so that nothing moves', () => {
    const cards = [card('Alex', 1, true), card('Sam', 2)];

    expect(names(layOutSeats(cards, free(1), 1))).toEqual(['Alex', 'Sam', 'free a']);
  });
});
