import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { combinationsTypedIterative } from './combinationsTypedIterative.js';

/**
 * Independent reference computation using BigInt factorials: n! / (k! * (n - k)!).
 * @param {number} n
 * @param {number} k
 * @returns {bigint}
 */
function combinationsBigIntFactorial(n, k) {
  if (k > n) return 0n;
  const factorial = (m) => {
    let acc = 1n;
    for (let i = 2n; i <= BigInt(m); i++) {
      acc *= i;
    }
    return acc;
  };
  return factorial(n) / (factorial(k) * factorial(n - k));
}

describe('combinationsTypedIterative', () => {
  describe('normal cases', () => {
    it('computes known binomial coefficients element-wise', () => {
      const nArr = new Float64Array([5, 10, 20, 30, 52, 49]);
      const kArr = new Float64Array([2, 3, 10, 15, 5, 6]);
      const expected = new Float64Array([10, 120, 184756, 155117520, 2598960, 13983816]);

      const result = combinationsTypedIterative(nArr, kArr);

      assert.ok(result instanceof Float64Array);
      assert.equal(result.length, nArr.length);
      assert.deepEqual(result, expected);
    });

    it('does not mutate input arrays and returns a new Float64Array', () => {
      const nArr = new Float64Array([6, 7, 8]);
      const kArr = new Float64Array([2, 3, 4]);
      const nSnap = new Float64Array(nArr);
      const kSnap = new Float64Array(kArr);

      const result = combinationsTypedIterative(nArr, kArr);

      assert.notEqual(result, nArr);
      assert.notEqual(result, kArr);
      assert.deepEqual(nArr, nSnap);
      assert.deepEqual(kArr, kSnap);
      assert.deepEqual(result, new Float64Array([15, 35, 70]));
    });

    it('handles aliased inputs (nArr === kArr)', () => {
      const arr = new Float64Array([0, 1, 5, 42, 1000]);
      const result = combinationsTypedIterative(arr, arr);
      assert.deepEqual(result, new Float64Array([1, 1, 1, 1, 1]));
    });

    it('exploits symmetry C(n, k) === C(n, n - k)', () => {
      const nVals = [10, 25, 40, 55, 100];
      const kVals = [3, 11, 17, 24, 37];
      const nArr = new Float64Array(nVals);
      const kArr = new Float64Array(kVals);
      const compKArr = new Float64Array(nVals.map((n, i) => n - kVals[i]));

      const left = combinationsTypedIterative(nArr, kArr);
      const right = combinationsTypedIterative(nArr, compKArr);

      assert.deepEqual(left, right);
    });

    it('is bit-exact for safe integer results near Number.MAX_SAFE_INTEGER', () => {
      // C(54, 27) = 1946939425648112 <= 2^53 - 1, while 27 * C(54, 27) > 2^53 - 1
      // C(56, 26) = 7207429132176336 <= 2^53 - 1
      // C(56, 27) = 8008254591307040 <= 2^53 - 1
      const nArr = new Float64Array([54, 56, 56]);
      const kArr = new Float64Array([27, 26, 27]);
      const result = combinationsTypedIterative(nArr, kArr);

      for (let i = 0; i < nArr.length; i++) {
        const exact = combinationsBigIntFactorial(nArr[i], kArr[i]);
        assert.ok(exact <= BigInt(Number.MAX_SAFE_INTEGER));
        assert.equal(result[i], Number(exact));
      }
    });

    it('handles very large finite values and overflows cleanly to Infinity', () => {
      // C(1029, 514) ~ 1.4298e308 < Number.MAX_VALUE; C(1030, 515) > Number.MAX_VALUE
      // C(1e12, 5e11) overflows early and terminates promptly
      const nArr = new Float64Array([100, 1029, 1030, 1e12]);
      const kArr = new Float64Array([50, 514, 515, 5e11]);
      const result = combinationsTypedIterative(nArr, kArr);

      const expected100 = Number(combinationsBigIntFactorial(100, 50));
      assert.ok(Math.abs(result[0] - expected100) / expected100 < 1e-14);

      const expected1029 = Number(combinationsBigIntFactorial(1029, 514));
      assert.ok(Number.isFinite(result[1]));
      assert.ok(Math.abs(result[1] - expected1029) / expected1029 < 1e-14);

      assert.equal(result[2], Infinity);
      assert.equal(result[3], Infinity);
    });
  });

  describe('edge cases', () => {
    it('handles empty Float64Array inputs', () => {
      const result = combinationsTypedIterative(new Float64Array(0), new Float64Array(0));
      assert.ok(result instanceof Float64Array);
      assert.equal(result.length, 0);
    });

    it('returns 1 when k === 0 or k === n (including n = 0 and MAX_SAFE_INTEGER)', () => {
      const maxSafe = Number.MAX_SAFE_INTEGER;
      const nArr = new Float64Array([0, 1, 5, 100, maxSafe, 1, 5, 100, maxSafe]);
      const kArr = new Float64Array([0, 0, 0, 0, 0, 1, 5, 100, maxSafe]);
      const result = combinationsTypedIterative(nArr, kArr);

      assert.deepEqual(result, new Float64Array([1, 1, 1, 1, 1, 1, 1, 1, 1]));
    });

    it('returns n when k === 1 or k === n - 1', () => {
      const maxSafe = Number.MAX_SAFE_INTEGER;
      const nArr = new Float64Array([1, 2, 17, maxSafe, 2, 17, maxSafe]);
      const kArr = new Float64Array([1, 1, 1, 1, 1, 16, maxSafe - 1]);
      const result = combinationsTypedIterative(nArr, kArr);

      assert.deepEqual(result, new Float64Array([1, 2, 17, maxSafe, 2, 17, maxSafe]));
    });

    it('returns 0 whenever k > n', () => {
      const nArr = new Float64Array([0, 0, 1, 5, 10, 0]);
      const kArr = new Float64Array([1, 100, 2, 6, 999, Number.MAX_SAFE_INTEGER]);
      const result = combinationsTypedIterative(nArr, kArr);

      assert.deepEqual(result, new Float64Array([0, 0, 0, 0, 0, 0]));
    });

    it('handles -0 inputs without producing -0 outputs', () => {
      const nArr = new Float64Array([-0, 5, -0]);
      const kArr = new Float64Array([-0, -0, 3]);
      const result = combinationsTypedIterative(nArr, kArr);

      assert.equal(result[0], 1);
      assert.equal(result[1], 1);
      assert.equal(Object.is(result[2], 0), true);
    });
  });

  describe('input validation', () => {
    it('throws TypeError if nArr or kArr is not a Float64Array', () => {
      const valid = new Float64Array([5]);
      const invalidInputs = [
        null,
        undefined,
        [5],
        new Float32Array([5]),
        new Int32Array([5]),
        5,
        '5',
        {},
      ];

      for (const bad of invalidInputs) {
        assert.throws(() => combinationsTypedIterative(bad, valid), TypeError);
        assert.throws(() => combinationsTypedIterative(valid, bad), TypeError);
      }
    });

    it('throws RangeError on length mismatch', () => {
      assert.throws(
        () => combinationsTypedIterative(new Float64Array([5, 6]), new Float64Array([2])),
        RangeError
      );
      assert.throws(
        () => combinationsTypedIterative(new Float64Array(0), new Float64Array([0])),
        RangeError
      );
    });

    it('throws RangeError on NaN, Infinity, or -Infinity elements', () => {
      const nonFinite = [NaN, Infinity, -Infinity];
      for (const val of nonFinite) {
        assert.throws(
          () => combinationsTypedIterative(new Float64Array([val]), new Float64Array([0])),
          RangeError
        );
        assert.throws(
          () => combinationsTypedIterative(new Float64Array([5]), new Float64Array([val])),
          RangeError
        );
      }
    });

    it('throws RangeError on non-integer elements', () => {
      const nonInts = [0.5, 2.1, -0.5, Math.PI];
      for (const val of nonInts) {
        assert.throws(
          () => combinationsTypedIterative(new Float64Array([val]), new Float64Array([1])),
          RangeError
        );
        assert.throws(
          () => combinationsTypedIterative(new Float64Array([5]), new Float64Array([val])),
          RangeError
        );
      }
    });

    it('throws RangeError on negative integer elements', () => {
      assert.throws(
        () => combinationsTypedIterative(new Float64Array([-1]), new Float64Array([0])),
        RangeError
      );
      assert.throws(
        () => combinationsTypedIterative(new Float64Array([5]), new Float64Array([-2])),
        RangeError
      );
      assert.throws(
        () => combinationsTypedIterative(new Float64Array([-3]), new Float64Array([-1])),
        RangeError
      );
    });

    it('throws RangeError on unsafe integers exceeding Number.MAX_SAFE_INTEGER', () => {
      const unsafe = Number.MAX_SAFE_INTEGER + 2; // 2^53 + 1 -> rounds to 2^53 + 2
      assert.throws(
        () => combinationsTypedIterative(new Float64Array([unsafe]), new Float64Array([1])),
        RangeError
      );
      assert.throws(
        () => combinationsTypedIterative(new Float64Array([10]), new Float64Array([1e20])),
        RangeError
      );
    });
  });

  describe('independent mathematical cross-checks', () => {
    it('matches BigInt n!/(k!(n-k)!) across all 0 <= k <= n <= 62', () => {
      const nList = [];
      const kList = [];
      for (let n = 0; n <= 62; n++) {
        for (let k = 0; k <= n; k++) {
          nList.push(n);
          kList.push(k);
        }
      }

      const nArr = new Float64Array(nList);
      const kArr = new Float64Array(kList);
      const actual = combinationsTypedIterative(nArr, kArr);

      for (let i = 0; i < nList.length; i++) {
        const exact = combinationsBigIntFactorial(nList[i], kList[i]);
        const expected = Number(exact);
        if (exact <= BigInt(Number.MAX_SAFE_INTEGER)) {
          assert.equal(actual[i], expected, `Exact mismatch at C(${nList[i]}, ${kList[i]})`);
        } else {
          const relErr = Math.abs(actual[i] - expected) / expected;
          assert.ok(
            relErr <= 1e-15,
            `Relative error too large at C(${nList[i]}, ${kList[i]}): ${relErr}`
          );
        }
      }
    });

    it("satisfies Pascal's triangle recurrence C(n, k) = C(n-1, k-1) + C(n-1, k)", () => {
      // Build Pascal's triangle iteratively as an independent reference for n = 0..45
      const maxN = 45;
      const triangle = [[1]];
      for (let n = 1; n <= maxN; n++) {
        const row = new Array(n + 1);
        row[0] = 1;
        row[n] = 1;
        for (let k = 1; k < n; k++) {
          row[k] = triangle[n - 1][k - 1] + triangle[n - 1][k];
        }
        triangle.push(row);
      }

      for (let n = 0; n <= maxN; n++) {
        const nArr = new Float64Array(n + 1).fill(n);
        const kArr = new Float64Array(n + 1);
        for (let k = 0; k <= n; k++) {
          kArr[k] = k;
        }
        const computed = combinationsTypedIterative(nArr, kArr);
        for (let k = 0; k <= n; k++) {
          assert.equal(computed[k], triangle[n][k], `Pascal mismatch at C(${n}, ${k})`);
        }
      }
    });

    it('satisfies binomial row-sum identity sum_{k=0}^n C(n, k) = 2^n and alternating sum = 0', () => {
      for (let n = 0; n <= 50; n++) {
        const nArr = new Float64Array(n + 1).fill(n);
        const kArr = new Float64Array(n + 1);
        for (let k = 0; k <= n; k++) {
          kArr[k] = k;
        }

        const row = combinationsTypedIterative(nArr, kArr);
        let sum = 0;
        let altSum = 0;
        for (let k = 0; k <= n; k++) {
          sum += row[k];
          altSum += k % 2 === 0 ? row[k] : -row[k];
        }

        assert.equal(sum, 2 ** n, `Row sum failed for n=${n}`);
        if (n >= 1) {
          assert.equal(altSum, 0, `Alternating sum failed for n=${n}`);
        }
      }
    });

    it("satisfies Vandermonde's identity sum_{j=0}^r C(m, j) * C(n, r - j) = C(m + n, r)", () => {
      const cases = [
        [10, 12, 8],
        [15, 18, 14],
        [20, 22, 19],
      ];

      for (const [m, n, r] of cases) {
        const mArr = new Float64Array(r + 1).fill(m);
        const jArr = new Float64Array(r + 1);
        const nArr = new Float64Array(r + 1).fill(n);
        const rMinusJArr = new Float64Array(r + 1);
        for (let j = 0; j <= r; j++) {
          jArr[j] = j;
          rMinusJArr[j] = r - j;
        }

        const leftTerms = combinationsTypedIterative(mArr, jArr);
        const rightTerms = combinationsTypedIterative(nArr, rMinusJArr);

        let lhs = 0;
        for (let j = 0; j <= r; j++) {
          lhs += leftTerms[j] * rightTerms[j];
        }

        const rhs = combinationsTypedIterative(
          new Float64Array([m + n]),
          new Float64Array([r])
        )[0];

        assert.equal(lhs, rhs);
      }
    });
  });
});
