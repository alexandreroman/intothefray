<script lang="ts">
  import type { Difficulty, Index, LobbyConfig, ScenarioRef, View } from '../../lib/types';

  let {
    view,
    index,
    onconfigure,
  }: { view: View; index: Index; onconfigure: (config: LobbyConfig) => void } = $props();

  // Version I of each set, the default (spec 4.3).
  const DEFAULT_STANDARD = 'standard';
  const DEFAULT_EXPERT = 'expert';
  const LEVELS: Difficulty[] = ['standard', 'expert'];

  let filter = $state('');
  let menuOpen = $state(false);

  const isHost = $derived(view.you.host);
  const hostName = $derived(view.players.find((p) => p.host)?.name ?? 'the host');
  const config = $derived(view.config);
  const chosen = $derived(index.scenarios.find((s) => s.id === config.scenario));
  const difficulty = $derived<Difficulty>(config.difficulty === 'expert' ? 'expert' : 'standard');
  const standardSet = $derived(config.standard || DEFAULT_STANDARD);
  const expertSet = $derived(config.expert || DEFAULT_EXPERT);

  const packNames = $derived(new Map(index.packs.map((p) => [p.code, p.name])));
  const setNames = $derived(new Map(index.sets.map((s) => [s.code, s.name])));
  const standardSets = $derived(index.sets.filter((s) => s.kind === 'standard'));
  const expertSets = $derived(index.sets.filter((s) => s.kind === 'expert'));
  const recommended = $derived(chosen?.recommended ?? []);

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
      scenario.name.toLowerCase().includes(query) ||
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
    configure({ scenario: scenario.id, modulars: [...scenario.recommended] });
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

  function toggleMenu(event: MouseEvent): void {
    event.stopPropagation(); // The window click handler would close it again.
    menuOpen = !menuOpen;
  }
</script>

<svelte:window
  onclick={() => (menuOpen = false)}
  onkeydown={(event) => {
    if (event.key === 'Escape') {
      menuOpen = false;
    }
  }}
/>

<section class="card-box" class:guest={!isHost}>
  <div class="bhead">
    <b>Scenario</b>
    <span class="aside"
      >{isHost ? 'you choose — everyone sees it' : `chosen by ${hostName} (host)`}</span
    >
  </div>

  <div class="sect">
    <div class="lbl">Villain</div>
    {#if isHost}
      <input
        type="text"
        class="filter"
        placeholder="Filter by scenario or pack…"
        bind:value={filter}
      />
    {/if}
    <div class="villains">
      {#each groups as group (group.pack.code)}
        <div class="pack">
          <div class="pkname">{group.pack.name}</div>
          <div class="vgrid">
            {#each group.scenarios as scenario (scenario.id)}
              <button
                class="vil"
                class:on={scenario.id === config.scenario}
                class:unsupported={!scenario.supported}
                disabled={!isHost || !scenario.supported}
                title="{scenario.name} — {group.pack.name}"
                onclick={() => chooseScenario(scenario)}
              >
                {#if scenario.image}
                  <img src={scenario.image} alt="" loading="lazy" />
                {/if}
                {#if !scenario.supported}
                  <span class="soon">not supported yet</span>
                {/if}
                <span class="nm">{scenario.name}</span>
              </button>
            {/each}
          </div>
        </div>
      {:else}
        <div class="none">
          {isHost ? 'No scenario matches.' : `${hostName} has not chosen a scenario yet.`}
        </div>
      {/each}
    </div>
  </div>

  {#if chosen}
    <div class="sect">
      <div class="lbl">Difficulty</div>
      <div class="controls">
        <div class="seg">
          {#each LEVELS as level (level)}
            {#if isHost || level === difficulty}
              <button
                class:on={level === difficulty}
                disabled={!isHost}
                onclick={() => chooseDifficulty(level)}
              >
                {level === 'standard' ? 'Standard' : 'Expert'}
              </button>
            {/if}
          {/each}
        </div>
        {#if isHost && standardSets.length > 1}
          <label>
            Standard set
            <select
              value={standardSet}
              onchange={(e) => configure({ standard: e.currentTarget.value })}
            >
              {#each standardSets as set (set.code)}
                <option value={set.code}>{set.name}</option>
              {/each}
            </select>
          </label>
        {/if}
        {#if isHost && difficulty === 'expert' && expertSets.length > 1}
          <label>
            Expert set
            <select
              value={expertSet}
              onchange={(e) => configure({ expert: e.currentTarget.value })}
            >
              {#each expertSets as set (set.code)}
                <option value={set.code}>{set.name}</option>
              {/each}
            </select>
          </label>
        {/if}
      </div>
    </div>

    <div class="sect">
      <div class="lbl">
        Encounter sets
        {#if recommended.length > 0}
          <span class="aside">recommended: {recommended.map(setName).join(', ')}</span>
        {/if}
      </div>
      <div class="chips">
        <span class="chip fixed" title="Always part of this scenario">{chosen.name}</span>
        <span class="chip fixed" title="Always part of this scenario">{setName(standardSet)}</span>
        {#if difficulty === 'expert'}
          <span class="chip fixed" title="Always part of this scenario">{setName(expertSet)}</span>
        {/if}
        {#each config.modulars as code (code)}
          <span class="chip" class:guest-chip={!isHost}>
            {setName(code)}
            {#if recommended.includes(code)}
              <span class="rec">★</span>
            {/if}
            {#if isHost}
              <button
                class="x"
                aria-label="Remove {setName(code)}"
                onclick={() => removeModular(code)}>×</button
              >
            {/if}
          </span>
        {/each}
        {#if isHost}
          <span class="add-wrap">
            <button class="add" aria-expanded={menuOpen} onclick={toggleMenu}>+ Modular set</button>
            {#if menuOpen}
              <div class="menu">
                {#each addableModulars as set (set.code)}
                  <button onclick={() => addModular(set.code)}>
                    {set.name}
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
        <div class="hint">
          The scenario's recommended modular sets are added for you; change them freely.
        </div>
      {/if}
    </div>
  {/if}
</section>

<style>
  .filter {
    margin-bottom: 10px;
  }

  /* The whole range scrolls inside the box. */
  .villains {
    max-height: 430px;
    overflow-y: auto;
    margin-right: -8px;
    padding-right: 8px;
  }

  .guest .villains {
    max-height: none;
  }

  .pack + .pack {
    margin-top: 14px;
  }

  .pkname {
    position: sticky;
    top: 0;
    z-index: 2;
    background: var(--panel);
    padding: 2px 0 6px;
    font-size: 12px;
    font-weight: 700;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.6px;
  }

  .guest .pkname {
    position: static;
  }

  .vgrid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
    gap: 10px;
  }

  .vil {
    padding: 0;
    border-radius: 8px;
    background: linear-gradient(160deg, #2a3350, #151b2b);
    overflow: hidden;
    position: relative;
    aspect-ratio: 5 / 7;
    border: 2px solid transparent;
  }

  /* A guest's tile is disabled only because it is read-only. */
  .vil:disabled {
    opacity: 1;
  }

  .vil img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .vil .nm {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    padding: 14px 6px 5px;
    font-size: 12px;
    font-weight: 700;
    background: linear-gradient(transparent, #000d);
    text-align: left;
    white-space: normal;
  }

  .vil.on {
    border-color: var(--sel);
    box-shadow: 0 0 0 2px #4fd1ff55;
  }

  .vil:not(.on):not(:disabled):hover {
    border-color: #ffffff80;
  }

  .vil.unsupported img {
    filter: grayscale(1);
    opacity: 0.35;
  }

  .vil.unsupported .nm {
    color: var(--muted);
  }

  .soon {
    position: absolute;
    top: 6px;
    left: 6px;
    right: 6px;
    padding: 2px 4px;
    border-radius: 4px;
    background: #0c111bd9;
    color: var(--muted);
    font-size: 10px;
    white-space: normal;
  }

  .none {
    color: var(--muted);
    text-align: center;
    padding: 30px 0;
  }

  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 16px;
  }

  .controls label {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--muted);
    font-size: 12px;
  }

  .controls select {
    width: auto;
    padding: 4px 8px;
    font-size: 13px;
  }

  .seg {
    display: inline-flex;
    border: 1px solid var(--line);
    border-radius: 8px;
    overflow: hidden;
  }

  .seg button {
    border: 0;
    border-radius: 0;
    background: transparent;
    padding: 6px 14px;
  }

  .seg button + button {
    border-left: 1px solid var(--line);
  }

  .seg button.on {
    background: #23406a;
  }

  .seg button:disabled {
    opacity: 1;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 1px solid var(--line);
    background: var(--panel-2);
    border-radius: 999px;
    padding: 3px 4px 3px 10px;
    font-size: 13px;
  }

  .chip.fixed,
  .chip.guest-chip {
    padding-right: 10px;
  }

  .chip.fixed {
    color: var(--muted);
  }

  .chip .x {
    border: 0;
    background: transparent;
    padding: 0 6px;
    color: var(--muted);
    border-radius: 999px;
  }

  .chip .x:hover {
    color: var(--text);
    background: #ffffff14;
  }

  .rec {
    color: var(--warn);
    font-size: 11px;
  }

  .add-wrap {
    position: relative;
  }

  .add {
    border-style: dashed;
    border-radius: 999px;
    padding: 3px 10px;
    font-size: 13px;
    color: var(--muted);
  }

  .menu {
    position: absolute;
    z-index: 10;
    margin-top: 4px;
    max-height: 320px;
    overflow-y: auto;
    background: var(--panel-2);
    border: 1px solid #3a4870;
    border-radius: 10px;
    padding: 4px;
    box-shadow: 0 12px 30px #000c;
    min-width: 220px;
  }

  .menu button {
    display: flex;
    width: 100%;
    border: 0;
    background: transparent;
    text-align: left;
    padding: 6px 10px;
    gap: 8px;
  }

  .menu button:hover {
    background: #2a355a;
  }

  .menu .rec {
    margin-left: auto;
  }
</style>
