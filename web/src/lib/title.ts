/** The name of the app, as the browser tab shows it. */
export const APP_NAME = 'Into The Fray';

/**
 * The browser tab title: the app name, followed by the instance name in parentheses when one is set.
 * The instance name tells instances apart, such as one per branch; a blank one shows the bare app name.
 */
export function appTitle(instance: string | undefined): string {
  const name = (instance ?? '').trim();
  if (name === '') {
    return APP_NAME;
  }
  return `${APP_NAME} (${name})`;
}
