import { readFileSync } from 'node:fs';
import path from 'node:path';

// Read from the disk: Vitest hands a stylesheet over empty, even raw.
function source(file: string): string {
  return readFileSync(path.join(import.meta.dirname, file), 'utf8');
}

const pillRule = /\.count-pill \{([^}]*)\}/.exec(source('countPill.css'))?.[1] ?? '';

/** Every card count of the table, and the selector its component sizes and places it with. */
const COUNTS: [file: string, selector: string][] = [
  ['PileView.svelte', '.count'],
  ['Dock.svelte', '.count'],
  ['HandSheet.svelte', '.count'],
  ['HeroPicker.svelte', '.n'],
  ['CardSheet.svelte', '.count'],
  ['ContextMenu.svelte', '.count'],
];

/** The bodies of the component's own rules whose selector names the count. */
function countRules(file: string, selector: string): string[] {
  const named = new RegExp(`${selector.replace('.', '\\.')}\\b`);
  return [...source(file).matchAll(/\n {2}([^{}\n]+)\{([^}]*)\}/g)]
    .filter(([, selectors = '']) => named.test(selectors))
    .map(([, , body = '']) => body);
}

describe('the count pill', () => {
  it("is a pile's capsule: dark, a thin edge, round ends, its own shadow, plain digits", () => {
    expect(pillRule).toContain('background: #000c;');
    expect(pillRule).toContain('border: 1px solid var(--line);');
    expect(pillRule).toContain('border-radius: 999px;');
    expect(pillRule).toContain('box-shadow: 0 2px 4px #0009;');
    expect(pillRule).toContain('color: var(--text);');
    expect(pillRule).toContain('font-family: var(--font);');
    expect(pillRule).toContain('font-weight: 400;');
    expect(pillRule).toContain('white-space: nowrap;');
    // The padding follows the font size each place gives the count.
    expect(pillRule).toContain('padding: 0 0.67em;');
  });

  it.each(COUNTS)(
    'draws the card count of %s, which only sizes and places it',
    (file, selector) => {
      const component = source(file);
      expect(component).toContain("import './countPill.css';");
      expect(component).toMatch(/class="[^"]*\bcount-pill\b/);
      const rules = countRules(file, selector);
      expect(rules.length).toBeGreaterThan(0);
      for (const body of rules) {
        expect(body).not.toMatch(
          /^\s*(background|border|border-radius|color|box-shadow|font|font-weight):/m,
        );
      }
    },
  );
});
