import { readFileSync } from 'node:fs';
import path from 'node:path';

// The screens' sources, as written: jsdom applies no stylesheet, so their rules themselves are checked.
const sources = import.meta.glob<string>('./*.svelte', {
  query: '?raw',
  import: 'default',
  eager: true,
});

// Read from the disk: Vitest hands a stylesheet over empty, even raw.
const tokensCss = readFileSync(path.join(import.meta.dirname, '../styles/tokens.css'), 'utf8');

/** The declarations of a top-level rule of tokens.css. */
function tokensRule(selector: string): string {
  const pattern = new RegExp(`^${selector.replace(/[.]/g, '\\.')} \\{([^}]*)\\}`, 'm');
  return pattern.exec(tokensCss)?.[1] ?? '';
}

/** Whether a screen's markup gives an element the class. */
function usesClass(file: string, name: string): boolean {
  return new RegExp(`class="([^"]* )?${name}( [^"]*)?"`).test(sources[file]!);
}

// The screens around the table that lay themselves out on the shared page (tokens.css).
const PAGE_SCREENS = ['./About.svelte', './Home.svelte', './Lobby.svelte', './Options.svelte'];

describe('screen heights', () => {
  it('finds the screens that fill the window', () => {
    const tall = Object.keys(sources).filter(
      (file) => sources[file]!.includes('min-height: 100vh;') || usesClass(file, 'screen-page'),
    );
    expect(tall.sort()).toEqual([
      './About.svelte',
      './Ended.svelte',
      './Home.svelte',
      './Lobby.svelte',
      './Options.svelte',
    ]);
  });

  it.each([...Object.keys(sources), 'tokens.css'])(
    '%s fills the dynamic viewport where it fills the window, so a short page never scrolls',
    (file) => {
      // A mobile browser's 100vh is the height without its toolbar: 100dvh, where it is known, follows
      // the toolbar as it shows and hides. 100vh stays first, for a browser that does not know dvh.
      const source = file === 'tokens.css' ? tokensCss : sources[file]!;
      const vh = source.split('min-height: 100vh;').length - 1;
      const followed = source.split(/min-height: 100vh;\s*min-height: 100dvh;/).length - 1;
      expect(followed).toBe(vh);
    },
  );

  it('fills the window with the shared page', () => {
    expect(tokensRule('.screen-page')).toMatch(/min-height: 100vh;\s*min-height: 100dvh;/);
  });
});

describe('safe areas', () => {
  it('keeps the shared column clear of the notch in landscape', () => {
    const column = tokensRule('.screen-column');
    expect(column).toContain('env(safe-area-inset-left)');
    expect(column).toContain('env(safe-area-inset-right)');
  });

  it.each(PAGE_SCREENS)('%s lays its content out in the shared column', (file) => {
    expect(usesClass(file, 'screen-page')).toBe(true);
    expect(usesClass(file, 'screen-column')).toBe(true);
  });

  it('keeps the end screen clear of the notch in landscape', () => {
    const source = sources['./Ended.svelte']!;
    expect(source).toContain('env(safe-area-inset-left)');
    expect(source).toContain('env(safe-area-inset-right)');
  });

  // Options and About end on a bottom padding taller than the home indicator.
  it.each(['./Home.svelte', './Lobby.svelte', './Ended.svelte'])(
    '%s keeps its last line, or its start bar, clear of the home indicator',
    (file) => {
      expect(sources[file]!).toContain('env(safe-area-inset-bottom)');
    },
  );
});
