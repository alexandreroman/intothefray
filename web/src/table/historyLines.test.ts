import type { LogView } from '../lib/types';
import { partsOf, timeOf } from './historyLines';

function line(extra: Partial<LogView>): LogView {
  return { who: 'Alex', color: 0, text: '', at: '2026-11-05T10:00:00Z', ...extra };
}

describe('partsOf', () => {
  it('dims the bracketed details of a plain line', () => {
    expect(partsOf(line({ text: 'started the game (Rhino, Bomb Scare)' }))).toEqual([
      { text: 'started the game ', aside: false, card: false },
      { text: '(Rhino, Bomb Scare)', aside: true, card: false },
    ]);
  });

  it('names a card in the viewer language, else as the server wrote it, in bold', () => {
    const entry = line({
      text: 'flipped Rhino (stage II) and Bomb Scare',
      parts: [
        { text: 'flipped ' },
        { text: 'Rhino (II)', card: true, ref: { card: '01094', face: 0 } },
        { text: ' and ' },
        { text: 'Bomb Scare', card: true, ref: { card: '99999', face: 0 } },
      ],
    });

    expect(partsOf(entry, (ref) => (ref.card === '01094' ? 'Rhino FR (II)' : undefined))).toEqual([
      { text: 'flipped ', aside: false, card: false },
      { text: 'Rhino FR ', aside: false, card: true },
      { text: '(II)', aside: true, card: true },
      { text: ' and ', aside: false, card: false },
      { text: 'Bomb Scare', aside: false, card: true },
    ]);
  });

  it('keeps the server text of a card without a way to name it', () => {
    const entry = line({
      text: 'drew Rhino',
      parts: [{ text: 'Rhino', card: true, ref: { card: '01094', face: 0 } }],
    });
    expect(partsOf(entry)).toEqual([{ text: 'Rhino', aside: false, card: true }]);
  });
});

describe('timeOf', () => {
  it('reads hh:mm in local time', () => {
    expect(timeOf(new Date(2026, 10, 5, 9, 7).toISOString())).toBe('09:07');
  });
});
