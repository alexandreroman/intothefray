import { APP_NAME, TITLES, type PageName } from './pages';

/**
 * The browser tab title of a page. A set instance name follows the app name in parentheses: it
 * tells instances apart, such as one per branch; a blank one leaves the title as is.
 */
export function appTitle(page: PageName, instance: string | undefined): string {
  const title = TITLES[page];
  const name = (instance ?? '').trim();
  if (name === '') {
    return title;
  }
  return title.replaceAll(APP_NAME, `${APP_NAME} (${name})`);
}
