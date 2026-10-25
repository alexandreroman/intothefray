import { render, screen } from '@testing-library/svelte';
import CardPreview from './CardPreview.svelte';

describe('CardPreview', () => {
  it('previews a face, adapting to landscape', async () => {
    const face = { images: ['scheme.png'], name: 'The Break-In!' };
    const { rerender } = render(CardPreview, { preview: { ...face, landscape: false } });

    const frame = screen.getByLabelText('Card preview');
    expect(screen.getByRole('img', { name: 'The Break-In!' }).getAttribute('src')).toBe(
      'scheme.png',
    );
    expect(frame.querySelector('.art')?.classList).not.toContain('land');

    await rerender({ preview: { ...face, landscape: true } });
    expect(frame.querySelector('.art')?.classList).toContain('land');
    expect(screen.getByRole('img', { name: 'The Break-In!' }).classList).toContain('land');
  });
});
