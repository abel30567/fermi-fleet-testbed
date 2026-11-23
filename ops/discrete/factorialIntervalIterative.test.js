import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { factorialIntervalIterative } from './factorialIntervalIterative.js';

/**
 * Independent exact BigInt factorial for cross-checking interval enclosures.
 *
 * @param {number} n
 * @returns {bigint}
 */
function exactBigIntFactorial(n) {
	let result = 1n;
	for (let i = 2n; i <= BigInt(n); i++) {
		result *= i;
	}
	return result;
}

describe('factorialIntervalIterative', () => {
	describe('normal cases (exact small factorials and ranges)', () => {
		it('computes point intervals for 0!, 1!, 2!, 5!, and 10!', () => {
			assert.deepEqual(factorialIntervalIterative([0, 0]), [1, 1]);
			assert.deepEqual(factorialIntervalIterative([1, 1]), [1, 1]);
			assert.deepEqual(factorialIntervalIterative([2, 2]), [2, 2]);
			assert.deepEqual(factorialIntervalIterative([5, 5]), [120, 120]);
			assert.deepEqual(factorialIntervalIterative([10, 10]), [3628800, 3628800]);
		});

		it('computes integer ranges such as [0, 1], [3, 6], and [0, 5]', () => {
			assert.deepEqual(factorialIntervalIterative([0, 1]), [1, 1]);
			assert.deepEqual(factorialIntervalIterative([3, 6]), [6, 720]);
			assert.deepEqual(factorialIntervalIterative([0, 5]), [1, 120]);
		});

		it('handles negative zero endpoints cleanly', () => {
			const [lo, hi] = factorialIntervalIterative([-0, -0]);
			assert.equal(Object.is(lo, 1), true);
			assert.equal(Object.is(hi, 1), true);
		});

		it('handles non-integer endpoints enclosing integer ranges via [ceil(lo), floor(hi)]', () => {
			assert.deepEqual(factorialIntervalIterative([2.1, 5.9]), [6, 120]);
			assert.deepEqual(factorialIntervalIterative([0.0, 0.9]), [1, 1]);
			assert.deepEqual(factorialIntervalIterative([4.0001, 5.0]), [120, 120]);
		});

		it('remains exact (lo === hi) for all n <= 22 representable in IEEE-754 float64', () => {
			for (let n = 0; n <= 22; n++) {
				const [lo, hi] = factorialIntervalIterative([n, n]);
				const exact = exactBigIntFactorial(n);
				assert.equal(lo, hi, `expected exact point interval for ${n}!`);
				assert.equal(BigInt(lo), exact, `expected exact BigInt match for ${n}!`);
			}
		});
	});

	describe('large n, outward rounding, and overflow', () => {
		it('strictly encloses n! with outward rounding for n = 23, 25, 50, 100, 170', () => {
			for (const n of [23, 25, 50, 100, 170]) {
				const [lo, hi] = factorialIntervalIterative([n, n]);
				const exact = exactBigIntFactorial(n);

				assert.ok(Number.isFinite(lo) && Number.isFinite(hi), `${n}! bounds should be finite`);
				assert.ok(lo < hi, `${n}! is not exact in float64 so lo must be < hi`);
				assert.ok(BigInt(lo) < exact, `lo must be strictly below exact ${n}!`);
				assert.ok(exact < BigInt(hi), `hi must be strictly above exact ${n}!`);

				const relWidth = (hi - lo) / lo;
				assert.ok(relWidth < 1e-13, `enclosure for ${n}! should remain tight (got ${relWidth})`);
			}
		});

		it('cross-checks every integer n from 0 to 170 against exact BigInt factorial', () => {
			let exact = 1n;
			for (let n = 0; n <= 170; n++) {
				if (n >= 2) exact *= BigInt(n);
				const [lo, hi] = factorialIntervalIterative([n, n]);
				assert.ok(lo <= hi, `lo <= hi failed at n=${n}`);
				assert.ok(BigInt(lo) <= exact, `lo <= exact failed at n=${n}`);
				assert.ok(exact <= BigInt(hi), `exact <= hi failed at n=${n}`);
			}
		});

		it('handles range intervals spanning exact and inexact regimes', () => {
			const [lo, hi] = factorialIntervalIterative([20, 30]);
			assert.equal(BigInt(lo), exactBigIntFactorial(20));
			assert.ok(exactBigIntFactorial(30) < BigInt(hi));

			const [lo2, hi2] = factorialIntervalIterative([25, 50]);
			assert.ok(BigInt(lo2) < exactBigIntFactorial(25));
			assert.ok(exactBigIntFactorial(50) < BigInt(hi2));
		});

		it('overflows upper bound to Infinity and saturates lower bound at MAX_VALUE for n >= 171', () => {
			for (const n of [171, 172, 200, 1000]) {
				const [lo, hi] = factorialIntervalIterative([n, n]);
				const exact = exactBigIntFactorial(n);
				assert.equal(lo, Number.MAX_VALUE, `expected MAX_VALUE lower bound for ${n}!`);
				assert.equal(hi, Infinity, `expected Infinity upper bound for ${n}!`);
				assert.ok(BigInt(lo) < exact, `MAX_VALUE must be < exact ${n}!`);
			}
		});

		it('handles intervals crossing the 170/171 overflow boundary and unbounded upper endpoint', () => {
			const [loCross, hiCross] = factorialIntervalIterative([170, 171]);
			assert.ok(Number.isFinite(loCross));
			assert.ok(BigInt(loCross) < exactBigIntFactorial(170));
			assert.equal(hiCross, Infinity);

			const [loInf, hiInf] = factorialIntervalIterative([5, Infinity]);
			assert.equal(loInf, 120);
			assert.equal(hiInf, Infinity);

			const [loHuge, hiHuge] = factorialIntervalIterative([1e12, 1e12]);
			assert.equal(loHuge, Number.MAX_VALUE);
			assert.equal(hiHuge, Infinity);
		});

		it('satisfies inclusion monotonicity: sub-interval result is enclosed by super-interval result', () => {
			const [subLo, subHi] = factorialIntervalIterative([24, 40]);
			const [supLo, supHi] = factorialIntervalIterative([23.5, 40.5]);
			assert.ok(supLo <= subLo);
			assert.ok(subHi <= supHi);

			const [sub2Lo, sub2Hi] = factorialIntervalIterative([25, 30]);
			const [sup2Lo, sup2Hi] = factorialIntervalIterative([24, 31]);
			assert.ok(sup2Lo <= sub2Lo);
			assert.ok(sub2Hi <= sup2Hi);
		});
	});

	describe('input validation', () => {
		it('throws TypeError for non-array or wrong-length inputs', () => {
			for (const bad of [null, undefined, 5, '5', {}, { lo: 1, hi: 2 }, [], [1], [1, 2, 3]]) {
				assert.throws(() => factorialIntervalIterative(bad), TypeError);
			}
		});

		it('throws TypeError for non-number or NaN endpoints', () => {
			for (const bad of [
				['1', 2],
				[1, '2'],
				[NaN, 5],
				[1, NaN],
				[NaN, NaN],
				[1n, 2n],
			]) {
				assert.throws(() => factorialIntervalIterative(bad), TypeError);
			}
		});

		it('throws RangeError for inverted intervals', () => {
			for (const bad of [
				[5, 3],
				[1.5, 1.4],
				[Infinity, 10],
			]) {
				assert.throws(() => factorialIntervalIterative(bad), RangeError);
			}
		});

		it('throws RangeError for negative endpoints', () => {
			for (const bad of [
				[-1, -1],
				[-5, -2],
				[-0.1, 2],
				[-Infinity, 5],
				[-Infinity, -1],
			]) {
				assert.throws(() => factorialIntervalIterative(bad), RangeError);
			}
		});

		it('throws RangeError for non-integer intervals containing no integers', () => {
			for (const bad of [
				[0.1, 0.9],
				[1.2, 1.8],
				[10.0001, 10.9999],
			]) {
				assert.throws(() => factorialIntervalIterative(bad), RangeError);
			}
		});

		it('throws RangeError for infinite lower bound', () => {
			assert.throws(() => factorialIntervalIterative([Infinity, Infinity]), RangeError);
		});
	});
});
