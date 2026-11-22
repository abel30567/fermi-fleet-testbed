import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { convolutionBigIntSeries } from './convolutionBigIntSeries.js';

/**
 * Independent naive O(N * M) reference discrete convolution.
 *
 * @param {readonly bigint[]} a
 * @param {readonly bigint[]} b
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
 * Evaluates polynomial P(x) = sum_{i=0}^{n-1} coeffs[i] * x^i using Horner's method.
 *
 * @param {readonly bigint[]} coeffs
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
 * Deterministic xorshift64* PRNG returning signed BigInts up to `maxBits` bits.
 *
 * @param {bigint} seed
 * @param {number} count
 * @param {number} maxBits
 * @returns {bigint[]}
 */
function deterministicSignedBigInts(seed, count, maxBits) {
	let state = seed;
	const mask64 = (1n << 64n) - 1n;
	const next64 = () => {
		state ^= (state >> 12n) & mask64;
		state ^= (state << 25n) & mask64;
		state ^= (state >> 27n) & mask64;
		return (state * 0x2545f4914f6cdd1dn) & mask64;
	};
	const chunks = Math.max(1, Math.ceil(maxBits / 64));
	const bitMask = (1n << BigInt(maxBits)) - 1n;
	const arr = new Array(count);
	for (let i = 0; i < count; i++) {
		let val = 0n;
		for (let c = 0; c < chunks; c++) {
			val = (val << 64n) | next64();
		}
		val &= bitMask;
		const signBit = next64() & 1n;
		arr[i] = signBit === 1n ? -val : val;
	}
	return arr;
}

describe('convolutionBigIntSeries', () => {
	describe('normal cases', () => {
		it('computes basic polynomial / Cauchy product convolutions', () => {
			// (1 + 2x + 3x^2) * (4 + 5x) = 4 + 13x + 22x^2 + 15x^3
			assert.deepEqual(
				convolutionBigIntSeries([1n, 2n, 3n], [4n, 5n]),
				[4n, 13n, 22n, 15n],
			);

			// (1 - x) * (1 + x + x^2 + x^3) = 1 - x^4
			assert.deepEqual(
				convolutionBigIntSeries([1n, -1n], [1n, 1n, 1n, 1n]),
				[1n, 0n, 0n, 0n, -1n],
			);

			// (-2 + 3x - 5x^2) * (7 - 11x + 13x^2)
			assert.deepEqual(
				convolutionBigIntSeries([-2n, 3n, -5n], [7n, -11n, 13n]),
				[-14n, 43n, -94n, 94n, -65n],
			);
		});

		it('does not mutate input arrays and returns a fresh array', () => {
			const a = [1n, 2n, 3n];
			const b = [1n];
			const aCopy = [...a];
			const bCopy = [...b];
			const out = convolutionBigIntSeries(a, b);
			assert.deepEqual(out, [1n, 2n, 3n]);
			assert.notEqual(out, a);
			assert.notEqual(out, b);
			assert.deepEqual(a, aCopy);
			assert.deepEqual(b, bCopy);
		});
	});

	describe('edge cases', () => {
		it('returns [] when either or both input arrays are empty', () => {
			assert.deepEqual(convolutionBigIntSeries([], []), []);
			assert.deepEqual(convolutionBigIntSeries([], [1n, 2n, 3n]), []);
			assert.deepEqual(convolutionBigIntSeries([1n, 2n, 3n], []), []);
			assert.deepEqual(convolutionBigIntSeries([], [1n], { normalized: true }), []);
			assert.deepEqual(convolutionBigIntSeries([1n], [], { normalized: true }), []);
		});

		it('handles length-1 impulse [1n], [-1n], [0n], and arbitrary scalars', () => {
			const sig = [-10n, 0n, 42n, -99999999999999999999n, 7n];
			assert.deepEqual(convolutionBigIntSeries(sig, [1n]), sig);
			assert.deepEqual(convolutionBigIntSeries([1n], sig), sig);
			assert.deepEqual(
				convolutionBigIntSeries(sig, [-1n]),
				sig.map((x) => -x),
			);
			assert.deepEqual(
				convolutionBigIntSeries(sig, [0n]),
				[0n, 0n, 0n, 0n, 0n],
			);
			assert.deepEqual(convolutionBigIntSeries([-7n], [9n]), [-63n]);
			assert.deepEqual(convolutionBigIntSeries([0n], [0n]), [0n]);
		});

		it('handles all-zero sequences of arbitrary lengths', () => {
			assert.deepEqual(
				convolutionBigIntSeries([0n, 0n, 0n], [5n, -3n]),
				[0n, 0n, 0n, 0n],
			);
			assert.deepEqual(
				convolutionBigIntSeries([5n, -3n], [0n, 0n, 0n]),
				[0n, 0n, 0n, 0n],
			);
		});

		it('handles tight balanced-base signed boundaries where |c[n]| = 2^(W-1) - 1', () => {
			// maxA = 3, maxB = 1, L = 1 => cMax = 3, W = 3, B/2 = 4; coeffs hit ±3 = ±(B/2 - 1)
			const allNegThree = [-3n, -3n, -3n, -3n, -3n, -3n, -3n];
			assert.deepEqual(convolutionBigIntSeries(allNegThree, [1n]), allNegThree);
			assert.deepEqual(convolutionBigIntSeries(allNegThree, [-1n]), allNegThree.map((x) => -x));

			// Alternating ±1 where peak |c[n]| hits L = 4 (power of two boundary)
			const alt = [1n, -1n, 1n, -1n];
			assert.deepEqual(
				convolutionBigIntSeries(alt, alt),
				[1n, -2n, 3n, -4n, 3n, -2n, 1n],
			);

			// All -1s of length 8: peak hits -8 (exact power of two)
			const negOnes = new Array(8).fill(-1n);
			assert.deepEqual(
				convolutionBigIntSeries(negOnes, negOnes),
				naiveConvolution(negOnes, negOnes),
			);

			// Boundary at 2^k - 1 and 2^k
			const boundary = [-(2n ** 64n - 1n), 2n ** 64n - 1n, -(2n ** 64n), 2n ** 64n];
			assert.deepEqual(
				convolutionBigIntSeries(boundary, boundary),
				naiveConvolution(boundary, boundary),
			);
		});

		it('handles huge signed BigInts (> 2^128, > 2^256, > 2^512)', () => {
			const hugeA = [
				(1n << 200n) + 123456789012345678901234567890n,
				-((1n << 300n) - 98765432109876543210987654321n),
				0n,
				(1n << 520n) + 777n,
				-(1n << 129n),
			];
			const hugeB = [
				-((1n << 256n) + 1n),
				(1n << 512n) - 1n,
				-((1n << 160n) + 42n),
			];
			const actual = convolutionBigIntSeries(hugeA, hugeB);
			const expected = naiveConvolution(hugeA, hugeB);
			assert.deepEqual(actual, expected);
		});

		it('handles strongly asymmetric lengths', () => {
			const shortSeq = [-5n, 0n, 13n];
			const longSeq = deterministicSignedBigInts(0x123456789abcdef1n, 97, 140);

			assert.deepEqual(
				convolutionBigIntSeries(shortSeq, longSeq),
				naiveConvolution(shortSeq, longSeq),
			);
			assert.deepEqual(
				convolutionBigIntSeries(longSeq, shortSeq),
				naiveConvolution(longSeq, shortSeq),
			);
		});

		it('satisfies shift property for delayed impulse kernels', () => {
			const sig = [3n, -7n, 11n, -19n];
			const delay3 = [0n, 0n, 0n, 1n];
			assert.deepEqual(
				convolutionBigIntSeries(sig, delay3),
				[0n, 0n, 0n, 3n, -7n, 11n, -19n],
			);
		});
	});

	describe('normalized fixed-point mode (10^18 scale)', () => {
		const SCALE = 10n ** 18n;

		it('computes exact fixed-point normalized convolution with default 10^18 scale', () => {
			// [1, 2, 3] * [1, 1] = [1, 3, 5, 3], sum(b) = 2 => [0.5, 1.5, 2.5, 1.5] * 10^18
			assert.deepEqual(
				convolutionBigIntSeries([1n, 2n, 3n], [1n, 1n], { normalized: true }),
				[
					500000000000000000n,
					1500000000000000000n,
					2500000000000000000n,
					1500000000000000000n,
				],
			);

			// Non-terminating decimal with rounding half away from zero: [1, 2] / 3
			// [1, 1] * [1, 1, 1] = [1, 2, 2, 1], sum(b) = 3
			assert.deepEqual(
				convolutionBigIntSeries([1n, 1n], [1n, 1n, 1n], { normalized: true }),
				[
					333333333333333333n,
					666666666666666667n,
					666666666666666667n,
					333333333333333333n,
				],
			);
		});

		it('preserves constant signals in the interior and handles negative kernel sums symmetrically', () => {
			const c = 42n;
			const constantSig = [c, c, c, c, c];
			const kernel = [1n, 4n, 6n, 4n, 1n]; // sum = 16
			const norm = convolutionBigIntSeries(constantSig, kernel, { normalized: true });
			// Interior index 4 has full kernel overlap => exact c * 10^18
			assert.equal(norm[4], c * SCALE);

			// Negating kernel negates both numerator and denominator => identical result
			const negKernel = kernel.map((x) => -x);
			assert.deepEqual(
				convolutionBigIntSeries(constantSig, negKernel, { normalized: true }),
				norm,
			);

			// Negating signal negates normalized output symmetrically (odd symmetry)
			const negSig = constantSig.map((x) => -x);
			assert.deepEqual(
				convolutionBigIntSeries(negSig, kernel, { normalized: true }),
				norm.map((x) => -x),
			);
		});

		it('supports custom fixed-point scale and rounds exact midpoints away from zero', () => {
			// Exact midpoints: ±1 / 2 with scale = 1n => ±1n; ±3 / 2 with scale = 1n => ±2n
			assert.deepEqual(
				convolutionBigIntSeries([1n, -1n, 3n, -3n], [2n], {
					normalized: true,
					scale: 1n,
				}),
				[1n, -1n, 3n, -3n],
			);
			assert.deepEqual(
				convolutionBigIntSeries([1n, -1n, 3n, -3n], [1n, 1n], {
					normalized: true,
					scale: 1n,
				}),
				// exact conv = [1, 0, 2, 0, -3], / 2 => [0.5, 0, 1, 0, -1.5] => [1, 0, 1, 0, -2]
				[1n, 0n, 1n, 0n, -2n],
			);
		});
	});

	describe('algebraic identities and cross-checks', () => {
		it('satisfies polynomial evaluation identity P(x) * Q(x) === (P * Q)(x) across multiple x values', () => {
			const p = deterministicSignedBigInts(0xabcdef0123456789n, 37, 150);
			const q = deterministicSignedBigInts(0x9876543210fedcban, 53, 150);
			const pq = convolutionBigIntSeries(p, q);

			const testPoints = [
				0n,
				1n,
				-1n,
				2n,
				-2n,
				3n,
				-7n,
				10n,
				-101n,
				1000003n,
				-(1n << 64n) + 17n,
			];
			for (const x of testPoints) {
				assert.equal(evalPoly(pq, x), evalPoly(p, x) * evalPoly(q, x));
			}
		});

		it('matches naive O(N*M) reference across diverse random signed shapes and sizes', () => {
			const cases = [
				[1, 1, 10],
				[2, 2, 16],
				[3, 5, 32],
				[16, 16, 64],
				[31, 47, 128],
				[64, 64, 200],
				[120, 85, 256],
			];
			let seed = 0xfeedfacecafebeefn;
			for (const [n, m, bits] of cases) {
				const a = deterministicSignedBigInts(seed, n, bits);
				seed += 0x10001n;
				const b = deterministicSignedBigInts(seed, m, bits);
				seed += 0x20003n;
				assert.deepEqual(convolutionBigIntSeries(a, b), naiveConvolution(a, b));
			}
		});

		it('satisfies commutativity, associativity, and distributivity', () => {
			const a = deterministicSignedBigInts(0x1111222233334444n, 19, 130);
			const b = deterministicSignedBigInts(0x5555666677778888n, 23, 130);
			const c = deterministicSignedBigInts(0x9999aaaabbbbccccn, 23, 130);

			// Commutativity: a * b === b * a
			assert.deepEqual(
				convolutionBigIntSeries(a, b),
				convolutionBigIntSeries(b, a),
			);

			// Associativity: (a * b) * c === a * (b * c)
			assert.deepEqual(
				convolutionBigIntSeries(convolutionBigIntSeries(a, b), c),
				convolutionBigIntSeries(a, convolutionBigIntSeries(b, c)),
			);

			// Distributivity: a * (b + c) === (a * b) + (a * c)
			const bPlusC = b.map((v, i) => v + c[i]);
			const lhs = convolutionBigIntSeries(a, bPlusC);
			const ab = convolutionBigIntSeries(a, b);
			const ac = convolutionBigIntSeries(a, c);
			const rhs = ab.map((v, i) => v + ac[i]);
			assert.deepEqual(lhs, rhs);
		});

		it('generates exact Pascal triangle binomial coefficients by repeated convolution of [1n, 1n]', () => {
			let poly = [1n];
			for (let row = 1; row <= 30; row++) {
				poly = convolutionBigIntSeries(poly, [1n, 1n]);
			}
			// Verify C(30, k) directly
			assert.equal(poly.length, 31);
			let binom = 1n;
			for (let k = 0; k <= 30; k++) {
				assert.equal(poly[k], binom);
				binom = (binom * BigInt(30 - k)) / BigInt(k + 1);
			}
		});
	});

	describe('input validation', () => {
		it('throws TypeError when a or b is not an Array', () => {
			const invalidContainers = [
				null,
				undefined,
				42,
				42n,
				'123',
				{ 0: 1n, length: 1 },
				new BigInt64Array([1n, 2n]),
			];
			for (const bad of invalidContainers) {
				assert.throws(() => convolutionBigIntSeries(bad, [1n]), TypeError);
				assert.throws(() => convolutionBigIntSeries([1n], bad), TypeError);
			}
		});

		it('throws TypeError when any element of a or b is not a BigInt (including holes and empty-other cases)', () => {
			const badElements = [0, 1, -5, 1.5, NaN, Infinity, '1', null, undefined, {}, true];
			for (const bad of badElements) {
				assert.throws(() => convolutionBigIntSeries([1n, bad], [1n]), TypeError);
				assert.throws(() => convolutionBigIntSeries([1n], [1n, bad]), TypeError);
				// Validation must occur even when the other array is empty
				assert.throws(() => convolutionBigIntSeries([], [bad]), TypeError);
				assert.throws(() => convolutionBigIntSeries([bad], []), TypeError);
			}

			// Sparse array with hole
			const sparse = new Array(3);
			sparse[0] = 1n;
			sparse[2] = 2n;
			assert.throws(() => convolutionBigIntSeries(sparse, [1n]), TypeError);
		});

		it('validates options thoroughly', () => {
			assert.throws(() => convolutionBigIntSeries([1n], [1n], null), TypeError);
			assert.throws(() => convolutionBigIntSeries([1n], [1n], []), TypeError);
			assert.throws(() => convolutionBigIntSeries([1n], [1n], 'normalized'), TypeError);
			assert.throws(
				() => convolutionBigIntSeries([1n], [1n], { normalized: 'yes' }),
				TypeError,
			);
			assert.throws(
				() => convolutionBigIntSeries([1n], [1n], { scale: 1000 }),
				TypeError,
			);
			assert.throws(
				() => convolutionBigIntSeries([1n], [1n], { scale: 0n }),
				RangeError,
			);
			assert.throws(
				() => convolutionBigIntSeries([1n], [1n], { scale: -10n }),
				RangeError,
			);
			assert.throws(
				() => convolutionBigIntSeries([1n, 2n], [1n, -1n], { normalized: true }),
				RangeError,
			);
			assert.throws(
				() => convolutionBigIntSeries([1n, 2n], [0n, 0n], { normalized: true }),
				RangeError,
			);
		});
	});
});
