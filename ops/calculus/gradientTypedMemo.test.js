import { describe, test } from 'node:test'
import assert from 'node:assert'
import { gradientTypedMemo } from './gradientTypedMemo.js'

/**
 * Helper to assert two Float64Arrays are element-wise close within tolerance.
 * @param {Float64Array} actual
 * @param {Float64Array | number[]} expected
 * @param {number} [tol=1e-12]
 */
function assertCloseArray(actual, expected, tol = 1e-12) {
	assert.ok(actual instanceof Float64Array, 'Expected Float64Array output')
	assert.strictEqual(actual.length, expected.length)
	for (let i = 0; i < expected.length; i++) {
		assert.ok(
			Math.abs(actual[i] - expected[i]) <= tol,
			`Index ${i}: expected ${expected[i]}, got ${actual[i]} (diff=${Math.abs(actual[i] - expected[i])})`,
		)
	}
}

describe('gradientTypedMemo', () => {
	describe('1D scalar fields', () => {
		test('constant field yields exact zeros without negative zero', () => {
			const f = new Float64Array([7.5, 7.5, 7.5, 7.5, 7.5])
			const g = gradientTypedMemo(f)
			assertCloseArray(g, [0, 0, 0, 0, 0], 0)
			for (let i = 0; i < g.length; i++) {
				assert.ok(Object.is(g[i], 0), `Expected +0 at index ${i}`)
			}
		})

		test('linear function f(x) = 3x - 2 with default and custom spacing', () => {
			const h = 0.25
			const n = 8
			const f = new Float64Array(n)
			for (let i = 0; i < n; i++) {
				const x = i * h
				f[i] = 3 * x - 2
			}
			const g = gradientTypedMemo(f, h)
			assertCloseArray(g, new Array(n).fill(3), 1e-12)

			const fUnit = new Float64Array([2, 5, 8, 11, 14])
			const gUnit = gradientTypedMemo(fUnit)
			assertCloseArray(gUnit, [3, 3, 3, 3, 3], 1e-12)
		})

		test('quadratic function f(x) = 4x^2 - 5x + 1 is exact at interior and boundaries', () => {
			const h = 0.5
			const n = 7
			const f = new Float64Array(n)
			const exact = new Float64Array(n)
			for (let i = 0; i < n; i++) {
				const x = -1 + i * h
				f[i] = 4 * x * x - 5 * x + 1
				exact[i] = 8 * x - 5
			}
			const g = gradientTypedMemo(f, h)
			assertCloseArray(g, exact, 1e-12)
		})

		test('2-element 1D array falls back to 1st-order difference automatically', () => {
			const f = new Float64Array([10, 16])
			const g = gradientTypedMemo(f, 2)
			assertCloseArray(g, [3, 3], 1e-12)
		})

		test('explicit edgeOrder: 1 uses first-order boundary stencils', () => {
			// f(x) = x^2 at x = 0, 1, 2, 3 -> f = [0, 1, 4, 9]
			// 1st-order boundaries: (1 - 0)/1 = 1, (9 - 4)/1 = 5
			// central interior: (4 - 0)/2 = 2, (9 - 1)/2 = 4
			const f = new Float64Array([0, 1, 4, 9])
			const g = gradientTypedMemo(f, 1, { edgeOrder: 1 })
			assertCloseArray(g, [1, 2, 4, 5], 1e-12)
		})

		test('subarray views with non-zero byteOffset compute accurately', () => {
			const backing = new Float64Array([999, 1, 4, 9, 16, 25, -999])
			const view = backing.subarray(1, 6) // x^2 for x = 1..5
			const g = gradientTypedMemo(view, 1)
			assertCloseArray(g, [2, 4, 6, 8, 10], 1e-12)
		})
	})

	describe('n-D scalar fields and analytic cross-checks', () => {
		test('2D analytic cross-check: f(x, y) = 2x^2 + 3xy - y^2 with non-uniform axis spacings', () => {
			const nx = 6
			const ny = 5
			const dx = 0.4
			const dy = 0.7
			const x0 = -0.8
			const y0 = 0.3

			const values = new Float64Array(nx * ny)
			const exactDx = new Float64Array(nx * ny)
			const exactDy = new Float64Array(nx * ny)

			for (let i = 0; i < nx; i++) {
				const x = x0 + i * dx
				for (let j = 0; j < ny; j++) {
					const y = y0 + j * dy
					const idx = i * ny + j
					values[idx] = 2 * x * x + 3 * x * y - y * y
					// Analytic partial derivatives:
					// ∂f/∂x = 4x + 3y
					// ∂f/∂y = 3x - 2y
					exactDx[idx] = 4 * x + 3 * y
					exactDy[idx] = 3 * x - 2 * y
				}
			}

			const grad = gradientTypedMemo(values, [dx, dy], { shape: [nx, ny] })
			assert.ok(Array.isArray(grad))
			assert.strictEqual(grad.length, 2)
			assertCloseArray(grad[0], exactDx, 1e-11)
			assertCloseArray(grad[1], exactDy, 1e-11)
		})

		test('3D analytic cross-check: f(x, y, z) = x^2 - 2yz + 5z^2 + 4x', () => {
			const shape = [4, 3, 5]
			const spacing = new Float64Array([0.5, 1.25, 0.2])
			const [nx, ny, nz] = shape
			const [dx, dy, dz] = spacing
			const total = nx * ny * nz

			const values = new Float64Array(total)
			const exactDx = new Float64Array(total)
			const exactDy = new Float64Array(total)
			const exactDz = new Float64Array(total)

			for (let i = 0; i < nx; i++) {
				const x = i * dx
				for (let j = 0; j < ny; j++) {
					const y = j * dy
					for (let k = 0; k < nz; k++) {
						const z = k * dz
						const idx = (i * ny + j) * nz + k
						values[idx] = x * x - 2 * y * z + 5 * z * z + 4 * x
						exactDx[idx] = 2 * x + 4
						exactDy[idx] = -2 * z
						exactDz[idx] = -2 * y + 10 * z
					}
				}
			}

			const grad = gradientTypedMemo(values, spacing, { shape })
			assert.strictEqual(grad.length, 3)
			assertCloseArray(grad[0], exactDx, 1e-11)
			assertCloseArray(grad[1], exactDy, 1e-11)
			assertCloseArray(grad[2], exactDz, 1e-11)
		})

		test('smooth trig function cross-check: f(x) = sin(x) converges at O(h^2)', () => {
			const h = 1e-3
			const n = 21
			const f = new Float64Array(n)
			const exact = new Float64Array(n)
			for (let i = 0; i < n; i++) {
				const x = i * h
				f[i] = Math.sin(x)
				exact[i] = Math.cos(x)
			}
			const g = gradientTypedMemo(f, h)
			assertCloseArray(g, exact, 1e-6)
		})

		test('explicit 1D shape returns a single Float64Array', () => {
			const f = new Float64Array([1, 4, 9, 16])
			const g = gradientTypedMemo(f, [1], { shape: [4] })
			assert.ok(g instanceof Float64Array)
			assertCloseArray(g, [2, 4, 6, 8], 1e-12)
		})
	})

	describe('memoization and cache isolation', () => {
		test('mutating returned 1D Float64Array does not corrupt cached result', () => {
			const f = new Float64Array([0, 1, 4, 9, 16])
			const first = gradientTypedMemo(f, 1)
			assertCloseArray(first, [0, 2, 4, 6, 8], 1e-12)

			// Corrupt caller's returned buffer
			first.fill(-12345)

			const second = gradientTypedMemo(f, 1)
			assert.notStrictEqual(first, second)
			assertCloseArray(second, [0, 2, 4, 6, 8], 1e-12)
		})

		test('mutating returned n-D array or its Float64Array buffers does not corrupt cache', () => {
			const f = new Float64Array([1, 2, 3, 4, 5, 6])
			const first = gradientTypedMemo(f, [1, 1], { shape: [2, 3] })
			assert.ok(Array.isArray(first))

			first[0].fill(999)
			first[1].fill(-999)
			first.pop()

			const second = gradientTypedMemo(f, [1, 1], { shape: [2, 3] })
			assert.strictEqual(second.length, 2)
			assertCloseArray(second[0], [3, 3, 3, 3, 3, 3], 1e-12)
			assertCloseArray(second[1], [1, 1, 1, 1, 1, 1], 1e-12)
		})

		test('in-place mutation of input Float64Array invalidates cache and recomputes', () => {
			const f = new Float64Array([0, 2, 4, 6])
			const g1 = gradientTypedMemo(f, 1)
			assertCloseArray(g1, [2, 2, 2, 2], 1e-12)

			// Mutate input in-place: now f(x) = 5x
			f[0] = 0
			f[1] = 5
			f[2] = 10
			f[3] = 15

			const g2 = gradientTypedMemo(f, 1)
			assertCloseArray(g2, [5, 5, 5, 5], 1e-12)
		})

		test('same input values with different spacing, shape, or edgeOrder do not collide in cache', () => {
			const f = new Float64Array([0, 1, 4, 9, 16, 25])
			const g1 = gradientTypedMemo(f, 1)
			const g2 = gradientTypedMemo(f, 0.5)
			const g3 = gradientTypedMemo(f, 1, { edgeOrder: 1 })
			const g2d = gradientTypedMemo(f, 1, { shape: [2, 3] })

			assertCloseArray(g1, [0, 2, 4, 6, 8, 10], 1e-12)
			assertCloseArray(g2, [0, 4, 8, 12, 16, 20], 1e-12)
			assertCloseArray(g3, [1, 2, 4, 6, 8, 9], 1e-12)
			assert.ok(Array.isArray(g2d))
			assert.strictEqual(g2d.length, 2)
		})

		test('memoize: false matches memoized output exactly', () => {
			const f = new Float64Array([2, 5, 10, 17, 26])
			const memoized = gradientTypedMemo(f, 0.5, { memoize: true })
			const unmemoized = gradientTypedMemo(f, 0.5, { memoize: false })
			assert.deepStrictEqual(unmemoized, memoized)
		})

		test('negative zero and positive zero inputs produce identical clean outputs', () => {
			const fPos = new Float64Array([0, 1, 2])
			const fNeg = new Float64Array([-0, 1, 2])
			assert.deepStrictEqual(gradientTypedMemo(fNeg, 1), gradientTypedMemo(fPos, 1))
		})
	})

	describe('input validation and error handling', () => {
		test('rejects non-Float64Array values', () => {
			assert.throws(() => gradientTypedMemo([1, 2, 3]), TypeError)
			assert.throws(() => gradientTypedMemo(new Float32Array([1, 2, 3])), TypeError)
			assert.throws(() => gradientTypedMemo(new Int32Array([1, 2, 3])), TypeError)
			assert.throws(() => gradientTypedMemo(null), TypeError)
			assert.throws(() => gradientTypedMemo('123'), TypeError)
		})

		test('rejects empty, single-element, and non-finite values', () => {
			assert.throws(() => gradientTypedMemo(new Float64Array([])), RangeError)
			assert.throws(() => gradientTypedMemo(new Float64Array([42])), RangeError)
			assert.throws(() => gradientTypedMemo(new Float64Array([1, NaN, 3])), RangeError)
			assert.throws(() => gradientTypedMemo(new Float64Array([1, Infinity, 3])), RangeError)
			assert.throws(() => gradientTypedMemo(new Float64Array([-Infinity, 2, 3])), RangeError)
		})

		test('rejects invalid spacing types and values', () => {
			const f = new Float64Array([1, 2, 3, 4])
			assert.throws(() => gradientTypedMemo(f, 0), RangeError)
			assert.throws(() => gradientTypedMemo(f, -1), RangeError)
			assert.throws(() => gradientTypedMemo(f, NaN), RangeError)
			assert.throws(() => gradientTypedMemo(f, Infinity), RangeError)
			assert.throws(() => gradientTypedMemo(f, '1'), TypeError)
			assert.throws(() => gradientTypedMemo(f, {}), TypeError)
			assert.throws(() => gradientTypedMemo(f, null), TypeError)
			assert.throws(() => gradientTypedMemo(f, [1, 2]), RangeError)
			assert.throws(() => gradientTypedMemo(f, [1, -2], { shape: [2, 2] }), RangeError)
			assert.throws(() => gradientTypedMemo(f, [1, '2'], { shape: [2, 2] }), TypeError)
		})

		test('rejects invalid options, shape, edgeOrder, and memoize', () => {
			const f = new Float64Array([1, 2, 3, 4])
			assert.throws(() => gradientTypedMemo(f, 1, null), TypeError)
			assert.throws(() => gradientTypedMemo(f, 1, []), TypeError)
			assert.throws(() => gradientTypedMemo(f, 1, { shape: '2x2' }), TypeError)
			assert.throws(() => gradientTypedMemo(f, 1, { shape: [] }), RangeError)
			assert.throws(() => gradientTypedMemo(f, 1, { shape: [1, 4] }), RangeError)
			assert.throws(() => gradientTypedMemo(f, 1, { shape: [2, 3] }), RangeError)
			assert.throws(() => gradientTypedMemo(f, 1, { shape: [2.5, 2] }), RangeError)
			assert.throws(() => gradientTypedMemo(f, 1, { shape: ['2', 2] }), TypeError)
			assert.throws(() => gradientTypedMemo(f, 1, { edgeOrder: 3 }), RangeError)
			assert.throws(() => gradientTypedMemo(f, 1, { edgeOrder: '2' }), TypeError)
			assert.throws(() => gradientTypedMemo(f, 1, { shape: [2, 2], edgeOrder: 2 }), RangeError)
			assert.throws(() => gradientTypedMemo(new Float64Array([1, 2]), 1, { edgeOrder: 2 }), RangeError)
			assert.throws(() => gradientTypedMemo(f, 1, { memoize: 'yes' }), TypeError)
		})
	})
})
