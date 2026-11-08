import { fireEvent, render, screen, within } from '@testing-library/svelte';
import ScenarioPicker from './ScenarioPicker.svelte';
import type { Lang } from '../../lib/lang';
import type { Index, LobbyConfig, View, YouView } from '../../lib/types';
import type { Rect } from '../../lib/rect';
import { mockScreen, PHONE } from '../../lib/screen.testing';
import { mockVisualViewport } from '../../lib/visibleArea.testing';

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

/** The room the Add a set menu stays within: the whole window. */
function windowRoom(): Rect {
  return { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
}

function renderPicker(config: LobbyConfig, you: YouView = asHost) {
  const onconfigure = vi.fn();
  const result = render(ScenarioPicker, {
    view: viewOf(config, you),
    index,
    onconfigure,
    room: windowRoom,
  });
  return { onconfigure, ...result };
}

function setSelect(label: string): HTMLSelectElement {
  return screen.getByRole('combobox', { name: label }) as HTMLSelectElement;
}

describe('ScenarioPicker modular chips', () => {
  it('marks a recommended set with a named star and its tooltip, no native title', () => {
    renderPicker(rhino);

    const star = screen.getByRole('img', { name: 'Recommended for this scenario' });
    expect(star.textContent).toBe('★');
    expect(star.dataset.tip).toBe('Recommended for this scenario');
    expect(star.hasAttribute('title')).toBe(false);
  });
});

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
    return render(ScenarioPicker, {
      view: viewOf(config),
      index: french,
      onconfigure: vi.fn(),
      room: windowRoom,
    });
  }

  /** The host's list row of a scenario: the recap repeats the chosen one's name, as no button. */
  function row(name: string): HTMLElement | null {
    return screen.queryByRole('button', { name });
  }

  it('shows the pack, scenario and set names in French, else in English', () => {
    renderFrench(rhino);

    expect(row('Le Rhinocéros')).toBeTruthy();
    expect(row('Klaw')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Le Rhinocéros' })).toBeTruthy();
    expect(screen.getAllByText('Boîte de base')).toHaveLength(2);
    expect(screen.getByText('Alerte à la bombe')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove Alerte à la bombe' })).toBeTruthy();
    expect(screen.queryByText('Core Set')).toBeNull();
  });

  async function filterScenarios(query: string) {
    await fireEvent.input(screen.getByLabelText('Filter by scenario or pack'), {
      target: { value: query },
    });
  }

  it('filters on the French names', async () => {
    renderFrench(rhino);

    await filterScenarios('rhinocéros');

    expect(row('Le Rhinocéros')).toBeTruthy();
    expect(row('Klaw')).toBeNull();
  });

  it('finds a scenario whatever the case and accents', async () => {
    renderFrench(rhino);

    await filterScenarios('LE RHINOCEROS');

    expect(row('Le Rhinocéros')).toBeTruthy();
    expect(row('Klaw')).toBeNull();
  });

  it('finds a scenario by its English name, and by its pack name, shown or English', async () => {
    cardLang.current = 'fr';
    render(ScenarioPicker, {
      view: viewOf(rhino),
      index: {
        ...french,
        scenarios: french.scenarios.map((s) =>
          s.id === 'wrecking_crew' ? { ...s, localized: { fr: { name: 'Écraseurs' } } } : s,
        ),
      },
      onconfigure: vi.fn(),
      room: windowRoom,
    });

    await filterScenarios('ecraseurs');
    expect(row('Écraseurs')).toBeTruthy();
    expect(row('Le Rhinocéros')).toBeNull();

    await filterScenarios('wrecking');
    expect(row('Écraseurs')).toBeTruthy();
    expect(row('Le Rhinocéros')).toBeNull();

    for (const pack of ['core set', 'boite de base']) {
      await filterScenarios(pack);
      expect(row('Le Rhinocéros')).toBeTruthy();
      expect(row('Klaw')).toBeTruthy();
    }
  });

  describe('Add a set menu filter', () => {
    async function filterSets(query: string) {
      renderFrench({ ...rhino, modulars: [] });
      await fireEvent.click(screen.getByRole('button', { name: '+ Add a set' }));
      await fireEvent.input(screen.getByLabelText('Filter sets'), { target: { value: query } });
    }

    it.each(['alerte a la', 'ALERTE À', 'bomb scare', 'boite de'])(
      'finds the set by its French or English name, or its pack name, whatever the accents: %s',
      async (query) => {
        await filterSets(query);

        const core = screen.getByRole('group', { name: 'Boîte de base' });
        expect(within(core).getByRole('button', { name: /Alerte à la bombe/ })).toBeTruthy();
      },
    );

    it('leaves out a set whose names do not hold the filter', async () => {
      await filterSets('rhino');

      expect(screen.queryByRole('group', { name: 'Boîte de base' })).toBeNull();
      expect(screen.getByText('No matching set')).toBeTruthy();
    });
  });
});

describe('ScenarioPicker Add a set menu', () => {
  it('says so when every set is chosen already', async () => {
    renderPicker(rhino);

    await fireEvent.click(screen.getByRole('button', { name: '+ Add a set' }));

    expect(screen.getByText('No set to add')).toBeTruthy();
    expect(screen.queryByText('No matching set')).toBeNull();
  });

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

  it('Escape in its filter field closes it too, and takes the key', async () => {
    renderPicker({ ...rhino, modulars: [] });
    const add = screen.getByRole('button', { name: '+ Add a set' });
    await fireEvent.click(add);

    expect(await fireEvent.keyDown(screen.getByLabelText('Filter sets'), { key: 'Escape' })).toBe(
      false,
    );
    expect(add.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByLabelText('Filter sets')).toBeNull();
  });
});

describe('ScenarioPicker filter fields', () => {
  it('offer no saved entries and no spelling marks', async () => {
    renderPicker({ ...rhino, modulars: [] });
    await fireEvent.click(screen.getByRole('button', { name: '+ Add a set' }));

    for (const label of ['Filter by scenario or pack', 'Filter sets']) {
      const field = screen.getByLabelText(label);
      expect(field.getAttribute('autocomplete')).toBe('off');
      expect(field.getAttribute('spellcheck')).toBe('false');
      expect(field.hasAttribute('autosave')).toBe(false);
    }
  });
});

describe('ScenarioPicker Add a set menu placement', () => {
  // jsdom lays nothing out: the button and its wrapper sit 300 px down a window 800 px tall, and the
  // menu is 240 x 200 px. Under the button, it would end at 534 px.
  const WRAP_TOP = 300;

  beforeEach(() => {
    vi.stubGlobal('innerHeight', 800);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.classList.contains('menu')) {
        return new DOMRect(0, 0, 240, 200);
      }
      if (this.classList.contains('add-wrap') || this.classList.contains('add')) {
        return new DOMRect(100, WRAP_TOP, 120, 30);
      }
      return new DOMRect();
    });
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.classList.contains('menu') ? 200 : 0;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  /** The open menu's top and bottom edges, in the window's coordinates. */
  function menuEdges(container: HTMLElement): { top: number; bottom: number } {
    const menu = container.querySelector<HTMLElement>('.menu.placed');
    if (menu === null) {
      throw new Error('the menu is not placed');
    }
    const top = WRAP_TOP + Number.parseFloat(menu.style.top);
    return { top, bottom: top + Number.parseFloat(menu.style.height) };
  }

  it('opens within the part of the window the user sees, above the keyboard', async () => {
    mockVisualViewport({ height: 400 });
    const { container } = renderPicker({ ...rhino, modulars: [] });

    await fireEvent.click(screen.getByRole('button', { name: '+ Add a set' }));

    await vi.waitFor(() => expect(menuEdges(container).bottom).toBeLessThanOrEqual(400));
  });

  it('moves as the keyboard shows while it is open', async () => {
    const viewport = mockVisualViewport({ height: 800 });
    const { container } = renderPicker({ ...rhino, modulars: [] });
    await fireEvent.click(screen.getByRole('button', { name: '+ Add a set' }));
    await vi.waitFor(() => expect(menuEdges(container).top).toBeGreaterThan(WRAP_TOP));

    viewport.resize({ height: 400 });

    await vi.waitFor(() => expect(menuEdges(container).bottom).toBeLessThanOrEqual(400));
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
      room: windowRoom,
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

  describe('filter', () => {
    function field(): HTMLInputElement {
      return screen.getByLabelText('Filter sets');
    }

    async function filterSets(query: string) {
      await fireEvent.input(field(), { target: { value: query } });
    }

    it('keeps the sets whose name holds the filter, and only their packs', async () => {
      const { container } = await openMenu();

      await filterSets('  ATTACK ');

      expect(packNames(container)).toEqual(['Core Set']);
      expect(setLabels(screen.getByRole('group', { name: 'Core Set' }))).toEqual(['Under Attack']);
    });

    it("keeps all of a pack's sets when its name holds the filter", async () => {
      const { container } = await openMenu();

      await filterSets('green gob');

      expect(packNames(container)).toEqual(['Green Goblin']);
      expect(setLabels(screen.getByRole('group', { name: 'Green Goblin' }))).toEqual([
        'Goblin Gimmicks',
        'A Mess of Things',
      ]);
    });

    it('ignores the accents of the filter', async () => {
      const { container } = await openMenu();

      await filterSets('mèss òf');

      expect(packNames(container)).toEqual(['Green Goblin']);
      expect(setLabels(screen.getByRole('group', { name: 'Green Goblin' }))).toEqual([
        'A Mess of Things',
      ]);
    });

    it('says so when no set matches', async () => {
      const { container } = await openMenu();

      await filterSets('hydra');

      expect(packNames(container)).toEqual([]);
      expect(container.querySelector('.menu [role="group"]')).toBeNull();
      expect(screen.getByText('No matching set')).toBeTruthy();
    });

    it('shows everything again once emptied', async () => {
      const { container } = await openMenu();

      await filterSets('attack');
      await filterSets('');

      expect(packNames(container)).toEqual(['Core Set', 'Green Goblin']);
      expect(screen.queryByText('No matching set')).toBeNull();
    });

    // jsdom focuses a field it would not show: as a browser does, the field is only focused once
    // the menu shows (.placed), else it keeps out of view, unseen.
    const focus = HTMLElement.prototype.focus;

    beforeEach(() => {
      vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (
        this: HTMLElement,
        options?: FocusOptions,
      ) {
        const menu = this.closest('.menu');
        if (menu === null || menu.classList.contains('placed')) {
          focus.call(this, options);
        }
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });

    it('is focused and empty each time the menu opens', async () => {
      await openMenu();
      const add = screen.getByRole('button', { name: '+ Add a set' });
      await vi.waitFor(() => expect(document.activeElement).toBe(field()));

      await filterSets('attack');
      await fireEvent.click(add);
      await fireEvent.click(add);

      expect(field().value).toBe('');
      await vi.waitFor(() => expect(document.activeElement).toBe(field()));
      expect(screen.getByRole('group', { name: 'Green Goblin' })).toBeTruthy();
    });

    it('is not focused as the menu opens on a touch screen: the keyboard would cover the list', async () => {
      mockScreen(PHONE);
      const { container } = await openMenu();
      await vi.waitFor(() => expect(container.querySelector('.menu.placed')).not.toBeNull());
      // The desktop focuses it on the update after the menu shows: one more turn.
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(document.activeElement).not.toBe(field());
    });

    it('ArrowDown moves the focus to the first set shown', async () => {
      await openMenu();
      await filterSets('goblin');

      expect(await fireEvent.keyDown(field(), { key: 'ArrowDown' })).toBe(false);

      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Goblin Gimmicks' }));
    });

    it('Enter adds the only set the filter leaves, and closes the menu', async () => {
      const { onconfigure } = await openMenu();
      await filterSets('mess');

      await fireEvent.keyDown(field(), { key: 'Enter' });

      expect(onconfigure).toHaveBeenCalledWith({
        ...config,
        modulars: ['hydra_assault', 'a_mess_of_things'],
      });
      expect(
        screen.getByRole('button', { name: '+ Add a set' }).getAttribute('aria-expanded'),
      ).toBe('false');
    });

    it('Enter does nothing while several sets match', async () => {
      const { onconfigure } = await openMenu();
      await filterSets('goblin');

      await fireEvent.keyDown(field(), { key: 'Enter' });

      expect(onconfigure).not.toHaveBeenCalled();
      expect(
        screen.getByRole('button', { name: '+ Add a set' }).getAttribute('aria-expanded'),
      ).toBe('true');
    });
  });
});

describe('ScenarioPicker villain list', () => {
  // Two packs, scenarios listed out of pack order, one of them not supported yet.
  const listed: Index = {
    ...index,
    packs: [
      { code: 'core', name: 'Core Set', file: 'core.json', position: 1 },
      { code: 'gob', name: 'Green Goblin', file: 'gob.json', position: 2 },
      { code: 'spw', name: 'Spider-Woman', file: 'spw.json', position: 3 },
    ],
    scenarios: [
      {
        id: 'risky_business',
        name: 'Risky Business',
        pack: 'gob',
        image: '',
        supported: false,
        recommended: [],
      },
      ...index.scenarios,
      {
        id: 'mutagen_formula',
        name: 'Mutagen Formula',
        pack: 'gob',
        image: 'https://img.intothefray.xyz/mutagen.avif',
        supported: true,
        recommended: [],
      },
    ],
  };

  function renderList(config: LobbyConfig) {
    const onconfigure = vi.fn();
    const result = render(ScenarioPicker, {
      view: viewOf(config),
      index: listed,
      onconfigure,
      room: windowRoom,
    });
    return { onconfigure, ...result };
  }

  /** Each pack of the list, in the order shown, with its scenarios' names. */
  function packs(container: HTMLElement): { pack: string; scenarios: string[] }[] {
    return [...container.querySelectorAll<HTMLElement>('.vpack')].map((pack) => ({
      pack: pack.querySelector('.pk')?.textContent ?? '',
      scenarios: [...pack.querySelectorAll('.vn')].map((name) => name.textContent ?? ''),
    }));
  }

  it('shows the host every scenario under its pack, packs in release order, and the filter', () => {
    const { container } = renderList({ ...rhino, scenario: '' });

    expect(screen.getByLabelText('Filter by scenario or pack')).toBeTruthy();
    expect(packs(container)).toEqual([
      { pack: 'Core Set', scenarios: ['Rhino', 'Klaw', 'Wrecking Crew'] },
      { pack: 'Green Goblin', scenarios: ['Risky Business', 'Mutagen Formula'] },
    ]);
  });

  it("draws a scenario's art as its icon", () => {
    renderList({ ...rhino, scenario: '' });

    const row = screen.getByRole('button', { name: 'Mutagen Formula' });
    expect(row.querySelector('.ico img')?.getAttribute('src')).toBe(
      'https://img.intothefray.xyz/mutagen.avif',
    );
  });

  it('greys out an unsupported scenario: disabled, with its tooltip and a name that says so', async () => {
    const { onconfigure } = renderList({ ...rhino, scenario: '' });

    const row = screen.getByRole('button', { name: 'Risky Business Not supported yet' });
    expect(row.getAttribute('aria-disabled')).toBe('true');
    expect(row.dataset.tip).toBe('Not supported yet');
    expect(row.hasAttribute('title')).toBe(false);

    await fireEvent.click(row);

    expect(onconfigure).not.toHaveBeenCalled();
  });

  it('leaves a supported scenario enabled, without a tooltip', () => {
    renderList({ ...rhino, scenario: '' });

    const row = screen.getByRole('button', { name: 'Klaw' });
    expect(row.getAttribute('aria-disabled')).toBe('false');
    expect(row.hasAttribute('data-tip')).toBe(false);
  });

  it('marks the chosen scenario pressed, and it alone', () => {
    renderList(rhino);

    expect(screen.getByRole('button', { name: 'Rhino' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Klaw' }).getAttribute('aria-pressed')).toBe('false');
  });

  it("resets the modular sets to the new villain's recommendations", async () => {
    const klaw: LobbyConfig = { ...rhino, scenario: 'klaw', modulars: ['bomb_scare', 'other'] };
    const { onconfigure } = renderList(klaw);

    await fireEvent.click(screen.getByRole('button', { name: 'Rhino' }));

    expect(onconfigure).toHaveBeenCalledWith({
      ...klaw,
      scenario: 'rhino',
      modulars: ['bomb_scare'],
    });
  });

  it('says so when the filter leaves no scenario', async () => {
    const { container } = renderList(rhino);

    await fireEvent.input(screen.getByLabelText('Filter by scenario or pack'), {
      target: { value: 'nobody' },
    });

    expect(packs(container)).toEqual([]);
    expect(screen.getByText('No scenario matches.')).toBeTruthy();
  });

  it('shows every scenario, with no button, when the fold hides none', () => {
    renderList({ ...rhino, scenario: '' });

    expect(screen.queryByRole('button', { name: /^Show all villains/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Show fewer' })).toBeNull();
  });

  describe('folded', () => {
    // Packs of 10, 6 (one not supported), 3, 4 and 2 scenarios: the first two hold 16.
    const sizes = [10, 6, 3, 4, 2];
    const long: Index = {
      ...index,
      packs: sizes.map((_, i) => ({
        code: `p${i + 1}`,
        name: `Pack ${i + 1}`,
        file: `p${i + 1}.json`,
        position: i + 1,
      })),
      scenarios: sizes.flatMap((size, i) =>
        Array.from({ length: size }, (_, j) => ({
          id: `p${i + 1}_${j + 1}`,
          name: `Villain ${i + 1}.${j + 1}`,
          pack: `p${i + 1}`,
          image: '',
          supported: !(i === 1 && j === 0),
          recommended: [],
        })),
      ),
    };

    function renderLong(scenario = '') {
      return render(ScenarioPicker, {
        view: viewOf({ ...rhino, scenario, modulars: [] }),
        index: long,
        onconfigure: vi.fn(),
        room: windowRoom,
      });
    }

    function shownPacks(container: HTMLElement): string[] {
      return packs(container).map((pack) => pack.pack);
    }

    function showAll(): HTMLElement {
      return screen.getByRole('button', { name: /^Show all villains/ });
    }

    describe('in motion', () => {
      mockAnimations();

      it('fades in the packs Show all villains brings', async () => {
        const { container } = renderLong();

        await fireEvent.click(showAll());

        const revealed = [...container.querySelectorAll('.vpack')].slice(2);
        expect(revealed).toHaveLength(3);
        await vi.waitFor(() => expect(animated(200)).toEqual(revealed));
      });

      it('shows the packs a filter brings at once', async () => {
        const { container } = renderLong();

        await fireEvent.input(screen.getByLabelText('Filter by scenario or pack'), {
          target: { value: 'Villain 4' },
        });
        await settle();

        expect(shownPacks(container)).toEqual(['Pack 4']);
        expect(animate).not.toHaveBeenCalled();
      });
    });

    it('shows whole packs in release order until 16 scenarios, unsupported ones counted', () => {
      const { container } = renderLong();

      expect(packs(container)).toEqual([
        { pack: 'Pack 1', scenarios: Array.from({ length: 10 }, (_, j) => `Villain 1.${j + 1}`) },
        { pack: 'Pack 2', scenarios: Array.from({ length: 6 }, (_, j) => `Villain 2.${j + 1}`) },
      ]);
    });

    it('never cuts a pack that crosses the threshold', () => {
      const { container } = render(ScenarioPicker, {
        view: viewOf({ ...rhino, scenario: '', modulars: [] }),
        index: { ...long, scenarios: long.scenarios.filter((s) => s.id !== 'p2_6') },
        onconfigure: vi.fn(),
        room: windowRoom,
      });

      expect(shownPacks(container)).toEqual(['Pack 1', 'Pack 2', 'Pack 3']);
      expect(packs(container)[2]?.scenarios).toHaveLength(3);
    });

    it("adds the chosen scenario's pack in release order, and leaves it out of the count", () => {
      const { container } = renderLong('p4_2');

      expect(shownPacks(container)).toEqual(['Pack 1', 'Pack 2', 'Pack 4']);
      expect(showAll().textContent).toBe('Show all villains (5 more)');
    });

    it('offers a button that tells how many scenarios it shows, and controls the list', () => {
      const { container } = renderLong();

      const button = showAll();
      expect(button.textContent).toBe('Show all villains (9 more)');
      expect(button.getAttribute('aria-expanded')).toBe('false');
      const list = container.querySelector('.vlist');
      expect(list?.id).toBeTruthy();
      expect(button.getAttribute('aria-controls')).toBe(list?.id);
    });

    it('unfolds for good: every pack shows, the button goes, the focus moves to the first new row', async () => {
      const { container } = renderLong();

      showAll().focus();
      await fireEvent.click(showAll());

      expect(shownPacks(container)).toEqual(['Pack 1', 'Pack 2', 'Pack 3', 'Pack 4', 'Pack 5']);
      expect(screen.queryByRole('button', { name: /^Show all villains/ })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Show fewer' })).toBeNull();
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Villain 3.1' }));
    });

    it('stays unfolded once the filter is emptied again', async () => {
      const { container } = renderLong();
      await fireEvent.click(showAll());
      const field = screen.getByLabelText('Filter by scenario or pack');

      await fireEvent.input(field, { target: { value: 'Pack 5' } });
      await fireEvent.input(field, { target: { value: '' } });

      expect(shownPacks(container)).toHaveLength(5);
      expect(screen.queryByRole('button', { name: /^Show all villains/ })).toBeNull();
    });

    it('searches every pack while the filter holds a query, without the button', async () => {
      const { container } = renderLong();
      const field = screen.getByLabelText('Filter by scenario or pack');

      await fireEvent.input(field, { target: { value: 'Villain 5.' } });

      expect(packs(container)).toEqual([
        { pack: 'Pack 5', scenarios: ['Villain 5.1', 'Villain 5.2'] },
      ]);
      expect(screen.queryByRole('button', { name: /^Show all villains/ })).toBeNull();

      await fireEvent.input(field, { target: { value: '' } });

      expect(shownPacks(container)).toEqual(['Pack 1', 'Pack 2']);
      expect(showAll().textContent).toBe('Show all villains (9 more)');
    });
  });
});

// jsdom has no Web Animations: each animation finishes on the next task.
const animate = vi.fn(() => {
  const animation = { onfinish: null as (() => void) | null, cancel: () => {}, effect: null };
  setTimeout(() => animation.onfinish?.());
  return animation as unknown as Animation;
});

/** Plays every animation of the calling describe's tests through the animate mock. */
function mockAnimations(): void {
  const originalAnimate = Element.prototype.animate;

  beforeEach(() => {
    Element.prototype.animate = animate;
  });

  afterEach(() => {
    Element.prototype.animate = originalAnimate;
    animate.mockClear();
    motion.reduced = false;
  });
}

/** Whether a 250 ms slide played. Svelte starts an intro a microtask after the DOM update. */
function slid(): boolean {
  return animate.mock.calls.some((call: unknown[]) => {
    const options = call[1] as KeyframeAnimationOptions | undefined;
    return options?.duration === 250;
  });
}

/** Lets every pending intro start, so that one that did not shows as such. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve));
}

/** The elements that played an animation of the given length, in the order they started. */
function animated(duration: number): Element[] {
  return animate.mock.calls.flatMap((call: unknown[], i) => {
    const options = call[1] as KeyframeAnimationOptions | undefined;
    return options?.duration === duration ? [animate.mock.contexts[i] as Element] : [];
  });
}

describe('ScenarioPicker set chips in motion', () => {
  mockAnimations();

  function chip(name: string): Element {
    return screen.getByText(name, { selector: '.chip' });
  }

  it('pops a set in as the host adds it, and only that one', async () => {
    const { rerender } = renderPicker(rhino);

    await rerender({ view: viewOf({ ...rhino, modulars: ['bomb_scare', 'ambush'] }) });

    await vi.waitFor(() => expect(animated(200)).toEqual([chip('ambush')]));
  });

  it('pops a set out as the host removes it', async () => {
    const { rerender } = renderPicker({ ...rhino, modulars: ['bomb_scare', 'ambush'] });
    const leaving = chip('ambush');

    await rerender({ view: viewOf(rhino) });

    await vi.waitFor(() => expect(animated(200)).toEqual([leaving]));
  });

  it('adds and removes sets at once under reduced motion', async () => {
    motion.reduced = true;
    const { rerender } = renderPicker(rhino);

    await rerender({ view: viewOf({ ...rhino, modulars: ['ambush'] }) });
    await settle();

    expect(screen.queryByText('Bomb Scare')).toBeNull();
    expect(chip('ambush')).toBeTruthy();
    expect(animate).not.toHaveBeenCalled();
  });
});

describe('ScenarioPicker recap', () => {
  const noScenario: LobbyConfig = { ...rhino, scenario: '', standard: '', modulars: [] };

  mockAnimations();

  it('does not exist before a first choice, with no placeholder', () => {
    renderPicker(noScenario);

    expect(screen.getByRole('button', { name: 'Rhino' })).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 3 })).toBeNull();
    expect(screen.queryByText('Difficulty')).toBeNull();
    expect(screen.queryByText('Modular sets')).toBeNull();
  });

  it('slides open once a first scenario is chosen, with its name, pack and settings', async () => {
    const { rerender } = renderPicker(noScenario);

    await rerender({ view: viewOf(rhino) });

    expect(screen.getByRole('heading', { level: 3, name: 'Rhino' })).toBeTruthy();
    expect(screen.getAllByText('Core Set')).toHaveLength(2);
    expect(screen.getByRole('group', { name: 'Difficulty' })).toBeTruthy();
    expect(screen.getByText('Modular sets')).toBeTruthy();
    await vi.waitFor(() => expect(slid()).toBe(true));
  });

  it('stays open, without sliding again, when the host chooses another scenario', async () => {
    const { rerender } = renderPicker(rhino);

    await rerender({ view: viewOf({ ...rhino, scenario: 'klaw', modulars: [] }) });
    await settle();

    expect(screen.getByRole('heading', { level: 3, name: 'Klaw' })).toBeTruthy();
    expect(slid()).toBe(false);
  });

  it('opens at once under reduced motion', async () => {
    motion.reduced = true;
    const { rerender } = renderPicker(noScenario);

    await rerender({ view: viewOf(rhino) });
    await settle();

    expect(screen.getByText('Modular sets')).toBeTruthy();
    expect(animate).not.toHaveBeenCalled();
  });
});

describe('ScenarioPicker for a guest', () => {
  const noScenario: LobbyConfig = { ...rhino, scenario: '', standard: '', modulars: [] };

  mockAnimations();

  it('renders nothing while the host has not chosen', () => {
    const { container } = renderPicker(noScenario, asGuest);

    expect(container.querySelector('section')).toBeNull();
    expect(container.textContent?.trim()).toBe('');
  });

  it('slides the Scenario box in once the host has chosen', async () => {
    const { rerender } = renderPicker(noScenario, asGuest);

    await rerender({ view: viewOf(rhino, asGuest) });

    expect(screen.getByRole('heading', { level: 2, name: 'Scenario' })).toBeTruthy();
    expect(screen.getByText('chosen by Alex (host)')).toBeTruthy();
    await vi.waitFor(() => expect(slid()).toBe(true));
  });

  it('shows a scenario chosen before the guest came at once, without the slide', async () => {
    renderPicker(rhino, asGuest);
    await settle();

    expect(screen.getByRole('heading', { level: 3, name: 'Rhino' })).toBeTruthy();
    expect(animate).not.toHaveBeenCalled();
  });

  it('shows the recap read only: the difficulty as a chip, the sets without remove buttons', () => {
    renderPicker({ ...rhino, difficulty: 'expert', expert: 'expert' }, asGuest);

    const level = screen.getByText('Expert');
    expect(level.classList.contains('chip')).toBe(true);
    expect(screen.queryByRole('group', { name: 'Difficulty' })).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByText('Bomb Scare')).toBeTruthy();
    // No list, no filter, no remove or Add a set button.
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByLabelText('Filter by scenario or pack')).toBeNull();
  });

  it('says None when no modular set is chosen', () => {
    renderPicker({ ...rhino, modulars: [] }, asGuest);

    expect(screen.getByText('None')).toBeTruthy();
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

describe('ScenarioPicker required sets', () => {
  // Taskmaster's rules add Hydra Patrol to its villain set: it is no modular set to pick.
  const trors: Index = {
    ...index,
    scenarios: [
      ...index.scenarios,
      {
        id: 'taskmaster',
        name: 'Taskmaster',
        pack: 'core',
        image: '',
        supported: true,
        recommended: ['bomb_scare'],
        sets: ['hydra_patrol'],
      },
    ],
    sets: [
      ...index.sets,
      { code: 'hydra_patrol', name: 'Hydra Patrol', pack: 'core', kind: 'modular' },
      { code: 'under_attack', name: 'Under Attack', pack: 'core', kind: 'modular' },
    ],
  };

  async function menuLabels(config: LobbyConfig): Promise<string[]> {
    render(ScenarioPicker, {
      view: viewOf(config),
      index: trors,
      onconfigure: vi.fn(),
      room: windowRoom,
    });
    await fireEvent.click(screen.getByRole('button', { name: '+ Add a set' }));
    return within(screen.getByRole('group', { name: 'Core Set' }))
      .getAllByRole('button')
      .map((button) => (button.textContent ?? '').replace(/\s+/g, ' ').trim());
  }

  it("does not offer the scenario's required sets", async () => {
    expect(await menuLabels({ ...rhino, scenario: 'taskmaster', modulars: [] })).toEqual([
      'Bomb Scare ★ recommended',
      'Under Attack',
    ]);
  });

  it('offers them for another scenario', async () => {
    expect(await menuLabels({ ...rhino, modulars: [] })).toEqual([
      'Bomb Scare ★ recommended',
      'Hydra Patrol',
      'Under Attack',
    ]);
  });
});

describe('ScenarioPicker set-aside sets', () => {
  // Escape the Museum sets the Ship Command set aside whole: the index lists it with the
  // scenario's sets, and picking it as a modular set would put its cards in the game twice.
  const gmw: Index = {
    ...index,
    scenarios: [
      ...index.scenarios,
      {
        id: 'escape_the_museum',
        name: 'Escape the Museum',
        pack: 'core',
        image: '',
        supported: true,
        recommended: ['bomb_scare'],
        sets: ['galactic_artifacts', 'ship_command'],
      },
    ],
    sets: [
      ...index.sets,
      { code: 'galactic_artifacts', name: 'Galactic Artifacts', pack: 'core', kind: 'modular' },
      { code: 'ship_command', name: 'Ship Command', pack: 'core', kind: 'modular' },
    ],
  };

  async function menuLabels(config: LobbyConfig): Promise<string[]> {
    render(ScenarioPicker, {
      view: viewOf(config),
      index: gmw,
      onconfigure: vi.fn(),
      room: windowRoom,
    });
    await fireEvent.click(screen.getByRole('button', { name: '+ Add a set' }));
    return within(screen.getByRole('group', { name: 'Core Set' }))
      .getAllByRole('button')
      .map((button) => (button.textContent ?? '').replace(/\s+/g, ' ').trim());
  }

  it('does not offer a set the scenario sets aside', async () => {
    expect(await menuLabels({ ...rhino, scenario: 'escape_the_museum', modulars: [] })).toEqual([
      'Bomb Scare ★ recommended',
    ]);
  });

  it('offers it for another scenario', async () => {
    expect(await menuLabels({ ...rhino, modulars: [] })).toEqual([
      'Bomb Scare ★ recommended',
      'Galactic Artifacts',
      'Ship Command',
    ]);
  });
});

describe('ScenarioPicker main scheme sets', () => {
  // An Underling is played with one of its main scheme sets; Civil War's scheme set belongs to no
  // scenario of this index.
  const fne: Index = {
    ...index,
    packs: [
      { code: 'core', name: 'Core Set', file: 'core.json', position: 1 },
      { code: 'fne', name: 'Fear No Evil', file: 'fne.json', position: 2 },
    ],
    scenarios: [
      ...index.scenarios,
      {
        id: 'bullseye',
        name: 'Bullseye',
        pack: 'fne',
        image: '',
        supported: true,
        recommended: [],
        mainSchemes: ['art_museum_heist', 'the_getaway'],
      },
      {
        id: 'kingpin',
        name: 'Kingpin',
        pack: 'core',
        image: '',
        supported: true,
        recommended: ['bomb_scare'],
      },
    ],
    sets: [
      ...index.sets,
      { code: 'cops', name: 'Cops', pack: 'fne', kind: 'modular' },
      {
        code: 'art_museum_heist',
        name: 'Art Museum Heist',
        pack: 'fne',
        kind: 'main_scheme',
        recommended: ['cops', 'bomb_scare'],
      },
      {
        code: 'the_getaway',
        name: 'The Getaway',
        pack: 'fne',
        kind: 'main_scheme',
        recommended: ['cops'],
      },
      {
        code: 'civil_war',
        name: 'Civil War',
        pack: 'fne',
        kind: 'main_scheme',
        recommended: [],
      },
    ],
  };
  const bullseye: LobbyConfig = { ...rhino, scenario: 'bullseye', modulars: [] };

  function renderFne(config: LobbyConfig, you: YouView = asHost) {
    const onconfigure = vi.fn();
    const result = render(ScenarioPicker, {
      view: viewOf(config, you),
      index: fne,
      onconfigure,
      room: windowRoom,
    });
    return { onconfigure, ...result };
  }

  async function openMenu() {
    await fireEvent.click(screen.getByRole('button', { name: '+ Add a set' }));
  }

  function menuLabels(pack: string): string[] {
    return within(screen.getByRole('group', { name: pack }))
      .getAllByRole('button')
      .map((button) => (button.textContent ?? '').replace(/\s+/g, ' ').trim());
  }

  it("offers the scenario's main scheme sets in their pack, in index order, never another", async () => {
    renderFne(bullseye);
    await openMenu();

    expect(menuLabels('Fear No Evil')).toEqual([
      'Cops',
      'Art Museum Heist main scheme',
      'The Getaway main scheme',
    ]);
  });

  it('offers no other main scheme set once one is chosen, and stars its recommended sets', async () => {
    renderFne({ ...bullseye, modulars: ['art_museum_heist'] });
    await openMenu();

    expect(menuLabels('Fear No Evil')).toEqual(['Cops ★ recommended']);
  });

  it('offers no main scheme set for a scenario without any', async () => {
    renderFne(rhino);
    await openMenu();

    expect(menuLabels('Fear No Evil')).toEqual(['Cops']);
  });

  it('adds a main scheme set, then its recommended sets not chosen yet', async () => {
    const { onconfigure } = renderFne({ ...bullseye, modulars: ['bomb_scare'] });
    await openMenu();

    await fireEvent.click(screen.getByRole('button', { name: /Art Museum Heist/ }));

    expect(onconfigure).toHaveBeenCalledWith({
      ...bullseye,
      modulars: ['bomb_scare', 'art_museum_heist', 'cops'],
    });
  });

  it('marks a chosen main scheme chip, and removes it alone', async () => {
    const { onconfigure, container } = renderFne({
      ...bullseye,
      modulars: ['art_museum_heist', 'cops', 'bomb_scare'],
    });

    const chips = [...container.querySelectorAll('.chip')];
    expect(chips.map((chip) => chip.querySelector('.scheme') !== null)).toEqual([
      true,
      false,
      false,
    ]);

    await fireEvent.click(screen.getByRole('button', { name: 'Remove Art Museum Heist' }));

    expect(onconfigure).toHaveBeenCalledWith({ ...bullseye, modulars: ['cops', 'bomb_scare'] });
  });

  it('asks for a main scheme set in the hint until one is chosen', async () => {
    const { rerender } = renderFne(bullseye);

    expect(screen.getByText('Add a main scheme set: it sets the scenario.')).toBeTruthy();

    await rerender({ view: viewOf({ ...bullseye, modulars: ['the_getaway'] }) });

    expect(screen.queryByText('Add a main scheme set: it sets the scenario.')).toBeNull();
    expect(screen.getByText(/recommended sets \(★\) are added for you/)).toBeTruthy();
  });

  it('drops the main scheme set for another villain, and asks for one again back on an Underling', async () => {
    const withScheme: LobbyConfig = { ...bullseye, modulars: ['art_museum_heist', 'cops'] };
    const { onconfigure, rerender } = renderFne(withScheme);

    await fireEvent.click(screen.getByRole('button', { name: /Kingpin/ }));

    const kingpin: LobbyConfig = { ...withScheme, scenario: 'kingpin', modulars: ['bomb_scare'] };
    expect(onconfigure).toHaveBeenLastCalledWith(kingpin);

    await rerender({ view: viewOf(kingpin) });
    await fireEvent.click(screen.getByRole('button', { name: /Bullseye/ }));

    expect(onconfigure).toHaveBeenLastCalledWith({
      ...kingpin,
      scenario: 'bullseye',
      modulars: [],
    });

    await rerender({ view: viewOf({ ...kingpin, scenario: 'bullseye', modulars: [] }) });

    expect(screen.getByText('Add a main scheme set: it sets the scenario.')).toBeTruthy();
  });
});
