import { appTitle } from './title';

describe('appTitle', () => {
  it('is the page title without an instance', () => {
    expect(appTitle('home', undefined)).toBe(
      'Into the Fray · Play Marvel Champions in your browser',
    );
    expect(appTitle('about', undefined)).toBe('About · Into the Fray');
    expect(appTitle('options', undefined)).toBe('Options · Into the Fray');
    expect(appTitle('game', undefined)).toBe('Game · Into the Fray');
  });

  it('is the page title for an empty or blank instance', () => {
    expect(appTitle('about', '')).toBe('About · Into the Fray');
    expect(appTitle('about', '  \t ')).toBe('About · Into the Fray');
  });

  it('shows a set instance in parentheses after the app name, trimmed', () => {
    expect(appTitle('home', '  action-bar-ux-review \n')).toBe(
      'Into the Fray (action-bar-ux-review) · Play Marvel Champions in your browser',
    );
    expect(appTitle('game', 'seo')).toBe('Game · Into the Fray (seo)');
  });
});
