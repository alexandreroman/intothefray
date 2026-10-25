import { mutationsDelivered } from './mutations.testing';
import { selectionIndicator } from './selectionIndicator';

afterEach(() => {
  document.body.replaceChildren();
});

/** Swatches as radios, none checked, after their indicator. */
function swatches(count: number): {
  group: HTMLElement;
  indicator: HTMLElement;
  radios: HTMLElement[];
} {
  const group = document.createElement('div');
  const indicator = document.createElement('span');
  indicator.dataset.indicator = '';
  group.append(indicator);
  const radios = Array.from({ length: count }, (_, i) => {
    const radio = document.createElement('button');
    radio.setAttribute('role', 'radio');
    radio.setAttribute('aria-checked', 'false');
    Object.defineProperty(radio, 'offsetLeft', { value: i * 30 });
    group.append(radio);
    return radio;
  });
  document.body.append(group);
  return { group, indicator, radios };
}

describe('selectionIndicator', () => {
  it('follows a checked radio, sliding from one to the next', async () => {
    const { group, indicator, radios } = swatches(3);
    radios[0]!.setAttribute('aria-checked', 'true');
    const action = selectionIndicator(group);
    expect(indicator.style.transform).toBe('translate(0px, 0px)');
    expect(indicator.dataset.slides).toBeUndefined();

    radios[0]!.setAttribute('aria-checked', 'false');
    radios[2]!.setAttribute('aria-checked', 'true');
    await mutationsDelivered();
    expect(indicator.style.transform).toBe('translate(60px, 0px)');
    expect(indicator.dataset.slides).toBe('');

    action.destroy?.();
  });

  it('hides without a selection, then appears in place rather than sliding in', async () => {
    const { group, indicator, radios } = swatches(2);
    const action = selectionIndicator(group);
    expect(indicator.hidden).toBe(true);

    radios[1]!.setAttribute('aria-checked', 'true');
    await mutationsDelivered();
    expect(indicator.hidden).toBe(false);
    expect(indicator.style.transform).toBe('translate(30px, 0px)');
    expect(indicator.dataset.slides).toBeUndefined();

    action.destroy?.();
  });

  it('stops following once destroyed', async () => {
    const { group, indicator, radios } = swatches(2);
    radios[0]!.setAttribute('aria-checked', 'true');
    const action = selectionIndicator(group);
    action.destroy?.();

    radios[0]!.setAttribute('aria-checked', 'false');
    radios[1]!.setAttribute('aria-checked', 'true');
    await mutationsDelivered();
    expect(indicator.style.transform).toBe('translate(0px, 0px)');
  });

  it('requires an indicator', () => {
    const group = document.createElement('div');
    expect(() => selectionIndicator(group)).toThrow('[data-indicator]');
  });
});
