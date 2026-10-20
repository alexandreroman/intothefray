import { mount } from 'svelte';
import App from './App.svelte';
import { applyTheme, storedTheme } from './lib/theme';
import { appTitle } from './lib/title';
import './styles/tokens.css';

const target = document.getElementById('app');
if (!target) {
  throw new Error('missing #app element in index.html');
}

applyTheme(storedTheme());
document.title = appTitle(import.meta.env.APP_INSTANCE as string | undefined);

export default mount(App, { target });
