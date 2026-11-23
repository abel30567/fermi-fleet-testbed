import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { curlTypedIterative } from './curlTypedIterative.js'

/**
 * Helper to sample an analytical 3D vector field F(x, y, z) onto a regular grid.
 */
function sampleField(fn, dims, spacing = [1, 1, 1], origin = [0, 0, 0]) {
	const [nx, ny, nz] = dims
	const [dx, dy, dz] = spacing
	const [x0, y0, z0] = origin
	const total = nx * ny * nz
	const fx = new Float64Array(total)
	const fy = new Float64Array(total)
	const fz = new Float64Array(total)

	let idx = 0
	for (let i = 0; i < nx; i++) {
		const x = x0 + i * dx
		for (let j = 0; j < ny; j++) {
			const y = y0 + j * dy
			for (let k = 0; k < nz; k++) {
				const z = z0 + k * dz
				const [vx, vy, vz] = fn(x, y, z)
				fx[idx] = vx
				fy[idx] = vy
				fz[idx] = vz
				idx++
			}
		}
	}

	return { fx, fy, fz }
}

function assertClose(actual, expected, tol, label = '') {
	assert.ok(
		Math.abs(actual - expected) <= tol,
		`${label}: expected ${actual} to be within ${tol} of ${expected} (diff=${Math.abs(actual - expected)})`
	)
}

describe('curlTypedIterative', () => {
	test('constant vector field has identically zero curl', () => {
		const dims = [4, 5, 3]
		const { fx, fy, fz } = sampleField(() => [3.5, -7.25, 1.125], dims)
		const { cx, cy, cz } = curlTypedIterative(fx, fy, fz, dims)

		assert.ok(cx instanceof Float64Array)
		assert.ok(cy instanceof Float64Array)
		assert.ok(cz instanceof Float64Array)
		assert.equal(cx.length, 60)
		assert.equal(cy.length, 60)
		assert.equal(cz.length, 60)

		for (let idx = 0; idx < 60; idx++) {
			assert.equal(cx[idx], 0)
			assert.equal(cy[idx], 0)
			assert.equal(cz[idx], 0)
		}
	})

	test('rigid body rotation F = omega x r has curl = 2 * omega everywhere', () => {
		const omega = [1.5, -2.0, 0.75]
		const dims = [5, 4, 6]
		const spacing = [0.5, 0.25, 0.4]
		const { fx, fy, fz } = sampleField(
			(x, y, z) => [
				omega[1] * z - omega[2] * y,
				omega[2] * x - omega[0] * z,
				omega[0] * y - omega[1] * x,
			],
			dims,
			spacing
		)

		const { cx, cy, cz } = curlTypedIterative(fx, fy, fz, dims, spacing)

		for (let idx = 0; idx < cx.length; idx++) {
			assertClose(cx[idx], 2 * omega[0], 1e-12, `cx[${idx}]`)
			assertClose(cy[idx], 2 * omega[1], 1e-12, `cy[${idx}]`)
			assertClose(cz[idx], 2 * omega[2], 1e-12, `cz[${idx}]`)
		}
	})

	test('quadratic vector field matches analytical curl exactly at interior and boundary points', () => {
		// F = (y^2 + x*z, z^2 - x*y, x^2 + y*z)
		// curl(F) = (-z, -x, -3y)
		const dims = [5, 6, 4]
		const spacing = new Float64Array([0.5, 0.25, 0.2])
		const origin = [-1, 0.5, -0.4]
		const { fx, fy, fz } = sampleField(
			(x, y, z) => [y * y + x * z, z * z - x * y, x * x + y * z],
			dims,
			spacing,
			origin
		)

		const { cx, cy, cz } = curlTypedIterative(fx, fy, fz, dims, spacing)

		let idx = 0
		for (let i = 0; i < dims[0]; i++) {
			const x = origin[0] + i * spacing[0]
			for (let j = 0; j < dims[1]; j++) {
				const y = origin[1] + j * spacing[1]
				for (let k = 0; k < dims[2]; k++) {
					const z = origin[2] + k * spacing[2]
					assertClose(cx[idx], -z, 1e-11, `cx(${i},${j},${k})`)
					assertClose(cy[idx], -x, 1e-11, `cy(${i},${j},${k})`)
					assertClose(cz[idx], -3 * y, 1e-11, `cz(${i},${j},${k})`)
					idx++
				}
			}
		}
	})

	test('does not mutate input Float64Array instances', () => {
		const dims = [3, 3, 3]
		const { fx, fy, fz } = sampleField((x, y, z) => [x - y, y + z, z * x], dims)
		const fxCopy = new Float64Array(fx)
		const fyCopy = new Float64Array(fy)
		const fzCopy = new Float64Array(fz)

		curlTypedIterative(fx, fy, fz, dims)

		assert.deepEqual(fx, fxCopy)
		assert.deepEqual(fy, fyCopy)
		assert.deepEqual(fz, fzCopy)
	})

	test('edge case: 1x1x1 grid returns zero curl', () => {
		const fx = new Float64Array([42])
		const fy = new Float64Array([-13])
		const fz = new Float64Array([7])
		const { cx, cy, cz } = curlTypedIterative(fx, fy, fz, [1, 1, 1])

		assert.deepEqual(cx, new Float64Array([0]))
		assert.deepEqual(cy, new Float64Array([0]))
		assert.deepEqual(cz, new Float64Array([0]))
	})

	test('edge case: 2D slice (nz = 1) computes planar curl along z-axis', () => {
		// F = (-2y, 3x, 0) on [4, 4, 1] => curl = (0, 0, 5)
		const dims = [4, 4, 1]
		const spacing = [0.5, 0.5, 1]
		const { fx, fy, fz } = sampleField((x, y) => [-2 * y, 3 * x, 0], dims, spacing)
		const { cx, cy, cz } = curlTypedIterative(fx, fy, fz, dims, spacing)

		for (let idx = 0; idx < cx.length; idx++) {
			assert.equal(cx[idx], 0)
			assert.equal(cy[idx], 0)
			assertClose(cz[idx], 5, 1e-12, `cz[${idx}]`)
		}
	})

	test('edge case: 2x2x2 grid uses first-order differences accurately on linear field', () => {
		// F = (2y + 3z, 5z - x, 7x + 11y)
		// cx = 11 - 5 = 6, cy = 3 - 7 = -4, cz = -1 - 2 = -3
		const dims = [2, 2, 2]
		const spacing = [0.25, 0.5, 0.2]
		const { fx, fy, fz } = sampleField(
			(x, y, z) => [2 * y + 3 * z, 5 * z - x, 7 * x + 11 * y],
			dims,
			spacing
		)
		const { cx, cy, cz } = curlTypedIterative(fx, fy, fz, dims, spacing)

		for (let idx = 0; idx < 8; idx++) {
			assertClose(cx[idx], 6, 1e-12, `cx[${idx}]`)
			assertClose(cy[idx], -4, 1e-12, `cy[${idx}]`)
			assertClose(cz[idx], -3, 1e-12, `cz[${idx}]`)
		}
	})

	test('input validation rejects invalid types, dimensions, spacings, lengths, and non-finite values', () => {
		const ok = new Float64Array(8)

		// Wrong array types
		assert.throws(() => curlTypedIterative([0, 0, 0, 0, 0, 0, 0, 0], ok, ok, [2, 2, 2]), TypeError)
		assert.throws(() => curlTypedIterative(ok, new Float32Array(8), ok, [2, 2, 2]), TypeError)
		assert.throws(() => curlTypedIterative(ok, ok, null, [2, 2, 2]), TypeError)

		// Invalid dims
		assert.throws(() => curlTypedIterative(ok, ok, ok, '222'), TypeError)
		assert.throws(() => curlTypedIterative(ok, ok, ok, [2, 2]), RangeError)
		assert.throws(() => curlTypedIterative(ok, ok, ok, [0, 2, 2]), RangeError)
		assert.throws(() => curlTypedIterative(ok, ok, ok, [2, -1, 2]), RangeError)
		assert.throws(() => curlTypedIterative(ok, ok, ok, [2, 2.5, 2]), RangeError)

		// Mismatched lengths
		assert.throws(() => curlTypedIterative(new Float64Array(7), ok, ok, [2, 2, 2]), RangeError)
		assert.throws(() => curlTypedIterative(ok, new Float64Array(9), ok, [2, 2, 2]), RangeError)

		// Invalid spacing
		assert.throws(() => curlTypedIterative(ok, ok, ok, [2, 2, 2], null), TypeError)
		assert.throws(() => curlTypedIterative(ok, ok, ok, [2, 2, 2], [1, 1]), RangeError)
		assert.throws(() => curlTypedIterative(ok, ok, ok, [2, 2, 2], [0, 1, 1]), RangeError)
		assert.throws(() => curlTypedIterative(ok, ok, ok, [2, 2, 2], [1, -0.5, 1]), RangeError)
		assert.throws(() => curlTypedIterative(ok, ok, ok, [2, 2, 2], [1, 1, Number.NaN]), RangeError)
		assert.throws(() => curlTypedIterative(ok, ok, ok, [2, 2, 2], [Infinity, 1, 1]), RangeError)

		// Non-finite field elements
		const withNaN = new Float64Array(8)
		withNaN[3] = Number.NaN
		assert.throws(() => curlTypedIterative(withNaN, ok, ok, [2, 2, 2]), RangeError)

		const withInf = new Float64Array(8)
		withInf[5] = -Infinity
		assert.throws(() => curlTypedIterative(ok, withInf, ok, [2, 2, 2]), RangeError)
	})

	test('independent cross-check 1: curl of an analytical gradient vanishes with O(h^2) convergence', () => {
		// phi(x, y, z) = sin(x) * cos(y) * exp(0.3 * z) + x^2 * y * z
		// grad(phi) = (
		//   cos(x)*cos(y)*exp(0.3*z) + 2*x*y*z,
		//  -sin(x)*sin(y)*exp(0.3*z) + x^2*z,
		//   0.3*sin(x)*cos(y)*exp(0.3*z) + x^2*y
		// )
		const gradPhi = (x, y, z) => {
			const e = Math.exp(0.3 * z)
			return [
				Math.cos(x) * Math.cos(y) * e + 2 * x * y * z,
				-Math.sin(x) * Math.sin(y) * e + x * x * z,
				0.3 * Math.sin(x) * Math.cos(y) * e + x * x * y,
			]
		}

		const maxCurlNorm = (n) => {
			const h = 1 / (n - 1)
			const dims = [n, n, n]
			const { fx, fy, fz } = sampleField(gradPhi, dims, [h, h, h])
			const { cx, cy, cz } = curlTypedIterative(fx, fy, fz, dims, [h, h, h])
			let maxErr = 0
			for (let idx = 0; idx < cx.length; idx++) {
				const mag = Math.hypot(cx[idx], cy[idx], cz[idx])
				if (mag > maxErr) maxErr = mag
			}
			return maxErr
		}

		const errCoarse = maxCurlNorm(15) // h = 1/14
		const errFine = maxCurlNorm(29)   // h = 1/28

		assert.ok(errFine < 1e-3, `expected curl(grad(phi)) near 0, got ${errFine}`)
		// Halving h should reduce 2nd-order truncation error by roughly a factor of 4
		const ratio = errCoarse / errFine
		assert.ok(ratio > 3.7 && ratio < 4.3, `expected O(h^2) convergence ratio ~4, got ${ratio}`)
	})

	test('independent cross-check 2: divergence of curl vanishes on nonlinear trigonometric field', () => {
		// F = (sin(y)*cos(z), cos(x)*sin(z), sin(x)*cos(y))
		// Analytical curl:
		// cx = -sin(x)*sin(y) - cos(x)*cos(z)
		// cy = -sin(y)*sin(z) - cos(x)*cos(y)
		// cz = -sin(x)*sin(z) - cos(y)*cos(z)
		const n = 21
		const h = 0.1
		const dims = [n, n, n]
		const { fx, fy, fz } = sampleField(
			(x, y, z) => [
				Math.sin(y) * Math.cos(z),
				Math.cos(x) * Math.sin(z),
				Math.sin(x) * Math.cos(y),
			],
			dims,
			[h, h, h]
		)

		const { cx, cy, cz } = curlTypedIterative(fx, fy, fz, dims, [h, h, h])

		const strideX = n * n
		const strideY = n
		let maxCurlErr = 0
		let maxDiv = 0

		for (let i = 1; i < n - 1; i++) {
			const x = i * h
			for (let j = 1; j < n - 1; j++) {
				const y = j * h
				for (let k = 1; k < n - 1; k++) {
					const z = k * h
					const idx = i * strideX + j * strideY + k

					const expectedCx = -Math.sin(x) * Math.sin(y) - Math.cos(x) * Math.cos(z)
					const expectedCy = -Math.sin(y) * Math.sin(z) - Math.cos(x) * Math.cos(y)
					const expectedCz = -Math.sin(x) * Math.sin(z) - Math.cos(y) * Math.cos(z)

					maxCurlErr = Math.max(
						maxCurlErr,
						Math.abs(cx[idx] - expectedCx),
						Math.abs(cy[idx] - expectedCy),
						Math.abs(cz[idx] - expectedCz)
					)

					// Independent central-difference divergence of the numerical curl
					const dcxDx = (cx[idx + strideX] - cx[idx - strideX]) / (2 * h)
					const dcyDy = (cy[idx + strideY] - cy[idx - strideY]) / (2 * h)
					const dczDz = (cz[idx + 1] - cz[idx - 1]) / (2 * h)
					maxDiv = Math.max(maxDiv, Math.abs(dcxDx + dcyDy + dczDz))
				}
			}
		}

		assert.ok(maxCurlErr < 4e-3, `max curl error too large: ${maxCurlErr}`)
		// Discrete central-difference divergence of central-difference curl cancels algebraically!
		assert.ok(maxDiv < 1e-12, `expected discrete div(curl(F)) = 0, got ${maxDiv}`)
	})

	test('independent cross-check 3: Stokes theorem matches surface integral of curl to boundary circulation', () => {
		// Nonlinear field F(x, y, z) = (sin(x) * y^2, x^2 * cos(y) + z, x * y * z)
		// Surface S = [0, 1] x [0, 1] at z = 0.5 with normal +z
		const nx = 41
		const ny = 41
		const nz = 3
		const dx = 1 / (nx - 1)
		const dy = 1 / (ny - 1)
		const dz = 0.25
		const dims = [nx, ny, nz]
		const spacing = [dx, dy, dz]
		const origin = [0, 0, 0.25] // k = 1 corresponds to z = 0.5

		const fieldFn = (x, y, z) => [
			Math.sin(x) * y * y,
			x * x * Math.cos(y) + z,
			x * y * z,
		]

		const { fx, fy, fz } = sampleField(fieldFn, dims, spacing, origin)
		const { cz } = curlTypedIterative(fx, fy, fz, dims, spacing)

		// 1. Surface integral of cz over S at k = 1 using 2D composite trapezoidal rule
		const kSlice = 1
		let surfaceIntegral = 0
		for (let i = 0; i < nx; i++) {
			const wx = (i === 0 || i === nx - 1) ? 0.5 : 1
			for (let j = 0; j < ny; j++) {
				const wy = (j === 0 || j === ny - 1) ? 0.5 : 1
				const idx = (i * ny + j) * nz + kSlice
				surfaceIntegral += wx * wy * cz[idx] * dx * dy
			}
		}

		// 2. Independent boundary circulation ∮ F · dr around [0, 1] x [0, 1] at z = 0.5
		const z0 = 0.5
		let circulation = 0
		// Bottom edge: y = 0, x from 0 to 1 (+dx)
		for (let i = 0; i < nx; i++) {
			const w = (i === 0 || i === nx - 1) ? 0.5 : 1
			circulation += w * fieldFn(i * dx, 0, z0)[0] * dx
		}
		// Right edge: x = 1, y from 0 to 1 (+dy)
		for (let j = 0; j < ny; j++) {
			const w = (j === 0 || j === ny - 1) ? 0.5 : 1
			circulation += w * fieldFn(1, j * dy, z0)[1] * dy
		}
		// Top edge: y = 1, x from 1 to 0 (-dx)
		for (let i = 0; i < nx; i++) {
			const w = (i === 0 || i === nx - 1) ? 0.5 : 1
			circulation -= w * fieldFn(i * dx, 1, z0)[0] * dx
		}
		// Left edge: x = 0, y from 1 to 0 (-dy)
		for (let j = 0; j < ny; j++) {
			const w = (j === 0 || j === ny - 1) ? 0.5 : 1
			circulation -= w * fieldFn(0, j * dy, z0)[1] * dy
		}

		assertClose(surfaceIntegral, circulation, 1e-4, 'Stokes theorem surface integral vs circulation')
	})
})
