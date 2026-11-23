import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { gradientTypedIterative } from './gradientTypedIterative.js'

function assertClose(actual, expected, tol = 1e-12, message = '') {
	const diff = Math.abs(actual - expected)
	assert.ok(
		diff <= tol,
		`${message ? `${message}: ` : ''}expected ${actual} to be within ${tol} of ${expected} (diff=${diff})`
	)
}

describe('gradientTypedIterative', () => {
	test('computes exact gradient for constant and linear functions with default spacing', () => {
		const constant = new Float64Array([7, 7, 7, 7, 7])
		const gradConst = gradientTypedIterative(constant)
		assert.ok(gradConst instanceof Float64Array)
		assert.equal(gradConst.length, constant.length)
		for (let i = 0; i < gradConst.length; i++) {
			assert.equal(gradConst[i], 0)
		}

		// f(x) = 3x - 2 at x = 0, 1, 2, 3, 4
		const linear = new Float64Array([-2, 1, 4, 7, 10])
		const gradLin = gradientTypedIterative(linear)
		for (let i = 0; i < gradLin.length; i++) {
			assertClose(gradLin[i], 3, 1e-14, `linear index ${i}`)
		}
	})

	test('computes gradient with custom uniform spacing', () => {
		// f(x) = x^2 on x = [0, 0.5, 1.0, 1.5, 2.0]
		const dx = 0.5
		const values = new Float64Array([0, 0.25, 1, 2.25, 4])
		const grad = gradientTypedIterative(values, dx)

		// Endpoints use 1st-order differences: (0.25 - 0)/0.5 = 0.5, (4 - 2.25)/0.5 = 3.5
		assertClose(grad[0], 0.5, 1e-14)
		assertClose(grad[4], 3.5, 1e-14)

		// Interior points use 2nd-order central differences: exact 2x for quadratics
		assertClose(grad[1], 1.0, 1e-14)
		assertClose(grad[2], 2.0, 1e-14)
		assertClose(grad[3], 3.0, 1e-14)
	})

	test('computes exact interior gradient for quadratic functions on non-uniform grids', () => {
		// f(x) = 2x^2 - 5x + 1, f'(x) = 4x - 5
		const coords = new Float64Array([-3, -1.5, -0.2, 0.7, 2.5, 6.0])
		const values = new Float64Array(coords.length)
		for (let i = 0; i < coords.length; i++) {
			const x = coords[i]
			values[i] = 2 * x * x - 5 * x + 1
		}

		const grad = gradientTypedIterative(values, coords)

		// Endpoints: exact secant slopes
		assertClose(grad[0], (values[1] - values[0]) / (coords[1] - coords[0]), 1e-12)
		assertClose(
			grad[coords.length - 1],
			(values[coords.length - 1] - values[coords.length - 2]) /
				(coords[coords.length - 1] - coords[coords.length - 2]),
			1e-12
		)

		// Interior points: exact 2nd-order Lagrangian derivative for any quadratic
		for (let i = 1; i < coords.length - 1; i++) {
			const expected = 4 * coords[i] - 5
			assertClose(grad[i], expected, 1e-12, `non-uniform quadratic index ${i}`)
		}
	})

	test('handles minimum length of 2 elements', () => {
		const values = new Float64Array([10, 16])
		const gradDefault = gradientTypedIterative(values)
		assert.deepEqual(Array.from(gradDefault), [6, 6])

		const gradScaled = gradientTypedIterative(values, 2)
		assert.deepEqual(Array.from(gradScaled), [3, 3])

		const gradCoords = gradientTypedIterative(values, new Float64Array([1, 4]))
		assert.deepEqual(Array.from(gradCoords), [2, 2])
	})

	test('does not mutate input Float64Arrays', () => {
		const values = new Float64Array([1, 4, 9, 16])
		const coords = new Float64Array([1, 2, 3, 4])
		const valuesCopy = new Float64Array(values)
		const coordsCopy = new Float64Array(coords)

		const grad = gradientTypedIterative(values, coords)
		assert.notEqual(grad, values)
		assert.notEqual(grad, coords)
		assert.deepEqual(values, valuesCopy)
		assert.deepEqual(coords, coordsCopy)
	})

	test('independent cross-check: analytic derivative and O(h^2) convergence on sin(x)', () => {
		function maxInteriorError(n) {
			const a = 0
			const b = Math.PI
			const dx = (b - a) / (n - 1)
			const values = new Float64Array(n)
			for (let i = 0; i < n; i++) {
				values[i] = Math.sin(a + i * dx)
			}
			const grad = gradientTypedIterative(values, dx)
			let maxErr = 0
			for (let i = 1; i < n - 1; i++) {
				const err = Math.abs(grad[i] - Math.cos(a + i * dx))
				if (err > maxErr) maxErr = err
			}
			return maxErr
		}

		const errCoarse = maxInteriorError(101)
		const errFine = maxInteriorError(201)
		const ratio = errCoarse / errFine

		// Halving h reduces O(h^2) central-difference error by a factor of ~4
		assert.ok(errFine < 1e-4, `expected fine error < 1e-4, got ${errFine}`)
		assert.ok(ratio > 3.9 && ratio < 4.1, `expected ~4x convergence ratio, got ${ratio}`)
	})

	test('independent cross-check: Fundamental Theorem of Calculus via trapezoidal integration', () => {
		// f(x) = exp(0.5 * x) on [0, 2]
		const n = 401
		const a = 0
		const b = 2
		const dx = (b - a) / (n - 1)
		const values = new Float64Array(n)
		for (let i = 0; i < n; i++) {
			values[i] = Math.exp(0.5 * (a + i * dx))
		}

		const grad = gradientTypedIterative(values, dx)

		// Integrate grad via trapezoidal rule: should match f(b) - f(a)
		let integral = 0.5 * (grad[0] + grad[n - 1])
		for (let i = 1; i < n - 1; i++) {
			integral += grad[i]
		}
		integral *= dx

		const exactDelta = Math.exp(0.5 * b) - Math.exp(0.5 * a)
		assertClose(integral, exactDelta, 1e-5, 'FTC trapezoidal integral')
	})

	test('independent cross-check: uniform scalar spacing matches equivalent Float64Array coordinates', () => {
		const n = 50
		const dx = 0.125
		const x0 = -2.5
		const coords = new Float64Array(n)
		const values = new Float64Array(n)
		for (let i = 0; i < n; i++) {
			const x = x0 + i * dx
			coords[i] = x
			values[i] = Math.sin(x) * Math.exp(-0.1 * x)
		}

		const gradScalar = gradientTypedIterative(values, dx)
		const gradCoords = gradientTypedIterative(values, coords)

		for (let i = 0; i < n; i++) {
			assertClose(gradScalar[i], gradCoords[i], 1e-14, `scalar vs coords index ${i}`)
		}
	})

	test('validates values argument and rejects invalid inputs', () => {
		assert.throws(() => gradientTypedIterative([1, 2, 3]), TypeError)
		assert.throws(() => gradientTypedIterative(new Float32Array([1, 2, 3])), TypeError)
		assert.throws(() => gradientTypedIterative(null), TypeError)
		assert.throws(() => gradientTypedIterative(undefined), TypeError)
		assert.throws(() => gradientTypedIterative(42), TypeError)

		assert.throws(() => gradientTypedIterative(new Float64Array(0)), RangeError)
		assert.throws(() => gradientTypedIterative(new Float64Array([1])), RangeError)

		assert.throws(() => gradientTypedIterative(new Float64Array([1, NaN, 3])), RangeError)
		assert.throws(() => gradientTypedIterative(new Float64Array([1, Infinity, 3])), RangeError)
		assert.throws(() => gradientTypedIterative(new Float64Array([-Infinity, 2, 3])), RangeError)
	})

	test('validates spacing argument and rejects invalid inputs', () => {
		const values = new Float64Array([1, 2, 3])

		assert.throws(() => gradientTypedIterative(values, 0), RangeError)
		assert.throws(() => gradientTypedIterative(values, -1), RangeError)
		assert.throws(() => gradientTypedIterative(values, NaN), RangeError)
		assert.throws(() => gradientTypedIterative(values, Infinity), RangeError)

		assert.throws(() => gradientTypedIterative(values, '1'), TypeError)
		assert.throws(() => gradientTypedIterative(values, [0, 1, 2]), TypeError)
		assert.throws(() => gradientTypedIterative(values, null), TypeError)

		assert.throws(() => gradientTypedIterative(values, new Float64Array([0, 1])), RangeError)
		assert.throws(
			() => gradientTypedIterative(values, new Float64Array([0, 1, 1])),
			RangeError
		)
		assert.throws(
			() => gradientTypedIterative(values, new Float64Array([0, 2, 1])),
			RangeError
		)
		assert.throws(
			() => gradientTypedIterative(values, new Float64Array([NaN, 1, 2])),
			RangeError
		)
		assert.throws(
			() => gradientTypedIterative(values, new Float64Array([0, 1, Infinity])),
			RangeError
		)
	})
})
