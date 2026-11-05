import { fireEvent, render, screen } from '@testing-library/svelte';
import { createRawSnippet, flushSync, mount, tick, unmount } from 'svelte';
import { modal } from './modal.svelte';
import Sheet, { motionMs } from './Sheet.svelte';
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
