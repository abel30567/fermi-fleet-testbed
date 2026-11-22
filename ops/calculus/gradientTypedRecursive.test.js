import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { gradientTypedRecursive } from './gradientTypedRecursive.js'

/**
 * Helper to assert two Float64Arrays are element-wise close within `tol`.
 *
 * @param {Float64Array} actual
 * @param {Float64Array | number[]} expected
 * @param {number} [tol=1e-12]
 */
function assertCloseArray(actual, expected, tol = 1e-12) {
	assert.ok(actual instanceof Float64Array, 'result must be a Float64Array')
	assert.equal(actual.length, expected.length, 'length mismatch')
	for (let i = 0; i < expected.length; i++) {
		const diff = Math.abs(actual[i] - expected[i])
		assert.ok(
			diff <= tol,
			`index ${i}: expected ${expected[i]}, got ${actual[i]} (diff ${diff} > tol ${tol})`
		)
	}
}

/**
 * Independent iterative numerical gradient reference for cross-checking.
 *
 * @param {Float64Array} y
 * @param {number | Float64Array} spacing
 * @returns {Float64Array}
 */
function iterativeGradientReference(y, spacing = 1) {
	const n = y.length
	const g = new Float64Array(n)
	if (typeof spacing === 'number') {
		g[0] = (y[1] - y[0]) / spacing
		for (let i = 1; i < n - 1; i++) {
			g[i] = (y[i + 1] - y[i - 1]) / (2 * spacing)
		}
		g[n - 1] = (y[n - 1] - y[n - 2]) / spacing
		return g
	}
	g[0] = (y[1] - y[0]) / (spacing[1] - spacing[0])
	for (let i = 1; i < n - 1; i++) {
		const hs = spacing[i] - spacing[i - 1]
		const hd = spacing[i + 1] - spacing[i]
		g[i] =
			(hs * hs * y[i + 1] + (hd * hd - hs * hs) * y[i] - hd * hd * y[i - 1]) /
			(hs * hd * (hs + hd))
	}
	g[n - 1] = (y[n - 1] - y[n - 2]) / (spacing[n - 1] - spacing[n - 2])
	return g
}

describe('gradientTypedRecursive', () => {
	describe('uniform spacing (normal cases)', () => {
		test('linear function with default spacing = 1', () => {
			// f(x) = 3x + 5 for x = 0..5 -> f'(x) = 3 everywhere
			const y = new Float64Array([5, 8, 11, 14, 17, 20])
			const g = gradientTypedRecursive(y)
			assertCloseArray(g, [3, 3, 3, 3, 3, 3])
		})

		test('explicit undefined spacing uses default spacing = 1', () => {
			const y = new Float64Array([1, 2, 4, 7, 11])
			const g = gradientTypedRecursive(y, undefined)
			assertCloseArray(g, [1, 1.5, 2.5, 3.5, 4])
		})

		test('quadratic function with default spacing = 1', () => {
			// f(x) = x^2 for x = 0, 1, 2, 3, 4 -> y = [0, 1, 4, 9, 16]
			// exact interior f'(x) = 2x: [1, 2, 4, 6, 7]
			const y = new Float64Array([0, 1, 4, 9, 16])
			const g = gradientTypedRecursive(y)
			assertCloseArray(g, [1, 2, 4, 6, 7])
		})

		test('quadratic function with custom uniform spacing h = 0.5', () => {
			// f(x) = 2x^2 - 3x + 7 for x = [0, 0.5, 1.0, 1.5, 2.0, 2.5]
			// f'(x) = 4x - 3 -> interior exact at x = 0.5, 1.0, 1.5, 2.0 => [-1, 1, 3, 5]
			const h = 0.5
			const xs = [0, 0.5, 1.0, 1.5, 2.0, 2.5]
			const y = Float64Array.from(xs, (x) => 2 * x * x - 3 * x + 7)
			const g = gradientTypedRecursive(y, h)
			const expected = [
				(y[1] - y[0]) / h,
				-1,
				1,
				3,
				5,
				(y[5] - y[4]) / h
			]
			assertCloseArray(g, expected)
		})

		test('negative uniform spacing for decreasing grid', () => {
			// x = [2, 1.5, 1.0, 0.5], h = -0.5, f(x) = x^2 -> f'(x) = 2x
			const y = new Float64Array([4, 2.25, 1, 0.25])
			const g = gradientTypedRecursive(y, -0.5)
			assertCloseArray(g, [3.5, 3, 2, 1.5])
		})

		test('constant values produce zero gradient', () => {
			const y = new Float64Array([42.5, 42.5, 42.5, 42.5, 42.5])
			const g = gradientTypedRecursive(y, 0.25)
			assertCloseArray(g, [0, 0, 0, 0, 0])
		})

		test('does not mutate input values array', () => {
			const y = new Float64Array([1, 4, 9, 16, 25])
			const snapshot = new Float64Array(y)
			const g = gradientTypedRecursive(y, 2)
			assert.notEqual(g, y)
			assert.deepEqual(y, snapshot)
		})
	})

	describe('non-uniform Float64Array spacing', () => {
		test('linear function on non-uniform increasing coordinates', () => {
			const x = new Float64Array([0, 0.1, 0.7, 2.3, 10.0])
			const y = Float64Array.from(x, (v) => -2.5 * v + 9)
			const g = gradientTypedRecursive(y, x)
			assertCloseArray(g, [-2.5, -2.5, -2.5, -2.5, -2.5], 1e-11)
		})

		test('quadratic function is exact at every interior point on non-uniform grid', () => {
			// f(x) = 3x^2 - 2x + 1 -> f'(x) = 6x - 2
			const x = new Float64Array([-2.0, -1.2, -0.1, 0.5, 1.8, 4.0, 7.5])
			const y = Float64Array.from(x, (v) => 3 * v * v - 2 * v + 1)
			const g = gradientTypedRecursive(y, x)

			assert.ok(Math.abs(g[0] - (y[1] - y[0]) / (x[1] - x[0])) <= 1e-12)
			for (let i = 1; i < x.length - 1; i++) {
				const exact = 6 * x[i] - 2
				assert.ok(
					Math.abs(g[i] - exact) <= 1e-11,
					`interior index ${i}: expected ${exact}, got ${g[i]}`
				)
			}
			const last = x.length - 1
			assert.ok(
				Math.abs(g[last] - (y[last] - y[last - 1]) / (x[last] - x[last - 1])) <= 1e-12
			)
		})

		test('strictly decreasing non-uniform coordinates', () => {
			// f(x) = x^2 on x = [5, 3, 2.5, 0.5, -1]
			const x = new Float64Array([5, 3, 2.5, 0.5, -1])
			const y = Float64Array.from(x, (v) => v * v)
			const g = gradientTypedRecursive(y, x)
			const expected = [
				(9 - 25) / (3 - 5),
				6,
				5,
				1,
				(1 - 0.25) / (-1 - 0.5)
			]
			assertCloseArray(g, expected, 1e-12)
		})

		test('does not mutate values or spacing arrays', () => {
			const x = new Float64Array([0, 1, 3, 6])
			const y = new Float64Array([0, 1, 9, 36])
			const xSnap = new Float64Array(x)
			const ySnap = new Float64Array(y)
			gradientTypedRecursive(y, x)
			assert.deepEqual(x, xSnap)
			assert.deepEqual(y, ySnap)
		})
	})

	describe('edge cases', () => {
		test('minimum valid length (2 elements) with uniform spacing', () => {
			const y = new Float64Array([3, 11])
			assertCloseArray(gradientTypedRecursive(y), [8, 8])
			assertCloseArray(gradientTypedRecursive(y, 2), [4, 4])
		})

		test('minimum valid length (2 elements) with non-uniform coordinates', () => {
			const x = new Float64Array([1.5, 3.5])
			const y = new Float64Array([4, 10])
			assertCloseArray(gradientTypedRecursive(y, x), [3, 3])
		})

		test('various odd, even, and power-of-two lengths exercise all split shapes', () => {
			for (const len of [2, 3, 4, 5, 7, 8, 9, 15, 16, 17, 31, 32, 33]) {
				const y = new Float64Array(len)
				for (let i = 0; i < len; i++) {
					y[i] = i * i
				}
				const g = gradientTypedRecursive(y, 1)
				assert.equal(g.length, len)
				assert.equal(g[0], 1)
				for (let i = 1; i < len - 1; i++) {
					assert.equal(g[i], 2 * i)
				}
				assert.equal(g[len - 1], 2 * len - 3)
			}
		})

		test('large Float64Array (100_000 elements) succeeds without stack overflow', () => {
			const n = 100_000
			const h = 0.01
			const y = new Float64Array(n)
			for (let i = 0; i < n; i++) {
				const x = i * h
				y[i] = 2 * x + 5
			}
			const g = gradientTypedRecursive(y, h)
			assert.equal(g.length, n)
			assert.ok(Math.abs(g[0] - 2) < 1e-9)
			assert.ok(Math.abs(g[Math.floor(n / 2)] - 2) < 1e-9)
			assert.ok(Math.abs(g[n - 1] - 2) < 1e-9)
		})

		test('large constant offset remains numerically accurate on non-uniform grid', () => {
			const x = new Float64Array([0, 0.25, 1.0, 2.5, 4.0])
			const offset = 1e9
			const y = Float64Array.from(x, (v) => offset + 4 * v)
			const g = gradientTypedRecursive(y, x)
			assertCloseArray(g, [4, 4, 4, 4, 4], 1e-6)
		})

		test('very large uniform spacing where 2 * h overflows avoids spurious zero', () => {
			const h = 1e308
			const y = new Float64Array([-1.5e308, -0.5e308, 0.5e308, 1.5e308])
			const g = gradientTypedRecursive(y, h)
			assertCloseArray(g, [1, 1, 1, 1], 1e-12)
		})
	})

	describe('input validation', () => {
		test('rejects non-Float64Array values with TypeError', () => {
			const invalidInputs = [
				[1, 2, 3],
				new Float32Array([1, 2, 3]),
				new Int32Array([1, 2, 3]),
				null,
				undefined,
				42,
				'123',
				{ 0: 1, 1: 2, length: 2 }
			]
			for (const bad of invalidInputs) {
				assert.throws(() => gradientTypedRecursive(bad), TypeError)
			}
		})

		test('rejects values with fewer than 2 elements with RangeError', () => {
			assert.throws(() => gradientTypedRecursive(new Float64Array(0)), RangeError)
			assert.throws(() => gradientTypedRecursive(new Float64Array([5])), RangeError)
		})

		test('rejects non-finite values with RangeError', () => {
			assert.throws(
				() => gradientTypedRecursive(new Float64Array([NaN, 1, 2])),
				RangeError
			)
			assert.throws(
				() => gradientTypedRecursive(new Float64Array([0, Infinity, 2])),
				RangeError
			)
			assert.throws(
				() => gradientTypedRecursive(new Float64Array([0, 1, -Infinity])),
				RangeError
			)
		})

		test('rejects invalid spacing types with TypeError', () => {
			const y = new Float64Array([1, 2, 3])
			const badSpacings = [
				null,
				'1',
				true,
				[0, 1, 2],
				new Float32Array([0, 1, 2]),
				{}
			]
			for (const bad of badSpacings) {
				assert.throws(() => gradientTypedRecursive(y, bad), TypeError)
			}
		})

		test('rejects invalid numeric spacing with RangeError', () => {
			const y = new Float64Array([1, 2, 3])
			for (const bad of [0, -0, NaN, Infinity, -Infinity]) {
				assert.throws(() => gradientTypedRecursive(y, bad), RangeError)
			}
		})

		test('rejects coordinate spacing with mismatched length', () => {
			const y = new Float64Array([1, 2, 3, 4])
			assert.throws(
				() => gradientTypedRecursive(y, new Float64Array([0, 1, 2])),
				RangeError
			)
			assert.throws(
				() => gradientTypedRecursive(y, new Float64Array([0, 1, 2, 3, 4])),
				RangeError
			)
		})

		test('rejects non-finite coordinate spacing values', () => {
			const y = new Float64Array([1, 2, 3])
			assert.throws(
				() => gradientTypedRecursive(y, new Float64Array([NaN, 1, 2])),
				RangeError
			)
			assert.throws(
				() => gradientTypedRecursive(y, new Float64Array([0, Infinity, 2])),
				RangeError
			)
			assert.throws(
				() => gradientTypedRecursive(y, new Float64Array([0, 1, -Infinity])),
				RangeError
			)
		})

		test('rejects duplicate or non-monotonic coordinate spacing', () => {
			const y4 = new Float64Array([1, 2, 3, 4])
			// Duplicate at start
			assert.throws(
				() => gradientTypedRecursive(y4, new Float64Array([0, 0, 1, 2])),
				RangeError
			)
			// Duplicate in middle
			assert.throws(
				() => gradientTypedRecursive(y4, new Float64Array([0, 1, 1, 2])),
				RangeError
			)
			// Increasing then decreasing
			assert.throws(
				() => gradientTypedRecursive(y4, new Float64Array([0, 2, 1, 3])),
				RangeError
			)
			// Decreasing then increasing
			assert.throws(
				() => gradientTypedRecursive(y4, new Float64Array([5, 3, 4, 1])),
				RangeError
			)
		})
	})

	describe('analytical and iterative cross-checks', () => {
		test('cross-check against analytical derivative of sin(x) and exp(0.5x)', () => {
			const n = 2001
			const h = 1e-3
			const sinY = new Float64Array(n)
			const expY = new Float64Array(n)
			for (let i = 0; i < n; i++) {
				const x = i * h
				sinY[i] = Math.sin(x)
				expY[i] = Math.exp(0.5 * x)
			}

			const sinGrad = gradientTypedRecursive(sinY, h)
			const expGrad = gradientTypedRecursive(expY, h)

			// Interior points are O(h^2) accurate (~1e-6 for h = 1e-3)
			for (let i = 1; i < n - 1; i++) {
				const x = i * h
				assert.ok(
					Math.abs(sinGrad[i] - Math.cos(x)) < 1e-6,
					`sin'(${x}) mismatch: got ${sinGrad[i]}, expected ${Math.cos(x)}`
				)
				assert.ok(
					Math.abs(expGrad[i] - 0.5 * Math.exp(0.5 * x)) < 1e-6,
					`exp'(${x}) mismatch: got ${expGrad[i]}`
				)
			}

			// Boundary points are O(h) accurate (~1e-3 for h = 1e-3)
			assert.ok(Math.abs(sinGrad[0] - Math.cos(0)) < 1e-3)
			assert.ok(Math.abs(sinGrad[n - 1] - Math.cos((n - 1) * h)) < 1e-3)
			assert.ok(Math.abs(expGrad[0] - 0.5) < 1e-3)
			assert.ok(
				Math.abs(expGrad[n - 1] - 0.5 * Math.exp(0.5 * (n - 1) * h)) < 1e-3
			)
		})

		test('cross-check against independent iterative reference (uniform spacing)', () => {
			// Deterministic LCG pseudo-random samples
			let seed = 123456789
			const nextRand = () => {
				seed = (1664525 * seed + 1013904223) >>> 0
				return (seed / 0xffffffff) * 20 - 10
			}

			for (const len of [2, 13, 128, 1025]) {
				const y = new Float64Array(len)
				for (let i = 0; i < len; i++) {
					y[i] = nextRand()
				}
				const h = 0.125
				const actual = gradientTypedRecursive(y, h)
				const expected = iterativeGradientReference(y, h)
				assertCloseArray(actual, expected, 1e-13)
			}
		})

		test('cross-check against independent iterative reference (non-uniform increasing and decreasing)', () => {
			let seed = 987654321
			const nextRand = () => {
				seed = (1664525 * seed + 1013904223) >>> 0
				return seed / 0xffffffff
			}

			const n = 257
			const xInc = new Float64Array(n)
			const xDec = new Float64Array(n)
			const y = new Float64Array(n)
			let accInc = -5
			let accDec = 100
			for (let i = 0; i < n; i++) {
				accInc += 0.05 + nextRand() * 0.5
				accDec -= 0.05 + nextRand() * 0.5
				xInc[i] = accInc
				xDec[i] = accDec
				y[i] = Math.sin(accInc) + 0.3 * accInc * accInc - 2 * nextRand()
			}

			assertCloseArray(
				gradientTypedRecursive(y, xInc),
				iterativeGradientReference(y, xInc),
				1e-10
			)
			assertCloseArray(
				gradientTypedRecursive(y, xDec),
				iterativeGradientReference(y, xDec),
				1e-10
			)
		})
	})
})
