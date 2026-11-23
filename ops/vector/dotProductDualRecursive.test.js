import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dotProductDualRecursive } from './dotProductDualRecursive.js';

/**
 * Independent iterative reference implementation of the dual vector dot product.
 *
 * @param {{ v: number, d: number }[]} a
 * @param {{ v: number, d: number }[]} b
 * @returns {{ v: number, d: number }}
 */
function referenceIterativeDotDual(a, b) {
  let v = 0;
  let d = 0;
  for (let i = 0; i < a.length; i += 1) {
    v += a[i].v * b[i].v;
    d += a[i].v * b[i].d + a[i].d * b[i].v;
  }
  return { v, d };
}

/**
 * Asserts two dual numbers are approximately equal within `eps`.
 *
 * @param {{ v: number, d: number }} actual
 * @param {{ v: number, d: number }} expected
 * @param {number} [eps=1e-12]
 */
function assertDualClose(actual, expected, eps = 1e-12) {
  assert.ok(
    Math.abs(actual.v - expected.v) <= eps,
    `Expected v=${actual.v} to be within ${eps} of ${expected.v}`,
  );
  assert.ok(
    Math.abs(actual.d - expected.d) <= eps,
    `Expected d=${actual.d} to be within ${eps} of ${expected.d}`,
  );
}

describe('dotProductDualRecursive', () => {
  it('returns { v: 0, d: 0 } for empty vectors', () => {
    assert.deepEqual(dotProductDualRecursive([], []), { v: 0, d: 0 });
  });

  it('computes dot product for single-element vectors', () => {
    const res = dotProductDualRecursive([{ v: 3, d: 2 }], [{ v: 4, d: -5 }]);
    // v = 3*4 = 12, d = 3*(-5) + 2*4 = -15 + 8 = -7
    assert.deepEqual(res, { v: 12, d: -7 });
  });

  it('computes dot product for even-length vectors', () => {
    const a = [
      { v: 1, d: 2 },
      { v: 3, d: 4 },
      { v: -2, d: 1 },
      { v: 5, d: -3 },
    ];
    const b = [
      { v: 4, d: -1 },
      { v: -2, d: 5 },
      { v: 3, d: 2 },
      { v: 1, d: 6 },
    ];
    // v = 4 - 6 - 6 + 5 = -3
    // d = (1*-1 + 2*4) + (3*5 + 4*-2) + (-2*2 + 1*3) + (5*6 + -3*1)
    //   = 7 + 7 - 1 + 27 = 40
    assert.deepEqual(dotProductDualRecursive(a, b), { v: -3, d: 40 });
  });

  it('computes dot product for odd-length vectors', () => {
    const a = [
      { v: 2, d: 1 },
      { v: -1, d: 3 },
      { v: 4, d: -2 },
      { v: 0.5, d: 0.25 },
      { v: -3, d: 5 },
    ];
    const b = [
      { v: 3, d: 4 },
      { v: 2, d: -1 },
      { v: -1, d: 2 },
      { v: 8, d: -4 },
      { v: 1, d: 1 },
    ];
    const expected = referenceIterativeDotDual(a, b);
    assertDualClose(dotProductDualRecursive(a, b), expected);
  });

  it('handles orthogonal primal vectors with zero and non-zero derivatives', () => {
    // Primal vectors (1, 0, -1) and (1, 2, 1) are orthogonal: 1*1 + 0*2 + (-1)*1 = 0
    const a = [
      { v: 1, d: 0.5 },
      { v: 0, d: -1 },
      { v: -1, d: 2 },
    ];
    const b = [
      { v: 1, d: -0.5 },
      { v: 2, d: 3 },
      { v: 1, d: 4 },
    ];
    // v = 0
    // d = (1*-0.5 + 0.5*1) + (0*3 + -1*2) + (-1*4 + 2*1) = 0 - 2 - 2 = -4
    assert.deepEqual(dotProductDualRecursive(a, b), { v: 0, d: -4 });

    // Orthogonal with zero derivatives
    const c = [
      { v: 1, d: 0 },
      { v: -1, d: 0 },
    ];
    const dVec = [
      { v: 1, d: 0 },
      { v: 1, d: 0 },
    ];
    assert.deepEqual(dotProductDualRecursive(c, dVec), { v: 0, d: 0 });
  });

  it('annihilates products of purely infinitesimal dual numbers (epsilon^2 = 0)', () => {
    const a = [
      { v: 0, d: 7 },
      { v: 0, d: -3 },
      { v: 0, d: 11 },
    ];
    const b = [
      { v: 0, d: 5 },
      { v: 0, d: 9 },
      { v: 0, d: -2 },
    ];
    assert.deepEqual(dotProductDualRecursive(a, b), { v: 0, d: 0 });
  });

  it('satisfies commutativity and bilinearity', () => {
    const a = [
      { v: 1.5, d: -0.5 },
      { v: 2.25, d: 1.25 },
      { v: -3.0, d: 0.75 },
    ];
    const b = [
      { v: -2.0, d: 3.0 },
      { v: 0.5, d: -1.5 },
      { v: 4.0, d: 2.0 },
    ];
    const c = [
      { v: 0.25, d: 0.5 },
      { v: -1.0, d: 2.0 },
      { v: 1.5, d: -0.25 },
    ];

    // Commutativity: a . b === b . a
    assertDualClose(dotProductDualRecursive(a, b), dotProductDualRecursive(b, a));

    // Additivity: (a + c) . b === a . b + c . b
    const aPlusC = a.map((el, i) => ({ v: el.v + c[i].v, d: el.d + c[i].d }));
    const lhs = dotProductDualRecursive(aPlusC, b);
    const ab = dotProductDualRecursive(a, b);
    const cb = dotProductDualRecursive(c, b);
    assertDualClose(lhs, { v: ab.v + cb.v, d: ab.d + cb.d });
  });

  it('cross-checks against iterative reference across deterministic vectors of various lengths', () => {
    // Simple deterministic LCG for reproducible pseudo-random dual vectors
    let seed = 42;
    const nextRand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return (seed / 0xffffffff) * 20 - 10;
    };

    for (const len of [1, 2, 3, 7, 16, 31, 101, 512]) {
      const a = Array.from({ length: len }, () => ({ v: nextRand(), d: nextRand() }));
      const b = Array.from({ length: len }, () => ({ v: nextRand(), d: nextRand() }));
      const actual = dotProductDualRecursive(a, b);
      const expected = referenceIterativeDotDual(a, b);
      assertDualClose(actual, expected, 1e-10);
    }
  });

  it('cross-checks forward-mode derivative against central finite differences', () => {
    const dim = 11;
    const evalA = (t) =>
      Array.from({ length: dim }, (_, i) => {
        const k = i + 1;
        return Math.sin(k * t) + 0.25 * k * t * t;
      });
    const evalADeriv = (t) =>
      Array.from({ length: dim }, (_, i) => {
        const k = i + 1;
        return k * Math.cos(k * t) + 0.5 * k * t;
      });
    const evalB = (t) =>
      Array.from({ length: dim }, (_, i) => {
        const k = i + 1;
        return Math.cos(0.5 * k * t) - Math.exp(-0.1 * k * t);
      });
    const evalBDeriv = (t) =>
      Array.from({ length: dim }, (_, i) => {
        const k = i + 1;
        return -0.5 * k * Math.sin(0.5 * k * t) + 0.1 * k * Math.exp(-0.1 * k * t);
      });

    const scalarDot = (u, w) => u.reduce((acc, val, i) => acc + val * w[i], 0);

    const h = 1e-6;
    for (const t of [-1.2, 0.0, 0.73, 2.15]) {
      const aVal = evalA(t);
      const aDer = evalADeriv(t);
      const bVal = evalB(t);
      const bDer = evalBDeriv(t);

      const aDual = aVal.map((v, i) => ({ v, d: aDer[i] }));
      const bDual = bVal.map((v, i) => ({ v, d: bDer[i] }));

      const res = dotProductDualRecursive(aDual, bDual);

      const fPlus = scalarDot(evalA(t + h), evalB(t + h));
      const fMinus = scalarDot(evalA(t - h), evalB(t - h));
      const fdDeriv = (fPlus - fMinus) / (2 * h);
      const exactVal = scalarDot(aVal, bVal);

      assertDualClose(res, { v: exactVal, d: fdDeriv }, 1e-7);
    }
  });

  describe('input validation', () => {
    it('throws TypeError when arguments are not arrays', () => {
      assert.throws(() => dotProductDualRecursive(null, []), TypeError);
      assert.throws(() => dotProductDualRecursive([], undefined), TypeError);
      assert.throws(() => dotProductDualRecursive('abc', []), TypeError);
      assert.throws(() => dotProductDualRecursive({ v: 1, d: 1 }, []), TypeError);
      assert.throws(() => dotProductDualRecursive(new Float64Array([1]), [{ v: 1, d: 0 }]), TypeError);
    });

    it('throws RangeError when vector lengths do not match', () => {
      assert.throws(
        () => dotProductDualRecursive([{ v: 1, d: 0 }], []),
        RangeError,
      );
      assert.throws(
        () =>
          dotProductDualRecursive(
            [{ v: 1, d: 0 }, { v: 2, d: 1 }],
            [{ v: 1, d: 0 }],
          ),
        RangeError,
      );
    });

    it('throws TypeError for invalid dual elements', () => {
      assert.throws(() => dotProductDualRecursive([null], [{ v: 1, d: 0 }]), TypeError);
      assert.throws(() => dotProductDualRecursive([1], [{ v: 1, d: 0 }]), TypeError);
      assert.throws(() => dotProductDualRecursive([[1, 2]], [{ v: 1, d: 0 }]), TypeError);
      assert.throws(() => dotProductDualRecursive([{ v: 1 }], [{ v: 1, d: 0 }]), TypeError);
      assert.throws(() => dotProductDualRecursive([{ d: 1 }], [{ v: 1, d: 0 }]), TypeError);
      assert.throws(
        () => dotProductDualRecursive([{ v: 1, d: 0 }], [{ v: '1', d: 0 }]),
        TypeError,
      );
      // Sparse array hole
      // eslint-disable-next-line no-sparse-arrays
      const sparse = [,];
      assert.throws(() => dotProductDualRecursive(sparse, [{ v: 1, d: 0 }]), TypeError);
    });

    it('throws RangeError for non-finite dual components', () => {
      assert.throws(
        () => dotProductDualRecursive([{ v: Number.NaN, d: 0 }], [{ v: 1, d: 0 }]),
        RangeError,
      );
      assert.throws(
        () => dotProductDualRecursive([{ v: 1, d: Number.POSITIVE_INFINITY }], [{ v: 1, d: 0 }]),
        RangeError,
      );
      assert.throws(
        () => dotProductDualRecursive([{ v: 1, d: 0 }], [{ v: Number.NEGATIVE_INFINITY, d: 0 }]),
        RangeError,
      );
    });
  });
});
