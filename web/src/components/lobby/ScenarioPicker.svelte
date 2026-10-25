<script lang="ts">
  import { cubicOut } from 'svelte/easing';
  import { prefersReducedMotion } from 'svelte/motion';
  import { slide } from 'svelte/transition';
  import { storedLang } from '../../lib/lang';
  import { localizedName } from '../../lib/localize';
  import { overflowTip } from '../../lib/overflowTip';
  import { scrollFade } from '../../lib/scrollFade';
  import CardArt from '../CardArt.svelte';
  import Icon from '../Icon.svelte';
  import Segmented from '../Segmented.svelte';
  import {
    hostName,
    type Difficulty,
    type Index,
    type LobbyConfig,
    type ScenarioRef,
    type View,
  } from '../../lib/types';

  let {
    view,
    index,
    onconfigure,
  }: { view: View; index: Index; onconfigure: (config: LobbyConfig) => void } = $props();

  // Version I of each set, the default (spec 4.3).
  const DEFAULT_STANDARD = 'standard';
  const DEFAULT_EXPERT = 'expert';
  const LEVELS: { value: Difficulty; label: string }[] = [
    { value: 'standard', label: 'Standard' },
    { value: 'expert', label: 'Expert' },
  ];
  const SETTINGS_SLIDE_MS = 250;

  // Pack, scenario and set names in the language chosen in Options, a separate route: read once.
  const lang = storedLang();

  let filter = $state('');
  let menuOpen = $state(false);

  const isHost = $derived(view.you.host);
  const config = $derived(view.config);
  const chosen = $derived(index.scenarios.find((s) => s.id === config.scenario));
  const difficulty = $derived<Difficulty>(config.difficulty === 'expert' ? 'expert' : 'standard');
  // An empty set means none, as some scenarios allow. The defaults only fill in a config that
  // has no scenario yet, or no expert set because the difficulty is Standard.
  const standardSet = $derived(config.scenario === '' ? DEFAULT_STANDARD : config.standard);
  const expertSet = $derived(
    config.scenario === '' || difficulty !== 'expert' ? DEFAULT_EXPERT : config.expert,
  );

  const packNames = $derived(new Map(index.packs.map((p) => [p.code, localizedName(p, lang)])));
  const setNames = $derived(new Map(index.sets.map((s) => [s.code, localizedName(s, lang)])));
  const standardSets = $derived(index.sets.filter((s) => s.kind === 'standard'));
  const expertSets = $derived(index.sets.filter((s) => s.kind === 'expert'));
  // "None" is always a choice, so even a single set gets a dropdown.
  // A self-contained scenario uses only its own cards: no modular, Standard or Expert set.
  const selfContained = $derived(chosen?.selfContained === true);
  const showStandardSet = $derived(isHost && !selfContained && standardSets.length > 0);
  const showExpertSet = $derived(
    isHost && !selfContained && difficulty === 'expert' && expertSets.length > 0,
  );
  const recommended = $derived(chosen?.recommended ?? []);
  // Guests see the chosen level only, read only.
  const levels = $derived(isHost ? LEVELS : LEVELS.filter((level) => level.value === difficulty));

  // Recommended sets come first: the full list is long.
  const addableModulars = $derived(
    index.sets
      .filter((s) => s.kind === 'modular' && !config.modulars.includes(s.code))
      .sort((a, b) => Number(recommended.includes(b.code)) - Number(recommended.includes(a.code))),
  );

  function packName(code: string): string {
    return packNames.get(code) ?? code;
  }

  function setName(code: string): string {
    return setNames.get(code) ?? code;
  }

  function matchesFilter(scenario: ScenarioRef): boolean {
    const query = filter.trim().toLowerCase();
    if (query === '') {
      return true;
    }
    return (
      localizedName(scenario, lang).toLowerCase().includes(query) ||
      packName(scenario.pack).toLowerCase().includes(query)
    );
  }

  // Guests only see the chosen scenario.
  const groups = $derived(
    index.packs
      .map((pack) => ({
        pack,
        scenarios: index.scenarios.filter(
          (s) => s.pack === pack.code && (isHost ? matchesFilter(s) : s.id === config.scenario),
        ),
      }))
      .filter((group) => group.scenarios.length > 0),
  );

  // The host's list never gets shorter than the first pack's name and a few rows of tiles (see
  // .villains in the styles): both heights are measured here.
  let villains = $state<HTMLElement>();
  let listSizes = $state<{ packName: number; tile: number } | null>(null);

  /** The heights of the list's first pack name and first tile, null while nothing is laid out. */
  function measureList(list: HTMLElement): { packName: number; tile: number } | null {
    const packName = list.querySelector('.pkname');
    const tile = list.querySelector('.vil');
    if (!packName || !tile) {
      return null;
    }
    const tileHeight = tile.getBoundingClientRect().height;
    if (tileHeight === 0) {
      return null;
    }
    return { packName: packName.getBoundingClientRect().height, tile: tileHeight };
  }

  // A tile's height follows its width: measured again whenever the first tile or pack name is
  // resized. The sizes set the list's height, so the list itself is not observed, and they are
  // applied in the next frame: resizing the list while the observers are notified, scrollFade's
  // among them, would be a ResizeObserver loop. A filter that matches nothing leaves no tile to
  // measure: the last sizes stay.
  $effect(() => {
    const list = villains;
    if (!list || !isHost) {
      return;
    }
    // Read so that a new filter, with another first pack, observes its name and tile.
    void groups;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        listSizes = measureList(list) ?? listSizes;
      });
    });
    const packName = list.querySelector('.pkname');
    const tile = list.querySelector('.vil');
    if (packName && tile) {
      observer.observe(packName);
      observer.observe(tile);
    }
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  });

  // The settings take their room from the list: the villain the host just chose may have slipped
  // out of its view. A guest's list holds that villain alone, and scrolling it could move the page.
  function revealChosen(): void {
    if (!isHost) {
      return;
    }
    villains?.querySelector('.vil.on')?.scrollIntoView({
      block: 'nearest',
      behavior: prefersReducedMotion.current ? 'instant' : 'smooth',
    });
  }

  function configure(changes: Partial<LobbyConfig>): void {
    onconfigure({
      scenario: config.scenario,
      difficulty,
      standard: standardSet,
      expert: difficulty === 'expert' ? expertSet : '',
      modulars: [...config.modulars],
      ...changes,
    });
  }

  // Another villain resets the modular sets to its recommendations.
  function chooseScenario(scenario: ScenarioRef): void {
    if (!scenario.supported) {
      return;
    }
    if (scenario.selfContained) {
      configure({ scenario: scenario.id, standard: '', expert: '', modulars: [] });
      return;
    }
    // Leaving a self-contained scenario brings the default sets back.
    configure({
      scenario: scenario.id,
      standard: chosen?.selfContained ? DEFAULT_STANDARD : standardSet,
      expert: difficulty === 'expert' ? (chosen?.selfContained ? DEFAULT_EXPERT : expertSet) : '',
      modulars: [...scenario.recommended],
    });
  }

  function chooseDifficulty(next: Difficulty): void {
    configure({ difficulty: next, expert: next === 'expert' ? expertSet : '' });
  }

  function addModular(code: string): void {
    menuOpen = false;
    configure({ modulars: [...config.modulars, code] });
  }

  function removeModular(code: string): void {
    configure({ modulars: config.modulars.filter((m) => m !== code) });
  }

  // A click on the Add a set button or in its menu is not outside: the button toggles the menu.
  function closeMenuOnOutsideClick(event: MouseEvent): void {
    if (event.target instanceof Element && event.target.closest('.add-wrap')) {
      return;
    }
    menuOpen = false;
  }
</script>

<svelte:window
  onclick={closeMenuOnOutsideClick}
  onkeydown={(event) => {
    // Closing takes the key, so that fullscreen stays (lib/fullscreen).
    if (event.key === 'Escape' && menuOpen) {
      event.preventDefault();
      menuOpen = false;
    }
  }}
/>

<section class="card-box" class:guest={!isHost}>
  <div class="bhead">
    <h2>Scenario</h2>
    {#if !isHost}
      <span class="aside">chosen by {hostName(view)} (host)</span>
    {/if}
  </div>

  <div class="sect villain">
    <div class="lbl">Villain</div>
    {#if isHost}
      <input
        type="text"
        class="filter"
        aria-label="Filter by scenario or pack"
        placeholder="Filter by scenario or pack…"
        bind:value={filter}
      />
    {/if}
    <div
      class="villains"
      bind:this={villains}
      style:--pack-name-height={listSizes ? `${listSizes.packName}px` : undefined}
      style:--tile-height={listSizes ? `${listSizes.tile}px` : undefined}
      {@attach scrollFade}
    >
      {#each groups as group (group.pack.code)}
        <div class="pack">
          <div class="pkname">{localizedName(group.pack, lang)}</div>
          <div class="vgrid">
            {#each group.scenarios as scenario (scenario.id)}
              {@const selected = scenario.id === config.scenario}
              <button
                class="vil"
                class:on={selected}
                class:unsupported={!scenario.supported}
                aria-pressed={selected}
                disabled={!isHost || !scenario.supported}
                onclick={() => chooseScenario(scenario)}
              >
                {#if scenario.image}
                  <CardArt src={scenario.image} aspect={4 / 3} loading="lazy" />
                {/if}
                {#if selected}
                  <span class="check">
                    <Icon name="check" />
                  </span>
                {/if}
                {#if !scenario.supported}
                  <span class="soon">Not supported yet</span>
                {/if}
                <span class="nm" use:overflowTip>{localizedName(scenario, lang)}</span>
              </button>
            {/each}
          </div>
        </div>
      {:else}
        <div class="none">
          {isHost ? 'No scenario matches.' : `${hostName(view)} has not chosen a scenario yet.`}
        </div>
      {/each}
    </div>
  </div>

  <!-- Opens once a first scenario is chosen, and stays as the host picks others. -->
  {#if chosen}
    <div
      class="sect settings"
      transition:slide={{
        duration: prefersReducedMotion.current ? 0 : SETTINGS_SLIDE_MS,
        easing: cubicOut,
      }}
      onintroend={revealChosen}
    >
      <div class="difficulty" class:self-contained={selfContained}>
        <div class="lbl">Difficulty</div>
        <div class="switch-row">
          <Segmented
            options={levels}
            value={difficulty}
            onchange={chooseDifficulty}
            label="Difficulty"
            disabled={!isHost}
          />
          {#if selfContained}
            <p class="own-cards">This scenario uses only its own cards.</p>
          {/if}
        </div>
        {#if showStandardSet || showExpertSet}
          <div class="sets">
            {#if showStandardSet}
              <label class="set">
                <span>Standard set</span>
                <select
                  value={standardSet}
                  onchange={(e) => configure({ standard: e.currentTarget.value })}
                >
                  <option value="">None</option>
                  {#each standardSets as set (set.code)}
                    <option value={set.code}>{localizedName(set, lang)}</option>
                  {/each}
                </select>
              </label>
            {/if}
            {#if showExpertSet}
              <label class="set">
                <span>Expert set</span>
                <select
                  value={expertSet}
                  onchange={(e) => configure({ expert: e.currentTarget.value })}
                >
                  <option value="">None</option>
                  {#each expertSets as set (set.code)}
                    <option value={set.code}>{localizedName(set, lang)}</option>
                  {/each}
                </select>
              </label>
            {/if}
          </div>
        {/if}
      </div>

      {#if !selfContained}
        <div class="modulars">
          <div class="lbl">Modular sets</div>
          <div class="chips">
            {#each config.modulars as code (code)}
              <span class="chip" class:guest-chip={!isHost}>
                {setName(code)}
                {#if recommended.includes(code)}
                  <span class="rec" title="Recommended for this scenario">★</span>
                {/if}
                {#if isHost}
                  <button
                    class="btn-ghost x"
                    aria-label="Remove {setName(code)}"
                    onclick={() => removeModular(code)}
                  >
                    <Icon name="cross" />
                  </button>
                {/if}
              </span>
            {:else}
              {#if !isHost}
                <span class="aside">None</span>
              {/if}
            {/each}
            {#if isHost}
              <span class="add-wrap">
                <button class="add" aria-expanded={menuOpen} onclick={() => (menuOpen = !menuOpen)}
                  >+ Add a set</button
                >
                {#if menuOpen}
                  <div class="menu">
                    {#each addableModulars as set (set.code)}
                      <button class="btn-ghost" onclick={() => addModular(set.code)}>
                        {localizedName(set, lang)}
                        {#if recommended.includes(set.code)}
                          <span class="rec">★ recommended</span>
                        {/if}
                      </button>
                    {/each}
                  </div>
                {/if}
              </span>
            {/if}
          </div>
          {#if isHost}
            <p class="hint">
              The scenario's recommended sets (★) are added for you; change them freely.
            </p>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</section>

<style>
  /* The lobby may stretch the box to its row: the villain section takes the height left. */
  .card-box {
    display: flex;
    flex-direction: column;
  }

  .villain {
    flex-grow: 1;
    display: flex;
    flex-direction: column;
  }

  .filter {
    margin-bottom: 4px;
  }

  /*
    The whole range scrolls in the room the box has left. The zero basis keeps the tiles from making
    the box taller, down to a floor: the first pack's name and --villain-rows rows of tiles, the
    count the lobby sets for its layout. The fallback sizes hold until the list is measured.
  */
  .villains {
    --tile-gap: 12px;
    flex: 1 1 0;
    min-height: calc(
      var(--pack-name-height, 41px) + var(--villain-rows, 2) * var(--tile-height, 112px) +
        (var(--villain-rows, 2) - 1) * var(--tile-gap)
    );
    overflow-y: auto;
    margin-right: -10px;
    padding-right: 10px;
  }

  /* A guest's list holds the chosen scenario alone: it shows whole, and fills a stretched box. */
  .guest .villains {
    flex: 1 0 auto;
    min-height: 0;
  }

  /* The pack's name, then a rule to the edge. */
  .pkname {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 0 10px;
    background: var(--bg);
    color: var(--text-soft);
    font-size: 13px;
    font-weight: 700;
  }

  .pkname::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--panel-2);
  }

  .guest .pkname {
    position: static;
  }

  .vgrid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: var(--tile-gap);
  }

  /* The aspect given to its CardArt too. */
  .vil {
    position: relative;
    aspect-ratio: 4 / 3;
    padding: 0;
    overflow: hidden;
    border-radius: 12px;
    border: 1px solid var(--line);
    background: var(--panel);
    text-align: left;
  }

  /* Disabled tiles (a guest's read-only ones, unsupported ones) skip the global
     disabled fade: unsupported tiles get their own dimming below. */
  .vil:disabled {
    opacity: 1;
  }

  /* A tile the host can pick zooms in on its art; read-only and unsupported tiles stay still. */
  @media (prefers-reduced-motion: no-preference) {
    .vil:enabled:hover,
    .vil:enabled:focus-visible {
      --art-zoom: 1.07;
    }
  }

  .vil .nm {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    padding: 22px 12px 10px;
    background: linear-gradient(transparent, #07090feb);
    font-stretch: 85%;
    font-weight: 800;
    font-size: 16px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .vil.on {
    border: 2px solid var(--sel);
    box-shadow: 0 0 0 4px #49c6ff29;
  }

  .vil.unsupported {
    opacity: 0.45;
  }

  .vil.unsupported :global(img) {
    filter: grayscale(1);
  }

  .check {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--sel);
    color: var(--table-bg);
    display: grid;
    place-items: center;
  }

  .check :global(svg) {
    width: 14px;
    height: 14px;
    stroke-width: 3;
  }

  .soon {
    position: absolute;
    top: 8px;
    left: 8px;
    padding: 3px 8px;
    border-radius: 6px;
    background: var(--table-bg);
    color: var(--text-soft);
    font-size: 11px;
    font-weight: 700;
  }

  .none {
    color: var(--muted);
    text-align: center;
    padding: 30px 0;
  }

  .settings {
    display: flex;
    flex-wrap: wrap;
    gap: 24px 40px;
  }

  /* No gap here: the label keeps the lobby's own spacing below it, as in .modulars, so the
     switch lines up with the first row of chips. */
  .difficulty {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }

  /* The own-cards note shares the switch's row so it centres on the switch, and drops below it
     when the row is too narrow; the column then fills the settings row to make room for it. */
  .difficulty.self-contained {
    flex: 1;
  }

  .switch-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px 40px;
  }

  .self-contained .switch-row {
    align-self: stretch;
  }

  /* One grid for both set rows so their selects share a left edge whatever the label widths;
     each label flattens into the grid but still wraps its select for accessibility. */
  .sets {
    margin-top: 10px;
    display: grid;
    grid-template-columns: auto auto;
    justify-content: start;
    align-items: center;
    gap: 10px 8px;
    color: var(--muted);
    font-size: 12px;
  }

  .set {
    display: contents;
  }

  .set select {
    width: auto;
    padding: 4px 8px;
    font-size: 13px;
  }

  .own-cards {
    flex: 1;
    min-width: 240px;
    margin: 0;
    color: var(--muted);
  }

  .modulars {
    flex: 1;
    min-width: 240px;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 34px;
    padding: 0 6px 0 12px;
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    background: var(--panel);
    font-size: 13px;
    font-weight: 600;
  }

  .chip.guest-chip {
    padding-right: 12px;
  }

  .chip .x {
    width: 24px;
    height: 24px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    color: var(--muted);
    display: inline-grid;
    place-items: center;
  }

  .chip .x :global(svg) {
    width: 12px;
    height: 12px;
    stroke-width: 2.6;
  }

  .rec {
    color: var(--spark);
    font-size: 11px;
  }

  .add-wrap {
    position: relative;
  }

  .add {
    height: 34px;
    padding: 0 14px;
    border-style: dashed;
    border-radius: 999px;
    background: transparent;
    font-size: 13px;
  }

  .menu {
    position: absolute;
    z-index: 10;
    margin-top: 4px;
    max-height: 320px;
    overflow-y: auto;
    background: var(--panel-2);
    border: 1px solid var(--line-strong);
    border-radius: 12px;
    padding: 4px;
    box-shadow: 0 12px 30px #000c;
    min-width: 220px;
  }

  .menu button {
    display: flex;
    width: 100%;
    border: 0;
    text-align: left;
    padding: 6px 10px;
    gap: 8px;
    font-weight: 400;
  }

  .menu .rec {
    margin-left: auto;
  }
</style>
