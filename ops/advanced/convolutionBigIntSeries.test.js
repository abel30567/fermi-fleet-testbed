import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
	convolutionBigIntSeries,
	FIXED_POINT_SCALE,
} from './convolutionBigIntSeries.js';

/**
 * Independent Horner evaluation of polynomial P(x) = sum coeffs[i] * x^i.
 * @param {bigint[]} coeffs
 * @param {bigint} x
 * @returns {bigint}
 */
function evalPoly(coeffs, x) {
	let acc = 0n;
	for (let i = coeffs.length - 1; i >= 0; i--) {
		acc = acc * x + coeffs[i];
	}
	return acc;
}

/**
 * Independent O(m * n) reference Cauchy-product convolution.
 * @param {bigint[]} a
 * @param {bigint[]} b
 * @returns {bigint[]}
 */
function naiveConvolution(a, b) {
	if (a.length === 0 || b.length === 0) return [];
	const out = new Array(a.length + b.length - 1).fill(0n);
	for (let i = 0; i < a.length; i++) {
		for (let j = 0; j < b.length; j++) {
			out[i + j] += a[i] * b[j];
		}
	}
	return out;
}

/**
 * Deterministic xorshift64* PRNG for reproducible signed BigInt sequences.
 * @param {bigint} seed
 */
function createPrng(seed) {
	let state = seed;
	const mask64 = (1n << 64n) - 1n;
	return () => {
		state ^= state >> 12n;
		state ^= (state << 25n) & mask64;
		state ^= state >> 27n;
		return (state * 2685821657736338717n) & mask64;
	};
}

describe('convolutionBigIntSeries', () => {
	describe('normal cases', () => {
		test('convolves small positive BigInt sequences', () => {
			assert.deepEqual(
				convolutionBigIntSeries([1n, 2n, 3n], [4n, 5n]),
				[4n, 13n, 22n, 15n]
			);
			assert.deepEqual(
				convolutionBigIntSeries([1n, 2n, 3n], [0n, 1n, 2n]),
				[0n, 1n, 4n, 7n, 6n]
			);
		});

		test('handles signed (positive, negative, and zero) coefficients', () => {
			const a = [1n, -2n, 3n, -4n];
			const b = [-5n, 0n, 6n];
			assert.deepEqual(
				convolutionBigIntSeries(a, b),
				[-5n, 10n, -9n, 8n, 18n, -24n]
			);
		});

		test('preserves exact precision for huge BigInt values far beyond Number.MAX_SAFE_INTEGER', () => {
			const big1 = 10n ** 36n + 1234567890123456789n;
			const big2 = -(1n << 128n) + 7n;
			const big3 = 10n ** 50n - 99999999999999999999n;
			const a = [big1, big2, big3];
			const b = [big3, -big1, big2];

			const actual = convolutionBigIntSeries(a, b);
			const expected = [
				big1 * big3,
				big2 * big3 - big1 * big1,
				big3 * big3 - big2 * big1 + big1 * big2,
				-big3 * big1 + big2 * big2,
				big3 * big2,
			];
			assert.deepEqual(actual, expected);
		});

		test('supports fixed-point BigInt scaling by 10^18 with exact round-half-to-even', () => {
			const S = FIXED_POINT_SCALE;
			assert.equal(S, 10n ** 18n);

			// (1.5 + 2.5 x) * (0.5 - 1.0 x) = 0.75 - 0.25 x - 2.5 x^2
			const a = [(15n * S) / 10n, (25n * S) / 10n];
			const b = [(5n * S) / 10n, -S];
			assert.deepEqual(convolutionBigIntSeries(a, b, { scale: S }), [
				(75n * S) / 100n,
				(-25n * S) / 100n,
				(-25n * S) / 10n,
			]);

			// Verify half-to-even rounding on exact ties (positive and negative)
			// 5 / 2 -> 2 (even), 7 / 2 -> 4 (even), -5 / 2 -> -2 (even), -7 / 2 -> -4 (even)
			assert.deepEqual(
				convolutionBigIntSeries([5n, 7n, -5n, -7n], [1n], { scale: 2n }),
				[2n, 4n, -2n, -4n]
			);
		});

		test('supports full, same, and valid convolution modes', () => {
			const a = [1n, 2n, 3n, 4n];
			const b = [10n, 20n];
			// full = [10n, 40n, 70n, 100n, 80n]
			assert.deepEqual(
				convolutionBigIntSeries(a, b, { mode: 'full' }),
				[10n, 40n, 70n, 100n, 80n]
			);
			assert.deepEqual(
				convolutionBigIntSeries(a, b, { mode: 'same' }),
				[10n, 40n, 70n, 100n]
			);
			assert.deepEqual(
				convolutionBigIntSeries(a, b, { mode: 'valid' }),
				[40n, 70n, 100n]
			);

			// Symmetric when a.length < b.length
			assert.deepEqual(
				convolutionBigIntSeries(b, a, { mode: 'same' }),
				[10n, 40n, 70n, 100n]
			);
			assert.deepEqual(
				convolutionBigIntSeries(b, a, { mode: 'valid' }),
				[40n, 70n, 100n]
			);

			// Equal odd length
			const c = [1n, 2n, 3n];
			const d = [0n, 1n, 2n];
			// full = [0n, 1n, 4n, 7n, 6n]
			assert.deepEqual(
				convolutionBigIntSeries(c, d, { mode: 'same' }),
				[1n, 4n, 7n]
			);
			assert.deepEqual(
				convolutionBigIntSeries(c, d, { mode: 'valid' }),
				[4n]
			);
		});
	});

	describe('edge cases', () => {
		test('handles empty sequences', () => {
			assert.deepEqual(convolutionBigIntSeries([], [1n, 2n]), []);
			assert.deepEqual(convolutionBigIntSeries([1n, 2n], []), []);
			assert.deepEqual(convolutionBigIntSeries([], []), []);
			assert.deepEqual(convolutionBigIntSeries([], [1n], { mode: 'same' }), []);
			assert.deepEqual(convolutionBigIntSeries([], [1n], { mode: 'valid' }), []);
		});

		test('handles single-element sequences and impulse shifts', () => {
			assert.deepEqual(convolutionBigIntSeries([7n], [-3n]), [-21n]);
			assert.deepEqual(convolutionBigIntSeries([0n], [0n]), [0n]);
			assert.deepEqual(convolutionBigIntSeries([1n], [5n, -2n, 9n]), [5n, -2n, 9n]);
			assert.deepEqual(
				convolutionBigIntSeries([0n, 0n, 1n], [5n, -2n, 9n]),
				[0n, 0n, 5n, -2n, 9n]
			);
		});

		test('handles all-zero sequences', () => {
			assert.deepEqual(
				convolutionBigIntSeries([0n, 0n, 0n], [4n, -5n]),
				[0n, 0n, 0n, 0n]
			);
			assert.deepEqual(
				convolutionBigIntSeries([4n, -5n], [0n, 0n]),
				[0n, 0n, 0n]
			);
		});

		test('handles exact power-of-two coefficient magnitude boundaries', () => {
			const cases = [
				[[1n, 1n], [1n, 1n]],
				[[-1n, -1n], [1n, 1n]],
				[[-1n, 1n], [-1n, 1n]],
				[[7n, -7n], [1n, -1n]],
				[[8n, -8n], [1n, -1n]],
				[[-(1n << 63n), 1n << 63n], [1n, -1n, 1n]],
				[[(1n << 64n) - 1n, -(1n << 64n)], [(1n << 64n) - 1n, 1n << 64n]],
			];
			for (const [a, b] of cases) {
				assert.deepEqual(convolutionBigIntSeries(a, b), naiveConvolution(a, b));
			}
		});

		test('does not mutate input arrays', () => {
			const a = [1n, -2n, 3n];
			const b = [4n, 5n, -6n];
			const aCopy = [...a];
			const bCopy = [...b];
			convolutionBigIntSeries(a, b);
			assert.deepEqual(a, aCopy);
			assert.deepEqual(b, bCopy);
		});
	});

	describe('invalid inputs', () => {
		test('rejects non-array inputs with TypeError', () => {
			for (const bad of [null, undefined, 42, 42n, '123', {}, new BigInt64Array([1n])]) {
				assert.throws(() => convolutionBigIntSeries(bad, [1n]), TypeError);
				assert.throws(() => convolutionBigIntSeries([1n], bad), TypeError);
			}
		});

		test('rejects arrays containing non-BigInt elements with TypeError', () => {
			assert.throws(() => convolutionBigIntSeries([1, 2], [1n]), TypeError);
			assert.throws(() => convolutionBigIntSeries([1n], [1n, '2']), TypeError);
			assert.throws(() => convolutionBigIntSeries([1n, null], [1n]), TypeError);
			assert.throws(() => convolutionBigIntSeries([1n], [NaN]), TypeError);
			assert.throws(() => convolutionBigIntSeries([undefined], [1n]), TypeError);
		});

		test('rejects invalid options with TypeError or RangeError', () => {
			assert.throws(() => convolutionBigIntSeries([1n], [1n], null), TypeError);
			assert.throws(() => convolutionBigIntSeries([1n], [1n], 'full'), TypeError);
			assert.throws(() => convolutionBigIntSeries([1n], [1n], []), TypeError);

			assert.throws(() => convolutionBigIntSeries([1n], [1n], { mode: 'circular' }), RangeError);
			assert.throws(() => convolutionBigIntSeries([1n], [1n], { mode: '' }), RangeError);
			assert.throws(() => convolutionBigIntSeries([1n], [1n], { mode: 123 }), RangeError);

			assert.throws(() => convolutionBigIntSeries([1n], [1n], { scale: 10 }), TypeError);
			assert.throws(() => convolutionBigIntSeries([1n], [1n], { scale: '100' }), TypeError);
			assert.throws(() => convolutionBigIntSeries([1n], [1n], { scale: 0n }), RangeError);
			assert.throws(() => convolutionBigIntSeries([1n], [1n], { scale: -10n }), RangeError);
		});
	});

	describe('independent cross-checks and algebraic identities', () => {
		test('satisfies polynomial evaluation identity P(x) * Q(x) = (P * Q)(x)', () => {
			const P = [3n, -7n, 0n, 11n, -(10n ** 18n), 42n, -(1n << 70n)];
			const Q = [-5n, 2n, 10n ** 15n, -13n, 9n];
			const PQ = convolutionBigIntSeries(P, Q);

			const evalPoints = [-(10n ** 9n), -13n, -2n, -1n, 0n, 1n, 2n, 17n, 10n ** 9n + 7n];
			for (const x of evalPoints) {
				assert.equal(evalPoly(P, x) * evalPoly(Q, x), evalPoly(PQ, x));
			}
		});

		test('satisfies commutativity, associativity, and distributivity', () => {
			const a = [3n, -1n, 4n, -1n, 5n];
			const b = [-2n, 7n, -1n, 8n];
			const c = [1n, 6n, -1n, 8n];

			// Commutativity: a * b = b * a
			assert.deepEqual(
				convolutionBigIntSeries(a, b),
				convolutionBigIntSeries(b, a)
			);

			// Associativity: (a * b) * c = a * (b * c)
			assert.deepEqual(
				convolutionBigIntSeries(convolutionBigIntSeries(a, b), c),
				convolutionBigIntSeries(a, convolutionBigIntSeries(b, c))
			);

			// Distributivity: a * (b + c) = (a * b) + (a * c)
			const bPlusC = b.map((v, i) => v + c[i]);
			const lhs = convolutionBigIntSeries(a, bPlusC);
			const ab = convolutionBigIntSeries(a, b);
			const ac = convolutionBigIntSeries(a, c);
			const rhs = ab.map((v, i) => v + ac[i]);
			assert.deepEqual(lhs, rhs);
		});

		test('generates exact Pascal triangle / binomial coefficients via iterated convolution of [1n, 1n]', () => {
			let row = [1n];
			for (let n = 1; n <= 30; n++) {
				row = convolutionBigIntSeries(row, [1n, 1n]);
			}
			// Independently compute C(30, k) via multiplicative formula
			const expected = [1n];
			for (let k = 1; k <= 30; k++) {
				expected.push((expected[k - 1] * BigInt(31 - k)) / BigInt(k));
			}
			assert.deepEqual(row, expected);
			// Sum of binomial coefficients equals 2^30
			assert.equal(
				row.reduce((acc, v) => acc + v, 0n),
				1n << 30n
			);
		});

		test('matches naive Cauchy-sum convolution across pseudo-random signed sequences', () => {
			const nextRand = createPrng(0x9e3779b97f4a7c15n);
			const randSignedBigInt = (bits) => {
				const hi = nextRand();
				const lo = nextRand();
				const combined = ((hi << 64n) | lo) & ((1n << BigInt(bits)) - 1n);
				return (nextRand() & 1n) === 0n ? combined : -combined;
			};

			const shapes = [
				[1, 5, 16],
				[7, 13, 32],
				[16, 16, 64],
				[31, 45, 96],
				[64, 63, 128],
			];

			for (const [m, n, bits] of shapes) {
				const a = Array.from({ length: m }, () => randSignedBigInt(bits));
				const b = Array.from({ length: n }, () => randSignedBigInt(bits));
				const actual = convolutionBigIntSeries(a, b);
				const expected = naiveConvolution(a, b);
				assert.deepEqual(actual, expected);

				// Also verify polynomial evaluation identity at x = -3n and x = 5n
				assert.equal(evalPoly(a, -3n) * evalPoly(b, -3n), evalPoly(actual, -3n));
				assert.equal(evalPoly(a, 5n) * evalPoly(b, 5n), evalPoly(actual, 5n));
			}
		});

		test('handles larger 256x256 signed sequences accurately', () => {
			const nextRand = createPrng(0x123456789abcdef1n);
			const makeSeq = (len) =>
				Array.from({ length: len }, () => {
					const v = nextRand() >> 1n; // 63-bit magnitude
					return (nextRand() & 1n) === 0n ? v : -v;
				});

			const a = makeSeq(256);
			const b = makeSeq(256);
			const actual = convolutionBigIntSeries(a, b);
			const expected = naiveConvolution(a, b);
			assert.equal(actual.length, 511);
			assert.deepEqual(actual, expected);
			assert.equal(evalPoly(a, 7n) * evalPoly(b, 7n), evalPoly(actual, 7n));
		});
	});
});
