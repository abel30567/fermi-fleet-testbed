import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { divergenceTypedIterative } from './divergenceTypedIterative.js'

/**
 * Helper to assert two Float64Arrays are element-wise close within `tol`.
 */
function assertCloseArray(actual, expected, tol = 1e-11) {
	assert.ok(actual instanceof Float64Array, 'result must be a Float64Array')
	assert.equal(actual.length, expected.length, 'length mismatch')
	for (let i = 0; i < actual.length; i++) {
		assert.ok(
			Math.abs(actual[i] - expected[i]) <= tol,
			`index ${i}: expected ${expected[i]}, got ${actual[i]} (diff=${Math.abs(actual[i] - expected[i])}, tol=${tol})`
		)
	}
}

describe('divergenceTypedIterative', () => {
	describe('normal cases', () => {
		it('computes 1D divergence for linear and quadratic fields with default and custom spacing', () => {
			// F(x) = 3x - 7 on x = 0, 1, 2, 3, 4 => div F = 3
			const n = 5
			const fxLinear = new Float64Array(n)
			for (let i = 0; i < n; i++) {
				fxLinear[i] = 3 * i - 7
			}
			const divLinear = divergenceTypedIterative([fxLinear], [n])
			assertCloseArray(divLinear, new Float64Array([3, 3, 3, 3, 3]))

			// F(x) = 2x^2 - 5x + 1 with h = 0.25 => div F = 4x - 5 (exact everywhere)
			const h = 0.25
			const fxQuad = new Float64Array(n)
			const expectedQuad = new Float64Array(n)
			for (let i = 0; i < n; i++) {
				const x = -0.5 + i * h
				fxQuad[i] = 2 * x * x - 5 * x + 1
				expectedQuad[i] = 4 * x - 5
			}
			const divQuad = divergenceTypedIterative([fxQuad], [n], h)
			assertCloseArray(divQuad, expectedQuad, 1e-12)
		})

		it('computes 2D divergence with anisotropic Array and Float64Array spacings', () => {
			// F(x, y) = (2x + y, -x + 3y) => div F = 2 + 3 = 5
			const nx = 4
			const ny = 5
			const hx = 0.5
			const hy = 0.25
			const total = nx * ny
			const fx = new Float64Array(total)
			const fy = new Float64Array(total)

			for (let ix = 0; ix < nx; ix++) {
				const x = ix * hx
				for (let iy = 0; iy < ny; iy++) {
					const y = iy * hy
					const idx = ix * ny + iy
					fx[idx] = 2 * x + y
					fy[idx] = -x + 3 * y
				}
			}

			const expected = new Float64Array(total).fill(5)
			const resArraySpacing = divergenceTypedIterative([fx, fy], [nx, ny], [hx, hy])
			const resTypedSpacing = divergenceTypedIterative(
				[fx, fy],
				[nx, ny],
				new Float64Array([hx, hy])
			)
			assertCloseArray(resArraySpacing, expected, 1e-12)
			assertCloseArray(resTypedSpacing, expected, 1e-12)
		})

		it('computes 4D divergence accurately across arbitrary dimensionality', () => {
			// F(w, x, y, z) = (w^2, -2x, 3y^2, 4z) => div F = 2w - 2 + 6y + 4 = 2w + 6y + 2
			const shape = [3, 3, 4, 3]
			const spacing = [0.5, 0.25, 0.2, 0.4]
			const total = 3 * 3 * 4 * 3
			const fw = new Float64Array(total)
			const fx = new Float64Array(total)
			const fy = new Float64Array(total)
			const fz = new Float64Array(total)
			const expected = new Float64Array(total)

			let idx = 0
			for (let iw = 0; iw < shape[0]; iw++) {
				const w = iw * spacing[0]
				for (let ix = 0; ix < shape[1]; ix++) {
					const x = ix * spacing[1]
					for (let iy = 0; iy < shape[2]; iy++) {
						const y = iy * spacing[2]
						for (let iz = 0; iz < shape[3]; iz++) {
							const z = iz * spacing[3]
							fw[idx] = w * w
							fx[idx] = -2 * x
							fy[idx] = 3 * y * y
							fz[idx] = 4 * z
							expected[idx] = 2 * w - 2 + 6 * y + 4
							idx++
						}
					}
				}
			}

			const res = divergenceTypedIterative([fw, fx, fy, fz], shape, spacing)
			assertCloseArray(res, expected, 1e-11)
		})

		it('does not mutate input arrays', () => {
			const fx = new Float64Array([1, 2, 3, 4, 5, 6])
			const fy = new Float64Array([6, 5, 4, 3, 2, 1])
			const fxCopy = new Float64Array(fx)
			const fyCopy = new Float64Array(fy)
			const shape = [2, 3]
			const spacing = [0.5, 0.25]

			divergenceTypedIterative([fx, fy], shape, spacing)

			assert.deepStrictEqual(fx, fxCopy)
			assert.deepStrictEqual(fy, fyCopy)
			assert.deepStrictEqual(shape, [2, 3])
			assert.deepStrictEqual(spacing, [0.5, 0.25])
		})
	})

	describe('analytical cross-checks and mathematical identities', () => {
		it('matches analytical divergence for 3D quadratic field F(x,y,z) = (x^2, y^2, z^2) -> 2x + 2y + 2z', () => {
			const shape = [5, 6, 4]
			const spacing = [0.2, 0.3, 0.5]
			const [nx, ny, nz] = shape
			const total = nx * ny * nz
			const fx = new Float64Array(total)
			const fy = new Float64Array(total)
			const fz = new Float64Array(total)
			const expected = new Float64Array(total)

			for (let ix = 0; ix < nx; ix++) {
				const x = -0.4 + ix * spacing[0]
				for (let iy = 0; iy < ny; iy++) {
					const y = -0.6 + iy * spacing[1]
					for (let iz = 0; iz < nz; iz++) {
						const z = -0.5 + iz * spacing[2]
						const idx = (ix * ny + iy) * nz + iz
						fx[idx] = x * x
						fy[idx] = y * y
						fz[idx] = z * z
						expected[idx] = 2 * x + 2 * y + 2 * z
					}
				}
			}

			const actual = divergenceTypedIterative([fx, fy, fz], shape, spacing)
			assertCloseArray(actual, expected, 1e-12)
		})

		it('yields zero for solenoidal (divergence-free) fields F = (-y, x, 0) and F = (yz, -xz, xy)', () => {
			const shape = [5, 5, 5]
			const spacing = [0.25, 0.5, 0.1]
			const [nx, ny, nz] = shape
			const total = nx * ny * nz

			const rotX = new Float64Array(total)
			const rotY = new Float64Array(total)
			const rotZ = new Float64Array(total)

			const solX = new Float64Array(total)
			const solY = new Float64Array(total)
			const solZ = new Float64Array(total)

			for (let ix = 0; ix < nx; ix++) {
				const x = -1 + ix * spacing[0]
				for (let iy = 0; iy < ny; iy++) {
					const y = -1 + iy * spacing[1]
					for (let iz = 0; iz < nz; iz++) {
						const z = -1 + iz * spacing[2]
						const idx = (ix * ny + iy) * nz + iz
						rotX[idx] = -y
						rotY[idx] = x
						rotZ[idx] = 0

						solX[idx] = y * z
						solY[idx] = -x * z
						solZ[idx] = x * y
					}
				}
			}

			const zeros = new Float64Array(total)
			assertCloseArray(divergenceTypedIterative([rotX, rotY, rotZ], shape, spacing), zeros, 1e-13)
			assertCloseArray(divergenceTypedIterative([solX, solY, solZ], shape, spacing), zeros, 1e-13)
		})

		it('satisfies linearity: div(a*F + b*G) = a*div(F) + b*div(G)', () => {
			const shape = [4, 5, 3]
			const spacing = [0.3, 0.2, 0.4]
			const total = 4 * 5 * 3
			const alpha = 2.5
			const beta = -1.75

			const f = [new Float64Array(total), new Float64Array(total), new Float64Array(total)]
			const g = [new Float64Array(total), new Float64Array(total), new Float64Array(total)]
			const comb = [new Float64Array(total), new Float64Array(total), new Float64Array(total)]

			for (let i = 0; i < total; i++) {
				f[0][i] = Math.sin(0.1 * i)
				f[1][i] = Math.cos(0.2 * i)
				f[2][i] = 0.01 * i * i
				g[0][i] = Math.exp(-0.05 * i)
				g[1][i] = -0.3 * i + 2
				g[2][i] = Math.sin(0.3 * i)
				for (let d = 0; d < 3; d++) {
					comb[d][i] = alpha * f[d][i] + beta * g[d][i]
				}
			}

			const divF = divergenceTypedIterative(f, shape, spacing)
			const divG = divergenceTypedIterative(g, shape, spacing)
			const divComb = divergenceTypedIterative(comb, shape, spacing)

			const expected = new Float64Array(total)
			for (let i = 0; i < total; i++) {
				expected[i] = alpha * divF[i] + beta * divG[i]
			}
			assertCloseArray(divComb, expected, 1e-12)
		})

		it('exhibits O(h^2) convergence on smooth transcendental field F = (sin(x)cos(y), cos(x)sin(y), exp(z))', () => {
			function maxAbsError(n) {
				const h = 1 / (n - 1)
				const total = n * n * n
				const fx = new Float64Array(total)
				const fy = new Float64Array(total)
				const fz = new Float64Array(total)
				const analytical = new Float64Array(total)

				for (let ix = 0; ix < n; ix++) {
					const x = ix * h
					for (let iy = 0; iy < n; iy++) {
						const y = iy * h
						for (let iz = 0; iz < n; iz++) {
							const z = iz * h
							const idx = (ix * n + iy) * n + iz
							fx[idx] = Math.sin(x) * Math.cos(y)
							fy[idx] = Math.cos(x) * Math.sin(y)
							fz[idx] = Math.exp(z)
							analytical[idx] = 2 * Math.cos(x) * Math.cos(y) + Math.exp(z)
						}
					}
				}

				const computed = divergenceTypedIterative([fx, fy, fz], [n, n, n], h)
				let maxErr = 0
				for (let i = 0; i < total; i++) {
					const err = Math.abs(computed[i] - analytical[i])
					if (err > maxErr) maxErr = err
				}
				return maxErr
			}

			// Grid spacing halves from h = 1/8 to h = 1/16 => error drops by ~4x
			const errCoarse = maxAbsError(9)
			const errFine = maxAbsError(17)
			const ratio = errCoarse / errFine

			assert.ok(errFine < 5e-3, `expected fine error < 5e-3, got ${errFine}`)
			assert.ok(
				ratio > 3.5 && ratio < 4.5,
				`expected O(h^2) refinement ratio near 4, got ${ratio} (coarse=${errCoarse}, fine=${errFine})`
			)
		})
	})

	describe('edge cases', () => {
		it('handles empty grids (dimension size 0)', () => {
			const res1D = divergenceTypedIterative([new Float64Array(0)], [0])
			assert.ok(res1D instanceof Float64Array)
			assert.equal(res1D.length, 0)

			const res3D = divergenceTypedIterative(
				[new Float64Array(0), new Float64Array(0), new Float64Array(0)],
				[3, 0, 2],
				[0.1, 0.2, 0.3]
			)
			assert.ok(res3D instanceof Float64Array)
			assert.equal(res3D.length, 0)
		})

		it('returns zeros for zero and constant vector fields (including negative constants)', () => {
			const shape = [3, 4]
			const total = 12
			const resZero = divergenceTypedIterative(
				[new Float64Array(total), new Float64Array(total)],
				shape
			)
			assert.deepStrictEqual(resZero, new Float64Array(total))

			const resConst = divergenceTypedIterative(
				[new Float64Array(total).fill(-42.5), new Float64Array(total).fill(17.25)],
				shape,
				[0.5, 0.25]
			)
			assertCloseArray(resConst, new Float64Array(total), 1e-13)
		})

		it('handles singleton dimensions (size 1) with zero partial derivative along singleton axes', () => {
			const res1 = divergenceTypedIterative([new Float64Array([99])], [1])
			assert.deepStrictEqual(res1, new Float64Array([0]))

			// shape [4, 1]: dFx/dx = 2, dFy/dy = 0 (singleton y)
			const fx = new Float64Array([0, 2, 4, 6])
			const fy = new Float64Array([10, 20, 30, 40])
			const res2 = divergenceTypedIterative([fx, fy], [4, 1], [1, 0.5])
			assertCloseArray(res2, new Float64Array([2, 2, 2, 2]), 1e-13)
		})

		it('handles 2-point axes using first-order one-sided differences', () => {
			// 1D: F(x) = -4x on [0, 0.5] => div F = -4
			const res1D = divergenceTypedIterative([new Float64Array([0, -2])], [2], 0.5)
			assertCloseArray(res1D, new Float64Array([-4, -4]), 1e-13)

			// 2D shape [2, 2]: F(x, y) = (3x, -5y) with spacing [2, 4] => div F = -2
			const fx = new Float64Array([0, 0, 6, 6])
			const fy = new Float64Array([0, -20, 0, -20])
			const res2D = divergenceTypedIterative([fx, fy], [2, 2], [2, 4])
			assertCloseArray(res2D, new Float64Array([-2, -2, -2, -2]), 1e-13)
		})

		it('handles very large finite spacing without 2*h overflow', () => {
			const hugeH = Number.MAX_VALUE * 0.75
			const fx = new Float64Array([-1e307, 0, 1e307])
			const res = divergenceTypedIterative([fx], [3], hugeH)
			const expectedVal = 1e307 / hugeH
			assertCloseArray(res, new Float64Array([expectedVal, expectedVal, expectedVal]), 1e-12)
		})
	})

	describe('input validation', () => {
		it('throws TypeError for invalid field, shape, or spacing types', () => {
			assert.throws(() => divergenceTypedIterative(null, [3]), TypeError)
			assert.throws(() => divergenceTypedIterative(new Float64Array(3), [3]), TypeError)
			assert.throws(() => divergenceTypedIterative([[1, 2, 3]], [3]), TypeError)
			assert.throws(() => divergenceTypedIterative([new Float32Array(3)], [3]), TypeError)
			assert.throws(() => divergenceTypedIterative([new Float64Array(3)], '3'), TypeError)
			assert.throws(() => divergenceTypedIterative([new Float64Array(3)], ['3']), TypeError)
			assert.throws(() => divergenceTypedIterative([new Float64Array(3)], [3], '1'), TypeError)
			assert.throws(() => divergenceTypedIterative([new Float64Array(3)], [3], null), TypeError)
			assert.throws(() => divergenceTypedIterative([new Float64Array(3)], [3], ['1']), TypeError)
		})

		it('throws RangeError for invalid shapes, mismatched dimensions/lengths, bad spacings, or non-finite values', () => {
			// Empty shape
			assert.throws(() => divergenceTypedIterative([], []), RangeError)

			// Invalid shape entries
			assert.throws(() => divergenceTypedIterative([new Float64Array(0)], [-1]), RangeError)
			assert.throws(() => divergenceTypedIterative([new Float64Array(3)], [2.5]), RangeError)
			assert.throws(() => divergenceTypedIterative([new Float64Array(3)], [NaN]), RangeError)
			assert.throws(() => divergenceTypedIterative([new Float64Array(3)], [Infinity]), RangeError)

			// Mismatched component count vs shape dimensionality
			assert.throws(() => divergenceTypedIterative([new Float64Array(4)], [2, 2]), RangeError)
			assert.throws(
				() => divergenceTypedIterative([new Float64Array(3), new Float64Array(3)], [3]),
				RangeError
			)

			// Mismatched component length vs prod(shape)
			assert.throws(() => divergenceTypedIterative([new Float64Array(2)], [3]), RangeError)
			assert.throws(
				() => divergenceTypedIterative([new Float64Array(6), new Float64Array(5)], [2, 3]),
				RangeError
			)

			// Invalid spacing values
			assert.throws(() => divergenceTypedIterative([new Float64Array(3)], [3], 0), RangeError)
			assert.throws(() => divergenceTypedIterative([new Float64Array(3)], [3], -0.5), RangeError)
			assert.throws(() => divergenceTypedIterative([new Float64Array(3)], [3], NaN), RangeError)
			assert.throws(
				() => divergenceTypedIterative([new Float64Array(3)], [3], Infinity),
				RangeError
			)
			assert.throws(
				() => divergenceTypedIterative([new Float64Array(4), new Float64Array(4)], [2, 2], [1]),
				RangeError
			)
			assert.throws(
				() =>
					divergenceTypedIterative([new Float64Array(4), new Float64Array(4)], [2, 2], [1, -1]),
				RangeError
			)
			assert.throws(
				() =>
					divergenceTypedIterative(
						[new Float64Array(4), new Float64Array(4)],
						[2, 2],
						new Float64Array([1, 0])
					),
				RangeError
			)

			// Non-finite values in field
			assert.throws(
				() => divergenceTypedIterative([new Float64Array([1, NaN, 3])], [3]),
				RangeError
			)
			assert.throws(
				() => divergenceTypedIterative([new Float64Array([1, Infinity, 3])], [3]),
				RangeError
			)
			assert.throws(
				() => divergenceTypedIterative([new Float64Array([1, -Infinity, 3])], [3]),
				RangeError
			)
		})
	})
})
