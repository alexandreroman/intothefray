import { fireEvent, render, screen, within } from '@testing-library/svelte';
import ScenarioPicker from './ScenarioPicker.svelte';
import type { Lang } from '../../lib/lang';
import type { Index, LobbyConfig, View, YouView } from '../../lib/types';

// The card language, as each test chooses: Options does not offer French, so no stored choice gives it.
const cardLang = vi.hoisted(() => ({ current: 'en' as Lang }));

vi.mock('../../lib/lang', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/lang')>()),
  storedLang: () => cardLang.current,
}));

// Whether the viewer prefers reduced motion, as each test chooses.
const motion = vi.hoisted(() => ({ reduced: false }));

vi.mock('svelte/motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('svelte/motion')>()),
  prefersReducedMotion: {
    get current() {
      return motion.reduced;
    },
  },
}));

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
    {
      id: 'wrecking_crew',
      name: 'Wrecking Crew',
      pack: 'core',
      image: '',
      supported: true,
      recommended: [],
      selfContained: true,
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
    players: [{ name: 'Alex', color: 0, host: true, ready: false, online: true, decks: [] }],
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

describe('ScenarioPicker in French', () => {
  const french: Index = {
    ...index,
    packs: index.packs.map((p) => ({ ...p, localized: { fr: { name: 'Boîte de base' } } })),
    scenarios: index.scenarios.map((s) =>
      s.id === 'rhino' ? { ...s, localized: { fr: { name: 'Le Rhinocéros' } } } : s,
    ),
    sets: index.sets.map((s) =>
      s.code === 'bomb_scare' ? { ...s, localized: { fr: { name: 'Alerte à la bombe' } } } : s,
    ),
  };

  afterEach(() => {
    cardLang.current = 'en';
  });

  function renderFrench(config: LobbyConfig) {
    cardLang.current = 'fr';
    return render(ScenarioPicker, { view: viewOf(config), index: french, onconfigure: vi.fn() });
  }

  it('shows the pack, scenario and set names in French, else in English', () => {
    renderFrench(rhino);

    expect(screen.getByText('Boîte de base')).toBeTruthy();
    expect(screen.getByText('Le Rhinocéros')).toBeTruthy();
    expect(screen.getByText('Klaw')).toBeTruthy();
    expect(screen.getByText('Alerte à la bombe')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove Alerte à la bombe' })).toBeTruthy();
    expect(screen.queryByText('Core Set')).toBeNull();
  });

  it('filters on the French names', async () => {
    renderFrench(rhino);

    await fireEvent.input(screen.getByLabelText('Filter by scenario or pack'), {
      target: { value: 'rhinocéros' },
    });

    expect(screen.getByText('Le Rhinocéros')).toBeTruthy();
    expect(screen.queryByText('Klaw')).toBeNull();
  });
});

describe('ScenarioPicker Add a set menu', () => {
  it('Escape closes it and takes the key (preventDefault); closed, it leaves the key alone', async () => {
    renderPicker(rhino);
    const add = screen.getByRole('button', { name: '+ Add a set' });
    await fireEvent.click(add);
    expect(add.getAttribute('aria-expanded')).toBe('true');

    // fireEvent reports false for a prevented event.
    expect(await fireEvent.keyDown(window, { key: 'Escape' })).toBe(false);
    expect(add.getAttribute('aria-expanded')).toBe('false');
    expect(await fireEvent.keyDown(window, { key: 'Escape' })).toBe(true);
  });
});

describe('ScenarioPicker Add a set menu groups', () => {
  // Several packs, sets listed out of pack order: the menu follows the packs, then the sets' own order.
  const packed: Index = {
    ...index,
    packs: [
      { code: 'core', name: 'Core Set', file: 'core.json', position: 1 },
      { code: 'gob', name: 'Green Goblin', file: 'gob.json', position: 2 },
      { code: 'spw', name: 'Spider-Woman', file: 'spw.json', position: 3 },
      { code: 'rrs', name: 'The Rise of Red Skull', file: 'rrs.json', position: 4 },
    ],
    scenarios: [
      {
        id: 'rhino',
        name: 'Rhino',
        pack: 'core',
        image: '',
        supported: true,
        recommended: ['masters_of_evil'],
      },
    ],
    sets: [
      { code: 'standard', name: 'Standard', pack: 'core', kind: 'standard' },
      { code: 'goblin_gimmicks', name: 'Goblin Gimmicks', pack: 'gob', kind: 'modular' },
      { code: 'under_attack', name: 'Under Attack', pack: 'core', kind: 'modular' },
      { code: 'hydra_assault', name: 'Hydra Assault', pack: 'rrs', kind: 'modular' },
      { code: 'bomb_scare', name: 'Bomb Scare', pack: 'core', kind: 'modular' },
      { code: 'a_mess_of_things', name: 'A Mess of Things', pack: 'gob', kind: 'modular' },
      { code: 'masters_of_evil', name: 'Masters of Evil', pack: 'core', kind: 'modular' },
    ],
  };
  // The host removed the recommended set and added the Red Skull pack's only one.
  const config: LobbyConfig = { ...rhino, modulars: ['hydra_assault'] };

  async function openMenu() {
    const onconfigure = vi.fn();
    const { container } = render(ScenarioPicker, {
      view: viewOf(config),
      index: packed,
      onconfigure,
    });
    await fireEvent.click(screen.getByRole('button', { name: '+ Add a set' }));
    return { onconfigure, container };
  }

  /** The pack names heading the menu's groups, in the order they show. */
  function packNames(container: HTMLElement): string[] {
    return [...container.querySelectorAll('.menu .mpk')].map(
      (heading) => heading.textContent ?? '',
    );
  }

  function setLabels(group: HTMLElement): string[] {
    return within(group)
      .getAllByRole('button')
      .map((button) => (button.textContent ?? '').replace(/\s+/g, ' ').trim());
  }

  it('groups the sets under their pack names, packs in release order, sets in index order', async () => {
    const { container } = await openMenu();

    expect(packNames(container)).toEqual(['Core Set', 'Green Goblin']);
    expect(setLabels(screen.getByRole('group', { name: 'Core Set' }))).toEqual([
      'Under Attack',
      'Bomb Scare',
      'Masters of Evil ★ recommended',
    ]);
    expect(setLabels(screen.getByRole('group', { name: 'Green Goblin' }))).toEqual([
      'Goblin Gimmicks',
      'A Mess of Things',
    ]);
  });

  it('marks a recommended set in its own pack, not on top of the menu', async () => {
    await openMenu();

    const core = screen.getByRole('group', { name: 'Core Set' });
    const recommended = within(core).getByRole('button', { name: /Masters of Evil/ });
    expect(within(recommended).getByText('★ recommended')).toBeTruthy();
    expect(screen.queryByRole('group', { name: /recommended/i })).toBeNull();
  });

  it('shows no group for a pack whose sets are all chosen, nor for a pack without any', async () => {
    await openMenu();

    expect(screen.queryByRole('group', { name: 'The Rise of Red Skull' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Spider-Woman' })).toBeNull();
  });

  it('adds the set the host clicks after the chosen ones', async () => {
    const { onconfigure } = await openMenu();

    const goblin = screen.getByRole('group', { name: 'Green Goblin' });
    await fireEvent.click(within(goblin).getByRole('button', { name: 'A Mess of Things' }));

    expect(onconfigure).toHaveBeenCalledWith({
      ...config,
      modulars: ['hydra_assault', 'a_mess_of_things'],
    });
  });
});

describe('ScenarioPicker settings', () => {
  const noScenario: LobbyConfig = { ...rhino, scenario: '', standard: '', modulars: [] };

  // jsdom has neither Web Animations nor scrolling: each animation finishes on the next task.
  const animate = vi.fn(() => {
    const animation = { onfinish: null as (() => void) | null, cancel: () => {}, effect: null };
    setTimeout(() => animation.onfinish?.());
    return animation as unknown as Animation;
  });
  const scrollIntoView = vi.fn();
  const originals = {
    animate: Element.prototype.animate,
    scrollIntoView: Element.prototype.scrollIntoView,
  };

  beforeEach(() => {
    Element.prototype.animate = animate;
    Element.prototype.scrollIntoView = scrollIntoView;
  });

  afterEach(() => {
    Element.prototype.animate = originals.animate;
    Element.prototype.scrollIntoView = originals.scrollIntoView;
    animate.mockClear();
    scrollIntoView.mockClear();
    motion.reduced = false;
  });

  it('slide open once a first scenario is chosen, then bring the chosen villain into view', async () => {
    const { rerender } = renderPicker(noScenario);
    expect(screen.queryByText('Modular sets')).toBeNull();

    await rerender({ view: viewOf(rhino) });

    expect(screen.getByText('Modular sets')).toBeTruthy();
    await vi.waitFor(() => expect(scrollIntoView).toHaveBeenCalledOnce());
    expect(animate).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ duration: 250 }),
    );
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', behavior: 'smooth' });
    expect(scrollIntoView.mock.contexts[0]).toBe(screen.getByRole('button', { name: /Rhino/ }));
  });

  it('stay open, without sliding again, when the host chooses another scenario', async () => {
    const { rerender } = renderPicker(rhino);

    await rerender({ view: viewOf({ ...rhino, scenario: 'klaw', modulars: [] }) });
    await new Promise((resolve) => setTimeout(resolve));

    expect(screen.getByText('Modular sets')).toBeTruthy();
    expect(animate).not.toHaveBeenCalled();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('open at once, and bring the villain into view at once, under reduced motion', async () => {
    motion.reduced = true;
    const { rerender } = renderPicker(noScenario);

    await rerender({ view: viewOf(rhino) });

    expect(screen.getByText('Modular sets')).toBeTruthy();
    expect(animate).not.toHaveBeenCalled();
    expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith({
      block: 'nearest',
      behavior: 'instant',
    });
  });

  it("leave a guest's list and page where they are", async () => {
    motion.reduced = true;
    const { rerender } = renderPicker(noScenario, asGuest);

    await rerender({ view: viewOf(rhino, asGuest) });

    expect(screen.getByText('Modular sets')).toBeTruthy();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});

describe('ScenarioPicker self-contained scenario', () => {
  const crew: LobbyConfig = { ...rhino, scenario: 'wrecking_crew', modulars: [] };

  it('self-contained scenario hides set pickers and shows "This scenario uses only its own cards."', () => {
    renderPicker({ ...crew, difficulty: 'expert', expert: 'expert' });

    expect(screen.getByText('This scenario uses only its own cards.')).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: 'Standard set' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Expert set' })).toBeNull();
    expect(screen.queryByText('Modular sets')).toBeNull();
    expect(screen.queryByText('+ Add a set')).toBeNull();
    expect(screen.getByRole('button', { name: 'Expert' })).toBeTruthy();
  });

  it('configures a self-contained scenario with no modular, standard or expert set', async () => {
    const { onconfigure } = renderPicker({ ...rhino, difficulty: 'expert', expert: 'expert' });

    await fireEvent.click(screen.getByRole('button', { name: /Wrecking Crew/ }));

    expect(onconfigure).toHaveBeenCalledWith({
      scenario: 'wrecking_crew',
      difficulty: 'expert',
      standard: '',
      expert: '',
      modulars: [],
    });
  });
});
