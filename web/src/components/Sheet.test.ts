import { fireEvent, render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { modal } from './modal.svelte';
import Sheet from './Sheet.svelte';
import sheetSource from './Sheet.svelte?raw';

const content = createRawSnippet(() => ({
  render: () => '<div><button type="button">Play</button></div>',
}));

/** The declarations of a rule of the sheet's stylesheet. */
function rule(selector: string): string {
  const pattern = new RegExp(`\\n {2}${selector.replace(/[.]/g, '\\.')} \\{([^}]*)\\}`);
  return pattern.exec(sheetSource)?.[1] ?? '';
}

function renderSheet(props: { maxHeight?: string; modal?: boolean; dock?: boolean } = {}) {
  const onclose = vi.fn();
  const view = render(Sheet, { label: 'Rhino', onclose, children: content, ...props });
  const sheet = screen.getByRole('dialog', { name: 'Rhino' });
  return { onclose, sheet, view };
}

describe('Sheet', () => {
  it('is a modal dialog named by its label', () => {
    const { sheet } = renderSheet();

    expect(sheet.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
  });

  it('closes once on Escape, keeping fullscreen', async () => {
    const { onclose } = renderSheet();

    const allowed = await fireEvent.keyDown(window, { key: 'Escape' });

    expect(onclose).toHaveBeenCalledOnce();
    // A prevented Escape does not leave fullscreen.
    expect(allowed).toBe(false);
  });

  it('closes on a tap on the veil', async () => {
    const { onclose, view } = renderSheet();

    await fireEvent.click(view.container.querySelector('.veil')!);

    expect(onclose).toHaveBeenCalledOnce();
  });

  it('stays open on a tap inside the panel', async () => {
    const { onclose, sheet } = renderSheet();

    await fireEvent.click(sheet);

    expect(onclose).not.toHaveBeenCalled();
  });

  it('closes on a swipe down on the handle', async () => {
    const { onclose, sheet } = renderSheet();
    const grab = sheet.querySelector('.grab')!;

    await fireEvent.pointerDown(grab, { clientY: 300, pointerId: 1 });
    await fireEvent.pointerMove(window, { clientY: 380, pointerId: 1 });
    await fireEvent.pointerUp(window, { clientY: 380, pointerId: 1 });

    expect(onclose).toHaveBeenCalledOnce();
  });

  it('stays open after a short swipe on the handle', async () => {
    const { onclose, sheet } = renderSheet();
    const grab = sheet.querySelector('.grab')!;

    await fireEvent.pointerDown(grab, { clientY: 300, pointerId: 1 });
    await fireEvent.pointerMove(window, { clientY: 340, pointerId: 1 });
    await fireEvent.pointerUp(window, { clientY: 340, pointerId: 1 });

    expect(onclose).not.toHaveBeenCalled();
  });

  it('ignores a pointer moving down without a press on the handle', async () => {
    const { onclose } = renderSheet();

    await fireEvent.pointerMove(window, { clientY: 400, pointerId: 1 });
    await fireEvent.pointerUp(window, { clientY: 400, pointerId: 1 });

    expect(onclose).not.toHaveBeenCalled();
  });

  it('locks the page scroll while it is open', () => {
    const page = document.documentElement;
    const { view } = renderSheet();

    expect(page.classList).toContain('scroll-locked');

    view.unmount();
    expect(page.classList).not.toContain('scroll-locked');
  });

  it('gives the focus back when it closes', () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();

    const { sheet, view } = renderSheet();
    expect(sheet.contains(document.activeElement)).toBe(true);

    view.unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('keeps Tab inside the sheet', async () => {
    renderSheet();
    const play = screen.getByRole('button', { name: 'Play' });

    play.focus();
    await fireEvent.keyDown(play, { key: 'Tab' });
    expect(document.activeElement).toBe(play);
  });

  it('is at most 92 % of the window high by default', () => {
    const { sheet } = renderSheet();

    expect(sheet.style.maxHeight).toBe('92%');
  });

  it('takes a height limit of its own', () => {
    const { sheet } = renderSheet({ maxHeight: '62%' });

    expect(sheet.style.maxHeight).toBe('62%');
  });

  describe('in dock mode', () => {
    it('takes the whole width, up to the whole height under the top safe area', () => {
      const { sheet } = renderSheet({ dock: true, maxHeight: '62%' });

      expect(sheet.classList).toContain('dock');
      // Its content decides its height under that limit: no limit of its own.
      expect(sheet.style.maxHeight).toBe('');
      const dock = rule('.sheet.dock');
      expect(dock).toContain('--sheet-max: calc(100dvh - env(safe-area-inset-top));');
      expect(dock).toContain('max-height: var(--sheet-max);');
      expect(dock).toContain('max-width: none;');
    });

    it('pads its content 12 px, the safe areas kept', () => {
      const dock = rule('.sheet.dock');

      expect(dock).toMatch(/padding:\s*0 calc\(12px \+ env\(safe-area-inset-right\)\)/);
      expect(dock).toContain('calc(12px + env(safe-area-inset-bottom))');
      expect(dock).toContain('calc(12px + env(safe-area-inset-left))');
      // The room its content has, for the inspector's card and the hand's carousel.
      expect(dock).toContain('--sheet-room:');
    });

    it('is not a dock sheet outside dock mode', () => {
      const { sheet } = renderSheet();

      expect(sheet.classList).not.toContain('dock');
    });
  });

  describe('when not modal', () => {
    it('leaves the table live and the page scrollable', () => {
      const { sheet } = renderSheet({ modal: false });

      expect(modal.open).toBe(false);
      expect(document.documentElement.classList).not.toContain('scroll-locked');
      expect(sheet.getAttribute('aria-modal')).toBe('false');
    });

    it('still closes once on Escape, keeping fullscreen', async () => {
      const { onclose } = renderSheet({ modal: false });

      const allowed = await fireEvent.keyDown(window, { key: 'Escape' });

      expect(onclose).toHaveBeenCalledOnce();
      expect(allowed).toBe(false);
    });
  });
});
