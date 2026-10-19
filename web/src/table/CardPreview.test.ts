import { render, screen } from '@testing-library/svelte';
import CardPreview from './CardPreview.svelte';

describe('CardPreview', () => {
  it('takes the shape of the card when snug', () => {
    const face = { images: [], name: 'The Break-In!', landscape: true };
    render(CardPreview, { preview: face, snug: true });
    expect(screen.getByLabelText('Card preview').classList).toContain('snug');
  });

  it('shows the empty preview frame', () => {
    render(CardPreview, { preview: null });
    const frame = screen.getByLabelText('Card preview');
    expect(frame.textContent).toContain('Hover a card');
    expect(frame.textContent).toContain('to see it here');
    expect(frame.classList).toContain('empty');
  });

  it('previews a face, adapting to landscape', async () => {
    const face = { images: ['scheme.png'], name: 'The Break-In!' };
    const { rerender } = render(CardPreview, { preview: { ...face, landscape: false } });

    const frame = screen.getByLabelText('Card preview');
    expect(frame.classList).not.toContain('empty');
    expect(screen.getByRole('img', { name: 'The Break-In!' }).getAttribute('src')).toBe(
      'scheme.png',
    );
    expect(frame.querySelector('.art')?.classList).not.toContain('land');

    await rerender({ preview: { ...face, landscape: true } });
    expect(frame.querySelector('.art')?.classList).toContain('land');
    expect(screen.getByRole('img', { name: 'The Break-In!' }).classList).toContain('land');
  });
});
