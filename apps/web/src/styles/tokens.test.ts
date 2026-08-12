import styles from './tokens.css?inline';

function channel(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const channels = hex.match(/[a-f\d]{2}/giu)?.map((part) => channel(Number.parseInt(part, 16)));
  if (channels?.length !== 3) throw new Error(`Invalid color: ${hex}`);
  const [red = 0, green = 0, blue = 0] = channels;
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(foreground: string, background: string): number {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  const [lightest, darkest] = values;
  if (lightest === undefined || darkest === undefined) throw new Error('Contrast input missing');
  return (lightest + 0.05) / (darkest + 0.05);
}

describe('visual tokens', () => {
  test('keeps body and interactive text at WCAG AA contrast', () => {
    expect(contrast('#17231f', '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#ffffff', '#006b57')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#17231f', '#ffac3d')).toBeGreaterThanOrEqual(4.5);
  });

  test('defines an explicit focus-visible treatment and reduced-motion fallback', () => {
    expect(styles).toContain(':focus-visible');
    expect(styles).toContain('prefers-reduced-motion: reduce');
  });
});
