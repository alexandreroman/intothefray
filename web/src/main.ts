import { mount } from 'svelte';
import App from './App.svelte';
import { applyTheme, storedTheme } from './lib/theme';
import './styles/tokens.css';

const target = document.getElementById('app');
if (!target) {
  throw new Error('missing #app element in index.html');
}

applyTheme(storedTheme());

export default mount(App, { target });
