import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { magnitudeDualMemo } from './magnitudeDualMemo.js';

/**
 * Helper to assert two numbers are within an absolute tolerance.
 */
function assertClose(actual, expected, tol = 1e-12, message) {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    message ?? `Expected ${actual} to be within ${tol} of ${expected} (diff=${Math.abs(actual - expected)})`
  );
}

/**
 * Independent central finite-difference approximation of d/dt ||x(t)|| at t = 0
 * where x_i(t) = v_i + t * d_i.
 */
function finiteDifferenceMagnitude(vec, h = 1e-7) {
  const normAt = (t) => {
    let sumSq = 0;
    for (const { v, d } of vec) {
      const val = v + t * d;
      sumSq += val * val;
    }
    return Math.sqrt(sumSq);
  };
  return (normAt(h) - normAt(-h)) / (2 * h);
}

/**
 * Independent dual-number dot product v · v = { v: sum(x.v^2), d: sum(2 * x.v * x.d) }.
 */
function dualDotSelf(vec) {
  let v = 0;
  let d = 0;
  for (const item of vec) {
    v += item.v * item.v;
    d += 2 * item.v * item.d;
  }
  return { v, d };
}

/**
 * Independent dual-number square: { v, d }^2 = { v: v^2, d: 2 * v * d }.
 */
function dualSquare(x) {
  return { v: x.v * x.v, d: 2 * x.v * x.d };
}

describe('magnitudeDualMemo', () => {
  describe('normal cases (2D, 3D, nD)', () => {
    it('computes 2D Pythagorean dual vector magnitude and derivative', () => {
      const res = magnitudeDualMemo([
        { v: 3, d: 1 },
        { v: 4, d: -2 },
      ]);
      // v = 5, d = (3*1 + 4*(-2)) / 5 = -5 / 5 = -1
      assertClose(res.v, 5);
      assertClose(res.d, -1);
    });

    it('computes 3D dual vector magnitude and derivative', () => {
      const res = magnitudeDualMemo([
        { v: 2, d: 3 },
        { v: -3, d: 4 },
        { v: 6, d: -1 },
      ]);
      // v = sqrt(4 + 9 + 36) = 7
      // d = (2*3 + (-3)*4 + 6*(-1)) / 7 = (6 - 12 - 6) / 7 = -12/7
      assertClose(res.v, 7);
      assertClose(res.d, -12 / 7);
    });

    it('computes higher-dimensional (nD) dual vectors accurately', () => {
      const vec5D = [
        { v: 1, d: 2 },
        { v: -2, d: 0.5 },
        { v: 3, d: -1 },
        { v: -4, d: 1.5 },
        { v: 5, d: -0.25 },
      ];
      // sum(v^2) = 1 + 4 + 9 + 16 + 25 = 55
      // sum(v*d) = 2 - 1 - 3 - 6 - 1.25 = -9.25
      const expectedV = Math.sqrt(55);
      const expectedD = -9.25 / expectedV;
      const res = magnitudeDualMemo(vec5D);
      assertClose(res.v, expectedV);
      assertClose(res.d, expectedD);
    });

    it('handles orthogonal tangent direction (zero derivative for non-zero tangent)', () => {
      // tangent (-4, 3) is perpendicular to (3, 4), so d/dt ||v|| = 0
      const res = magnitudeDualMemo([
        { v: 3, d: -4 },
        { v: 4, d: 3 },
      ]);
      assertClose(res.v, 5);
      assert.strictEqual(Object.is(res.d, 0), true);
    });

    it('handles very large and very small magnitudes without intermediate overflow/underflow', () => {
      const huge = magnitudeDualMemo([
        { v: 3e200, d: 1 },
        { v: 4e200, d: 2 },
      ]);
      assertClose(huge.v / 1e200, 5, 1e-12);
      assertClose(huge.d, (3 * 1 + 4 * 2) / 5, 1e-12);

      const tiny = magnitudeDualMemo([
        { v: 3e-200, d: 1 },
        { v: 4e-200, d: 2 },
      ]);
      assertClose(tiny.v / 1e-200, 5, 1e-12);
      assertClose(tiny.d, (3 * 1 + 4 * 2) / 5, 1e-12);
    });
  });

  describe('edge cases', () => {
    it('handles zero vectors with all-zero derivatives across dimensions', () => {
      for (const dim of [1, 2, 3, 4, 6]) {
        const zeroVec = Array.from({ length: dim }, () => ({ v: 0, d: 0 }));
        const res = magnitudeDualMemo(zeroVec);
        assert.deepStrictEqual(res, { v: 0, d: 0 });
        assert.strictEqual(Object.is(res.v, 0), true);
        assert.strictEqual(Object.is(res.d, 0), true);
      }
    });

    it('throws RangeError for zero vector with any non-zero derivative', () => {
      assert.throws(
        () => magnitudeDualMemo([{ v: 0, d: 1 }]),
        RangeError
      );
      assert.throws(
        () => magnitudeDualMemo([{ v: 0, d: 0 }, { v: 0, d: -0.5 }]),
        RangeError
      );
      assert.throws(
        () => magnitudeDualMemo([{ v: -0, d: 0 }, { v: 0, d: 0 }, { v: 0, d: 2 }]),
        RangeError
      );
    });

    it('handles single-element positive and negative vectors (d/dx |x| = sign(x))', () => {
      const pos = magnitudeDualMemo([{ v: 7.5, d: 2.25 }]);
      assertClose(pos.v, 7.5);
      assertClose(pos.d, 2.25);

      const neg = magnitudeDualMemo([{ v: -7.5, d: 2.25 }]);
      assertClose(neg.v, 7.5);
      assertClose(neg.d, -2.25);

      const negZeroD = magnitudeDualMemo([{ v: -4, d: -0 }]);
      assertClose(negZeroD.v, 4);
      assert.strictEqual(Object.is(negZeroD.d, 0), true);
    });

    it('normalizes negative zero inputs consistently', () => {
      const r1 = magnitudeDualMemo([{ v: -0, d: -0 }, { v: 0, d: -0 }]);
      assert.strictEqual(Object.is(r1.v, 0), true);
      assert.strictEqual(Object.is(r1.d, 0), true);

      const r2 = magnitudeDualMemo([{ v: 3, d: -0 }, { v: 4, d: -0 }]);
      assert.strictEqual(r2.v, 5);
      assert.strictEqual(Object.is(r2.d, 0), true);
    });
  });

  describe('invalid inputs', () => {
    it('throws TypeError for non-array inputs', () => {
      for (const bad of [null, undefined, 42, 'vec', { v: 1, d: 0 }, new Float64Array([1, 2])]) {
        assert.throws(() => magnitudeDualMemo(bad), TypeError);
      }
    });

    it('throws RangeError for empty vector', () => {
      assert.throws(() => magnitudeDualMemo([]), RangeError);
    });

    it('throws TypeError for malformed elements', () => {
      const malformed = [
        [null],
        [undefined],
        [123],
        [[1, 2]],
        [{ v: 1 }],
        [{ d: 1 }],
        [{ v: '1', d: 0 }],
        [{ v: 1, d: '0' }],
        [{ v: 1, d: 0 }, { v: 2, d: null }],
      ];
      for (const input of malformed) {
        assert.throws(() => magnitudeDualMemo(input), TypeError);
      }
    });

    it('throws RangeError for non-finite values (NaN, Infinity, -Infinity)', () => {
      const nonFinite = [
        [{ v: NaN, d: 0 }],
        [{ v: 1, d: NaN }],
        [{ v: Infinity, d: 0 }],
        [{ v: -Infinity, d: 1 }],
        [{ v: 1, d: Infinity }],
        [{ v: 1, d: -Infinity }],
      ];
      for (const input of nonFinite) {
        assert.throws(() => magnitudeDualMemo(input), RangeError);
      }
    });
  });

  describe('table-driven lookup and memoization behavior', () => {
    it('returns fresh objects on precomputed table hits and prevents cache poisoning', () => {
      const canonical = [{ v: 3, d: 1 }, { v: 4, d: 1 }];
      const first = magnitudeDualMemo(canonical);
      assertClose(first.v, 5);
      assertClose(first.d, 1.4);

      // Mutate returned object; subsequent calls must remain unaffected and return a new reference
      first.v = -999;
      first.d = 999;

      const second = magnitudeDualMemo(canonical);
      assert.notStrictEqual(first, second);
      assertClose(second.v, 5);
      assertClose(second.d, 1.4);
    });

    it('returns fresh objects on dynamic memo cache hits and prevents cache poisoning', () => {
      const vec = [{ v: 1.25, d: -0.75 }, { v: 2.5, d: 3.125 }, { v: -0.5, d: 0.25 }];
      const first = magnitudeDualMemo(vec);
      const expectedV = first.v;
      const expectedD = first.d;

      first.v = 0;
      first.d = 0;

      const second = magnitudeDualMemo(vec);
      assert.notStrictEqual(first, second);
      assert.strictEqual(second.v, expectedV);
      assert.strictEqual(second.d, expectedD);
    });

    it('handles cache pressure beyond bounded LRU capacity (> 1024 unique vectors) accurately', () => {
      // Insert 1200 distinct vectors to trigger LRU eviction, then verify earlier & later entries
      const samples = [];
      for (let i = 1; i <= 1200; i++) {
        const vec = [{ v: i, d: 0.5 }, { v: i + 1, d: -0.25 }];
        const res = magnitudeDualMemo(vec);
        if (i === 1 || i === 500 || i === 1200) {
          samples.push({ vec, expected: { v: res.v, d: res.d } });
        }
      }

      for (const { vec, expected } of samples) {
        const rechecked = magnitudeDualMemo(vec);
        assert.strictEqual(rechecked.v, expected.v);
        assert.strictEqual(rechecked.d, expected.d);
      }
    });

    it('does not collide cache keys across different dimensions or component boundaries', () => {
      const a = magnitudeDualMemo([{ v: 1, d: 2 }, { v: 3, d: 4 }]);
      const b = magnitudeDualMemo([{ v: 12, d: 34 }]);
      assert.notStrictEqual(a.v, b.v);

      const c = magnitudeDualMemo([{ v: 3, d: 1 }, { v: 4, d: 0 }]);
      const d = magnitudeDualMemo([{ v: 3, d: 0 }, { v: 4, d: 1 }]);
      assert.strictEqual(c.v, 5);
      assert.strictEqual(d.v, 5);
      assertClose(c.d, 0.6);
      assertClose(d.d, 0.8);
    });
  });

  describe('independent mathematical cross-checks', () => {
    const testVectors = [
      [{ v: 3, d: 1 }, { v: 4, d: 2 }],
      [{ v: -1.5, d: 0.7 }, { v: 2.3, d: -1.1 }, { v: 0.8, d: 0.4 }],
      [{ v: 0.25, d: -0.5 }, { v: -0.75, d: 1.25 }, { v: 1.5, d: -0.2 }, { v: -2.0, d: 0.9 }],
      [{ v: 10, d: -3 }, { v: -20, d: 5 }, { v: 30, d: -7 }, { v: -40, d: 11 }, { v: 50, d: -13 }],
      [{ v: -6.2, d: 4.1 }],
    ];

    it('matches central finite-difference derivative d/dt ||v + t*d||', () => {
      for (const vec of testVectors) {
        const { d } = magnitudeDualMemo(vec);
        const fd = finiteDifferenceMagnitude(vec);
        assertClose(d, fd, 1e-7, `Finite-difference mismatch for ${JSON.stringify(vec)}: got ${d}, expected ~${fd}`);
      }
    });

    it('satisfies dual-number identity ||v||^2 === v · v in both primal and derivative parts', () => {
      for (const vec of testVectors) {
        const mag = magnitudeDualMemo(vec);
        const magSquared = dualSquare(mag);
        const dotSelf = dualDotSelf(vec);
        assertClose(magSquared.v, dotSelf.v, 1e-10);
        assertClose(magSquared.d, dotSelf.d, 1e-10);
      }
    });
  });
});
