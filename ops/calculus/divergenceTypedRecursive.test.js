import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { divergenceTypedRecursive } from './divergenceTypedRecursive.js'

/**
 * Helper to assert two Float64Arrays are close element-by-element.
 */
function assertCloseArray(actual, expected, tol = 1e-12) {
	assert.ok(actual instanceof Float64Array, 'result must be a Float64Array')
	assert.equal(actual.length, expected.length, 'array lengths must match')
	for (let i = 0; i < actual.length; i++) {
		const diff = Math.abs(actual[i] - expected[i])
		assert.ok(
			diff <= tol,
			`Mismatch at index ${i}: actual=${actual[i]}, expected=${expected[i]}, diff=${diff} > ${tol}`,
		)
	}
}

/**
 * Independent iterative reference implementation of discrete divergence
 * using nested loops for cross-checking against divergenceTypedRecursive.
 */
function iterativeDivergence3D(fx, fy, fz, nx, ny, nz, hx, hy, hz) {
	const out = new Float64Array(nx * ny * nz)
	const idx = (i, j, k) => (i * ny + j) * nz + k

	for (let i = 0; i < nx; i++) {
		for (let j = 0; j < ny; j++) {
			for (let k = 0; k < nz; k++) {
				let dfx
				if (nx === 2) {
					dfx = (fx[idx(1, j, k)] - fx[idx(0, j, k)]) / hx
				} else if (i === 0) {
					dfx =
						(-3 * fx[idx(0, j, k)] +
							4 * fx[idx(1, j, k)] -
							fx[idx(2, j, k)]) /
						(2 * hx)
				} else if (i === nx - 1) {
					dfx =
						(3 * fx[idx(nx - 1, j, k)] -
							4 * fx[idx(nx - 2, j, k)] +
							fx[idx(nx - 3, j, k)]) /
						(2 * hx)
				} else {
					dfx = (fx[idx(i + 1, j, k)] - fx[idx(i - 1, j, k)]) / (2 * hx)
				}

				let dfy
				if (ny === 2) {
					dfy = (fy[idx(i, 1, k)] - fy[idx(i, 0, k)]) / hy
				} else if (j === 0) {
					dfy =
						(-3 * fy[idx(i, 0, k)] +
							4 * fy[idx(i, 1, k)] -
							fy[idx(i, 2, k)]) /
						(2 * hy)
				} else if (j === ny - 1) {
					dfy =
						(3 * fy[idx(i, ny - 1, k)] -
							4 * fy[idx(i, ny - 2, k)] +
							fy[idx(i, ny - 3, k)]) /
						(2 * hy)
				} else {
					dfy = (fy[idx(i, j + 1, k)] - fy[idx(i, j - 1, k)]) / (2 * hy)
				}

				let dfz
				if (nz === 2) {
					dfz = (fz[idx(i, j, 1)] - fz[idx(i, j, 0)]) / hz
				} else if (k === 0) {
					dfz =
						(-3 * fz[idx(i, j, 0)] +
							4 * fz[idx(i, j, 1)] -
							fz[idx(i, j, 2)]) /
						(2 * hz)
				} else if (k === nz - 1) {
					dfz =
						(3 * fz[idx(i, j, nz - 1)] -
							4 * fz[idx(i, j, nz - 2)] +
							fz[idx(i, j, nz - 3)]) /
						(2 * hz)
				} else {
					dfz = (fz[idx(i, j, k + 1)] - fz[idx(i, j, k - 1)]) / (2 * hz)
				}

				out[idx(i, j, k)] = dfx + dfy + dfz
			}
		}
	}
	return out
}

describe('divergenceTypedRecursive', () => {
	describe('normal cases', () => {
		test('1D constant field has zero divergence (default shape and spacing)', () => {
			const fx = new Float64Array([7, 7, 7, 7, 7])
			const div = divergenceTypedRecursive([fx])
			assertCloseArray(div, new Float64Array([0, 0, 0, 0, 0]))
		})

		test('1D linear field with custom spacing', () => {
			const n = 6
			const h = 0.5
			const fx = new Float64Array(n)
			for (let i = 0; i < n; i++) {
				const x = i * h
				fx[i] = 3 * x + 2
			}
			const div = divergenceTypedRecursive([fx], [n], h)
			const expected = new Float64Array(n).fill(3)
			assertCloseArray(div, expected)
		})

		test('1D quadratic field is exact at interior and boundaries', () => {
			const n = 8
			const h = 0.25
			const fx = new Float64Array(n)
			const expected = new Float64Array(n)
			for (let i = 0; i < n; i++) {
				const x = i * h
				fx[i] = 2 * x * x - 4 * x + 1
				expected[i] = 4 * x - 4
			}
			const div = divergenceTypedRecursive([fx], [n], h)
			assertCloseArray(div, expected)
		})

		test('2D quadratic field with non-uniform spacings matches analytical divergence', () => {
			const nx = 5
			const ny = 6
			const hx = 0.25
			const hy = 0.5
			const fx = new Float64Array(nx * ny)
			const fy = new Float64Array(nx * ny)
			const expected = new Float64Array(nx * ny)

			for (let i = 0; i < nx; i++) {
				const x = i * hx
				for (let j = 0; j < ny; j++) {
					const y = j * hy
					const idx = i * ny + j
					// F(x, y) = (2x^2 + 3y, -y^2 + 5x) => div F = 4x - 2y
					fx[idx] = 2 * x * x + 3 * y
					fy[idx] = -y * y + 5 * x
					expected[idx] = 4 * x - 2 * y
				}
			}

			const div = divergenceTypedRecursive([fx, fy], [nx, ny], [hx, hy])
			assertCloseArray(div, expected)
		})

		test('2D rotational (divergence-free) field F = (-y, x) yields 0', () => {
			const nx = 4
			const ny = 5
			const fx = new Float64Array(nx * ny)
			const fy = new Float64Array(nx * ny)
			for (let i = 0; i < nx; i++) {
				for (let j = 0; j < ny; j++) {
					const idx = i * ny + j
					fx[idx] = -j
					fy[idx] = i
				}
			}
			const div = divergenceTypedRecursive([fx, fy], [nx, ny])
			assertCloseArray(div, new Float64Array(nx * ny))
		})

		test('3D polynomial field with Float64Array spacings matches analytical divergence', () => {
			const [nx, ny, nz] = [4, 5, 4]
			const spacings = new Float64Array([0.2, 0.5, 0.25])
			const [hx, hy, hz] = spacings
			const total = nx * ny * nz
			const fx = new Float64Array(total)
			const fy = new Float64Array(total)
			const fz = new Float64Array(total)
			const expected = new Float64Array(total)

			for (let i = 0; i < nx; i++) {
				const x = i * hx
				for (let j = 0; j < ny; j++) {
					const y = j * hy
					for (let k = 0; k < nz; k++) {
						const z = k * hz
						const idx = (i * ny + j) * nz + k
						// F = (x^2 + yz, 2y^2 - xz, -3z^2 + xy) => div F = 2x + 4y - 6z
						fx[idx] = x * x + y * z
						fy[idx] = 2 * y * y - x * z
						fz[idx] = -3 * z * z + x * y
						expected[idx] = 2 * x + 4 * y - 6 * z
					}
				}
			}

			const div = divergenceTypedRecursive(
				[fx, fy, fz],
				[nx, ny, nz],
				spacings,
			)
			assertCloseArray(div, expected, 1e-11)
		})

		test('4D linear field sums all 4 partial derivatives recursively', () => {
			const shape = [3, 3, 3, 3]
			const spacings = [0.5, 1, 2, 0.25]
			const total = 81
			const comps = Array.from({ length: 4 }, () => new Float64Array(total))

			let idx = 0
			for (let a = 0; a < 3; a++) {
				for (let b = 0; b < 3; b++) {
					for (let c = 0; c < 3; c++) {
						for (let d = 0; d < 3; d++) {
							comps[0][idx] = 1 * (a * spacings[0])
							comps[1][idx] = 2 * (b * spacings[1])
							comps[2][idx] = 3 * (c * spacings[2])
							comps[3][idx] = 4 * (d * spacings[3])
							idx++
						}
					}
				}
			}

			const div = divergenceTypedRecursive(comps, shape, spacings)
			const expected = new Float64Array(total).fill(1 + 2 + 3 + 4)
			assertCloseArray(div, expected)
		})
	})

	describe('edge cases', () => {
		test('minimal 2-point 1D grid uses first-order differences', () => {
			const fx = new Float64Array([1.5, 4.5])
			const div = divergenceTypedRecursive([fx], [2], 0.5)
			assertCloseArray(div, new Float64Array([6, 6]))
		})

		test('minimal 2x2 2D grid', () => {
			// F = (2x, -3y) on [0, 1] x [0, 2]
			const fx = new Float64Array([0, 0, 2, 2])
			const fy = new Float64Array([0, -6, 0, -6])
			const div = divergenceTypedRecursive([fx, fy], [2, 2], [1, 2])
			assertCloseArray(div, new Float64Array([-1, -1, -1, -1]))
		})

		test('mixed axis sizes (one axis length 2, one axis length >= 3)', () => {
			const nx = 2
			const ny = 5
			const hx = 0.5
			const hy = 0.25
			const fx = new Float64Array(nx * ny)
			const fy = new Float64Array(nx * ny)
			const expected = new Float64Array(nx * ny)

			for (let i = 0; i < nx; i++) {
				const x = i * hx
				for (let j = 0; j < ny; j++) {
					const y = j * hy
					const idx = i * ny + j
					// Linear in x (exact for 2-point diff), quadratic in y (exact for 5-point 2nd order)
					fx[idx] = 3 * x + 1
					fy[idx] = y * y - 2 * y
					expected[idx] = 3 + (2 * y - 2)
				}
			}

			const div = divergenceTypedRecursive([fx, fy], [nx, ny], [hx, hy])
			assertCloseArray(div, expected)
		})

		test('odd / non-power-of-two grid sizes and larger grid stack safety', () => {
			const nx = 33
			const ny = 37
			const nz = 11
			const total = nx * ny * nz // 13431 elements
			const hx = 0.1
			const hy = 0.2
			const hz = 0.3
			const fx = new Float64Array(total)
			const fy = new Float64Array(total)
			const fz = new Float64Array(total)

			for (let i = 0; i < nx; i++) {
				for (let j = 0; j < ny; j++) {
					for (let k = 0; k < nz; k++) {
						const idx = (i * ny + j) * nz + k
						fx[idx] = 1.5 * (i * hx)
						fy[idx] = -0.5 * (j * hy)
						fz[idx] = 2.0 * (k * hz)
					}
				}
			}

			const div = divergenceTypedRecursive([fx, fy, fz], [nx, ny, nz], [hx, hy, hz])
			const expected = new Float64Array(total).fill(3.0)
			assertCloseArray(div, expected, 1e-11)
		})

		test('does not mutate inputs and handles aliased component arrays', () => {
			// f(x, y) = x + y on a 3x3 unit grid => F = (f, f) => div F = 1 + 1 = 2
			const f = new Float64Array([0, 1, 2, 1, 2, 3, 2, 3, 4])
			const snapshot = new Float64Array(f)
			const shape = [3, 3]
			const spacings = [1, 1]

			const div = divergenceTypedRecursive([f, f], shape, spacings)
			assertCloseArray(div, new Float64Array(9).fill(2))
			assert.deepEqual(f, snapshot)
			assert.deepEqual(shape, [3, 3])
			assert.deepEqual(spacings, [1, 1])
		})
	})

	describe('cross-checks against independent analytical and iterative implementations', () => {
		test('cross-check against analytical divergence of smooth 3D trig/exp field with O(h^2) convergence', () => {
			function maxAnalyticalError(n) {
				const h = 1 / (n - 1)
				const total = n * n * n
				const fx = new Float64Array(total)
				const fy = new Float64Array(total)
				const fz = new Float64Array(total)
				const exact = new Float64Array(total)

				for (let i = 0; i < n; i++) {
					const x = i * h
					for (let j = 0; j < n; j++) {
						const y = j * h
						for (let k = 0; k < n; k++) {
							const z = k * h
							const idx = (i * n + j) * n + k
							// F = (sin(x)cos(y), cos(x)sin(y), exp(0.5*z))
							// div F = 2*cos(x)cos(y) + 0.5*exp(0.5*z)
							fx[idx] = Math.sin(x) * Math.cos(y)
							fy[idx] = Math.cos(x) * Math.sin(y)
							fz[idx] = Math.exp(0.5 * z)
							exact[idx] = 2 * Math.cos(x) * Math.cos(y) + 0.5 * Math.exp(0.5 * z)
						}
					}
				}

				const computed = divergenceTypedRecursive([fx, fy, fz], [n, n, n], h)
				let maxErr = 0
				for (let m = 0; m < total; m++) {
					const err = Math.abs(computed[m] - exact[m])
					if (err > maxErr) maxErr = err
				}
				return maxErr
			}

			const errCoarse = maxAnalyticalError(9) // h = 1/8
			const errFine = maxAnalyticalError(17) // h = 1/16

			assert.ok(errCoarse < 0.02, `Expected coarse error < 0.02, got ${errCoarse}`)
			assert.ok(errFine < 0.005, `Expected fine error < 0.005, got ${errFine}`)
			// Second-order scheme: halving h reduces error by ~4x
			const ratio = errCoarse / errFine
			assert.ok(
				ratio > 3.5 && ratio < 4.5,
				`Expected O(h^2) convergence ratio ~4, got ${ratio}`,
			)
		})

		test('cross-check against independent iterative 3D divergence on non-polynomial field', () => {
			const [nx, ny, nz] = [7, 6, 5]
			const [hx, hy, hz] = [0.13, 0.29, 0.41]
			const total = nx * ny * nz
			const fx = new Float64Array(total)
			const fy = new Float64Array(total)
			const fz = new Float64Array(total)

			for (let idx = 0; idx < total; idx++) {
				fx[idx] = Math.sin(idx * 0.37) + Math.cos(idx * 0.11)
				fy[idx] = Math.cos(idx * 0.53) - Math.sin(idx * 0.19)
				fz[idx] = Math.sin(idx * 0.23) * Math.cos(idx * 0.43)
			}

			const recursiveResult = divergenceTypedRecursive(
				[fx, fy, fz],
				[nx, ny, nz],
				[hx, hy, hz],
			)
			const iterativeResult = iterativeDivergence3D(
				fx,
				fy,
				fz,
				nx,
				ny,
				nz,
				hx,
				hy,
				hz,
			)

			assertCloseArray(recursiveResult, iterativeResult, 1e-13)
		})
	})

	describe('input validation', () => {
		test('rejects invalid components argument', () => {
			assert.throws(() => divergenceTypedRecursive(null), TypeError)
			assert.throws(() => divergenceTypedRecursive(undefined), TypeError)
			assert.throws(() => divergenceTypedRecursive(new Float64Array([1, 2])), TypeError)
			assert.throws(() => divergenceTypedRecursive([]), RangeError)
			assert.throws(() => divergenceTypedRecursive([[1, 2, 3]]), TypeError)
			assert.throws(
				() => divergenceTypedRecursive([new Float32Array([1, 2, 3])]),
				TypeError,
			)
			assert.throws(
				() =>
					divergenceTypedRecursive(
						[new Float64Array(4), new Float64Array(6)],
						[2, 2],
					),
				RangeError,
			)
		})

		test('rejects non-finite values in component arrays', () => {
			assert.throws(
				() => divergenceTypedRecursive([new Float64Array([1, NaN, 3])]),
				RangeError,
			)
			assert.throws(
				() => divergenceTypedRecursive([new Float64Array([1, Infinity, 3])]),
				RangeError,
			)
			assert.throws(
				() => divergenceTypedRecursive([new Float64Array([-Infinity, 2, 3])]),
				RangeError,
			)
		})

		test('rejects invalid shape argument', () => {
			const a = new Float64Array(4)
			const b = new Float64Array(4)
			// Omitted shape for multi-dimensional field
			assert.throws(() => divergenceTypedRecursive([a, b]), TypeError)
			// Non-array shape
			assert.throws(() => divergenceTypedRecursive([a], 4), TypeError)
			assert.throws(() => divergenceTypedRecursive([a], null), TypeError)
			// Wrong shape length
			assert.throws(() => divergenceTypedRecursive([a, b], [4]), RangeError)
			// Non-integer or < 2 dimension
			assert.throws(() => divergenceTypedRecursive([a], [2.5]), TypeError)
			assert.throws(() => divergenceTypedRecursive([a], ['4']), TypeError)
			assert.throws(() => divergenceTypedRecursive([new Float64Array([1])]), RangeError)
			assert.throws(
				() => divergenceTypedRecursive([a, b], [1, 4]),
				RangeError,
			)
			assert.throws(() => divergenceTypedRecursive([a], [-4]), RangeError)
			// Shape product mismatch
			assert.throws(
				() => divergenceTypedRecursive([a, b], [2, 3]),
				RangeError,
			)
		})

		test('rejects invalid spacings argument', () => {
			const a = new Float64Array([1, 2, 3, 4])
			const b = new Float64Array([1, 2, 3, 4])

			assert.throws(() => divergenceTypedRecursive([a], [4], 0), RangeError)
			assert.throws(() => divergenceTypedRecursive([a], [4], -1), RangeError)
			assert.throws(() => divergenceTypedRecursive([a], [4], NaN), RangeError)
			assert.throws(() => divergenceTypedRecursive([a], [4], Infinity), RangeError)
			assert.throws(() => divergenceTypedRecursive([a], [4], '1'), TypeError)
			assert.throws(() => divergenceTypedRecursive([a], [4], null), TypeError)
			assert.throws(
				() => divergenceTypedRecursive([a, b], [2, 2], [1]),
				RangeError,
			)
			assert.throws(
				() => divergenceTypedRecursive([a, b], [2, 2], [1, 0]),
				RangeError,
			)
			assert.throws(
				() => divergenceTypedRecursive([a, b], [2, 2], [1, -0.5]),
				RangeError,
			)
			assert.throws(
				() => divergenceTypedRecursive([a, b], [2, 2], [1, NaN]),
				RangeError,
			)
			assert.throws(
				() => divergenceTypedRecursive([a, b], [2, 2], [1, '2']),
				TypeError,
			)
		})
	})
})
