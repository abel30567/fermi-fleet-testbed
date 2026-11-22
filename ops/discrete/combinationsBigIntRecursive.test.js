import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { combinationsBigIntRecursive } from './combinationsBigIntRecursive.js';

/**
 * Independent naive factorial for cross-checking binomial coefficients.
 * @param {bigint} n
 * @returns {bigint}
 */
function factorial(n) {
	let result = 1n;
	for (let i = 2n; i <= n; i++) {
		result *= i;
	}
	return result;
}

/**
 * Independent factorial ratio C(n, k) = n! / (k! * (n - k)!).
 * @param {bigint} n
 * @param {bigint} k
 * @returns {bigint}
 */
function combinationsByFactorial(n, k) {
	if (k > n) return 0n;
	return factorial(n) / (factorial(k) * factorial(n - k));
}

describe('combinationsBigIntRecursive', () => {
	describe('normal cases', () => {
		it('computes exact values for small and medium inputs', () => {
			assert.equal(combinationsBigIntRecursive(5n, 2n), 10n);
			assert.equal(combinationsBigIntRecursive(6n, 3n), 20n);
			assert.equal(combinationsBigIntRecursive(10n, 3n), 120n);
			assert.equal(combinationsBigIntRecursive(10n, 5n), 252n);
			assert.equal(combinationsBigIntRecursive(20n, 10n), 184756n);
			assert.equal(combinationsBigIntRecursive(52n, 5n), 2598960n);
			assert.equal(combinationsBigIntRecursive(60n, 30n), 118264581564861424n);
		});
	});

	describe('edge cases', () => {
		it('handles k = 0n and k = n', () => {
			assert.equal(combinationsBigIntRecursive(0n, 0n), 1n);
			assert.equal(combinationsBigIntRecursive(1n, 0n), 1n);
			assert.equal(combinationsBigIntRecursive(1n, 1n), 1n);
			assert.equal(combinationsBigIntRecursive(100n, 0n), 1n);
			assert.equal(combinationsBigIntRecursive(100n, 100n), 1n);
			assert.equal(combinationsBigIntRecursive(10n ** 18n, 0n), 1n);
			assert.equal(combinationsBigIntRecursive(10n ** 18n, 10n ** 18n), 1n);
		});

		it('handles k = 1n and k = n - 1n (including very large n via symmetry)', () => {
			const huge = 10n ** 30n;
			assert.equal(combinationsBigIntRecursive(7n, 1n), 7n);
			assert.equal(combinationsBigIntRecursive(7n, 6n), 7n);
			assert.equal(combinationsBigIntRecursive(huge, 1n), huge);
			assert.equal(combinationsBigIntRecursive(huge, huge - 1n), huge);
		});

		it('returns 0n when k > n', () => {
			assert.equal(combinationsBigIntRecursive(0n, 1n), 0n);
			assert.equal(combinationsBigIntRecursive(5n, 6n), 0n);
			assert.equal(combinationsBigIntRecursive(10n, 1000n), 0n);
			assert.equal(combinationsBigIntRecursive(100n, 10n ** 18n), 0n);
		});
	});

	describe('mathematical identities', () => {
		it('satisfies symmetry C(n, k) = C(n, n - k)', () => {
			for (let n = 0n; n <= 25n; n++) {
				for (let k = 0n; k <= n; k++) {
					assert.equal(
						combinationsBigIntRecursive(n, k),
						combinationsBigIntRecursive(n, n - k),
						`Symmetry failed for n=${n}, k=${k}`
					);
				}
			}
			assert.equal(
				combinationsBigIntRecursive(150n, 47n),
				combinationsBigIntRecursive(150n, 103n)
			);
		});

		it('satisfies Pascal identity C(n, k) = C(n - 1, k - 1) + C(n - 1, k)', () => {
			for (let n = 1n; n <= 30n; n++) {
				for (let k = 1n; k < n; k++) {
					const lhs = combinationsBigIntRecursive(n, k);
					const rhs =
						combinationsBigIntRecursive(n - 1n, k - 1n) +
						combinationsBigIntRecursive(n - 1n, k);
					assert.equal(lhs, rhs, `Pascal identity failed for n=${n}, k=${k}`);
				}
			}
			assert.equal(
				combinationsBigIntRecursive(200n, 100n),
				combinationsBigIntRecursive(199n, 99n) +
					combinationsBigIntRecursive(199n, 100n)
			);
		});

		it('satisfies sum-of-row identity sum_{k=0..n} C(n, k) = 2^n', () => {
			for (const n of [0n, 1n, 2n, 5n, 10n, 20n, 35n, 64n]) {
				let sum = 0n;
				for (let k = 0n; k <= n; k++) {
					sum += combinationsBigIntRecursive(n, k);
				}
				assert.equal(sum, 2n ** n, `Row sum identity failed for n=${n}`);
			}
		});

		it('satisfies Vandermonde identity', () => {
			const m = 18n;
			const n = 22n;
			const r = 15n;
			let sum = 0n;
			for (let k = 0n; k <= r; k++) {
				sum +=
					combinationsBigIntRecursive(m, k) *
					combinationsBigIntRecursive(n, r - k);
			}
			assert.equal(sum, combinationsBigIntRecursive(m + n, r));
		});
	});

	describe('cross-checks and large values', () => {
		it('matches independent Pascal triangle DP for all 0 <= k <= n <= 40', () => {
			let row = [1n];
			for (let n = 0; n <= 40; n++) {
				for (let k = 0; k <= n; k++) {
					assert.equal(
						combinationsBigIntRecursive(BigInt(n), BigInt(k)),
						row[k],
						`Pascal triangle mismatch at n=${n}, k=${k}`
					);
				}
				const next = [1n];
				for (let k = 1; k <= n; k++) {
					next.push(row[k - 1] + row[k]);
				}
				next.push(1n);
				row = next;
			}
		});

		it('matches exact value and factorial ratio for large inputs including C(200n, 100n)', () => {
			const c200_100 = combinationsBigIntRecursive(200n, 100n);
			assert.equal(
				c200_100,
				90548514656103281165404177077484163874504589675413336841320n
			);
			assert.equal(c200_100, combinationsByFactorial(200n, 100n));

			assert.equal(
				combinationsBigIntRecursive(100n, 37n),
				combinationsByFactorial(100n, 37n)
			);
			assert.equal(
				combinationsBigIntRecursive(500n, 250n),
				combinationsByFactorial(500n, 250n)
			);
		});
	});

	describe('input validation', () => {
		it('throws TypeError for non-BigInt arguments', () => {
			const invalidValues = [0, 5, 3.14, NaN, Infinity, '5', null, undefined, true, {}, []];
			for (const bad of invalidValues) {
				assert.throws(
					() => combinationsBigIntRecursive(bad, 2n),
					{ name: 'TypeError' },
					`Expected TypeError for n=${String(bad)}`
				);
				assert.throws(
					() => combinationsBigIntRecursive(5n, bad),
					{ name: 'TypeError' },
					`Expected TypeError for k=${String(bad)}`
				);
			}
			assert.throws(() => combinationsBigIntRecursive(), { name: 'TypeError' });
			assert.throws(() => combinationsBigIntRecursive(5n), { name: 'TypeError' });
		});

		it('throws RangeError for negative BigInt arguments', () => {
			assert.throws(() => combinationsBigIntRecursive(-1n, 0n), { name: 'RangeError' });
			assert.throws(() => combinationsBigIntRecursive(0n, -1n), { name: 'RangeError' });
			assert.throws(() => combinationsBigIntRecursive(-10n, -5n), { name: 'RangeError' });
			assert.throws(() => combinationsBigIntRecursive(5n, -2n), { name: 'RangeError' });
		});
	});
});
