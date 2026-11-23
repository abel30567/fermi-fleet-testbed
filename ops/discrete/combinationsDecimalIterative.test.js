import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { combinationsDecimalIterative } from './combinationsDecimalIterative.js';

/**
 * Independent helper: exact BigInt factorial for cross-checking.
 * @param {bigint} m
 * @returns {bigint}
 */
function factorialBigInt(m) {
  let acc = 1n;
  for (let i = 2n; i <= m; i += 1n) {
    acc *= i;
  }
  return acc;
}

describe('combinationsDecimalIterative', () => {
  it('computes standard small and medium binomial coefficients', () => {
    assert.equal(combinationsDecimalIterative('5', '2'), '10');
    assert.equal(combinationsDecimalIterative('6', '3'), '20');
    assert.equal(combinationsDecimalIterative('10', '3'), '120');
    assert.equal(combinationsDecimalIterative('10', '5'), '252');
    assert.equal(combinationsDecimalIterative('20', '10'), '184756');
    assert.equal(combinationsDecimalIterative('52', '5'), '2598960');
  });

  it('handles boundary and degenerate edge cases (k=0, k=n, n=0, k=1, k>n)', () => {
    assert.equal(combinationsDecimalIterative('0', '0'), '1');
    assert.equal(combinationsDecimalIterative('1', '0'), '1');
    assert.equal(combinationsDecimalIterative('1', '1'), '1');
    assert.equal(combinationsDecimalIterative('50', '0'), '1');
    assert.equal(combinationsDecimalIterative('50', '50'), '1');
    assert.equal(combinationsDecimalIterative('50', '1'), '50');
    assert.equal(combinationsDecimalIterative('50', '49'), '50');
    assert.equal(combinationsDecimalIterative('0', '1'), '0');
    assert.equal(combinationsDecimalIterative('5', '6'), '0');
    assert.equal(combinationsDecimalIterative('10', '100'), '0');
  });

  it('computes large arbitrary-precision combinations accurately', () => {
    assert.equal(
      combinationsDecimalIterative('100', '50'),
      '100891344545564193334812497256'
    );
    assert.equal(
      combinationsDecimalIterative('200', '100'),
      '90548514656103281165404177077484163874504589675413336841320'
    );
    // Huge n with small k: C(10^24, 2) = 10^24 * (10^24 - 1) / 2
    const hugeN = '1000000000000000000000000';
    const expected = (BigInt(hugeN) * (BigInt(hugeN) - 1n)) / 2n;
    assert.equal(combinationsDecimalIterative(hugeN, '2'), expected.toString());
    assert.equal(
      combinationsDecimalIterative(hugeN, (BigInt(hugeN) - 2n).toString()),
      expected.toString()
    );
  });

  it('accepts trailing decimal zeros, leading zeros, plus sign, and surrounding whitespace', () => {
    assert.equal(combinationsDecimalIterative('10.0', '3.0'), '120');
    assert.equal(combinationsDecimalIterative('10.0000', '3.00'), '120');
    assert.equal(combinationsDecimalIterative('0.0', '0.000'), '1');
    assert.equal(combinationsDecimalIterative('0005', '002'), '10');
    assert.equal(combinationsDecimalIterative('+5.0', '+2.00'), '10');
    assert.equal(combinationsDecimalIterative('  10.0  ', '\t4.00\n'), '210');
  });

  it('formats output according to the configurable precision argument', () => {
    assert.equal(combinationsDecimalIterative('10', '3', undefined), '120');
    assert.equal(combinationsDecimalIterative('10', '3', 0), '120');
    assert.equal(combinationsDecimalIterative('10', '3', 1), '120.0');
    assert.equal(combinationsDecimalIterative('10', '3', 4), '120.0000');
    assert.equal(combinationsDecimalIterative('0', '0', 3), '1.000');
    assert.equal(combinationsDecimalIterative('3', '5', 5), '0.00000');
    assert.equal(
      combinationsDecimalIterative('100', '50', 6),
      '100891344545564193334812497256.000000'
    );
  });

  it('rejects non-string n or k inputs with TypeError', () => {
    for (const bad of [10, 10n, null, undefined, {}, [], true]) {
      assert.throws(() => combinationsDecimalIterative(bad, '2'), TypeError);
      assert.throws(() => combinationsDecimalIterative('5', bad), TypeError);
    }
  });

  it('rejects negative, fractional, and malformed decimal strings with RangeError', () => {
    const invalidInputs = [
      '-1',
      '-10',
      '-0',
      '-0.0',
      '-5.0',
      '5.5',
      '0.1',
      '10.0001',
      '',
      '   ',
      'abc',
      'NaN',
      'Infinity',
      '-Infinity',
      '10.',
      '.5',
      '1e3',
      '1_000',
      '1,000',
      '++5',
      '1 0',
    ];

    for (const bad of invalidInputs) {
      assert.throws(
        () => combinationsDecimalIterative(bad, '2'),
        RangeError,
        `expected n=${JSON.stringify(bad)} to throw RangeError`
      );
      assert.throws(
        () => combinationsDecimalIterative('5', bad),
        RangeError,
        `expected k=${JSON.stringify(bad)} to throw RangeError`
      );
    }
  });

  it('rejects invalid precision arguments', () => {
    for (const badType of ['2', 2n, null, {}, [], true]) {
      assert.throws(() => combinationsDecimalIterative('5', '2', badType), TypeError);
    }

    for (const badRange of [-1, -100, 1.5, 0.1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      assert.throws(() => combinationsDecimalIterative('5', '2', badRange), RangeError);
    }
  });

  it('satisfies Pascal identity: C(n, k) = C(n - 1, k - 1) + C(n - 1, k)', () => {
    for (let n = 1; n <= 20; n += 1) {
      for (let k = 1; k < n; k += 1) {
        const lhs = BigInt(combinationsDecimalIterative(String(n), String(k)));
        const rhs =
          BigInt(combinationsDecimalIterative(String(n - 1), String(k - 1))) +
          BigInt(combinationsDecimalIterative(String(n - 1), String(k)));
        assert.equal(lhs, rhs, `Pascal identity failed for n=${n}, k=${k}`);
      }
    }

    // Large n spot check
    const lhsLarge = BigInt(combinationsDecimalIterative('80', '33'));
    const rhsLarge =
      BigInt(combinationsDecimalIterative('79', '32')) +
      BigInt(combinationsDecimalIterative('79', '33'));
    assert.equal(lhsLarge, rhsLarge);
  });

  it('satisfies symmetry identity: C(n, k) = C(n, n - k)', () => {
    for (let n = 0; n <= 25; n += 1) {
      for (let k = 0; k <= n; k += 1) {
        assert.equal(
          combinationsDecimalIterative(String(n), String(k)),
          combinationsDecimalIterative(String(n), String(n - k)),
          `Symmetry failed for n=${n}, k=${k}`
        );
      }
    }

    assert.equal(
      combinationsDecimalIterative('100', '37'),
      combinationsDecimalIterative('100', '63')
    );
  });

  it('satisfies binomial row sum identity: sum_{k=0}^n C(n, k) = 2^n', () => {
    for (let n = 0; n <= 25; n += 1) {
      let sum = 0n;
      for (let k = 0; k <= n; k += 1) {
        sum += BigInt(combinationsDecimalIterative(String(n), String(k)));
      }
      assert.equal(sum, 1n << BigInt(n), `Row sum failed for n=${n}`);
    }
  });

  it('matches independent factorial formula n! / (k! * (n - k)!)', () => {
    for (let n = 0; n <= 20; n += 1) {
      const nFact = factorialBigInt(BigInt(n));
      for (let k = 0; k <= n; k += 1) {
        const expected = nFact / (factorialBigInt(BigInt(k)) * factorialBigInt(BigInt(n - k)));
        assert.equal(
          combinationsDecimalIterative(String(n), String(k)),
          expected.toString(),
          `Factorial mismatch for n=${n}, k=${k}`
        );
      }
    }

    const n60 = 60n;
    const k25 = 25n;
    const expected60 = factorialBigInt(n60) / (factorialBigInt(k25) * factorialBigInt(n60 - k25));
    assert.equal(combinationsDecimalIterative('60', '25'), expected60.toString());
  });
});
