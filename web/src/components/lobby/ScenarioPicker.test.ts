import { fireEvent, render, screen } from '@testing-library/svelte';
import ScenarioPicker from './ScenarioPicker.svelte';
import type { Index, LobbyConfig, View, YouView } from '../../lib/types';

const index: Index = {
  version: 1,
  lang: 'en',
  packs: [{ code: 'core', name: 'Core Set', file: 'core.json', position: 1 }],
  scenarios: [
    {
      id: 'rhino',
      name: 'Rhino',
      pack: 'core',
      image: '',
      supported: true,
      recommended: ['bomb_scare'],
    },
    {
      id: 'klaw',
      name: 'Klaw',
      pack: 'core',
      image: '',
      supported: true,
      recommended: [],
    },
  ],
  sets: [
    { code: 'standard', name: 'Standard', pack: 'core', kind: 'standard' },
    { code: 'standard_ii', name: 'Standard II', pack: 'core', kind: 'standard' },
    { code: 'expert', name: 'Expert', pack: 'core', kind: 'expert' },
    { code: 'expert_ii', name: 'Expert II', pack: 'core', kind: 'expert' },
    { code: 'bomb_scare', name: 'Bomb Scare', pack: 'core', kind: 'modular' },
  ],
};

const asHost: YouView = { role: 'player', name: 'Alex', color: 0, host: true };
const asGuest: YouView = { role: 'player', name: 'Sam', color: 1, host: false };

const rhino: LobbyConfig = {
  scenario: 'rhino',
  difficulty: 'standard',
  standard: 'standard',
  expert: '',
  modulars: ['bomb_scare'],
};

function viewOf(config: LobbyConfig, you: YouView = asHost): View {
  return {
    id: 'g1',
    phase: 'lobby',
    you,
    players: [{ name: 'Alex', color: 0, host: true, ready: false, decks: [] }],
    spectators: 0,
    config,
    log: [],
  };
}

function renderPicker(config: LobbyConfig, you: YouView = asHost) {
  const onconfigure = vi.fn();
  const result = render(ScenarioPicker, { view: viewOf(config, you), index, onconfigure });
  return { onconfigure, ...result };
}

function setSelect(label: string): HTMLSelectElement {
  return screen.getByRole('combobox', { name: label }) as HTMLSelectElement;
}

describe('ScenarioPicker set dropdowns', () => {
  it('offers None first in both dropdowns', () => {
    renderPicker({ ...rhino, difficulty: 'expert', expert: 'expert' });

    for (const label of ['Standard set', 'Expert set']) {
      const first = setSelect(label).options.item(0);
      expect(first?.value).toBe('');
      expect(first?.textContent).toBe('None');
    }
  });

  it('sends an empty standard set when the host chooses None', async () => {
    const { onconfigure } = renderPicker(rhino);

    await fireEvent.change(setSelect('Standard set'), { target: { value: '' } });

    expect(onconfigure).toHaveBeenCalledWith({ ...rhino, standard: '' });
  });

  it('sends an empty expert set when the host chooses None', async () => {
    const expert: LobbyConfig = { ...rhino, difficulty: 'expert', expert: 'expert' };
    const { onconfigure } = renderPicker(expert);

    await fireEvent.change(setSelect('Expert set'), { target: { value: '' } });

    expect(onconfigure).toHaveBeenCalledWith({ ...expert, expert: '' });
  });

  it('keeps None selected after a redraw', async () => {
    const noSets: LobbyConfig = { ...rhino, difficulty: 'expert', standard: '', expert: '' };
    const { rerender } = renderPicker(noSets);

    expect(setSelect('Standard set').value).toBe('');
    expect(setSelect('Expert set').value).toBe('');

    await rerender({ view: viewOf({ ...noSets, modulars: [] }) });

    expect(setSelect('Standard set').value).toBe('');
    expect(setSelect('Expert set').value).toBe('');
  });

  it('keeps None when the host chooses another scenario', async () => {
    const { onconfigure } = renderPicker({ ...rhino, standard: '' });

    await fireEvent.click(screen.getByRole('button', { name: /Klaw/ }));

    expect(onconfigure).toHaveBeenCalledWith({
      ...rhino,
      scenario: 'klaw',
      standard: '',
      modulars: [],
    });
  });

  it('picks the default standard set for the first scenario', async () => {
    const noScenario: LobbyConfig = { ...rhino, scenario: '', standard: '', modulars: [] };
    const { onconfigure } = renderPicker(noScenario);

    await fireEvent.click(screen.getByRole('button', { name: /Rhino/ }));

    expect(onconfigure).toHaveBeenCalledWith(rhino);
  });

  it('picks the default expert set when the difficulty switches to Expert', async () => {
    const { onconfigure } = renderPicker(rhino);

    await fireEvent.click(screen.getByRole('button', { name: 'Expert' }));

    expect(onconfigure).toHaveBeenCalledWith({ ...rhino, difficulty: 'expert', expert: 'expert' });
  });
});

describe('ScenarioPicker recommended sets hint', () => {
  it('shows the hint to the host', () => {
    renderPicker(rhino);

    expect(screen.getByText(/recommended sets \(★\) are added for you/)).toBeTruthy();
  });

  it('hides every recommended sets hint from a guest', () => {
    const { container } = renderPicker(rhino, asGuest);

    expect(container.querySelector('.modulars .hint')).toBeNull();
    expect(screen.queryByText(/^Recommended:/)).toBeNull();
    expect(screen.getByText('Bomb Scare')).toBeTruthy();
  });
});
