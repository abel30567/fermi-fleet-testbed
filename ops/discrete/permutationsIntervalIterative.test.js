import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { permutationsIntervalIterative } from './permutationsIntervalIterative.js';

/**
 * Independent exact BigInt implementation of P(n, k) = n! / (n - k)!.
 *
 * @param {number} n
 * @param {number} k
 * @returns {bigint}
 */
function exactPermutationsBigInt(n, k) {
	let result = 1n;
	for (let i = 0; i < k; i++) {
		result *= BigInt(n - i);
	}
	return result;
}

/**
 * Exact mathematical comparison `floatVal <= bigIntVal` without rounding `bigIntVal`.
 * Assumes `floatVal` is non-negative and not NaN.
 *
 * @param {number} floatVal
 * @param {bigint} bigIntVal
 * @returns {boolean}
 */
function floatLeBigInt(floatVal, bigIntVal) {
	if (floatVal === Infinity) return false;
	// For all float64 >= 2^52, Math.ceil(floatVal) === floatVal and BigInt(floatVal) is exact.
	return BigInt(Math.ceil(floatVal)) <= bigIntVal;
}

/**
 * Exact mathematical comparison `bigIntVal <= floatVal` without rounding `bigIntVal`.
 * Assumes `floatVal` is non-negative and not NaN.
 *
 * @param {number} floatVal
 * @param {bigint} bigIntVal
 * @returns {boolean}
 */
function bigIntLeFloat(bigIntVal, floatVal) {
	if (floatVal === Infinity) return true;
	return bigIntVal <= BigInt(Math.floor(floatVal));
}

describe('permutationsIntervalIterative', () => {
	describe('normal cases', () => {
		it('computes exact point intervals for small permutations', () => {
			assert.deepEqual(permutationsIntervalIterative([0, 0], [0, 0]), [1, 1]);
			assert.deepEqual(permutationsIntervalIterative([5, 5], [0, 0]), [1, 1]);
			assert.deepEqual(permutationsIntervalIterative([5, 5], [1, 1]), [5, 5]);
			assert.deepEqual(permutationsIntervalIterative([5, 5], [3, 3]), [60, 60]);
			assert.deepEqual(permutationsIntervalIterative([5, 5], [5, 5]), [120, 120]);
			assert.deepEqual(permutationsIntervalIterative([10, 10], [4, 4]), [5040, 5040]);
			assert.deepEqual(permutationsIntervalIterative([12, 12], [12, 12]), [479001600, 479001600]);
		});

		it('computes exact intervals for non-degenerate integer boxes within safe range', () => {
			assert.deepEqual(permutationsIntervalIterative([5, 8], [2, 4]), [20, 1680]);
			assert.deepEqual(permutationsIntervalIterative([4, 7], [0, 4]), [1, 840]);
			assert.deepEqual(permutationsIntervalIterative([6, 6], [5, 6]), [720, 720]);
			assert.deepEqual(permutationsIntervalIterative([5, 10], [0, 5]), [1, 30240]);
		});

		it('does not mutate input intervals', () => {
			const nInt = [5, 8];
			const kInt = [2, 4];
			const result = permutationsIntervalIterative(nInt, kInt);
			assert.deepEqual(nInt, [5, 8]);
			assert.deepEqual(kInt, [2, 4]);
			assert.deepEqual(result, [20, 1680]);
		});
	});

	describe('edge cases and overflow behavior', () => {
		it('handles zero bounds, -0, and k = 0', () => {
			assert.deepEqual(permutationsIntervalIterative([-0, 0], [-0, 0]), [1, 1]);
			assert.deepEqual(permutationsIntervalIterative([0, 100], [0, 0]), [1, 1]);
			assert.deepEqual(permutationsIntervalIterative([1, 1], [1, 1]), [1, 1]);
		});

		it('handles Number.MAX_SAFE_INTEGER endpoints accurately', () => {
			const M = Number.MAX_SAFE_INTEGER;
			assert.deepEqual(permutationsIntervalIterative([M, M], [0, 0]), [1, 1]);
			assert.deepEqual(permutationsIntervalIterative([M, M], [0, 1]), [1, M]);
			assert.deepEqual(permutationsIntervalIterative([M, M], [1, 1]), [M, M]);

			// P(M, 2) = M * (M - 1) = (2^53 - 1) * (2^53 - 2) cannot be represented exactly in float64
			const [lo, hi] = permutationsIntervalIterative([M, M], [2, 2]);
			const exact = exactPermutationsBigInt(M, 2);
			assert.ok(lo < hi, 'inexact product should produce a non-degenerate enclosure');
			assert.ok(floatLeBigInt(lo, exact), `expected ${lo} <= ${exact}`);
			assert.ok(bigIntLeFloat(exact, hi), `expected ${exact} <= ${hi}`);
		});

		it('encloses inexact factorials (> 2^53) with outward rounding', () => {
			// 23! is the smallest factorial not exactly representable in IEEE-754 binary64
			const [lo23, hi23] = permutationsIntervalIterative([23, 23], [23, 23]);
			const exact23 = exactPermutationsBigInt(23, 23);
			assert.ok(lo23 < hi23);
			assert.ok(floatLeBigInt(lo23, exact23));
			assert.ok(bigIntLeFloat(exact23, hi23));

			// 170! is the largest factorial finite in IEEE-754 binary64 (~7.257e306)
			const [lo170, hi170] = permutationsIntervalIterative([170, 170], [170, 170]);
			const exact170 = exactPermutationsBigInt(170, 170);
			assert.ok(Number.isFinite(lo170));
			assert.ok(Number.isFinite(hi170));
			assert.ok(lo170 < hi170);
			assert.ok(floatLeBigInt(lo170, exact170));
			assert.ok(bigIntLeFloat(exact170, hi170));
		});

		it('handles near-MAX_VALUE products (TwoProd fallback regime > 1e307)', () => {
			// P(170, 170) * something? Choose P(171, 168) = 171! / 6 ≈ 2.068e308 > MAX_VALUE,
			// while P(171, 167) = 171! / 24 ≈ 5.171e307 (between 1e307 and Number.MAX_VALUE!)
			const [lo, hi] = permutationsIntervalIterative([171, 171], [167, 167]);
			const exact = exactPermutationsBigInt(171, 167);
			assert.ok(Number.isFinite(lo));
			assert.ok(Number.isFinite(hi));
			assert.ok(lo > 1e307);
			assert.ok(lo <= hi);
			assert.ok(floatLeBigInt(lo, exact));
			assert.ok(bigIntLeFloat(exact, hi));
		});

		it('saturates to [Number.MAX_VALUE, Infinity] on overflow and terminates quickly for huge inputs', () => {
			const [lo171, hi171] = permutationsIntervalIterative([171, 171], [171, 171]);
			assert.equal(lo171, Number.MAX_VALUE);
			assert.equal(hi171, Infinity);
			const exact171 = exactPermutationsBigInt(171, 171);
			assert.ok(floatLeBigInt(lo171, exact171));
			assert.ok(bigIntLeFloat(exact171, hi171));

			// Boundary straddling finite and overflow
			const [loStraddle, hiStraddle] = permutationsIntervalIterative([170, 171], [170, 170]);
			assert.ok(Number.isFinite(loStraddle));
			assert.ok(loStraddle < Number.MAX_VALUE);
			assert.equal(hiStraddle, Infinity);
			assert.ok(floatLeBigInt(loStraddle, exactPermutationsBigInt(170, 170)));

			// Huge safe-integer inputs should short-circuit once overflow occurs
			const [loHuge, hiHuge] = permutationsIntervalIterative(
				[1_000_000_000, Number.MAX_SAFE_INTEGER],
				[1_000_000_000, 1_000_000_000]
			);
			assert.equal(loHuge, Number.MAX_VALUE);
			assert.equal(hiHuge, Infinity);
		});
	});

	describe('input validation', () => {
		it('throws TypeError for non-array or wrong-length intervals', () => {
			for (const bad of [null, undefined, 5, '12', {}, [], [1], [1, 2, 3]]) {
				assert.throws(() => permutationsIntervalIterative(bad, [0, 0]), TypeError);
				assert.throws(() => permutationsIntervalIterative([5, 5], bad), TypeError);
			}
		});

		it('throws TypeError for non-number endpoints', () => {
			for (const bad of [['1', 2], [1, '2'], [null, 2], [1, undefined], [1n, 2n], [true, 2]]) {
				assert.throws(() => permutationsIntervalIterative(bad, [0, 0]), TypeError);
				assert.throws(() => permutationsIntervalIterative([5, 5], bad), TypeError);
			}
		});

		it('throws RangeError for non-finite endpoints', () => {
			for (const bad of [[NaN, 5], [1, NaN], [Infinity, Infinity], [-Infinity, 5], [1, Infinity]]) {
				assert.throws(() => permutationsIntervalIterative(bad, [0, 0]), RangeError);
				assert.throws(() => permutationsIntervalIterative([5, 5], bad), RangeError);
			}
		});

		it('throws RangeError for non-integer or unsafe integer endpoints', () => {
			assert.throws(() => permutationsIntervalIterative([1.5, 3], [0, 1]), RangeError);
			assert.throws(() => permutationsIntervalIterative([2, 3.2], [0, 1]), RangeError);
			assert.throws(() => permutationsIntervalIterative([5, 6], [0.5, 1]), RangeError);
			assert.throws(
				() => permutationsIntervalIterative([Number.MAX_SAFE_INTEGER + 1, Number.MAX_SAFE_INTEGER + 2], [0, 1]),
				RangeError
			);
			assert.throws(() => permutationsIntervalIterative([1e20, 1e20], [0, 1]), RangeError);
		});

		it('throws RangeError for malformed intervals (lo > hi)', () => {
			assert.throws(() => permutationsIntervalIterative([5, 3], [0, 2]), RangeError);
			assert.throws(() => permutationsIntervalIterative([5, 8], [4, 2]), RangeError);
		});

		it('throws RangeError for negative endpoints', () => {
			assert.throws(() => permutationsIntervalIterative([-1, 5], [0, 0]), RangeError);
			assert.throws(() => permutationsIntervalIterative([-3, -1], [0, 0]), RangeError);
			assert.throws(() => permutationsIntervalIterative([5, 8], [-1, 2]), RangeError);
		});

		it('throws RangeError when k > n for any pair in the box (kHi > nLo)', () => {
			assert.throws(() => permutationsIntervalIterative([3, 3], [4, 4]), RangeError);
			assert.throws(() => permutationsIntervalIterative([3, 5], [2, 4]), RangeError);
			assert.throws(() => permutationsIntervalIterative([0, 0], [0, 1]), RangeError);
			assert.throws(() => permutationsIntervalIterative([5, 10], [6, 8]), RangeError);
		});
	});

	describe('cross-check against exact BigInt grid evaluation', () => {
		it('encloses every (n, k) grid point across small, medium, and large integer boxes', () => {
			const boxes = [
				[[0, 3], [0, 0]],
				[[3, 6], [0, 3]],
				[[5, 9], [1, 5]],
				[[10, 14], [3, 8]],
				[[18, 22], [10, 18]],
				[[22, 26], [18, 22]],
				[[35, 38], [20, 24]],
				[[60, 62], [30, 33]],
				[[100, 102], [45, 48]],
				[[168, 170], [166, 168]],
				[[170, 172], [167, 170]],
			];

			for (const [nInt, kInt] of boxes) {
				const [lo, hi] = permutationsIntervalIterative(nInt, kInt);
				assert.ok(lo <= hi, `expected lo <= hi for n=${nInt}, k=${kInt}`);

				let minExact = null;
				let maxExact = null;

				for (let n = nInt[0]; n <= nInt[1]; n++) {
					for (let k = kInt[0]; k <= kInt[1]; k++) {
						const exact = exactPermutationsBigInt(n, k);
						assert.ok(
							floatLeBigInt(lo, exact),
							`lower bound violation for (${n}, ${k}): lo=${lo} > exact=${exact}`
						);
						assert.ok(
							bigIntLeFloat(exact, hi),
							`upper bound violation for (${n}, ${k}): exact=${exact} > hi=${hi}`
						);
						if (minExact === null || exact < minExact) minExact = exact;
						if (maxExact === null || exact > maxExact) maxExact = exact;
					}
				}

				// Verify tightness: when finite, relative error of lo vs minExact and hi vs maxExact is tiny
				if (Number.isFinite(lo) && minExact > 0n) {
					const loBig = BigInt(Math.floor(lo));
					assert.ok(loBig <= minExact);
					// Relative slack should be well under 1e-12 (typically a few ULPs ~1e-15)
					assert.ok((minExact - loBig) * 1_000_000_000_000n <= minExact);
				}
				if (Number.isFinite(hi) && maxExact > 0n) {
					const hiBig = BigInt(Math.ceil(hi));
					assert.ok(hiBig >= maxExact);
					assert.ok((hiBig - maxExact) * 1_000_000_000_000n <= maxExact);
				}
			}
		});

		it('satisfies inclusion isotonicity for nested boxes', () => {
			const [loOuter, hiOuter] = permutationsIntervalIterative([20, 30], [10, 20]);
			const [loInner, hiInner] = permutationsIntervalIterative([22, 27], [12, 18]);

			assert.ok(loOuter <= loInner, `expected ${loOuter} <= ${loInner}`);
			assert.ok(hiInner <= hiOuter, `expected ${hiInner} <= ${hiOuter}`);
		});
	});
});
