import { act, renderHook } from '@testing-library/react';

import { useDebouncedValue } from './use-debounced-value.js';

describe('useDebouncedValue', () => {
  test('publishes only the latest value after exactly 350 ms', async () => {
    vi.useFakeTimers();
    try {
      const { result, rerender } = renderHook(
        ({ value }: { value: string }) => useDebouncedValue(value, 350),
        { initialProps: { value: 'initial' } }
      );

      rerender({ value: 'first' });
      await act(() => vi.advanceTimersByTimeAsync(349));
      expect(result.current).toBe('initial');
      await act(() => vi.advanceTimersByTimeAsync(1));
      expect(result.current).toBe('first');

      rerender({ value: 'discarded' });
      await act(() => vi.advanceTimersByTimeAsync(200));
      rerender({ value: 'latest' });
      await act(() => vi.advanceTimersByTimeAsync(349));
      expect(result.current).toBe('first');
      await act(() => vi.advanceTimersByTimeAsync(1));
      expect(result.current).toBe('latest');
    } finally {
      vi.useRealTimers();
    }
  });
});
