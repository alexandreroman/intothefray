import { byId } from './byId';

describe('byId', () => {
  it('finds the items of a list by id', () => {
    const a = { id: 'a', n: 1 };
    const b = { id: 'b', n: 2 };

    const map = byId([a, b]);

    expect(map.get('a')).toBe(a);
    expect(map.get('b')).toBe(b);
    expect(map.get('c')).toBeUndefined();
  });

  it('builds the map once for the same list', () => {
    const list = [{ id: 'a' }];

    expect(byId(list)).toBe(byId(list));
  });

  it('builds another map for another list', () => {
    const first = [{ id: 'a' }];
    const second = [{ id: 'a' }];

    expect(byId(second)).not.toBe(byId(first));
    expect(byId(second).get('a')).toBe(second[0]);
  });
});
