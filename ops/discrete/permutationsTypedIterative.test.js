import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { permutationsTypedIterative } from './permutationsTypedIterative.js';

/**
 * Independent BigInt reference implementation using n! / (n - k)!.
 */
function factorialBigInt(m) {
	let res = 1n;
	for (let i = 2n; i <= BigInt(m); i++) {
		res *= i;
	}
	return res;
}

function permutationsBigInt(n, k) {
	if (k > n) return 0n;
	return factorialBigInt(n) / factorialBigInt(n - k);
}

describe('permutationsTypedIterative', () => {
	describe('normal cases', () => {
		it('computes standard k-permutations element-wise', () => {
			const nArr = new Float64Array([5, 6, 10, 7, 8, 12]);
			const kArr = new Float64Array([3, 2, 4, 1, 5, 3]);
			const result = permutationsTypedIterative(nArr, kArr);

			assert.ok(result instanceof Float64Array);
			assert.deepEqual(
				result,
				new Float64Array([60, 30, 5040, 7, 6720, 1320])
			);
		});

		it('does not mutate input arrays and returns a new Float64Array', () => {
			const nArr = new Float64Array([4, 5, 6]);
			const kArr = new Float64Array([2, 3, 1]);
			const nCopy = new Float64Array(nArr);
			const kCopy = new Float64Array(kArr);

			const result = permutationsTypedIterative(nArr, kArr);

			assert.notEqual(result, nArr);
			assert.notEqual(result, kArr);
			assert.deepEqual(nArr, nCopy);
			assert.deepEqual(kArr, kCopy);
		});

		it('handles large n with small k accurately', () => {
			const nArr = new Float64Array([1000, 10000, 100000]);
			const kArr = new Float64Array([2, 2, 1]);
			const result = permutationsTypedIterative(nArr, kArr);

			assert.deepEqual(result, new Float64Array([999000, 99990000, 100000]));
		});
	});

	describe('edge cases', () => {
		it('handles empty Float64Array inputs', () => {
			const result = permutationsTypedIterative(
				new Float64Array(0),
				new Float64Array(0)
			);
			assert.ok(result instanceof Float64Array);
			assert.equal(result.length, 0);
		});

		it('returns 1 when k === 0 (including n === 0)', () => {
			const nArr = new Float64Array([0, 1, 5, 100, 1000000]);
			const kArr = new Float64Array([0, 0, 0, 0, 0]);
			const result = permutationsTypedIterative(nArr, kArr);

			assert.deepEqual(result, new Float64Array([1, 1, 1, 1, 1]));
		});

		it('returns n! when k === n', () => {
			const nArr = new Float64Array([0, 1, 2, 3, 5, 10]);
			const kArr = new Float64Array([0, 1, 2, 3, 5, 10]);
			const result = permutationsTypedIterative(nArr, kArr);

			assert.deepEqual(result, new Float64Array([1, 1, 2, 6, 120, 3628800]));
		});

		it('returns 0 when k > n', () => {
			const nArr = new Float64Array([0, 1, 3, 5, 10]);
			const kArr = new Float64Array([1, 2, 4, 10, 11]);
			const result = permutationsTypedIterative(nArr, kArr);

			assert.deepEqual(result, new Float64Array([0, 0, 0, 0, 0]));
		});

		it('handles negative zero (-0) cleanly', () => {
			const nArr = new Float64Array([-0, 4, -0]);
			const kArr = new Float64Array([-0, -0, 1]);
			const result = permutationsTypedIterative(nArr, kArr);

			assert.deepEqual(result, new Float64Array([1, 1, 0]));
			assert.ok(Object.is(result[2], 0));
		});

		it('overflows to Infinity gracefully for values exceeding Number.MAX_VALUE', () => {
			const nArr = new Float64Array([170, 171, 1000000]);
			const kArr = new Float64Array([170, 171, 1000000]);
			const result = permutationsTypedIterative(nArr, kArr);

			assert.ok(Number.isFinite(result[0]));
			assert.equal(result[1], Infinity);
			assert.equal(result[2], Infinity);
		});
	});

	describe('input validation', () => {
		it('throws TypeError when nArr or kArr is not a Float64Array', () => {
			const valid = new Float64Array([5]);
			const invalidInputs = [
				[5],
				new Float32Array([5]),
				new Int32Array([5]),
				null,
				undefined,
				5,
				'5',
				{}
			];

			for (const bad of invalidInputs) {
				assert.throws(() => permutationsTypedIterative(bad, valid), TypeError);
				assert.throws(() => permutationsTypedIterative(valid, bad), TypeError);
			}
		});

		it('throws RangeError on length mismatch', () => {
			assert.throws(
				() =>
					permutationsTypedIterative(
						new Float64Array([5, 6]),
						new Float64Array([2])
					),
				RangeError
			);
			assert.throws(
				() =>
					permutationsTypedIterative(
						new Float64Array(0),
						new Float64Array([1])
					),
				RangeError
			);
		});

		it('throws RangeError for NaN or non-finite elements', () => {
			for (const bad of [NaN, Infinity, -Infinity]) {
				assert.throws(
					() =>
						permutationsTypedIterative(
							new Float64Array([bad]),
							new Float64Array([1])
						),
					RangeError
				);
				assert.throws(
					() =>
						permutationsTypedIterative(
							new Float64Array([5]),
							new Float64Array([bad])
						),
					RangeError
				);
			}
		});

		it('throws RangeError for negative or non-integer elements', () => {
			for (const bad of [-1, -10, 0.5, 3.14, -0.1]) {
				assert.throws(
					() =>
						permutationsTypedIterative(
							new Float64Array([bad]),
							new Float64Array([1])
						),
					RangeError
				);
				assert.throws(
					() =>
						permutationsTypedIterative(
							new Float64Array([5]),
							new Float64Array([bad])
						),
					RangeError
				);
			}
		});

		it('throws RangeError for integers exceeding Number.MAX_SAFE_INTEGER', () => {
			const unsafe = Number.MAX_SAFE_INTEGER + 1;
			assert.throws(
				() =>
					permutationsTypedIterative(
						new Float64Array([unsafe]),
						new Float64Array([1])
					),
				RangeError
			);
			assert.throws(
				() =>
					permutationsTypedIterative(
						new Float64Array([10]),
						new Float64Array([1e20])
					),
				RangeError
			);
		});
	});

	describe('independent cross-checks', () => {
		it('matches BigInt n! / (n - k)! exactly for all 0 <= n <= 18 and 0 <= k <= n + 2', () => {
			const ns = [];
			const ks = [];
			for (let n = 0; n <= 18; n++) {
				for (let k = 0; k <= n + 2; k++) {
					ns.push(n);
					ks.push(k);
				}
			}

			const nArr = new Float64Array(ns);
			const kArr = new Float64Array(ks);
			const actual = permutationsTypedIterative(nArr, kArr);

			for (let i = 0; i < ns.length; i++) {
				const expected = Number(permutationsBigInt(ns[i], ks[i]));
				assert.equal(
					actual[i],
					expected,
					`Mismatch for P(${ns[i]}, ${ks[i]}): got ${actual[i]}, expected ${expected}`
				);
			}
		});

		it('matches BigInt n! / (n - k)! within floating-point tolerance for large finite values', () => {
			const pairs = [
				[25, 10],
				[50, 20],
				[100, 50],
				[170, 170]
			];
			const nArr = new Float64Array(pairs.map(([n]) => n));
			const kArr = new Float64Array(pairs.map(([, k]) => k));
			const actual = permutationsTypedIterative(nArr, kArr);

			for (let i = 0; i < pairs.length; i++) {
				const [n, k] = pairs[i];
				const expected = Number(permutationsBigInt(n, k));
				const relErr = Math.abs(actual[i] - expected) / expected;
				assert.ok(
					relErr < 1e-13,
					`Relative error too large for P(${n}, ${k}): relErr=${relErr}`
				);
			}
		});

		it('satisfies Pascal-like recurrence P(n, k) = P(n - 1, k) + k * P(n - 1, k - 1)', () => {
			const ns = [];
			const ks = [];
			const nMinus1 = [];
			const kMinus1 = [];

			for (let n = 1; n <= 15; n++) {
				for (let k = 1; k <= n; k++) {
					ns.push(n);
					ks.push(k);
					nMinus1.push(n - 1);
					kMinus1.push(k - 1);
				}
			}

			const pNK = permutationsTypedIterative(
				new Float64Array(ns),
				new Float64Array(ks)
			);
			const pN1K = permutationsTypedIterative(
				new Float64Array(nMinus1),
				new Float64Array(ks)
			);
			const pN1K1 = permutationsTypedIterative(
				new Float64Array(nMinus1),
				new Float64Array(kMinus1)
			);

			for (let i = 0; i < ns.length; i++) {
				assert.equal(pNK[i], pN1K[i] + ks[i] * pN1K1[i]);
			}
		});
	});
});
