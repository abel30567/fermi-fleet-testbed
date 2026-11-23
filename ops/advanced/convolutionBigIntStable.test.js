import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { convolutionBigIntStable, FIXED_POINT_SCALE } from './convolutionBigIntStable.js';

/**
 * Independent helper: evaluate polynomial coeffs[0] + coeffs[1]*x + ... via Horner's method.
 */
function evalPolyBigInt(coeffs, x) {
	let acc = 0n;
	for (let i = coeffs.length - 1; i >= 0; i--) {
		acc = acc * x + coeffs[i];
	}
	return acc;
}

/**
 * Independent helper: Kronecker substitution convolution for non-negative BigInt sequences.
 * Packs arrays into base-B BigInts, performs a single BigInt multiply, and unpacks digits.
 */
function kroneckerConvolveNonNegative(a, b) {
	if (a.length === 0 || b.length === 0) return [];
	let maxA = 0n;
	let maxB = 0n;
	for (const v of a) if (v > maxA) maxA = v;
	for (const v of b) if (v > maxB) maxB = v;
	const maxCoeff = maxA * maxB * BigInt(Math.min(a.length, b.length)) + 1n;
	// Choose a power-of-two base strictly greater than maxCoeff
	const bitLen = BigInt(maxCoeff.toString(2).length + 1);
	const mask = (1n << bitLen) - 1n;

	let packedA = 0n;
	for (let i = a.length - 1; i >= 0; i--) {
		packedA = (packedA << bitLen) | a[i];
	}
	let packedB = 0n;
	for (let j = b.length - 1; j >= 0; j--) {
		packedB = (packedB << bitLen) | b[j];
	}

	let product = packedA * packedB;
	const outLen = a.length + b.length - 1;
	const out = new Array(outLen);
	for (let k = 0; k < outLen; k++) {
		out[k] = product & mask;
		product >>= bitLen;
	}
	return out;
}

describe('convolutionBigIntStable', () => {
	describe('normal exact integer cases', () => {
		it('computes basic full linear convolution', () => {
			assert.deepEqual(
				convolutionBigIntStable([1n, 2n, 3n], [4n, 5n]),
				[4n, 13n, 22n, 15n]
			);
		});

		it('handles negative and mixed-sign sequences', () => {
			assert.deepEqual(
				convolutionBigIntStable([3n, -2n, 5n], [-1n, 4n, -6n]),
				[-3n, 14n, -31n, 32n, -30n]
			);
		});

		it('satisfies impulse identity and shift property', () => {
			const sig = [7n, -3n, 0n, 11n, 42n];
			assert.deepEqual(convolutionBigIntStable(sig, [1n]), sig);
			assert.deepEqual(convolutionBigIntStable(sig, [0n, 0n, 1n]), [0n, 0n, ...sig]);
		});

		it('satisfies commutativity, associativity, and distributivity', () => {
			const a = [2n, -5n, 8n, 1n];
			const b = [-3n, 7n, 4n];
			const c = [9n, -1n, 6n, -2n];

			// Commutativity
			assert.deepEqual(convolutionBigIntStable(a, b), convolutionBigIntStable(b, a));

			// Associativity: (a * b) * c == a * (b * c)
			const leftAssoc = convolutionBigIntStable(convolutionBigIntStable(a, b), c);
			const rightAssoc = convolutionBigIntStable(a, convolutionBigIntStable(b, c));
			assert.deepEqual(leftAssoc, rightAssoc);

			// Distributivity: a * (b + d) == (a * b) + (a * d)
			const d = [4n, 2n, -9n];
			const bPlusD = b.map((v, i) => v + d[i]);
			const lhs = convolutionBigIntStable(a, bPlusD);
			const ab = convolutionBigIntStable(a, b);
			const ad = convolutionBigIntStable(a, d);
			const rhs = ab.map((v, i) => v + ad[i]);
			assert.deepEqual(lhs, rhs);
		});
	});

	describe('edge cases and numerical robustness', () => {
		it('handles empty inputs', () => {
			assert.deepEqual(convolutionBigIntStable([], [1n, 2n]), []);
			assert.deepEqual(convolutionBigIntStable([1n, 2n], []), []);
			assert.deepEqual(convolutionBigIntStable([], []), []);
		});

		it('handles single-element and all-zero arrays', () => {
			assert.deepEqual(convolutionBigIntStable([7n], [-6n]), [-42n]);
			assert.deepEqual(convolutionBigIntStable([0n, 0n, 0n], [5n, -3n]), [0n, 0n, 0n, 0n]);
			assert.deepEqual(convolutionBigIntStable([5n, -3n], [0n, 0n]), [0n, 0n, 0n]);
		});

		it('handles huge arbitrary-precision values and power-of-two prescaling exactly', () => {
			const shift = 1n << 200n;
			const a = [3n * shift, -5n * shift, 7n * shift];
			const b = [-2n * shift, 4n * shift];
			const expected = [-6n, 22n, -34n, 28n].map((v) => v * shift * shift);
			assert.deepEqual(convolutionBigIntStable(a, b), expected);
		});

		it('survives extreme catastrophic cancellation without precision loss', () => {
			const huge = 10n ** 60n;
			// At k = 2: huge*1 + 1*1 + (-huge)*1 === 1n (IEEE-754 float64 would return 0)
			const a = [huge, 1n, -huge];
			const b = [1n, 1n, 1n];
			assert.deepEqual(
				convolutionBigIntStable(a, b),
				[huge, huge + 1n, 1n, 1n - huge, -huge]
			);
		});
	});

	describe('convolution modes', () => {
		const a = [1n, 2n, 3n, 4n];
		const b = [10n, 20n, 30n];
		// full = [10, 40, 100, 160, 170, 120]

		it('supports same mode', () => {
			assert.deepEqual(
				convolutionBigIntStable(a, b, { mode: 'same' }),
				[40n, 100n, 160n, 170n]
			);
			// Even-length kernel: full([1,2,3], [4,5]) = [4,13,22,15], offset = floor((2-1)/2) = 0
			assert.deepEqual(
				convolutionBigIntStable([1n, 2n, 3n], [4n, 5n], { mode: 'same' }),
				[4n, 13n, 22n]
			);
		});

		it('supports valid mode symmetrically for m >= n and m < n', () => {
			assert.deepEqual(
				convolutionBigIntStable(a, b, { mode: 'valid' }),
				[100n, 160n]
			);
			assert.deepEqual(
				convolutionBigIntStable(b, a, { mode: 'valid' }),
				[100n, 160n]
			);
		});

		it('supports circular mode with default and custom lengths', () => {
			// full = [10, 40, 100, 160, 170, 120], folded mod 4 => [10+170, 40+120, 100, 160]
			assert.deepEqual(
				convolutionBigIntStable(a, b, { mode: 'circular' }),
				[180n, 160n, 100n, 160n]
			);
			// folded mod 3 => [10+160, 40+170, 100+120] = [170, 210, 220]
			assert.deepEqual(
				convolutionBigIntStable(a, b, { mode: 'circular', circularLength: 3 }),
				[170n, 210n, 220n]
			);
			// circularLength >= fullLen matches zero-padded full convolution
			assert.deepEqual(
				convolutionBigIntStable(a, b, { mode: 'circular', circularLength: 7 }),
				[10n, 40n, 100n, 160n, 170n, 120n, 0n]
			);
		});
	});

	describe('fixed-point (10^18) and normalized modes', () => {
		const S = FIXED_POINT_SCALE;

		it('computes exact fixed-point convolution scaled by 10^18', () => {
			// [0.5, 1.5] * [2.0, -0.5] = [1.0, 2.75, -0.75]
			const a = [S / 2n, (3n * S) / 2n];
			const b = [2n * S, -(S / 2n)];
			assert.deepEqual(
				convolutionBigIntStable(a, b, { fixedPoint: true }),
				[S, (11n * S) / 4n, -(3n * S) / 4n]
			);
		});

		it('applies unbiased round-half-to-even on exact half-ULP ties', () => {
			// scale = 2n: products 1, 3, 5, 7 divided by 2 -> 0.5->0, 1.5->2, 2.5->2, 3.5->4
			assert.deepEqual(
				convolutionBigIntStable([1n, 3n, 5n, 7n], [1n], { fixedPoint: true, scale: 2n }),
				[0n, 2n, 2n, 4n]
			);
			// Negative ties: -0.5->0, -1.5->-2, -2.5->-2, -3.5->-4
			assert.deepEqual(
				convolutionBigIntStable([-1n, -3n, -5n, -7n], [1n], { fixedPoint: true, scale: 2n }),
				[0n, -2n, -2n, -4n]
			);
		});

		it('avoids cumulative rounding drift via full-precision accumulation before single rounding', () => {
			// 100 terms each contributing 0.4 ULP (4n with scale 10n):
			// Naive per-term rounding rounds every term to 0n (total error = 40 ULPs).
			// Full-precision accumulation sums to 400n, then divides once by 10n -> exact 40n.
			const len = 100;
			const a = new Array(len).fill(2n);
			const b = new Array(len).fill(2n);
			const out = convolutionBigIntStable(a, b, { fixedPoint: true, scale: 10n });
			// Center peak at k = len - 1 has 100 overlapping products of 2*2 = 4 => 400 / 10 = 40n
			assert.equal(out[len - 1], 40n);
		});

		it('computes normalized convolution returning fixed-point BigInts scaled by 10^18', () => {
			// Integer inputs with kernel [1, 1, 1] (sum = 3):
			// full = [1, 3, 6, 5, 3]; divided by 3 scaled by 10^18:
			const out = convolutionBigIntStable([1n, 2n, 3n], [1n, 1n, 1n], { normalize: true });
			assert.deepEqual(out, [
				333333333333333333n,
				S,
				2n * S,
				1666666666666666667n,
				S,
			]);
		});

		it('combines fixedPoint and normalize cleanly at 10^18 scale', () => {
			// [3.0] * [2.0, 2.0] normalized by sum(b)=4.0 => [1.5, 1.5]
			const out = convolutionBigIntStable([3n * S], [2n * S, 2n * S], {
				fixedPoint: true,
				normalize: true,
			});
			assert.deepEqual(out, [(3n * S) / 2n, (3n * S) / 2n]);
		});
	});

	describe('independent cross-checks', () => {
		it('matches polynomial multiplication identity P_{a*b}(x) === P_a(x) * P_b(x)', () => {
			const a = [17n, -42n, 0n, 99999999999999999999n, -12345678901234567890n, 5n];
			const b = [-8n, 31n, -77777777777777777777n, 64n, -3n];
			const c = convolutionBigIntStable(a, b);

			const testPoints = [-1000003n, -7n, -1n, 0n, 1n, 2n, 10n, 987654321n];
			for (const x of testPoints) {
				assert.equal(
					evalPolyBigInt(c, x),
					evalPolyBigInt(a, x) * evalPolyBigInt(b, x),
					`Polynomial evaluation mismatch at x = ${x}`
				);
			}
		});

		it('matches independent Kronecker substitution convolution on non-negative BigInts', () => {
			const a = [0n, 123456789012345678901234n, 9876543210987654321n, 42n, 1n << 128n, 7n];
			const b = [55555555555555555555n, 0n, 1n << 96n, 314159265358979323846n];
			assert.deepEqual(
				convolutionBigIntStable(a, b),
				kroneckerConvolveNonNegative(a, b)
			);
		});

		it('matches explicit circulant matrix-vector product in circular mode', () => {
			const a = [11n, -4n, 7n, -2n, 9n];
			const b = [-3n, 5n, -8n, 6n, 1n];
			const L = a.length;
			const expected = new Array(L).fill(0n);
			for (let k = 0; k < L; k++) {
				for (let j = 0; j < L; j++) {
					const i = (k - j + L) % L;
					expected[k] += a[i] * b[j];
				}
			}
			assert.deepEqual(convolutionBigIntStable(a, b, { mode: 'circular' }), expected);
		});

		it('satisfies exact <= 0.5 ULP error bound against exact rational arithmetic', () => {
			const a = [1234567890123456789n, -9876543210987654321n, 555555555555555555n, 42n];
			const b = [777777777777777777n, 333333333333333333n, -111111111111111111n];
			const exactFull = convolutionBigIntStable(a, b);
			const fpOut = convolutionBigIntStable(a, b, { fixedPoint: true });

			// Verify |fpOut[k] - exactFull[k] / S| <= 0.5  <=>  |2*fpOut[k]*S - 2*exactFull[k]| <= S
			for (let k = 0; k < exactFull.length; k++) {
				const diff = 2n * fpOut[k] * FIXED_POINT_SCALE - 2n * exactFull[k];
				const absDiff = diff < 0n ? -diff : diff;
				assert.ok(
					absDiff <= FIXED_POINT_SCALE,
					`Index ${k} exceeded 0.5 ULP bound: absDiff=${absDiff}`
				);
			}
		});
	});

	describe('input validation', () => {
		it('rejects non-array or non-BigInt sequence inputs', () => {
			assert.throws(() => convolutionBigIntStable(null, [1n]), TypeError);
			assert.throws(() => convolutionBigIntStable([1n], '123'), TypeError);
			assert.throws(() => convolutionBigIntStable([1, 2n], [1n]), TypeError);
			assert.throws(() => convolutionBigIntStable([1n], [1n, null]), TypeError);
			assert.throws(() => convolutionBigIntStable([1n], [NaN]), TypeError);
		});

		it('rejects invalid options and zero-sum normalized kernels', () => {
			assert.throws(() => convolutionBigIntStable([1n], [1n], null), TypeError);
			assert.throws(() => convolutionBigIntStable([1n], [1n], []), TypeError);
			assert.throws(() => convolutionBigIntStable([1n], [1n], { mode: 'invalid' }), RangeError);
			assert.throws(() => convolutionBigIntStable([1n], [1n], { fixedPoint: 1 }), TypeError);
			assert.throws(() => convolutionBigIntStable([1n], [1n], { normalize: 'yes' }), TypeError);
			assert.throws(() => convolutionBigIntStable([1n], [1n], { scale: 100 }), TypeError);
			assert.throws(() => convolutionBigIntStable([1n], [1n], { scale: 0n }), RangeError);
			assert.throws(() => convolutionBigIntStable([1n], [1n], { scale: -10n }), RangeError);
			assert.throws(
				() => convolutionBigIntStable([1n], [1n], { mode: 'circular', circularLength: 0 }),
				RangeError
			);
			assert.throws(
				() => convolutionBigIntStable([1n], [1n], { mode: 'circular', circularLength: 1.5 }),
				RangeError
			);
			assert.throws(
				() => convolutionBigIntStable([1n, 2n], [1n, -1n], { normalize: true }),
				RangeError
			);
			assert.throws(
				() => convolutionBigIntStable([1n, 2n], [0n, 0n], { normalize: true }),
				RangeError
			);
		});
	});
});
