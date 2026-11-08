import { nextSlotKeys } from './slotKeys';
import type { DeckView } from './types';

const empty: DeckView = { ready: false, handCount: 0 };

function deck(hero: string): DeckView {
  return { ready: true, hero, heroName: hero, deckName: `${hero} deck`, handCount: 0 };
}

const spiderMan = deck('Spider-Man');
const captainMarvel = deck('Captain Marvel');
const hulk = deck('Hulk');

describe('nextSlotKeys', () => {
  it('gives the first slots shown their own keys', () => {
    expect(nextSlotKeys(undefined, [spiderMan, empty]).keys).toEqual([0, 1]);
  });

  it('keeps the keys while the slot count stays, whatever the slots hold', () => {
    const first = nextSlotKeys(undefined, [empty, empty]);

    expect(nextSlotKeys(first, [spiderMan, hulk]).keys).toEqual([0, 1]);
  });

  it('gives an added slot, at the end, a new key', () => {
    const first = nextSlotKeys(undefined, [spiderMan]);

    expect(nextSlotKeys(first, [spiderMan, empty]).keys).toEqual([0, 1]);
  });

  it('drops the key of a removed slot, and keeps the others for the slots after it', () => {
    const first = nextSlotKeys(undefined, [spiderMan, captainMarvel, hulk]);

    expect(nextSlotKeys(first, [spiderMan, hulk]).keys).toEqual([0, 2]);
  });

  it('drops the key of the slot the viewer removed, among slots that look alike', () => {
    const first = nextSlotKeys(undefined, [empty, empty, empty]);

    const next = nextSlotKeys(first, [empty, empty], { slot: 0, from: 3 });

    expect(next.keys).toEqual([1, 2]);
  });

  it('takes the last of slots that look alike as removed when no removal is known', () => {
    const first = nextSlotKeys(undefined, [empty, empty, empty]);

    expect(nextSlotKeys(first, [empty, empty]).keys).toEqual([0, 1]);
  });

  it('ignores a removal asked from another slot count', () => {
    const first = nextSlotKeys(undefined, [spiderMan, captainMarvel, hulk]);

    const next = nextSlotKeys(first, [spiderMan, hulk], { slot: 2, from: 4 });

    expect(next.keys).toEqual([0, 2]);
  });

  it('never gives a key twice, so that a slot still closing is not brought back', () => {
    const first = nextSlotKeys(undefined, [spiderMan, empty]);
    const removed = nextSlotKeys(first, [spiderMan], { slot: 1, from: 2 });

    expect(nextSlotKeys(removed, [spiderMan, empty]).keys).toEqual([0, 2]);
  });
});
