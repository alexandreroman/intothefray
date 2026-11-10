import { mount } from 'svelte';
import App from './App.svelte';
import { installEscapeLock } from './lib/fullscreen';
import { markInstalledApp } from './lib/platform';
import { applyTheme, storedTheme } from './lib/theme';
import { installVisibleArea } from './lib/visibleArea';
import './styles/tokens.css';

const target = document.getElementById('app');
if (!target) {
  throw new Error('missing #app element in index.html');
}

applyTheme(storedTheme());
// Read once, before any screen: how the page was launched does not change (lib/platform).
markInstalledApp();
// For the page's whole life: fullscreen may be entered from any screen.
installEscapeLock();
// For the page's whole life too: a text field of any screen brings up the on-screen keyboard.
installVisibleArea();
// Safari on iOS gives :active, every control's press look (tokens.css), only to an element under a
// touchstart listener: an empty one on the document reaches them all. Passive, it never holds up a scroll.
document.addEventListener('touchstart', () => {}, { passive: true });

mount(App, { target });
