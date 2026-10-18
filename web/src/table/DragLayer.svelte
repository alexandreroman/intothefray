<!--
  Drag and drop (spec 5.4). A press on a table card, a pile, a hand card or
  the first player token becomes a drag after 4 px: what is dragged is drawn
  here, over the whole page at the table's zoom, outside the zone surfaces,
  so that new views redrawing the table leave it alone. The drop targets are
  measured on the screen and drag.ts decides what the drop sends. Once
  dropped, it stays drawn where it landed until the server answers.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import type {
    Action,
    Area,
    CardView as TableCard,
    PackFace,
    SessionError,
    Size,
    View,
  } from '../lib/types';
  import CardBack from './CardBack.svelte';
  import CardFace from './CardFace.svelte';
  import CardView from './CardView.svelte';
  import FirstPlayerToken from './FirstPlayerToken.svelte';
  import {
    contains,
    DRAG_THRESHOLD,
    dropAction,
    dropTarget,
    goesToHand,
    handBand,
    insertIndex,
    intersect,
    pileTargets,
    sourceOf,
    stackOf,
    tucks,
    type DragSource,
    type DropRect,
    type PileDrop,
    type Point,
    type Rect,
    type ZoneRect,
  } from './drag';
  import { isHidden } from './face';
  import { interaction, type DropOn, type Held } from './interaction.svelte';
  import { cardBox, FIRST_PLAYER_BOX, HAND_CARD, type Box } from './layout';

  let {
    view,
    zoom,
    root,
    faceOf,
    sizeOf,
    act,
    lastError,
  }: {
    view: View;
    zoom: number;
    /** The page the table is drawn in: the zones, the piles and the hand are measured there. */
    root: HTMLElement | undefined;
    faceOf: (card: TableCard | undefined) => PackFace | null;
    sizeOf: (card: TableCard) => Size;
    /** Sends a drop's action: its id, or null when it could not be sent. */
    act: (action: Action) => number | null;
    /** The session's last error, which names the action it refuses. */
    lastError: SessionError | null;
  } = $props();

  // The encounter deck's top card is not known: its ghost is a face-down card.
  const ENCOUNTER_TOP: TableCard = {
    id: 'encounter-top',
    face: 0,
    faceDown: true,
    back: 'encounter',
    owner: -1,
    zone: 'table',
    x: 0,
    y: 0,
    z: 0,
  };

  /** The pointer during a drag, on the screen. */
  let pointer = $state<Point | null>(null);
  /** Where the pointer holds the dragged card, as fractions of its width and height. */
  let grab: Point = { x: 0.5, y: 0.5 };
  /** The size of a hand card as it was grabbed, on the screen. */
  let handSize: { w: number; h: number } = { w: HAND_CARD.w, h: HAND_CARD.h };
  /** The label above the drop target. */
  let hint = $state<{ glyph: string; text: string; tuck: boolean; x: number; y: number } | null>(
    null,
  );

  // The prototype's arrows in front of the labels.
  const PILE_GLYPHS: Record<PileDrop, string> = { top: '↑', discard: '✕', pile: '→' };
  const TUCK_GLYPH = '↓';
  const HAND_GLYPH = '↓';

  const cards = $derived(view.table?.cards ?? []);
  const cardsById = $derived(new Map(cards.map((card) => [card.id, card])));
  /**
   * The ghosts of the last drop, set down where it landed (the cards, or the
   * first player token's corner, in table units of the layer), the action
   * they wait for, and the view they were dropped on.
   */
  let landed = $state.raw<{
    action: number;
    ghosts: TableCard[];
    token: Point | null;
    view: View;
  } | null>(null);

  const held = $derived(interaction.dragging);
  // Read from the current view at every redraw: the drag follows its card by id.
  const source = $derived(held ? sourceOf(held.element, view, held.card ?? undefined) : null);
  const overHand = $derived(interaction.handGap !== null);

  /** The card a source moves; null for the encounter deck's hidden top card and the token. */
  function movedCard(from: DragSource): string | null {
    return from.kind === 'encounter' || from.kind === 'firstPlayer' ? null : from.card;
  }

  /** Whether the dragged thing is still there in the view, the same card as when the drag started. */
  function isStillThere(drag: Held, from: DragSource | null): from is DragSource {
    return from !== null && movedCard(from) === drag.card;
  }

  // A new view keeps the drag going. When the dragged card left the table,
  // the hand or its pile meanwhile, it is cancelled and the drop will send
  // nothing.
  $effect(() => {
    if (held && !isStillThere(held, source)) {
      end();
    }
  });

  // The next view shows where the last drop went (or that it went nowhere):
  // its cards are drawn from the view again.
  $effect.pre(() => {
    const current = view;
    untrack(() => {
      if (landed && landed.view !== current) {
        landed = null;
        interaction.endLanding();
      }
    });
  });

  $effect(() => {
    const refused = lastError?.id;
    if (refused !== undefined) {
      untrack(() => interaction.refused(refused));
    }
  });

  function onMove(event: PointerEvent): void {
    const pressed = interaction.held;
    if (!pressed || event.pointerId !== pressed.pointerId) {
      return;
    }
    // No button down any more: it was let go outside the window, and its pointerup was missed.
    if (event.buttons === 0) {
      end();
      return;
    }
    const at = { x: event.clientX, y: event.clientY };
    if (!pressed.moved) {
      if (Math.hypot(at.x - pressed.start.x, at.y - pressed.start.y) < DRAG_THRESHOLD) {
        return;
      }
      const from = sourceOf(pressed.element, view);
      if (!from) {
        // Not draggable, or a spectator: the press stays a press.
        interaction.letGo();
        return;
      }
      start(from, pressed.start);
    }
    pointer = at;
    aim();
  }

  function start(from: DragSource, pressedAt: Point): void {
    grab = grabOf(from, pressedAt);
    let lifted: string[] = [];
    if (from.kind === 'card') {
      lifted = stackOf(from.card, cards);
    } else if (from.kind === 'hand') {
      lifted = [from.card];
    }
    interaction.lift(movedCard(from), lifted);
  }

  /** Where the press holds the card, so that it stays under the pointer the same way. */
  function grabOf(from: DragSource, pressedAt: Point): Point {
    if (from.kind === 'card') {
      const card = cardsById.get(from.card);
      const surface = surfaceRect(from.area);
      if (card && surface) {
        const box = boxOf(from);
        return {
          x: (pressedAt.x - (surface.left + card.x * zoom)) / (box.w * zoom),
          y: (pressedAt.y - (surface.top + card.y * zoom)) / (box.h * zoom),
        };
      }
    }
    if (from.kind === 'firstPlayer') {
      const token = root?.querySelector('.surface .fptoken')?.getBoundingClientRect();
      if (token && token.width > 0 && token.height > 0) {
        return {
          x: (pressedAt.x - token.left) / token.width,
          y: (pressedAt.y - token.top) / token.height,
        };
      }
    }
    if (from.kind === 'hand') {
      const fan = root
        ?.querySelector(`.hand .hcard[data-id="${from.card}"] .fan`)
        ?.getBoundingClientRect();
      if (fan && fan.width > 0 && fan.height > 0) {
        handSize = { w: fan.width, h: fan.height };
        return { x: (pressedAt.x - fan.left) / fan.width, y: (pressedAt.y - fan.top) / fan.height };
      }
      handSize = { w: HAND_CARD.w, h: HAND_CARD.h };
    }
    // A pile's card is held by its middle, as in the prototype.
    return { x: 0.5, y: 0.5 };
  }

  /** The box of the dragged card on the table, in table units. */
  function boxOf(from: DragSource): Box {
    if (from.kind === 'firstPlayer') {
      return { ...FIRST_PLAYER_BOX, rotated: false };
    }
    if (from.kind === 'encounter') {
      return cardBox('std', { faceDown: true });
    }
    const card = cardsById.get(from.card);
    if (!card) {
      return cardBox('std', {});
    }
    // A table card keeps the box it has there; a card from the hand or a pile comes into play face up.
    if (from.kind === 'card') {
      return cardBox(sizeOf(card), { faceDown: card.faceDown, onPile: !!card.onPile });
    }
    return cardBox(sizeOf(card), {});
  }

  /** The top-left corner of the dragged card at table size, on the screen. */
  function cornerOf(from: DragSource, at: Point): Point {
    const box = boxOf(from);
    return { x: at.x - grab.x * box.w * zoom, y: at.y - grab.y * box.h * zoom };
  }

  /** Where a drop at the point leaves the dragged card's corner: on its grid spot when the action places it. */
  function landingCorner(from: DragSource, action: Action, at: Point): Point {
    const surface = action.area ? surfaceRect(action.area) : undefined;
    if (!surface || action.x === undefined || action.y === undefined) {
      return cornerOf(from, at);
    }
    return { x: surface.left + action.x * zoom, y: surface.top + action.y * zoom };
  }

  function surfaceRect(area: Area): DOMRect | undefined {
    return root?.querySelector(`.zsec[data-area="${area}"] .surface`)?.getBoundingClientRect();
  }

  function placedRect(selector: string, id: string): DOMRect | undefined {
    return root?.querySelector(`.surface ${selector}[data-id="${id}"]`)?.getBoundingClientRect();
  }

  /** Everything the dragged thing can be dropped on, measured on the screen. */
  function targetsFor(from: DragSource, at: Point): DropRect[] {
    const table = root?.querySelector('.tablewrap')?.getBoundingClientRect();
    if (!root || !table) {
      return [];
    }
    const targets: DropRect[] = [];
    if (from.kind === 'hand') {
      const others = [...root.querySelectorAll<HTMLElement>('.hand .hcard:not(.gap)')]
        .filter((element) => element.dataset.id !== from.card)
        .map((element) => element.getBoundingClientRect());
      const middles = others.map((rect) => (rect.left + rect.right) / 2);
      targets.push({
        kind: 'hand',
        index: insertIndex(middles, at.x),
        rect: handBand(others, table, window.innerHeight),
      });
    } else if (goesToHand(from, view)) {
      const hand = [...root.querySelectorAll<HTMLElement>('.hand .hcard')].map((element) =>
        element.getBoundingClientRect(),
      );
      targets.push({ kind: 'toHand', rect: handBand(hand, table, window.innerHeight) });
    }
    const zones: ZoneRect[] = [...root.querySelectorAll<HTMLElement>('.zsec[data-area]')].map(
      (section) => ({
        kind: 'zone',
        area: section.dataset.area as Area,
        rect: intersect(section.getBoundingClientRect(), table),
      }),
    );
    targets.push(...zones);
    // The token lies anywhere in a zone, over cards and piles alike.
    if (from.kind === 'firstPlayer') {
      return targets;
    }

    // Only the zone under the pointer takes the drop: its piles and cards are the only ones measured.
    const under = zones.find((zone) => contains(zone.rect, at));
    if (!under) {
      return targets;
    }
    for (const target of pileTargets(from, view)) {
      const pile = view.table?.piles.find((p) => p.id === target.pile);
      const rect = pile?.area === under.area ? placedRect('.pile', target.pile) : undefined;
      if (pile && rect) {
        targets.push({ kind: 'pile', ...target, area: pile.area, rect });
      }
    }
    const lifted = interaction.dragging?.lifted ?? [];
    for (const card of cards) {
      if (card.zone !== 'table' || card.area !== under.area || lifted.includes(card.id)) {
        continue;
      }
      const rect = placedRect('.card:not(.pile)', card.id);
      if (rect) {
        targets.push({ kind: 'card', card: card.id, area: under.area, z: card.z, rect });
      }
    }
    return targets;
  }

  /** What a drop at the pointer lands on, and the action it sends, null when nothing. */
  function locate(from: DragSource, at: Point): { target: DropRect; action: Action | null } | null {
    const target = dropTarget(at, targetsFor(from, at));
    const own = view.you.area;
    if (!target || !own) {
      return null;
    }
    // A reorder of the hand happens in the viewer's own area; it needs no spot.
    const area = 'area' in target ? target.area : own;
    const surface = surfaceRect(area);
    const corner = cornerOf(from, at);
    const spot = surface
      ? { area, x: (corner.x - surface.left) / zoom, y: (corner.y - surface.top) / zoom }
      : { area, x: 0, y: 0 };
    return { target, action: dropAction(from, target, spot) };
  }

  /** Outlines and labels what the drop would land on, and opens the gap in the hand. */
  function aim(): void {
    if (!source || !pointer) {
      return;
    }
    const found = locate(source, pointer);
    interaction.handGap = found?.target.kind === 'hand' ? found.target.index : null;
    // Only what a drop would change is outlined: not the pile a card came from.
    const target = found?.action ? found.target : null;
    if (target?.kind === 'toHand' && view.you.area) {
      const label = { glyph: HAND_GLYPH, text: 'Hand', tuck: false };
      showHint({ kind: 'hand', id: view.you.area }, label, target.rect);
    } else if (target?.kind === 'pile') {
      const label = { glyph: PILE_GLYPHS[target.drop], text: target.label, tuck: false };
      showHint({ kind: 'pile', id: target.pile }, label, target.rect);
    } else if (target?.kind === 'card' && found?.action && tucks(found.action)) {
      const name = faceOf(cardsById.get(target.card))?.name ?? 'a card';
      const label = { glyph: TUCK_GLYPH, text: `Under ${name}`, tuck: true };
      showHint({ kind: 'card', id: target.card }, label, target.rect);
    } else {
      interaction.dropOn = null;
      hint = null;
    }
  }

  function showHint(
    on: DropOn,
    label: { glyph: string; text: string; tuck: boolean },
    rect: Rect,
  ): void {
    if (interaction.dropOn?.kind !== on.kind || interaction.dropOn.id !== on.id) {
      interaction.dropOn = on;
    }
    hint = { ...label, x: (rect.left + rect.right) / 2, y: rect.top - 8 };
  }

  function onUp(event: PointerEvent): void {
    const pressed = interaction.held;
    if (!pressed || event.pointerId !== pressed.pointerId) {
      return;
    }
    if (!pressed.moved) {
      // A tap or a click: the click selects.
      interaction.letGo();
      return;
    }
    const from = sourceOf(pressed.element, view, pressed.card ?? undefined);
    const at = { x: event.clientX, y: event.clientY };
    const action = isStillThere(pressed, from) ? locate(from, at)?.action : null;
    end();
    // The click this release fires is the end of the drag, not a tap on what lies there.
    interaction.swallowNextClick();
    if (!from || !action) {
      return;
    }
    const sent = act(action);
    if (sent !== null) {
      land(sent, pressed, from, action, at);
    }
  }

  /**
   * Keeps what was dropped in place until the server answers: a reordered
   * hand in its new order, any other drop as ghosts where it landed.
   */
  function land(sent: number, pressed: Held, from: DragSource, action: Action, at: Point): void {
    const reorder = action.kind === 'handOrder';
    const corner = landingCorner(from, action, at);
    landed = {
      action: sent,
      ghosts: reorder ? [] : ghostsAt(from, corner),
      token: from.kind === 'firstPlayer' ? { x: corner.x / zoom, y: corner.y / zoom } : null,
      view,
    };
    interaction.land({
      action: sent,
      element: pressed.element,
      card: pressed.card,
      lifted: reorder ? [] : pressed.lifted,
      handOrder: reorder ? (action.cards ?? null) : null,
    });
  }

  function onCancel(event: PointerEvent): void {
    if (interaction.held?.pointerId === event.pointerId) {
      end();
    }
  }

  /** The drag is over: dropped, or cancelled. */
  function end(): void {
    interaction.letGo();
    pointer = null;
    hint = null;
  }

  /**
   * The cards drawn at table size for the dragged card's corner at that point
   * of the screen, in table units of the zoomed layer.
   */
  function ghostsAt(from: DragSource, corner: Point): TableCard[] {
    const x = corner.x / zoom;
    const y = corner.y / zoom;
    if (from.kind === 'firstPlayer') {
      return [];
    }
    if (from.kind === 'encounter') {
      return [{ ...ENCOUNTER_TOP, x, y }];
    }
    const card = cardsById.get(from.card);
    if (!card) {
      return [];
    }
    if (from.kind !== 'card') {
      return [{ ...card, zone: 'table', x, y, onPile: undefined, parent: undefined }];
    }
    // The cards tucked under it keep their offsets.
    return stackOf(card.id, cards).flatMap((id) => {
      const k = cardsById.get(id);
      return k ? [{ ...k, x: x + k.x - card.x, y: y + k.y - card.y }] : [];
    });
  }

  /** The cards drawn under the pointer. */
  const ghosts = $derived(pointer && source ? ghostsAt(source, cornerOf(source, pointer)) : []);

  /** The first player token under the pointer, its corner in table units of the layer. */
  const tokenGhost = $derived.by(() => {
    if (!pointer || source?.kind !== 'firstPlayer') {
      return null;
    }
    const corner = cornerOf(source, pointer);
    return { x: corner.x / zoom, y: corner.y / zoom };
  });

  /** The last drop, while it waits for the server. */
  const waiting = $derived(landed && interaction.landing?.action === landed.action ? landed : null);
  const landedGhosts = $derived(waiting?.ghosts ?? []);

  /** The dragged hand card at hand size, while it is over the hand. */
  const handGhost = $derived.by(() => {
    if (!pointer || source?.kind !== 'hand' || !overHand) {
      return null;
    }
    const card = cardsById.get(source.card);
    return card
      ? {
          card,
          left: (pointer.x - grab.x * handSize.w) / zoom,
          top: (pointer.y - grab.y * handSize.h) / zoom,
          width: handSize.w / zoom,
          height: handSize.h / zoom,
        }
      : null;
  });
</script>

<svelte:window onpointermove={onMove} onpointerup={onUp} onpointercancel={onCancel} />

<!-- The ghosts repeat what is dragged, for the eyes only. -->
<div class="draglayer" aria-hidden="true">
  {#if handGhost}
    {@const face = faceOf(handGhost.card)}
    <div
      class="hghost"
      style:left="{handGhost.left}px"
      style:top="{handGhost.top}px"
      style:width="{handGhost.width}px"
      style:height="{handGhost.height}px"
    >
      {#if isHidden(handGhost.card)}
        <CardBack back={handGhost.card.back} />
      {:else}
        <CardFace
          images={face?.images ?? []}
          name={face?.name ?? ''}
          rotated={cardBox(face?.size ?? 'std', { onPile: true }).rotated}
        />
      {/if}
    </div>
  {:else}
    {#each ghosts as ghost (ghost.id)}
      <CardView card={ghost} face={faceOf(ghost)} ghost />
    {/each}
  {/if}
  {#each landedGhosts as ghost (ghost.id)}
    <CardView card={ghost} face={faceOf(ghost)} ghost landed />
  {/each}
  {#if tokenGhost}
    <FirstPlayerToken x={tokenGhost.x} y={tokenGhost.y} ghost />
  {:else if waiting?.token}
    <FirstPlayerToken x={waiting.token.x} y={waiting.token.y} />
  {/if}
</div>

{#if hint}
  <div class="drop-hint" class:tuck={hint.tuck} style:left="{hint.x}px" style:top="{hint.y}px">
    <span aria-hidden="true">{hint.glyph}</span>
    {hint.text}
  </div>
{/if}

<style>
  /* Over the whole page, at the table's zoom: positions inside are in table units. */
  .draglayer {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 3000;
    zoom: var(--z, 1);
  }

  /* A hand card brought back over the hand: hand size, growing to table size as it leaves. */
  .hghost {
    position: absolute;
    transition:
      width 0.14s ease-out,
      height 0.14s ease-out;
    filter: drop-shadow(2px 2px 3px #000000a0) drop-shadow(7px 7px 10px #00000060);
  }

  /* Above everything, the dragged card included. */
  .drop-hint {
    position: fixed;
    z-index: 10000;
    transform: translate(-50%, -100%);
    pointer-events: none;
    box-shadow: 0 4px 12px #000a;
    background: var(--sel);
    color: #04121a;
    font:
      700 12px/1 system-ui,
      sans-serif;
    padding: 5px 9px;
    border-radius: 999px;
    white-space: nowrap;
  }

  /* Tucking under a card: the prototype's threat orange. */
  .drop-hint.tuck {
    background: var(--warn);
    color: #2b1700;
  }
</style>
