import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { permutationsBigIntRecursive } from './permutationsBigIntRecursive.js';

/**
 * Independent iterative falling factorial for cross-checking.
 *
 * @param {bigint} n
 * @param {bigint} k
 * @returns {bigint}
 */
function iterativePermutations(n, k) {
	if (k > n) return 0n;
	let acc = 1n;
	for (let i = 0n; i < k; i++) {
		acc *= n - i;
	}
	return acc;
}

/**
 * Independent iterative factorial for cross-checking P(n, k) = n! / (n - k)!.
 *
 * @param {bigint} m
 * @returns {bigint}
 */
function iterativeFactorial(m) {
	let acc = 1n;
	for (let i = 2n; i <= m; i++) {
		acc *= i;
	}
	return acc;
}

describe('permutationsBigIntRecursive', () => {
	it('computes known small and medium permutations accurately', () => {
		assert.equal(permutationsBigIntRecursive(1n, 1n), 1n);
		assert.equal(permutationsBigIntRecursive(4n, 2n), 12n);
		assert.equal(permutationsBigIntRecursive(5n, 3n), 60n);
		assert.equal(permutationsBigIntRecursive(6n, 2n), 30n);
		assert.equal(permutationsBigIntRecursive(7n, 3n), 210n);
		assert.equal(permutationsBigIntRecursive(10n, 4n), 5040n);
		assert.equal(permutationsBigIntRecursive(20n, 5n), 1860480n);
	});

	it('handles k = 0n edge cases (including P(0n, 0n))', () => {
		assert.equal(permutationsBigIntRecursive(0n, 0n), 1n);
		assert.equal(permutationsBigIntRecursive(1n, 0n), 1n);
		assert.equal(permutationsBigIntRecursive(42n, 0n), 1n);
		assert.equal(permutationsBigIntRecursive(10n ** 50n, 0n), 1n);
	});

	it('handles k = 1n edge cases', () => {
		assert.equal(permutationsBigIntRecursive(1n, 1n), 1n);
		assert.equal(permutationsBigIntRecursive(99n, 1n), 99n);
		const huge = 10n ** 60n + 7n;
		assert.equal(permutationsBigIntRecursive(huge, 1n), huge);
	});

	it('handles k = n (factorial) edge cases', () => {
		assert.equal(permutationsBigIntRecursive(0n, 0n), 1n);
		assert.equal(permutationsBigIntRecursive(1n, 1n), 1n);
		assert.equal(permutationsBigIntRecursive(5n, 5n), 120n);
		assert.equal(permutationsBigIntRecursive(10n, 10n), 3628800n);
		assert.equal(permutationsBigIntRecursive(20n, 20n), 2432902008176640000n);
	});

	it('returns 0n when k > n', () => {
		assert.equal(permutationsBigIntRecursive(0n, 1n), 0n);
		assert.equal(permutationsBigIntRecursive(5n, 6n), 0n);
		assert.equal(permutationsBigIntRecursive(3n, 100n), 0n);
		assert.equal(permutationsBigIntRecursive(10n, 10n ** 30n), 0n);
	});

	it('handles large n with small k and large n with large k without overflow', () => {
		const base = 10n ** 30n;
		assert.equal(
			permutationsBigIntRecursive(base, 3n),
			base * (base - 1n) * (base - 2n),
		);

		const p500 = permutationsBigIntRecursive(500n, 500n);
		assert.equal(p500, iterativeFactorial(500n));

		const p1000_400 = permutationsBigIntRecursive(1000n, 400n);
		assert.equal(p1000_400, iterativePermutations(1000n, 400n));
	});

	it('throws TypeError on non-BigInt inputs', () => {
		const invalidValues = [
			5,
			0,
			-1,
			3.14,
			NaN,
			Infinity,
			-Infinity,
			'5',
			true,
			false,
			null,
			undefined,
			{},
			[5n],
			Symbol('n'),
		];

		for (const bad of invalidValues) {
			assert.throws(
				() => permutationsBigIntRecursive(bad, 2n),
				{ name: 'TypeError' },
				`Expected TypeError for n=${String(bad)}`,
			);
			assert.throws(
				() => permutationsBigIntRecursive(5n, bad),
				{ name: 'TypeError' },
				`Expected TypeError for k=${String(bad)}`,
			);
		}

		assert.throws(() => permutationsBigIntRecursive(), { name: 'TypeError' });
		assert.throws(() => permutationsBigIntRecursive(5n), { name: 'TypeError' });
	});

	it('throws RangeError on negative BigInt inputs', () => {
		assert.throws(() => permutationsBigIntRecursive(-1n, 0n), { name: 'RangeError' });
		assert.throws(() => permutationsBigIntRecursive(5n, -1n), { name: 'RangeError' });
		assert.throws(() => permutationsBigIntRecursive(-10n, -3n), { name: 'RangeError' });
		assert.throws(() => permutationsBigIntRecursive(-(10n ** 40n), 1n), { name: 'RangeError' });
	});

	it('cross-checks against iterative falling factorial across full 0..25 grid', () => {
		for (let n = 0n; n <= 25n; n++) {
			for (let k = 0n; k <= n + 2n; k++) {
				assert.equal(
					permutationsBigIntRecursive(n, k),
					iterativePermutations(n, k),
					`Mismatch at P(${n}, ${k})`,
				);
			}
		}
	});

	it('cross-checks against exact factorial ratio n! / (n - k)!', () => {
		const pairs = [
			[0n, 0n],
			[12n, 5n],
			[30n, 15n],
			[75n, 40n],
			[150n, 100n],
			[200n, 200n],
		];

		for (const [n, k] of pairs) {
			const num = iterativeFactorial(n);
			const den = iterativeFactorial(n - k);
			assert.equal(num % den, 0n);
			assert.equal(permutationsBigIntRecursive(n, k), num / den);
		}
	});

	it('satisfies fundamental combinatorial identities', () => {
		// Recurrence: P(n, k) = n * P(n - 1, k - 1) and P(n, k) = P(n - 1, k) + k * P(n - 1, k - 1)
		for (let n = 1n; n <= 18n; n++) {
			for (let k = 1n; k <= n; k++) {
				const p = permutationsBigIntRecursive(n, k);
				assert.equal(p, n * permutationsBigIntRecursive(n - 1n, k - 1n));
				assert.equal(
					p,
					permutationsBigIntRecursive(n - 1n, k) + k * permutationsBigIntRecursive(n - 1n, k - 1n),
				);
			}
		}

		// Composition / splitting: P(n, a + b) = P(n, a) * P(n - a, b)
		assert.equal(
			permutationsBigIntRecursive(50n, 30n),
			permutationsBigIntRecursive(50n, 12n) * permutationsBigIntRecursive(38n, 18n),
		);

		// Relation with Pascal's triangle: P(n, k) = C(n, k) * k!
		const maxN = 15;
		const pascal = Array.from({ length: maxN + 1 }, () => []);
		for (let i = 0; i <= maxN; i++) {
			for (let j = 0; j <= i; j++) {
				pascal[i][j] = j === 0 || j === i ? 1n : pascal[i - 1][j - 1] + pascal[i - 1][j];
				assert.equal(
					permutationsBigIntRecursive(BigInt(i), BigInt(j)),
					pascal[i][j] * iterativeFactorial(BigInt(j)),
				);
			}
		}
	});
});
