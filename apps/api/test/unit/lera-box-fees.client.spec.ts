import {
  feeBpsToGatewayPercent,
  feePercentToBps
} from '../../src/integrations/lera-box/fees/lera-box-fees.client.js';

describe('fee normalization', () => {
  test.each([
    [0, 0],
    [2.49, 249],
    [3.19, 319],
    [9.49, 949],
    [10.29, 1029],
    [100, 10000]
  ])('normalizes %p percent to %p basis points', (percent, bps) => {
    expect(feePercentToBps(percent)).toBe(bps);
    expect(feeBpsToGatewayPercent(bps)).toBe(percent);
  });

  test.each([2.499, -0.01, 100.01, Number.NaN, '3.19'])('rejects divergent rate %p', (rate) => {
    expect(() => feePercentToBps(rate)).toThrow('LERA_BOX_MALFORMED_RESPONSE');
  });

  test.each([-1, 10001, 319.5])('rejects invalid basis points %p', (bps) => {
    expect(() => feeBpsToGatewayPercent(bps)).toThrow('LERA_BOX_MALFORMED_RESPONSE');
  });
});
