import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { gradientTypedSeries } from './gradientTypedSeries.js'

function assertClose(actual, expected, tol = 1e-11, message = '') {
	assert.ok(
		Math.abs(actual - expected) <= tol,
		`${message ? message + ': ' : ''}expected ${actual} to be within ${tol} of ${expected} (diff=${Math.abs(actual - expected)})`
	)
}

describe('gradientTypedSeries', () => {
	describe('1D scalar fields', () => {
		it('computes exact gradient for a 1D linear field with default shape and spacing', () => {
			const n = 6
			const field = new Float64Array(n)
			for (let i = 0; i < n; i++) {
				field[i] = 3.5 * i - 7.25
			}
			const grad = gradientTypedSeries(field)
			assert.equal(grad.length, 1)
			assert.ok(grad[0] instanceof Float64Array)
			assert.equal(grad[0].length, n)
			for (let i = 0; i < n; i++) {
				assertClose(grad[0][i], 3.5, 1e-12, `index ${i}`)
			}
		})

		it('computes exact gradient for a 1D quadratic field (interior & boundaries)', () => {
			const n = 9
			const h = 0.25
			const field = new Float64Array(n)
			for (let i = 0; i < n; i++) {
				const x = -1.0 + i * h
				field[i] = 2.5 * x * x - 4.0 * x + 1.25
			}
			const [dfdx] = gradientTypedSeries(field, [n], [h])
			for (let i = 0; i < n; i++) {
				const x = -1.0 + i * h
				const expected = 5.0 * x - 4.0
				assertClose(dfdx[i], expected, 1e-12, `1D quadratic at i=${i}`)
			}
		})

		it('exhibits O(h^2) convergence on sin(x) including boundaries', () => {
			const maxError = (n) => {
				const h = (2 * Math.PI) / (n - 1)
				const field = new Float64Array(n)
				for (let i = 0; i < n; i++) {
					field[i] = Math.sin(i * h)
				}
				const [dfdx] = gradientTypedSeries(field, [n], h)
				let err = 0
				for (let i = 0; i < n; i++) {
					err = Math.max(err, Math.abs(dfdx[i] - Math.cos(i * h)))
				}
				return err
			}

			const errCoarse = maxError(65)
			const errFine = maxError(129)
			const ratio = errCoarse / errFine
			assert.ok(
				errFine < 1e-3 && ratio > 3.9 && ratio < 4.1,
				`expected O(h^2) convergence ratio ~4, got ratio=${ratio}, errCoarse=${errCoarse}, errFine=${errFine}`
			)
		})
	})

	describe('2D and N-D scalar fields', () => {
		it('computes exact partial derivatives for a 2D quadratic field with non-uniform spacings', () => {
			const nx = 5
			const ny = 6
			const hx = 0.5
			const hy = 0.2
			const field = new Float64Array(nx * ny)

			for (let i = 0; i < nx; i++) {
				const x = i * hx
				for (let j = 0; j < ny; j++) {
					const y = j * hy
					field[i * ny + j] = 3 * x * x - 2 * x * y + 5 * y * y + x - 4 * y + 9
				}
			}

			const [dfdx, dfdy] = gradientTypedSeries(
				field,
				[nx, ny],
				new Float64Array([hx, hy])
			)
			assert.equal(dfdx.length, nx * ny)
			assert.equal(dfdy.length, nx * ny)

			for (let i = 0; i < nx; i++) {
				const x = i * hx
				for (let j = 0; j < ny; j++) {
					const y = j * hy
					const idx = i * ny + j
					assertClose(dfdx[idx], 6 * x - 2 * y + 1, 1e-11, `dfdx(${i},${j})`)
					assertClose(dfdy[idx], -2 * x + 10 * y - 4, 1e-11, `dfdy(${i},${j})`)
				}
			}
		})

		it('supports 4D scalar fields with distinct per-axis spacings', () => {
			const shape = [3, 4, 3, 5]
			const spacings = [0.5, 0.25, 1.0, 0.2]
			const total = shape.reduce((a, b) => a * b, 1)
			const field = new Float64Array(total)

			let idx = 0
			for (let i = 0; i < shape[0]; i++) {
				const w = i * spacings[0]
				for (let j = 0; j < shape[1]; j++) {
					const x = j * spacings[1]
					for (let k = 0; k < shape[2]; k++) {
						const y = k * spacings[2]
						for (let l = 0; l < shape[3]; l++) {
							const z = l * spacings[3]
							field[idx++] =
								w * w + 2 * x * y - 3 * y * z + 4 * z * w - x * x + 0.5 * z * z
						}
					}
				}
			}

			const [dfdw, dfdx, dfdy, dfdz] = gradientTypedSeries(
				field,
				shape,
				spacings
			)

			idx = 0
			for (let i = 0; i < shape[0]; i++) {
				const w = i * spacings[0]
				for (let j = 0; j < shape[1]; j++) {
					const x = j * spacings[1]
					for (let k = 0; k < shape[2]; k++) {
						const y = k * spacings[2]
						for (let l = 0; l < shape[3]; l++) {
							const z = l * spacings[3]
							assertClose(dfdw[idx], 2 * w + 4 * z, 1e-11)
							assertClose(dfdx[idx], 2 * y - 2 * x, 1e-11)
							assertClose(dfdy[idx], 2 * x - 3 * z, 1e-11)
							assertClose(dfdz[idx], -3 * y + 4 * w + z, 1e-11)
							idx++
						}
					}
				}
			}
		})
	})

	describe('independent cross-checks', () => {
		it('matches analytic partials and directional derivative identity D_u f = grad(f) . u on 3D quadratic', () => {
			const shape = [5, 4, 6]
			const [nx, ny, nz] = shape
			const spacings = [0.4, 0.25, 0.5]
			const [hx, hy, hz] = spacings

			// f(x, y, z) = a x^2 + b y^2 + c z^2 + d x y + e x z + f y z
			const a = 1.7
			const b = -2.3
			const c = 0.9
			const d = 3.1
			const e = -1.4
			const fCoeff = 2.6

			const evalF = (x, y, z) =>
				a * x * x +
				b * y * y +
				c * z * z +
				d * x * y +
				e * x * z +
				fCoeff * y * z

			const field = new Float64Array(nx * ny * nz)
			for (let i = 0; i < nx; i++) {
				const x = i * hx
				for (let j = 0; j < ny; j++) {
					const y = j * hy
					for (let k = 0; k < nz; k++) {
						const z = k * hz
						field[(i * ny + j) * nz + k] = evalF(x, y, z)
					}
				}
			}

			const [gx, gy, gz] = gradientTypedSeries(field, shape, spacings)

			// Direction vectors for independent directional derivative check
			const rawDirs = [
				[1, 2, -3],
				[-0.5, 0.7, 0.2],
				[0, 1, 1]
			]
			const unitDirs = rawDirs.map(([ux, uy, uz]) => {
				const norm = Math.hypot(ux, uy, uz)
				return [ux / norm, uy / norm, uz / norm]
			})
			const eps = 1e-6

			for (let i = 0; i < nx; i++) {
				const x = i * hx
				for (let j = 0; j < ny; j++) {
					const y = j * hy
					for (let k = 0; k < nz; k++) {
						const z = k * hz
						const idx = (i * ny + j) * nz + k

						// Analytic partial derivatives
						const expectedX = 2 * a * x + d * y + e * z
						const expectedY = 2 * b * y + d * x + fCoeff * z
						const expectedZ = 2 * c * z + e * x + fCoeff * y

						assertClose(gx[idx], expectedX, 1e-11, `gx(${i},${j},${k})`)
						assertClose(gy[idx], expectedY, 1e-11, `gy(${i},${j},${k})`)
						assertClose(gz[idx], expectedZ, 1e-11, `gz(${i},${j},${k})`)

						// Independent directional derivative check:
						// D_u f(p) = (f(p + eps*u) - f(p - eps*u)) / (2*eps) == grad(f)(p) . u
						for (const [ux, uy, uz] of unitDirs) {
							const dot = gx[idx] * ux + gy[idx] * uy + gz[idx] * uz
							const direct =
								(evalF(x + eps * ux, y + eps * uy, z + eps * uz) -
									evalF(x - eps * ux, y - eps * uy, z - eps * uz)) /
								(2 * eps)
							assertClose(dot, direct, 1e-7, `D_u f at (${i},${j},${k})`)
						}
					}
				}
			}
		})

		it('satisfies linearity grad(alpha*f + beta*g) = alpha*grad(f) + beta*grad(g)', () => {
			const shape = [4, 5, 3]
			const spacings = [0.3, 0.7, 0.2]
			const n = 60
			const f = new Float64Array(n)
			const g = new Float64Array(n)
			const combo = new Float64Array(n)
			const alpha = 2.75
			const beta = -1.6

			for (let i = 0; i < n; i++) {
				f[i] = Math.sin(0.3 * i) + 0.1 * i * i
				g[i] = Math.cos(0.5 * i) - 0.05 * i
				combo[i] = alpha * f[i] + beta * g[i]
			}

			const gf = gradientTypedSeries(f, shape, spacings)
			const gg = gradientTypedSeries(g, shape, spacings)
			const gc = gradientTypedSeries(combo, shape, spacings)

			for (let axis = 0; axis < shape.length; axis++) {
				for (let i = 0; i < n; i++) {
					assertClose(
						gc[axis][i],
						alpha * gf[axis][i] + beta * gg[axis][i],
						1e-11
					)
				}
			}
		})
	})

	describe('edge cases', () => {
		it('returns 0 along any axis of size 1', () => {
			// 1D singleton
			const [g1] = gradientTypedSeries(new Float64Array([42]), [1], [0.5])
			assert.deepEqual(Array.from(g1), [0])

			// 3D with middle singleton axis: shape [3, 1, 4]
			const shape = [3, 1, 4]
			const spacings = [0.5, 2.0, 0.25]
			const field = new Float64Array(12)
			for (let i = 0; i < 3; i++) {
				const x = i * spacings[0]
				for (let k = 0; k < 4; k++) {
					const z = k * spacings[2]
					field[i * 4 + k] = x * x + 3 * z
				}
			}
			const [gx, gy, gz] = gradientTypedSeries(field, shape, spacings)
			for (let i = 0; i < 3; i++) {
				const x = i * spacings[0]
				for (let k = 0; k < 4; k++) {
					const idx = i * 4 + k
					assertClose(gx[idx], 2 * x, 1e-12)
					assert.equal(gy[idx], 0)
					assertClose(gz[idx], 3, 1e-12)
				}
			}
		})

		it('uses first-order difference when axis size is 2', () => {
			// 1D size 2
			const [g1] = gradientTypedSeries(new Float64Array([10, 16]), [2], [0.5])
			assertClose(g1[0], 12, 1e-12)
			assertClose(g1[1], 12, 1e-12)

			// 2D shape [2, 4]: axis 0 size 2 (linear in x), axis 1 size 4 (quadratic in y)
			const shape = [2, 4]
			const [hx, hy] = [0.4, 0.5]
			const field = new Float64Array(8)
			for (let i = 0; i < 2; i++) {
				const x = i * hx
				for (let j = 0; j < 4; j++) {
					const y = j * hy
					field[i * 4 + j] = 7 * x + 2 * y * y - 3 * y + 1
				}
			}
			const [gx, gy] = gradientTypedSeries(field, shape, [hx, hy])
			for (let i = 0; i < 2; i++) {
				for (let j = 0; j < 4; j++) {
					const y = j * hy
					const idx = i * 4 + j
					assertClose(gx[idx], 7, 1e-12)
					assertClose(gy[idx], 4 * y - 3, 1e-12)
				}
			}
		})

		it('does not mutate the input field or spacings', () => {
			const field = new Float64Array([1, 4, 9, 16, 25, 36])
			const fieldCopy = new Float64Array(field)
			const spacings = [0.5, 2.0]
			const spacingsCopy = [...spacings]

			gradientTypedSeries(field, [2, 3], spacings)

			assert.deepEqual(Array.from(field), Array.from(fieldCopy))
			assert.deepEqual(spacings, spacingsCopy)
		})
	})

	describe('input validation', () => {
		it('rejects non-Float64Array field inputs', () => {
			assert.throws(() => gradientTypedSeries([1, 2, 3]), TypeError)
			assert.throws(
				() => gradientTypedSeries(new Float32Array([1, 2, 3])),
				TypeError
			)
			assert.throws(() => gradientTypedSeries(null), TypeError)
			assert.throws(() => gradientTypedSeries(undefined), TypeError)
		})

		it('rejects empty Float64Array', () => {
			assert.throws(() => gradientTypedSeries(new Float64Array(0)), RangeError)
		})

		it('rejects invalid shape arguments', () => {
			const field = new Float64Array([1, 2, 3, 4])
			assert.throws(() => gradientTypedSeries(field, null), TypeError)
			assert.throws(() => gradientTypedSeries(field, 4), TypeError)
			assert.throws(() => gradientTypedSeries(field, []), RangeError)
			assert.throws(() => gradientTypedSeries(field, [0, 4]), RangeError)
			assert.throws(() => gradientTypedSeries(field, [-2, -2]), RangeError)
			assert.throws(() => gradientTypedSeries(field, [2.5, 2]), RangeError)
			assert.throws(() => gradientTypedSeries(field, [NaN]), RangeError)
			assert.throws(() => gradientTypedSeries(field, [2, 3]), RangeError)
		})

		it('rejects invalid spacings arguments', () => {
			const field = new Float64Array([1, 2, 3, 4, 5, 6])
			assert.throws(() => gradientTypedSeries(field, [2, 3], null), TypeError)
			assert.throws(() => gradientTypedSeries(field, [2, 3], '1'), TypeError)
			assert.throws(() => gradientTypedSeries(field, [2, 3], 0), RangeError)
			assert.throws(() => gradientTypedSeries(field, [2, 3], -1), RangeError)
			assert.throws(() => gradientTypedSeries(field, [2, 3], NaN), RangeError)
			assert.throws(
				() => gradientTypedSeries(field, [2, 3], Infinity),
				RangeError
			)
			assert.throws(() => gradientTypedSeries(field, [2, 3], [1]), RangeError)
			assert.throws(
				() => gradientTypedSeries(field, [2, 3], [1, 2, 3]),
				RangeError
			)
			assert.throws(
				() => gradientTypedSeries(field, [2, 3], [1, 0]),
				RangeError
			)
			assert.throws(
				() => gradientTypedSeries(field, [2, 3], [1, -0.5]),
				RangeError
			)
			assert.throws(
				() => gradientTypedSeries(field, [2, 3], [1, NaN]),
				RangeError
			)
			assert.throws(
				() => gradientTypedSeries(field, [2, 3], [1, Infinity]),
				RangeError
			)
		})
	})
})
