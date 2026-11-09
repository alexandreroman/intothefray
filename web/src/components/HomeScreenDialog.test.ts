import { fireEvent, render, screen, within } from '@testing-library/svelte';
import HomeScreenDialog from './HomeScreenDialog.svelte';

describe('HomeScreenDialog', () => {
  it('names the box and describes it with its lead line', () => {
    render(HomeScreenDialog, { onclose: () => {} });
    expect(
      screen.getByRole('dialog', {
        name: 'Play full screen',
        description:
          'Add Into the Fray to your Home Screen: it opens full screen, with no browser bars.',
      }),
    ).toBeTruthy();
  });

  it('lists the steps in order, Share with its icon', () => {
    render(HomeScreenDialog, { onclose: () => {} });
    const steps = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(
      steps.map((step) => step.querySelector('span')?.textContent?.replace(/\s+/g, ' ').trim()),
    ).toEqual([
      "Tap Share in the browser's toolbar.",
      'Choose Add to Home Screen.',
      'Open Into the Fray from your Home Screen.',
    ]);
    expect(steps[0]?.querySelector('svg')?.dataset.icon).toBe('share');
    expect(steps[1]?.querySelector('b')?.textContent).toBe('Add to Home Screen');
  });

  it('closes with Got it, its main action', async () => {
    const onclose = vi.fn();
    render(HomeScreenDialog, { onclose });
    const gotIt = screen.getByRole('button', { name: 'Got it' });
    expect(gotIt.className).toContain('btn-primary');
    expect(gotIt.className).toContain('compact');

    await fireEvent.click(gotIt);
    expect(onclose).toHaveBeenCalledOnce();
  });
});
