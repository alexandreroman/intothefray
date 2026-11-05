import { fireEvent, render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import Sheet from './Sheet.svelte';

const content = createRawSnippet(() => ({
  render: () => '<div><button type="button">Play</button></div>',
}));

function renderSheet(props: { maxHeight?: string } = {}) {
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
});
