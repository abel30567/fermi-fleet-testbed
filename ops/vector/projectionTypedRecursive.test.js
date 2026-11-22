import { test, describe } from 'node:test'
import assert from 'node:assert'
import { projectionTypedRecursive } from './projectionTypedRecursive.js'

/**
 * Helper to assert two Float64Arrays are element-wise close within `eps`.
 */
function assertVectorClose(actual, expected, eps = 1e-12) {
	assert.ok(actual instanceof Float64Array, 'result must be a Float64Array')
	assert.strictEqual(actual.length, expected.length)
	for (let i = 0; i < expected.length; i++) {
		assert.ok(
			Math.abs(actual[i] - expected[i]) <= eps,
			`mismatch at index ${i}: actual=${actual[i]}, expected=${expected[i]}`
		)
	}
}

/**
 * Independent iterative reference implementation for cross-checking.
 */
function iterativeProjection(a, b) {
	let aDotB = 0
	let bDotB = 0
	for (let i = 0; i < a.length; i++) {
		aDotB += a[i] * b[i]
		bDotB += b[i] * b[i]
	}
	const scale = aDotB / bDotB
	const out = new Float64Array(a.length)
	for (let i = 0; i < a.length; i++) {
		out[i] = scale * b[i]
	}
	return out
}

function iterativeDot(x, y) {
	let sum = 0
	for (let i = 0; i < x.length; i++) {
		sum += x[i] * y[i]
	}
	return sum
}

describe('projectionTypedRecursive', () => {
	test('1D vectors', () => {
		const a = new Float64Array([7])
		const b = new Float64Array([-3])
		const res = projectionTypedRecursive(a, b)
		assertVectorClose(res, new Float64Array([7]))
	})

	test('2D vectors', () => {
		const a = new Float64Array([3, 4])
		const b = new Float64Array([1, 0])
		assertVectorClose(
			projectionTypedRecursive(a, b),
			new Float64Array([3, 0])
		)

		const a2 = new Float64Array([2, 3])
		const b2 = new Float64Array([1, 1])
		assertVectorClose(
			projectionTypedRecursive(a2, b2),
			new Float64Array([2.5, 2.5])
		)
	})

	test('3D vectors', () => {
		const a = new Float64Array([1, 2, 3])
		const b = new Float64Array([2, -1, 2])
		// a·b = 2 - 2 + 6 = 6, b·b = 4 + 1 + 4 = 9, scale = 2/3
		assertVectorClose(
			projectionTypedRecursive(a, b),
			new Float64Array([4 / 3, -2 / 3, 4 / 3])
		)
	})

	test('larger odd-length and even-length vectors', () => {
		for (const len of [5, 7, 8, 15, 16, 63, 64, 101, 128]) {
			const a = new Float64Array(len)
			const b = new Float64Array(len)
			for (let i = 0; i < len; i++) {
				a[i] = Math.sin(i * 1.3 + 0.5) * 10
				b[i] = Math.cos(i * 0.7 - 0.2) * 5 + 0.25
			}
			const actual = projectionTypedRecursive(a, b)
			const expected = iterativeProjection(a, b)
			assertVectorClose(actual, expected, 1e-11)
		}
	})

	test('orthogonal vectors produce zero vector', () => {
		const a = new Float64Array([1, 0, -2, 0])
		const b = new Float64Array([0, 5, 0, -3])
		const res = projectionTypedRecursive(a, b)
		assertVectorClose(res, new Float64Array([0, 0, 0, 0]), 0)
		for (let i = 0; i < res.length; i++) {
			assert.ok(Object.is(res[i], 0), `expected +0 at index ${i}`)
		}
	})

	test('parallel and anti-parallel vectors return vector equal to a', () => {
		const a = new Float64Array([2, -4, 6, -8, 10])
		const bSame = new Float64Array([1, -2, 3, -4, 5])
		const bOpp = new Float64Array([-0.5, 1, -1.5, 2, -2.5])

		assertVectorClose(projectionTypedRecursive(a, bSame), a)
		assertVectorClose(projectionTypedRecursive(a, bOpp), a)
	})

	test('zero source vector projects to zero vector', () => {
		const a = new Float64Array([0, 0, 0])
		const b = new Float64Array([4, -5, 6])
		const res = projectionTypedRecursive(a, b)
		assertVectorClose(res, new Float64Array([0, 0, 0]), 0)
	})

	test('input immutability and fresh Float64Array return', () => {
		const a = new Float64Array([3, -1, 4, 1, 5])
		const b = new Float64Array([2, 7, -1, 8, 2])
		const aCopy = new Float64Array(a)
		const bCopy = new Float64Array(b)

		const res = projectionTypedRecursive(a, b)
		assert.notStrictEqual(res, a)
		assert.notStrictEqual(res, b)
		assert.deepStrictEqual(a, aCopy)
		assert.deepStrictEqual(b, bCopy)

		// Mutating result does not affect inputs
		res[0] = 9999
		assert.deepStrictEqual(a, aCopy)
		assert.deepStrictEqual(b, bCopy)
	})

	test('cross-check: residual (a - proj_b(a)) is orthogonal to b and matches iterative computation', () => {
		const sizes = [3, 17, 64, 127]
		for (const n of sizes) {
			const a = new Float64Array(n)
			const b = new Float64Array(n)
			for (let i = 0; i < n; i++) {
				a[i] = ((i * 37) % 19) - 9 + 0.125 * i
				b[i] = ((i * 13) % 11) - 5.5
			}

			const proj = projectionTypedRecursive(a, b)
			const ref = iterativeProjection(a, b)
			assertVectorClose(proj, ref, 1e-10)

			const residual = new Float64Array(n)
			for (let i = 0; i < n; i++) {
				residual[i] = a[i] - proj[i]
			}
			const residualDotB = iterativeDot(residual, b)
			assert.ok(
				Math.abs(residualDotB) < 1e-9,
				`residual not orthogonal to b for n=${n}: dot=${residualDotB}`
			)

			// Idempotence: proj_b(proj_b(a)) === proj_b(a)
			const projTwice = projectionTypedRecursive(proj, b)
			assertVectorClose(projTwice, proj, 1e-10)
		}
	})

	test('throws RangeError for zero target vector b', () => {
		assert.throws(
			() =>
				projectionTypedRecursive(
					new Float64Array([1, 2, 3]),
					new Float64Array([0, 0, 0])
				),
			RangeError
		)
		assert.throws(
			() =>
				projectionTypedRecursive(
					new Float64Array([0]),
					new Float64Array([-0])
				),
			RangeError
		)
	})

	test('throws RangeError for empty or mismatched length vectors', () => {
		assert.throws(
			() =>
				projectionTypedRecursive(new Float64Array([]), new Float64Array([])),
			RangeError
		)
		assert.throws(
			() =>
				projectionTypedRecursive(
					new Float64Array([1, 2]),
					new Float64Array([1, 2, 3])
				),
			RangeError
		)
		assert.throws(
			() =>
				projectionTypedRecursive(
					new Float64Array([1, 2, 3]),
					new Float64Array([1])
				),
			RangeError
		)
	})

	test('throws RangeError for non-finite elements', () => {
		const badValues = [NaN, Infinity, -Infinity]
		for (const bad of badValues) {
			assert.throws(
				() =>
					projectionTypedRecursive(
						new Float64Array([1, bad, 3]),
						new Float64Array([1, 2, 3])
					),
				RangeError
			)
			assert.throws(
				() =>
					projectionTypedRecursive(
						new Float64Array([1, 2, 3]),
						new Float64Array([1, 2, bad])
					),
				RangeError
			)
		}
	})

	test('throws TypeError for non-Float64Array inputs', () => {
		const valid = new Float64Array([1, 2, 3])
		const invalidInputs = [
			[1, 2, 3],
			new Float32Array([1, 2, 3]),
			new Int32Array([1, 2, 3]),
			null,
			undefined,
			'123',
			42,
			{ 0: 1, 1: 2, 2: 3, length: 3 },
		]

		for (const invalid of invalidInputs) {
			assert.throws(() => projectionTypedRecursive(invalid, valid), TypeError)
			assert.throws(() => projectionTypedRecursive(valid, invalid), TypeError)
		}
	})
})
