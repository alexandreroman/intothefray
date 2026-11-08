/** A player's card in the lobby's seats grid: it spans one column per deck, as far as a row holds. */
export interface SeatCard {
  span: number;
  /** The viewer's own card, which comes first. */
  mine: boolean;
}

/**
 * The seats grid's items in the order the grid places them, row by row, `columns` to a row: the
 * viewer's card first, then the other players' cards in seat order (as given), then the free
 * seats. The viewer's card never moves, which keeps their deck slots in place.
 *
 * A card that would not fit on the rest of its row starts the next one, and the hole it leaves at
 * the end of that row fills up: with free seats first, then with the first later card that fits
 * the room left, which moves ahead of the card. With nothing that fits, the hole stays.
 */
export function layOutSeats<Card extends SeatCard, Free>(
  cards: readonly Card[],
  freeSeats: readonly Free[],
  columns: number,
): (Card | Free)[] {
  // The cards still to place, in grid order.
  const pending = [...cards.filter((card) => card.mine), ...cards.filter((card) => !card.mine)];
  const freeLeft = [...freeSeats];
  const items: (Card | Free)[] = [];
  const spanOf = (card: Card): number => Math.min(card.span, columns);
  // The column where the next item starts on the current row.
  let column = 0;

  while (pending.length > 0) {
    const card = pending.shift()!;
    if (column + spanOf(card) > columns) {
      while (column < columns) {
        if (freeLeft.length > 0) {
          items.push(freeLeft.shift()!);
          column += 1;
          continue;
        }
        const room = columns - column;
        const fitting = pending.findIndex((later) => spanOf(later) <= room);
        if (fitting === -1) {
          break;
        }
        const [later] = pending.splice(fitting, 1);
        items.push(later!);
        column += spanOf(later!);
      }
      // Filled or not, the row is over: the card starts the next one.
      column = 0;
    }
    items.push(card);
    column = (column + spanOf(card)) % columns;
  }
  return [...items, ...freeLeft];
}
