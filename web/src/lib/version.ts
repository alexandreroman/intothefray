import { apiUrl, fetchJSON } from './api';

const SHORT_LENGTH = 7;
const FULL_SHA = /^[0-9a-f]{40}$/;

/**
 * The commit the app was built from: VITE_COMMIT, passed by the Pages build or else filled from Git
 * by vite.config.ts for a local build, or "dev".
 */
export function appCommit(): string {
  const configured = import.meta.env.VITE_COMMIT as string | undefined;
  return configured || 'dev';
}

/** The commit the server runs, from GET /api/version. */
export async function fetchServerCommit(): Promise<string> {
  const body = await fetchJSON<{ commit?: string }>(`${apiUrl()}/api/version`);
  if (!body.commit) {
    throw new Error('No commit in the reply');
  }
  return body.commit;
}

/** The short form of a full SHA; any other value ("dev") as is. */
export function shortCommit(commit: string): string {
  return FULL_SHA.test(commit) ? commit.slice(0, SHORT_LENGTH) : commit;
}
