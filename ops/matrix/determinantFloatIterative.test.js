import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { determinantFloatIterative } from './determinantFloatIterative.js'

/**
 * Independent reference determinant via Laplace cofactor expansion (for small matrices).
 * @param {number[][]} m
 * @returns {number}
 */
function determinantCofactor(m) {
	const n = m.length
	if (n === 1) return m[0][0]
	if (n === 2) return m[0][0] * m[1][1] - m[0][1] * m[1][0]
	let sum = 0
	for (let col = 0; col < n; col++) {
		const minor = []
		for (let r = 1; r < n; r++) {
			const row = []
			for (let c = 0; c < n; c++) {
				if (c !== col) row.push(m[r][c])
			}
			minor.push(row)
		}
		sum += (col % 2 === 0 ? 1 : -1) * m[0][col] * determinantCofactor(minor)
	}
	return sum
}

/**
 * Standard matrix multiplication A * B for square n x n matrices.
 * @param {number[][]} a
 * @param {number[][]} b
 * @returns {number[][]}
 */
function matMul(a, b) {
	const n = a.length
	const out = Array.from({ length: n }, () => new Array(n).fill(0))
	for (let i = 0; i < n; i++) {
		for (let k = 0; k < n; k++) {
			for (let j = 0; j < n; j++) {
				out[i][j] += a[i][k] * b[k][j]
			}
		}
	}
	return out
}

/**
 * Asserts two floating-point numbers are close within absolute + relative tolerance.
 * @param {number} actual
 * @param {number} expected
 * @param {number} [tol=1e-9]
 */
function assertClose(actual, expected, tol = 1e-9) {
	const diff = Math.abs(actual - expected)
	const scale = Math.max(1, Math.abs(expected))
	assert.ok(
		diff <= tol * scale,
		`expected ${actual} to be within ${tol * scale} of ${expected} (diff=${diff})`
	)
}

describe('determinantFloatIterative', () => {
	it('computes 1x1 determinants including zero, negative, and -0 normalization', () => {
		assert.strictEqual(determinantFloatIterative([[42]]), 42)
		assert.strictEqual(determinantFloatIterative([[-7.5]]), -7.5)
		assert.strictEqual(determinantFloatIterative([[0]]), 0)
		assert.ok(Object.is(determinantFloatIterative([[-0]]), 0))
	})

	it('computes 2x2 determinants accurately', () => {
		assertClose(
			determinantFloatIterative([
				[1, 2],
				[3, 4]
			]),
			-2
		)
		assertClose(
			determinantFloatIterative([
				[4, 6],
				[3, 8]
			]),
			14
		)
	})

	it('computes 3x3 determinants accurately', () => {
		const m = [
			[6, 1, 1],
			[4, -2, 5],
			[2, 8, 7]
		]
		assertClose(determinantFloatIterative(m), -306)
	})

	it('computes identity, diagonal, and triangular matrices', () => {
		const identity4 = [
			[1, 0, 0, 0],
			[0, 1, 0, 0],
			[0, 0, 1, 0],
			[0, 0, 0, 1]
		]
		assert.strictEqual(determinantFloatIterative(identity4), 1)

		const upper = [
			[2, 5, -3, 1],
			[0, -4, 7, 2],
			[0, 0, 3, -9],
			[0, 0, 0, 0.5]
		]
		assertClose(determinantFloatIterative(upper), 2 * -4 * 3 * 0.5)

		const smallDiag = [
			[1e-10, 0],
			[0, 1e-10]
		]
		assertClose(determinantFloatIterative(smallDiag), 1e-20, 1e-12)
	})

	it('handles row swaps and partial pivoting when leading diagonal entries are zero', () => {
		// Permutation matrix with one swap -> det = -1
		assert.strictEqual(
			determinantFloatIterative([
				[0, 1],
				[1, 0]
			]),
			-1
		)

		// Cyclic 3-cycle permutation matrix -> 2 swaps -> det = +1
		assert.strictEqual(
			determinantFloatIterative([
				[0, 0, 1],
				[1, 0, 0],
				[0, 1, 0]
			]),
			1
		)

		// Leading zeros requiring multiple row swaps
		const m = [
			[0, 2, 1, 3],
			[0, 0, 4, 1],
			[5, 1, 2, 0],
			[0, 0, 0, 6]
		]
		// Swapping row 0 -> row 2 (sign -1), then row 1 -> row 2 (sign +1)
		// wait: [5,1,2,0], [0,2,1,3], [0,0,4,1], [0,0,0,6] => 2 swaps => +1 * 5*2*4*6 = 240
		assertClose(determinantFloatIterative(m), 240)
	})

	it('returns 0 for singular matrices', () => {
		// Zero row
		assert.strictEqual(
			determinantFloatIterative([
				[1, 2, 3],
				[0, 0, 0],
				[4, 5, 6]
			]),
			0
		)

		// Zero column
		assert.strictEqual(
			determinantFloatIterative([
				[1, 0, 3],
				[4, 0, 6],
				[7, 0, 9]
			]),
			0
		)

		// Duplicate rows
		assert.strictEqual(
			determinantFloatIterative([
				[1, 2, 3],
				[1, 2, 3],
				[4, 5, 9]
			]),
			0
		)

		// Linearly dependent rows (row3 = row1 + row2)
		const dependent = [
			[1, 2, 3],
			[4, 5, 6],
			[5, 7, 9]
		]
		assertClose(determinantFloatIterative(dependent), 0, 1e-12)
	})

	it('handles negative and non-integer floating-point values', () => {
		const m = [
			[-1.5, 2.25, -0.5],
			[3.75, -4.125, 1.5],
			[-2.0, 0.5, -3.25]
		]
		const expected = determinantCofactor(m)
		assertClose(determinantFloatIterative(m), expected, 1e-12)
	})

	it('does not mutate the input matrix or any of its rows', () => {
		const original = [
			[0, 3, -1, 2],
			[4, -2, 5, 1],
			[2, 8, 7, -3],
			[-1, 0, 4, 6]
		]
		const snapshot = structuredClone(original)
		determinantFloatIterative(original)
		assert.deepStrictEqual(original, snapshot)
	})

	it('cross-checks against independent cofactor expansion across multiple 4x4 and 5x5 matrices', () => {
		const matrices = [
			[
				[3, 2, -1, 4],
				[2, 1, 5, 7],
				[0, 5, 2, -6],
				[-1, 2, 1, 0]
			],
			[
				[0.1, -2.3, 4.5, -0.7],
				[3.2, 0.0, -1.1, 2.8],
				[-5.4, 1.9, 0.6, -3.3],
				[2.7, -0.8, 4.1, 1.2]
			],
			[
				[2, -1, 0, 3, 1],
				[0, 4, -2, 1, 5],
				[3, 0, 1, -4, 2],
				[-1, 2, 5, 0, -3],
				[4, 1, -3, 2, 1]
			]
		]

		for (const m of matrices) {
			const iterativeDet = determinantFloatIterative(m)
			const cofactorDet = determinantCofactor(m)
			assertClose(iterativeDet, cofactorDet, 1e-10)
		}
	})

	it('satisfies multiplicative property det(A * B) = det(A) * det(B) and det(A^T) = det(A)', () => {
		const A = [
			[1.5, -2.0, 3.25, 0.5],
			[0.0, 4.5, -1.25, 2.0],
			[-3.0, 1.0, 2.5, -1.5],
			[2.25, -0.5, 0.75, 3.0]
		]
		const B = [
			[-2.0, 1.25, 0.5, 3.0],
			[3.5, -1.0, 2.0, -0.25],
			[1.0, 4.0, -3.5, 1.5],
			[0.75, -2.5, 1.0, 2.25]
		]

		const detA = determinantFloatIterative(A)
		const detB = determinantFloatIterative(B)
		const detAB = determinantFloatIterative(matMul(A, B))
		assertClose(detAB, detA * detB, 1e-10)

		const AT = A[0].map((_, col) => A.map((row) => row[col]))
		assertClose(determinantFloatIterative(AT), detA, 1e-12)
	})

	it('rejects invalid inputs with descriptive TypeError/RangeError', () => {
		// Not an array
		assert.throws(() => determinantFloatIterative(null), TypeError)
		assert.throws(() => determinantFloatIterative(undefined), TypeError)
		assert.throws(() => determinantFloatIterative(123), TypeError)
		assert.throws(() => determinantFloatIterative('[[1]]'), TypeError)
		assert.throws(() => determinantFloatIterative({}), TypeError)

		// Empty matrix
		assert.throws(() => determinantFloatIterative([]), RangeError)

		// Non-array row
		assert.throws(() => determinantFloatIterative([1, 2]), TypeError)
		assert.throws(() => determinantFloatIterative([[1, 2], null]), TypeError)

		// Non-square / ragged matrices
		assert.throws(
			() =>
				determinantFloatIterative([
					[1, 2, 3],
					[4, 5, 6]
				]),
			RangeError
		)
		assert.throws(
			() =>
				determinantFloatIterative([
					[1, 2],
					[3]
				]),
			RangeError
		)

		// Non-number elements
		assert.throws(() => determinantFloatIterative([['1']]), TypeError)
		assert.throws(() => determinantFloatIterative([[null]]), TypeError)
		assert.throws(() => determinantFloatIterative([[undefined]]), TypeError)
		assert.throws(() => determinantFloatIterative([[1n]]), TypeError)

		// Sparse row hole
		// eslint-disable-next-line no-sparse-arrays
		assert.throws(() => determinantFloatIterative([[,]]), TypeError)

		// Non-finite numbers
		assert.throws(() => determinantFloatIterative([[NaN]]), RangeError)
		assert.throws(() => determinantFloatIterative([[Infinity]]), RangeError)
		assert.throws(() => determinantFloatIterative([[-Infinity]]), RangeError)
	})
})
