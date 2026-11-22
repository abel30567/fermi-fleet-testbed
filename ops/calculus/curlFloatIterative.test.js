import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { curlFloatIterative } from './curlFloatIterative.js'

function assertVecClose(actual, expected, tol = 1e-7) {
	assert.equal(actual.length, 3, 'expected 3D vector result')
	for (let i = 0; i < 3; i++) {
		assert.ok(
			Math.abs(actual[i] - expected[i]) <= tol,
			`component ${i}: expected ${actual[i]} to be within ${tol} of ${expected[i]}`
		)
	}
}

describe('curlFloatIterative', () => {
	test('constant vector field has zero curl', () => {
		const F = () => [3.5, -7.25, 42]
		const result = curlFloatIterative(F, [1.2, -3.4, 5.6])
		assert.deepEqual(result, [0, 0, 0])
	})

	test('rotational field [-y, x, 0] has curl [0, 0, 2]', () => {
		const F = ([x, y]) => [-y, x, 0]
		assertVecClose(curlFloatIterative(F, [0, 0, 0]), [0, 0, 2], 1e-9)
		assertVecClose(curlFloatIterative(F, [4.5, -2.3, 9.1]), [0, 0, 2], 1e-8)
	})

	test('irrotational gradient field curl(grad(phi)) = [0, 0, 0]', () => {
		// phi(x, y, z) = x^2 * y + y^2 * z + sin(x * z)
		// grad(phi) = [2xy + z*cos(xz), x^2 + 2yz, y^2 + x*cos(xz)]
		const gradPhi = ([x, y, z]) => [
			2 * x * y + z * Math.cos(x * z),
			x * x + 2 * y * z,
			y * y + x * Math.cos(x * z),
		]
		assertVecClose(curlFloatIterative(gradPhi, [1.5, -0.75, 2.25]), [0, 0, 0], 1e-7)
		assertVecClose(curlFloatIterative(gradPhi, [-2, 3, -1]), [0, 0, 0], 1e-7)
	})

	test('analytic cross-check: F(x,y,z) = [y*z, x*z, x*y] => [0, 0, 0]', () => {
		const F = ([x, y, z]) => [y * z, x * z, x * y]
		const points = [
			[0, 0, 0],
			[1, 2, 3],
			[-4.5, 2.25, -1.75],
		]
		for (const p of points) {
			assertVecClose(curlFloatIterative(F, p), [0, 0, 0], 1e-8)
		}
	})

	test('analytic cross-check: F(x,y,z) = [x*y, y*z, z*x] => [-y, -z, -x]', () => {
		const F = ([x, y, z]) => [x * y, y * z, z * x]
		const points = [
			[1, 2, 3],
			[-2.5, 4.0, -1.5],
			[0.1, -0.2, 0.3],
		]
		for (const p of points) {
			const [x, y, z] = p
			assertVecClose(curlFloatIterative(F, p), [-y, -z, -x], 1e-8)
		}
	})

	test('analytic cross-check: nonlinear trigonometric/exponential field', () => {
		// F(x,y,z) = [sin(y) * exp(z), cos(z) * x^2, y^3 * sin(x)]
		// curl(F) = [3*y^2*sin(x) + x^2*sin(z), sin(y)*exp(z) - y^3*cos(x), 2*x*cos(z) - cos(y)*exp(z)]
		const F = ([x, y, z]) => [
			Math.sin(y) * Math.exp(z),
			Math.cos(z) * x * x,
			y * y * y * Math.sin(x),
		]
		const analyticCurl = ([x, y, z]) => [
			3 * y * y * Math.sin(x) + x * x * Math.sin(z),
			Math.sin(y) * Math.exp(z) - y * y * y * Math.cos(x),
			2 * x * Math.cos(z) - Math.cos(y) * Math.exp(z),
		]

		const points = [
			[0.7, -1.2, 0.4],
			[-1.5, 0.8, -0.3],
			[2.1, 1.3, 0.9],
		]
		for (const p of points) {
			assertVecClose(curlFloatIterative(F, p), analyticCurl(p), 1e-7)
		}
	})

	test('supports custom positive finite step size h', () => {
		const F = ([x, y, z]) => [x * y, y * z, z * x]
		const point = [3, -5, 7]
		assertVecClose(curlFloatIterative(F, point, 1e-4), [5, -7, -3], 1e-8)
		assertVecClose(curlFloatIterative(F, point, 1e-5), [5, -7, -3], 1e-8)
	})

	test('does not mutate input point even if F mutates its argument', () => {
		const point = [1.5, -2.5, 3.5]
		const snapshot = [...point]
		const mutatingF = (p) => {
			const [x, y, z] = p
			p[0] = 999
			p[1] = 999
			p[2] = 999
			return [x * y, y * z, z * x]
		}
		const result = curlFloatIterative(mutatingF, point)
		assert.deepEqual(point, snapshot)
		assertVecClose(result, [2.5, -3.5, -1.5], 1e-8)
	})

	test('validates F is a function', () => {
		assert.throws(() => curlFloatIterative(null, [0, 0, 0]), TypeError)
		assert.throws(() => curlFloatIterative('not a fn', [0, 0, 0]), TypeError)
		assert.throws(() => curlFloatIterative(123, [0, 0, 0]), TypeError)
	})

	test('validates point is a 3-element array of finite numbers', () => {
		const F = ([x, y, z]) => [x, y, z]
		assert.throws(() => curlFloatIterative(F, null), TypeError)
		assert.throws(() => curlFloatIterative(F, { 0: 0, 1: 0, 2: 0 }), TypeError)
		assert.throws(() => curlFloatIterative(F, [1, 2]), RangeError)
		assert.throws(() => curlFloatIterative(F, [1, 2, 3, 4]), RangeError)
		assert.throws(() => curlFloatIterative(F, [1, '2', 3]), TypeError)
		assert.throws(() => curlFloatIterative(F, [1, NaN, 3]), RangeError)
		assert.throws(() => curlFloatIterative(F, [1, Infinity, 3]), RangeError)
		assert.throws(() => curlFloatIterative(F, [-Infinity, 0, 0]), RangeError)
	})

	test('validates step size h is a positive finite number', () => {
		const F = ([x, y, z]) => [x, y, z]
		assert.throws(() => curlFloatIterative(F, [0, 0, 0], '1e-6'), TypeError)
		assert.throws(() => curlFloatIterative(F, [0, 0, 0], 0), RangeError)
		assert.throws(() => curlFloatIterative(F, [0, 0, 0], -1e-6), RangeError)
		assert.throws(() => curlFloatIterative(F, [0, 0, 0], NaN), RangeError)
		assert.throws(() => curlFloatIterative(F, [0, 0, 0], Infinity), RangeError)
		assert.throws(() => curlFloatIterative(F, [0, 0, 0], Number.MAX_VALUE), RangeError)
	})

	test('validates F return value is a 3-element array of finite numbers', () => {
		assert.throws(() => curlFloatIterative(() => null, [0, 0, 0]), TypeError)
		assert.throws(() => curlFloatIterative(() => [1, 2], [0, 0, 0]), RangeError)
		assert.throws(() => curlFloatIterative(() => [1, 2, 3, 4], [0, 0, 0]), RangeError)
		assert.throws(() => curlFloatIterative(() => [1, '2', 3], [0, 0, 0]), TypeError)
		assert.throws(() => curlFloatIterative(() => [1, NaN, 3], [0, 0, 0]), RangeError)
		assert.throws(() => curlFloatIterative(() => [1, Infinity, 3], [0, 0, 0]), RangeError)
	})
})
