import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { moduloRationalLazy } from './moduloRationalLazy.js';

const rat = (num, den = 1n) => ({ num: BigInt(num), den: BigInt(den) });

function gcd(a, b) {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

function cmpRational(a, b) {
  const lhs = a.num * b.den;
  const rhs = b.num * a.den;
  return lhs < rhs ? -1 : lhs > rhs ? 1 : 0;
}

function subRational(a, b) {
  const num = a.num * b.den - b.num * a.den;
  const den = a.den * b.den;
  if (num === 0n) return { num: 0n, den: 1n };
  const sNum = den < 0n ? -num : num;
  const pDen = den < 0n ? -den : den;
  const g = gcd(sNum, pDen);
  return { num: sNum / g, den: pDen / g };
}

function mulRational(a, b) {
  const num = a.num * b.num;
  const den = a.den * b.den;
  if (num === 0n) return { num: 0n, den: 1n };
  const sNum = den < 0n ? -num : num;
  const pDen = den < 0n ? -den : den;
  const g = gcd(sNum, pDen);
  return { num: sNum / g, den: pDen / g };
}

function addRational(a, b) {
  return subRational(a, { num: -b.num, den: b.den });
}

function floorDivBigInt(n, d) {
  // Independent BigInt floor division for cross-checking.
  const q = n / d;
  const r = n % d;
  if (r !== 0n && (r < 0n) !== (d < 0n)) {
    return q - 1n;
  }
  return q;
}

function assertLowestTerms(r) {
  assert.equal(typeof r.num, 'bigint');
  assert.equal(typeof r.den, 'bigint');
  assert.ok(r.den > 0n, `Expected positive denominator, got ${r.den}`);
  if (r.num === 0n) {
    assert.equal(r.den, 1n);
  } else {
    assert.equal(gcd(r.num, r.den), 1n, `Not reduced: ${r.num}/${r.den}`);
  }
}

describe('moduloRationalLazy', () => {
  describe('normal cases', () => {
    it('computes exact modulo for scalar rational pairs via generator', () => {
      assert.deepEqual([...moduloRationalLazy(rat(7, 2), rat(3, 4))], [rat(1, 2)]);
      assert.deepEqual([...moduloRationalLazy(rat(5, 6), rat(1, 4))], [rat(1, 12)]);
      assert.deepEqual([...moduloRationalLazy(rat(10, 3), rat(1, 1))], [rat(1, 3)]);
      assert.deepEqual([...moduloRationalLazy(rat(3, 2), rat(1, 2))], [rat(0, 1)]);
      assert.deepEqual([...moduloRationalLazy(rat(1, 5), rat(2, 3))], [rat(1, 5)]);
    });

    it('handles negative dividends and negative divisors using floored modulo', () => {
      // -1/3 mod 2/5 = 1/15 since floor((-1/3)/(2/5)) = -1 and -1/3 - (-1)*(2/5) = 1/15
      assert.deepEqual([...moduloRationalLazy(rat(-1, 3), rat(2, 5))], [rat(1, 15)]);
      // 1/3 mod -2/5 = -1/15 since floor((1/3)/(-2/5)) = -1 and 1/3 - (-1)*(-2/5) = -1/15
      assert.deepEqual([...moduloRationalLazy(rat(1, 3), rat(-2, 5))], [rat(-1, 15)]);
      // -7/2 mod -3/4 = -1/2 since floor((-7/2)/(-3/4)) = 4 and -7/2 - 4*(-3/4) = -1/2
      assert.deepEqual([...moduloRationalLazy(rat(-7, 2), rat(-3, 4))], [rat(-1, 2)]);
      // Exact multiple with negative signs
      assert.deepEqual([...moduloRationalLazy(rat(-6, 4), rat(3, 4))], [rat(0, 1)]);
      assert.deepEqual([...moduloRationalLazy(rat(6, 4), rat(-3, 4))], [rat(0, 1)]);
    });

    it('zips two iterables of rationals pairwise', () => {
      const a = [rat(7, 2), rat(5, 6), rat(-1, 3)];
      const b = [rat(3, 4), rat(1, 4), rat(2, 5)];
      assert.deepEqual([...moduloRationalLazy(a, b)], [rat(1, 2), rat(1, 12), rat(1, 15)]);
    });

    it('broadcasts a scalar divisor over an iterable of dividends', () => {
      const dividends = [rat(0, 1), rat(1, 3), rat(4, 3), rat(-1, 3), rat(5, 2)];
      assert.deepEqual(
        [...moduloRationalLazy(dividends, rat(1, 1))],
        [rat(0, 1), rat(1, 3), rat(1, 3), rat(2, 3), rat(1, 2)]
      );
    });

    it('broadcasts a scalar dividend over an iterable of divisors', () => {
      const divisors = [rat(1, 1), rat(1, 2), rat(1, 3), rat(2, 5)];
      assert.deepEqual(
        [...moduloRationalLazy(rat(7, 6), divisors)],
        [rat(1, 6), rat(1, 6), rat(1, 6), rat(11, 30)]
      );
    });
  });

  describe('edge cases', () => {
    it('normalizes unreduced inputs and negative denominators', () => {
      // 14/4 = 7/2, 6/-8 = -3/4 => 7/2 mod -3/4: floor(-14/3) = -5 => 7/2 - 15/4 = -1/4
      const [res] = [...moduloRationalLazy(rat(14, 4), rat(6, -8))];
      assertLowestTerms(res);
      assert.deepEqual(res, rat(-1, 4));

      // Zero dividend with unnormalized denominator
      const [zeroRes] = [...moduloRationalLazy(rat(0, -17), rat(5, -10))];
      assertLowestTerms(zeroRes);
      assert.deepEqual(zeroRes, rat(0, 1));
    });

    it('handles arbitrary-precision BigInt rationals', () => {
      const big = 10n ** 60n;
      const a = rat(big + 7n, 3n);
      const b = rat(big, 3n);
      // (big + 7)/3 mod big/3 = 7/3 (since big > 7)
      assert.deepEqual([...moduloRationalLazy(a, b)], [rat(7, 3)]);

      const hugeDen = 2n ** 200n;
      const a2 = rat(5n * hugeDen + 3n, hugeDen);
      const b2 = rat(1n, 1n);
      assert.deepEqual([...moduloRationalLazy(a2, b2)], [rat(3n, hugeDen)]);
    });

    it('handles empty iterables and mismatched lengths without over-consuming', () => {
      let pullsFromB = 0;
      function* trackedB() {
        while (true) {
          pullsFromB++;
          yield rat(1, 2);
        }
      }

      assert.deepEqual([...moduloRationalLazy([], trackedB())], []);
      assert.equal(pullsFromB, 0);

      assert.deepEqual(
        [...moduloRationalLazy([rat(3, 4), rat(5, 4)], trackedB())],
        [rat(1, 4), rat(1, 4)]
      );
      assert.equal(pullsFromB, 2);

      assert.deepEqual([...moduloRationalLazy([], rat(1, 2))], []);
      assert.deepEqual([...moduloRationalLazy(rat(1, 2), [])], []);
    });

    it('consumes infinite generators strictly lazily and cleans up on early exit', () => {
      let aProduced = 0;
      let bProduced = 0;
      let aClosed = false;
      let bClosed = false;

      function* infA() {
        try {
          for (let i = 1n; ; i++) {
            aProduced++;
            yield rat(i, 3n);
          }
        } finally {
          aClosed = true;
        }
      }

      function* infB() {
        try {
          for (let i = 1n; ; i++) {
            bProduced++;
            yield rat(1n, 2n);
          }
        } finally {
          bClosed = true;
        }
      }

      const gen = moduloRationalLazy(infA(), infB());
      assert.equal(aProduced, 0);
      assert.equal(bProduced, 0);

      const first = gen.next();
      assert.equal(first.done, false);
      assert.deepEqual(first.value, rat(1, 3));
      assert.equal(aProduced, 1);
      assert.equal(bProduced, 1);

      const second = gen.next();
      assert.deepEqual(second.value, rat(1, 6));
      assert.equal(aProduced, 2);
      assert.equal(bProduced, 2);

      gen.return();
      assert.equal(aClosed, true);
      assert.equal(bClosed, true);
    });

    it('validates invalid arguments eagerly and invalid stream elements lazily', () => {
      // Top-level type validation
      assert.throws(() => moduloRationalLazy(null, rat(1, 1)), TypeError);
      assert.throws(() => moduloRationalLazy(rat(1, 1), undefined), TypeError);
      assert.throws(() => moduloRationalLazy('1/2', rat(1, 1)), TypeError);
      assert.throws(() => moduloRationalLazy(rat(1, 1), '1/2'), TypeError);
      assert.throws(() => moduloRationalLazy({ num: 1, den: 2 }, rat(1, 1)), TypeError);
      assert.throws(() => moduloRationalLazy(rat(1, 1), { num: 1n }), TypeError);

      // Top-level range validation (zero denominator / zero scalar divisor)
      assert.throws(() => moduloRationalLazy(rat(1, 0), rat(1, 1)), RangeError);
      assert.throws(() => moduloRationalLazy(rat(1, 1), rat(1, 0)), RangeError);
      assert.throws(() => moduloRationalLazy(rat(1, 1), rat(0, 5)), RangeError);
      assert.throws(() => moduloRationalLazy([rat(1, 1)], rat(0, 1)), RangeError);

      // Lazy validation of stream elements
      const gen = moduloRationalLazy(
        [rat(3, 2), rat(5, 2)],
        [rat(1, 1), rat(0, 1)]
      );
      assert.deepEqual(gen.next().value, rat(1, 2));
      assert.throws(() => gen.next(), RangeError);

      const genBadType = moduloRationalLazy([rat(1, 2), { num: 1, den: 2 }], rat(1, 1));
      assert.deepEqual(genBadType.next().value, rat(1, 2));
      assert.throws(() => genBadType.next(), TypeError);
    });
  });

  describe('independent cross-checks', () => {
    it('satisfies division algorithm, bounds, and lowest-terms invariants across rational grid', () => {
      const nums = [-13n, -7n, -4n, -1n, 0n, 1n, 4n, 7n, 13n];
      const dens = [-6n, -4n, -3n, -1n, 1n, 2n, 3n, 5n, 6n];

      const dividends = [];
      const divisors = [];
      for (const na of nums) {
        for (const da of dens) {
          for (const nb of nums) {
            if (nb === 0n) continue;
            for (const db of dens) {
              dividends.push({ num: na, den: da });
              divisors.push({ num: nb, den: db });
            }
          }
        }
      }

      let checked = 0;
      const results = moduloRationalLazy(dividends, divisors);
      for (const r of results) {
        const aRaw = dividends[checked];
        const bRaw = divisors[checked];
        checked++;

        assertLowestTerms(r);

        // Normalize a and b independently for reference calculation
        const a = addRational(aRaw, rat(0, 1));
        const b = addRational(bRaw, rat(0, 1));

        // Independent floor division: q = floor((a.num * b.den) / (a.den * b.num))
        const q = floorDivBigInt(a.num * b.den, a.den * b.num);
        const expected = subRational(a, mulRational(b, rat(q, 1n)));
        assert.deepEqual(r, expected);

        // Division algorithm reconstruction: b * q + r === a
        assert.deepEqual(addRational(mulRational(b, rat(q, 1n)), r), a);

        // Sign and range bounds: 0 <= r < b if b > 0; b < r <= 0 if b < 0
        if (b.num > 0n) {
          assert.ok(cmpRational(r, rat(0, 1)) >= 0);
          assert.ok(cmpRational(r, b) < 0);
        } else {
          assert.ok(cmpRational(r, b) > 0);
          assert.ok(cmpRational(r, rat(0, 1)) <= 0);
        }
      }
      assert.equal(checked, dividends.length);
    });

    it('matches exact IEEE-754 floating-point floored modulo on dyadic rationals', () => {
      const dyadicsA = [-15n, -7n, -1n, 0n, 1n, 9n, 23n].map((n) => rat(n, 8n));
      const dyadicsB = [-5n, -3n, -1n, 1n, 3n, 6n].map((n) => rat(n, 4n));

      for (const b of dyadicsB) {
        const bFloat = Number(b.num) / Number(b.den);
        const stream = moduloRationalLazy(dyadicsA, b);
        let i = 0;
        for (const r of stream) {
          const a = dyadicsA[i++];
          const aFloat = Number(a.num) / Number(a.den);
          const expectedFloat = aFloat - bFloat * Math.floor(aFloat / bFloat);
          const actualFloat = Number(r.num) / Number(r.den);
          assert.equal(actualFloat, expectedFloat);
        }
      }
    });
  });
});
