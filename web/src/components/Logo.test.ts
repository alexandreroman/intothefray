import { render, screen } from '@testing-library/svelte';
import Logo from './Logo.svelte';

describe('Logo', () => {
  it.each(['horizontal', 'stacked'] as const)(
    'shows the mark and the wordmark when %s',
    (variant) => {
      render(Logo, { variant });

      const logo = screen.getByRole('img', { name: 'Into The Fray' });
      expect(logo.querySelector('svg')).not.toBeNull();
      expect(logo.textContent?.replace(/\s+/g, ' ').trim()).toBe('INTO THE FRAY');
    },
  );

  it('shows the mark alone, at its size', () => {
    render(Logo, { variant: 'mark', size: 40 });

    const logo = screen.getByRole('img', { name: 'Into The Fray' });
    expect(logo.textContent?.trim()).toBe('');
    expect(logo.querySelector('svg')?.getAttribute('width')).toBe('40');
  });

  it('takes an inherited size in em, with its spark', () => {
    const { container } = render(Logo, { variant: 'mark', size: 'inherit' });

    const logo = screen.getByRole('img', { name: 'Into The Fray' });
    expect(logo.style.fontSize).toBe('');
    expect(logo.querySelector('svg')?.getAttribute('width')).toBe('1em');
    expect(container.querySelector('.spark')).not.toBeNull();
  });

  it('is one image: its parts are hidden from assistive technologies', () => {
    render(Logo, { variant: 'stacked' });

    const logo = screen.getByRole('img', { name: 'Into The Fray' });
    expect(logo.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(logo.querySelector('.words')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('drops the spark from a small mark', () => {
    const { container } = render(Logo, { variant: 'mark', size: 32 });
    expect(container.querySelector('.spark')).toBeNull();

    render(Logo, { variant: 'mark', size: 48 });
    expect(document.querySelectorAll('.spark')).toHaveLength(1);
  });

  it('gives each logo its own clip paths', () => {
    render(Logo);
    render(Logo);

    const logos = screen.getAllByRole('img', { name: 'Into The Fray' });
    const ids = logos.flatMap((logo) =>
      [...logo.querySelectorAll('clipPath')].map((clip) => clip.id),
    );
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
    // Each half is cut by a clip path of its own logo.
    for (const logo of logos) {
      for (const half of logo.querySelectorAll('rect')) {
        const id = half.getAttribute('clip-path')?.match(/^url\(#(.+)\)$/)?.[1];
        expect(logo.querySelector(`clipPath[id="${id}"]`)).not.toBeNull();
      }
    }
  });
});
