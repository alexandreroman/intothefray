import { actionsFor, handActions } from './actions';
import type { CardView, Size, View } from '../lib/types';
import { card, pile, playingView, seated, spectatorYou } from './fixtures.testing';

const sizeOf = (_card: CardView): Size => 'std';

/**
 * Alex's hand holds 'h', Sam's holds 'theirs'. Alex's deck lies at (100, 330): a card played from
 * the hand lands in that row, just past the deck, at x 260.
 */
function handView(): View {
  return playingView({
    table: {
      cards: [
        card('h', { zone: 'hand' }),
        card('theirs', { zone: 'hand', owner: 1 }),
        card('mine'),
      ],
      piles: [pile('deck:p0', { owner: 0, x: 100, y: 330 })],
      hands: { p0: ['h'], p1: ['theirs'] },
    },
  });
}

describe('handActions', () => {
  it('offers Play, the default, and Discard on a card of the own hand', () => {
    const items = handActions('h', handView(), sizeOf);

    expect(items).toMatchObject([
      { id: 'play', label: 'Play', key: 'P', default: true, group: 0 },
      { id: 'discard', label: 'Discard', key: 'X', altKeys: ['Backspace'], group: 1 },
    ]);
    expect(items[1]?.disabled).toBeUndefined();
  });

  it('plays the card to the first free slot of its deck row', () => {
    const [play] = handActions('h', handView(), sizeOf);

    expect(play?.run?.()).toEqual({ kind: 'play', card: 'h', x: 260, y: 330 });
  });

  it('discards the card', () => {
    const [, discard] = handActions('h', handView(), sizeOf);

    expect(discard?.run?.()).toEqual({ kind: 'discard', card: 'h' });
  });

  it('disables Discard, with a reason, on a side deck card without a discard pile', () => {
    const view = handView();
    view.table!.cards.push(card('weather', { zone: 'hand', home: 'side:p0:0' }));
    view.table!.piles.push(pile('side:p0:0', { kind: 'sideDeck', owner: 0, label: 'Weather' }));
    view.table!.hands = { p0: ['h', 'weather'] };

    const [play, discard] = handActions('weather', view, sizeOf);

    expect(play?.disabled).toBeUndefined();
    expect(discard).toMatchObject({ id: 'discard', disabled: true });
    expect(discard?.reason).toBeTruthy();
  });

  it('offers nothing on a card outside the own hand', () => {
    const view = handView();

    expect(handActions('theirs', view, sizeOf)).toEqual([]);
    expect(handActions('mine', view, sizeOf)).toEqual([]);
    expect(handActions('gone', view, sizeOf)).toEqual([]);
  });

  it('offers nothing to a spectator, nor without a table', () => {
    const spectating = handView();
    spectating.you = spectatorYou();

    expect(handActions('h', spectating, sizeOf)).toEqual([]);
    const withoutTable = handView();
    delete withoutTable.table;
    expect(handActions('h', withoutTable, sizeOf)).toEqual([]);
  });

  it('plays a card of a second own deck to that deck row', () => {
    const view = handView();
    view.you.areas = ['p0', 'p1'];
    view.players = [seated('Alex', 0, [{ area: 'p0' }, { area: 'p1' }], true)];
    view.table!.cards.push(card('h1', { zone: 'hand', owner: 1 }));
    view.table!.piles.push(pile('deck:p1', { owner: 1, x: 40, y: 660 }));
    view.table!.hands = { p0: ['h'], p1: ['h1'] };

    const [play] = handActions('h1', view, sizeOf);

    // Past that deck, as the first deck's cards land past theirs.
    expect(play?.run?.()).toEqual({ kind: 'play', card: 'h1', x: 200, y: 660 });
  });

  it('leaves the context menu of a hand card empty', () => {
    expect(actionsFor({ kind: 'hand', id: 'h' }, handView(), 'en')).toEqual([]);
  });
});
