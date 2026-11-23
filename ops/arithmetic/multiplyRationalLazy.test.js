import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { multiplyRationalLazy } from './multiplyRationalLazy.js';

/**
 * Independent BigInt GCD for test cross-checks.
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function independentGcd(a, b) {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    [x, y] = [y, x % y];
  }
  return x;
}

/**
 * Verifies canonical lowest-terms invariants on a rational output.
 * @param {{ num: bigint, den: bigint }} r
 */
function assertCanonical(r) {
  assert.equal(typeof r.num, 'bigint');
  assert.equal(typeof r.den, 'bigint');
  assert.ok(r.den > 0n, `expected positive denominator, got ${r.den}`);
  if (r.num === 0n) {
    assert.equal(r.den, 1n);
  } else {
    assert.equal(independentGcd(r.num, r.den), 1n, `expected lowest terms for ${r.num}/${r.den}`);
  }
}

describe('multiplyRationalLazy', () => {
  describe('normal cases', () => {
    it('computes running products over an iterable of rationals in lowest terms', () => {
      const input = [
        { num: 2n, den: 3n },
        { num: 9n, den: 4n },
        { num: -4n, den: 15n },
        { num: -5n, den: 2n },
      ];
      const results = [...multiplyRationalLazy(input)];
      assert.deepEqual(results, [
        { num: 2n, den: 3n },
        { num: 3n, den: 2n },
        { num: -2n, den: 5n },
        { num: 1n, den: 1n },
      ]);
      for (const r of results) {
        assertCanonical(r);
      }
    });

    it('normalizes unreduced inputs and negative denominators', () => {
      const results = [
        ...multiplyRationalLazy([
          { num: 6n, den: -9n },
          { num: -10n, den: -4n },
        ]),
      ];
      assert.deepEqual(results, [
        { num: -2n, den: 3n },
        { num: -5n, den: 3n },
      ]);
    });

    it('computes pairwise products when given two iterables', () => {
      const left = [
        { num: 1n, den: 2n },
        { num: -3n, den: 4n },
        { num: 14n, den: 15n },
      ];
      const right = [
        { num: 4n, den: 3n },
        { num: 8n, den: -9n },
        { num: 25n, den: 21n },
      ];
      const results = [...multiplyRationalLazy(left, right)];
      assert.deepEqual(results, [
        { num: 2n, den: 3n },
        { num: 2n, den: 3n },
        { num: 10n, den: 9n },
      ]);
      for (const r of results) {
        assertCanonical(r);
      }
    });

    it('supports scaling a stream by a scalar rational in either argument order', () => {
      const stream = [
        { num: 1n, den: 6n },
        { num: -3n, den: 4n },
        { num: 0n, den: 5n },
      ];
      const scalar = { num: 4n, den: -6n }; // -2/3

      const expected = [
        { num: -1n, den: 9n },
        { num: 1n, den: 2n },
        { num: 0n, den: 1n },
      ];

      assert.deepEqual([...multiplyRationalLazy(stream, scalar)], expected);
      assert.deepEqual([...multiplyRationalLazy(scalar, stream)], expected);
    });

    it('supports multiplying two scalar rationals and returns a single-item generator', () => {
      const gen = multiplyRationalLazy({ num: 15n, den: 28n }, { num: -14n, den: 25n });
      assert.equal(typeof gen.next, 'function');
      assert.equal(typeof gen[Symbol.iterator], 'function');
      assert.deepEqual([...gen], [{ num: -3n, den: 10n }]);
    });

    it('works with non-array iterables such as Set and generator functions', () => {
      const set = new Set([
        { num: 3n, den: 5n },
        { num: 10n, den: 9n },
      ]);
      assert.deepEqual([...multiplyRationalLazy(set)], [
        { num: 3n, den: 5n },
        { num: 2n, den: 3n },
      ]);
    });
  });

  describe('edge cases', () => {
    it('yields nothing for an empty iterable', () => {
      assert.deepEqual([...multiplyRationalLazy([])], []);
      assert.deepEqual([...multiplyRationalLazy([], [{ num: 1n, den: 2n }])], []);
      assert.deepEqual([...multiplyRationalLazy([{ num: 1n, den: 2n }], [])], []);
      assert.deepEqual([...multiplyRationalLazy([], { num: 3n, den: 4n })], []);
    });

    it('handles single-element iterable and canonicalizes it', () => {
      assert.deepEqual([...multiplyRationalLazy([{ num: -12n, den: -18n }])], [
        { num: 2n, den: 3n },
      ]);
    });

    it('canonicalizes zero to { num: 0n, den: 1n } and preserves zero in running product', () => {
      const results = [
        ...multiplyRationalLazy([
          { num: 5n, den: 7n },
          { num: 0n, den: -99n },
          { num: 12345678901234567890n, den: 17n },
        ]),
      ];
      assert.deepEqual(results, [
        { num: 5n, den: 7n },
        { num: 0n, den: 1n },
        { num: 0n, den: 1n },
      ]);
    });

    it('stops zipping at the shorter iterable', () => {
      const short = [{ num: 2n, den: 3n }];
      const long = [
        { num: 3n, den: 5n },
        { num: 7n, den: 11n },
        { num: 13n, den: 17n },
      ];
      assert.deepEqual([...multiplyRationalLazy(short, long)], [{ num: 2n, den: 5n }]);
      assert.deepEqual([...multiplyRationalLazy(long, short)], [{ num: 2n, den: 5n }]);
    });

    it('handles very large BigInts without precision loss', () => {
      const p = 10n ** 60n + 7n;
      const q = 10n ** 60n + 9n;
      const common = 10n ** 50n;
      const results = [
        ...multiplyRationalLazy(
          { num: p * common, den: q * 3n },
          { num: q * 9n, den: common * p }
        ),
      ];
      assert.deepEqual(results, [{ num: 3n, den: 1n }]);
    });

    it('does not let caller mutations of yielded objects corrupt internal running state', () => {
      const gen = multiplyRationalLazy([
        { num: 2n, den: 3n },
        { num: 3n, den: 5n },
      ]);
      const first = gen.next().value;
      assert.deepEqual(first, { num: 2n, den: 3n });
      first.num = 999n;
      first.den = 1n;

      const second = gen.next().value;
      assert.deepEqual(second, { num: 2n, den: 5n });
    });
  });

  describe('lazy / streaming consumption', () => {
    it('consumes infinite generator strictly on demand (one pull per next)', () => {
      let pulls = 0;
      let closed = false;

      function* infiniteHarmonicSteps() {
        try {
          for (let k = 1n; ; k++) {
            pulls++;
            yield { num: k + 1n, den: k };
          }
        } finally {
          closed = true;
        }
      }

      const stream = multiplyRationalLazy(infiniteHarmonicSteps());
      assert.equal(pulls, 0, 'must not pull before first next()');

      const seen = [];
      for (const value of stream) {
        seen.push(value);
        assert.equal(pulls, seen.length, 'each next() should pull exactly one element');
        if (seen.length === 5) {
          break;
        }
      }

      assert.equal(pulls, 5);
      assert.equal(closed, true, 'breaking early must close upstream generator');
      assert.deepEqual(seen, [
        { num: 2n, den: 1n },
        { num: 3n, den: 1n },
        { num: 4n, den: 1n },
        { num: 5n, den: 1n },
        { num: 6n, den: 1n },
      ]);
    });

    it('lazily zips two infinite generators and closes both on early break', () => {
      let leftPulls = 0;
      let rightPulls = 0;
      let leftClosed = false;
      let rightClosed = false;

      function* leftGen() {
        try {
          for (let k = 1n; ; k++) {
            leftPulls++;
            yield { num: 1n, den: k };
          }
        } finally {
          leftClosed = true;
        }
      }

      function* rightGen() {
        try {
          for (let k = 1n; ; k++) {
            rightPulls++;
            yield { num: k * 2n, den: 3n };
          }
        } finally {
          rightClosed = true;
        }
      }

      const stream = multiplyRationalLazy(leftGen(), rightGen());
      assert.equal(leftPulls, 0);
      assert.equal(rightPulls, 0);

      const taken = [];
      for (const value of stream) {
        taken.push(value);
        assert.equal(leftPulls, taken.length);
        assert.equal(rightPulls, taken.length);
        if (taken.length === 4) {
          break;
        }
      }

      assert.equal(leftClosed, true);
      assert.equal(rightClosed, true);
      assert.deepEqual(taken, [
        { num: 2n, den: 3n },
        { num: 2n, den: 3n },
        { num: 2n, den: 3n },
        { num: 2n, den: 3n },
      ]);
    });

    it('does not pull from right iterable when left iterable is already exhausted', () => {
      let rightPulls = 0;
      let rightClosed = false;

      function* rightGen() {
        try {
          for (let k = 1n; ; k++) {
            rightPulls++;
            yield { num: k, den: 1n };
          }
        } finally {
          rightClosed = true;
        }
      }

      const results = [...multiplyRationalLazy([{ num: 5n, den: 2n }], rightGen())];
      assert.deepEqual(results, [{ num: 5n, den: 2n }]);
      assert.equal(rightPulls, 1);
      assert.equal(rightClosed, true);
    });

    it('validates stream elements lazily only when consumed', () => {
      function* faultyStream() {
        yield { num: 1n, den: 2n };
        yield { num: 2n, den: 3n };
        yield { num: 1n, den: 0n }; // invalid denominator at index 2
      }

      const gen = multiplyRationalLazy(faultyStream());
      assert.deepEqual(gen.next(), { value: { num: 1n, den: 2n }, done: false });
      assert.deepEqual(gen.next(), { value: { num: 1n, den: 3n }, done: false });
      assert.throws(() => gen.next(), RangeError);
    });
  });

  describe('input validation', () => {
    it('throws TypeError on wrong argument counts', () => {
      assert.throws(() => multiplyRationalLazy(), TypeError);
      assert.throws(
        () =>
          multiplyRationalLazy(
            [{ num: 1n, den: 2n }],
            [{ num: 1n, den: 2n }],
            [{ num: 1n, den: 2n }]
          ),
        TypeError
      );
    });

    it('throws TypeError on non-iterable or string single argument', () => {
      for (const bad of [null, undefined, 42, 42n, '1/2', { num: 1n, den: 2n }, true]) {
        assert.throws(() => multiplyRationalLazy(bad), TypeError);
      }
    });

    it('throws TypeError on invalid scalar or element shapes', () => {
      assert.throws(() => multiplyRationalLazy([{ num: 1n, den: 2n }], null), TypeError);
      assert.throws(() => multiplyRationalLazy([{ num: 1n, den: 2n }], '3/4'), TypeError);
      assert.throws(() => multiplyRationalLazy({ num: 1, den: 2n }, { num: 1n, den: 2n }), TypeError);
      assert.throws(() => multiplyRationalLazy({ num: 1n, den: 2 }, { num: 1n, den: 2n }), TypeError);
      assert.throws(() => multiplyRationalLazy({ num: 1n }, { num: 1n, den: 2n }), TypeError);
      assert.throws(() => [...multiplyRationalLazy([[1n, 2n]])], TypeError);
      assert.throws(() => [...multiplyRationalLazy([null])], TypeError);
      assert.throws(() => [...multiplyRationalLazy([{ num: '1', den: 2n }])], TypeError);
    });

    it('throws RangeError on zero denominator eagerly for scalars and lazily for streams', () => {
      assert.throws(
        () => multiplyRationalLazy([{ num: 1n, den: 2n }], { num: 1n, den: 0n }),
        RangeError
      );
      assert.throws(
        () => multiplyRationalLazy({ num: 0n, den: 0n }, [{ num: 1n, den: 2n }]),
        RangeError
      );
      assert.throws(
        () => multiplyRationalLazy({ num: 1n, den: 2n }, { num: 3n, den: 0n }),
        RangeError
      );
      assert.throws(() => [...multiplyRationalLazy([{ num: 1n, den: 0n }])], RangeError);
      assert.throws(
        () => [...multiplyRationalLazy([{ num: 1n, den: 2n }], [{ num: 1n, den: 0n }])],
        RangeError
      );
    });
  });

  describe('independent cross-checks', () => {
    it('matches exact telescoping product identity prod_{k=1..n} (k+1)/k === (n+1)/1', () => {
      function* telescoping(limit) {
        for (let k = 1n; k <= limit; k++) {
          yield { num: k + 1n, den: k };
        }
      }

      const n = 200n;
      let expectedNum = 2n;
      for (const product of multiplyRationalLazy(telescoping(n))) {
        assertCanonical(product);
        assert.deepEqual(product, { num: expectedNum, den: 1n });
        expectedNum++;
      }
      assert.equal(expectedNum, n + 2n);
    });

    it('matches independent unreduced-batch oracle and cross-multiplication identities', () => {
      // Deterministic LCG generating diverse positive/negative unreduced rationals
      let seed = 123456789n;
      const nextInt = () => {
        seed = (1103515245n * seed + 12345n) % (1n << 31n);
        return seed;
      };

      const seqA = [];
      const seqB = [];
      for (let i = 0; i < 60; i++) {
        const signA = nextInt() % 2n === 0n ? 1n : -1n;
        const signB = nextInt() % 2n === 0n ? 1n : -1n;
        const denSignA = nextInt() % 3n === 0n ? -1n : 1n;
        const denSignB = nextInt() % 3n === 0n ? -1n : 1n;
        seqA.push({
          num: signA * ((nextInt() % 500n) + 1n),
          den: denSignA * ((nextInt() % 500n) + 1n),
        });
        seqB.push({
          num: signB * ((nextInt() % 500n) + 1n),
          den: denSignB * ((nextInt() % 500n) + 1n),
        });
      }

      // Cross-check 1: Running product vs naive unreduced multiplication + single final GCD
      let rawNum = 1n;
      let rawDen = 1n;
      let idx = 0;
      for (const actual of multiplyRationalLazy(seqA)) {
        rawNum *= seqA[idx].num;
        rawDen *= seqA[idx].den;
        const normSign = rawDen < 0n ? -1n : 1n;
        const g = independentGcd(rawNum, rawDen);
        const oracle = {
          num: (rawNum * normSign) / g,
          den: (rawDen * normSign) / g,
        };
        assertCanonical(actual);
        assert.deepEqual(actual, oracle);
        idx++;
      }
      assert.equal(idx, seqA.length);

      // Cross-check 2: Order-invariance (commutativity & associativity of final running product)
      const forwardFinal = [...multiplyRationalLazy(seqA)].at(-1);
      const reversedFinal = [...multiplyRationalLazy([...seqA].reverse())].at(-1);
      assert.deepEqual(forwardFinal, reversedFinal);

      // Cross-check 3: Pairwise zip product cross-multiplication & commutativity
      const ab = [...multiplyRationalLazy(seqA, seqB)];
      const ba = [...multiplyRationalLazy(seqB, seqA)];
      assert.deepEqual(ab, ba);
      for (let i = 0; i < seqA.length; i++) {
        assertCanonical(ab[i]);
        assert.equal(
          ab[i].num * seqA[i].den * seqB[i].den,
          ab[i].den * seqA[i].num * seqB[i].num
        );
      }
    });
  });
});
