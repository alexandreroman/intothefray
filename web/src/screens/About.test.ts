import { fireEvent, render, screen } from '@testing-library/svelte';
import About from './About.svelte';

const REPOSITORY = 'https://github.com/alexandreroman/intothefray';

describe('About', () => {
  it('shows the title', () => {
    render(About);

    expect(screen.getByRole('heading', { level: 1, name: 'ORIGIN STORY' })).toBeTruthy();
  });

  it('goes back home', async () => {
    window.history.pushState(null, '', '/about');
    render(About);

    await fireEvent.click(screen.getByRole('button', { name: /back/i }));

    expect(window.location.pathname).toBe('/');
  });

  it('links to the source code and tells its license', () => {
    render(About);

    const code = screen.getByRole('link', { name: 'Source code on GitHub' });
    expect(code.getAttribute('href')).toBe(REPOSITORY);
    const license = screen.getByRole('link', { name: 'Apache-2.0 license' });
    expect(license.getAttribute('href')).toBe(`${REPOSITORY}/blob/main/LICENSE`);
  });

  it('credits every card data source, with a link where it has one', () => {
    render(About);

    const linked = [
      ['marvelcdb', 'https://marvelcdb.com'],
      ['Cerebro', 'https://github.com/UnicornSnuggler/Cerebro'],
      ['mc4db', 'https://mc4db.merlindumesnil.net'],
      ['cgbuilder', 'https://mc.cgbuilder.fr'],
    ];
    for (const [name, url] of linked) {
      const link = screen.getByRole('link', { name });
      expect(link.getAttribute('href')).toBe(url);
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toContain('noopener');
    }
    const octgn = 'OCTGN Marvel Champions image packs';
    expect(screen.getByText(octgn)).toBeTruthy();
    expect(screen.queryByRole('link', { name: octgn })).toBeNull();
    expect(screen.queryByRole('link', { name: 'fr.marvelcdb' })).toBeNull();
  });

  it('opens every external link in a new tab', () => {
    render(About);

    const external = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('href')?.startsWith('https://'));
    expect(external.length).toBeGreaterThan(0);
    for (const link of external) {
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toContain('noopener');
    }
  });

  it('says it is an unofficial fan project', () => {
    render(About);

    const disclaimer = screen.getByText(/not affiliated with or endorsed by/);
    expect(disclaimer.textContent).toContain('Fantasy Flight Games');
    expect(disclaimer.textContent).toContain('Marvel');
  });
});
