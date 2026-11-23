import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { permutationsBigIntStable } from './permutationsBigIntStable.js';

/**
 * Reference factorial for independent verification of small/moderate inputs.
 *
 * @param {bigint} m
 * @returns {bigint}
 */
function factorialRef(m) {
	let acc = 1n;
	for (let i = 2n; i <= m; i++) {
		acc *= i;
	}
	return acc;
}

describe('permutationsBigIntStable', () => {
	it('computes exact values for standard (n, k) cases', () => {
		assert.equal(permutationsBigIntStable(5n, 3n), 60n);
		assert.equal(permutationsBigIntStable(10n, 4n), 5040n);
		assert.equal(permutationsBigIntStable(52n, 5n), 311875200n);
		assert.equal(permutationsBigIntStable(20n, 5n), 1860480n);
		assert.equal(
			permutationsBigIntStable(100n, 10n),
			62815650955529472000n,
		);
	});

	it('handles k = 0n and k = 1n edge cases', () => {
		assert.equal(permutationsBigIntStable(0n, 0n), 1n);
		assert.equal(permutationsBigIntStable(1n, 0n), 1n);
		assert.equal(permutationsBigIntStable(42n, 0n), 1n);
		assert.equal(permutationsBigIntStable(10n ** 100n, 0n), 1n);

		assert.equal(permutationsBigIntStable(1n, 1n), 1n);
		assert.equal(permutationsBigIntStable(999n, 1n), 999n);
		assert.equal(permutationsBigIntStable(10n ** 100n, 1n), 10n ** 100n);
	});

	it('handles k = n (full factorial) edge cases', () => {
		assert.equal(permutationsBigIntStable(1n, 1n), 1n);
		assert.equal(permutationsBigIntStable(5n, 5n), 120n);
		assert.equal(permutationsBigIntStable(10n, 10n), 3628800n);
		assert.equal(
			permutationsBigIntStable(20n, 20n),
			2432902008176640000n,
		);
		assert.equal(permutationsBigIntStable(50n, 50n), factorialRef(50n));
	});

	it('returns 0n whenever k > n', () => {
		assert.equal(permutationsBigIntStable(0n, 1n), 0n);
		assert.equal(permutationsBigIntStable(0n, 100n), 0n);
		assert.equal(permutationsBigIntStable(5n, 6n), 0n);
		assert.equal(permutationsBigIntStable(10n, 10n ** 50n), 0n);
	});

	it('handles very large n with small k without computing n!', () => {
		const bigN = 10n ** 100n;
		const expected3 = bigN * (bigN - 1n) * (bigN - 2n);
		assert.equal(permutationsBigIntStable(bigN, 3n), expected3);

		let expected7 = 1n;
		for (let i = 0n; i < 7n; i++) {
			expected7 *= bigN - i;
		}
		assert.equal(permutationsBigIntStable(bigN, 7n), expected7);
	});

	it('matches independent factorial ratio n! / (n - k)!', () => {
		for (let n = 0n; n <= 30n; n++) {
			const factN = factorialRef(n);
			for (let k = 0n; k <= n; k++) {
				const expected = factN / factorialRef(n - k);
				assert.equal(
					permutationsBigIntStable(n, k),
					expected,
					`Mismatch at P(${n}, ${k})`,
				);
			}
		}

		// Larger spot checks across even/odd factor counts
		for (const [n, k] of [
			[100n, 37n],
			[150n, 100n],
			[200n, 123n],
		]) {
			const expected = factorialRef(n) / factorialRef(n - k);
			assert.equal(permutationsBigIntStable(n, k), expected);
		}
	});

	it('satisfies recurrence P(n, k) = n * P(n - 1, k - 1) and additive/splitting identities', () => {
		// Recurrence P(n, k) = n * P(n - 1, k - 1) and P(n, k) = P(n - 1, k) + k * P(n - 1, k - 1)
		for (let n = 1n; n <= 25n; n++) {
			for (let k = 1n; k <= n; k++) {
				const p = permutationsBigIntStable(n, k);
				const rec = n * permutationsBigIntStable(n - 1n, k - 1n);
				assert.equal(p, rec, `Recurrence failed at P(${n}, ${k})`);

				const pascalLike =
					permutationsBigIntStable(n - 1n, k) +
					k * permutationsBigIntStable(n - 1n, k - 1n);
				assert.equal(p, pascalLike, `Additive recurrence failed at P(${n}, ${k})`);
			}
		}

		// Multiplicative splitting identity for large operands:
		// P(n, a + b) = P(n, a) * P(n - a, b)
		const n = 1000n;
		const a = 321n;
		const b = 279n;
		assert.equal(
			permutationsBigIntStable(n, a + b),
			permutationsBigIntStable(n, a) * permutationsBigIntStable(n - a, b),
		);

		// Recurrence on a very large n
		const hugeN = 10n ** 80n + 17n;
		const smallK = 15n;
		assert.equal(
			permutationsBigIntStable(hugeN, smallK),
			hugeN * permutationsBigIntStable(hugeN - 1n, smallK - 1n),
		);
	});

	it('throws TypeError for non-BigInt inputs', () => {
		const invalidValues = [0, 5, 3.14, NaN, Infinity, '5', null, undefined, true, {}, []];
		for (const bad of invalidValues) {
			assert.throws(() => permutationsBigIntStable(bad, 2n), TypeError);
			assert.throws(() => permutationsBigIntStable(5n, bad), TypeError);
		}
		assert.throws(() => permutationsBigIntStable(), TypeError);
		assert.throws(() => permutationsBigIntStable(5n), TypeError);
	});

	it('throws RangeError for negative BigInt inputs', () => {
		assert.throws(() => permutationsBigIntStable(-1n, 0n), RangeError);
		assert.throws(() => permutationsBigIntStable(-10n, 3n), RangeError);
		assert.throws(() => permutationsBigIntStable(5n, -1n), RangeError);
		assert.throws(() => permutationsBigIntStable(0n, -1n), RangeError);
		assert.throws(() => permutationsBigIntStable(-5n, -2n), RangeError);
	});
});
