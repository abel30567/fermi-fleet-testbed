import { describe, it } from 'node:test'
import assert from 'node:assert'
import { transposeComplexStable } from './transposeComplexStable.js'

/**
 * Independent helper: complex multiplication (a * b).
 * @param {{ re: number, im: number }} a
 * @param {{ re: number, im: number }} b
 */
function complexMul(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	}
}

/**
 * Independent helper: complex matrix multiplication using Neumaier compensated
 * summation for real and imaginary parts.
 * @param {{ re: number, im: number }[][]} A
 * @param {{ re: number, im: number }[][]} B
 */
function matMulComplex(A, B) {
	const m = A.length
	const k = A[0].length
	const n = B[0].length
	const C = Array.from({ length: m }, () => new Array(n))
	for (let i = 0; i < m; i++) {
		for (let j = 0; j < n; j++) {
			let reSum = 0
			let reComp = 0
			let imSum = 0
			let imComp = 0
			for (let p = 0; p < k; p++) {
				const prod = complexMul(A[i][p], B[p][j])
				const reT = reSum + prod.re
				reComp += Math.abs(reSum) >= Math.abs(prod.re)
					? (reSum - reT) + prod.re
					: (prod.re - reT) + reSum
				reSum = reT

				const imT = imSum + prod.im
				imComp += Math.abs(imSum) >= Math.abs(prod.im)
					? (imSum - imT) + prod.im
					: (prod.im - imT) + imSum
				imSum = imT
			}
			C[i][j] = {
				re: reSum + reComp === 0 ? 0 : reSum + reComp,
				im: imSum + imComp === 0 ? 0 : imSum + imComp,
			}
		}
	}
	return C
}

/**
 * Independent helper: overflow/underflow-safe scaled Frobenius norm using
 * two-pass max-scaling and Neumaier summation.
 * Returns `{ scale, scaledNorm }` so even matrices with `Number.MAX_VALUE`
 * or `Number.MIN_VALUE` entries can be compared without overflow/underflow.
 * @param {{ re: number, im: number }[][]} A
 */
function scaledFrobeniusNorm(A) {
	let scale = 0
	for (const row of A) {
		for (const { re, im } of row) {
			const aRe = Math.abs(re)
			const aIm = Math.abs(im)
			if (aRe > scale) scale = aRe
			if (aIm > scale) scale = aIm
		}
	}
	if (scale === 0) {
		return { scale: 0, scaledNorm: 0 }
	}
	let sum = 0
	let comp = 0
	for (const row of A) {
		for (const { re, im } of row) {
			const sr = re / scale
			const si = im / scale
			for (const term of [sr * sr, si * si]) {
				const t = sum + term
				comp += Math.abs(sum) >= Math.abs(term)
					? (sum - t) + term
					: (term - t) + sum
				sum = t
			}
		}
	}
	return { scale, scaledNorm: Math.sqrt(sum + comp) }
}

/**
 * Deeply asserts two complex matrices are equal within tolerance `tol`.
 */
function assertMatrixClose(actual, expected, tol = 1e-12) {
	assert.strictEqual(actual.length, expected.length)
	for (let i = 0; i < expected.length; i++) {
		assert.strictEqual(actual[i].length, expected[i].length)
		for (let j = 0; j < expected[i].length; j++) {
			assert.ok(
				Math.abs(actual[i][j].re - expected[i][j].re) <= tol,
				`re mismatch at [${i}][${j}]: ${actual[i][j].re} vs ${expected[i][j].re}`,
			)
			assert.ok(
				Math.abs(actual[i][j].im - expected[i][j].im) <= tol,
				`im mismatch at [${i}][${j}]: ${actual[i][j].im} vs ${expected[i][j].im}`,
			)
		}
	}
}

describe('transposeComplexStable', () => {
	describe('normal cases', () => {
		it('transposes a square complex matrix (plain and conjugate)', () => {
			const A = [
				[{ re: 1, im: 2 }, { re: 3, im: -4 }],
				[{ re: -5, im: 6 }, { re: 7, im: 0 }],
			]

			const AT = transposeComplexStable(A)
			assert.deepStrictEqual(AT, [
				[{ re: 1, im: 2 }, { re: -5, im: 6 }],
				[{ re: 3, im: -4 }, { re: 7, im: 0 }],
			])

			const ATExplicit = transposeComplexStable(A, { conjugate: false })
			assert.deepStrictEqual(ATExplicit, AT)

			const AH = transposeComplexStable(A, { conjugate: true })
			assert.deepStrictEqual(AH, [
				[{ re: 1, im: -2 }, { re: -5, im: -6 }],
				[{ re: 3, im: 4 }, { re: 7, im: 0 }],
			])
		})

		it('transposes rectangular matrices (2x3 and 3x2)', () => {
			const A = [
				[{ re: 1, im: 1 }, { re: 2, im: -1 }, { re: 3, im: 0.5 }],
				[{ re: -4, im: 2.5 }, { re: 0, im: -7 }, { re: 8, im: 9 }],
			]

			const AT = transposeComplexStable(A)
			assert.strictEqual(AT.length, 3)
			assert.strictEqual(AT[0].length, 2)
			assert.deepStrictEqual(AT, [
				[{ re: 1, im: 1 }, { re: -4, im: 2.5 }],
				[{ re: 2, im: -1 }, { re: 0, im: -7 }],
				[{ re: 3, im: 0.5 }, { re: 8, im: 9 }],
			])

			const AH = transposeComplexStable(A, { conjugate: true })
			assert.deepStrictEqual(AH, [
				[{ re: 1, im: -1 }, { re: -4, im: -2.5 }],
				[{ re: 2, im: 1 }, { re: 0, im: 7 }],
				[{ re: 3, im: -0.5 }, { re: 8, im: -9 }],
			])
		})

		it('transposes a 1x1 matrix', () => {
			const A = [[{ re: 4.5, im: -3.25 }]]
			assert.deepStrictEqual(transposeComplexStable(A), [[{ re: 4.5, im: -3.25 }]])
			assert.deepStrictEqual(
				transposeComplexStable(A, { conjugate: true }),
				[[{ re: 4.5, im: 3.25 }]],
			)
		})

		it('transposes row (1xN) and column (Nx1) matrices', () => {
			const row = [[{ re: 1, im: 2 }, { re: 3, im: 4 }, { re: 5, im: -6 }]]
			const col = transposeComplexStable(row)
			assert.deepStrictEqual(col, [
				[{ re: 1, im: 2 }],
				[{ re: 3, im: 4 }],
				[{ re: 5, im: -6 }],
			])
			assert.deepStrictEqual(transposeComplexStable(col), row)

			const colH = transposeComplexStable(row, { conjugate: true })
			assert.deepStrictEqual(colH, [
				[{ re: 1, im: -2 }],
				[{ re: 3, im: -4 }],
				[{ re: 5, im: 6 }],
			])
		})

		it('handles matrices larger than the cache block size (40x35)', () => {
			const rows = 40
			const cols = 35
			const A = Array.from({ length: rows }, (_, i) =>
				Array.from({ length: cols }, (_, j) => ({
					re: i * 100 + j,
					im: i - j * 2,
				})),
			)

			const AT = transposeComplexStable(A)
			const AH = transposeComplexStable(A, { conjugate: true })

			assert.strictEqual(AT.length, cols)
			assert.strictEqual(AT[0].length, rows)
			assert.strictEqual(AH.length, cols)
			assert.strictEqual(AH[0].length, rows)

			for (let i = 0; i < rows; i++) {
				for (let j = 0; j < cols; j++) {
					assert.strictEqual(AT[j][i].re, A[i][j].re)
					assert.strictEqual(AT[j][i].im, A[i][j].im)
					assert.strictEqual(AH[j][i].re, A[i][j].re)
					assert.strictEqual(AH[j][i].im, A[i][j].im === 0 ? 0 : -A[i][j].im)
				}
			}
		})

		it('accepts an empty options object', () => {
			const A = [[{ re: 1, im: 2 }]]
			assert.deepStrictEqual(transposeComplexStable(A, {}), [[{ re: 1, im: 2 }]])
		})
	})

	describe('edge cases', () => {
		it('canonicalizes -0 to +0 in both plain and conjugate transpose', () => {
			const A = [
				[{ re: -0, im: -0 }, { re: -0, im: 0 }],
				[{ re: 0, im: -0 }, { re: 5, im: 0 }],
			]

			const AT = transposeComplexStable(A)
			const AH = transposeComplexStable(A, { conjugate: true })

			for (const M of [AT, AH]) {
				for (let i = 0; i < 2; i++) {
					for (let j = 0; j < 2; j++) {
						if (M[i][j].re === 0) {
							assert.ok(
								Object.is(M[i][j].re, 0),
								`Expected +0 for re at [${i}][${j}]`,
							)
						}
						if (M[i][j].im === 0) {
							assert.ok(
								Object.is(M[i][j].im, 0),
								`Expected +0 for im at [${i}][${j}]`,
							)
						}
					}
				}
			}
		})

		it('preserves subnormal values and Number.MAX_VALUE without precision loss or overflow', () => {
			const subnormalSmallest = Number.MIN_VALUE
			const subnormalMid = 2.225073858507201e-308
			const maxVal = Number.MAX_VALUE

			const A = [
				[
					{ re: subnormalSmallest, im: -subnormalSmallest },
					{ re: maxVal, im: -maxVal },
				],
				[
					{ re: -subnormalMid, im: subnormalMid },
					{ re: -maxVal, im: subnormalSmallest },
				],
			]

			const AT = transposeComplexStable(A)
			assert.ok(Object.is(AT[0][0].re, subnormalSmallest))
			assert.ok(Object.is(AT[0][0].im, -subnormalSmallest))
			assert.ok(Object.is(AT[1][0].re, maxVal))
			assert.ok(Object.is(AT[1][0].im, -maxVal))
			assert.ok(Object.is(AT[0][1].re, -subnormalMid))
			assert.ok(Object.is(AT[0][1].im, subnormalMid))
			assert.ok(Object.is(AT[1][1].re, -maxVal))
			assert.ok(Object.is(AT[1][1].im, subnormalSmallest))

			const AH = transposeComplexStable(A, { conjugate: true })
			assert.ok(Object.is(AH[0][0].re, subnormalSmallest))
			assert.ok(Object.is(AH[0][0].im, subnormalSmallest))
			assert.ok(Object.is(AH[1][0].re, maxVal))
			assert.ok(Object.is(AH[1][0].im, maxVal))
			assert.ok(Object.is(AH[0][1].re, -subnormalMid))
			assert.ok(Object.is(AH[0][1].im, -subnormalMid))
			assert.ok(Object.is(AH[1][1].re, -maxVal))
			assert.ok(Object.is(AH[1][1].im, -subnormalSmallest))
		})

		it('does not mutate inputs and returns independent entry objects', () => {
			const e00 = Object.freeze({ re: 1, im: 2 })
			const e01 = Object.freeze({ re: 3, im: 4 })
			const row0 = Object.freeze([e00, e01])
			const A = Object.freeze([row0])

			const AT = transposeComplexStable(A)
			assert.notStrictEqual(AT[0][0], e00)
			assert.notStrictEqual(AT[1][0], e01)

			// Mutating output must not affect input
			AT[0][0].re = 999
			assert.strictEqual(A[0][0].re, 1)

			// Mutating a mutable input after transpose must not affect output
			const B = [[{ re: 10, im: 20 }]]
			const BT = transposeComplexStable(B)
			B[0][0].re = -100
			assert.strictEqual(BT[0][0].re, 10)
		})

		it('rejects empty, ragged, sparse, malformed, and non-finite inputs', () => {
			// Empty matrices
			assert.throws(() => transposeComplexStable([]), RangeError)
			assert.throws(() => transposeComplexStable([[]]), RangeError)
			assert.throws(() => transposeComplexStable([[], []]), RangeError)

			// Ragged matrices
			assert.throws(
				() =>
					transposeComplexStable([
						[{ re: 1, im: 0 }, { re: 2, im: 0 }],
						[{ re: 3, im: 0 }],
					]),
				RangeError,
			)

			// Non-finite entries
			for (const bad of [NaN, Infinity, -Infinity]) {
				assert.throws(
					() => transposeComplexStable([[{ re: bad, im: 0 }]]),
					RangeError,
				)
				assert.throws(
					() => transposeComplexStable([[{ re: 0, im: bad }]]),
					RangeError,
				)
			}

			// Non-array matrix / rows
			assert.throws(() => transposeComplexStable(null), TypeError)
			assert.throws(() => transposeComplexStable(undefined), TypeError)
			assert.throws(() => transposeComplexStable({}), TypeError)
			assert.throws(() => transposeComplexStable([null]), TypeError)
			assert.throws(
				() => transposeComplexStable([[{ re: 1, im: 0 }], 'bad']),
				TypeError,
			)

			// Malformed entries & sparse rows
			assert.throws(() => transposeComplexStable([[null]]), TypeError)
			assert.throws(() => transposeComplexStable([[42]]), TypeError)
			assert.throws(() => transposeComplexStable([[{ re: '1', im: 0 }]]), TypeError)
			assert.throws(() => transposeComplexStable([[{ re: 1 }]]), TypeError)
			// eslint-disable-next-line no-sparse-arrays
			const sparseRow = new Array(2)
			sparseRow[0] = { re: 1, im: 0 }
			assert.throws(() => transposeComplexStable([sparseRow]), TypeError)

			// Malformed options
			const valid = [[{ re: 1, im: 0 }]]
			assert.throws(() => transposeComplexStable(valid, null), TypeError)
			assert.throws(() => transposeComplexStable(valid, true), TypeError)
			assert.throws(() => transposeComplexStable(valid, []), TypeError)
			assert.throws(
				() => transposeComplexStable(valid, { conjugate: 'true' }),
				TypeError,
			)
		})
	})

	describe('algebraic and numerical cross-checks', () => {
		it('satisfies involution: (A^T)^T = A and (A^H)^H = A', () => {
			const A = [
				[{ re: 1.25, im: -3.5 }, { re: 0, im: 7.125 }, { re: -9.5, im: 0 }],
				[{ re: 2.5, im: 4.75 }, { re: -6.25, im: -8.5 }, { re: 11.75, im: -0.125 }],
			]

			const ATT = transposeComplexStable(transposeComplexStable(A))
			assert.deepStrictEqual(ATT, A)

			const AHH = transposeComplexStable(
				transposeComplexStable(A, { conjugate: true }),
				{ conjugate: true },
			)
			assert.deepStrictEqual(AHH, A)
		})

		it('satisfies product reversal: (A * B)^T = B^T * A^T and (A * B)^H = B^H * A^H', () => {
			// Exact integer/dyadic complex entries for bit-exact verification
			const AExact = [
				[{ re: 1, im: 2 }, { re: -3, im: 0.5 }, { re: 4, im: -1 }],
				[{ re: 0.5, im: -2 }, { re: 3, im: 1 }, { re: -1.5, im: 2.5 }],
			]
			const BExact = [
				[{ re: 2, im: -1 }, { re: 0.5, im: 3 }],
				[{ re: -1, im: 4 }, { re: 2.5, im: -0.5 }],
				[{ re: 3, im: 2 }, { re: -2, im: 1.5 }],
			]

			const AB = matMulComplex(AExact, BExact)
			const AB_T = transposeComplexStable(AB)
			const BT_AT = matMulComplex(
				transposeComplexStable(BExact),
				transposeComplexStable(AExact),
			)
			assert.deepStrictEqual(AB_T, BT_AT)

			const AB_H = transposeComplexStable(AB, { conjugate: true })
			const BH_AH = matMulComplex(
				transposeComplexStable(BExact, { conjugate: true }),
				transposeComplexStable(AExact, { conjugate: true }),
			)
			assert.deepStrictEqual(AB_H, BH_AH)

			// General irrational floating-point entries
			const AFloat = [
				[{ re: Math.PI, im: -Math.E }, { re: Math.SQRT2, im: 0.1 }],
				[{ re: -0.3, im: Math.LN10 }, { re: 1 / 3, im: -1 / 7 }],
				[{ re: 1 / 11, im: Math.SQRT1_2 }, { re: -Math.LN2, im: 5.7 }],
			]
			const BFloat = [
				[{ re: 0.7, im: -1 / 9 }, { re: Math.E, im: 1.2345 }, { re: -2.1, im: 0.4 }],
				[{ re: 1 / 6, im: 3.14159 }, { re: -0.9, im: 2 / 13 }, { re: 4.2, im: -1.8 }],
			]

			const ABFloat = matMulComplex(AFloat, BFloat)
			assertMatrixClose(
				transposeComplexStable(ABFloat),
				matMulComplex(
					transposeComplexStable(BFloat),
					transposeComplexStable(AFloat),
				),
				1e-13,
			)
			assertMatrixClose(
				transposeComplexStable(ABFloat, { conjugate: true }),
				matMulComplex(
					transposeComplexStable(BFloat, { conjugate: true }),
					transposeComplexStable(AFloat, { conjugate: true }),
				),
				1e-13,
			)
		})

		it('preserves Frobenius norm across normal and extreme-magnitude matrices', () => {
			const matrices = [
				[
					[{ re: 3, im: 4 }, { re: -5, im: 12 }],
					[{ re: 8, im: -15 }, { re: 0.5, im: -0.25 }],
					[{ re: -1.1, im: 2.2 }, { re: 3.3, im: -4.4 }],
				],
				// Extreme large magnitudes (would overflow naive squared norm)
				[
					[{ re: Number.MAX_VALUE / 4, im: -Number.MAX_VALUE / 8 }],
					[{ re: -Number.MAX_VALUE / 2, im: Number.MAX_VALUE / 16 }],
				],
				// Subnormal magnitudes (would underflow naive squared norm)
				[
					[{ re: Number.MIN_VALUE * 3, im: -Number.MIN_VALUE * 4 }],
					[{ re: Number.MIN_VALUE * 5, im: Number.MIN_VALUE * 12 }],
				],
			]

			for (const A of matrices) {
				const normA = scaledFrobeniusNorm(A)
				const normAT = scaledFrobeniusNorm(transposeComplexStable(A))
				const normAH = scaledFrobeniusNorm(
					transposeComplexStable(A, { conjugate: true }),
				)

				assert.strictEqual(normAT.scale, normA.scale)
				assert.strictEqual(normAH.scale, normA.scale)
				assert.ok(
					Math.abs(normAT.scaledNorm - normA.scaledNorm) <= 1e-15 * normA.scaledNorm,
					`Plain transpose Frobenius norm mismatch: ${normAT.scaledNorm} vs ${normA.scaledNorm}`,
				)
				assert.ok(
					Math.abs(normAH.scaledNorm - normA.scaledNorm) <= 1e-15 * normA.scaledNorm,
					`Conjugate transpose Frobenius norm mismatch: ${normAH.scaledNorm} vs ${normA.scaledNorm}`,
				)
			}
		})
	})
})
