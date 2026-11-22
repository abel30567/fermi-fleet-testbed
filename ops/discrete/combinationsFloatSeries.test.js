import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { combinationsFloatSeries } from './combinationsFloatSeries.js';

/**
 * Independent BigInt exact reference implementation of C(n, k).
 */
function exactCombinationsBigInt(n, k) {
	const bn = BigInt(n);
	let bk = BigInt(k);
	if (bk > bn) return 0n;
	if (bk === 0n || bk === bn) return 1n;
	if (bk > bn - bk) bk = bn - bk;
	let result = 1n;
	for (let i = 1n; i <= bk; i++) {
		result = (result * (bn - bk + i)) / i;
	}
	return result;
}

describe('combinationsFloatSeries', () => {
	describe('known values and boundary cases', () => {
		it('handles trivial boundaries k = 0, k = n, k > n, and k = 1', () => {
			assert.equal(combinationsFloatSeries(0, 0), 1);
			assert.equal(combinationsFloatSeries(0, 1), 0);
			assert.equal(combinationsFloatSeries(0, 100), 0);
			assert.equal(combinationsFloatSeries(1, 0), 1);
			assert.equal(combinationsFloatSeries(1, 1), 1);
			assert.equal(combinationsFloatSeries(1, 2), 0);
			assert.equal(combinationsFloatSeries(10, 0), 1);
			assert.equal(combinationsFloatSeries(10, 10), 1);
			assert.equal(combinationsFloatSeries(10, 11), 0);
			assert.equal(combinationsFloatSeries(1000, 0), 1);
			assert.equal(combinationsFloatSeries(1000, 1), 1000);
			assert.equal(combinationsFloatSeries(1000, 999), 1000);
			assert.equal(combinationsFloatSeries(1000, 1000), 1);
			assert.equal(combinationsFloatSeries(1000, 1001), 0);
		});

		it('handles -0 gracefully as 0', () => {
			assert.equal(combinationsFloatSeries(-0, -0), 1);
			assert.equal(combinationsFloatSeries(5, -0), 1);
			assert.equal(combinationsFloatSeries(-0, 1), 0);
		});

		it('matches known combinatorial values', () => {
			assert.equal(combinationsFloatSeries(5, 2), 10);
			assert.equal(combinationsFloatSeries(5, 3), 10);
			assert.equal(combinationsFloatSeries(10, 3), 120);
			assert.equal(combinationsFloatSeries(20, 10), 184_756);
			assert.equal(combinationsFloatSeries(52, 5), 2_598_960);
			assert.equal(combinationsFloatSeries(200, 3), 1_313_400);
			assert.equal(combinationsFloatSeries(200, 197), 1_313_400);
			assert.equal(combinationsFloatSeries(1000, 2), 499_500);
			assert.equal(combinationsFloatSeries(1000, 998), 499_500);
		});

		it('satisfies reflection symmetry C(n, k) === C(n, n - k)', () => {
			const pairs = [
				[15, 4],
				[50, 17],
				[200, 3],
				[500, 123],
				[1000, 2],
				[1029, 514],
			];
			for (const [n, k] of pairs) {
				assert.equal(
					combinationsFloatSeries(n, k),
					combinationsFloatSeries(n, n - k),
					`symmetry failed for C(${n}, ${k})`
				);
			}
		});
	});

	describe('precision, large values, and overflow handling', () => {
		it('is bit-exact for values up to Number.MAX_SAFE_INTEGER', () => {
			const safeCases = [
				[55, 27],
				[56, 28],
				[56, 26],
				[100, 10],
				[1000, 5],
				[134_217_728, 2],
			];
			for (const [n, k] of safeCases) {
				const exact = exactCombinationsBigInt(n, k);
				assert.ok(exact <= BigInt(Number.MAX_SAFE_INTEGER));
				assert.equal(
					combinationsFloatSeries(n, k),
					Number(exact),
					`expected exact integer for C(${n}, ${k})`
				);
			}
		});

		it('matches BigInt reference within tight float64 tolerance up to Number.MAX_VALUE', () => {
			const largeCases = [
				[60, 30],
				[66, 33],
				[100, 50],
				[200, 100],
				[500, 250],
				[1000, 500],
				[1028, 514],
				[1029, 514],
				[1_000_000, 50],
			];
			for (const [n, k] of largeCases) {
				const exact = Number(exactCombinationsBigInt(n, k));
				const actual = combinationsFloatSeries(n, k);
				assert.ok(Number.isFinite(actual), `expected finite result for C(${n}, ${k})`);
				const relErr = Math.abs(actual - exact) / exact;
				assert.ok(
					relErr < 1e-14,
					`C(${n}, ${k}): actual=${actual}, exact=${exact}, relErr=${relErr}`
				);
			}
		});

		it('avoids intermediate overflow for huge n with small k', () => {
			assert.equal(combinationsFloatSeries(Number.MAX_VALUE, 0), 1);
			assert.equal(combinationsFloatSeries(Number.MAX_VALUE, 1), Number.MAX_VALUE);
			assert.equal(combinationsFloatSeries(Number.MAX_VALUE, Number.MAX_VALUE), 1);

			const hugeN = 1e154;
			const actual = combinationsFloatSeries(hugeN, 2);
			assert.ok(Number.isFinite(actual));
			assert.ok(Math.abs(actual - 5e307) / 5e307 < 1e-15);
		});

		it('returns Infinity on float64 overflow including log-gamma fallback for large k', () => {
			assert.equal(combinationsFloatSeries(1030, 515), Infinity);
			assert.equal(combinationsFloatSeries(2000, 1000), Infinity);
			assert.equal(combinationsFloatSeries(1_000_000, 100), Infinity);
			assert.equal(combinationsFloatSeries(1e9, 5e8), Infinity);
			assert.equal(combinationsFloatSeries(Number.MAX_VALUE, 2), Infinity);
			assert.equal(combinationsFloatSeries(Number.MAX_VALUE, 5e307), Infinity);
		});
	});

	describe('algebraic and analytical identity cross-checks', () => {
		it("satisfies Pascal's identity C(n, k) = C(n-1, k-1) + C(n-1, k)", () => {
			for (let n = 1; n <= 40; n++) {
				for (let k = 1; k < n; k++) {
					const lhs = combinationsFloatSeries(n, k);
					const rhs =
						combinationsFloatSeries(n - 1, k - 1) +
						combinationsFloatSeries(n - 1, k);
					assert.equal(lhs, rhs, `Pascal identity failed at (${n}, ${k})`);
				}
			}

			// Also verify in the large float64 regime
			for (const [n, k] of [
				[100, 50],
				[500, 200],
				[1000, 500],
			]) {
				const lhs = combinationsFloatSeries(n, k);
				const rhs =
					combinationsFloatSeries(n - 1, k - 1) +
					combinationsFloatSeries(n - 1, k);
				const relErr = Math.abs(lhs - rhs) / lhs;
				assert.ok(relErr < 1e-14, `large Pascal identity failed at (${n}, ${k})`);
			}
		});

		it('satisfies the binomial theorem sum_{k=0}^n C(n, k) = 2^n and alternating sum = 0', () => {
			for (let n = 0; n <= 50; n++) {
				let sum = 0;
				for (let k = 0; k <= n; k++) {
					sum += combinationsFloatSeries(n, k);
				}
				assert.equal(sum, 2 ** n, `row sum failed for n=${n}`);
			}

			for (let n = 1; n <= 30; n++) {
				let altSum = 0;
				for (let k = 0; k <= n; k++) {
					altSum += (k % 2 === 0 ? 1 : -1) * combinationsFloatSeries(n, k);
				}
				assert.equal(altSum, 0, `alternating sum failed for n=${n}`);
			}
		});

		it("satisfies Vandermonde's identity sum_j C(m, j) * C(n, r - j) = C(m + n, r)", () => {
			const triples = [
				[5, 7, 4],
				[10, 12, 8],
				[15, 20, 13],
				[25, 25, 20],
				[30, 18, 12],
			];
			for (const [m, n, r] of triples) {
				let sum = 0;
				for (let j = 0; j <= r; j++) {
					sum +=
						combinationsFloatSeries(m, j) *
						combinationsFloatSeries(n, r - j);
				}
				const expected = combinationsFloatSeries(m + n, r);
				assert.equal(sum, expected, `Vandermonde failed for (${m}, ${n}, ${r})`);
			}
		});

		it('satisfies the hockey-stick identity sum_{i=r}^n C(i, r) = C(n + 1, r + 1)', () => {
			for (const [n, r] of [
				[10, 3],
				[25, 5],
				[40, 10],
			]) {
				let sum = 0;
				for (let i = r; i <= n; i++) {
					sum += combinationsFloatSeries(i, r);
				}
				assert.equal(sum, combinationsFloatSeries(n + 1, r + 1));
			}
		});

		it('agrees with BigInt exact computation across a full grid of small (n, k)', () => {
			for (let n = 0; n <= 35; n++) {
				for (let k = 0; k <= n + 2; k++) {
					assert.equal(
						combinationsFloatSeries(n, k),
						Number(exactCombinationsBigInt(n, k)),
						`BigInt mismatch at (${n}, ${k})`
					);
				}
			}
		});
	});

	describe('input validation', () => {
		it('throws TypeError for non-number arguments', () => {
			const invalidTypes = ['5', null, undefined, true, false, {}, [], 5n, Symbol('x')];
			for (const bad of invalidTypes) {
				assert.throws(() => combinationsFloatSeries(bad, 2), TypeError);
				assert.throws(() => combinationsFloatSeries(5, bad), TypeError);
			}
		});

		it('throws RangeError for NaN, Infinity, non-integers, and negative numbers', () => {
			const invalidValues = [NaN, Infinity, -Infinity, -1, -100, 1.5, -0.5, 0.1];
			for (const bad of invalidValues) {
				assert.throws(() => combinationsFloatSeries(bad, 2), RangeError);
				assert.throws(() => combinationsFloatSeries(5, bad), RangeError);
			}
		});
	});
});
