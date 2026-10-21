import { fireEvent } from '@testing-library/svelte';
import { installEscapeLock } from './fullscreen';

// jsdom has neither the Fullscreen API nor the Keyboard Lock API: each test
// installs what it needs, as own properties deleted afterwards.
let uninstall: (() => void) | undefined;

afterEach(() => {
  uninstall?.();
  uninstall = undefined;
  vi.useRealTimers();
  for (const name of [
    'fullscreenElement',
    'webkitFullscreenElement',
    'exitFullscreen',
    'webkitExitFullscreen',
  ]) {
    Reflect.deleteProperty(document, name);
  }
  Reflect.deleteProperty(navigator, 'keyboard');
});

/** Sets what the document reports as its fullscreen element, under the standard or the WebKit name. */
function setFullscreenElement(
  name: 'fullscreenElement' | 'webkitFullscreenElement',
  value: Element | null,
): void {
  Object.defineProperty(document, name, { value, configurable: true });
}

/** A Keyboard Lock API whose lock resolves, or rejects when refused, or else settles as told. */
function mockKeyboard(refused = false, lock?: Promise<void>) {
  const keyboard = {
    lock: vi.fn(() => lock ?? (refused ? Promise.reject(new Error('denied')) : Promise.resolve())),
    unlock: vi.fn(),
  };
  Object.defineProperty(navigator, 'keyboard', { value: keyboard, configurable: true });
  return keyboard;
}

function mockExit() {
  const exit = vi.fn().mockResolvedValue(undefined);
  document.exitFullscreen = exit;
  return exit;
}

/** Enters fullscreen as the browser reports it, and lets the lock settle. */
async function enter(event = 'fullscreenchange'): Promise<void> {
  setFullscreenElement(
    event === 'fullscreenchange' ? 'fullscreenElement' : 'webkitFullscreenElement',
    document.body,
  );
  await fireEvent(document, new Event(event));
  // Settles the lock's promise, whatever the number of ticks it takes.
  await vi.runAllTimersAsync();
}

/** Leaves fullscreen as the browser reports it. */
async function leave(): Promise<void> {
  setFullscreenElement('fullscreenElement', null);
  await fireEvent(document, new Event('fullscreenchange'));
}

/** Presses Escape on the window; the deferred check has not run yet. */
function dispatchEscape(init: KeyboardEventInit = {}, prevent = false): void {
  const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true, ...init });
  if (prevent) {
    // As a dialog does: a listener of its own, in the bubble phase, after the lock's.
    window.addEventListener('keydown', (e) => e.preventDefault(), { once: true });
  }
  window.dispatchEvent(event);
}

/** Presses Escape on the window, then lets the dispatch end and the deferred check run. */
async function pressEscape(init: KeyboardEventInit = {}, prevent = false): Promise<void> {
  dispatchEscape(init, prevent);
  await vi.runAllTimersAsync();
}

describe('installEscapeLock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('locks Escape on entering fullscreen and unlocks it on leaving', async () => {
    const keyboard = mockKeyboard();
    uninstall = installEscapeLock();

    await enter();
    expect(keyboard.lock).toHaveBeenCalledExactlyOnceWith(['Escape']);

    await leave();
    expect(keyboard.unlock).toHaveBeenCalledOnce();
  });

  it('follows the WebKit-prefixed event too', async () => {
    const keyboard = mockKeyboard();
    uninstall = installEscapeLock();

    await enter('webkitfullscreenchange');
    expect(keyboard.lock).toHaveBeenCalledOnce();
  });

  it('leaves fullscreen on an Escape that no layer took', async () => {
    mockKeyboard();
    const exit = mockExit();
    uninstall = installEscapeLock();
    await enter();

    await pressEscape();
    expect(exit).toHaveBeenCalledOnce();
  });

  it('stays in fullscreen when a layer took the Escape', async () => {
    mockKeyboard();
    const exit = mockExit();
    uninstall = installEscapeLock();
    await enter();

    await pressEscape({}, true);
    expect(exit).not.toHaveBeenCalled();
  });

  it('ignores a held Escape repeating', async () => {
    mockKeyboard();
    const exit = mockExit();
    uninstall = installEscapeLock();
    await enter();

    await pressEscape({ repeat: true });
    expect(exit).not.toHaveBeenCalled();
  });

  it('ignores an Escape that ends an IME composition', async () => {
    mockKeyboard();
    const exit = mockExit();
    uninstall = installEscapeLock();
    await enter();

    await pressEscape({ isComposing: true });
    expect(exit).not.toHaveBeenCalled();
  });

  it('does not leave again when fullscreen ends before the deferred check', async () => {
    mockKeyboard();
    const exit = mockExit();
    uninstall = installEscapeLock();
    await enter();

    dispatchEscape();
    await leave();
    await vi.runAllTimersAsync();
    expect(exit).not.toHaveBeenCalled();
  });

  it('ignores other keys', async () => {
    mockKeyboard();
    const exit = mockExit();
    uninstall = installEscapeLock();
    await enter();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', cancelable: true }));
    await vi.runAllTimersAsync();
    expect(exit).not.toHaveBeenCalled();
  });

  it('does nothing out of fullscreen', async () => {
    mockKeyboard();
    const exit = mockExit();
    uninstall = installEscapeLock();

    await pressEscape();
    expect(exit).not.toHaveBeenCalled();
  });

  it('leaves Escape to the browser when the lock is refused', async () => {
    const keyboard = mockKeyboard(true);
    const exit = mockExit();
    uninstall = installEscapeLock();
    await enter();
    expect(keyboard.lock).toHaveBeenCalledOnce();

    await pressEscape();
    expect(exit).not.toHaveBeenCalled();
  });

  it('leaves Escape to the browser without the Keyboard Lock API', async () => {
    const exit = mockExit();
    uninstall = installEscapeLock();
    await enter();

    await pressEscape();
    expect(exit).not.toHaveBeenCalled();
  });

  it('drops the lock once fullscreen is left', async () => {
    mockKeyboard();
    const exit = mockExit();
    uninstall = installEscapeLock();
    await enter();
    await leave();

    await pressEscape();
    expect(exit).not.toHaveBeenCalled();
  });

  it('does not count a lock that resolves once fullscreen was left', async () => {
    let resolveLock = () => {};
    const lock = new Promise<void>((resolve) => {
      resolveLock = resolve;
    });
    mockKeyboard(false, lock);
    const exit = mockExit();
    uninstall = installEscapeLock();
    await enter();
    await leave();
    resolveLock();
    await vi.runAllTimersAsync();

    // Back in fullscreen without a change event: no new lock was asked for.
    setFullscreenElement('fullscreenElement', document.body);
    await pressEscape();
    expect(exit).not.toHaveBeenCalled();
  });

  it('unlocks on uninstall, even with a lock still pending', async () => {
    const keyboard = mockKeyboard(false, new Promise<void>(() => {}));
    uninstall = installEscapeLock();
    await enter();

    uninstall();
    uninstall = undefined;
    expect(keyboard.unlock).toHaveBeenCalledOnce();
  });

  it('listens no more once uninstalled', async () => {
    const keyboard = mockKeyboard();
    const exit = mockExit();
    uninstall = installEscapeLock();
    uninstall();
    uninstall = undefined;

    await enter();
    expect(keyboard.lock).not.toHaveBeenCalled();
    await pressEscape();
    expect(exit).not.toHaveBeenCalled();
  });
});
