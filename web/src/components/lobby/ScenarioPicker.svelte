<script lang="ts">
  import { cubicOut } from 'svelte/easing';
  import { MediaQuery } from 'svelte/reactivity';
  import { fade, slide, type TransitionConfig } from 'svelte/transition';
  import { tick, untrack } from 'svelte';
  import { storedLang } from '../../lib/lang';
  import { localizedName } from '../../lib/localize';
  import { fold, matchesQuery } from '../../lib/textFilter';
  import { glide, motionMs, pop } from '../../lib/motion';
  import { overflowTip } from '../../lib/overflowTip';
  import { scrollFade } from '../../lib/scrollFade';
  import CardArt from '../CardArt.svelte';
  import Icon from '../Icon.svelte';
  import Segmented from '../Segmented.svelte';
  import { placeUnder, type DropdownPlace } from '../../lib/dropdown';
  import type { Rect } from '../../lib/rect';
  import { TOUCH_MODE_QUERY } from '../../lib/screen';
  import { onVisibleAreaChange, withinVisible } from '../../lib/visibleArea';
  import {
    hostName,
    type Difficulty,
    type Index,
    type LobbyConfig,
    type PackRef,
    type ScenarioRef,
    type SetRef,
    type View,
  } from '../../lib/types';

  let {
    view,
    index,
    onconfigure,
    room,
  }: {
    view: View;
    index: Index;
    onconfigure: (config: LobbyConfig) => void;
    /** The part of the window the Add a set menu stays within, in viewport coordinates. */
    room: () => Rect;
  } = $props();

  // Version I of the Standard and Expert sets is the default.
  const DEFAULT_STANDARD = 'standard';
  const DEFAULT_EXPERT = 'expert';
  const LEVELS: { value: Difficulty; label: string }[] = [
    { value: 'standard', label: 'Standard' },
    { value: 'expert', label: 'Expert' },
  ];
  const SLIDE_MS = 250;
  const REVEAL_MS = 200;
  // The Add a set menu's gap under its button, and its height cap: it scrolls inside beyond it.
  const MENU_GAP = 4;
  const MENU_MAX_HEIGHT = 320;
  // The folded villain list shows whole packs, in release order, until it holds at least this many scenarios.
  const FOLDED_MIN_SCENARIOS = 16;

  // Pack, scenario and set names in the language chosen in Options, a separate route: read once.
  const lang = storedLang();

  let filter = $state('');
  // Show all villains unfolds the list for the rest of the visit: it is neither stored nor sent.
  let unfolded = $state(false);
  let villainList = $state<HTMLElement>();
  let menuOpen = $state(false);
  // The Add a set menu's own filter, empty each time the menu opens.
  let setFilter = $state('');

  const isHost = $derived(view.you.host);
  const config = $derived(view.config);
  const chosen = $derived(index.scenarios.find((s) => s.id === config.scenario));
  const difficulty = $derived<Difficulty>(config.difficulty === 'expert' ? 'expert' : 'standard');
  const difficultyLabel = $derived(LEVELS.find((level) => level.value === difficulty)?.label);
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
  // A scenario played with a main scheme set, as a Fear No Evil Underling is, takes one of them
  // among its modular sets: that set is the scenario.
  const mainSchemes = $derived(chosen?.mainSchemes ?? []);
  const chosenMainScheme = $derived(
    index.sets.find((s) => mainSchemes.includes(s.code) && config.modulars.includes(s.code)),
  );
  // The encounter sets that come with the scenario: those its rules require, like Taskmaster's
  // Hydra Patrol, and those it sets aside, like Escape the Museum's Ship Command.
  const scenarioSets = $derived(chosen?.sets ?? []);
  // The chosen main scheme set's recommendations are the scenario's.
  const recommended = $derived([
    ...(chosen?.recommended ?? []),
    ...(chosenMainScheme?.recommended ?? []),
  ]);

  /**
   * Whether the Add a set menu offers the set: a modular set that does not come with the scenario,
   * or one main scheme set at most.
   */
  function isAddable(set: SetRef): boolean {
    if (config.modulars.includes(set.code) || scenarioSets.includes(set.code)) {
      return false;
    }
    if (set.kind === 'main_scheme') {
      return mainSchemes.includes(set.code) && chosenMainScheme === undefined;
    }
    return set.kind === 'modular';
  }

  // The full list is long: the Add a set menu groups it by pack, in release order as the villain
  // list does. A recommended set stays in its own pack, where its star marks it.
  const modularGroups = $derived(
    index.packs
      .map((pack) => ({
        pack,
        sets: index.sets.filter((s) => s.pack === pack.code && isAddable(s)),
      }))
      .filter((group) => group.sets.length > 0),
  );
  // Each group of the menu is labelled by its pack's name.
  const uid = $props.id();

  const setQuery = $derived(fold(setFilter));

  /** Whether the pack's or the set's name, shown or English, holds the Add a set menu's filter. */
  function matchesSetQuery(ref: PackRef | SetRef): boolean {
    return matchesQuery(setQuery, [localizedName(ref, lang), ref.name]);
  }

  // A pack whose name matches keeps all its sets; another keeps those whose name matches.
  const shownModularGroups = $derived(
    setQuery === ''
      ? modularGroups
      : modularGroups
          .map((group) => ({
            pack: group.pack,
            sets: matchesSetQuery(group.pack) ? group.sets : group.sets.filter(matchesSetQuery),
          }))
          .filter((group) => group.sets.length > 0),
  );

  function packName(code: string): string {
    return packNames.get(code) ?? code;
  }

  function setName(code: string): string {
    return setNames.get(code) ?? code;
  }

  /** Whether the scenario's or its pack's name, shown or English, holds the filter. */
  function matchesFilter(scenario: ScenarioRef): boolean {
    const englishPack = index.packs.find((p) => p.code === scenario.pack)?.name ?? scenario.pack;
    return matchesQuery(filter, [
      localizedName(scenario, lang),
      scenario.name,
      packName(scenario.pack),
      englishPack,
    ]);
  }

  // Every scenario the filter keeps, under its pack, packs in release order.
  const matchingGroups = $derived(
    index.packs
      .map((pack) => ({
        pack,
        scenarios: index.scenarios.filter((s) => s.pack === pack.code && matchesFilter(s)),
      }))
      .filter((group) => group.scenarios.length > 0),
  );

  /**
   * The packs the folded list shows: the first ones in release order until they hold
   * FOLDED_MIN_SCENARIOS scenarios, supported or not, and the chosen scenario's pack.
   */
  const foldedPacks = $derived.by(() => {
    const codes: string[] = [];
    let count = 0;
    for (const pack of index.packs) {
      if (count >= FOLDED_MIN_SCENARIOS) {
        break;
      }
      codes.push(pack.code);
      count += index.scenarios.filter((s) => s.pack === pack.code).length;
    }
    if (chosen) {
      codes.push(chosen.pack);
    }
    return new Set(codes);
  });

  // A filter query searches every pack: the fold applies only to the whole list.
  const folding = $derived(!unfolded && fold(filter) === '');
  const groups = $derived(
    folding ? matchingGroups.filter((group) => foldedPacks.has(group.pack.code)) : matchingGroups,
  );
  const hiddenGroups = $derived(
    folding ? matchingGroups.filter((group) => !foldedPacks.has(group.pack.code)) : [],
  );
  const hiddenCount = $derived(
    hiddenGroups.reduce((sum, group) => sum + group.scenarios.length, 0),
  );

  /**
   * Shows every villain. The button goes with the fold, so the focus moves to the first scenario
   * it brings, rather than falling back to the page.
   */
  async function unfold(): Promise<void> {
    const firstShown = hiddenGroups[0]?.scenarios[0];
    revealing = true;
    unfolded = true;
    await tick();
    revealing = false;
    const rows = villainList?.querySelectorAll<HTMLElement>('.vrow') ?? [];
    const row = [...rows].find((r) => r.dataset.scenario === firstShown?.id);
    row?.focus();
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

  // A main scheme set brings its recommended sets, as a villain does, after the chosen ones.
  function addModular(set: SetRef): void {
    menuOpen = false;
    const added = [set.code, ...(set.recommended ?? [])];
    configure({ modulars: [...new Set([...config.modulars, ...added])] });
  }

  function removeModular(code: string): void {
    configure({ modulars: config.modulars.filter((m) => m !== code) });
  }

  function toggleMenu(): void {
    if (!menuOpen) {
      setFilter = '';
    }
    menuOpen = !menuOpen;
  }

  let addWrap = $state<HTMLElement>();
  let addButton = $state<HTMLElement>();
  let menu = $state<HTMLElement>();
  let menuField = $state<HTMLInputElement>();
  let menuList = $state<HTMLElement>();
  // The size of the unfiltered menu: it keeps it while the host filters, so that it stays still.
  let menuSize = $state<{ w: number; h: number } | null>(null);
  let menuPlace = $state<DropdownPlace | null>(null);
  const menuPlaced = $derived(menuPlace !== null);
  const touchMode = new MediaQuery(TOUCH_MODE_QUERY);

  /**
   * The menu's whole size, even while it is cut to scroll: the field, the list's full height, the
   * padding and the borders. The size it is given is let go while it is measured, then restored as
   * Svelte set it.
   */
  function measureMenu(menu: HTMLElement, list: HTMLElement): { w: number; h: number } {
    const { width, height } = menu.style;
    menu.style.width = '';
    menu.style.height = '';
    const aroundList = menu.offsetHeight - list.clientHeight;
    const size = {
      w: menu.getBoundingClientRect().width,
      h: Math.min(aroundList + list.scrollHeight, MENU_MAX_HEIGHT),
    };
    menu.style.width = width;
    menu.style.height = height;
    return size;
  }

  /**
   * Places the open Add a set menu inside the room, under its button or above it. placeUnder
   * works in viewport coordinates; the menu stays positioned in .add-wrap, so it scrolls with the
   * page.
   */
  function placeMenu(): void {
    if (!menuSize || !addWrap || !addButton) {
      return;
    }
    // Within the part of the window the user sees: above the on-screen keyboard, once it shows.
    const place = placeUnder(
      addButton.getBoundingClientRect(),
      menuSize,
      withinVisible(room()),
      MENU_GAP,
    );
    const origin = addWrap.getBoundingClientRect();
    menuPlace = { ...place, left: place.left - origin.left, top: place.top - origin.top };
  }

  // Measured and placed as it opens, and again when its sets change: measured only while
  // unfiltered, so that filtering leaves its size alone. Unplaced, and so unseen, while closed.
  $effect(() => {
    void modularGroups;
    const open = menu && menuList ? { menu, list: menuList } : null;
    untrack(() => {
      if (!open) {
        menuSize = null;
        menuPlace = null;
        return;
      }
      if (setQuery === '') {
        menuSize = measureMenu(open.menu, open.list);
      }
      placeMenu();
    });
  });

  // Placed again as the on-screen keyboard shows or hides while the menu is open.
  $effect(() => {
    if (menu) {
      return onVisibleAreaChange(placeMenu);
    }
  });

  // The field takes the keys once the menu shows: an unseen field takes no focus. The menu is
  // placed in an effect, and shows on the next update, once the template gives it .placed. On a
  // touch screen, the keyboard would show at once over the list: the host taps the field to filter.
  $effect(() => {
    if (!menuPlaced || touchMode.current) {
      return;
    }
    const field = untrack(() => menuField);
    void tick().then(() => {
      if (field?.isConnected) {
        field.focus();
      }
    });
  });

  // ArrowDown goes down to the first set; Enter adds the set the filter leaves alone. Escape closes
  // the menu, as anywhere (the window's handler).
  function onMenuFieldKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      menuList?.querySelector('button')?.focus();
      return;
    }
    if (event.key === 'Enter') {
      const sets = shownModularGroups.flatMap((group) => group.sets);
      const [only] = sets;
      if (sets.length === 1 && only !== undefined) {
        addModular(only);
      }
    }
  }

  // A click on the Add a set button or in its menu is not outside: the button toggles the menu.
  function closeMenuOnOutsideClick(event: MouseEvent): void {
    if (event.target instanceof Element && event.target.closest('.add-wrap')) {
      return;
    }
    menuOpen = false;
  }

  // Svelte plays a local intro only when its own block opens: a component mounted with a scenario
  // already chosen shows it at once, and a recap or box that opens later slides in.
  const slideIn = $derived({ duration: motionMs(SLIDE_MS), easing: cubicOut });

  // Whether Show all villains is bringing the rest of the packs, which then fade in. A plain
  // variable, read as each intro starts: a filter shows and hides packs at once.
  let revealing = false;

  function revealPack(node: Element): TransitionConfig {
    return fade(node, { duration: revealing ? motionMs(REVEAL_MS) : 0, easing: cubicOut });
  }
</script>

<svelte:window
  onclick={closeMenuOnOutsideClick}
  onresize={placeMenu}
  onkeydown={(event) => {
    // Closing takes the key, so that fullscreen stays (lib/fullscreen).
    if (event.key === 'Escape' && menuOpen) {
      event.preventDefault();
      menuOpen = false;
    }
  }}
/>

{#snippet recap(scenario: ScenarioRef)}
  <div class="recap" class:ro={!isHost}>
    <div class="vart">
      {#if scenario.image}
        <CardArt src={scenario.image} aspect={4 / 3} />
      {/if}
    </div>
    <div class="vtitle">
      <h3 class="vname">{localizedName(scenario, lang)}</h3>
      <div class="vfrom">{packName(scenario.pack)}</div>
    </div>

    <div class="settings">
      <div class="difficulty">
        <div class="lbl">Difficulty</div>
        <div class="line">
          {#if isHost}
            <Segmented
              options={LEVELS}
              value={difficulty}
              onchange={chooseDifficulty}
              label="Difficulty"
            />
            <!-- The selects carry their names in a tooltip: a visible label would not fit the line. -->
            {#if showStandardSet}
              <label class="set">
                <span class="sr-only">Standard set</span>
                <select
                  value={standardSet}
                  data-tip="Standard set"
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
                <span class="sr-only">Expert set</span>
                <select
                  value={expertSet}
                  data-tip="Expert set"
                  onchange={(e) => configure({ expert: e.currentTarget.value })}
                >
                  <option value="">None</option>
                  {#each expertSets as set (set.code)}
                    <option value={set.code}>{localizedName(set, lang)}</option>
                  {/each}
                </select>
              </label>
            {/if}
          {:else}
            <span class="chip guest-chip">{difficultyLabel}</span>
          {/if}
        </div>
      </div>

      {#if selfContained}
        <p class="own-cards">This scenario uses only its own cards.</p>
      {:else}
        <div class="modulars">
          <div class="lbl">Modular sets</div>
          <div class="line chips">
            {#each config.modulars as code (code)}
              <span class="chip" class:guest-chip={!isHost} in:pop out:pop animate:glide>
                {setName(code)}
                {#if recommended.includes(code)}
                  <span
                    class="rec"
                    role="img"
                    aria-label="Recommended for this scenario"
                    data-tip="Recommended for this scenario">★</span
                  >
                {/if}
                {#if code === chosenMainScheme?.code}
                  <span class="scheme">main scheme</span>
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
                <span class="aside none-set">None</span>
              {/if}
            {/each}
            {#if isHost}
              <span class="add-wrap" bind:this={addWrap}>
                <button
                  class="btn-ghost add"
                  aria-expanded={menuOpen}
                  bind:this={addButton}
                  onclick={toggleMenu}>+ Add a set</button
                >
                {#if menuOpen}
                  <div
                    class="menu"
                    class:placed={menuPlaced}
                    bind:this={menu}
                    style:left="{menuPlace?.left ?? 0}px"
                    style:top="{menuPlace?.top ?? 0}px"
                    style:width={menuSize ? `${menuSize.w}px` : undefined}
                    style:height={menuSize ? `${menuPlace?.maxHeight ?? menuSize.h}px` : undefined}
                  >
                    <input
                      type="text"
                      class="mfilter"
                      aria-label="Filter sets"
                      placeholder="Filter sets…"
                      autocomplete="off"
                      spellcheck="false"
                      bind:value={setFilter}
                      bind:this={menuField}
                      onkeydown={onMenuFieldKeydown}
                    />
                    <div class="mlist" bind:this={menuList} {@attach scrollFade}>
                      {#each shownModularGroups as group (group.pack.code)}
                        {@const headingId = `${uid}-pack-${group.pack.code}`}
                        <div role="group" aria-labelledby={headingId}>
                          <div class="mpk" id={headingId}>{localizedName(group.pack, lang)}</div>
                          {#each group.sets as set (set.code)}
                            <button class="btn-ghost" onclick={() => addModular(set)}>
                              {localizedName(set, lang)}
                              {#if recommended.includes(set.code)}
                                <span class="rec">★ recommended</span>
                              {/if}
                              {#if set.kind === 'main_scheme'}
                                <span class="scheme">main scheme</span>
                              {/if}
                            </button>
                          {/each}
                        </div>
                      {:else}
                        <div class="mnone">
                          {modularGroups.length === 0 ? 'No set to add' : 'No matching set'}
                        </div>
                      {/each}
                    </div>
                  </div>
                {/if}
              </span>
            {/if}
          </div>
          {#if isHost}
            <p class="hint">
              {#if mainSchemes.length > 0 && chosenMainScheme === undefined}
                Add a main scheme set: it sets the scenario.
              {:else}
                The scenario's recommended sets (★) are added for you; change them freely.
              {/if}
            </p>
          {/if}
        </div>
      {/if}
    </div>
  </div>
{/snippet}

{#if isHost}
  <section class="card-box scenario">
    <div class="bhead">
      <h2>Scenario</h2>
    </div>

    <div class="body">
      <div class="lhead">
        <div class="lbl">Villain</div>
        <input
          type="text"
          class="filter"
          aria-label="Filter by scenario or pack"
          placeholder="Filter by scenario or pack…"
          autocomplete="off"
          spellcheck="false"
          bind:value={filter}
        />
      </div>

      <!-- Packs flow in columns, a pack never split; the page scrolls, not the list. -->
      <div class="vlist" id="{uid}-villains" bind:this={villainList}>
        {#each groups as group (group.pack.code)}
          <div class="vpack" in:revealPack>
            <div class="pk"><span use:overflowTip>{localizedName(group.pack, lang)}</span></div>
            {#each group.scenarios as scenario (scenario.id)}
              {@const selected = scenario.id === config.scenario}
              <!-- aria-disabled rather than disabled keeps the tooltip: some browsers fire no
                   pointer events on a disabled button. -->
              <button
                class="btn-ghost vrow"
                class:on={selected}
                class:unsupported={!scenario.supported}
                aria-pressed={selected}
                aria-disabled={!scenario.supported}
                data-scenario={scenario.id}
                data-tip={scenario.supported ? undefined : 'Not supported yet'}
                onclick={() => chooseScenario(scenario)}
              >
                <span class="ico">
                  {#if scenario.image}
                    <CardArt src={scenario.image} aspect={4 / 3} loading="lazy" />
                  {/if}
                </span>
                <span class="vn" use:overflowTip>{localizedName(scenario, lang)}</span>
                {#if !scenario.supported}
                  <span class="sr-only">Not supported yet</span>
                {/if}
                {#if selected}
                  <span class="ck" aria-hidden="true"><Icon name="check" /></span>
                {/if}
              </button>
            {/each}
          </div>
        {:else}
          <div class="none">No scenario matches.</div>
        {/each}
      </div>

      {#if hiddenCount > 0}
        <button
          class="btn more"
          aria-expanded="false"
          aria-controls="{uid}-villains"
          onclick={unfold}>Show all villains ({hiddenCount} more)</button
        >
      {/if}

      <!-- Opens once a first scenario is chosen, and stays as the host picks others. -->
      {#if chosen}
        <div class="recap-pane" in:slide={slideIn}>
          {@render recap(chosen)}
        </div>
      {/if}
    </div>
  </section>
{:else if chosen}
  <section class="card-box scenario" in:slide={slideIn}>
    <div class="bhead">
      <h2>Scenario</h2>
      <span class="aside">chosen by {hostName(view)} (host)</span>
    </div>
    <div class="body">
      {@render recap(chosen)}
    </div>
  </section>
{/if}

<style>
  /*
    Widths: S below 600px (the base rules), M from 600px, L from 1100px. Every settings control is
    --ctl tall, so a row of them, or the two settings side by side, line up.
  */
  .scenario {
    --ctl: 34px;
    --segmented-height: var(--ctl);
  }

  .body {
    padding: 16px var(--box-pad) 22px;
  }

  /* The label and the filter on one line; stacked, the field full width, on S. */
  .lhead {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    margin-bottom: 14px;
  }

  .lhead .lbl {
    flex: none;
    margin: 0;
  }

  @media (min-width: 600px) {
    .lhead {
      flex-direction: row;
      align-items: center;
      gap: 16px;
    }

    .lhead .filter {
      max-width: 360px;
    }
  }

  .vlist {
    column-count: 2;
    column-gap: 10px;
  }

  @media (min-width: 600px) {
    .vlist {
      column-count: 3;
      column-gap: 20px;
    }
  }

  @media (min-width: 1100px) {
    .vlist {
      column-count: 4;
    }
  }

  .vpack {
    break-inside: avoid;
    padding-bottom: 12px;
  }

  /* The pack's name, then a rule to the column's edge. */
  .pk {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 6px;
    color: var(--muted);
    font-weight: 700;
    font-size: 12px;
  }

  .pk span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pk::after {
    content: '';
    flex: 1 0 12px;
    height: 1px;
    background: var(--panel-2);
  }

  .vrow {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    height: 36px;
    padding: 0 8px 0 4px;
    border: 1px solid transparent;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    text-align: left;
  }

  /* The aspect given to its CardArt too. */
  .ico {
    position: relative;
    flex: none;
    width: 34px;
    height: 26px;
    overflow: hidden;
    border-radius: 5px;
    background: var(--panel-2);
  }

  @media (min-width: 600px) {
    .vrow {
      gap: 10px;
      height: 38px;
    }

    .ico {
      width: 40px;
      height: 30px;
    }
  }

  .vn {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* The chosen row keeps its outline and wash, a little brighter under the pointer. */
  .vrow.on {
    background: color-mix(in srgb, var(--sel) 14%, transparent);
    border-color: var(--sel);
  }

  @media (hover: hover) {
    .vrow.on:hover {
      background: color-mix(in srgb, var(--sel) 22%, transparent);
      border-color: var(--sel);
    }
  }

  .ck {
    flex: none;
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--sel);
    color: var(--table-bg);
  }

  .ck :global(svg) {
    width: 12px;
    height: 12px;
    stroke-width: 3;
  }

  /* Faded by the global aria-disabled rule; the art loses its colour too. */
  .vrow.unsupported .ico {
    filter: grayscale(1);
  }

  /* A row the host can pick zooms in on its art (CardArt's --art-zoom); an unsupported row stays
     still. */
  @media (prefers-reduced-motion: no-preference) {
    .vrow:not([aria-disabled='true']):focus-visible {
      --art-zoom: 1.07;
    }
  }

  @media (hover: hover) and (prefers-reduced-motion: no-preference) {
    .vrow:not([aria-disabled='true']):hover {
      --art-zoom: 1.07;
    }
  }

  .none {
    color: var(--muted);
    text-align: center;
    padding: 30px 0;
  }

  /* The lobby's secondary button: full width on S, centred on M and L. */
  .more {
    display: block;
    width: 100%;
    height: 40px;
    padding: 0 16px;
  }

  @media (min-width: 600px) {
    .more {
      width: fit-content;
      margin-inline: auto;
    }
  }

  /* 12px under the last pack's rows, then 6px: 18px down to the rule; 18px under the button. */
  .recap-pane {
    margin-top: 6px;
    padding-top: 18px;
    border-top: 1px solid var(--panel-2);
  }

  .more + .recap-pane {
    margin-top: 18px;
  }

  /* S: the art and the name in a row, the settings under them. */
  .recap {
    display: grid;
    grid-template-columns: 88px minmax(0, 1fr);
    gap: 14px 20px;
    align-items: start;
  }

  /* 4:3, the aspect given to its CardArt too. */
  .vart {
    position: relative;
    width: 88px;
    height: 66px;
    overflow: hidden;
    border: 1px solid var(--line-strong);
    border-radius: 12px;
    background: var(--panel-2);
  }

  .vtitle {
    align-self: center;
    min-width: 0;
  }

  .vname {
    margin: 0;
    font-size: 22px;
    font-stretch: 85%;
    font-weight: 900;
    font-style: italic;
    line-height: 1;
  }

  .vfrom {
    margin-top: 4px;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.4;
  }

  .settings {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 14px;
  }

  /* Read only, the two settings take the art's and the name's columns, so they line up with them:
     the column gap stays the recap's. */
  .ro .settings {
    grid-template-columns: subgrid;
    column-gap: normal;
  }

  /* M and L: one row, the art, the name, then the settings after a vertical rule. */
  @media (min-width: 600px) {
    .recap {
      grid-template-columns: 120px minmax(140px, 200px) minmax(0, 1fr);
      align-items: center;
    }

    .vart {
      width: 120px;
      height: 90px;
    }

    .vname {
      font-size: 28px;
    }

    .settings,
    .ro .settings {
      grid-column: auto;
      grid-template-columns: minmax(0, 1fr);
      gap: 12px;
      padding-left: 20px;
      border-left: 1px solid var(--panel-2);
    }
  }

  /* L: Difficulty takes what its controls need, on one line; the sets the rest. */
  @media (min-width: 1100px) {
    .settings,
    .ro .settings {
      grid-template-columns: max-content minmax(0, 1fr);
      gap: 32px;
    }

    .difficulty .line {
      flex-wrap: nowrap;
    }
  }

  .difficulty,
  .modulars {
    min-width: 0;
  }

  .line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  /* Only the block padding goes: the side padding (--select-pad) also places the drawn arrow. */
  .set select {
    width: auto;
    height: var(--ctl);
    padding-block: 0;
    font-size: 13px;
  }

  /* In the place of the sets, level with the difficulty's controls. */
  .own-cards {
    align-self: end;
    display: flex;
    align-items: center;
    min-height: var(--ctl);
    margin: 0;
    color: var(--muted);
  }

  /* The extra class outranks the lobby's shared hint rule (.lobby :global(.hint)). */
  .modulars .hint {
    margin: 10px 0 0;
  }

  .none-set {
    display: inline-flex;
    align-items: center;
    height: var(--ctl);
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: var(--ctl);
    padding: 0 4px 0 12px;
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    background: var(--panel);
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
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

  .rec,
  .scheme {
    color: var(--spark);
    font-size: 11px;
  }

  .add-wrap {
    position: relative;
  }

  .add {
    height: var(--ctl);
    padding: 0 8px;
    border-radius: 999px;
    color: var(--sel);
    font-size: 13px;
    font-weight: 700;
  }

  /* Measured before it is placed: unseen until then. The field stays on top; the list under it
     scrolls. */
  .menu {
    position: absolute;
    z-index: 10;
    visibility: hidden;
    display: flex;
    flex-direction: column;
    background: var(--panel-2);
    border: 1px solid var(--line-strong);
    border-radius: 12px;
    padding: 4px;
    box-shadow: 0 12px 30px #000c;
    min-width: 220px;
  }

  .menu.placed {
    visibility: visible;
  }

  /* The global field, sized to the menu's rows. */
  .menu .mfilter {
    flex-shrink: 0;
    margin-bottom: 4px;
    padding: 5px 10px;
    border-radius: 8px;
    font-size: 13px;
  }

  /* Its whole height while the menu is measured, then the menu's height left: it scrolls when cut,
     and fills the menu when the filter leaves fewer sets. */
  .mlist {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
  }

  .mnone {
    color: var(--muted);
    padding: 6px 10px;
    font-size: 13px;
  }

  /* Centred, not stretched: a stretched tag's smaller text would sit at the top of the name's
     taller line. */
  .menu button {
    display: flex;
    align-items: center;
    width: 100%;
    border: 0;
    text-align: left;
    padding: 6px 10px;
    gap: 8px;
    font-weight: 400;
  }

  .menu .rec,
  .menu .scheme {
    margin-left: auto;
  }

  /* A pack's name, then a rule to the edge, as in the villain list but sized to the menu. It stays
     on top while its sets scroll under it, so it takes the menu's background. */
  .menu .mpk {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px 4px;
    background: var(--panel-2);
    color: var(--text-soft);
    font-size: 11px;
    font-weight: 700;
  }

  /* The villain list's rule color is the menu's background: the menu's border color shows. */
  .menu .mpk::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--line-strong);
  }
</style>
