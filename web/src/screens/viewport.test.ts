// The screens' sources, as written: jsdom applies no stylesheet, so their rules themselves are checked.
const sources = import.meta.glob<string>('./*.svelte', {
  query: '?raw',
  import: 'default',
  eager: true,
});

describe('screen heights', () => {
  it('finds the screens that fill the window', () => {
    const tall = Object.keys(sources).filter((path) =>
      sources[path]!.includes('min-height: 100vh;'),
    );
    expect(tall.sort()).toEqual([
      './About.svelte',
      './Ended.svelte',
      './Home.svelte',
      './Lobby.svelte',
      './Options.svelte',
    ]);
  });

  it.each(Object.keys(sources))(
    '%s fills the dynamic viewport where it fills the window, so a short page never scrolls',
    (path) => {
      // A mobile browser's 100vh is the height without its toolbar: 100dvh, where it is known, follows
      // the toolbar as it shows and hides. 100vh stays first, for a browser that does not know dvh.
      const source = sources[path]!;
      const vh = source.split('min-height: 100vh;').length - 1;
      const followed = source.split(/min-height: 100vh;\s*min-height: 100dvh;/).length - 1;
      expect(followed).toBe(vh);
    },
  );
});
