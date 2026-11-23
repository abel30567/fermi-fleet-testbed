import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { determinantTypedMemo } from './determinantTypedMemo.js'

const EPS = 1e-9

function assertClose(actual, expected, tol = EPS, msg) {
	const scale = Math.max(1, Math.abs(expected))
	assert.ok(
		Math.abs(actual - expected) <= tol * scale,
		msg ?? `Expected ${actual} to be within ${tol * scale} of ${expected}`,
	)
}

function identity(n) {
	const m = new Float64Array(n * n)
	for (let i = 0; i < n; i++) {
		m[i * n + i] = 1
	}
	return m
}

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

function transpose(a, n) {
	const out = new Float64Array(n * n)
	for (let i = 0; i < n; i++) {
		for (let j = 0; j < n; j++) {
			out[j * n + i] = a[i * n + j]
		}
	}
	return out
}

/**
 * Independent recursive cofactor expansion along row 0 for cross-checking.
 */
function cofactorDet(matrix, n) {
	if (n === 1) return matrix[0]
	if (n === 2) return matrix[0] * matrix[3] - matrix[1] * matrix[2]

	let sum = 0
	const sub = new Float64Array((n - 1) * (n - 1))
	for (let col = 0; col < n; col++) {
		let idx = 0
		for (let r = 1; r < n; r++) {
			for (let c = 0; c < n; c++) {
				if (c === col) continue
				sub[idx++] = matrix[r * n + c]
			}
		}
		const sign = col % 2 === 0 ? 1 : -1
		sum += sign * matrix[col] * cofactorDet(sub, n - 1)
	}
	return sum
}

describe('determinantTypedMemo', () => {
	beforeEach(() => {
		determinantTypedMemo.clearCache()
	})

	test('1x1 matrix', () => {
		assert.equal(determinantTypedMemo(new Float64Array([7.5])), 7.5)
		assert.equal(determinantTypedMemo(new Float64Array([-3.25]), 1), -3.25)
		assert.equal(Object.is(determinantTypedMemo(new Float64Array([-0])), 0), true)
	})

	test('2x2 matrix', () => {
		const m = new Float64Array([3, 8, 4, 6])
		assert.equal(determinantTypedMemo(m), -14)
		assert.equal(determinantTypedMemo(m, 2), -14)
	})

	test('3x3 matrix', () => {
		const m = new Float64Array([6, 1, 1, 4, -2, 5, 2, 8, 7])
		assert.equal(determinantTypedMemo(m), -306)
	})

	test('4x4 matrix', () => {
		const m = new Float64Array([
			1, 3, 5, 9,
			1, 3, 1, 7,
			4, 3, 9, 7,
			5, 2, 0, 9,
		])
		assertClose(determinantTypedMemo(m), -376)
	})

	test('5x5 matrix (LU with partial pivoting, including zero leading diagonal)', () => {
		const m = new Float64Array([
			0, 2, 1, 3, 4,
			1, 0, 2, 1, 3,
			3, 1, 0, 2, 1,
			2, 3, 1, 0, 2,
			4, 2, 3, 1, 0,
		])
		const copy = new Float64Array(m)
		const expected = cofactorDet(m, 5)
		const actual = determinantTypedMemo(m)
		assertClose(actual, expected)
		// Verify input Float64Array was not mutated
		assert.deepEqual(m, copy)
	})

	test('identity matrices return 1 for sizes 1..6', () => {
		for (let n = 1; n <= 6; n++) {
			assert.equal(determinantTypedMemo(identity(n)), 1)
		}
	})

	test('singular matrices return 0', () => {
		// 2x2 linearly dependent rows
		assert.equal(determinantTypedMemo(new Float64Array([2, 4, 1, 2])), 0)
		// 3x3 arithmetic progression rows
		assert.equal(
			determinantTypedMemo(new Float64Array([1, 2, 3, 4, 5, 6, 7, 8, 9])),
			0,
		)
		// 4x4 duplicate row
		assert.equal(
			determinantTypedMemo(
				new Float64Array([
					1, 2, 3, 4,
					5, 6, 7, 8,
					1, 2, 3, 4,
					9, 10, 11, 12,
				]),
			),
			0,
		)
		// 5x5 zero column
		assert.equal(
			determinantTypedMemo(
				new Float64Array([
					1, 0, 3, 4, 5,
					2, 0, 6, 7, 8,
					3, 0, 9, 1, 2,
					4, 0, 2, 3, 4,
					5, 0, 5, 6, 7,
				]),
			),
			0,
		)
	})

	test('validation rejects invalid, empty, non-square, and non-finite inputs', () => {
		assert.throws(() => determinantTypedMemo([1, 0, 0, 1]), TypeError)
		assert.throws(() => determinantTypedMemo(null), TypeError)
		assert.throws(() => determinantTypedMemo(new Float32Array([1, 0, 0, 1])), TypeError)
		assert.throws(() => determinantTypedMemo(new Float64Array([])), RangeError)
		assert.throws(() => determinantTypedMemo(new Float64Array([1, 2, 3])), RangeError)
		assert.throws(() => determinantTypedMemo(new Float64Array([1, 2, 3, 4]), '2'), TypeError)
		assert.throws(() => determinantTypedMemo(new Float64Array([1, 2, 3, 4]), 0), RangeError)
		assert.throws(() => determinantTypedMemo(new Float64Array([1, 2, 3, 4]), 2.5), RangeError)
		assert.throws(() => determinantTypedMemo(new Float64Array([1, 2, 3, 4]), 3), RangeError)
		assert.throws(() => determinantTypedMemo(new Float64Array([1, NaN, 0, 1])), RangeError)
		assert.throws(() => determinantTypedMemo(new Float64Array([1, Infinity, 0, 1])), RangeError)
		assert.throws(() => determinantTypedMemo(new Float64Array([1, -Infinity, 0, 1])), RangeError)
	})

	test('memoization caches repeated lookups and handles in-place mutation safely', () => {
		const a = new Float64Array([2, 5, 1, 3, 4, 7, 6, 8, 9])
		const b = new Float64Array([2, 5, 1, 3, 4, 7, 6, 8, 9])

		const first = determinantTypedMemo(a)
		assert.deepEqual(determinantTypedMemo.getCacheStats(), {
			hits: 0,
			misses: 1,
			size: 1,
			maxSize: 1024,
		})

		// Same instance -> cache hit
		const second = determinantTypedMemo(a)
		assert.equal(second, first)
		// Distinct Float64Array with identical contents -> cache hit
		const third = determinantTypedMemo(b)
		assert.equal(third, first)
		assert.equal(determinantTypedMemo.getCacheStats().hits, 2)
		assert.equal(determinantTypedMemo.getCacheStats().misses, 1)

		// Mutate in place -> must not return stale cached value
		a[0] = 10
		const mutated = determinantTypedMemo(a)
		assert.notEqual(mutated, first)
		assertClose(mutated, cofactorDet(a, 3))
		assert.equal(determinantTypedMemo.getCacheStats().misses, 2)
	})

	test('cross-check: det(A*B) ≈ det(A)*det(B) and det(A^T) ≈ det(A)', () => {
		const a5 = new Float64Array([
			2, -1, 0, 3, 1,
			1, 4, -2, 0, 5,
			-3, 2, 6, 1, -1,
			0, 1, -1, 5, 2,
			4, 0, 3, -2, 7,
		])
		const b5 = new Float64Array([
			1, 2, -1, 0, 3,
			-2, 5, 1, 4, 0,
			3, 0, 2, -1, 1,
			1, -3, 4, 2, -2,
			0, 1, -2, 3, 6,
		])

		const detA = determinantTypedMemo(a5, 5)
		const detB = determinantTypedMemo(b5, 5)
		const detAB = determinantTypedMemo(matMul(a5, b5, 5), 5)
		const detAT = determinantTypedMemo(transpose(a5, 5), 5)

		assertClose(detAB, detA * detB, 1e-9)
		assertClose(detAT, detA, 1e-9)
	})

	test('cross-check: cofactor expansion matches 3x3 and 4x4 table dispatch', () => {
		const m3 = new Float64Array([
			-2.5, 4.2, 1.1,
			0.8, -3.7, 5.5,
			6.1, 2.3, -1.9,
		])
		assertClose(determinantTypedMemo(m3), cofactorDet(m3, 3))

		const m4 = new Float64Array([
			2.5, -1.2, 3.3, 0.7,
			-4.1, 0.5, 2.2, -3.8,
			1.9, 5.4, -0.6, 2.1,
			-0.3, 2.7, 4.9, -1.5,
		])
		assertClose(determinantTypedMemo(m4), cofactorDet(m4, 4))
	})
})
