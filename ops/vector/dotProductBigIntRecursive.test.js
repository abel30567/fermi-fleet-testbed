import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dotProductBigIntRecursive } from './dotProductBigIntRecursive.js';

/**
 * Independent iterative reference implementation for cross-checking.
 * @param {readonly bigint[]} a
 * @param {readonly bigint[]} b
 * @returns {bigint}
 */
function iterativeDotProduct(a, b) {
	let sum = 0n;
	for (let i = 0; i < a.length; i++) {
		sum += a[i] * b[i];
	}
	return sum;
}

describe('dotProductBigIntRecursive', () => {
	describe('normal cases', () => {
		it('computes dot product of small positive BigInt vectors', () => {
			assert.equal(dotProductBigIntRecursive([1n, 2n, 3n], [4n, 5n, 6n]), 32n);
		});

		it('handles negative, zero, and positive values', () => {
			assert.equal(
				dotProductBigIntRecursive([-2n, 0n, 5n, -7n], [3n, 99n, -4n, -6n]),
				-6n + 0n - 20n + 42n,
			);
		});

		it('returns 0n for orthogonal vectors', () => {
			assert.equal(dotProductBigIntRecursive([1n, 0n, -1n], [1n, 5n, 1n]), 0n);
			assert.equal(dotProductBigIntRecursive([3n, -4n], [4n, 3n]), 0n);
		});

		it('handles single-element vectors', () => {
			assert.equal(dotProductBigIntRecursive([7n], [-9n]), -63n);
			assert.equal(dotProductBigIntRecursive([0n], [123456789n]), 0n);
		});

		it('handles various even and odd vector lengths across divide-and-conquer splits', () => {
			for (const len of [2, 3, 4, 5, 7, 8, 9, 15, 16, 17, 31, 32, 33]) {
				const a = Array.from({ length: len }, (_, i) => BigInt(i + 1));
				const b = Array.from({ length: len }, (_, i) => BigInt(len - i));
				assert.equal(dotProductBigIntRecursive(a, b), iterativeDotProduct(a, b));
			}
		});
	});

	describe('edge cases', () => {
		it('returns 0n for empty vectors', () => {
			assert.equal(dotProductBigIntRecursive([], []), 0n);
		});

		it('returns 0n for all-zero vectors', () => {
			assert.equal(dotProductBigIntRecursive([0n, 0n, 0n, 0n], [0n, 0n, 0n, 0n]), 0n);
		});

		it('preserves exact arbitrary precision far beyond Number.MAX_SAFE_INTEGER', () => {
			const big1 = 10n ** 50n + 1234567890123456789n;
			const big2 = 10n ** 50n - 9876543210987654321n;
			const a = [big1, -big2, 2n ** 256n + 1n];
			const b = [big2, big1, -(2n ** 256n - 1n)];
			const expected = big1 * big2 - big2 * big1 - ((2n ** 256n) ** 2n - 1n);
			assert.equal(dotProductBigIntRecursive(a, b), expected);
		});

		it('handles large vectors without stack overflow and matches closed-form sum of squares', () => {
			const n = 10000;
			const a = Array.from({ length: n }, (_, i) => BigInt(i + 1));
			const nBig = BigInt(n);
			const expected = (nBig * (nBig + 1n) * (2n * nBig + 1n)) / 6n;
			assert.equal(dotProductBigIntRecursive(a, a), expected);
		});

		it('does not mutate input arrays', () => {
			const a = [10n, -20n, 30n];
			const b = [4n, 5n, -6n];
			const aCopy = [...a];
			const bCopy = [...b];
			dotProductBigIntRecursive(a, b);
			assert.deepEqual(a, aCopy);
			assert.deepEqual(b, bCopy);
		});
	});

	describe('input validation', () => {
		it('throws TypeError when arguments are not arrays', () => {
			const invalid = [null, undefined, 42, 42n, '123', {}, new Set([1n])];
			for (const bad of invalid) {
				assert.throws(() => dotProductBigIntRecursive(bad, [1n]), TypeError);
				assert.throws(() => dotProductBigIntRecursive([1n], bad), TypeError);
			}
		});

		it('throws RangeError when vector lengths differ', () => {
			assert.throws(() => dotProductBigIntRecursive([1n, 2n], [1n]), RangeError);
			assert.throws(() => dotProductBigIntRecursive([], [0n]), RangeError);
			assert.throws(() => dotProductBigIntRecursive([1n], [1n, 2n, 3n]), RangeError);
		});

		it('throws TypeError when any element is not a bigint', () => {
			const badElements = [1, 0, -5, 1.5, NaN, '1', null, undefined, true, {}];
			for (const bad of badElements) {
				assert.throws(() => dotProductBigIntRecursive([1n, bad, 3n], [1n, 2n, 3n]), TypeError);
				assert.throws(() => dotProductBigIntRecursive([1n, 2n, 3n], [1n, 2n, bad]), TypeError);
			}
		});

		it('throws TypeError for sparse arrays (holes)', () => {
			const sparse = new Array(3);
			sparse[0] = 1n;
			sparse[2] = 3n;
			assert.throws(() => dotProductBigIntRecursive(sparse, [1n, 2n, 3n]), TypeError);
			assert.throws(() => dotProductBigIntRecursive([1n, 2n, 3n], sparse), TypeError);
		});
	});

	describe('independent cross-checks and algebraic identities', () => {
		it('matches iterative reference across deterministic pseudo-random vectors', () => {
			let state = 0x123456789abcdef0123456789abcdef0n;
			const mod = 1n << 128n;
			const nextBigInt = () => {
				state = (state * 6364136223846793005n + 1442695040888963407n) % mod;
				return state - (mod >> 1n);
			};

			for (let len = 0; len <= 65; len++) {
				const a = Array.from({ length: len }, () => nextBigInt());
				const b = Array.from({ length: len }, () => nextBigInt());
				assert.equal(dotProductBigIntRecursive(a, b), iterativeDotProduct(a, b));
			}
		});

		it('satisfies commutativity, bilinearity, and Cauchy-Schwarz inequality', () => {
			const a = [123456789012345678901n, -98765432109876543210n, 42n, -17n, 99999999999999999999n];
			const b = [-55555555555555555555n, 33333333333333333333n, -88n, 100000000000000000001n, 7n];
			const c = [11n, -22n, 33n, -44n, 55n];
			const k = -77777777777777777777n;

			// Commutativity: a . b == b . a
			const ab = dotProductBigIntRecursive(a, b);
			assert.equal(ab, dotProductBigIntRecursive(b, a));

			// Distributivity: a . (b + c) == (a . b) + (a . c)
			const bPlusC = b.map((v, i) => v + c[i]);
			assert.equal(
				dotProductBigIntRecursive(a, bPlusC),
				ab + dotProductBigIntRecursive(a, c),
			);

			// Homogeneity: (k * a) . b == k * (a . b)
			const ka = a.map((v) => k * v);
			assert.equal(dotProductBigIntRecursive(ka, b), k * ab);

			// Non-negativity and Cauchy-Schwarz: (a . b)^2 <= (a . a) * (b . b)
			const aa = dotProductBigIntRecursive(a, a);
			const bb = dotProductBigIntRecursive(b, b);
			assert.ok(aa > 0n);
			assert.ok(bb > 0n);
			assert.ok(ab * ab <= aa * bb);
		});
	});
});
