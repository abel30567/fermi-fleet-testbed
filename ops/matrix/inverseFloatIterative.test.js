import { describe, test } from 'node:test'
import assert from 'node:assert'
import { inverseFloatIterative } from './inverseFloatIterative.js'

/**
 * Multiplies two n x n matrices for independent verification.
 * @param {number[][]} a
 * @param {number[][]} b
 * @returns {number[][]}
 */
function matMul(a, b) {
	const n = a.length
	const out = Array.from({ length: n }, () => new Array(n).fill(0))
	for (let i = 0; i < n; i++) {
		for (let k = 0; k < n; k++) {
			const aik = a[i][k]
			for (let j = 0; j < n; j++) {
				out[i][j] += aik * b[k][j]
			}
		}
	}
	return out
}

/**
 * Creates an n x n identity matrix.
 * @param {number} n
 * @returns {number[][]}
 */
function identity(n) {
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
	)
}

/**
 * Asserts two matrices are element-wise close within tolerance `tol`.
 * @param {number[][]} actual
 * @param {number[][]} expected
 * @param {number} [tol=1e-12]
 */
function assertMatrixClose(actual, expected, tol = 1e-12) {
	assert.equal(actual.length, expected.length, 'row count mismatch')
	for (let i = 0; i < expected.length; i++) {
		assert.equal(actual[i].length, expected[i].length, `col count mismatch at row ${i}`)
		for (let j = 0; j < expected[i].length; j++) {
			const diff = Math.abs(actual[i][j] - expected[i][j])
			assert.ok(
				diff <= tol,
				`mismatch at [${i}][${j}]: actual=${actual[i][j]}, expected=${expected[i][j]}, diff=${diff} > ${tol}`,
			)
		}
	}
}

/**
 * Independent closed-form 2x2 matrix inverse via adjugate / determinant.
 * @param {number[][]} m
 * @returns {number[][]}
 */
function inverse2x2ClosedForm([[a, b], [c, d]]) {
	const det = a * d - b * c
	return [
		[d / det, -b / det],
		[-c / det, a / det],
	]
}

describe('inverseFloatIterative', () => {
	test('1x1 matrices', () => {
		assertMatrixClose(inverseFloatIterative([[1]]), [[1]])
		assertMatrixClose(inverseFloatIterative([[4]]), [[0.25]])
		assertMatrixClose(inverseFloatIterative([[-0.5]]), [[-2]])
		assertMatrixClose(inverseFloatIterative([[1e-100]]), [[1e100]], 1e86)
	})

	test('identity matrices of sizes 1 through 4', () => {
		for (const n of [1, 2, 3, 4]) {
			const I = identity(n)
			assert.deepStrictEqual(inverseFloatIterative(I), I)
		}
	})

	test('2x2 matrices match closed-form adjugate/det formula', () => {
		const cases = [
			[
				[4, 7],
				[2, 6],
			],
			[
				[1, 2],
				[3, 4],
			],
			[
				[-3.5, 1.25],
				[2.75, -0.5],
			],
			[
				[0.1, -0.2],
				[0.3, 0.4],
			],
		]

		for (const m of cases) {
			const actual = inverseFloatIterative(m)
			const expected = inverse2x2ClosedForm(m)
			assertMatrixClose(actual, expected, 1e-12)
			assertMatrixClose(matMul(m, actual), identity(2), 1e-12)
			assertMatrixClose(matMul(actual, m), identity(2), 1e-12)
		}
	})

	test('3x3 matrices satisfy A * inv(A) ≈ I and inv(A) * A ≈ I', () => {
		const a = [
			[2, -1, 0],
			[-1, 2, -1],
			[0, -1, 2],
		]
		const invA = inverseFloatIterative(a)
		const expected = [
			[0.75, 0.5, 0.25],
			[0.5, 1, 0.5],
			[0.25, 0.5, 0.75],
		]
		assertMatrixClose(invA, expected, 1e-12)
		assertMatrixClose(matMul(a, invA), identity(3), 1e-12)
		assertMatrixClose(matMul(invA, a), identity(3), 1e-12)

		const b = [
			[1, 2, 3],
			[0, 1, 4],
			[5, 6, 0],
		]
		const invB = inverseFloatIterative(b)
		const expectedB = [
			[-24, 18, 5],
			[20, -15, -4],
			[-5, 4, 1],
		]
		assertMatrixClose(invB, expectedB, 1e-11)
		assertMatrixClose(matMul(b, invB), identity(3), 1e-11)
		assertMatrixClose(matMul(invB, b), identity(3), 1e-11)
	})

	test('pivoting required (zero and tiny diagonal entries)', () => {
		// Permutation matrix with zeros on main diagonal
		const perm = [
			[0, 1],
			[1, 0],
		]
		assert.deepStrictEqual(inverseFloatIterative(perm), perm)

		// 3x3 matrix with all zeros on diagonal
		const zeroDiag = [
			[0, 2, 1],
			[1, 0, 3],
			[4, 1, 0],
		]
		const invZeroDiag = inverseFloatIterative(zeroDiag)
		assertMatrixClose(matMul(zeroDiag, invZeroDiag), identity(3), 1e-12)
		assertMatrixClose(matMul(invZeroDiag, zeroDiag), identity(3), 1e-12)

		// Tiny pivot on diagonal that loses precision without partial pivoting
		const tinyPivot = [
			[1e-15, 1],
			[1, 1],
		]
		const invTiny = inverseFloatIterative(tinyPivot)
		assertMatrixClose(invTiny, inverse2x2ClosedForm(tinyPivot), 1e-12)
		assertMatrixClose(matMul(tinyPivot, invTiny), identity(2), 1e-12)
		assertMatrixClose(matMul(invTiny, tinyPivot), identity(2), 1e-12)
	})

	test('mixed row scales and 4x4 Hilbert matrix cross-check', () => {
		const mixedDiag = [
			[1e10, 0],
			[0, 1e-10],
		]
		const invMixed = inverseFloatIterative(mixedDiag)
		assertMatrixClose(invMixed, [[1e-10, 0], [0, 1e10]], 1e-6)
		assertMatrixClose(matMul(mixedDiag, invMixed), identity(2), 1e-12)

		// 4x4 Hilbert matrix (ill-conditioned but invertible in float64)
		const hilbert4 = Array.from({ length: 4 }, (_, i) =>
			Array.from({ length: 4 }, (_, j) => 1 / (i + j + 1)),
		)
		const invH = inverseFloatIterative(hilbert4)
		assertMatrixClose(matMul(hilbert4, invH), identity(4), 1e-10)
		assertMatrixClose(matMul(invH, hilbert4), identity(4), 1e-10)
		// Involution property: inv(inv(H)) ≈ H
		assertMatrixClose(inverseFloatIterative(invH), hilbert4, 1e-10)
	})

	test('singular matrices throw RangeError', () => {
		const singularCases = [
			[[0]],
			[
				[0, 0],
				[0, 0],
			],
			[
				[1, 2],
				[2, 4],
			],
			[
				[1, 0],
				[2, 0],
			],
			[
				[1, 2, 3],
				[4, 5, 6],
				[7, 8, 9],
			],
			[
				[1, 2, 3],
				[1, 2, 3],
				[4, 5, 6],
			],
			// Underflow/overflow to non-finite inverse
			[[1e-320]],
		]

		for (const m of singularCases) {
			assert.throws(() => inverseFloatIterative(m), RangeError)
		}
	})

	test('does not mutate input matrix', () => {
		const original = [
			[0, 2, 1],
			[1, 0, 3],
			[4, 1, 0],
		]
		const snapshot = original.map((row) => [...row])

		const result = inverseFloatIterative(original)
		assert.deepStrictEqual(original, snapshot)
		assert.notStrictEqual(result, original)
		assert.notStrictEqual(result[0], original[0])

		// Also verify no mutation when throwing on singular matrix
		const singular = [
			[1, 2],
			[2, 4],
		]
		const singularSnapshot = singular.map((row) => [...row])
		assert.throws(() => inverseFloatIterative(singular), RangeError)
		assert.deepStrictEqual(singular, singularSnapshot)
	})

	test('invalid inputs throw TypeError or RangeError', () => {
		// Non-array inputs
		for (const bad of [null, undefined, 42, 'matrix', {}, true]) {
			assert.throws(() => inverseFloatIterative(/** @type {any} */ (bad)), TypeError)
		}

		// Empty matrix
		assert.throws(() => inverseFloatIterative([]), RangeError)

		// Non-array row
		assert.throws(() => inverseFloatIterative(/** @type {any} */ ([1, 2])), TypeError)

		// Non-square / ragged matrices
		assert.throws(() => inverseFloatIterative([[]]), RangeError)
		assert.throws(
			() =>
				inverseFloatIterative([
					[1, 2, 3],
					[4, 5, 6],
				]),
			RangeError,
		)
		assert.throws(
			() =>
				inverseFloatIterative([
					[1, 2],
					[3],
				]),
			RangeError,
		)

		// Non-number elements
		assert.throws(() => inverseFloatIterative(/** @type {any} */ ([['1']])), TypeError)
		assert.throws(() => inverseFloatIterative(/** @type {any} */ ([[null]])), TypeError)

		// Non-finite numbers
		assert.throws(() => inverseFloatIterative([[NaN]]), RangeError)
		assert.throws(() => inverseFloatIterative([[Infinity]]), RangeError)
		assert.throws(() => inverseFloatIterative([[-Infinity]]), RangeError)
		assert.throws(
			() =>
				inverseFloatIterative([
					[1, 2],
					[3, NaN],
				]),
			RangeError,
		)
	})
})
