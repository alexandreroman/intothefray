import { readFileSync } from 'node:fs';
import path from 'node:path';

// The on-screen keyboard of a phone or a tablet. jsdom applies no stylesheet, so the rules
// themselves are checked, read from the disk: Vitest hands a stylesheet over empty, even raw.
const tokensCss = readFileSync(path.join(import.meta.dirname, '../styles/tokens.css'), 'utf8');
const dialogSource = readFileSync(
  path.join(import.meta.dirname, '../components/Dialog.svelte'),
  'utf8',
);

/** The declarations of a rule of the dialog's stylesheet. */
function dialogRule(selector: string): string {
  const pattern = new RegExp(`^\\s*${selector.replace(/[.]/g, '\\.')} \\{([^}]*)\\}`, 'm');
  return pattern.exec(dialogSource)?.[1] ?? '';
}

describe('dialogs and the on-screen keyboard', () => {
  it('lays the backdrop over the part of the window the user sees, above the keyboard', () => {
    const backdrop = dialogRule('.backdrop');

    expect(backdrop).toContain('top: var(--visible-top, 0px);');
    expect(backdrop).toContain('height: var(--visible-height, 100%);');
    expect(backdrop).not.toContain('inset: 0;');
  });

  it('keeps a wide box within the part of the window the user sees', () => {
    expect(dialogRule('.box.wide')).toContain(
      'max-height: min(88vh, calc(var(--visible-height, 100vh) - 32px));',
    );
  });
});

describe('text fields on a touch screen', () => {
  it('are at least 16 px, so that iOS does not zoom into them', () => {
    expect(tokensCss).toMatch(
      /@media \(any-pointer: coarse\) \{\s*input\[type='text'\],\s*textarea,\s*select \{\s*font-size: 16px !important;\s*\}\s*\}/,
    );
  });
});
