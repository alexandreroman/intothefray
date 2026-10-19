<!--
  The Into The Fray logo: the mark (a card tilted and split by a fracture, with
  a spark) alone, or beside the "INTO THE / FRAY" wordmark, on one line for the
  top bars or on two for the home screen. The whole logo is one image named
  "Into The Fray".
-->
<script lang="ts">
  let {
    variant = 'horizontal',
    size,
  }: {
    /** The mark alone, or with the wordmark on one line (top bars) or two (home). */
    variant?: 'horizontal' | 'stacked' | 'mark';
    /**
     * In pixels: the mark's size for the mark alone, else the font size of "FRAY". 'inherit'
     * takes the parent's font size instead, for a size set in CSS.
     */
    size?: number | 'inherit';
  } = $props();

  const DEFAULT_SIZE = { horizontal: 28, stacked: 120, mark: 64 };
  // The mark's size for a "FRAY" of 1px, from the approved lockups.
  const MARK_RATIO = { horizontal: 32 / 28, stacked: 190 / 172, mark: 1 };
  // The spark is lost in a small mark.
  const SPARK_MIN_SIZE = 48;

  const uid = $props.id();
  const topClipId = `${uid}-top`;
  const bottomClipId = `${uid}-bottom`;

  // Unset when inherited: the size is then unknown here.
  let fontSize = $derived(size === 'inherit' ? undefined : (size ?? DEFAULT_SIZE[variant]));
  // In pixels, or in em of the inherited font size.
  let markSize = $derived(
    fontSize === undefined ? `${MARK_RATIO[variant]}em` : fontSize * MARK_RATIO[variant],
  );
  // A mark of unknown size is taken as a large one, with its spark.
  let spark = $derived(typeof markSize === 'string' || markSize >= SPARK_MIN_SIZE);
  // A small mark needs a wider fracture to show it.
  let offset = $derived(spark ? 1.6 : 1.8);
</script>

<span
  class="logo {variant}"
  role="img"
  aria-label="Into The Fray"
  style:font-size={fontSize === undefined ? undefined : `${fontSize}px`}
>
  <svg width={markSize} height={markSize} viewBox="0 0 64 64" aria-hidden="true">
    <defs>
      <clipPath id={topClipId}><polygon points="0,0 64,0 64,19 35,29 39,33 0,45" /></clipPath>
      <clipPath id={bottomClipId}><polygon points="0,45 39,33 35,29 64,19 64,64 0,64" /></clipPath>
    </defs>
    <g transform="rotate(-12 32 32)">
      <rect
        class="top"
        x="15"
        y="8"
        width="34"
        height="48"
        rx="4.5"
        clip-path="url(#{topClipId})"
        transform="translate(-{offset} -{offset})"
      />
      <rect
        class="bottom"
        x="15"
        y="8"
        width="34"
        height="48"
        rx="4.5"
        clip-path="url(#{bottomClipId})"
        transform="translate({offset} {offset})"
      />
      {#if spark}
        <path
          class="spark"
          d="M57 14.5 L58.3 18.7 L62.5 20 L58.3 21.3 L57 25.5 L55.7 21.3 L51.5 20 L55.7 18.7 Z"
        />
      {/if}
    </g>
  </svg>
  {#if variant !== 'mark'}
    <span class="words" aria-hidden="true">
      <span class="into">INTO THE</span>
      <span class="fray">FRAY</span>
    </span>
  {/if}
</span>

<style>
  .logo {
    display: inline-flex;
    align-items: center;
    flex: none;
    font-family: var(--font);
    line-height: 1;
    white-space: nowrap;
  }

  svg {
    flex: none;
  }

  .top {
    fill: var(--accent);
  }

  .bottom {
    fill: var(--accent-deep);
  }

  .spark {
    fill: var(--spark);
  }

  .words {
    display: flex;
  }

  .into {
    font-weight: 700;
  }

  .fray {
    font-stretch: 62%;
    font-weight: 900;
    font-style: italic;
  }

  /* All lengths in em of "FRAY", so that the lockups scale with the size. */
  .horizontal,
  .horizontal .words {
    gap: 0.32em;
  }

  .horizontal .words {
    align-items: center;
  }

  .horizontal .into {
    font-size: 0.357em;
    letter-spacing: 0.3em;
    color: var(--muted);
  }

  .horizontal .fray {
    margin-left: -0.143em;
  }

  .stacked {
    gap: 0.21em;
  }

  .stacked .words {
    flex-direction: column;
    gap: 0.058em;
  }

  /* Indented 0.102em of FRAY's size, in line with the top-left corner of the italic F. */
  .stacked .into {
    font-size: 0.151em;
    letter-spacing: 0.42em;
    padding-left: calc(0.102em / 0.151);
  }

  .stacked .fray {
    line-height: 0.84;
    letter-spacing: -0.005em;
  }
</style>
