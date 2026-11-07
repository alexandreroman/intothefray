import { createEvent, fireEvent, render, screen } from '@testing-library/svelte';
import { createRawSnippet, flushSync, mount, tick, unmount } from 'svelte';
import { modal } from './modal.svelte';
import { motionMs } from '../lib/motion';
import Sheet from './Sheet.svelte';
import sheetSource from './Sheet.svelte?raw';

// Whether the viewer prefers reduced motion; the tests of the motion turn it on and off.
const motion = vi.hoisted(() => ({ reduced: false }));

vi.mock('svelte/motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('svelte/motion')>()),
  prefersReducedMotion: {
    get current() {
      return motion.reduced;
    },
  },
}));

const content = createRawSnippet(() => ({
  render: () => '<div><button type="button">Play</button></div>',
}));

/** The declarations of a rule of the sheet's stylesheet, at the given indent. */
function rule(selector: string, indent = 2): string {
  const pattern = new RegExp(`\\n {${indent}}${selector.replace(/[.]/g, '\\.')} \\{([^}]*)\\}`);
  return pattern.exec(sheetSource)?.[1] ?? '';
}

type TouchType = 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel';

/**
 * Fires a touch event of one finger at (x, y), at `at` ms, and tells whether it was let through
 * (not prevented): a prevented move scrolls nothing, a prevented end makes no click.
 */
async function touch(
  target: Element,
  type: TouchType,
  x: number,
  y: number,
  at = 0,
): Promise<boolean> {
  const point = { identifier: 1, clientX: x, clientY: y };
  const lifted = type === 'touchEnd' || type === 'touchCancel';
  const event = createEvent[type](target, {
    touches: lifted ? [] : [point],
    changedTouches: [point],
  });
  Object.defineProperty(event, 'timeStamp', { value: at });
  return fireEvent(target, event);
}

/** Where a finger is, and when: x and y in px, then the time in ms. */
type TouchPoint = [x: number, y: number, at: number];

/** A finger pressing at the first point, moving through the others, and lifted at the last. */
async function swipe(
  target: Element,
  [first, ...rest]: [TouchPoint, ...TouchPoint[]],
): Promise<void> {
  const last = rest.at(-1) ?? first;
  await touch(target, 'touchStart', ...first);
  for (const point of rest) {
    await touch(target, 'touchMove', ...point);
  }
  await touch(target, 'touchEnd', ...last);
}

function renderSheet(
  props: {
    maxHeight?: string;
    modal?: boolean;
    dock?: boolean;
    wide?: boolean;
    fit?: boolean;
  } = {},
) {
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

  describe('a touch swipe anywhere on it', () => {
    function play(): HTMLElement {
      return screen.getByRole('button', { name: 'Play' });
    }

    it('drags it down with the finger past 10 px, and closes it past 60 px', async () => {
      const { onclose, sheet } = renderSheet();

      await touch(play(), 'touchStart', 100, 300, 0);
      // Within 10 px: still a tap, which the sheet leaves alone.
      expect(await touch(play(), 'touchMove', 100, 308, 50)).toBe(true);
      expect(sheet.style.transform).toBe('');
      // Past them: the sheet's, which no scroll takes.
      expect(await touch(play(), 'touchMove', 100, 320, 100)).toBe(false);
      expect(await touch(play(), 'touchMove', 100, 390, 400)).toBe(false);
      // It follows the finger from where the drag began, without a jump.
      expect(sheet.style.transform).toBe('translateY(70px)');
      expect(sheet.classList).toContain('dragging');
      expect(onclose).not.toHaveBeenCalled();

      // A drag makes no click on what the finger lets go of.
      expect(await touch(play(), 'touchEnd', 100, 390, 800)).toBe(false);
      expect(onclose).toHaveBeenCalledOnce();
    });

    it('springs back after a slow swipe shorter than 60 px', async () => {
      const { onclose, sheet } = renderSheet();

      await swipe(play(), [
        [100, 300, 0],
        [100, 320, 100],
        [100, 360, 400],
        [100, 360, 800],
      ]);

      expect(onclose).not.toHaveBeenCalled();
      expect(sheet.style.transform).toBe('');
      expect(sheet.classList).not.toContain('dragging');
      // It glides back in 160 ms, and follows the finger at once while dragged.
      expect(rule('.sheet')).toContain('transition: transform 0.16s ease-out;');
      expect(rule('.sheet.dragging')).toContain('transition: none;');
    });

    it('closes on a fast fling down, however short', async () => {
      const { onclose } = renderSheet();

      // 20 px in 30 ms past the slop: 0.67 px/ms.
      await swipe(play(), [
        [100, 300, 0],
        [100, 315, 10],
        [100, 335, 40],
      ]);

      expect(onclose).toHaveBeenCalledOnce();
    });

    it('leaves a scrolled content to scroll back up first', async () => {
      const { onclose, sheet } = renderSheet();
      const content = sheet.querySelector<HTMLElement>('.content')!;
      let scrollTop = 40;
      Object.defineProperty(content, 'scrollTop', { get: () => scrollTop });

      await touch(play(), 'touchStart', 100, 300, 0);
      // The browser's to scroll: not prevented, and the sheet stays put.
      expect(await touch(play(), 'touchMove', 100, 330, 50)).toBe(true);
      expect(await touch(play(), 'touchMove', 100, 400, 100)).toBe(true);
      await touch(play(), 'touchEnd', 100, 400, 150);
      expect(sheet.style.transform).toBe('');
      expect(onclose).not.toHaveBeenCalled();

      // Back at its top, a new swipe drags the sheet.
      scrollTop = 0;
      await swipe(play(), [
        [100, 300, 1000],
        [100, 320, 1100],
        [100, 400, 1400],
        [100, 400, 1800],
      ]);
      expect(onclose).toHaveBeenCalledOnce();
    });

    it('leaves a mostly sideways move to the content, for the rest of the touch', async () => {
      const { onclose, sheet } = renderSheet();

      await touch(play(), 'touchStart', 100, 300, 0);
      expect(await touch(play(), 'touchMove', 140, 310, 50)).toBe(true);
      expect(await touch(play(), 'touchMove', 150, 400, 100)).toBe(true);
      await touch(play(), 'touchEnd', 150, 400, 150);

      expect(sheet.style.transform).toBe('');
      expect(onclose).not.toHaveBeenCalled();
    });

    it('leaves an upward move to the content', async () => {
      const { onclose, sheet } = renderSheet();

      await swipe(play(), [
        [100, 300, 0],
        [100, 280, 10],
        [100, 200, 40],
      ]);

      expect(sheet.style.transform).toBe('');
      expect(onclose).not.toHaveBeenCalled();
    });

    it('is no drag for a tap, which keeps its click', async () => {
      const { onclose, sheet } = renderSheet();

      await touch(play(), 'touchStart', 100, 300, 0);
      await touch(play(), 'touchMove', 103, 306, 30);

      expect(await touch(play(), 'touchEnd', 103, 306, 60)).toBe(true);
      expect(sheet.style.transform).toBe('');
      expect(onclose).not.toHaveBeenCalled();
    });

    it('springs back when the browser takes the touch over', async () => {
      const { onclose, sheet } = renderSheet();

      await touch(play(), 'touchStart', 100, 300, 0);
      await touch(play(), 'touchMove', 100, 320, 50);
      await touch(play(), 'touchMove', 100, 400, 100);
      await touch(play(), 'touchCancel', 100, 400, 150);

      expect(sheet.style.transform).toBe('');
      expect(onclose).not.toHaveBeenCalled();
    });

    it('closes once on a touch swipe on the handle, which also moves a touch pointer', async () => {
      const { onclose, sheet } = renderSheet();
      const grab = sheet.querySelector('.grab')!;
      const pointer = { pointerId: 1, pointerType: 'touch' };

      await fireEvent.pointerDown(grab, { ...pointer, clientY: 300 });
      await touch(grab, 'touchStart', 100, 300, 0);
      await fireEvent.pointerMove(window, { ...pointer, clientY: 320 });
      await touch(grab, 'touchMove', 100, 320, 100);
      await fireEvent.pointerMove(window, { ...pointer, clientY: 400 });
      await touch(grab, 'touchMove', 100, 400, 400);
      await fireEvent.pointerUp(window, { ...pointer, clientY: 400 });
      await touch(grab, 'touchEnd', 100, 400, 800);

      expect(onclose).toHaveBeenCalledOnce();
    });
  });

  it('locks the page scroll while it is open', () => {
    const page = document.documentElement;
    const { view } = renderSheet();

    expect(page.classList).toContain('scroll-locked');

    view.unmount();
    expect(page.classList).not.toContain('scroll-locked');
  });

  describe('the focus as it closes', () => {
    let opener: HTMLButtonElement;

    beforeEach(() => {
      opener = document.createElement('button');
      document.body.append(opener);
      opener.focus();
    });

    afterEach(() => {
      opener.remove();
    });

    it('goes back to the opener when closed from the keyboard', async () => {
      const { onclose, sheet, view } = renderSheet();
      expect(sheet.contains(document.activeElement)).toBe(true);

      await fireEvent.keyDown(window, { key: 'Escape' });
      expect(onclose).toHaveBeenCalledOnce();
      view.unmount();

      expect(document.activeElement).toBe(opener);
    });

    it('is let go when swiped shut, leaving the opener unfocused', async () => {
      const { onclose, view } = renderSheet();
      const play = screen.getByRole('button', { name: 'Play' });
      play.focus();

      // A finger's press is a pointer's first, as in a browser.
      await fireEvent.pointerDown(play, { pointerType: 'touch', pointerId: 1 });
      await swipe(play, [
        [100, 300, 0],
        [100, 320, 100],
        [100, 400, 400],
      ]);
      expect(onclose).toHaveBeenCalledOnce();
      view.unmount();

      expect(document.activeElement).not.toBe(opener);
      expect(document.activeElement).toBe(document.body);
    });

    it('is let go when a tap on the veil closes it', async () => {
      const { onclose, view } = renderSheet();
      const veil = view.container.querySelector('.veil')!;

      await fireEvent.pointerDown(veil, { pointerType: 'touch', pointerId: 1 });
      await fireEvent.click(veil);
      expect(onclose).toHaveBeenCalledOnce();
      view.unmount();

      expect(document.activeElement).toBe(document.body);
    });
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

    it('spans the whole width even when asked to be wide', () => {
      const { sheet } = renderSheet({ dock: true, wide: true });

      expect(sheet.classList).not.toContain('wide');
    });
  });

  describe('wide', () => {
    it('is at most 760 px wide above 600 px, never nearer than 16 px to the sides', () => {
      const { sheet } = renderSheet({ wide: true });

      expect(sheet.classList).toContain('wide');
      expect(rule('.sheet.wide', 4)).toContain('max-width: min(760px, calc(100% - 32px));');
    });

    it('fits its content when asked, never nearer than 16 px to the sides', () => {
      const { sheet } = renderSheet({ wide: true, fit: true });

      expect(sheet.classList).toContain('fit');
      const fit = rule('.sheet.wide.fit', 4);
      expect(fit).toContain('width: fit-content;');
      expect(fit).toContain('max-width: calc(100% - 32px);');
    });

    it('fits its content only when wide, and never in dock mode', () => {
      const { sheet, view } = renderSheet({ fit: true });
      expect(sheet.classList).not.toContain('fit');
      view.unmount();

      const docked = renderSheet({ dock: true, wide: true, fit: true });
      expect(docked.sheet.classList).not.toContain('fit');
    });

    it('is not, by default: at most 480 px wide', () => {
      const { sheet } = renderSheet();

      expect(sheet.classList).not.toContain('wide');
      expect(rule('.sheet', 4)).toContain('max-width: 480px;');
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

  describe('motion', () => {
    // jsdom has no Web Animations: animations that run until a test finishes them, as Svelte's
    // transitions play them.
    type FakeAnimation = {
      onfinish: (() => void) | null;
      cancel: () => void;
      effect: null;
      duration: number;
    };
    let running: FakeAnimation[] = [];
    const animate = vi.fn(function (
      this: Element,
      _keyframes: Keyframe[],
      options?: KeyframeAnimationOptions,
    ) {
      const duration = typeof options?.duration === 'number' ? options.duration : 0;
      const animation: FakeAnimation = { onfinish: null, cancel: () => {}, effect: null, duration };
      running.push(animation);
      return animation;
    });
    const originalAnimate = Element.prototype.animate;

    /** Plays every animation to its end, and those they start in turn. */
    async function finishAnimations(): Promise<void> {
      await tick();
      while (running.length > 0) {
        running.shift()?.onfinish?.();
        await tick();
      }
    }

    /** Starts the transitions: Svelte plays each after a first animation as long as its delay, none here. */
    async function startTransitions(): Promise<void> {
      await tick();
      const delays = running.filter((animation) => animation.duration === 0);
      running = running.filter((animation) => animation.duration !== 0);
      for (const delay of delays) {
        delay.onfinish?.();
      }
      await tick();
    }

    /** A sheet its caller removes at will, with its way out (unmount with outro). */
    function mountSheet() {
      const onclose = vi.fn();
      const target = document.body.appendChild(document.createElement('div'));
      const app = mount(Sheet, { target, props: { label: 'Rhino', onclose, children: content } });
      flushSync();
      const close = () => unmount(app, { outro: true });
      return { onclose, target, close };
    }

    function dialog(): HTMLElement | null {
      return screen.queryByRole('dialog', { name: 'Rhino' });
    }

    /** The elements an animation of that length ran on. */
    function animatedFor(duration: number): Element[] {
      return animate.mock.calls.flatMap((call, i) => {
        const options = (call as unknown[])[1] as { duration?: number } | undefined;
        return options?.duration === duration ? [animate.mock.contexts[i] as Element] : [];
      });
    }

    beforeEach(() => {
      Element.prototype.animate = animate as unknown as typeof Element.prototype.animate;
      motion.reduced = false;
    });

    afterEach(async () => {
      await finishAnimations();
      Element.prototype.animate = originalAnimate;
      animate.mockClear();
      running = [];
      motion.reduced = false;
      document.body.innerHTML = '';
    });

    it('lasts as long as asked, or no time under reduced motion or without Web Animations', () => {
      expect(motionMs(240)).toBe(240);

      motion.reduced = true;
      expect(motionMs(240)).toBe(0);

      motion.reduced = false;
      Element.prototype.animate = undefined as unknown as typeof Element.prototype.animate;
      expect(motionMs(240)).toBe(0);
    });

    it('slides down as its veil fades out, then goes', async () => {
      const { close, target } = mountSheet();

      const gone = close();
      await tick();
      expect(dialog()).not.toBeNull();

      await finishAnimations();
      await gone;
      expect(dialog()).toBeNull();
      const moved = animatedFor(240);
      expect(moved.some((element) => element.classList.contains('sheet'))).toBe(true);
      expect(moved.some((element) => element.classList.contains('veil'))).toBe(true);
      target.remove();
    });

    it('lets the page go and gives the focus back as it starts leaving, and takes no more taps', async () => {
      const opener = document.body.appendChild(document.createElement('button'));
      opener.focus();
      const { close } = mountSheet();
      expect(document.documentElement.classList).toContain('scroll-locked');

      void close();
      await startTransitions();

      const sheet = dialog()!;
      expect(sheet).not.toBeNull();
      expect(sheet.inert).toBe(true);
      expect(modal.open).toBe(false);
      expect(document.documentElement.classList).not.toContain('scroll-locked');
      expect(document.activeElement).toBe(opener);
    });

    it('ignores Escape once on its way out', async () => {
      const { close, onclose } = mountSheet();

      void close();
      await startTransitions();
      await fireEvent.keyDown(window, { key: 'Escape' });

      expect(onclose).not.toHaveBeenCalled();
    });

    it('goes at once under reduced motion', async () => {
      motion.reduced = true;
      const { close } = mountSheet();

      await close();

      expect(dialog()).toBeNull();
      expect(animate).not.toHaveBeenCalled();
    });

    it('stays where a closing swipe let it go, for its slide down to go on from there', async () => {
      const { onclose, sheet } = renderSheet();
      const grab = sheet.querySelector('.grab')!;

      await fireEvent.pointerDown(grab, { clientY: 300, pointerId: 1 });
      await fireEvent.pointerMove(window, { clientY: 380, pointerId: 1 });
      await fireEvent.pointerUp(window, { clientY: 380, pointerId: 1 });

      expect(onclose).toHaveBeenCalledOnce();
      expect(sheet.style.transform).toBe('translateY(80px)');
    });
  });
});
