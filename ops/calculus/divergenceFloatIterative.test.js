import { describe, it } from 'node:test'
import assert from 'node:assert'
import { divergenceFloatIterative } from './divergenceFloatIterative.js'

function assertClose(actual, expected, tolerance = 1e-7, message) {
	assert.ok(
		Math.abs(actual - expected) <= tolerance,
		message ?? `Expected ${actual} to be within ${tolerance} of ${expected} (diff=${Math.abs(actual - expected)})`,
	)
}

describe('divergenceFloatIterative', () => {
	describe('basic and dimensional cases', () => {
		it('computes 1D divergence (ordinary derivative)', () => {
			// F(x) = [x^3 - 2x + 5] => dF/dx = 3x^2 - 2
			const F = ([x]) => [x ** 3 - 2 * x + 5]
			assertClose(divergenceFloatIterative(F, [2]), 10)
			assertClose(divergenceFloatIterative(F, [-3]), 25)
			assertClose(divergenceFloatIterative(F, [0]), -2)
		})

		it('computes 2D divergence for linear and radial fields', () => {
			// Radial field F(x, y) = [x, y] => div = 2
			const radial = ([x, y]) => [x, y]
			assertClose(divergenceFloatIterative(radial, [3, -4]), 2)

			// Linear field F(x, y) = [3x + 4y, -2x + 7y] => div = 3 + 7 = 10
			const linear = ([x, y]) => [3 * x + 4 * y, -2 * x + 7 * y]
			assertClose(divergenceFloatIterative(linear, [-1.5, 2.25]), 10)
		})

		it('computes 3D divergence for radial and inverse-square fields', () => {
			// Radial field F(x, y, z) = [x, y, z] => div = 3
			const radial3D = ([x, y, z]) => [x, y, z]
			assertClose(divergenceFloatIterative(radial3D, [1.5, -2.5, 4]), 3)

			// Inverse-square field r / |r|^3 has zero divergence away from origin
			const invSquare = ([x, y, z]) => {
				const r3 = Math.hypot(x, y, z) ** 3
				return [x / r3, y / r3, z / r3]
			}
			assertClose(divergenceFloatIterative(invSquare, [1, 2, 2]), 0, 1e-8)
		})

		it('supports higher-dimensional fields (5D)', () => {
			// F_i(x) = (i + 1) * x_i^2 => div = sum_{i=0}^4 2*(i+1)*x_i
			const F = (coords) => coords.map((x, i) => (i + 1) * x * x)
			const pt = [1, -2, 0.5, 3, -1]
			const expected = pt.reduce((acc, x, i) => acc + 2 * (i + 1) * x, 0)
			assertClose(divergenceFloatIterative(F, pt), expected)
		})

		it('supports custom positive finite step size h', () => {
			const F = ([x, y]) => [Math.exp(x), Math.sin(y)]
			const expected = Math.exp(1) + Math.cos(0.5)
			assertClose(divergenceFloatIterative(F, [1, 0.5], 1e-5), expected, 1e-8)
			assertClose(divergenceFloatIterative(F, [1, 0.5], 1e-4), expected, 1e-6)
		})
	})

	describe('special vector fields', () => {
		it('returns 0 for constant fields', () => {
			const constant1D = () => [42]
			const constant3D = () => [5, -3.14, 100]
			assert.strictEqual(divergenceFloatIterative(constant1D, [10]), 0)
			assert.strictEqual(divergenceFloatIterative(constant3D, [1, 2, 3]), 0)
		})

		it('returns ~0 for divergence-free rotational fields', () => {
			// 2D rotation field F(x, y) = [-y, x] => div = 0
			const rot2D = ([x, y]) => [-y, x]
			assertClose(divergenceFloatIterative(rot2D, [3.5, -7.2]), 0, 1e-12)

			// 3D solid-body rotation omega x r with omega = [1, -2, 3]
			const rot3D = ([x, y, z]) => [
				-2 * z - 3 * y,
				3 * x - 1 * z,
				1 * y - -2 * x,
			]
			assertClose(divergenceFloatIterative(rot3D, [4, -1, 2.5]), 0, 1e-10)

			// Nonlinear incompressible 2D vortex: [-y / (x^2 + y^2), x / (x^2 + y^2)]
			const vortex = ([x, y]) => {
				const r2 = x * x + y * y
				return [-y / r2, x / r2]
			}
			assertClose(divergenceFloatIterative(vortex, [2, -3]), 0, 1e-9)
		})
	})

	describe('analytic divergence cross-checks', () => {
		it('matches analytic divergence of F(x, y, z) = [x^2, y^3, z*x] => 2x + 3y^2 + x', () => {
			const F = ([x, y, z]) => [x ** 2, y ** 3, z * x]
			const analyticDiv = ([x, y]) => 2 * x + 3 * y ** 2 + x

			const points = [
				[0, 0, 0],
				[1, 2, 3],
				[-2.5, 1.5, -4],
				[0.25, -0.75, 5.5],
			]
			for (const pt of points) {
				assertClose(divergenceFloatIterative(F, pt), analyticDiv(pt), 1e-6)
			}
		})

		it('matches analytic divergence of transcendental field', () => {
			// F(x, y, z) = [sin(x)*y, exp(y)*z, cos(z)*x]
			// div(F) = cos(x)*y + exp(y)*z - sin(z)*x
			const F = ([x, y, z]) => [
				Math.sin(x) * y,
				Math.exp(y) * z,
				Math.cos(z) * x,
			]
			const analyticDiv = ([x, y, z]) =>
				Math.cos(x) * y + Math.exp(y) * z - Math.sin(z) * x

			const pt = [0.7, -0.4, 1.2]
			assertClose(divergenceFloatIterative(F, pt), analyticDiv(pt), 1e-7)
		})

		it('satisfies vector calculus identity div(curl(G)) ≈ 0', () => {
			// Smooth 3D field G(x, y, z) = [x*y*z, sin(x*z) + y^2, exp(x)*y - z^3]
			// Analytic curl(G) = [dGz/dy - dGy/dz, dGx/dz - dGz/dx, dGy/dx - dGx/dy]
			//   dGz/dy = exp(x),        dGy/dz = x*cos(x*z)
			//   dGx/dz = x*y,           dGz/dx = exp(x)*y
			//   dGy/dx = z*cos(x*z),    dGx/dy = x*z
			const curlG = ([x, y, z]) => [
				Math.exp(x) - x * Math.cos(x * z),
				x * y - Math.exp(x) * y,
				z * Math.cos(x * z) - x * z,
			]

			const points = [
				[0.5, -1.2, 0.8],
				[-0.3, 2.1, -1.5],
				[1.1, 0.4, 0.9],
			]
			for (const pt of points) {
				assertClose(divergenceFloatIterative(curlG, pt), 0, 1e-7)
			}

			// Also verify using a numerical curl of G
			const G = ([x, y, z]) => [
				x * y * z,
				Math.sin(x * z) + y * y,
				Math.exp(x) * y - z ** 3,
			]
			const hCurl = 1e-4
			const numericalCurlG = ([x, y, z]) => {
				const dGdx = [0, 1, 2].map(
					(k) => (G([x + hCurl, y, z])[k] - G([x - hCurl, y, z])[k]) / (2 * hCurl),
				)
				const dGdy = [0, 1, 2].map(
					(k) => (G([x, y + hCurl, z])[k] - G([x, y - hCurl, z])[k]) / (2 * hCurl),
				)
				const dGdz = [0, 1, 2].map(
					(k) => (G([x, y, z + hCurl])[k] - G([x, y, z - hCurl])[k]) / (2 * hCurl),
				)
				return [dGdy[2] - dGdz[1], dGdz[0] - dGdx[2], dGdx[1] - dGdy[0]]
			}
			assertClose(
				divergenceFloatIterative(numericalCurlG, [0.5, -1.2, 0.8], 1e-4),
				0,
				1e-5,
			)
		})
	})

	describe('input immutability', () => {
		it('does not mutate the input point array', () => {
			const point = [1.5, -2.5, 3.5]
			const snapshot = [...point]
			const F = ([x, y, z]) => [x * x, y * y, z * z]

			divergenceFloatIterative(F, point)
			assert.deepStrictEqual(point, snapshot)
		})

		it('works with frozen point array and guards against mutating F', () => {
			const frozenPoint = Object.freeze([2, 3])
			const mutatingF = (coords) => {
				const out = [coords[0] ** 2, coords[1] ** 2]
				coords[0] = 999999
				coords[1] = -999999
				return out
			}

			// div([x^2, y^2]) = 2x + 2y = 4 + 6 = 10
			assertClose(divergenceFloatIterative(mutatingF, frozenPoint), 10)
			assert.deepStrictEqual(frozenPoint, [2, 3])
		})
	})

	describe('input validation and error handling', () => {
		it('rejects invalid vector field F', () => {
			for (const badF of [null, undefined, 42, 'fn', {}, []]) {
				assert.throws(() => divergenceFloatIterative(badF, [1, 2]), TypeError)
			}
		})

		it('rejects non-array or empty point', () => {
			const F = ([x]) => [x]
			for (const badPoint of [null, undefined, 1, '12', {}]) {
				assert.throws(() => divergenceFloatIterative(F, badPoint), TypeError)
			}
			assert.throws(() => divergenceFloatIterative(F, []), RangeError)
		})

		it('rejects point with non-number or non-finite entries', () => {
			const F = (v) => v
			assert.throws(() => divergenceFloatIterative(F, ['1', 2]), TypeError)
			assert.throws(() => divergenceFloatIterative(F, [1, undefined]), TypeError)
			assert.throws(() => divergenceFloatIterative(F, [NaN, 1]), RangeError)
			assert.throws(() => divergenceFloatIterative(F, [1, Infinity]), RangeError)
			assert.throws(() => divergenceFloatIterative(F, [-Infinity, 1]), RangeError)
		})

		it('rejects invalid step size h', () => {
			const F = ([x]) => [x]
			assert.throws(() => divergenceFloatIterative(F, [1], '1e-6'), TypeError)
			assert.throws(() => divergenceFloatIterative(F, [1], null), TypeError)
			assert.throws(() => divergenceFloatIterative(F, [1], 0), RangeError)
			assert.throws(() => divergenceFloatIterative(F, [1], -1e-6), RangeError)
			assert.throws(() => divergenceFloatIterative(F, [1], NaN), RangeError)
			assert.throws(() => divergenceFloatIterative(F, [1], Infinity), RangeError)
			assert.throws(() => divergenceFloatIterative(F, [1], -Infinity), RangeError)
		})

		it('rejects dimension mismatch or invalid values returned by F', () => {
			assert.throws(
				() => divergenceFloatIterative(([x, y]) => [x + y], [1, 2]),
				RangeError,
			)
			assert.throws(
				() => divergenceFloatIterative(([x, y]) => [x, y, 0], [1, 2]),
				RangeError,
			)
			assert.throws(
				() => divergenceFloatIterative(() => null, [1, 2]),
				TypeError,
			)
			assert.throws(
				() => divergenceFloatIterative(() => 123, [1, 2]),
				TypeError,
			)
			assert.throws(
				() => divergenceFloatIterative(([x]) => [x, NaN], [1, 2]),
				RangeError,
			)
			assert.throws(
				() => divergenceFloatIterative(([x]) => [x, Infinity], [1, 2]),
				RangeError,
			)
			assert.throws(
				() => divergenceFloatIterative(([x]) => [x, '2'], [1, 2]),
				TypeError,
			)
		})
	})
})
