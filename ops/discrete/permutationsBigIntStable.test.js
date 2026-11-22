import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { permutationsBigIntStable } from './permutationsBigIntStable.js';

/**
 * Independent naive factorial oracle for cross-checking small/medium inputs.
 * @param {bigint} m
 * @returns {bigint}
 */
function naiveFactorial(m) {
	let acc = 1n;
	for (let i = 2n; i <= m; i += 1n) {
		acc *= i;
	}
	return acc;
}

/**
 * Independent sequential falling-factorial oracle for cross-checking.
 * @param {bigint} n
 * @param {bigint} k
 * @returns {bigint}
 */
function sequentialFallingFactorial(n, k) {
	let acc = 1n;
	for (let i = 0n; i < k; i += 1n) {
		acc *= n - i;
	}
	return acc;
}

/**
 * Legendre's formula for the exponent of prime p in n!.
 * @param {bigint} n
 * @param {bigint} p
 * @returns {bigint}
 */
function factorialPrimeValuation(n, p) {
	let count = 0n;
	let div = p;
	while (div <= n) {
		count += n / div;
		div *= p;
	}
	return count;
}

describe('permutationsBigIntStable', () => {
	describe('core edge cases (k=0, k=1, k=n, k>n, n=0)', () => {
		it('returns 1n when k === 0n for all valid n including n === 0n', () => {
			assert.equal(permutationsBigIntStable(0n, 0n), 1n);
			assert.equal(permutationsBigIntStable(1n, 0n), 1n);
			assert.equal(permutationsBigIntStable(5n, 0n), 1n);
			assert.equal(permutationsBigIntStable(10n ** 50n, 0n), 1n);
		});

		it('returns n when k === 1n and n >= 1n', () => {
			assert.equal(permutationsBigIntStable(1n, 1n), 1n);
			assert.equal(permutationsBigIntStable(7n, 1n), 7n);
			assert.equal(permutationsBigIntStable(10n ** 40n + 123n, 1n), 10n ** 40n + 123n);
		});

		it('returns 0n when k > n (including n === 0n and astronomical inputs)', () => {
			assert.equal(permutationsBigIntStable(0n, 1n), 0n);
			assert.equal(permutationsBigIntStable(0n, 100n), 0n);
			assert.equal(permutationsBigIntStable(0n, 10n ** 50n), 0n);
			assert.equal(permutationsBigIntStable(5n, 6n), 0n);
			assert.equal(permutationsBigIntStable(10n ** 30n, 10n ** 30n + 1n), 0n);
		});

		it('returns n! when k === n', () => {
			assert.equal(permutationsBigIntStable(0n, 0n), 1n);
			assert.equal(permutationsBigIntStable(1n, 1n), 1n);
			assert.equal(permutationsBigIntStable(2n, 2n), 2n);
			assert.equal(permutationsBigIntStable(3n, 3n), 6n);
			assert.equal(permutationsBigIntStable(4n, 4n), 24n);
			assert.equal(permutationsBigIntStable(5n, 5n), 120n);
			assert.equal(permutationsBigIntStable(10n, 10n), 3628800n);
			assert.equal(permutationsBigIntStable(20n, 20n), 2432902008176640000n);
		});

		it('handles small spans cleanly (k = 2, 3, 4, 5)', () => {
			assert.equal(permutationsBigIntStable(5n, 2n), 20n);
			assert.equal(permutationsBigIntStable(5n, 3n), 60n);
			assert.equal(permutationsBigIntStable(5n, 4n), 120n);
			assert.equal(permutationsBigIntStable(10n, 4n), 5040n);
			assert.equal(permutationsBigIntStable(10n, 5n), 30240n);
		});
	});

	describe('large BigInts beyond Number.MAX_SAFE_INTEGER', () => {
		it('computes P(10n**30n, 5n) directly without full factorial blowup', () => {
			const n = 10n ** 30n;
			const actual = permutationsBigIntStable(n, 5n);
			// Independent polynomial expansion via signed Stirling numbers of the first kind:
			// n(n-1)(n-2)(n-3)(n-4) = n^5 - 10n^4 + 35n^3 - 50n^2 + 24n
			const expectedByPoly =
				n ** 5n - 10n * n ** 4n + 35n * n ** 3n - 50n * n ** 2n + 24n * n;
			const expectedBySeq = sequentialFallingFactorial(n, 5n);

			assert.equal(actual, expectedByPoly);
			assert.equal(actual, expectedBySeq);
		});

		it('computes P(10n**100n, 4n) accurately', () => {
			const n = 10n ** 100n;
			const actual = permutationsBigIntStable(n, 4n);
			// n(n-1)(n-2)(n-3) = n^4 - 6n^3 + 11n^2 - 6n
			const expected = n ** 4n - 6n * n ** 3n + 11n * n ** 2n - 6n * n;
			assert.equal(actual, expected);
		});

		it('computes P(n, k) accurately for n just above Number.MAX_SAFE_INTEGER', () => {
			const n = BigInt(Number.MAX_SAFE_INTEGER) + 12345n;
			const k = 17n;
			assert.equal(permutationsBigIntStable(n, k), sequentialFallingFactorial(n, k));
		});

		it('computes large k permutations efficiently and exactly', () => {
			// P(5000, 5000) = 5000! (16,326 decimal digits)
			const fact5000 = permutationsBigIntStable(5000n, 5000n);
			assert.equal(fact5000, naiveFactorial(5000n));
			assert.equal(fact5000.toString().length, 16326);

			// Cross-check p-adic valuation via Legendre's formula for p = 2 and p = 5
			const v5 = factorialPrimeValuation(5000n, 5n);
			assert.equal(fact5000 % 5n ** v5, 0n);
			assert.notEqual(fact5000 % 5n ** (v5 + 1n), 0n);

			// P(10000, 2000) cross-checked against sequential falling factorial
			const pLarge = permutationsBigIntStable(10000n, 2000n);
			assert.equal(pLarge, sequentialFallingFactorial(10000n, 2000n));
		});
	});

	describe('independent cross-checks & algebraic identities', () => {
		it('matches n! / (n - k)! exhaustively for all 0 <= k <= n <= 40', () => {
			const factorials = [1n];
			for (let i = 1n; i <= 40n; i += 1n) {
				factorials.push(factorials[factorials.length - 1] * i);
			}

			for (let n = 0n; n <= 40n; n += 1n) {
				for (let k = 0n; k <= n; k += 1n) {
					const expected = factorials[Number(n)] / factorials[Number(n - k)];
					assert.equal(
						permutationsBigIntStable(n, k),
						expected,
						`Mismatch at P(${n}n, ${k}n)`
					);
				}
			}
		});

		it('satisfies recurrence P(n, k) = n * P(n - 1, k - 1)', () => {
			const pairs = [
				[1n, 1n],
				[6n, 3n],
				[25n, 12n],
				[100n, 50n],
				[10n ** 25n + 7n, 15n],
				[10n ** 40n, 8n]
			];
			for (const [n, k] of pairs) {
				const lhs = permutationsBigIntStable(n, k);
				const rhs = n * permutationsBigIntStable(n - 1n, k - 1n);
				assert.equal(lhs, rhs, `Recurrence failed for P(${n}n, ${k}n)`);
			}
		});

		it('satisfies additive recurrence P(n, k) = P(n - 1, k) + k * P(n - 1, k - 1)', () => {
			const pairs = [
				[5n, 2n],
				[12n, 7n],
				[50n, 20n],
				[10n ** 20n + 3n, 9n]
			];
			for (const [n, k] of pairs) {
				const lhs = permutationsBigIntStable(n, k);
				const rhs =
					permutationsBigIntStable(n - 1n, k) +
					k * permutationsBigIntStable(n - 1n, k - 1n);
				assert.equal(lhs, rhs, `Additive recurrence failed for P(${n}n, ${k}n)`);
			}
		});

		it('satisfies multiplicative splitting identity P(n, a + b) = P(n, a) * P(n - a, b)', () => {
			const cases = [
				[30n, 10n, 15n],
				[500n, 200n, 250n],
				[100000n, 400n, 600n],
				[10n ** 35n, 11n, 13n]
			];
			for (const [n, a, b] of cases) {
				const lhs = permutationsBigIntStable(n, a + b);
				const rhs =
					permutationsBigIntStable(n, a) * permutationsBigIntStable(n - a, b);
				assert.equal(lhs, rhs, `Splitting identity failed for n=${n}, a=${a}, b=${b}`);
			}
		});

		it('satisfies P(n, k) = C(n, k) * k! against an independent Pascal-triangle oracle', () => {
			const maxN = 25;
			const pascal = Array.from({ length: maxN + 1 }, () => []);
			for (let n = 0; n <= maxN; n += 1) {
				pascal[n][0] = 1n;
				pascal[n][n] = 1n;
				for (let k = 1; k < n; k += 1) {
					pascal[n][k] = pascal[n - 1][k - 1] + pascal[n - 1][k];
				}
			}

			for (let n = 0; n <= maxN; n += 1) {
				for (let k = 0; k <= n; k += 1) {
					const expected = pascal[n][k] * naiveFactorial(BigInt(k));
					assert.equal(permutationsBigIntStable(BigInt(n), BigInt(k)), expected);
				}
			}
		});
	});

	describe('input validation', () => {
		it('throws TypeError for non-BigInt inputs', () => {
			const invalidValues = [
				0,
				5,
				-1,
				1.5,
				NaN,
				Infinity,
				'5',
				'5n',
				true,
				false,
				null,
				undefined,
				{},
				[],
				Symbol('x')
			];

			for (const bad of invalidValues) {
				assert.throws(() => permutationsBigIntStable(bad, 2n), TypeError);
				assert.throws(() => permutationsBigIntStable(5n, bad), TypeError);
			}

			assert.throws(() => permutationsBigIntStable(), TypeError);
			assert.throws(() => permutationsBigIntStable(5n), TypeError);
		});

		it('throws RangeError for negative BigInt inputs', () => {
			assert.throws(() => permutationsBigIntStable(-1n, 0n), RangeError);
			assert.throws(() => permutationsBigIntStable(-1n, 5n), RangeError);
			assert.throws(() => permutationsBigIntStable(-100n, 1n), RangeError);
			assert.throws(() => permutationsBigIntStable(0n, -1n), RangeError);
			assert.throws(() => permutationsBigIntStable(5n, -1n), RangeError);
			assert.throws(() => permutationsBigIntStable(-5n, -2n), RangeError);
			assert.throws(() => permutationsBigIntStable(-(10n ** 30n), 3n), RangeError);
		});
	});
});
