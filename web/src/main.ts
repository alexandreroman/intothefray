import { mount } from 'svelte';
import App from './App.svelte';
import { installEscapeLock } from './lib/fullscreen';
import { applyTheme, storedTheme } from './lib/theme';
import { installVisibleArea } from './lib/visibleArea';
import './styles/tokens.css';

const target = document.getElementById('app');
if (!target) {
  throw new Error('missing #app element in index.html');
}

applyTheme(storedTheme());
// For the page's whole life: fullscreen may be entered from any screen.
installEscapeLock();
// For the page's whole life too: a text field of any screen brings up the on-screen keyboard.
installVisibleArea();

mount(App, { target });
