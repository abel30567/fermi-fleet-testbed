import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { traceComplexRecursive } from './traceComplexRecursive.js';

/**
 * Helper to create a complex number `{ re, im }`.
 *
 * @param {number} re
 * @param {number} im
 * @returns {{ re: number, im: number }}
 */
function c(re, im = 0) {
	return { re, im };
}

/**
 * Asserts two complex numbers are approximately equal within `eps`.
 *
 * @param {{ re: number, im: number }} actual
 * @param {{ re: number, im: number }} expected
 * @param {number} [eps=1e-10]
 */
function assertComplexClose(actual, expected, eps = 1e-10) {
	assert.ok(
		Math.abs(actual.re - expected.re) <= eps,
		`Real part mismatch: expected ${expected.re}, got ${actual.re}`
	);
	assert.ok(
		Math.abs(actual.im - expected.im) <= eps,
		`Imaginary part mismatch: expected ${expected.im}, got ${actual.im}`
	);
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible cross-check tests.
 *
 * @param {number} seed
 * @returns {() => number}
 */
function createRng(seed) {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * Generates an `n x n` matrix of deterministic complex numbers in `[-10, 10]`.
 *
 * @param {number} n
 * @param {() => number} rng
 */
function randomComplexMatrix(n, rng) {
	const m = [];
	for (let i = 0; i < n; i++) {
		const row = [];
		for (let j = 0; j < n; j++) {
			row.push({
				re: Math.round((rng() * 20 - 10) * 100) / 100,
				im: Math.round((rng() * 20 - 10) * 100) / 100,
			});
		}
		m.push(row);
	}
	return m;
}

/**
 * Independent complex multiplication helper.
 */
function cmul(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	};
}

/**
 * Independent complex addition helper.
 */
function cadd(a, b) {
	return { re: a.re + b.re, im: a.im + b.im };
}

/**
 * Independent naive matrix multiplication over complex numbers.
 */
function matMulComplex(A, B) {
	const n = A.length;
	const out = [];
	for (let i = 0; i < n; i++) {
		const row = [];
		for (let j = 0; j < n; j++) {
			let sum = c(0, 0);
			for (let k = 0; k < n; k++) {
				sum = cadd(sum, cmul(A[i][k], B[k][j]));
			}
			row.push(sum);
		}
		out.push(row);
	}
	return out;
}

describe('traceComplexRecursive', () => {
	describe('normal cases', () => {
		it('computes trace of a 1x1 complex matrix', () => {
			assert.deepStrictEqual(traceComplexRecursive([[c(3.5, -2.25)]]), {
				re: 3.5,
				im: -2.25,
			});
		});

		it('computes trace of a 2x2 complex matrix', () => {
			const m = [
				[c(1, 2), c(99, -88)],
				[c(-77, 66), c(3, -5)],
			];
			assert.deepStrictEqual(traceComplexRecursive(m), { re: 4, im: -3 });
		});

		it('computes trace of a 3x3 (odd dimension) complex matrix', () => {
			const m = [
				[c(2, 1), c(5, 5), c(0, -1)],
				[c(-3, 4), c(-1, 3), c(7, 2)],
				[c(8, -2), c(1, 1), c(4, -6)],
			];
			assert.deepStrictEqual(traceComplexRecursive(m), { re: 5, im: -2 });
		});

		it('computes trace of a 4x4 (power-of-two) complex matrix', () => {
			const m = [
				[c(1, 1), c(0, 0), c(2, 3), c(4, 5)],
				[c(6, 7), c(2, -1), c(8, 9), c(1, 0)],
				[c(2, 2), c(3, 3), c(-3, 4), c(5, 5)],
				[c(9, 8), c(7, 6), c(5, 4), c(10, -2)],
			];
			assert.deepStrictEqual(traceComplexRecursive(m), { re: 10, im: 2 });
		});

		it('handles purely real and purely imaginary diagonal entries', () => {
			const purelyReal = [
				[c(2, 0), c(1, 5)],
				[c(3, -2), c(-7, 0)],
			];
			assert.deepStrictEqual(traceComplexRecursive(purelyReal), {
				re: -5,
				im: 0,
			});

			const purelyImag = [
				[c(0, 4), c(9, 1)],
				[c(-2, 3), c(0, -9)],
			];
			assert.deepStrictEqual(traceComplexRecursive(purelyImag), {
				re: 0,
				im: -5,
			});
		});

		it('computes trace of complex identity and zero matrices', () => {
			const id3 = [
				[c(1, 0), c(0, 0), c(0, 0)],
				[c(0, 0), c(1, 0), c(0, 0)],
				[c(0, 0), c(0, 0), c(1, 0)],
			];
			assert.deepStrictEqual(traceComplexRecursive(id3), { re: 3, im: 0 });

			const zero2 = [
				[c(0, 0), c(0, 0)],
				[c(0, 0), c(0, 0)],
			];
			assert.deepStrictEqual(traceComplexRecursive(zero2), { re: 0, im: 0 });
		});
	});

	describe('edge cases', () => {
		it('returns { re: 0, im: 0 } for an empty 0x0 matrix', () => {
			assert.deepStrictEqual(traceComplexRecursive([]), { re: 0, im: 0 });
		});

		it('normalizes negative zero components to positive zero', () => {
			const res1 = traceComplexRecursive([[c(-0, -0)]]);
			assert.strictEqual(Object.is(res1.re, 0), true);
			assert.strictEqual(Object.is(res1.im, 0), true);

			const res2 = traceComplexRecursive([
				[c(-0, 1), c(0, 0)],
				[c(0, 0), c(-0, -1)],
			]);
			assert.strictEqual(Object.is(res2.re, 0), true);
			assert.strictEqual(Object.is(res2.im, 0), true);
		});

		it('handles exact additive cancellation to zero', () => {
			const m = [
				[c(12.5, -7.25), c(1, 1), c(2, 2)],
				[c(3, 3), c(-5.5, 2.25), c(4, 4)],
				[c(5, 5), c(6, 6), c(-7, 5)],
			];
			assert.deepStrictEqual(traceComplexRecursive(m), { re: 0, im: 0 });
		});

		it('returns a fresh object and does not mutate the input matrix', () => {
			const entry = c(4, -9);
			const m = [[entry]];
			const snapshot = structuredClone(m);
			const result = traceComplexRecursive(m);

			assert.notStrictEqual(result, entry);
			result.re = 999;
			assert.deepStrictEqual(m, snapshot);
		});

		it('ignores arbitrary finite off-diagonal entries', () => {
			const m1 = [
				[c(1, 2), c(1e100, -1e100)],
				[c(-1e100, 1e100), c(3, 4)],
			];
			const m2 = [
				[c(1, 2), c(0, 0)],
				[c(0, 0), c(3, 4)],
			];
			assert.deepStrictEqual(
				traceComplexRecursive(m1),
				traceComplexRecursive(m2)
			);
		});

		it('handles larger matrices without call-stack overflow (O(log n) recursion depth)', () => {
			const n = 257;
			const m = Array.from({ length: n }, (_, i) =>
				Array.from({ length: n }, (_, j) =>
					i === j ? c(i + 1, -(i + 1)) : c(0, 0)
				)
			);
			const expectedSum = (n * (n + 1)) / 2;
			assert.deepStrictEqual(traceComplexRecursive(m), {
				re: expectedSum,
				im: -expectedSum,
			});
		});
	});

	describe('invalid input errors', () => {
		it('throws TypeError when matrix is not an array', () => {
			for (const bad of [null, undefined, 42, 'matrix', { re: 1, im: 0 }, true]) {
				assert.throws(() => traceComplexRecursive(bad), TypeError);
			}
		});

		it('throws TypeError when any row is not an array', () => {
			assert.throws(() => traceComplexRecursive([c(1, 0)]), TypeError);
			assert.throws(
				() => traceComplexRecursive([[c(1, 0), c(0, 0)], null]),
				TypeError
			);
		});

		it('throws RangeError for non-square or ragged matrices', () => {
			// 1x2
			assert.throws(
				() => traceComplexRecursive([[c(1, 0), c(2, 0)]]),
				RangeError
			);
			// 2x1
			assert.throws(
				() => traceComplexRecursive([[c(1, 0)], [c(2, 0)]]),
				RangeError
			);
			// ragged 2x?
			assert.throws(
				() => traceComplexRecursive([[c(1, 0), c(2, 0)], [c(3, 0)]]),
				RangeError
			);
		});

		it('throws TypeError for invalid complex element shapes or non-numeric fields', () => {
			const invalidElements = [
				null,
				undefined,
				5,
				'1+2i',
				[1, 2],
				{ re: 1 },
				{ im: 2 },
				{ re: '1', im: 2 },
				{ re: 1, im: null },
				{},
			];
			for (const bad of invalidElements) {
				assert.throws(() => traceComplexRecursive([[bad]]), TypeError);
			}
		});

		it('throws RangeError for non-finite values on or off the diagonal', () => {
			const nonFinite = [
				c(NaN, 0),
				c(0, NaN),
				c(Infinity, 0),
				c(0, -Infinity),
			];
			for (const bad of nonFinite) {
				// On diagonal
				assert.throws(() => traceComplexRecursive([[bad]]), RangeError);
				// Off diagonal
				assert.throws(
					() =>
						traceComplexRecursive([
							[c(1, 0), bad],
							[c(0, 0), c(2, 0)],
						]),
					RangeError
				);
			}
		});
	});

	describe('independent cross-checks', () => {
		it('matches independent iterative summation across sizes 1..25', () => {
			const rng = createRng(0x5eed1234);
			for (let n = 1; n <= 25; n++) {
				const m = randomComplexMatrix(n, rng);

				let expectedRe = 0;
				let expectedIm = 0;
				for (let i = 0; i < n; i++) {
					expectedRe += m[i][i].re;
					expectedIm += m[i][i].im;
				}

				const actual = traceComplexRecursive(m);
				assertComplexClose(actual, { re: expectedRe, im: expectedIm }, 1e-12);
			}
		});

		it('satisfies algebraic identities: linearity, transpose, conjugate transpose, and cyclicity tr(AB) = tr(BA)', () => {
			const rng = createRng(0xabcdef01);
			const n = 7;
			const A = randomComplexMatrix(n, rng);
			const B = randomComplexMatrix(n, rng);
			const alpha = c(2.5, -1.25);
			const beta = c(-0.75, 3.0);

			// 1. Linearity: tr(alpha * A + beta * B) = alpha * tr(A) + beta * tr(B)
			const combined = A.map((row, i) =>
				row.map((val, j) => cadd(cmul(alpha, val), cmul(beta, B[i][j])))
			);
			const lhsLinear = traceComplexRecursive(combined);
			const rhsLinear = cadd(
				cmul(alpha, traceComplexRecursive(A)),
				cmul(beta, traceComplexRecursive(B))
			);
			assertComplexClose(lhsLinear, rhsLinear, 1e-10);

			// 2. Transpose invariance: tr(A^T) = tr(A)
			const AT = Array.from({ length: n }, (_, i) =>
				Array.from({ length: n }, (_, j) => A[j][i])
			);
			assertComplexClose(
				traceComplexRecursive(AT),
				traceComplexRecursive(A),
				1e-12
			);

			// 3. Hermitian adjoint (conjugate transpose): tr(A^H) = conj(tr(A))
			const AH = Array.from({ length: n }, (_, i) =>
				Array.from({ length: n }, (_, j) => c(A[j][i].re, -A[j][i].im))
			);
			const trA = traceComplexRecursive(A);
			assertComplexClose(
				traceComplexRecursive(AH),
				{ re: trA.re, im: -trA.im },
				1e-12
			);

			// 4. Cyclic property: tr(A * B) = tr(B * A)
			const trAB = traceComplexRecursive(matMulComplex(A, B));
			const trBA = traceComplexRecursive(matMulComplex(B, A));
			assertComplexClose(trAB, trBA, 1e-9);
		});
	});
});
