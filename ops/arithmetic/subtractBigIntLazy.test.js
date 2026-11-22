import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { subtractBigIntLazy } from './subtractBigIntLazy.js';

describe('subtractBigIntLazy', () => {
  it('yields running differences for standard BigInt sequences', () => {
    const result = [...subtractBigIntLazy([100n, 30n, 20n, 5n])];
    assert.deepEqual(result, [100n, 70n, 50n, 45n]);
  });

  it('handles huge BigInts exceeding Number.MAX_SAFE_INTEGER (> 2^53) without precision loss', () => {
    const base = (1n << 128n) + 12345678901234567890123456789n;
    const sub1 = (1n << 64n) + 9876543210987654321n;
    const sub2 = 10n ** 30n + 7n;

    const result = [...subtractBigIntLazy([base, sub1, sub2])];
    assert.deepEqual(result, [base, base - sub1, base - sub1 - sub2]);
  });

  it('works accurately with fixed-point BigInts scaled by 10^18', () => {
    const SCALE = 10n ** 18n;
    // 5.5 - 1.25 - 0.75 = 3.5
    const values = [55n * (SCALE / 10n), 125n * (SCALE / 100n), 75n * (SCALE / 100n)];
    const result = [...subtractBigIntLazy(values)];
    assert.deepEqual(result, [
      5500000000000000000n,
      4250000000000000000n,
      3500000000000000000n,
    ]);
  });

  it('lazily consumes an infinite generator without pulling extra elements', () => {
    let pulled = 0;
    let closed = false;

    function* naturalsFromTen() {
      let n = 10n;
      try {
        while (true) {
          pulled += 1;
          yield n;
          n += 1n;
        }
      } finally {
        closed = true;
      }
    }

    const gen = subtractBigIntLazy(naturalsFromTen());
    assert.equal(pulled, 0, 'should not pull before first .next()');

    const taken = [];
    for (const diff of gen) {
      taken.push(diff);
      assert.equal(pulled, taken.length, 'should pull strictly one item per yield');
      if (taken.length === 5) {
        break;
      }
    }

    // Inputs: 10n, 11n, 12n, 13n, 14n
    // Running diffs: 10n, -1n, -13n, -26n, -40n
    assert.deepEqual(taken, [10n, -1n, -13n, -26n, -40n]);
    assert.equal(pulled, 5);
    assert.equal(closed, true, 'should close underlying generator on early exit');
  });

  it('yields nothing for an empty iterable', () => {
    assert.deepEqual([...subtractBigIntLazy([])], []);
    assert.deepEqual([...subtractBigIntLazy(new Set())], []);
  });

  it('yields the sole element for a single-item iterable', () => {
    assert.deepEqual([...subtractBigIntLazy([42n])], [42n]);
    assert.deepEqual([...subtractBigIntLazy([-999999999999999999999n])], [-999999999999999999999n]);
  });

  it('handles negative BigInts and zeros properly', () => {
    const result = [...subtractBigIntLazy([-10n, -25n, 0n, 5n, -100n])];
    // -10, -10 - (-25) = 15, 15 - 0 = 15, 15 - 5 = 10, 10 - (-100) = 110
    assert.deepEqual(result, [-10n, 15n, 15n, 10n, 110n]);
  });

  it('throws TypeError eagerly for non-iterable inputs or strings', () => {
    for (const invalid of [null, undefined, 42, 42n, true, {}, '', '123']) {
      assert.throws(
        () => subtractBigIntLazy(invalid),
        { name: 'TypeError' },
        `expected TypeError for ${String(invalid)}`
      );
    }
  });

  it('throws TypeError lazily when encountering a non-BigInt element', () => {
    const gen = subtractBigIntLazy([10n, 3n, 2, 1n]);
    assert.deepEqual(gen.next(), { value: 10n, done: false });
    assert.deepEqual(gen.next(), { value: 7n, done: false });
    assert.throws(() => gen.next(), {
      name: 'TypeError',
      message: /index 2.*number/,
    });

    assert.throws(() => [...subtractBigIntLazy([null])], {
      name: 'TypeError',
      message: /index 0.*null/,
    });
    assert.throws(() => [...subtractBigIntLazy([1n, '2'])], {
      name: 'TypeError',
      message: /index 1.*string/,
    });
  });

  it('matches independent first - sum(rest) computation across diverse sequences', () => {
    const sequences = [
      [0n, 1n, 2n, 3n, 4n, 5n],
      [10n ** 40n, -(10n ** 39n), 10n ** 38n, -(10n ** 37n), 987654321n],
      Array.from({ length: 50 }, (_, i) => BigInt(i * i) * (i % 2 === 0 ? 1n : -1n) * 10n ** 18n),
    ];

    for (const seq of sequences) {
      const diffs = [...subtractBigIntLazy(seq)];
      assert.equal(diffs.length, seq.length);

      // Verify final value against independent first - sum(rest)
      const [first, ...rest] = seq;
      const sumRest = rest.reduce((acc, x) => acc + x, 0n);
      assert.equal(diffs.at(-1), first - sumRest);

      // Verify every prefix satisfies first - sum(rest_prefix)
      let prefixSumRest = 0n;
      assert.equal(diffs[0], first);
      for (let i = 1; i < seq.length; i += 1) {
        prefixSumRest += seq[i];
        assert.equal(diffs[i], first - prefixSumRest);
      }
    }
  });
});
