<!--
  The table's one surface, where every card and pile lies, in table units:
  the dot grid, a framed box around each owner's deck and discard pile, with
  the chips opening that owner's out-of-play piles, the piles, the cards and
  the markers (the first player token, the active counter). The table scrolls
  it both ways and zooms it as a whole. In dock mode the frames show their
  owner's avatar rather than the name, the chips right after it, a name that
  shows kept within its frame's drawn width, and during a drag what it pushes
  aside is drawn shifted from its place.
-->
<script lang="ts" module>
  import type { TableElement } from './actions';
  import type { OutOfPlayChip, OwnerFrame } from './layout';

  /** The frame around an owner's deck and discard pile, with the name above it. */
  export interface OwnerBox {
    /** The frame as drawn: in dock mode, where the table's projection draws it, smaller. */
    frame: OwnerFrame;
    /** The player's name, "Villain", or the label of a scenario deck. */
    name: string;
    /**
     * The round avatar the name line shows in place of the name, in dock mode: the image of the hero's
     * or the villain's face, null for a plain disc of the owner's colour. Absent where the line shows
     * the name: out of dock mode, and on a scenario deck's frame.
     */
    avatar?: string | null;
    /** CSS colour of the frame and the name: the player's seat colour, or the villain's. */
    color: string;
    /** The tooltip: how many cards the player holds. */
    tip?: string;
    /** The owner's out-of-play piles, as chips at the right of the name line. */
    outOfPlay: OutOfPlayChip[];
  }

  // The owner line's sizes in --lu (the style below): a chip, the gap between chips, the avatar, and
  // the room between the avatar or the name and the chips; and the line's left inset, in drawn units.
  const CHIP_WIDTH = 46;
  const CHIP_GAP = 4;
  const AVATAR = 22;
  const CHIP_LEAD = 6;
  const LINE_INSET = 6;

  /**
   * How far right of its frame's left edge an owner line reaches in dock mode, in drawn units, at a
   * zoom: its avatar, or the name's inset, then --chip-lead and its chips. A name reaches no further
   * on its own, cut to its frame's room before the chips (--name-fit). As the style draws it: --lu
   * counter-scales the line far out, the avatar's ring is 2 screen px.
   */
  export function ownerLineWidth(line: { avatar: boolean; chips: number }, zoom: number): number {
    const lu = Math.max(1, 11 / 12 / zoom);
    const ring = 2 / zoom;
    const lead = line.avatar ? LINE_INSET + AVATAR * lu + 2 * ring : LINE_INSET;
    if (line.chips === 0) {
      return line.avatar ? lead : 0;
    }
    const chips = line.chips * CHIP_WIDTH * lu + (line.chips - 1) * CHIP_GAP * lu;
    return lead + CHIP_LEAD * lu + chips;
  }
</script>

<script lang="ts">
  import CardArt from '../components/CardArt.svelte';
  import Icon, { type IconName } from '../components/Icon.svelte';
  import type {
    MarkerName,
    PackFace,
    Point,
    CardView as TableCard,
    PileView as Pile,
  } from '../lib/types';
  import { MARKERS } from '../lib/types';
  import { prefersReducedMotion } from 'svelte/motion';
  import { frameItemId, markerItemId } from './dockItems';
  import CardView from './CardView.svelte';
  import { dockMode } from './dockMode';
  import { DOCK_DOT_PITCH, DOCK_SCALE } from './dockPiles';
  import { FINE_GRID, type SnapGrid } from './grid';
  import MarkerToken from './MarkerToken.svelte';
  import { overflowTip } from '../lib/overflowTip';
  import { interaction } from './interaction.svelte';
  import PileView from './PileView.svelte';

  let {
    cards,
    piles,
    owners,
    topOf,
    faceOf,
    captionOf,
    onbrowse,
    width,
    height,
    markers,
    markersMovable = false,
    canDrag = () => false,
    shifts = new Map(),
    glide = false,
    grid = FINE_GRID,
  }: {
    /** The cards lying on the table. */
    cards: TableCard[];
    /** The piles drawn on the table. */
    piles: Pile[];
    owners: OwnerBox[];
    /** The top card of a pile that lists its cards. */
    topOf: (pile: Pile) => TableCard | undefined;
    /** The catalog face a card shows, null while unknown or hidden. */
    faceOf: (card: TableCard | undefined) => PackFace | null;
    /** The caption of a card's back, from every pile: its side deck may lie in a row not shown. */
    captionOf: (card: TableCard) => string | undefined;
    /** Opens the Browse box of an out-of-play pile, from its chip. */
    onbrowse: (pile: string) => void;
    /** The surface size, in table units. */
    width: number;
    height: number;
    /** Where each marker lies; a marker the table does not have is absent (see markerPoint). */
    markers: Partial<Record<MarkerName, Point>>;
    /** Whether the viewer can drag the markers: any player can, spectators cannot. */
    markersMovable?: boolean;
    /** Whether the viewer can drag that card or pile: the pointer says so (grab). */
    canDrag?: (element: TableElement) => boolean;
    /**
     * Dock mode only: how far from its place each card, pile, frame and marker pushed
     * aside by a drag is drawn, in drawn units, by id (dockItems.ts); none unless given.
     */
    shifts?: ReadonlyMap<string, Point>;
    /** Whether a change of the shifts glides there, rather than jumping. */
    glide?: boolean;
    /** The grid drops snap to (grid.ts), which the dots follow out of dock mode: the fine one unless given. */
    grid?: SnapGrid;
  } = $props();

  // How long a shift glides; nothing glides under reduced motion.
  const SHIFT_GLIDE = '180ms';

  /** A shift as a translate, none for an item drawn in its place. */
  function translateOf(id: string): string | undefined {
    const shift = shifts.get(id);
    return shift === undefined ? undefined : `${shift.x}px ${shift.y}px`;
  }

  // In dock mode the table hands every card, pile, frame and marker at the corner its
  // projection draws it at (dockLayout.ts): the cards and piles draw themselves smaller from there
  // (CardView, PileView), the markers too (MarkerToken); the name lines and the chips stay at full
  // size. The dots lie further apart there (DOCK_DOT_PITCH), drawn.
  const dock = dockMode();
  const DOCK_DOTS = `${DOCK_DOT_PITCH * DOCK_SCALE}px ${DOCK_DOT_PITCH * DOCK_SCALE}px`;
  // Elsewhere a dot lies in the middle of each cell of the grid: a card's corner on a grid line lies
  // between four dots. The cells start where the grid's lines do, `offsetY` down.
  const dotSize = $derived(dock.current ? DOCK_DOTS : `${grid.step}px ${grid.step}px`);
  const dotPosition = $derived(dock.current ? undefined : `0 ${grid.offsetY}px`);

  const MARKER_TIPS: Record<MarkerName, string> = {
    firstPlayer: 'First player: drag it to the next player',
    active: 'Active counter: drag to move',
  };

  /** The icon of each kind of chip. */
  const CHIP_ICONS: Record<OutOfPlayChip['kind'], IconName> = {
    scenarioArea: 'star',
    victory: 'trophy',
    aside: 'hourglass',
  };

  /** What a chip says, in its tooltip and to screen readers: "Victory display (1)". */
  function chipTip(chip: OutOfPlayChip): string {
    const label = `${chip.label} (${chip.count})`;
    return chip.count === 0 ? `${label}: empty` : label;
  }

  /** An empty pile has nothing to browse: its chip is aria-disabled, so that its tooltip shows. */
  function openChip(chip: OutOfPlayChip): void {
    if (chip.count > 0) {
      onbrowse(chip.pile);
    }
  }
</script>

<!-- Card z-indexes come from the server and can be negative: the surface isolates them. -->
<div
  class="surface table-dots"
  style:width="{width}px"
  style:height="{height}px"
  style:background-size={dotSize}
  style:background-position={dotPosition}
  style:--shift-glide={glide && !prefersReducedMotion.current ? SHIFT_GLIDE : undefined}
>
  {#each owners as owner (`${owner.frame.owner}:${owner.frame.label ?? ''}`)}
    {@const shift = translateOf(frameItemId(owner.frame))}
    <div
      class="ownerbox"
      data-owner={owner.frame.owner}
      data-tip={owner.tip}
      style:--owner={owner.color}
      style:--chips={owner.outOfPlay.length}
      style:--frame-w="{owner.frame.w}px"
      style:left="{owner.frame.x}px"
      style:top="{owner.frame.y}px"
      style:width="{owner.frame.w}px"
      style:height="{owner.frame.h}px"
      style:translate={shift}
    >
      {#if owner.avatar === undefined}
        <span class="owner" class:fitted={dock.current} use:overflowTip>{owner.name}</span>
      {:else}
        <span
          class="avatar"
          class:empty={owner.avatar === null}
          role="img"
          aria-label={owner.name}
          data-tip={owner.name}
        >
          {#if owner.avatar}
            <CardArt src={owner.avatar} aspect={1} />
          {/if}
        </span>
      {/if}
      {#if owner.tip}
        <!-- The tooltip is for the pointer: screen readers read the hand count here. -->
        <span class="sr-only">: {owner.tip}</span>
      {/if}
    </div>
    {#if owner.outOfPlay.length > 0}
      <!--
        Out of the frame, which lies under the piles and the cards, so that the chips stay above
        anything dropped over the name line; a press on them is no press on an empty spot.
      -->
      <div
        class="chips"
        class:after-avatar={dock.current && owner.avatar !== undefined}
        class:after-name={dock.current && owner.avatar === undefined}
        role="group"
        aria-label="{owner.name}: out-of-play piles"
        data-owner={owner.frame.owner}
        style:--owner={owner.color}
        style:--chips={owner.outOfPlay.length}
        style:--frame-w="{owner.frame.w}px"
        style:left="{owner.frame.x}px"
        style:top="{owner.frame.y}px"
        style:translate={shift}
      >
        {#if dock.current && owner.avatar === undefined}
          <!-- The name's room, as wide as the name shows: the chips follow it. -->
          <span class="name-room" aria-hidden="true">{owner.name}</span>
        {/if}
        {#each owner.outOfPlay as chip (chip.pile)}
          <button
            type="button"
            class="chip"
            data-pile={chip.pile}
            data-tip={chipTip(chip)}
            aria-label={chipTip(chip)}
            aria-disabled={chip.count === 0}
            onclick={() => openChip(chip)}
          >
            <Icon name={CHIP_ICONS[chip.kind]} />
            <span class="n">{chip.count}</span>
          </button>
        {/each}
      </div>
    {/if}
  {/each}
  {#each piles as pile (pile.id)}
    {@const top = topOf(pile)}
    <PileView
      {pile}
      {top}
      face={faceOf(top)}
      draggable={canDrag({ kind: 'pile', id: pile.id })}
      shift={translateOf(pile.id)}
    />
  {/each}
  {#each cards as card (card.id)}
    <CardView
      {card}
      face={faceOf(card)}
      caption={captionOf(card)}
      draggable={canDrag({ kind: 'card', id: card.id })}
      shift={translateOf(card.id)}
    />
  {/each}
  {#each MARKERS as name (name)}
    {@const at = markers[name]}
    {#if at && !interaction.markerMoving(name)}
      <!-- A marker has no menu: hovering it drops the previous element at once. -->
      <MarkerToken
        {name}
        x={at.x}
        y={at.y}
        lifted={interaction.markersLiftedByOthers.has(name)}
        tip={markersMovable ? MARKER_TIPS[name] : undefined}
        shift={translateOf(markerItemId(name))}
        onpointerenter={(event) => interaction.enterNothing(event)}
        onpointerdown={markersMovable
          ? (event) => interaction.press({ kind: 'marker', name }, event)
          : undefined}
      />
    {/if}
  {/each}
</div>

<style>
  .surface {
    /*
      The unit of the name lines above the frames (the owners' names and the chips): a table unit,
      or more once the zoom would bring the chips' 12-unit text under 11 screen px. Counter-scaled
      so, a line looks as it does at a zoom of 11/12 (92 %), however far the table zooms out.
    */
    --lu: max(1px, 11px / 12 / var(--z, 1));
    /* A chip is at most this wide with a two-digit count: the name leaves room for the chips. */
    --chip-width: calc(46 * var(--lu));
    --chip-gap: calc(4 * var(--lu));
    --chip-room: calc(var(--chip-width) + var(--chip-gap));
    /*
      The room a name keeps, about "Villain": far out, a frame is too narrow for its chips and its
      name, and the line goes on past the frame's right edge (.chips), over the empty band above the
      row's cards.
    */
    --name-min: calc(56 * var(--lu));
    /*
      In dock mode, an owner's avatar in place of the name: the chips' height, in a ring of the
      owner's colour 2 screen px wide. The room before the chips takes the frame's border, the
      avatar's 4px of margin, the avatar and its ring.
    */
    --avatar: calc(22 * var(--lu));
    --avatar-ring: calc(2px / var(--z, 1));
    --avatar-room: calc(6px + var(--avatar) + 2 * var(--avatar-ring));
    /* In dock mode, the room between an owner line's avatar (or name) and its chips. */
    --chip-lead: calc(6 * var(--lu));
    position: relative;
    isolation: isolate;
    zoom: var(--z, 1);
  }

  /* Under the piles and the cards, which lie over it. */
  .ownerbox {
    position: absolute;
    z-index: -1;
    border: 2px solid color-mix(in srgb, var(--owner) 55%, transparent);
    border-radius: 12px;
    background: color-mix(in srgb, var(--owner) 6%, transparent);
  }

  /*
    In dock mode a name line ends within its frame's drawn width (--frame-w): the name, from 6px
    inside the frame's left edge (.owner, .name-room), takes what is left after --chip-lead and its
    chips, down to nothing on a frame too narrow for them.
  */
  :is(.ownerbox, .chips) {
    --name-fit: max(0px, var(--frame-w) - 6px - var(--chip-lead) - var(--chips) * var(--chip-room));
  }

  /*
    The owner's name, in the room above the frame, clear of it and of the chips at its right: its
    line, 14 units high, lies from 26 to 12 units above the frame, centred on the chips (in --lu,
    as all of the name line). The offset runs from inside the frame's 2-unit border, hence the 2px.
  */
  .owner {
    position: absolute;
    left: 4px;
    bottom: calc(100% + 2px + 12 * var(--lu));
    max-width: max(calc(100% - 8 * var(--lu) - var(--chips) * var(--chip-room)), var(--name-min));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: calc(13 * var(--lu));
    line-height: calc(14 * var(--lu));
    font-weight: 700;
    color: var(--owner);
  }

  /* In dock mode, a name line that shows its name (a scenario deck's) keeps within the drawn frame. */
  .owner.fitted {
    max-width: var(--name-fit);
  }

  /*
    The avatar where the name starts, on the chips' line, from 30 to 8 units above the frame (the
    name's offsets, see .owner); before a hero, a disc of the owner's colour, as the hero selector
    draws it.
  */
  .avatar {
    position: absolute;
    left: calc(4px + var(--avatar-ring));
    bottom: calc(100% + 2px + 8 * var(--lu));
    width: var(--avatar);
    height: var(--avatar);
    overflow: hidden;
    border-radius: 50%;
    background: #000;
    box-shadow: 0 0 0 var(--avatar-ring) var(--owner);
  }

  .avatar.empty {
    background: var(--owner);
  }

  /*
    The name line of a frame: the chips sit at its right end, centred on the name, 19 units above
    the frame, so from 30 to 8 units above it. The 8 units of clear space keep the line apart from
    the frame's border; more would push the villain's line, whose frame lies 20 units under the
    surface's top, past the scroller's 24px padding at the largest zoom (2). Counter-scaled far
    out, the line takes 30 × 11/12 ≈ 27.5 screen px, which the padding and those 20 units still
    hold at 30 %. As wide as the frame, or wider when the chips and --name-min need it. Above
    every card (Table.svelte).
  */
  .chips {
    position: absolute;
    z-index: var(--above-cards);
    width: max(
      var(--frame-w),
      calc(var(--chips) * var(--chip-room) + var(--name-min) + 8 * var(--lu))
    );
    height: calc(22 * var(--lu));
    margin-top: calc(-30 * var(--lu));
    display: flex;
    justify-content: flex-end;
    gap: var(--chip-gap);
    /* The room left of the chips stays the name's, an empty spot. */
    pointer-events: none;
  }

  /*
    In dock mode the chips follow the avatar, --chip-lead to the right of its ring, from the left:
    every owner line starts at its row's left edge, so the chips line up down the rows. A line
    that shows its name (a scenario deck's) puts them right after the name (.name-room).
  */
  .chips.after-avatar,
  .chips.after-name {
    width: max-content;
    justify-content: flex-start;
  }

  .chips.after-avatar {
    padding-left: calc(var(--avatar-room) + var(--chip-lead));
  }

  /*
    The room the name takes on its line, unseen: from where the name starts (.owner: 4px inside
    the frame's 2-unit border), as wide as it shows, ellipsis included, then --chip-lead.
  */
  .name-room {
    max-width: var(--name-fit);
    margin: 0 calc(var(--chip-lead) - var(--chip-gap)) 0 6px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: calc(13 * var(--lu));
    line-height: calc(22 * var(--lu));
    font-weight: 700;
    visibility: hidden;
  }

  /* Pushed aside by a drag, the frame and its chips glide with its piles. */
  .ownerbox,
  .chips {
    transition: translate var(--shift-glide, 0s) ease-out;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: calc(3 * var(--lu));
    height: 100%;
    min-width: var(--chip-width);
    padding: 0 calc(7 * var(--lu)) 0 calc(5 * var(--lu));
    border: 1px solid color-mix(in srgb, var(--owner) 45%, var(--line-strong));
    border-radius: calc(11 * var(--lu));
    background: var(--panel-2);
    color: var(--muted);
    font-size: calc(12 * var(--lu));
    line-height: 1;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    pointer-events: auto;
  }

  /*
    A finger needs 44 px, whatever the zoom: on touch, an invisible hit area around each chip, 44
    screen px a side (44px / --z in table units, which the surface's zoom brings back to 44px).
    Under the chips (z-index -1 in their stacking context), so that a chip keeps all of its face
    where the hit area of its neighbour reaches it. It goes below the chip at most over the clear
    space above the frame (8 --lu) and the frame's 10 units of padding (layout.ts), never over the
    piles: the rest goes above, into the empty bottom of the row above.
  */
  @media (pointer: coarse) {
    .chip {
      position: relative;
    }

    .chip::before {
      --hit: calc(44px / var(--z, 1));
      content: '';
      position: absolute;
      z-index: -1;
      left: 50%;
      bottom: calc(-1 * min(8 * var(--lu) + 10px, max(0px, (var(--hit) - 100%) / 2)));
      width: max(100%, var(--hit));
      height: max(100%, var(--hit));
      translate: -50% 0;
    }
  }

  .chip :global(svg) {
    width: calc(14 * var(--lu));
    height: calc(14 * var(--lu));
  }

  .chip .n {
    color: var(--text);
  }

  @media (hover: hover) {
    .chip:hover:not([aria-disabled='true']) {
      background: var(--hover);
      border-color: var(--owner);
      color: var(--text);
    }
  }
</style>
