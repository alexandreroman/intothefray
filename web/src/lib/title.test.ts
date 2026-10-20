import { APP_NAME, appTitle } from './title';

describe('appTitle', () => {
  it('is the app name without an instance', () => {
    expect(appTitle(undefined)).toBe('Into The Fray');
  });

  it('is the app name for an empty or blank instance', () => {
    expect(appTitle('')).toBe(APP_NAME);
    expect(appTitle('  \t ')).toBe(APP_NAME);
  });

  it('shows a set instance in parentheses, trimmed', () => {
    expect(appTitle('  action-bar-ux-review \n')).toBe('Into The Fray (action-bar-ux-review)');
  });
});
