import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { divergenceFloatIterative } from './divergenceFloatIterative.js'

describe('divergenceFloatIterative', () => {
	describe('normal cases', () => {
		it('computes 1D divergence (ordinary derivative)', () => {
			// F(x) = [x^3 - 2x + 5], div(F)(x) = 3x^2 - 2
			const field = ([x]) => [x * x * x - 2 * x + 5]
			const x = 2.5
			const expected = 3 * x * x - 2
			const actual = divergenceFloatIterative(field, [x])
			assert.ok(Math.abs(actual - expected) < 1e-8, `got ${actual}, expected ${expected}`)
		})

		it('computes divergence of a 2D linear field equal to matrix trace', () => {
			// F(x, y) = [3x - 4y + 1, 7x - 2y + 9] -> trace = 3 + (-2) = 1
			const field = ([x, y]) => [3 * x - 4 * y + 1, 7 * x - 2 * y + 9]
			const actual = divergenceFloatIterative(field, [1.25, -3.75])
			assert.ok(Math.abs(actual - 1) < 1e-8, `got ${actual}`)
		})

		it('computes divergence of a 3D nonlinear polynomial field', () => {
			// F(x, y, z) = [x^2 * y, y^2 * z, z^2 * x]
			// div(F) = 2xy + 2yz + 2zx
			const field = ([x, y, z]) => [x * x * y, y * y * z, z * z * x]
			const pt = [1.5, -2.0, 3.25]
			const expected = 2 * pt[0] * pt[1] + 2 * pt[1] * pt[2] + 2 * pt[2] * pt[0]
			const actual = divergenceFloatIterative(field, pt)
			assert.ok(Math.abs(actual - expected) < 1e-8, `got ${actual}, expected ${expected}`)
		})

		it('computes divergence of a 3D transcendental field', () => {
			// F(x, y, z) = [sin(x) * exp(y), cos(y) * z, ln(1 + z^2) * x]
			// div(F) = cos(x) * exp(y) - sin(y) * z + (2 * z * x) / (1 + z^2)
			const field = ([x, y, z]) => [
				Math.sin(x) * Math.exp(y),
				Math.cos(y) * z,
				Math.log(1 + z * z) * x,
			]
			const [x, y, z] = [0.7, -0.4, 1.8]
			const expected =
				Math.cos(x) * Math.exp(y) - Math.sin(y) * z + (2 * z * x) / (1 + z * z)
			const actual = divergenceFloatIterative(field, [x, y, z])
			assert.ok(Math.abs(actual - expected) < 1e-8, `got ${actual}, expected ${expected}`)
		})

		it('supports an array of scalar component functions', () => {
			const components = [
				([x, y, z]) => x * x + y * z,
				([x, y, z]) => Math.sin(y) + x,
				([x, y, z]) => Math.exp(z) - y,
			]
			const [x, y, z] = [2.0, 0.5, -1.0]
			const expected = 2 * x + Math.cos(y) + Math.exp(z)
			const actual = divergenceFloatIterative(components, [x, y, z])
			assert.ok(Math.abs(actual - expected) < 1e-8, `got ${actual}, expected ${expected}`)
		})

		it('handles high-dimensional fields (6D)', () => {
			// F_i(x) = (i + 1) * x_i^2 -> div(F)(x) = sum_{i=0}^5 2*(i+1)*x_i
			const field = (p) => p.map((v, i) => (i + 1) * v * v)
			const pt = [1, -2, 0.5, 3, -1.5, 2]
			const expected = pt.reduce((acc, v, i) => acc + 2 * (i + 1) * v, 0)
			const actual = divergenceFloatIterative(field, pt)
			assert.ok(Math.abs(actual - expected) < 1e-7, `got ${actual}, expected ${expected}`)
		})
	})

	describe('edge cases', () => {
		it('returns exact 0 (not -0) for a constant field', () => {
			const field = () => [42, -7.5, 0]
			const actual = divergenceFloatIterative(field, [1, 2, 3])
			assert.ok(Object.is(actual, 0), `expected +0, got ${actual}`)
		})

		it('returns ~0 for divergence-free (solenoidal) 3D inverse-square field away from origin', () => {
			// Coulomb field F(r) = r / |r|^3 has div(F) = 0 for r != 0
			const coulomb = ([x, y, z]) => {
				const r2 = x * x + y * y + z * z
				const r3 = r2 * Math.sqrt(r2)
				return [x / r3, y / r3, z / r3]
			}
			const actual = divergenceFloatIterative(coulomb, [1.5, -2.0, 0.75])
			assert.ok(Math.abs(actual) < 1e-9, `expected ~0, got ${actual}`)
		})

		it('does not mutate the caller point array even if field mutates its argument', () => {
			const pt = [1.0, 2.0, 3.0]
			const field = (p) => {
				const res = [p[0] * 2, p[1] * 3, p[2] * 4]
				p[0] = 999
				return res
			}
			const actual = divergenceFloatIterative(field, pt)
			assert.deepEqual(pt, [1.0, 2.0, 3.0])
			assert.ok(Math.abs(actual - 9) < 1e-8)
		})

		it('handles evaluation at the origin and with custom step size', () => {
			const field = ([x, y]) => [Math.sinh(x), Math.atan(y)]
			// div(F)(0, 0) = cosh(0) + 1/(1+0) = 2
			const actual = divergenceFloatIterative(field, [0, 0], 1e-5)
			assert.ok(Math.abs(actual - 2) < 1e-9, `got ${actual}`)
		})

		it('handles large coordinates when step is appropriately scaled', () => {
			const field = ([x, y]) => [2 * x, -5 * y]
			const actual = divergenceFloatIterative(field, [1e10, -1e10], 1)
			assert.ok(Math.abs(actual - -3) < 1e-5, `got ${actual}`)
		})
	})

	describe('input validation', () => {
		const identity = (p) => p.slice()

		it('rejects non-array point and empty point', () => {
			assert.throws(() => divergenceFloatIterative(identity, null), TypeError)
			assert.throws(() => divergenceFloatIterative(identity, '123'), TypeError)
			assert.throws(() => divergenceFloatIterative(identity, []), RangeError)
		})

		it('rejects non-numeric and non-finite point coordinates', () => {
			assert.throws(() => divergenceFloatIterative(identity, [1, '2']), TypeError)
			assert.throws(() => divergenceFloatIterative(identity, [1, NaN]), RangeError)
			assert.throws(() => divergenceFloatIterative(identity, [Infinity, 0]), RangeError)
			assert.throws(() => divergenceFloatIterative(identity, [-Infinity, 0]), RangeError)
		})

		it('rejects invalid step sizes', () => {
			assert.throws(() => divergenceFloatIterative(identity, [1], '1e-6'), TypeError)
			assert.throws(() => divergenceFloatIterative(identity, [1], 0), RangeError)
			assert.throws(() => divergenceFloatIterative(identity, [1], -1e-6), RangeError)
			assert.throws(() => divergenceFloatIterative(identity, [1], NaN), RangeError)
			assert.throws(() => divergenceFloatIterative(identity, [1], Infinity), RangeError)
		})

		it('rejects step too small to perturb a float64 coordinate', () => {
			assert.throws(() => divergenceFloatIterative(identity, [1e20], 1e-6), RangeError)
		})

		it('rejects invalid field definitions', () => {
			assert.throws(() => divergenceFloatIterative(123, [1, 2]), TypeError)
			assert.throws(() => divergenceFloatIterative({}, [1, 2]), TypeError)
			assert.throws(() => divergenceFloatIterative([() => 1], [1, 2]), RangeError)
			assert.throws(() => divergenceFloatIterative([() => 1, 'bad'], [1, 2]), TypeError)
		})

		it('rejects invalid field return values', () => {
			assert.throws(() => divergenceFloatIterative(() => 42, [1, 2]), TypeError)
			assert.throws(() => divergenceFloatIterative(() => [1], [1, 2]), RangeError)
			assert.throws(() => divergenceFloatIterative(() => [1, 'x'], [1, 2]), TypeError)
			assert.throws(() => divergenceFloatIterative(() => [1, NaN], [1, 2]), RangeError)
			assert.throws(() => divergenceFloatIterative(() => [Infinity, 0], [1, 2]), RangeError)
			assert.throws(
				() => divergenceFloatIterative([() => 1, () => Infinity], [1, 2]),
				RangeError,
			)
		})
	})

	describe('independent cross-checks', () => {
		it('agrees with Gauss Divergence Theorem (surface flux vs volume integral)', () => {
			// Verify \iiint_V div(F) dV == \iint_{\partial V} F · n dS
			// on V = [0, 1] x [-0.5, 1.5] x [1, 2] using independent midpoint quadrature.
			const field = ([x, y, z]) => [
				x * x * y + Math.sin(z),
				Math.exp(y * 0.5) * x + y * z,
				z * z * z - x * y,
			]

			const [ax, bx] = [0, 1]
			const [ay, by] = [-0.5, 1.5]
			const [az, bz] = [1, 2]
			const N = 20
			const dx = (bx - ax) / N
			const dy = (by - ay) / N
			const dz = (bz - az) / N

			// Volume integral of divergenceFloatIterative
			let volumeIntegral = 0
			for (let ix = 0; ix < N; ix += 1) {
				const x = ax + (ix + 0.5) * dx
				for (let iy = 0; iy < N; iy += 1) {
					const y = ay + (iy + 0.5) * dy
					for (let iz = 0; iz < N; iz += 1) {
						const z = az + (iz + 0.5) * dz
						volumeIntegral += divergenceFloatIterative(field, [x, y, z]) * dx * dy * dz
					}
				}
			}

			// Surface flux integral directly from field evaluations (no derivatives)
			let surfaceFlux = 0
			// x = bx (+x normal) and x = ax (-x normal)
			for (let iy = 0; iy < N; iy += 1) {
				const y = ay + (iy + 0.5) * dy
				for (let iz = 0; iz < N; iz += 1) {
					const z = az + (iz + 0.5) * dz
					surfaceFlux += (field([bx, y, z])[0] - field([ax, y, z])[0]) * dy * dz
				}
			}
			// y = by (+y normal) and y = ay (-y normal)
			for (let ix = 0; ix < N; ix += 1) {
				const x = ax + (ix + 0.5) * dx
				for (let iz = 0; iz < N; iz += 1) {
					const z = az + (iz + 0.5) * dz
					surfaceFlux += (field([x, by, z])[1] - field([x, ay, z])[1]) * dx * dz
				}
			}
			// z = bz (+z normal) and z = az (-z normal)
			for (let ix = 0; ix < N; ix += 1) {
				const x = ax + (ix + 0.5) * dx
				for (let iy = 0; iy < N; iy += 1) {
					const y = ay + (iy + 0.5) * dy
					surfaceFlux += (field([x, y, bz])[2] - field([x, y, az])[2]) * dx * dy
				}
			}

			assert.ok(
				Math.abs(volumeIntegral - surfaceFlux) < 5e-3,
				`volumeIntegral=${volumeIntegral}, surfaceFlux=${surfaceFlux}`,
			)
		})

		it('satisfies vector calculus linearity and div(curl(A)) == 0 identities', () => {
			// Vector potential A(x, y, z) = [x*y*z, sin(x*z), exp(y)*x]
			// Analytical curl F = curl(A):
			// F_x = dA_z/dy - dA_y/dz = exp(y)*x - x*cos(x*z)
			// F_y = dA_x/dz - dA_z/dx = x*y - exp(y)
			// F_z = dA_y/dx - dA_x/dy = z*cos(x*z) - x*z
			const curlA = ([x, y, z]) => [
				Math.exp(y) * x - x * Math.cos(x * z),
				x * y - Math.exp(y),
				z * Math.cos(x * z) - x * z,
			]
			const pt = [0.8, -0.3, 1.4]
			const divCurl = divergenceFloatIterative(curlA, pt)
			assert.ok(Math.abs(divCurl) < 1e-8, `expected div(curl(A)) ~ 0, got ${divCurl}`)

			// Linearity: div(a*F + b*G) == a*div(F) + b*div(G)
			const F = ([x, y, z]) => [x * y, y * z, z * x]
			const G = ([x, y, z]) => [Math.cos(x), Math.sin(y), Math.exp(z)]
			const a = 2.7
			const b = -1.3
			const combined = (p) => {
				const fv = F(p)
				const gv = G(p)
				return [a * fv[0] + b * gv[0], a * fv[1] + b * gv[1], a * fv[2] + b * gv[2]]
			}
			const lhs = divergenceFloatIterative(combined, pt)
			const rhs = a * divergenceFloatIterative(F, pt) + b * divergenceFloatIterative(G, pt)
			assert.ok(Math.abs(lhs - rhs) < 1e-8, `lhs=${lhs}, rhs=${rhs}`)
		})

		it('matches between vector-valued function form and component-array form', () => {
			const vectorField = ([x, y, z]) => [
				Math.atan(x * y),
				Math.sqrt(1 + y * y + z * z),
				x * Math.exp(-z),
			]
			const componentField = [
				([x, y]) => Math.atan(x * y),
				([, y, z]) => Math.sqrt(1 + y * y + z * z),
				([x, , z]) => x * Math.exp(-z),
			]
			const pt = [1.2, -0.7, 0.9]
			const v1 = divergenceFloatIterative(vectorField, pt)
			const v2 = divergenceFloatIterative(componentField, pt)
			assert.equal(v1, v2)
		})
	})
})
