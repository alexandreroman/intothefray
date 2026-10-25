<!--
  The other players at the table (spec 5.8): their cursors, the card each one
  previews, their pings and their drags, drawn over the table (the table
  cards or the markers they drag hidden in their places meanwhile). It also tells them about the viewer's own cursor, preview and
  pings; DragLayer tells them about the viewer's drags. While the viewer is
  away from the table (hand raised, dialog open), their cursor is hidden from
  the others: nothing tells where the pointer goes in the hand or in the
  dialog. Spectators send nothing, as no player draws them (ruling P5c-R2:
  the server refuses their presence).

  Spots travel as table units of the surface (screen.ts). Messages can come in
  floods: the session keeps only the latest state of each player, and the
  layer draws them all in one pass per animation frame. Moves come once per
  throttle interval at most (session.svelte.ts, and the "Presence message
  budget" project memory note): cursors and drags glide between them over
  that interval, but follow the table at once as it scrolls, zooms or
  resizes.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { playerColorVar } from '../lib/playerColor';
  import { PRESENCE_INTERVAL_MS } from '../lib/session.svelte';
  import type {
    CardView as TableCard,
    MarkerName,
    PackFace,
    Point,
    PresenceDrag,
    PresenceFields,
    PresencePoint,
    PresenceState,
    View,
  } from '../lib/types';
  import { MARKERS, markerPoint } from '../lib/types';
  import CardView from './CardView.svelte';
  import { contains } from './drag';
  import MarkerToken from './MarkerToken.svelte';
  import { backCaption, pileBack } from './face';
  import { interaction } from './interaction.svelte';
  import { ALL_ROWS, type RowMap } from './rows';
  import { scrollerRect, surfaceRect, toScreen, toTable } from './screen';

  let {
    view,
    presence,
    send,
    away,
    root,
    zoom,
    faceOf,
    rowMap = ALL_ROWS,
    layout,
  }: {
    view: View;
    /** The latest state of each other player, by colour. */
    presence: ReadonlyMap<number, PresenceState>;
    /** Sends the viewer's own presence; the session throttles it. */
    send: (fields: PresenceFields) => void;
    /** Whether the viewer is away from the table: their hand raised, or a dialog open. */
    away: boolean;
    /** The page: the surface and its cards are measured there. */
    root: HTMLElement | undefined;
    zoom: number;
    faceOf: (card: TableCard | undefined) => PackFace | null;
    /** Where the view mode draws the heights of the table (rows.ts). */
    rowMap?: RowMap;
    /** What moves the cards on the screen without a new view (the surface size): redrawn on change. */
    layout: unknown;
  } = $props();

  /** A cursor silent for this long is hidden: its player left their screen. */
  const CURSOR_STALE_MS = 10_000;
  /**
   * A preview or a drag stays until its player clears it (ruling P5c-R8),
   * or for this long without a message: their connection is lost.
   */
  const LOST_MS = 60_000;
  /** How long a ping's rings expand. */
  const PING_MS = 1200;
  /**
   * How long a drag that ended keeps its ghost where it was let go, its cards
   * hidden in their places, waiting for the view that shows where they went.
   * Without one, it was cancelled or refused: the cards show in their places
   * again.
   */
  const LANDING_MS = 2000;
  // The prototype's room at the table's edges for a cursor scrolled out of view. At the right and
  // bottom edges, the room keeps the pointer and its name label in view.
  const EDGE_IN = 8;
  const RIGHT_EDGE_ROOM = 70;
  const LEFT_EDGE_ROOM = 4;
  const BOTTOM_EDGE_ROOM = 44;
  const TOP_EDGE_ROOM = 4;

  /** Where something lies on the layer, in screen pixels. */
  interface Placed {
    x: number;
    y: number;
    /**
     * Arrows towards a cursor held at the table's edges, when its spot is scrolled out of view:
     * " ↑", " →", " ↓ ←"…, and '' when it shows.
     */
    side: string;
  }

  interface Ping {
    key: number;
    color: number;
    spot: PresencePoint;
    /** When its rings are done, in ms since the epoch. */
    until: number;
  }

  /** Where a dragged table card lay as the drag started; a drop that moves it changes that. */
  interface Spot {
    zone: TableCard['zone'];
    x: number;
    y: number;
    parent?: string;
    onPile?: string;
  }

  /** Another player's drag under way: its cards, or a marker, as they lay when it started. */
  interface Dragging {
    /**
     * Tells this drag from the player's earlier ones, whose ghosts may carry the same ids (a pile, a
     * hidden card): a new drag draws new ghosts, never gliding from where the last one landed.
     */
    key: number;
    drag: PresenceDrag;
    from: Map<string, Spot>;
    /** The table cards as it started: a card taken from a pile or a hand is new to it once dropped. */
    onTable: Set<string>;
    /** Where the dragged marker lay as it started. */
    token: Point | undefined;
  }

  /** Another player's drag let go: its ghost stays where it was until the view moves its cards. */
  interface Landing extends Dragging {
    until: number;
    /** The view as it was let go. */
    view: View;
  }

  interface Drawn {
    cursors: (Placed & { color: number; name: string })[];
    /** The cards of each drag, in table units of the zoomed ghost layer. */
    ghosts: { key: number; cards: TableCard[] }[];
    /** The corner of each drag of a marker, in table units of the zoomed ghost layer. */
    tokens: (Point & { key: number; name: MarkerName })[];
    pings: (Placed & { key: number; color: number })[];
  }

  let layer = $state<HTMLElement>();
  let drawn = $state.raw<Drawn>({ cursors: [], ghosts: [], tokens: [], pings: [] });
  /**
   * Whether the last pass drew new spots, which glide, rather than the table moving under the
   * spots (a scroll, a zoom, a resize, a new view), which they follow at once: gliding, they would
   * trail behind the table.
   */
  let glide = $state(true);
  /** Whether the table moved under the spots since the last pass. Read by the drawing pass only. */
  let tableMoved = false;
  // Read by the drawing pass only, which runs outside any effect: plain values, not state.
  let pings: Ping[] = [];
  let nextPing = 0;
  /** The time of the last ping drawn, by colour. */
  const pingsSeen: Record<number, number> = {};
  /** Wakes the drawing pass when the next player falls silent or the next ping is done. */
  let wakeTimer: ReturnType<typeof setTimeout> | undefined;
  let frame = 0;
  let nextDrag = 0;
  // Read and written outside any effect's dependencies: plain values, not state. By colour.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const draggings = new Map<number, Dragging>();
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const landings = new Map<number, Landing>();

  const isPlayer = $derived(view.you.role === 'player');

  // ---- The viewer's own presence ----

  /** The spot of the table under a point of the screen. Null outside the table. */
  function spotAt(at: { x: number; y: number }): PresencePoint | null {
    const table = scrollerRect(root);
    const surface = surfaceRect(root);
    if (!table || !surface || !contains(table, at)) {
      return null;
    }
    // The server takes whole table units only.
    const point = toTable(at, surface, zoom);
    return { x: Math.round(point.x), y: Math.round(rowMap.toTable(point.y)) };
  }

  function onPointerMove(event: PointerEvent): void {
    if (!isPlayer) {
      return;
    }
    const cursor = spotAt({ x: event.clientX, y: event.clientY });
    if (!cursor) {
      return;
    }
    // The hand (Hand.svelte) has already decided on this move, in the capture phase that runs
    // before this listener: the move that raises it must not tell the others where the pointer
    // went, while the move that lowers it shows the cursor again.
    if (!away) {
      send({ cursor });
    }
  }

  /**
   * Alt + click: pings the spot under the press, for the other players and
   * the viewer alike. Returns whether it pinged; spectators cannot.
   */
  export function ping(event: PointerEvent): boolean {
    const spot = isPlayer ? spotAt({ x: event.clientX, y: event.clientY }) : null;
    if (!spot) {
      return false;
    }
    send({ ping: spot });
    showPing(view.you.color, spot);
    return true;
  }

  // Away from the table, the cursor is hidden at once, before the pointer moves on: the next
  // move back on the table shows it again.
  $effect(() => {
    if (isPlayer && away) {
      send({ cursor: null });
    }
  });

  // The preview others see: a table card or a pile, never a hand card, which is private.
  let previewSent = '';
  $effect(() => {
    const previewed = interaction.previewed;
    const preview = previewed && previewed.kind !== 'hand' ? previewed.id : '';
    if (isPlayer && preview !== previewSent) {
      previewSent = preview;
      send({ preview });
    }
  });

  // ---- Other players' presence ----

  function showPing(color: number, spot: PresencePoint, at = Date.now()): void {
    pings.push({ key: nextPing++, color, spot, until: at + PING_MS });
    schedule();
  }

  /** Where the view lays the table cards of a drag, by id. */
  function spotsOf(drag: PresenceDrag): Map<string, Spot> {
    // A value computed and compared at once: nothing reacts to it.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const spots = new Map<string, Spot>();
    for (const card of view.table?.cards ?? []) {
      if (card.zone === 'table' && drag.cards.includes(card.id)) {
        const { zone, x, y, parent, onPile } = card;
        spots.set(card.id, { zone, x, y, parent, onPile });
      }
    }
    return spots;
  }

  /** The ids of the table cards of the view. */
  function tableCardIds(): Set<string> {
    // A value computed and compared at once: nothing reacts to it.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const ids = new Set<string>();
    for (const card of view.table?.cards ?? []) {
      if (card.zone === 'table') {
        ids.add(card.id);
      }
    }
    return ids;
  }

  /**
   * Whether the drag carries a card that did not lie on the table as it
   * started: a deck's unknown top card (carried as its pile), a card of a
   * public pile, or a hand card. The view that shows where it went cannot be
   * told by its id: it may be a card the viewer never saw.
   */
  function takesFromOutside(dragging: Dragging): boolean {
    return dragging.drag.cards.some((id) => !dragging.from.has(id));
  }

  /**
   * Whether the view lays some card of the drag, or its marker,
   * elsewhere than it lay as the drag started, or, for a card taken from
   * outside the table, lays a card on the table that was not there then.
   */
  function hasMoved(dragging: Dragging): boolean {
    if (dragging.drag.token) {
      const marker = markerOf(dragging.drag);
      const now = view.table && marker && markerPoint(view.table, marker);
      return now?.x !== dragging.token?.x || now?.y !== dragging.token?.y;
    }
    if (takesFromOutside(dragging)) {
      const onTable = tableCardIds();
      for (const id of onTable) {
        if (!dragging.onTable.has(id)) {
          return true;
        }
      }
    }
    const now = spotsOf(dragging.drag);
    for (const [id, was] of dragging.from) {
      const spot = now.get(id);
      if (
        !spot ||
        spot.x !== was.x ||
        spot.y !== was.y ||
        spot.parent !== was.parent ||
        spot.onPile !== was.onPile
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Follows each player's drag: a new one notes where its cards lay, an
   * ended one lands, unless the view already moved its cards. A player gone
   * (left, or the connection dropped) takes theirs along.
   */
  function followDrags(now: number): void {
    for (const color of [...draggings.keys(), ...landings.keys()]) {
      if (!presence.has(color)) {
        draggings.delete(color);
        landings.delete(color);
      }
    }
    for (const { color, drag } of presence.values()) {
      const dragging = draggings.get(color);
      if (drag) {
        if (!dragging) {
          landings.delete(color);
          const marker = markerOf(drag);
          draggings.set(color, {
            key: nextDrag++,
            drag,
            from: spotsOf(drag),
            onTable: tableCardIds(),
            token: view.table && marker ? markerPoint(view.table, marker) : undefined,
          });
        } else {
          dragging.drag = drag;
        }
      } else if (dragging) {
        draggings.delete(color);
        if (!hasMoved(dragging)) {
          landings.set(color, { ...dragging, until: now + LANDING_MS, view });
        }
      }
    }
  }

  // Every message: a new ping starts its rings, and the layer is drawn again at the next frame.
  $effect(() => {
    const now = Date.now();
    // Messages drive it, not views: the view is only read to note where the cards lay.
    untrack(() => followDrags(now));
    for (const state of presence.values()) {
      const { color, ping: spot, pingAt } = state;
      if (spot && pingAt !== undefined && pingsSeen[color] !== pingAt) {
        pingsSeen[color] = pingAt;
        // One that went by before the table showed is not drawn.
        if (now - pingAt < PING_MS) {
          showPing(color, spot, pingAt);
        }
      }
    }
    schedule();
  });

  // Relayed messages come from other clients: only spots given in numbers are drawn.
  function isSpot(spot: PresencePoint): boolean {
    return Number.isFinite(spot.x) && Number.isFinite(spot.y);
  }

  /** Where a spot of the table shows, held within the visible table as in the prototype. */
  function place(spot: PresencePoint, origin: DOMRect): Placed | null {
    const surface = surfaceRect(root);
    const scroller = scrollerRect(root);
    const shownY = isSpot(spot) ? rowMap.toDisplay(spot.y) : null;
    if (!surface || !scroller || shownY === null) {
      return null;
    }
    const at = toScreen({ x: spot.x, y: shownY }, surface, zoom);
    let { x, y } = at;
    let vertical = '';
    if (y > scroller.bottom - EDGE_IN) {
      y = scroller.bottom - BOTTOM_EDGE_ROOM;
      vertical = ' ↓';
    } else if (y < scroller.top) {
      y = scroller.top + TOP_EDGE_ROOM;
      vertical = ' ↑';
    }
    let horizontal = '';
    if (x > scroller.right - EDGE_IN) {
      x = scroller.right - RIGHT_EDGE_ROOM;
      horizontal = ' →';
    } else if (x < scroller.left) {
      x = scroller.left + LEFT_EDGE_ROOM;
      horizontal = ' ←';
    }
    return { x: x - origin.left, y: y - origin.top, side: vertical + horizontal };
  }

  /**
   * A card the viewer cannot see (from a hand), or the unknown top card of a
   * deck (the encounter deck, a scenario deck, or one of the dragging player's
   * own decks), whose pile id the drag carries: face down.
   */
  function hiddenCard(id: string, x: number, y: number): TableCard {
    const pile = view.table?.piles.find((p) => p.id === id);
    // A hidden hand card carries no pile: it shows the player back, whatever its own back.
    return {
      id,
      face: 0,
      faceDown: true,
      back: pile ? pileBack(pile) : 'player',
      // A side deck's own back is captioned with the deck's label.
      home: pile?.kind === 'sideDeck' ? pile.id : undefined,
      owner: -1,
      zone: 'table',
      x,
      y,
      z: 0,
    };
  }

  /**
   * The cards a player drags, each once, where their corner is, the cards
   * tucked under the first keeping their offsets.
   */
  function ghostsOf(drag: PresenceDrag, origin: DOMRect): TableCard[] {
    const corner = cornerOf(drag, origin);
    if (!corner) {
      return [];
    }
    const { x, y } = corner;
    const cards = new Map((view.table?.cards ?? []).map((card) => [card.id, card]));
    const first = cards.get(drag.cards[0] ?? '');
    const ids = drag.cards.filter((id, i) => drag.cards.indexOf(id) === i);
    return ids.map((id) => {
      const card = cards.get(id);
      if (!card) {
        return hiddenCard(id, x, y);
      }
      if (card.zone === 'table' && first?.zone === 'table') {
        return { ...card, x: x + card.x - first.x, y: y + card.y - first.y };
      }
      return { ...card, zone: 'table', x, y, onPile: undefined, parent: undefined };
    });
  }

  /**
   * Where the corner of a drag shows, in table units of the zoomed ghost
   * layer; null when its row is not shown.
   */
  function cornerOf(drag: PresenceDrag, origin: DOMRect): Point | null {
    const surface = surfaceRect(root);
    const shownY = isSpot(drag) ? rowMap.toDisplay(drag.y) : null;
    if (!surface || shownY === null) {
      return null;
    }
    const corner = toScreen({ x: drag.x, y: shownY }, surface, zoom);
    return { x: (corner.x - origin.left) / zoom, y: (corner.y - origin.top) / zoom };
  }

  /** The marker a drag carries, by its name; none for a name that is not a marker. */
  function markerOf(drag: PresenceDrag): MarkerName | undefined {
    return MARKERS.find((name) => name === drag.token);
  }

  /** Draws a drag, under way or landing: a marker, or the cards. */
  function drawDrag(next: Drawn, { key, drag }: Dragging, origin: DOMRect): void {
    const marker = markerOf(drag);
    if (!drag.token) {
      next.ghosts.push({ key, cards: ghostsOf(drag, origin) });
      return;
    }
    const corner = marker && cornerOf(drag, origin);
    if (marker && corner) {
      next.tokens.push({ ...corner, key, name: marker });
    }
  }

  /**
   * The table cards drawn as other players' drags, under way or landing:
   * they are hidden in their places meanwhile, so that each shows once.
   * They show again as soon as the drag is no longer drawn: landed, given
   * up on, or its player lost.
   */
  function tableCardsOf(ghosts: Drawn['ghosts']): Set<string> {
    const onTable = new Set(
      (view.table?.cards ?? []).filter((card) => card.zone === 'table').map((card) => card.id),
    );
    const dragged = ghosts.flatMap((ghost) => ghost.cards.map((card) => card.id));
    return new Set(dragged.filter((id) => onTable.has(id)));
  }

  function measure(): void {
    if (!layer) {
      return;
    }
    const origin = layer.getBoundingClientRect();
    const now = Date.now();
    const next: Drawn = { cursors: [], ghosts: [], tokens: [], pings: [] };
    // The card or pile each player previews: the first player keeps a card that several preview.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const previews = new Map<string, number>();
    // When something drawn now must go: a cursor falling silent, a lost player, or a ping done.
    let nextChange = Infinity;
    for (const state of presence.values()) {
      const silence = now - state.at;
      if (silence >= LOST_MS) {
        continue;
      }
      nextChange = Math.min(nextChange, state.at + LOST_MS);
      if (silence < CURSOR_STALE_MS) {
        nextChange = Math.min(nextChange, state.at + CURSOR_STALE_MS);
        const cursor = state.cursor ? place(state.cursor, origin) : null;
        if (cursor) {
          next.cursors.push({ ...cursor, color: state.color, name: state.name });
        }
      }
      if (state.preview && !previews.has(state.preview)) {
        previews.set(state.preview, state.color);
      }
      // Its drag as followDrags noted it, with the latest spot.
      const dragging = draggings.get(state.color);
      if (dragging) {
        drawDrag(next, dragging, origin);
      }
    }
    for (const [color, landing] of landings) {
      if (landing.until <= now) {
        landings.delete(color);
        continue;
      }
      nextChange = Math.min(nextChange, landing.until);
      drawDrag(next, landing, origin);
    }
    pings = pings.filter((p) => p.until > now);
    for (const { key, color, spot, until } of pings) {
      nextChange = Math.min(nextChange, until);
      const at = place(spot, origin);
      // A ping scrolled out of view is not drawn, as in the prototype.
      if (at && at.side === '') {
        next.pings.push({ ...at, key, color });
      }
    }
    drawn = next;
    glide = !tableMoved;
    tableMoved = false;
    interaction.liftByOthers(tableCardsOf(next.ghosts));
    interaction.markersLiftedByOthers = new Set(next.tokens.map((token) => token.name));
    // Each card or pile draws its ring itself, which follows it as it moves (CardView, PileView).
    interaction.previewByOthers(previews);

    clearTimeout(wakeTimer);
    if (nextChange !== Infinity) {
      wakeTimer = setTimeout(schedule, nextChange - now);
    }
  }

  /** Draws again at the next frame, once for all the messages, scrolls and moves of that frame. */
  function schedule(): void {
    if (frame === 0) {
      frame = requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    }
  }

  /** Draws again at the next frame, the table having moved under the spots: they follow it at once. */
  function followTable(): void {
    tableMoved = true;
    schedule();
  }

  /**
   * Whether the view shows where a landing's cards went. A card taken from
   * outside the table cannot be followed by its id: the first view after the
   * drop is taken for the one it brought.
   */
  function hasLanded(landing: Landing): boolean {
    return hasMoved(landing) || (takesFromOutside(landing) && view !== landing.view);
  }

  // The view that shows where a landing's cards went ends it at once, before the next frame: its
  // ghost goes as the cards show, flying from where it lay (motion.svelte.ts).
  $effect(() => {
    void view;
    untrack(() => {
      const landed = [...landings].filter(([, landing]) => hasLanded(landing));
      for (const [color] of landed) {
        landings.delete(color);
      }
      if (landed.length > 0) {
        tableMoved = true;
        measure();
      }
    });
  });

  // A new view, a zoom or a resized surface move the cards under the spots.
  $effect(() => {
    void view;
    void zoom;
    void layout;
    followTable();
  });

  // Scrolling the table, in the capture phase: scroll events do not bubble.
  $effect(() => {
    const page = root;
    if (!page) {
      return;
    }
    page.addEventListener('scroll', followTable, true);
    return () => page.removeEventListener('scroll', followTable, true);
  });

  // The table resized: the side panel slid, or the window changed.
  $effect(() => {
    if (!layer) {
      return;
    }
    const observer = new ResizeObserver(followTable);
    observer.observe(layer);
    return () => observer.disconnect();
  });

  $effect(() => () => {
    cancelAnimationFrame(frame);
    clearTimeout(wakeTimer);
    interaction.liftByOthers(new Set());
    interaction.markersLiftedByOthers = new Set();
    interaction.previewByOthers(new Map());
  });
</script>

<svelte:window onpointermove={onPointerMove} onresize={followTable} />

<div
  class="presence"
  bind:this={layer}
  aria-hidden="true"
  style:--glide="{glide ? PRESENCE_INTERVAL_MS : 0}ms"
>
  <div class="ghosts">
    {#each drawn.ghosts as ghost (ghost.key)}
      {#each ghost.cards as card (card.id)}
        <CardView
          {card}
          face={faceOf(card)}
          caption={backCaption(card, view.table?.piles ?? [])}
          ghost
        />
      {/each}
    {/each}
    {#each drawn.tokens as token (token.key)}
      <MarkerToken name={token.name} x={token.x} y={token.y} ghost />
    {/each}
  </div>
  {#each drawn.pings as pinged (pinged.key)}
    {#each ['a', 'b'] as ring (ring)}
      <div
        class="ping {ring}"
        style:--c={playerColorVar(pinged.color)}
        style:left="{pinged.x}px"
        style:top="{pinged.y}px"
      ></div>
    {/each}
  {/each}
  {#each drawn.cursors as cursor (cursor.color)}
    <!-- A macOS-like pointer: filled with the player's colour, a dark outline for contrast on any card. -->
    <div
      class="rcursor"
      class:off={cursor.side !== ''}
      style:transform="translate({cursor.x}px, {cursor.y}px)"
    >
      <svg width="22" height="28" viewBox="0 0 22 28"
        ><path
          d="M3 2.5 L18 12 L11 13.5 L7.5 20 Z"
          style:fill={playerColorVar(cursor.color)}
          stroke="#07090f"
          stroke-width="1.5"
          stroke-linejoin="round"
          stroke-linecap="round"
        /></svg
      ><span style:background={playerColorVar(cursor.color)}>{cursor.name}{cursor.side}</span>
    </div>
  {/each}
</div>

<style>
  /* Over the table, the arrows and the resting hand; under the veil and the open hand, as in the prototype. */
  .presence {
    grid-area: table;
    position: relative;
    z-index: 2500;
    overflow: hidden;
    pointer-events: none;
  }

  /*
    At the table's zoom: the ghosts are placed in table units. Their z-indexes come from the
    server: isolated, they stay under the cursors.
  */
  .ghosts {
    position: absolute;
    left: 0;
    top: 0;
    isolation: isolate;
    zoom: var(--z, 1);
  }

  /*
    Other players' drags glide between their moves, as the cursors do; the viewer's own ghosts
    (DragLayer) follow the pointer without delay. A ghost that appears shows in its place at once:
    a transition only runs on a change. While the table moves under them, --glide is 0: they move
    with it. Under .presence: above the ghost rules of CardView and MarkerToken, whatever the
    order of the bundled styles.
  */
  .presence .ghosts :global(.card.ghost) {
    transition:
      left var(--glide) linear,
      top var(--glide) linear,
      scale 0.12s;
  }

  .presence .ghosts :global(.marker.ghost) {
    transition:
      transform 0.12s,
      left var(--glide) linear,
      top var(--glide) linear;
  }

  .rcursor {
    position: absolute;
    left: 0;
    top: 0;
    /* The cursor glides between its moves, which come once per interval at most. */
    transition: transform var(--glide) linear;
  }

  .rcursor svg {
    display: block;
    filter: drop-shadow(0 1px 1.5px #0009) drop-shadow(0 2px 5px #0005);
  }

  .rcursor span {
    position: absolute;
    left: 16px;
    top: 18px;
    color: var(--bg);
    font-size: 12px;
    font-weight: 700;
    padding: 3px 8px;
    border-radius: 6px;
    white-space: nowrap;
    box-shadow: 0 2px 6px #0007;
  }

  /* Held at the table's edge: its spot is scrolled out of view. */
  .rcursor.off svg {
    opacity: 0.35;
  }

  /* Two rings, the second a little later, both within the 1.2 s of a ping. */
  .ping {
    position: absolute;
    width: 18px;
    height: 18px;
    margin: -9px 0 0 -9px;
    border-radius: 50%;
    border: 3px solid var(--c);
    animation: ping 0.95s ease-out forwards;
  }

  .ping.b {
    animation-delay: 0.25s;
    opacity: 0;
  }

  @keyframes ping {
    0% {
      transform: scale(0.3);
      opacity: 1;
    }

    100% {
      transform: scale(4.5);
      opacity: 0;
    }
  }
</style>
