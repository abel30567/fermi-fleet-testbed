import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { determinantTypedRecursive } from './determinantTypedRecursive.js'

/**
 * Independent reference determinant computed via iterative Gaussian elimination
 * with partial pivoting (LU decomposition) for cross-checking.
 *
 * @param {Float64Array} matrix
 * @param {number} n
 * @returns {number}
 */
function determinantGaussianReference(matrix, n) {
	if (n === 0) return 1
	const a = new Float64Array(matrix)
	let sign = 1

	for (let k = 0; k < n; k++) {
		let pivotRow = k
		let maxAbs = Math.abs(a[k * n + k])
		for (let r = k + 1; r < n; r++) {
			const val = Math.abs(a[r * n + k])
			if (val > maxAbs) {
				maxAbs = val
				pivotRow = r
			}
		}

		if (maxAbs === 0) return 0

		if (pivotRow !== k) {
			sign = -sign
			for (let c = k; c < n; c++) {
				const tmp = a[k * n + c]
				a[k * n + c] = a[pivotRow * n + c]
				a[pivotRow * n + c] = tmp
			}
		}

		const pivot = a[k * n + k]
		for (let r = k + 1; r < n; r++) {
			const factor = a[r * n + k] / pivot
			for (let c = k + 1; c < n; c++) {
				a[r * n + c] -= factor * a[k * n + c]
			}
		}
	}

	let det = sign
	for (let i = 0; i < n; i++) {
		det *= a[i * n + i]
	}
	return det === 0 ? 0 : det
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible test matrices.
 *
 * @param {number} seed
 * @returns {() => number}
 */
function createRng(seed) {
	let state = seed >>> 0
	return () => {
		state = (state + 0x6d2b79f5) >>> 0
		let t = Math.imul(state ^ (state >>> 15), 1 | state)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

/**
 * Helper to assert floating-point closeness with combined absolute and relative tolerance.
 */
function assertClose(actual, expected, relTol = 1e-9, absTol = 1e-9) {
	const diff = Math.abs(actual - expected)
	const bound = Math.max(absTol, relTol * Math.max(Math.abs(actual), Math.abs(expected)))
	assert.ok(
		diff <= bound,
		`Expected ${actual} to be close to ${expected} (diff=${diff}, bound=${bound})`,
	)
}

/**
 * Helper to multiply two n×n Float64Array matrices.
 */
function matMul(a, b, n) {
	const out = new Float64Array(n * n)
	for (let r = 0; r < n; r++) {
		for (let c = 0; c < n; c++) {
			let sum = 0
			for (let k = 0; k < n; k++) {
				sum += a[r * n + k] * b[k * n + c]
			}
			out[r * n + c] = sum
		}
	}
	return out
}

/**
 * Helper to transpose an n×n Float64Array matrix.
 */
function transpose(a, n) {
	const out = new Float64Array(n * n)
	for (let r = 0; r < n; r++) {
		for (let c = 0; c < n; c++) {
			out[c * n + r] = a[r * n + c]
		}
	}
	return out
}

describe('determinantTypedRecursive', () => {
	describe('normal cases', () => {
		it('computes 1x1 determinants', () => {
			assert.equal(determinantTypedRecursive(new Float64Array([42])), 42)
			assert.equal(determinantTypedRecursive(new Float64Array([-3.5])), -3.5)
			assert.equal(determinantTypedRecursive(new Float64Array([0])), 0)
		})

		it('computes 2x2 determinants', () => {
			const m = new Float64Array([
				3, 8,
				4, 6,
			])
			assert.equal(determinantTypedRecursive(m), -14)
			assert.equal(determinantTypedRecursive(m, 2), -14)
		})

		it('computes 3x3 determinants', () => {
			const m = new Float64Array([
				6, 1, 1,
				4, -2, 5,
				2, 8, 7,
			])
			assert.equal(determinantTypedRecursive(m), -306)
		})

		it('computes 4x4 determinants recursively', () => {
			const m = new Float64Array([
				1, 0, 2, -1,
				3, 0, 0, 5,
				2, 1, 4, -3,
				1, 0, 5, 0,
			])
			assert.equal(determinantTypedRecursive(m), 30)
		})

		it('computes 5x5 dense determinants recursively', () => {
			const m = new Float64Array([
				2, -1, 0, 3, 1,
				1, 4, -2, 0, 5,
				3, 1, 1, -1, 2,
				-2, 0, 3, 4, -1,
				1, 2, -1, 2, 3,
			])
			const expected = determinantGaussianReference(m, 5)
			assertClose(determinantTypedRecursive(m), expected)
			assert.equal(determinantTypedRecursive(m), -78)
		})

		it('computes determinant of a Float64Array subarray view', () => {
			const backing = new Float64Array([99, 99, 1, 2, 3, 0, 1, 4, 5, 6, 0, 77])
			const view = backing.subarray(2, 11)
			assert.equal(determinantTypedRecursive(view), 1)
		})
	})

	describe('edge cases & algebraic identities', () => {
		it('returns 1 for empty 0x0 Float64Array', () => {
			assert.equal(determinantTypedRecursive(new Float64Array(0)), 1)
			assert.equal(determinantTypedRecursive(new Float64Array(0), 0), 1)
		})

		it('normalizes -0 to +0', () => {
			const m1 = new Float64Array([-0])
			assert.ok(Object.is(determinantTypedRecursive(m1), 0))

			const m2 = new Float64Array([
				0, 1,
				0, -2,
			])
			assert.ok(Object.is(determinantTypedRecursive(m2), 0))
		})

		it('handles singular matrices (zero row, zero column, duplicate rows, dependent rows)', () => {
			const allZeros = new Float64Array(16)
			assert.equal(determinantTypedRecursive(allZeros), 0)

			const zeroRow = new Float64Array([
				1, 2, 3, 4,
				0, 0, 0, 0,
				5, 6, 7, 8,
				9, 1, 2, 3,
			])
			assert.equal(determinantTypedRecursive(zeroRow), 0)

			const zeroCol = new Float64Array([
				1, 0, 3, 4,
				5, 0, 7, 8,
				9, 0, 2, 3,
				4, 0, 6, 1,
			])
			assert.equal(determinantTypedRecursive(zeroCol), 0)

			const duplicateRows = new Float64Array([
				2, 5, -1, 3,
				1, 0, 4, 2,
				2, 5, -1, 3,
				-3, 1, 2, 1,
			])
			assert.equal(determinantTypedRecursive(duplicateRows), 0)

			// Row 3 = 2 * Row 0 - Row 1
			const dependent = new Float64Array([
				1, 2, 3, 4,
				5, 1, -2, 3,
				0, 7, 1, -5,
				-3, 3, 8, 5,
			])
			assertClose(determinantTypedRecursive(dependent), 0)
		})

		it('computes identity, diagonal, and triangular matrices accurately (including large sparse)', () => {
			for (const n of [1, 2, 3, 4, 6, 15]) {
				const id = new Float64Array(n * n)
				for (let i = 0; i < n; i++) id[i * n + i] = 1
				assert.equal(determinantTypedRecursive(id), 1)
			}

			// 14x14 upper triangular matrix (fast path via sparsest row/col)
			const n = 14
			const upper = new Float64Array(n * n)
			let expectedProduct = 1
			for (let r = 0; r < n; r++) {
				const diag = (r % 2 === 0 ? 1 : -1) * (1 + r * 0.25)
				upper[r * n + r] = diag
				expectedProduct *= diag
				for (let c = r + 1; c < n; c++) {
					upper[r * n + c] = (r + c) * 0.5
				}
			}
			assertClose(determinantTypedRecursive(upper), expectedProduct)
		})

		it('handles zero-diagonal permutation matrix', () => {
			// Cyclic permutation of size 4 has sign (-1)^(4-1) = -1
			const perm = new Float64Array([
				0, 1, 0, 0,
				0, 0, 1, 0,
				0, 0, 0, 1,
				1, 0, 0, 0,
			])
			assert.equal(determinantTypedRecursive(perm), -1)
		})

		it('satisfies transpose, multiplicativity, scaling, and row-swap identities', () => {
			const n = 4
			const a = new Float64Array([
				2, -1, 3, 0,
				1, 4, -2, 5,
				-3, 2, 1, 4,
				0, 1, -1, 2,
			])
			const b = new Float64Array([
				1, 3, -1, 2,
				0, 2, 4, -1,
				5, -2, 1, 0,
				2, 1, 3, -3,
			])

			const detA = determinantTypedRecursive(a)
			const detB = determinantTypedRecursive(b)

			// Transpose invariance: det(A^T) === det(A)
			assertClose(determinantTypedRecursive(transpose(a, n)), detA)

			// Multiplicativity: det(A * B) === det(A) * det(B)
			assertClose(determinantTypedRecursive(matMul(a, b, n)), detA * detB)

			// Scaling: det(c * A) === c^n * det(A)
			const c = -2.5
			const scaled = a.map((x) => x * c)
			assertClose(determinantTypedRecursive(scaled), Math.pow(c, n) * detA)

			// Row swap negates determinant
			const swapped = new Float64Array(a)
			for (let col = 0; col < n; col++) {
				const tmp = swapped[col]
				swapped[col] = swapped[2 * n + col]
				swapped[2 * n + col] = tmp
			}
			assertClose(determinantTypedRecursive(swapped), -detA)
		})

		it('does not mutate the input Float64Array', () => {
			const original = new Float64Array([
				4, 3, 2, 1,
				1, 5, 2, 3,
				2, 1, 6, 4,
				3, 2, 1, 7,
			])
			const snapshot = new Float64Array(original)
			determinantTypedRecursive(original)
			assert.deepEqual(original, snapshot)
		})
	})

	describe('input validation errors', () => {
		it('throws TypeError for non-Float64Array inputs', () => {
			const invalidInputs = [
				undefined,
				null,
				42,
				'1234',
				{},
				[1, 2, 3, 4],
				[[1, 2], [3, 4]],
				new Float32Array([1, 2, 3, 4]),
				new Int32Array([1, 2, 3, 4]),
				new Uint8Array([1, 2, 3, 4]),
			]
			for (const bad of invalidInputs) {
				assert.throws(
					() => determinantTypedRecursive(bad),
					{ name: 'TypeError' },
				)
			}
		})

		it('throws RangeError for non-square Float64Array lengths', () => {
			for (const len of [2, 3, 5, 6, 7, 8, 10]) {
				assert.throws(
					() => determinantTypedRecursive(new Float64Array(len)),
					{ name: 'RangeError' },
				)
			}
		})

		it('throws TypeError or RangeError for invalid explicit size', () => {
			const m4 = new Float64Array([1, 2, 3, 4])

			assert.throws(() => determinantTypedRecursive(m4, '2'), { name: 'TypeError' })
			assert.throws(() => determinantTypedRecursive(m4, null), { name: 'TypeError' })

			assert.throws(() => determinantTypedRecursive(m4, -2), { name: 'RangeError' })
			assert.throws(() => determinantTypedRecursive(m4, 2.5), { name: 'RangeError' })
			assert.throws(() => determinantTypedRecursive(m4, Number.NaN), { name: 'RangeError' })
			assert.throws(() => determinantTypedRecursive(m4, Number.POSITIVE_INFINITY), {
				name: 'RangeError',
			})
			assert.throws(() => determinantTypedRecursive(m4, 3), { name: 'RangeError' })
			assert.throws(() => determinantTypedRecursive(m4, 1), { name: 'RangeError' })
		})

		it('throws RangeError for non-finite elements (NaN, Infinity, -Infinity)', () => {
			assert.throws(
				() => determinantTypedRecursive(new Float64Array([1, Number.NaN, 3, 4])),
				{ name: 'RangeError' },
			)
			assert.throws(
				() => determinantTypedRecursive(new Float64Array([1, 2, Number.POSITIVE_INFINITY, 4])),
				{ name: 'RangeError' },
			)
			assert.throws(
				() => determinantTypedRecursive(new Float64Array([Number.NEGATIVE_INFINITY, 2, 3, 4])),
				{ name: 'RangeError' },
			)
		})
	})

	describe('cross-check against independent Gaussian elimination / LU reference', () => {
		it('matches Gaussian elimination across deterministic matrices of sizes 1..8 and 12', () => {
			const rng = createRng(20261122)

			for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 12]) {
				const trials = n <= 6 ? 5 : 2
				for (let t = 0; t < trials; t++) {
					const m = new Float64Array(n * n)
					for (let i = 0; i < m.length; i++) {
						// Mix integers and decimals in [-5, 5], including occasional exact zeros
						const r = rng()
						m[i] = r < 0.15 ? 0 : Math.round((r * 10 - 5) * 4) / 4
					}

					const actual = determinantTypedRecursive(m, n)
					const expected = determinantGaussianReference(m, n)
					assertClose(actual, expected, 1e-8, 1e-8)
				}
			}
		})

		it('matches Gaussian elimination on a dense 12x12 matrix with zero top-left pivot', () => {
			const rng = createRng(987654321)
			const n = 12
			const m = new Float64Array(n * n)
			for (let i = 0; i < m.length; i++) {
				m[i] = rng() * 4 - 2
			}
			// Force leading diagonal entries to zero so pivoting is strictly required
			m[0] = 0
			m[n + 1] = 0

			const actual = determinantTypedRecursive(m)
			const expected = determinantGaussianReference(m, n)
			assertClose(actual, expected, 1e-8, 1e-8)
		})
	})
})
