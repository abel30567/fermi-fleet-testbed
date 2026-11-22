import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { determinantTypedIterative } from './determinantTypedIterative.js'

/**
 * Helper: assert two numbers are within relative/absolute tolerance.
 */
function assertClose(actual, expected, tol = 1e-9, message) {
	const scale = Math.max(1, Math.abs(expected))
	const diff = Math.abs(actual - expected)
	assert.ok(
		diff <= tol * scale,
		message ??
			`Expected ${actual} to be close to ${expected} (diff=${diff}, allowed=${tol * scale})`
	)
}

/**
 * Independent 3x3 determinant via explicit Rule of Sarrus / cofactor expansion.
 */
function det3x3Sarrus(m) {
	const a = m[0], b = m[1], c = m[2]
	const d = m[3], e = m[4], f = m[5]
	const g = m[6], h = m[7], i = m[8]
	return a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
}

/**
 * Independent naive n x n row-major matrix multiplication C = A * B.
 */
function matMul(a, b, n) {
	const out = new Float64Array(n * n)
	for (let i = 0; i < n; i++) {
		for (let j = 0; j < n; j++) {
			let sum = 0
			for (let k = 0; k < n; k++) {
				sum += a[i * n + k] * b[k * n + j]
			}
			out[i * n + j] = sum
		}
	}
	return out
}

/**
 * Independent transpose of an n x n row-major matrix.
 */
function matTranspose(a, n) {
	const out = new Float64Array(n * n)
	for (let i = 0; i < n; i++) {
		for (let j = 0; j < n; j++) {
			out[j * n + i] = a[i * n + j]
		}
	}
	return out
}

describe('determinantTypedIterative', () => {
	describe('normal cases', () => {
		it('computes determinants of 1x1 matrices', () => {
			assert.equal(determinantTypedIterative(new Float64Array([7]), 1), 7)
			assert.equal(determinantTypedIterative(new Float64Array([-3.5])), -3.5)
			assert.equal(determinantTypedIterative(new Float64Array([0]), 1), 0)
			assert.ok(
				Object.is(determinantTypedIterative(new Float64Array([-0]), 1), 0),
				'normalizes -0 to +0'
			)
		})

		it('computes determinants of 2x2 matrices', () => {
			assertClose(
				determinantTypedIterative(new Float64Array([1, 2, 3, 4]), 2),
				-2
			)
			assertClose(
				determinantTypedIterative(new Float64Array([4, 7, 2, 6])),
				10
			)
			assertClose(
				determinantTypedIterative(new Float64Array([-2.5, 1.5, 4, -3]), 2),
				1.5
			)
		})

		it('computes determinants of 3x3 matrices', () => {
			const m = new Float64Array([
				6, 1, 1,
				4, -2, 5,
				2, 8, 7,
			])
			assertClose(determinantTypedIterative(m, 3), -306)
			assertClose(determinantTypedIterative(m), -306)
		})

		it('computes determinant of a 4x4 matrix', () => {
			const m = new Float64Array([
				1, 0, 2, -1,
				3, 0, 0, 5,
				2, 1, 4, -3,
				1, 0, 5, 0,
			])
			assertClose(determinantTypedIterative(m, 4), 30)
		})

		it('does not mutate the input Float64Array', () => {
			const original = [
				2, 5, 7,
				6, 3, 4,
				5, -2, -3,
			]
			const m = new Float64Array(original)
			const det = determinantTypedIterative(m, 3)
			assertClose(det, -1)
			assert.deepEqual(Array.from(m), original)
		})
	})

	describe('edge cases', () => {
		it('returns 1 for an empty 0x0 matrix', () => {
			assert.equal(determinantTypedIterative(new Float64Array(0)), 1)
			assert.equal(determinantTypedIterative(new Float64Array(0), 0), 1)
		})

		it('returns 1 for identity matrices of various sizes', () => {
			for (const n of [1, 2, 3, 5, 8]) {
				const eye = new Float64Array(n * n)
				for (let i = 0; i < n; i++) {
					eye[i * n + i] = 1
				}
				assert.equal(determinantTypedIterative(eye, n), 1)
			}
		})

		it('computes exact product of diagonal for diagonal and triangular matrices', () => {
			const upper = new Float64Array([
				2, 9, -4, 7,
				0, -3, 5, 1,
				0, 0, 4, -8,
				0, 0, 0, 0.5,
			])
			assertClose(determinantTypedIterative(upper, 4), 2 * -3 * 4 * 0.5)

			const lower = new Float64Array([
				-1.5, 0, 0,
				7, 2, 0,
				-3, 11, -4,
			])
			assertClose(determinantTypedIterative(lower, 3), -1.5 * 2 * -4)
		})

		it('handles singular matrices (returns 0)', () => {
			// All zeros
			assert.equal(determinantTypedIterative(new Float64Array(9), 3), 0)

			// Zero row
			const zeroRow = new Float64Array([
				1, 2, 3,
				0, 0, 0,
				7, 8, 9,
			])
			assert.equal(determinantTypedIterative(zeroRow, 3), 0)

			// Zero column
			const zeroCol = new Float64Array([
				1, 0, 3,
				4, 0, 6,
				7, 0, 9,
			])
			assert.equal(determinantTypedIterative(zeroCol, 3), 0)

			// Duplicate rows
			const dupRows = new Float64Array([
				3, -1, 4,
				1, 5, 9,
				3, -1, 4,
			])
			assert.equal(determinantTypedIterative(dupRows, 3), 0)

			// Linearly dependent rows: row3 = 2*row2 - row1
			const dependent = new Float64Array([
				1, 2, 3,
				4, 5, 6,
				7, 8, 9,
			])
			assertClose(determinantTypedIterative(dependent, 3), 0, 1e-12)
		})

		it('handles zero pivots requiring row swaps', () => {
			// 2x2 swap matrix
			assert.equal(
				determinantTypedIterative(new Float64Array([0, 1, 1, 0]), 2),
				-1
			)

			// 3x3 cyclic permutation (even permutation, det = +1)
			const cyclic3 = new Float64Array([
				0, 1, 0,
				0, 0, 1,
				1, 0, 0,
			])
			assert.equal(determinantTypedIterative(cyclic3, 3), 1)

			// 3x3 anti-diagonal (1 swap, det = -1)
			const anti3 = new Float64Array([
				0, 0, 1,
				0, 1, 0,
				1, 0, 0,
			])
			assert.equal(determinantTypedIterative(anti3, 3), -1)

			// 4x4 anti-diagonal (2 swaps, det = +1)
			const anti4 = new Float64Array([
				0, 0, 0, 1,
				0, 0, 1, 0,
				0, 1, 0, 0,
				1, 0, 0, 0,
			])
			assert.equal(determinantTypedIterative(anti4, 4), 1)

			// Zero main diagonal with non-zero off-diagonals
			const zeroDiag = new Float64Array([
				0, 2, 3,
				4, 0, 6,
				7, 8, 0,
			])
			assertClose(determinantTypedIterative(zeroDiag, 3), 180)
		})

		it('maintains accuracy with partial pivoting when leading entry is tiny', () => {
			const m = new Float64Array([
				1e-12, 1,
				1, 1,
			])
			assertClose(determinantTypedIterative(m, 2), 1e-12 - 1, 1e-12)
		})

		it('preserves small non-zero determinants without spurious zero truncation', () => {
			const small = new Float64Array([
				1e-10, 0,
				0, 1e-10,
			])
			assertClose(determinantTypedIterative(small, 2), 1e-20, 1e-12)
		})
	})

	describe('input validation', () => {
		it('throws TypeError for non-Float64Array matrix inputs', () => {
			for (const bad of [
				null,
				undefined,
				[1, 2, 3, 4],
				new Float32Array([1, 2, 3, 4]),
				new Int32Array([1, 2, 3, 4]),
				'1234',
				42,
				{},
			]) {
				assert.throws(
					() => determinantTypedIterative(bad),
					TypeError
				)
			}
		})

		it('throws TypeError when n is provided and not a number', () => {
			const m = new Float64Array([1, 2, 3, 4])
			for (const badN of ['2', null, {}, true, [2]]) {
				assert.throws(
					() => determinantTypedIterative(m, badN),
					TypeError
				)
			}
		})

		it('throws RangeError for invalid n or mismatched matrix dimensions', () => {
			const m4 = new Float64Array([1, 2, 3, 4])
			assert.throws(() => determinantTypedIterative(m4, -2), RangeError)
			assert.throws(() => determinantTypedIterative(m4, 2.5), RangeError)
			assert.throws(() => determinantTypedIterative(m4, NaN), RangeError)
			assert.throws(() => determinantTypedIterative(m4, Infinity), RangeError)
			assert.throws(() => determinantTypedIterative(m4, 3), RangeError)
			assert.throws(() => determinantTypedIterative(new Float64Array(0), 1), RangeError)

			// Non-square length when n is omitted
			assert.throws(() => determinantTypedIterative(new Float64Array(2)), RangeError)
			assert.throws(() => determinantTypedIterative(new Float64Array(3)), RangeError)
			assert.throws(() => determinantTypedIterative(new Float64Array(6)), RangeError)
		})

		it('throws RangeError if any matrix element is NaN or ±Infinity', () => {
			assert.throws(
				() => determinantTypedIterative(new Float64Array([1, NaN, 3, 4]), 2),
				RangeError
			)
			assert.throws(
				() => determinantTypedIterative(new Float64Array([Infinity, 0, 0, 1]), 2),
				RangeError
			)
			assert.throws(
				() => determinantTypedIterative(new Float64Array([1, 2, 3, -Infinity]), 2),
				RangeError
			)
		})
	})

	describe('independent mathematical cross-checks', () => {
		it('matches explicit Sarrus/cofactor formula on diverse 3x3 matrices', () => {
			const cases = [
				new Float64Array([2, -3, 1, 2, 0, -1, 1, 4, 5]),
				new Float64Array([0, 5, -2, 3, 0, 4, -1, 6, 0]),
				new Float64Array([0.5, -1.25, 3.75, 2.5, 4.125, -0.5, -3.25, 1.5, 2.25]),
				new Float64Array([-7, -2, 9, 4, -8, -3, 5, 1, -6]),
			]
			for (const m of cases) {
				const actual = determinantTypedIterative(m, 3)
				const expected = det3x3Sarrus(m)
				assertClose(actual, expected, 1e-12)
			}
		})

		it('satisfies multiplicativity det(A * B) == det(A) * det(B)', () => {
			const pairs = [
				{
					n: 2,
					a: new Float64Array([3, -2, 5, 4]),
					b: new Float64Array([-1, 7, 2, -3]),
				},
				{
					n: 3,
					a: new Float64Array([1, 2, -1, 0, 3, 4, 2, -1, 5]),
					b: new Float64Array([2, -1, 3, 4, 0, -2, -1, 5, 1]),
				},
				{
					n: 4,
					a: new Float64Array([
						2, 1, 0, -1,
						-1, 3, 2, 1,
						0, -2, 4, 3,
						1, 0, -1, 2,
					]),
					b: new Float64Array([
						1, -1, 2, 0,
						3, 2, -1, 4,
						-2, 1, 3, -1,
						0, 4, -2, 1,
					]),
				},
				{
					n: 5,
					a: new Float64Array([
						2, -1, 0, 3, 1,
						1, 4, -2, 0, 2,
						-3, 1, 5, -1, 0,
						0, 2, -1, 3, -2,
						4, 0, 1, -2, 3,
					]),
					b: new Float64Array([
						1, 2, -1, 0, 3,
						-2, 3, 1, 4, -1,
						0, -1, 2, -3, 2,
						3, 0, -2, 1, 1,
						-1, 4, 0, 2, -2,
					]),
				},
			]

			for (const { n, a, b } of pairs) {
				const ab = matMul(a, b, n)
				const detAB = determinantTypedIterative(ab, n)
				const detAdetB =
					determinantTypedIterative(a, n) * determinantTypedIterative(b, n)
				assertClose(detAB, detAdetB, 1e-10)
			}
		})

		it('satisfies transpose invariance, scalar scaling, and row-swap sign flip', () => {
			const n = 4
			const a = new Float64Array([
				3, -1, 2, 4,
				0, 5, -3, 1,
				2, 1, 0, -2,
				-4, 3, 1, 2,
			])
			const detA = determinantTypedIterative(a, n)

			// det(A^T) == det(A)
			const at = matTranspose(a, n)
			assertClose(determinantTypedIterative(at, n), detA, 1e-12)

			// det(c * A) == c^n * det(A)
			const c = -2.5
			const scaled = new Float64Array(a.length)
			for (let i = 0; i < a.length; i++) {
				scaled[i] = c * a[i]
			}
			assertClose(
				determinantTypedIterative(scaled, n),
				Math.pow(c, n) * detA,
				1e-11
			)

			// Swapping rows 0 and 2 negates determinant
			const swapped = new Float64Array(a)
			for (let k = 0; k < n; k++) {
				const tmp = swapped[0 * n + k]
				swapped[0 * n + k] = swapped[2 * n + k]
				swapped[2 * n + k] = tmp
			}
			assertClose(determinantTypedIterative(swapped, n), -detA, 1e-12)
		})

		it('matches closed-form Vandermonde determinant formula for n=4 and n=5', () => {
			for (const nodes of [
				[1, 2, 4, 7],
				[-2, -0.5, 1, 2.5, 4],
			]) {
				const n = nodes.length
				const v = new Float64Array(n * n)
				for (let i = 0; i < n; i++) {
					let pow = 1
					for (let j = 0; j < n; j++) {
						v[i * n + j] = pow
						pow *= nodes[i]
					}
				}

				let expected = 1
				for (let i = 0; i < n; i++) {
					for (let j = i + 1; j < n; j++) {
						expected *= nodes[j] - nodes[i]
					}
				}

				assertClose(determinantTypedIterative(v, n), expected, 1e-10)
			}
		})
	})
})
