import { backUrl, firstPlayerUrl, THEME_ASSETS } from './theme';

const CEREBRO = 'https://pub-d27e6715f4ba4529bc9d8fd13938a5a1.r2.dev/cerebro-cards/';
const FIRST_PLAYER = 'https://card-table.app/images/table/first_player_token_marvelchampions.png';

beforeEach(() => {
  localStorage.clear();
});

describe('table theme assets', () => {
  it('official backs come from the prototype URLs', () => {
    expect(backUrl('player', 'official')).toBe(CEREBRO + 'HeroBack.jpg');
    expect(backUrl('encounter', 'official')).toBe(CEREBRO + 'EncounterBack.jpg');
    expect(backUrl('villain', 'official')).toBe(CEREBRO + 'VillainBack.jpg');
    expect(firstPlayerUrl('official')).toBe(FIRST_PLAYER);
  });

  it('felt keeps the official images and changes the table colours', () => {
    expect(backUrl('encounter', 'felt')).toBe(CEREBRO + 'EncounterBack.jpg');
    expect(firstPlayerUrl('felt')).toBe(FIRST_PLAYER);
    expect(THEME_ASSETS.felt.colors).toEqual({
      tableBg: '#0f2a1d',
      dot: '#1d3a2b',
      line: '#2d5a42',
    });
  });

  it('minimal uses no images', () => {
    expect(backUrl('player', 'minimal')).toBeNull();
    expect(firstPlayerUrl('minimal')).toBeNull();
  });

  it('defaults to the stored theme', () => {
    expect(backUrl('player')).toBe(CEREBRO + 'HeroBack.jpg');
    localStorage.setItem('itf-theme', 'minimal');
    expect(backUrl('player')).toBeNull();
    expect(firstPlayerUrl()).toBeNull();
  });
});
