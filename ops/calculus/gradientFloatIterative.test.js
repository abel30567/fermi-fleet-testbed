import { describe, test } from 'node:test'
import assert from 'node:assert'
import { gradientFloatIterative } from './gradientFloatIterative.js'

function assertVectorClose(actual, expected, tolerance = 1e-7) {
	assert.equal(actual.length, expected.length, `expected length ${expected.length}, got ${actual.length}`)
	for (let i = 0; i < expected.length; i++) {
		const diff = Math.abs(actual[i] - expected[i])
		assert.ok(
			diff <= tolerance,
			`coordinate ${i}: expected ${expected[i]}, got ${actual[i]} (|diff|=${diff} > ${tolerance})`
		)
	}
}

describe('gradientFloatIterative', () => {
	describe('analytic gradient cross-checks', () => {
		test('3D scalar field f(x, y, z) = x^2 * y + sin(z)', () => {
			const f = ([x, y, z]) => x * x * y + Math.sin(z)
			const analytic = ([x, y, z]) => [2 * x * y, x * x, Math.cos(z)]

			const points = [
				[2, -3, 0.5],
				[-1.5, 4.2, Math.PI / 3],
				[0, 0, 0],
				[3.25, 1.75, -2.1],
			]

			for (const p of points) {
				assertVectorClose(gradientFloatIterative(f, p), analytic(p), 1e-8)
			}
		})

		test('directional derivative cross-check: grad(f)(p) . v == D_v f(p)', () => {
			const f = ([x, y, z]) => Math.exp(0.25 * x * y) + z ** 3 - 2 * x * z + Math.cos(y)
			const p = [1.2, -0.7, 2.3]
			const grad = gradientFloatIterative(f, p)

			const directions = [
				[1, 0, 0],
				[0, 1, 0],
				[0, 0, 1],
				[1 / Math.sqrt(3), -1 / Math.sqrt(3), 1 / Math.sqrt(3)],
				[0.6, 0.8, -0.5],
			]

			const eps = 1e-6
			for (const v of directions) {
				const dot = grad.reduce((acc, g, i) => acc + g * v[i], 0)
				const pPlus = p.map((coord, i) => coord + eps * v[i])
				const pMinus = p.map((coord, i) => coord - eps * v[i])
				const directional = (f(pPlus) - f(pMinus)) / (2 * eps)

				assert.ok(
					Math.abs(dot - directional) <= 1e-7,
					`directional derivative mismatch for v=${JSON.stringify(v)}: dot=${dot}, numeric=${directional}`
				)
			}
		})

		test('2D polynomial f(x, y) = 3x^2 - 4xy + 5y^3', () => {
			const f = ([x, y]) => 3 * x * x - 4 * x * y + 5 * y * y * y
			const analytic = ([x, y]) => [6 * x - 4 * y, -4 * x + 15 * y * y]

			assertVectorClose(gradientFloatIterative(f, [2.5, -1.5]), analytic([2.5, -1.5]), 1e-7)
		})

		test('linear function recovers exact coefficients', () => {
			const coeffs = [3.5, -2.25, 0, 7.125, -0.5]
			const f = (x) => x.reduce((sum, xi, i) => sum + coeffs[i] * xi, 11.4)

			assertVectorClose(gradientFloatIterative(f, [1, -2, 3, -4, 5]), coeffs, 1e-8)
		})
	})

	describe('dimensions and edge cases', () => {
		test('1D scalar function', () => {
			const f = ([x]) => Math.exp(x) + x ** 3
			const x = 1.4
			const expected = [Math.exp(x) + 3 * x * x]

			assertVectorClose(gradientFloatIterative(f, [x]), expected, 1e-7)
		})

		test('higher-dimensional (8D) quadratic form', () => {
			const f = (x) => x.reduce((sum, xi, i) => sum + (i + 1) * xi * xi, 0)
			const point = [-3.2, -1.5, 0, 0.75, 1.25, 2.5, -4.1, 3.0]
			const expected = point.map((xi, i) => 2 * (i + 1) * xi)

			assertVectorClose(gradientFloatIterative(f, point), expected, 1e-7)
		})

		test('constant function yields zero vector without -0', () => {
			const grad = gradientFloatIterative(() => 42, [1, -2, 3.5])
			assert.deepStrictEqual(grad, [0, 0, 0])
			for (const g of grad) {
				assert.ok(Object.is(g, 0), 'expected +0, not -0')
			}
		})

		test('custom step size h works and respects central-difference accuracy', () => {
			const f = ([x, y]) => x ** 3 + y ** 3
			const point = [2, -3]
			const analytic = [12, 27]

			// Central difference of x^3 has exact truncation error h^2
			const hCoarse = 1e-2
			const gradCoarse = gradientFloatIterative(f, point, hCoarse)
			assertVectorClose(gradCoarse, [12 + hCoarse ** 2, 27 + hCoarse ** 2], 1e-11)

			const gradFine = gradientFloatIterative(f, point, 1e-5)
			assertVectorClose(gradFine, analytic, 1e-8)
		})

		test('does not mutate input point array (including frozen input)', () => {
			const point = [1.5, -2.5, 3.5]
			const snapshot = point.slice()

			gradientFloatIterative(([x, y, z]) => x * y + z * z, point)
			assert.deepStrictEqual(point, snapshot)

			const frozen = Object.freeze([1.5, -2.5, 3.5])
			const grad = gradientFloatIterative(([x, y, z]) => x * y + z * z, frozen)
			assertVectorClose(grad, [-2.5, 1.5, 7], 1e-8)
		})
	})

	describe('input validation', () => {
		const validF = ([x]) => x * x

		test('rejects non-function f', () => {
			for (const badF of [null, undefined, 42, 'x => x', {}]) {
				assert.throws(() => gradientFloatIterative(badF, [1]), TypeError)
			}
		})

		test('rejects non-array or empty point', () => {
			for (const badPoint of [null, undefined, 1, '12', { 0: 1, length: 1 }, new Float64Array([1])]) {
				assert.throws(() => gradientFloatIterative(validF, badPoint), TypeError)
			}
			assert.throws(() => gradientFloatIterative(validF, []), RangeError)
		})

		test('rejects point with non-number, sparse, or non-finite entries', () => {
			assert.throws(() => gradientFloatIterative(validF, ['1']), TypeError)
			assert.throws(() => gradientFloatIterative(validF, [1, undefined]), TypeError)
			// eslint-disable-next-line no-sparse-arrays
			assert.throws(() => gradientFloatIterative(validF, [1, , 3]), TypeError)
			assert.throws(() => gradientFloatIterative(validF, [NaN]), RangeError)
			assert.throws(() => gradientFloatIterative(validF, [1, Infinity]), RangeError)
			assert.throws(() => gradientFloatIterative(validF, [1, -Infinity]), RangeError)
		})

		test('rejects invalid step size h', () => {
			assert.throws(() => gradientFloatIterative(validF, [1], '1e-6'), TypeError)
			assert.throws(() => gradientFloatIterative(validF, [1], null), TypeError)
			assert.throws(() => gradientFloatIterative(validF, [1], 0), RangeError)
			assert.throws(() => gradientFloatIterative(validF, [1], -1e-6), RangeError)
			assert.throws(() => gradientFloatIterative(validF, [1], NaN), RangeError)
			assert.throws(() => gradientFloatIterative(validF, [1], Infinity), RangeError)
		})

		test('rejects h that underflows relative to coordinate magnitude', () => {
			assert.throws(() => gradientFloatIterative(validF, [1e16], 1e-6), RangeError)
		})

		test('rejects scalar field returning non-number or non-finite values', () => {
			assert.throws(() => gradientFloatIterative(() => '42', [1]), TypeError)
			assert.throws(() => gradientFloatIterative(() => undefined, [1]), TypeError)
			assert.throws(() => gradientFloatIterative(() => NaN, [1]), RangeError)
			assert.throws(() => gradientFloatIterative(() => Infinity, [1]), RangeError)
		})
	})
})
