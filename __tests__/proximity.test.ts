import { formatRange, rssiToRange, RssiSmoother } from '../src/lib/proximity';

describe('rssiToRange', () => {
  it('gets farther as the signal weakens', () => {
    const strong = rssiToRange(-55);
    const weak = rssiToRange(-85);
    expect(weak.mid).toBeGreaterThan(strong.mid);
    expect(weak.low).toBeLessThanOrEqual(weak.high);
  });

  it('reports a range, not a single number, at middling signal', () => {
    expect(formatRange(rssiToRange(-75))).toBe('2–10 m');
  });

  it('collapses very strong signal to arm length', () => {
    expect(formatRange(rssiToRange(-40))).toBe('within 1 m');
  });
});

describe('RssiSmoother', () => {
  it('detects getting closer', () => {
    const s = new RssiSmoother();
    let last;
    for (let t = 0; t <= 6000; t += 250) {
      last = s.push(-90 + t / 200, t);
    }
    expect(last?.trend).toBe('closer');
  });

  it('ignores noise around a steady value', () => {
    const s = new RssiSmoother();
    let last;
    for (let t = 0; t <= 6000; t += 250) {
      last = s.push(-70 + (t % 500 === 0 ? 6 : -6), t);
    }
    expect(last?.trend).toBe('steady');
  });
});
