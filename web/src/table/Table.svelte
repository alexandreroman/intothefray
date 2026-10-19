<!--
  The table page: the top bar, the table column (one surface for everyone,
  scrolling both ways) and the side column (history). The preview of the
  hovered card floats over the table's bottom right corner. On a narrow screen
  there is no side column.
-->
<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { modal } from '../components/modal.svelte';
  import { prefersReducedMotion } from 'svelte/motion';
  import { MediaQuery } from 'svelte/reactivity';
  import Tooltip from '../components/Tooltip.svelte';
  import TopBar from '../components/TopBar.svelte';
  import { knownCard, loadGameCards, loadIndex } from '../lib/catalog';
  import type { GameSession } from '../lib/session.svelte';
  import type {
    Action,
    CardView as TableCard,
    Index,
    LobbyConfig,
    PackFace,
    PileView,
    Size,
    View,
  } from '../lib/types';
  import ActionBar from './ActionBar.svelte';
  import { diffViews, MAX_APART_MS } from './animate';
  import {
    actionsFor,
    counterName,
    isLocked,
    seatOf,
    type ActionItem,
    type CountQuestion,
    type LocalAction,
    type TableElement,
  } from './actions';
  import Arrows from './Arrows.svelte';
  import AskCount from './AskCount.svelte';
  import type { LocalBox, ShownBox } from './boxes';
  import CardBox from './CardBox.svelte';
  import DragLayer from './DragLayer.svelte';
  import { sourceOf } from './drag';
  import Flights from './Flights.svelte';
  import { isHidden } from './face';
  import Hand from './Hand.svelte';
  import { interaction } from './interaction.svelte';
  import { handleKey } from './keys';
  import KeysSheet from './KeysSheet.svelte';
  import { isOutOfPlay, ownerFrames, surfaceSize } from './layout';
  import {
    ALL_ROWS,
    focusRows,
    lastRow,
    rowOfSeat,
    saveViewMode,
    storedViewMode,
    type ViewMode,
  } from './rows';
  import { motion } from './motion.svelte';
  import Presence from './Presence.svelte';
  import TokenPill from './TokenPill.svelte';
  import CardPreview, { type Preview } from './CardPreview.svelte';
  import {
    bottomRoom,
    chooseCorner,
    FOCUS_MARGINS,
    HOME,
    TABLE_EDGE,
    TABLE_EDGE_BOTTOM,
    type Corner,
  } from './focus';
  import SidePanel from './SidePanel.svelte';
  import Surface, { type OwnerBox } from './Surface.svelte';
  import ZoomControl from './ZoomControl.svelte';
  import { clampZoom, saveZoom, storedZoom, ZOOM_MAX, ZOOM_MIN } from './zoom';

  let {
    session,
    view,
  }: {
    session: Pick<
      GameSession,
      'act' | 'lobby' | 'lastError' | 'presence' | 'sendPresence' | 'viewGap'
    >;
    view: View;
  } = $props();

  // P5a-R2: the cards of the game are loaded once, then card sizes are looked up synchronously.
  // The table belongs to one game: its id never changes while it is shown.
  let catalog = $state<'loading' | 'ready' | 'failed'>('loading');
  loadGameCards(untrack(() => view.id)).then(
    () => (catalog = 'ready'),
    () => (catalog = 'failed'),
  );

  function faceOf(card: TableCard | undefined): PackFace | null {
    if (catalog !== 'ready' || !card?.code || isHidden(card)) {
      return null;
    }
    return knownCard(card.code)?.card.faces[card.face] ?? null;
  }

  /** Every face of a card, as the stage choice lists them; none while the catalog loads. */
  function facesOf(card: TableCard): PackFace[] {
    if (catalog !== 'ready' || !card.code) {
      return [];
    }
    return knownCard(card.code)?.card.faces ?? [];
  }

  function sizeOf(card: TableCard): Size {
    return faceOf(card)?.size ?? 'std';
  }

  // The pack index names the scenario and the modular sets of the top bar's crumb.
  let index = $state.raw<Index | null>(null);
  loadIndex().then(
    (loaded) => (index = loaded),
    // Without names, the top bar shows no crumb.
    () => {},
  );

  /** "Rhino / Bomb Scare": the scenario, then its modular sets. */
  function crumbsOf(config: LobbyConfig, names: Index | null): string[] {
    const scenario = names?.scenarios.find((s) => s.id === config.scenario);
    if (!names || !scenario) {
      return [];
    }
    const modulars = config.modulars.map(
      (code) => names.sets.find((set) => set.code === code)?.name ?? code,
    );
    return [scenario.name, ...modulars];
  }

  const crumbs = $derived(crumbsOf(view.config, index));

  const cards = $derived(view.table?.cards ?? []);
  const piles = $derived(view.table?.piles ?? []);
  const cardsById = $derived(new Map(cards.map((card) => [card.id, card])));
  const ownArea = $derived(view.you.role === 'player' ? view.you.area : undefined);

  // Ready all has something to ready: an exhausted card on the table, whoever owns it, not locked.
  const canReadyAll = $derived(
    cards.some((card) => card.zone === 'table' && card.exhausted === true && !isLocked(card)),
  );

  // Spectators have no hand.
  const handCards = $derived(
    ownArea
      ? (view.table?.hand ?? []).flatMap((id) => {
          const card = cardsById.get(id);
          return card ? [card] : [];
        })
      : undefined,
  );

  function topOf(pile: PileView): TableCard | undefined {
    // While a card taken from a pile is dragged or waits for the server, the pile shows its top card
    // without it; so it does while a card flies to it.
    const taken = interaction.takenFrom(pile.id);
    const topId = (pile.cards ?? [])
      .filter((id) => !taken.includes(id) && !motion.flying.has(id))
      .at(-1);
    return topId === undefined ? undefined : cardsById.get(topId);
  }

  // ---- What the surface shows ----

  // "All", or the villain's row and one player's row under it (rows.ts).
  let viewMode = $state<ViewMode>(storedViewMode());
  // The player whose row "Villain + player" shows, once picked.
  let pickedSeat = $state<number | null>(null);

  function changeViewMode(mode: ViewMode): void {
    viewMode = mode;
    saveViewMode(mode);
  }

  /** The players at the table, with their seat, in seat order. */
  const seatedPlayers = $derived(
    view.players.flatMap((player) =>
      player.area ? [{ seat: seatOf(player.area), name: player.name, color: player.color }] : [],
    ),
  );
  const seats = $derived(seatedPlayers.map((player) => player.seat));
  // The viewer's own row first; a spectator starts with the first seat.
  const shownSeat = $derived.by(() => {
    if (pickedSeat !== null && seats.includes(pickedSeat)) {
      return pickedSeat;
    }
    const own = ownArea ? seatOf(ownArea) : null;
    return own !== null && seats.includes(own) ? own : (seats[0] ?? null);
  });

  // With one player, "All" already shows the villain and that player: there is no choice to make.
  const focused = $derived(viewMode === 'focus' && seats.length > 1 && shownSeat !== null);

  const rowMap = $derived(
    focused && shownSeat !== null
      ? focusRows(rowOfSeat(piles, shownSeat), lastRow(piles))
      : ALL_ROWS,
  );

  /** Shows the row of the player seated `step` seats after the shown one, round the table. */
  function stepSeat(current: number, step: number): void {
    const index = seats.indexOf(current);
    pickedSeat = seats[(index + step + seats.length) % seats.length] ?? current;
  }

  // The arrow keys in the player swatches, as in any radio group.
  const SEAT_STEPS: Record<string, number> = {
    ArrowRight: 1,
    ArrowDown: 1,
    ArrowLeft: -1,
    ArrowUp: -1,
  };

  /** Moves the choice, and the keyboard focus with it, to the next or previous swatch. */
  async function onSeatKey(event: KeyboardEvent, current: number): Promise<void> {
    const step = SEAT_STEPS[event.key];
    if (step === undefined) {
      return;
    }
    // Taken: the table's own shortcuts must not see it.
    event.preventDefault();
    const group = event.currentTarget as HTMLElement;
    stepSeat(current, step);
    await tick();
    group.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
  }

  /** What lies at a height of the table, drawn where the view mode shows it; nothing when hidden. */
  function shown<T extends { y: number }>(items: T[]): T[] {
    return items.flatMap((item) => {
      const y = rowMap.toDisplay(item.y);
      return y === null ? [] : [{ ...item, y }];
    });
  }

  // Out-of-play piles are not drawn: the bars of their owner's deck and discard pile open them.
  const tablePiles = $derived(shown(piles.filter((pile) => !isOutOfPlay(pile))));
  const tableCards = $derived(shown(cards.filter((card) => card.zone === 'table')));

  /** The frames around each owner's deck and discard pile, named after their owner. */
  const owners = $derived(
    ownerFrames(tablePiles).map((frame): OwnerBox => {
      if (frame.owner === -1) {
        return { frame, name: 'Villain', color: 'var(--spark)' };
      }
      const player = view.players[frame.owner];
      if (!player) {
        return { frame, name: `Player ${frame.owner + 1}`, color: 'var(--muted)' };
      }
      const inHand = `${player.handCount} ${player.handCount === 1 ? 'card' : 'cards'} in hand`;
      return { frame, name: player.name, color: `var(--p${player.color + 1})`, tip: inHand };
    }),
  );

  // The surface size follows it, so it is declared before it.
  let zoom = $state(storedZoom());

  // The scroller pads the surface, so that glows, tilted cards and outlines near an edge show.
  const SCROLL_PADDING = 24;

  // The table's visible size, in px.
  let visibleWidth = $state(0);
  let visibleHeight = $state(0);

  // In table units: at least what shows, rounded down so that an empty table never scrolls.
  const surface = $derived(
    surfaceSize(tableCards, tablePiles, sizeOf, {
      w: Math.max(0, Math.floor((visibleWidth - 2 * SCROLL_PADDING) / zoom)),
      h: Math.max(0, Math.floor((visibleHeight - 2 * SCROLL_PADDING) / zoom)),
    }),
  );

  const firstPlayer = $derived(shown(view.table?.firstPlayer ? [view.table.firstPlayer] : [])[0]);

  /** The face the preview shows; none for a card back, which tells nothing more on the table. */
  function previewOf(previewed: TableElement | null): Preview | null {
    if (previewed?.kind === 'pile') {
      const pile = piles.find((p) => p.id === previewed.id);
      const top = pile && pile.count > 0 ? topOf(pile) : undefined;
      return top ? previewOfCard(top) : null;
    }
    const card = previewed ? cardsById.get(previewed.id) : undefined;
    return card ? previewOfCard(card) : null;
  }

  function previewOfCard(card: TableCard): Preview | null {
    if (isHidden(card)) {
      return null;
    }
    const face = faceOf(card);
    return {
      images: face?.images ?? [],
      name: face?.name ?? '',
      landscape: face?.size === 'land' || face?.size === 'dland',
    };
  }

  // From ids, so the preview follows a flip or a pile's new top card.
  const preview = $derived(previewOf(interaction.previewed));

  // The preview fades in as it shows and out as it goes; another card swaps in at once. While
  // it fades out, the last one stays drawn, out of the accessibility tree.
  const PREVIEW_FADE_MS = 110;
  let fading = $state<Preview | null>(null);
  let lastPreview: Preview | null = null;
  let fadeTimer: ReturnType<typeof setTimeout> | undefined;

  $effect.pre(() => {
    const current = preview;
    untrack(() => {
      clearTimeout(fadeTimer);
      if (current) {
        fading = null;
        lastPreview = current;
        return;
      }
      if (lastPreview && !prefersReducedMotion.current) {
        fading = lastPreview;
        fadeTimer = setTimeout(() => (fading = null), PREVIEW_FADE_MS);
      }
      lastPreview = null;
    });
  });

  $effect(() => () => clearTimeout(fadeTimer));

  const drawnPreview = $derived(preview ?? fading);

  // ---- The Focus panel's corner ----

  // Bottom right, unless that hides the whole hovered element (focus.ts).
  let focusCorner = $state<Corner>(HOME);
  // The height of the controls at the bottom right (the zoom control, the narrow Undo): the panel sits above them.
  let cornerHeight = $state(0);
  // The controls' box at the bottom right: the keyboard shortcuts sheet lines up on its right edge.
  let cornerBox = $state<HTMLElement>();
  // The panel's size, kept from the last time it showed; a portrait card's until then.
  let focusWidth = $state(320);
  let focusHeight = $state(450);
  // The play area and the hovered element on the screen, measured when they may have moved
  // (hover, scroll, zoom, resize).
  let focusArea: DOMRect | null = null;
  let focusHovered: DOMRect | null = null;

  /** The hovered card or pile, on the screen. A hovered hand card has no preview to place. */
  function hoveredRect(): DOMRect | null {
    const hovered = interaction.hovered;
    if (!hovered || hovered.kind === 'hand' || !app) {
      return null;
    }
    const id = CSS.escape(hovered.id);
    const selector = `.surface ${hovered.kind === 'pile' ? '.pile' : '.card:not(.pile)'}[data-id="${id}"]`;
    return app.querySelector(selector)?.getBoundingClientRect() ?? null;
  }

  /** Measures the play area and the hovered element, then places the panel. */
  function measureFocus(): void {
    // Nothing previewed, nothing to place: it is measured again as soon as a card is.
    if (!preview) {
      return;
    }
    focusArea = wrap?.getBoundingClientRect() ?? null;
    focusHovered = hoveredRect();
    placeFocus();
  }

  /** Places the panel against the rects last measured. */
  function placeFocus(): void {
    if (!preview || !focusArea) {
      return;
    }
    const next = chooseCorner({
      current: focusCorner,
      area: focusArea,
      size: { w: focusWidth, h: focusHeight },
      hovered: focusHovered,
      controls: cornerHeight,
      // The player selector at the bottom left.
      taken: focused ? ['bottom-left'] : [],
    });
    focusCorner = next;
  }

  /** The panel's margins in its corner: off the play area's edges, and above the controls at home. */
  function focusMargin(corner: Corner): string {
    const top = corner.startsWith('top') ? FOCUS_MARGINS.top : 0;
    const bottom = bottomRoom(corner, cornerHeight);
    const left = corner.endsWith('left') ? FOCUS_MARGINS.side : 0;
    const right = corner.endsWith('right') ? FOCUS_MARGINS.side : 0;
    return `${top}px ${right}px ${bottom}px ${left}px`;
  }

  // Placed before it is drawn, when what is hovered, the zoom, the play area's or the panel's size change.
  $effect.pre(() => {
    void [
      preview,
      interaction.hovered,
      zoom,
      visibleWidth,
      visibleHeight,
      focusWidth,
      focusHeight,
      focused,
      cornerHeight,
    ];
    untrack(measureFocus);
  });

  // The interaction state is shared: a previous game's must not show in the next one.
  $effect(() => () => interaction.reset());

  // The table is exactly the window: the page never scrolls under it, only the surface does
  // (.fixed-screen below). Without this, the resting hand, lowered past the bottom, would make the page
  // scrollable, and a wheel or a drag would scroll the page rather than the surface.
  $effect(() => {
    const page = document.documentElement;
    page.classList.add('fixed-screen');
    return () => page.classList.remove('fixed-screen');
  });

  // ---- Animations ----

  // The view the table was last drawn from: the next one is animated from it.
  // svelte-ignore state_referenced_locally
  let drawnView = view;

  // Before the new view is drawn, while the cards still show where they were.
  // The viewer's own drop already lies where it went (DragLayer's landing,
  // which ends with this view).
  $effect.pre(() => {
    const next = view;
    untrack(() => {
      const prev = drawnView;
      drawnView = next;
      if (prev === next) {
        return;
      }
      const own = interaction.takeActed();
      // Back after a long gap: the table shows as it is now, nothing plays.
      if (session.viewGap > MAX_APART_MS) {
        motion.stop();
        if (own) {
          void tick().then(rehoverUnderPointer);
        }
        return;
      }
      const ownDrop = interaction.landing?.card ?? undefined;
      const anims = diffViews(prev, next, ownDrop, session.viewGap);
      void motion
        .animate(app, anims, { before: prev.table, after: next.table }, zoom)
        .then(async () => {
          if (!own) {
            return;
          }
          // Once drawn, then once still: a card turning over is edge-on, out of reach, meanwhile.
          rehoverUnderPointer();
          await motion.settled();
          rehoverUnderPointer();
        });
    });
  });

  /** Hovers the card or hand card under a pointer at rest, after the viewer's own action redrew it. */
  function rehoverUnderPointer(): void {
    const { x, y } = interaction.pointer;
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      typeof document.elementFromPoint !== 'function'
    ) {
      return;
    }
    // Piles keep their own hover: an empty one has none, a deck keeps the preview.
    const hit = document
      .elementFromPoint(x, y)
      ?.closest<HTMLElement>('.surface .card:not(.pile, .ghost)[data-id], .hand .hcard[data-id]');
    const id = hit?.dataset.id;
    if (!hit || id === undefined) {
      return;
    }
    interaction.rehover({ kind: hit.classList.contains('hcard') ? 'hand' : 'card', id });
  }

  /** Sends an action of the viewer's: the view that shows it hovers what lands under the pointer. */
  function act(action: Action): number | null {
    interaction.acted();
    return session.act(action);
  }

  $effect(() => () => motion.stop());

  // ---- The action bar ----

  /** Whether an empty pile still has a bar: one opening its owner's out-of-play piles. */
  function hasBarWhenEmpty(pile: PileView): boolean {
    const role = view.you.role;
    if (role === undefined) {
      return false;
    }
    const items = actionsFor({ kind: 'pile', id: pile.id }, view, { area: ownArea, role });
    return Array.isArray(items) && items.length > 0;
  }

  /** Whether the element is still where it was hovered: on the table, or in the hand. */
  function isPresent(element: TableElement): boolean {
    switch (element.kind) {
      case 'card':
        return cardsById.get(element.id)?.zone === 'table';
      case 'hand':
        return (view.table?.hand ?? []).includes(element.id);
      case 'pile':
        return piles.some((pile) => pile.id === element.id);
    }
  }

  // An element that left the table takes its bar (and its arrow mode) with it.
  $effect(() => {
    const hovered = interaction.hovered;
    if (hovered && !isPresent(hovered)) {
      interaction.release();
    }
    const from = interaction.arrowFrom;
    if (from !== null && !isPresent({ kind: 'card', id: from })) {
      interaction.endArrow();
    }
  });

  const barItems = $derived.by((): ActionItem[] | { text: string } => {
    // actionsFor reads the catalog's plain Map (are there several faces to
    // flip?): reading the catalog state here recomputes the bar once it loads.
    void catalog;
    const hovered = interaction.hovered;
    const role = view.you.role;
    if (!hovered || role === undefined) {
      return [];
    }
    return actionsFor(hovered, view, { area: ownArea, role });
  });

  const ARROW_HINT = 'Click the card to point at — Esc or a click on an empty spot to cancel.';

  // Never for a hand card: its cards are dragged, or played with their keys.
  // In arrow mode, the hint stays until the arrow is drawn or cancelled,
  // whatever the pointer hovers meanwhile.
  const barShown = $derived.by(() => {
    if (interaction.dragging) {
      return false;
    }
    if (interaction.arrowFrom !== null) {
      return true;
    }
    const hovered = interaction.hovered;
    if (!hovered || hovered.kind === 'hand') {
      return false;
    }
    return !Array.isArray(barItems) || barItems.length > 0;
  });

  /** What the bar sits on: the card an arrow starts from, or else the hovered element. */
  function anchorOf(): HTMLElement | null {
    const from = interaction.arrowFrom;
    const element: TableElement | null =
      from !== null ? { kind: 'card', id: from } : interaction.hovered;
    if (!element || !wrap) {
      return null;
    }
    const selector = element.kind === 'pile' ? '.pile' : '.card:not(.pile)';
    return wrap.querySelector<HTMLElement>(`.surface ${selector}[data-id="${element.id}"]`);
  }

  // ---- The token pill ----

  // Found again by names at every view, so the pill follows its token through
  // redraws; it goes with the token (zero) or the card (off the table).
  const counterShown = $derived.by(() => {
    const target = interaction.counter;
    if (!target || view.you.role !== 'player' || interaction.dragging) {
      return null;
    }
    const card = cardsById.get(target.card);
    if (card?.zone !== 'table') {
      return null;
    }
    const counts = target.kind === 'token' ? card.tokens : card.status;
    const value = counts?.[target.name] ?? 0;
    return value > 0 ? { target, value } : null;
  });

  // A pill that went away must not come back when the token does.
  $effect(() => {
    if (interaction.counter && !counterShown) {
      interaction.hideCounter();
    }
  });

  function counterAnchor(): HTMLElement | null {
    const target = interaction.counter;
    if (!target || !wrap) {
      return null;
    }
    const selector = `[data-counter="${target.kind}:${target.name}"]`;
    return wrap.querySelector<HTMLElement>(`.surface .card[data-id="${target.card}"] ${selector}`);
  }

  function stepCounter(delta: number): void {
    const target = interaction.counter;
    if (target) {
      act({ kind: target.kind, card: target.card, name: target.name, delta });
    }
  }

  /** The "How many cards?" question being asked, if any. */
  let asking = $state<CountQuestion | null>(null);

  // The pile can shrink while the question is open (another player deals from
  // it): the answer never asks for more cards than it holds.
  const askedPile = $derived(asking ? piles.find((pile) => pile.id === asking?.pile) : undefined);
  const askedMax = $derived(asking && askedPile ? Math.min(asking.max, askedPile.count) : 0);

  // Nothing is left to ask about once the pile is empty or gone.
  $effect(() => {
    if (asking && askedMax === 0) {
      asking = null;
    }
  });

  function runItem(item: ActionItem): void {
    const element = interaction.hovered;
    if (!item.run || item.disabled || !element) {
      return;
    }
    const result = item.run();
    if ('ask' in result) {
      asking = result.ask;
    } else if ('local' in result) {
      runLocal(result, element);
    } else {
      send(result);
    }
  }

  function runLocal(local: LocalAction, element: TableElement): void {
    switch (local.local) {
      case 'browseBox':
        localBox = { kind: 'browse', pile: local.pile };
        return;
      case 'stageBox': {
        const stage = view.table?.stages.find((s) => s.current === element.id);
        if (stage) {
          localBox = { kind: 'stage', stage: stage.key };
        }
        return;
      }
    }
  }

  function answer(n: number): void {
    const question = asking;
    asking = null;
    if (question) {
      send(question.make(n));
    }
  }

  function send(action: Action): void {
    // A new Look or Search opens its box as soon as its view arrives.
    if (action.kind === 'look' || action.kind === 'search') {
      closingView = false;
    }
    act(action);
  }

  // ---- The card boxes ----

  // Browse and the stage choice are the client's own; Look at top and Search
  // are the server's private view (ruling P5c-R1), closed with closeView.
  let localBox = $state<LocalBox | null>(null);
  // The private view was closed here: its box is gone before the server's answer.
  let closingView = $state(false);

  $effect(() => {
    if (!view.table?.private) {
      closingView = false;
    }
  });

  // From the current view, so that the box follows what other players do.
  const shownBox = $derived.by((): ShownBox | null => {
    const table = view.table;
    const opened = table?.private;
    if (opened && !closingView) {
      const pile = piles.find((p) => p.id === opened.pile);
      return pile ? { kind: 'pile', pile, mode: opened.mode, cards: opened.cards } : null;
    }
    if (localBox?.kind === 'browse') {
      const id = localBox.pile;
      const pile = piles.find((p) => p.id === id);
      // Public piles list their cards bottom to top.
      return pile
        ? { kind: 'pile', pile, mode: 'browse', cards: [...(pile.cards ?? [])].reverse() }
        : null;
    }
    if (localBox?.kind === 'stage') {
      const key = localBox.stage;
      const stage = table?.stages.find((s) => s.key === key);
      return stage ? { kind: 'stage', stage } : null;
    }
    return null;
  });

  /** Tells one box from another, so that a new box starts afresh. */
  const boxKey = $derived.by(() => {
    if (shownBox?.kind === 'pile') {
      return `${shownBox.mode}:${shownBox.pile.id}`;
    }
    return shownBox ? `stage:${shownBox.stage.key}` : '';
  });

  // A dialog (a card box, the count question, the shortcuts sheet, a
  // confirmation) freezes the table under its backdrop: its bar, preview,
  // selection and any press or drag under way go.
  $effect(() => {
    if (modal.open) {
      untrack(() => {
        interaction.release();
        interaction.letGo();
      });
    }
  });

  function closeBox(shuffle: boolean): void {
    if (shownBox?.kind === 'pile' && shownBox.mode !== 'browse') {
      // Act returns null when nothing was sent: the box then stays, as the server never closes it.
      const sent = act(shuffle ? { kind: 'closeView', where: 'shuffle' } : { kind: 'closeView' });
      closingView = sent !== null;
      return;
    }
    localBox = null;
  }

  /** The table card an element belongs to, if any: arrows link table cards only. */
  function tableCardOf(element: Element | null): string | undefined {
    return element?.closest<HTMLElement>('.surface .card:not(.pile)')?.dataset.id;
  }

  /** A click on an empty spot clears the viewer's own arrows, when there are any. */
  function clearOwnArrows(): void {
    const seat = ownArea ? seatOf(ownArea) : null;
    const arrows = view.table?.arrows ?? [];
    if (seat !== null && arrows.some((arrow) => arrow.seat === seat)) {
      act({ kind: 'arrowClear' });
    }
  }

  /** A press on one of the table's scrollbars: on the scroller, past its content. */
  function onScrollbar(event: PointerEvent, target: HTMLElement): boolean {
    if (target !== wrap) {
      return false;
    }
    const box = target.getBoundingClientRect();
    const offsetX = event.clientX - box.left - target.clientLeft;
    const offsetY = event.clientY - box.top - target.clientTop;
    return offsetX > target.clientWidth || offsetY > target.clientHeight;
  }

  /** An empty spot: the table itself, its surface, or the frame around an owner's piles. */
  function isEmptySpot(target: HTMLElement): boolean {
    return (
      target === wrap ||
      target.classList.contains('table') ||
      target.classList.contains('surface') ||
      target.closest('.ownerbox') !== null
    );
  }

  /** Draws the arrow being picked to that card: the server draws arrows between two table cards only. */
  function endArrowAt(to: string | undefined): void {
    const from = interaction.arrowFrom;
    if (from !== null && to && to !== from) {
      act({ kind: 'arrowAdd', card: from, target: to });
    }
    interaction.endArrow();
    // On touch, the tap goes on to the card as a click, which would select it;
    // a Shift + drag released on its own card would click it.
    interaction.swallowNextClick();
  }

  /**
   * In the capture phase, so that the card pressed does not see it. One press
   * does the first of: picking the target of the arrow mode (or cancelling
   * it), starting a Shift + drag arrow from a card, or, on an empty spot,
   * releasing the selection and clearing the viewer's own arrows, as in the
   * prototype.
   */
  function onTablePointerDown(event: PointerEvent): void {
    const target = event.target as HTMLElement;
    if (interaction.arrowFrom !== null && !interaction.arrowDrag) {
      event.preventDefault();
      event.stopPropagation();
      endArrowAt(tableCardOf(target));
      return;
    }
    // Alt + click pings the spot (spec 5.8); spectators cannot ping.
    if (event.altKey && event.button === 0 && presenceLayer?.ping(event)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const pressed = tableCardOf(target);
    if (event.shiftKey && event.button === 0 && pressed && view.you.role === 'player') {
      // Neither a drag of the card nor a text selection.
      event.preventDefault();
      event.stopPropagation();
      interaction.startArrow(pressed, true);
      return;
    }
    if (isEmptySpot(target)) {
      interaction.release();
      // Ruling P5c-R7: not with another button, nor while scrolling the table with its scrollbars.
      if (event.button === 0 && !onScrollbar(event, target)) {
        clearOwnArrows();
      }
    }
  }

  /** A Shift + drag arrow goes to the card the button is let go over. */
  function onPointerUp(event: PointerEvent): void {
    if (interaction.arrowDrag) {
      endArrowAt(tableCardOf(document.elementFromPoint(event.clientX, event.clientY)));
    }
  }

  function onPointerCancel(): void {
    if (interaction.arrowDrag) {
      interaction.endArrow();
    }
  }

  function onKeydown(event: KeyboardEvent): void {
    handleKey(event, {
      view,
      items: barItems,
      zoom,
      setZoom: zoomWithButtons,
      run: runItem,
      act: send,
      showKeys: showKeySheet,
      canReadyAll,
      sizeOf,
    });
  }

  // ---- The keyboard shortcuts sheet ----

  let keySheetShown = $state(false);
  let keysButton = $state<HTMLButtonElement>();

  function toggleKeySheet(): void {
    keySheetShown = !keySheetShown;
  }

  function showKeySheet(): void {
    keySheetShown = true;
  }

  function hideKeySheet(): void {
    keySheetShown = false;
  }

  function undo(): void {
    act({ kind: 'undo' });
  }

  // The breakpoint of the @media rules below. On a narrow screen the side
  // column goes: the history is not shown.
  const narrow = new MediaQuery('max-width: 900px');

  let wrap = $state<HTMLElement>();
  let app = $state<HTMLElement>();
  let presenceLayer = $state<ReturnType<typeof Presence>>();

  // A new view or a zoom moves the elements under a pointer at rest: the ones
  // it lands on are not hovered by the viewer.
  $effect.pre(() => {
    void view;
    void zoom;
    interaction.redrawn();
  });

  /**
   * Zooms around a point of the screen, keeping the table point under it in
   * place. Without a point, zooms from the left edge, so the decks and
   * identities stay in view.
   */
  async function setZoom(wanted: number, pointX?: number, pointY?: number): Promise<void> {
    const next = clampZoom(wanted);
    if (next === zoom || !wrap) {
      return;
    }
    const box = wrap.getBoundingClientRect();
    const x = pointX ?? box.left;
    const y = pointY ?? box.top + box.height / 2;
    const scale = next / zoom;

    // What lies under the point now, in zoomed px of the surface (past the scroller's padding).
    const underX = wrap.scrollLeft + x - box.left - SCROLL_PADDING;
    const underY = wrap.scrollTop + y - box.top - SCROLL_PADDING;

    zoom = next;
    saveZoom(next);
    await tick();

    wrap.scrollLeft = Math.max(0, SCROLL_PADDING + underX * scale - (x - box.left));
    wrap.scrollTop = Math.max(0, SCROLL_PADDING + underY * scale - (y - box.top));
  }

  // The wheel can zoom finer than the 10 % steps: it keeps its own target so
  // small trackpad moves add up instead of rounding away.
  let wheelTarget: number | null = null;

  function zoomWithButtons(wanted: number): void {
    wheelTarget = null;
    void setZoom(wanted);
  }

  function onWheel(event: WheelEvent): void {
    if (!(event.ctrlKey || event.metaKey)) {
      return;
    }
    event.preventDefault();
    const from = wheelTarget ?? zoom;
    wheelTarget = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, from * Math.exp(-event.deltaY * 0.01)));
    void setZoom(wheelTarget, event.clientX, event.clientY);
  }

  // Not an onwheel attribute: preventing the page zoom needs a non-passive listener.
  $effect(() => {
    if (!wrap) {
      return;
    }
    const target = wrap;
    target.addEventListener('wheel', onWheel, { passive: false });
    return () => target.removeEventListener('wheel', onWheel);
  });
</script>

<!--
  Which player's row "Villain + player" shows: one swatch in each seated player's colour, named
  for screen readers and in its tooltip only, as the name already shows above the player's deck.
-->
{#snippet seatPicker(current: number)}
  <div class="seatpick">
    {#if seats.length > 2}
      <button
        class="btn-ghost step"
        aria-label="Previous player"
        data-tip="Previous player"
        onclick={() => stepSeat(current, -1)}>←</button
      >
    {/if}
    <div
      class="seats"
      role="radiogroup"
      aria-label="Player shown"
      tabindex="-1"
      onkeydown={(event) => onSeatKey(event, current)}
    >
      {#each seatedPlayers as { seat, name, color } (seat)}
        <button
          class="seat"
          style:--seat="var(--p{color + 1})"
          role="radio"
          aria-label={name}
          data-tip={name}
          aria-checked={seat === current}
          tabindex={seat === current ? 0 : -1}
          onclick={() => (pickedSeat = seat)}
        ></button>
      {/each}
    </div>
    {#if seats.length > 2}
      <button
        class="btn-ghost step"
        aria-label="Next player"
        data-tip="Next player"
        onclick={() => stepSeat(current, 1)}>→</button
      >
    {/if}
  </div>
{/snippet}

<svelte:window
  onpointermove={(event) => interaction.pointerMoved(event)}
  onpointerdowncapture={(event) => interaction.pointerPressed(event)}
  onclickcapture={(event) => interaction.clicked(event)}
  onpointerup={onPointerUp}
  onpointercancel={onPointerCancel}
  onkeydown={onKeydown}
  onresize={measureFocus}
/>

<!-- The zoom is set on the whole page, so a layer outside the table (a drag ghost) can follow it. -->
<div
  class="app"
  class:arrowing={interaction.arrowFrom !== null}
  class:dragging={interaction.dragging !== null}
  style:--z={zoom}
  style:--edge="{TABLE_EDGE}px"
  style:--edge-bottom="{TABLE_EDGE_BOTTOM}px"
  bind:this={app}
>
  <div class="top">
    <TopBar
      spectators={view.spectators}
      {crumbs}
      onend={view.you.host ? () => session.lobby('end') : undefined}
      viewMode={seats.length > 1 ? viewMode : undefined}
      onviewmode={changeViewMode}
      readyAll={ownArea
        ? { disabled: !canReadyAll, run: () => act({ kind: 'readyAll' }) }
        : undefined}
    />
  </div>

  <div
    class="tablewrap"
    role="presentation"
    bind:this={wrap}
    bind:clientHeight={visibleHeight}
    bind:clientWidth={visibleWidth}
    onpointerdowncapture={onTablePointerDown}
    onscroll={measureFocus}
  >
    <div class="table">
      <Surface
        cards={tableCards}
        piles={tablePiles}
        {owners}
        {topOf}
        {faceOf}
        barWhenEmpty={hasBarWhenEmpty}
        width={surface.w}
        height={surface.h}
        {firstPlayer}
        tokenMovable={view.you.role === 'player'}
        canDrag={(element) => sourceOf(element, view) !== null}
      />
      <!-- The arrows follow the cards while they move. -->
      <Arrows
        {view}
        root={app}
        layout={[zoom, surface, rowMap, motion.frame]}
        raised={interaction.dragging !== null || interaction.landing !== null || motion.moving}
      />
    </div>
  </div>

  <Presence
    bind:this={presenceLayer}
    {view}
    presence={session.presence}
    send={(fields) => session.sendPresence(fields)}
    root={app}
    {zoom}
    {faceOf}
    {rowMap}
    layout={[surface, rowMap]}
  />

  {#if catalog === 'failed'}
    <p class="notice" role="alert">Card data could not be loaded: cards show as placeholders.</p>
  {/if}

  <!--
    The bottom right corner of the table. Touch screens have no Z key: without the side column,
    Undo floats there, left of the zoom control.
  -->
  <div class="corner" bind:this={cornerBox} bind:clientHeight={cornerHeight}>
    {#if narrow.current}
      <div class="undo">
        <!-- aria-disabled rather than disabled, so that the tooltip saying why still shows. -->
        <button
          class="btn-ghost"
          aria-label="Undo last action"
          data-tip={view.canUndo ? 'Undo last action' : 'Nothing of yours to undo'}
          aria-disabled={!view.canUndo}
          onclick={() => {
            if (view.canUndo) {
              undo();
            }
          }}
        >
          <!-- A hooked arrow going back. -->
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M9 14L4 9l5-5" />
            <path d="M4 9h11a5 5 0 0 1 0 10h-3" />
          </svg>
        </button>
      </div>
    {/if}
    <ZoomControl
      {zoom}
      onzoom={zoomWithButtons}
      onkeys={toggleKeySheet}
      keysShown={keySheetShown}
      bind:keysButton
    />
  </div>

  {#if focused && shownSeat !== null}
    {@render seatPicker(shownSeat)}
  {/if}

  {#if keySheetShown}
    <KeysSheet anchor={keysButton} alignTo={cornerBox} onclose={hideKeySheet} />
  {/if}

  {#if handCards}
    <Hand cards={handCards} {faceOf} narrow={narrow.current} />
  {/if}

  <Flights {faceOf} />

  <DragLayer
    {view}
    {zoom}
    root={app}
    {faceOf}
    {sizeOf}
    {rowMap}
    {act}
    ondrag={(drag) => session.sendPresence({ drag })}
    lastError={session.lastError}
  />

  {#if barShown && wrap}
    <ActionBar
      anchor={anchorOf}
      items={barItems}
      hint={interaction.arrowFrom !== null ? ARROW_HINT : undefined}
      bounds={wrap}
      {zoom}
      onrun={runItem}
    />
  {/if}

  {#if counterShown}
    <TokenPill
      anchor={counterAnchor}
      label={counterName(counterShown.target.kind, counterShown.target.name)}
      value={counterShown.value}
      {zoom}
      version={view}
      onstep={stepCounter}
    />
  {/if}

  {#if shownBox}
    {#key boxKey}
      <CardBox
        box={shownBox}
        {view}
        {facesOf}
        {sizeOf}
        readOnly={view.you.role !== 'player'}
        {act}
        onclose={closeBox}
      />
    {/key}
  {/if}

  {#if asking}
    <AskCount
      title={asking.title}
      question={asking.question}
      max={askedMax}
      ok={asking.ok}
      onconfirm={answer}
      oncancel={() => (asking = null)}
    />
  {/if}

  <Tooltip />

  {#if !narrow.current}
    <aside class="side" aria-label="History">
      <SidePanel log={view.log} canUndo={view.canUndo} onundo={undo} />
    </aside>
  {/if}

  {#if drawnPreview}
    <!-- Created again in its new corner: it fades in there. -->
    {#key focusCorner}
      <div
        class="peek {focusCorner}"
        class:land={drawnPreview.landscape}
        class:leaving={!preview}
        style:margin={focusMargin(focusCorner)}
        bind:offsetWidth={focusWidth}
        bind:offsetHeight={focusHeight}
      >
        <CardPreview preview={drawnPreview} snug hidden={!preview} />
      </div>
    {/key}
  {/if}
</div>

<style>
  /* While the table shows, the page is exactly the window and never scrolls. */
  :global(html.fixed-screen),
  :global(html.fixed-screen body) {
    height: 100%;
    overflow: hidden;
    overscroll-behavior: none;
  }

  /*
    Exactly the window. What lies past its edges, as the resting hand lowered under the bottom, is
    clipped: it never reaches the page, which would scroll.
  */
  .app {
    display: grid;
    height: 100vh;
    height: 100dvh;
    overflow: clip;
    grid-template-rows: auto minmax(0, 1fr);
    grid-template-columns: minmax(0, 1fr) 320px;
    grid-template-areas:
      'top top'
      'table side';
  }

  .top {
    grid-area: top;
  }

  /*
    No stacking context of its own: the arrows inside it stack with the page's layers
    (Arrows.svelte), while the surface isolates the cards' own z-indexes.
  */
  .tablewrap {
    grid-area: table;
    overflow: auto;
    scrollbar-width: thin;
    scrollbar-color: #2c3654 transparent;
    position: relative;
    background: var(--table-bg);
    min-width: 0;
  }

  /* As wide and tall as the surface, which the padding keeps off the scroller's edges. */
  .table {
    position: relative;
    width: max-content;
    padding: 24px;
  }

  /*
    Rings drawn around the cut card, for cards and piles alike (the cut would clip them on the
    image): the ring of a tap selection, the white ring of the cards of the hovered history line,
    and the drop outlines.
  */
  .table :global(.card.locked)::before,
  .table :global(.card.hovered)::before,
  .table :global(.card.highlighted)::before,
  .table :global(.card.drop-target)::before,
  .table :global(.card.drop-pile)::before {
    content: '';
    position: absolute;
    inset: 1%;
    border-radius: 7px;
    pointer-events: none;
    z-index: 1;
  }

  /* The selection glows in the signal blue: a ring, then a soft halo. */
  .table :global(.card.locked)::before {
    box-shadow:
      0 0 0 2px var(--sel),
      0 0 0 7px #49c6ff38;
  }

  /* The hovered card or pile, whose bar shows, has the same white ring as the prototype's. */
  .table :global(.card.hovered)::before,
  .table :global(.card.highlighted)::before {
    box-shadow:
      0 0 0 2px #ffffffb0,
      0 0 22px 6px #ffffff38;
  }

  /* Where a drop would go: under a card (the prototype's threat orange), or onto a pile. */
  .table :global(.card.drop-target)::before {
    outline: 3px dashed var(--warn);
    outline-offset: 2px;
  }

  .table :global(.card.drop-pile)::before {
    outline: 3px dashed var(--sel);
    outline-offset: 3px;
  }

  /* The 10-unit grid shows more clearly while something is dragged. */
  .app.dragging {
    --dot: #34405f;
  }

  /*
    Whatever lies under the pointer while something is dragged, the pointer holds it. Important:
    the grab and pointer cursors of the cards and piles are set by their own components.
  */
  .app.dragging,
  .app.dragging :global(*) {
    cursor: grabbing !important;
  }

  /* Picking the card an arrow points at. */
  .app.arrowing :global(.surface .card) {
    cursor: crosshair;
  }

  .side {
    grid-area: side;
    display: flex;
    flex-direction: column;
    background: var(--bg);
    border-left: 1px solid var(--panel-2);
    min-height: 0;
  }

  .notice {
    grid-area: table;
    align-self: start;
    justify-self: center;
    z-index: 40;
    margin: 8px 0 0;
    padding: 4px 14px;
    background: var(--panel-2);
    border: 1px solid var(--accent);
    border-radius: 999px;
    font-size: 13px;
  }

  /* As the zoom control, at the other corner: under the veil and the raised hand. */
  /* At the bottom left, as the zoom control at the bottom right: under the veil and the hand. */
  .seatpick {
    grid-area: table;
    align-self: end;
    justify-self: start;
    z-index: 30;
    margin: 0 0 var(--edge-bottom) var(--edge);
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px;
    background: #141a28eb;
    border: 1px solid var(--line);
    border-radius: 12px;
    box-shadow: 0 6px 16px #0008;
  }

  .seatpick .step {
    height: 28px;
    padding: 0 8px;
    border: none;
    border-radius: 8px;
    color: #c9cfdf;
  }

  /* A round swatch of the seat colour; the player shown is ringed. */
  .seatpick .seats {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .seatpick .seat {
    width: 18px;
    height: 18px;
    margin: 5px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: var(--seat);
    opacity: 0.6;
  }

  .seatpick .seat:hover {
    opacity: 1;
  }

  .seatpick .seat[aria-checked='true'] {
    opacity: 1;
    box-shadow:
      0 0 0 2px #141a28,
      0 0 0 4px var(--seat);
  }

  /* As the zoom control: under the veil and the raised hand. */
  .corner {
    grid-area: table;
    align-self: end;
    justify-self: end;
    z-index: 30;
    margin: 0 var(--edge) var(--edge-bottom) 0;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .undo {
    padding: 4px;
    background: #141a28eb;
    border: 1px solid var(--line);
    border-radius: 12px;
    box-shadow: 0 6px 16px #0008;
  }

  .undo button {
    width: 32px;
    height: 32px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 8px;
    color: #c9cfdf;
  }

  .undo svg {
    width: 18px;
    height: 18px;
  }

  @media (max-width: 900px) {
    .app {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas:
        'top'
        'table';
    }
  }

  /*
    The preview, at the bottom right of the table above the zoom control, still while the table
    scrolls under it. As the zoom control: over the table, under the other players' presence
    (2500), the veil and the raised hand (2600). Never so tall that it leaves the table; the
    pointer goes through it.
  */
  .peek {
    grid-area: table;
    align-self: start;
    justify-self: end;
    z-index: 30;
    position: relative;
    /*
      A 300 px wide portrait card in its 10 px padding, never wider than 45 % of the table, nor
      so tall that it reaches the zoom control: the top bar and the corners keep 200 px.
    */
    width: min(320px, 45%, calc((100dvh - 200px) * 5 / 7 + 20px));
    padding: 10px;
    background: var(--panel);
    border: 1px solid var(--line-strong);
    border-radius: 14px;
    box-shadow: 0 14px 36px #000000a6;
    pointer-events: none;
  }

  /* A landscape card: 420 px wide. */
  .peek.land {
    width: min(440px, 45%);
  }

  /* Out of the pointer's and the hovered card's way, in another corner (focus.ts). */
  .peek.top-left,
  .peek.bottom-left {
    justify-self: start;
  }

  .peek.bottom-left,
  .peek.bottom-right {
    align-self: end;
  }

  /* It fades in as it shows, or at its new corner, and out as it goes (PREVIEW_FADE_MS). */
  .peek {
    animation: focus-in 0.11s ease-out;
  }

  .peek.leaving {
    animation: focus-out 0.11s ease-in forwards;
  }

  @keyframes focus-in {
    from {
      opacity: 0;
    }
  }

  @keyframes focus-out {
    to {
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .peek,
    .peek.leaving {
      animation: none;
    }
  }
</style>
