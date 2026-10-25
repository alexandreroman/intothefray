import { backUrl, firstPlayerUrl } from './theme';

const ASSETS = 'https://img.intothefray.xyz/assets/';

beforeEach(() => {
  localStorage.clear();
});

describe('table theme assets', () => {
  it('theme uses the CDN', () => {
    expect(backUrl('player', 'official')).toBe(ASSETS + 'back-player.avif');
    expect(backUrl('encounter', 'official')).toBe(ASSETS + 'back-encounter.avif');
    expect(backUrl('villain', 'official')).toBe(ASSETS + 'back-villain.avif');
    expect(firstPlayerUrl('official')).toBe(ASSETS + 'first-player.avif');
  });

  it('felt keeps the official images', () => {
    expect(backUrl('encounter', 'felt')).toBe(ASSETS + 'back-encounter.avif');
    expect(firstPlayerUrl('felt')).toBe(ASSETS + 'first-player.avif');
  });

  it('minimal uses no images', () => {
    expect(backUrl('player', 'minimal')).toBeNull();
    expect(firstPlayerUrl('minimal')).toBeNull();
  });

  it('defaults to the stored theme', () => {
    expect(backUrl('player')).toBe(ASSETS + 'back-player.avif');
    localStorage.setItem('itf-theme', 'minimal');
    expect(backUrl('player')).toBeNull();
    expect(firstPlayerUrl()).toBeNull();
  });
});
