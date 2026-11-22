import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { derivativeTypedRecursive } from './derivativeTypedRecursive.js'

/**
 * Helper to assert two Float64Arrays are element-wise close within a tolerance.
 */
function assertCloseArray(actual, expected, tolerance = 1e-10) {
	assert.ok(actual instanceof Float64Array, 'result must be a Float64Array')
	assert.equal(actual.length, expected.length, 'array lengths must match')
	for (let i = 0; i < expected.length; i++) {
		assert.ok(
			Math.abs(actual[i] - expected[i]) <= tolerance,
			`index ${i}: expected ${expected[i]}, got ${actual[i]} (diff ${Math.abs(actual[i] - expected[i])} > ${tolerance})`
		)
	}
}

/**
 * Independent iterative finite-difference reference implementation for cross-checking.
 */
function iterativeDerivativeReference(y, dx = 1) {
	const n = y.length
	const out = new Float64Array(n)
	if (n === 0) return out
	if (typeof dx === 'number') {
		if (n === 2) {
			const slope = (y[1] - y[0]) / dx
			out[0] = slope
			out[1] = slope
			return out
		}
		out[0] = (-3 * y[0] + 4 * y[1] - y[2]) / (2 * dx)
		for (let i = 1; i < n - 1; i++) {
			out[i] = (y[i + 1] - y[i - 1]) / (2 * dx)
		}
		out[n - 1] = (y[n - 3] - 4 * y[n - 2] + 3 * y[n - 1]) / (2 * dx)
		return out
	}
	if (n === 2) {
		const slope = (y[1] - y[0]) / (dx[1] - dx[0])
		out[0] = slope
		out[1] = slope
		return out
	}
	{
		const h1 = dx[1] - dx[0]
		const h2 = dx[2] - dx[1]
		out[0] =
			(-(2 * h1 + h2) / (h1 * (h1 + h2))) * y[0] +
			((h1 + h2) / (h1 * h2)) * y[1] -
			(h1 / (h2 * (h1 + h2))) * y[2]
	}
	for (let i = 1; i < n - 1; i++) {
		const h1 = dx[i] - dx[i - 1]
		const h2 = dx[i + 1] - dx[i]
		out[i] =
			(h1 / (h2 * (h1 + h2))) * y[i + 1] +
			((h2 - h1) / (h1 * h2)) * y[i] -
			(h2 / (h1 * (h1 + h2))) * y[i - 1]
	}
	{
		const h1 = dx[n - 2] - dx[n - 3]
		const h2 = dx[n - 1] - dx[n - 2]
		out[n - 1] =
			(h2 / (h1 * (h1 + h2))) * y[n - 3] -
			((h1 + h2) / (h1 * h2)) * y[n - 2] +
			((h1 + 2 * h2) / (h2 * (h1 + h2))) * y[n - 1]
	}
	return out
}

describe('derivativeTypedRecursive', () => {
	describe('normal cases (uniform spacing)', () => {
		test('constant function has zero derivative', () => {
			const y = new Float64Array([7, 7, 7, 7, 7])
			const result = derivativeTypedRecursive(y)
			assertCloseArray(result, new Float64Array([0, 0, 0, 0, 0]), 0)
			for (let i = 0; i < result.length; i++) {
				assert.ok(!Object.is(result[i], -0), `index ${i} should not be -0`)
			}
		})

		test('linear function y = 3x + 2 with default dx = 1', () => {
			const y = new Float64Array([2, 5, 8, 11, 14, 17])
			const result = derivativeTypedRecursive(y)
			assertCloseArray(result, new Float64Array([3, 3, 3, 3, 3, 3]), 1e-12)
		})

		test('linear function with custom uniform spacing dx = 0.25', () => {
			const dx = 0.25
			const y = new Float64Array(8)
			for (let i = 0; i < y.length; i++) {
				const x = i * dx
				y[i] = -4.5 * x + 1.25
			}
			const result = derivativeTypedRecursive(y, dx)
			assertCloseArray(result, new Float64Array(8).fill(-4.5), 1e-12)
		})

		test('quadratic function y = 2x^2 - 3x + 5 is exact at interior and boundaries', () => {
			const dx = 0.5
			const n = 9
			const y = new Float64Array(n)
			const expected = new Float64Array(n)
			for (let i = 0; i < n; i++) {
				const x = i * dx
				y[i] = 2 * x * x - 3 * x + 5
				expected[i] = 4 * x - 3
			}
			const result = derivativeTypedRecursive(y, dx)
			assertCloseArray(result, expected, 1e-12)
		})
	})

	describe('normal cases (non-uniform Float64Array coordinates)', () => {
		test('quadratic function on strictly increasing non-uniform grid is exact', () => {
			const x = new Float64Array([0, 0.1, 0.4, 1.0, 1.8, 3.0, 5.5])
			const y = Float64Array.from(x, (v) => 1.5 * v * v - 2 * v + 4)
			const expected = Float64Array.from(x, (v) => 3 * v - 2)
			const result = derivativeTypedRecursive(y, x)
			assertCloseArray(result, expected, 1e-11)
		})

		test('quadratic function on strictly decreasing non-uniform grid is exact', () => {
			const x = new Float64Array([4.0, 2.5, 1.0, 0.2, -1.5])
			const y = Float64Array.from(x, (v) => -0.5 * v * v + 3 * v - 1)
			const expected = Float64Array.from(x, (v) => -v + 3)
			const result = derivativeTypedRecursive(y, x)
			assertCloseArray(result, expected, 1e-11)
		})
	})

	describe('edge cases', () => {
		test('empty Float64Array returns empty Float64Array', () => {
			const result = derivativeTypedRecursive(new Float64Array(0))
			assert.ok(result instanceof Float64Array)
			assert.equal(result.length, 0)

			const resultNonUniform = derivativeTypedRecursive(
				new Float64Array(0),
				new Float64Array(0)
			)
			assert.ok(resultNonUniform instanceof Float64Array)
			assert.equal(resultNonUniform.length, 0)
		})

		test('two-element Float64Array computes first-order slope', () => {
			const resultUniform = derivativeTypedRecursive(new Float64Array([3, 9]), 2)
			assertCloseArray(resultUniform, new Float64Array([3, 3]), 1e-12)

			const resultNonUniform = derivativeTypedRecursive(
				new Float64Array([10, 4]),
				new Float64Array([1, 4])
			)
			assertCloseArray(resultNonUniform, new Float64Array([-2, -2]), 1e-12)
		})

		test('three-element Float64Array exercises boundary and single interior point', () => {
			const y = new Float64Array([0, 1, 4]) // y = x^2 at x = 0, 1, 2
			const result = derivativeTypedRecursive(y, 1)
			assertCloseArray(result, new Float64Array([0, 2, 4]), 1e-12)
		})

		test('does not mutate input Float64Arrays', () => {
			const y = new Float64Array([1, 4, 9, 16, 25])
			const x = new Float64Array([1, 2, 3, 4, 5])
			const yCopy = new Float64Array(y)
			const xCopy = new Float64Array(x)

			const out = derivativeTypedRecursive(y, x)
			assert.notEqual(out, y)
			assert.deepEqual(y, yCopy)
			assert.deepEqual(x, xCopy)
		})

		test('handles large array without stack overflow (O(log n) recursion depth)', () => {
			const n = 16385 // odd size > 2^14
			const dx = 1 / (n - 1)
			const y = new Float64Array(n)
			const expected = new Float64Array(n)
			for (let i = 0; i < n; i++) {
				const x = i * dx
				y[i] = x * x
				expected[i] = 2 * x
			}
			const result = derivativeTypedRecursive(y, dx)
			assertCloseArray(result, expected, 1e-8)
		})
	})

	describe('cross-checks against analytical and iterative derivatives', () => {
		test('cross-check sin(x) against analytical cos(x) and iterative reference (uniform)', () => {
			const n = 1001
			const dx = (2 * Math.PI) / (n - 1)
			const y = new Float64Array(n)
			const analytical = new Float64Array(n)
			for (let i = 0; i < n; i++) {
				const x = i * dx
				y[i] = Math.sin(x)
				analytical[i] = Math.cos(x)
			}

			const recursive = derivativeTypedRecursive(y, dx)
			const iterative = iterativeDerivativeReference(y, dx)

			// Recursive divide-and-conquer must match iterative reference to machine precision
			assertCloseArray(recursive, iterative, 1e-15)
			// Second-order scheme on dx ~= 0.00628 has O(dx^2) ~= 4e-5 error vs analytical cos(x)
			assertCloseArray(recursive, analytical, 1e-4)
		})

		test('cross-check exp(x) and x^3 on non-uniform grid against analytical and iterative reference', () => {
			const n = 257
			const x = new Float64Array(n)
			const yExp = new Float64Array(n)
			const analyticalExp = new Float64Array(n)
			const yCubic = new Float64Array(n)
			const analyticalCubic = new Float64Array(n)

			// Non-uniform cosine-clustered grid on [0, 2]
			for (let i = 0; i < n; i++) {
				const t = i / (n - 1)
				const xi = 1 - Math.cos(Math.PI * t)
				x[i] = xi
				yExp[i] = Math.exp(xi)
				analyticalExp[i] = Math.exp(xi)
				yCubic[i] = xi * xi * xi
				analyticalCubic[i] = 3 * xi * xi
			}

			const recExp = derivativeTypedRecursive(yExp, x)
			const iterExp = iterativeDerivativeReference(yExp, x)
			assertCloseArray(recExp, iterExp, 1e-13)
			assertCloseArray(recExp, analyticalExp, 5e-4)

			const recCubic = derivativeTypedRecursive(yCubic, x)
			const iterCubic = iterativeDerivativeReference(yCubic, x)
			assertCloseArray(recCubic, iterCubic, 1e-13)
			assertCloseArray(recCubic, analyticalCubic, 1e-3)
		})
	})

	describe('input validation', () => {
		test('throws TypeError when y is not a Float64Array', () => {
			assert.throws(() => derivativeTypedRecursive([1, 2, 3]), TypeError)
			assert.throws(() => derivativeTypedRecursive(new Float32Array([1, 2, 3])), TypeError)
			assert.throws(() => derivativeTypedRecursive(new Int32Array([1, 2, 3])), TypeError)
			assert.throws(() => derivativeTypedRecursive(null), TypeError)
			assert.throws(() => derivativeTypedRecursive(undefined), TypeError)
			assert.throws(() => derivativeTypedRecursive('123'), TypeError)
		})

		test('throws TypeError when dx is neither a number nor a Float64Array', () => {
			const y = new Float64Array([1, 2, 3])
			assert.throws(() => derivativeTypedRecursive(y, [0, 1, 2]), TypeError)
			assert.throws(() => derivativeTypedRecursive(y, new Float32Array([0, 1, 2])), TypeError)
			assert.throws(() => derivativeTypedRecursive(y, null), TypeError)
			assert.throws(() => derivativeTypedRecursive(y, '1'), TypeError)
			assert.throws(() => derivativeTypedRecursive(y, {}), TypeError)
		})

		test('throws RangeError when y has length 1', () => {
			assert.throws(() => derivativeTypedRecursive(new Float64Array([42])), RangeError)
			assert.throws(
				() => derivativeTypedRecursive(new Float64Array([42]), new Float64Array([0])),
				RangeError
			)
		})

		test('throws RangeError for invalid scalar dx', () => {
			const y = new Float64Array([1, 2, 3])
			assert.throws(() => derivativeTypedRecursive(y, 0), RangeError)
			assert.throws(() => derivativeTypedRecursive(y, -1), RangeError)
			assert.throws(() => derivativeTypedRecursive(y, NaN), RangeError)
			assert.throws(() => derivativeTypedRecursive(y, Infinity), RangeError)
			assert.throws(() => derivativeTypedRecursive(y, -Infinity), RangeError)
			assert.throws(() => derivativeTypedRecursive(new Float64Array(0), 0), RangeError)
		})

		test('throws RangeError for non-finite values in y', () => {
			assert.throws(
				() => derivativeTypedRecursive(new Float64Array([1, NaN, 3])),
				RangeError
			)
			assert.throws(
				() => derivativeTypedRecursive(new Float64Array([1, Infinity, 3])),
				RangeError
			)
			assert.throws(
				() => derivativeTypedRecursive(new Float64Array([-Infinity, 2, 3])),
				RangeError
			)
		})

		test('throws RangeError for invalid coordinate Float64Array dx', () => {
			const y = new Float64Array([1, 2, 3, 4])
			// Mismatched length
			assert.throws(
				() => derivativeTypedRecursive(y, new Float64Array([0, 1, 2])),
				RangeError
			)
			// Non-finite coordinate
			assert.throws(
				() => derivativeTypedRecursive(y, new Float64Array([0, NaN, 2, 3])),
				RangeError
			)
			assert.throws(
				() => derivativeTypedRecursive(y, new Float64Array([0, 1, Infinity, 3])),
				RangeError
			)
			// Duplicate consecutive coordinates (zero step)
			assert.throws(
				() => derivativeTypedRecursive(y, new Float64Array([0, 0, 2, 3])),
				RangeError
			)
			assert.throws(
				() => derivativeTypedRecursive(y, new Float64Array([0, 1, 1, 3])),
				RangeError
			)
			// Non-monotonic coordinates
			assert.throws(
				() => derivativeTypedRecursive(y, new Float64Array([0, 2, 1, 3])),
				RangeError
			)
			assert.throws(
				() => derivativeTypedRecursive(y, new Float64Array([3, 1, 2, 0])),
				RangeError
			)
		})
	})
})
