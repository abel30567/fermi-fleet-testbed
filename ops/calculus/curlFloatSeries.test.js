import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { curlFloatSeries } from './curlFloatSeries.js'

function assertVec3Close(actual, expected, tol = 1e-9, message = '') {
	assert.equal(actual.length, 3, `${message} expected 3-element vector`)
	for (let i = 0; i < 3; i++) {
		const diff = Math.abs(actual[i] - expected[i])
		assert.ok(
			diff <= tol,
			`${message} component[${i}]: expected ${expected[i]}, got ${actual[i]} (|diff| = ${diff} > ${tol})`
		)
	}
}

describe('curlFloatSeries', () => {
	describe('exact analytical curls', () => {
		it('returns exact [0, 0, 0] (without -0) for zero and constant fields', () => {
			const zeroCurl = curlFloatSeries(() => [0, 0, 0], [0, 0, 0])
			assert.deepStrictEqual(zeroCurl, [0, 0, 0])
			for (const c of zeroCurl) {
				assert.ok(Object.is(c, 0), 'expected +0 rather than -0')
			}

			const constCurl = curlFloatSeries(() => [3.5, -7.25, 11.125], [1, -2, 3])
			assertVec3Close(constCurl, [0, 0, 0], 1e-12)
		})

		it('computes rigid-body rotation curls around each coordinate axis', () => {
			// F = (-y, x, 0) => curl = (0, 0, 2)
			const rotZ = ([x, y]) => [-y, x, 0]
			assertVec3Close(curlFloatSeries(rotZ, [0, 0, 0]), [0, 0, 2], 1e-12)
			assertVec3Close(curlFloatSeries(rotZ, [3.5, -4.2, 7.1]), [0, 0, 2], 1e-11)

			// F = (0, -z, y) => curl = (2, 0, 0)
			const rotX = ([, y, z]) => [0, -z, y]
			assertVec3Close(curlFloatSeries(rotX, [-1.2, 2.3, -3.4]), [2, 0, 0], 1e-11)

			// F = (z, 0, -x) => curl = (0, 2, 0)
			const rotY = ([x, , z]) => [z, 0, -x]
			assertVec3Close(curlFloatSeries(rotY, [5, -6, 7]), [0, 2, 0], 1e-11)
		})

		it('satisfies curl(omega x r) = 2 * omega for arbitrary angular velocity', () => {
			const omega = [3, -4, 5.5]
			const field = ([x, y, z]) => [
				omega[1] * z - omega[2] * y,
				omega[2] * x - omega[0] * z,
				omega[0] * y - omega[1] * x,
			]
			const result = curlFloatSeries(field, [1.25, -2.5, 3.75])
			assertVec3Close(result, [2 * omega[0], 2 * omega[1], 2 * omega[2]], 1e-10)
		})

		it('matches analytical curl for degree-4 polynomial fields (zero O(h^4) truncation error)', () => {
			const F = ([x, y, z]) => [
				x * x * y * z + y ** 4,
				y * y * z * x - z ** 3,
				z * z * x * y + x ** 4,
			]
			const analytical = ([x, y, z]) => [
				x * (z * z - y * y) + 3 * z * z,
				y * (x * x - z * z) - 4 * x ** 3,
				z * (y * y - x * x) - 4 * y ** 3,
			]

			for (const pt of [
				[0, 0, 0],
				[1, 2, 3],
				[-1.5, 0.75, -2.25],
			]) {
				assertVec3Close(curlFloatSeries(F, pt), analytical(pt), 1e-9, `at [${pt}]`)
			}
		})

		it('matches analytical curl for nonlinear transcendental fields', () => {
			const F = ([x, y, z]) => [
				Math.sin(y) * Math.exp(z),
				Math.cos(z) * x * x,
				Math.log(1 + x * x + y * y),
			]
			const analytical = ([x, y, z]) => {
				const denom = 1 + x * x + y * y
				const dFz_dy = (2 * y) / denom
				const dFy_dz = -Math.sin(z) * x * x
				const dFx_dz = Math.sin(y) * Math.exp(z)
				const dFz_dx = (2 * x) / denom
				const dFy_dx = 2 * x * Math.cos(z)
				const dFx_dy = Math.cos(y) * Math.exp(z)
				return [dFz_dy - dFy_dz, dFx_dz - dFz_dx, dFy_dx - dFx_dy]
			}

			for (const pt of [
				[0, 0, 0],
				[0.7, -1.1, 0.4],
				[-2.3, 1.8, -0.9],
			]) {
				assertVec3Close(curlFloatSeries(F, pt), analytical(pt), 1e-10, `at [${pt}]`)
			}
		})

		it('maintains accuracy at large-magnitude coordinates with adaptive default step', () => {
			const F = ([x, y, z]) => [-3 * y + 2 * z, 5 * x - z, -2 * x + 4 * y]
			// Analytical curl: (4 - (-1), 2 - (-2), 5 - (-3)) = (5, 4, 8)
			const result = curlFloatSeries(F, [1e6, -2e6, 3e6])
			assertVec3Close(result, [5, 4, 8], 1e-6)
		})
	})

	describe('vector calculus identities and numerical properties', () => {
		it('satisfies irrotational gradient field identity: curl(grad(phi)) = [0, 0, 0]', () => {
			// phi(x, y, z) = exp(0.5 * x * y) * sin(z) + x^3 * y^2 * z
			const gradPhi = ([x, y, z]) => {
				const e = Math.exp(0.5 * x * y)
				const sz = Math.sin(z)
				const cz = Math.cos(z)
				return [
					0.5 * y * e * sz + 3 * x * x * y * y * z,
					0.5 * x * e * sz + 2 * x ** 3 * y * z,
					e * cz + x ** 3 * y * y,
				]
			}

			for (const pt of [
				[0, 0, 0],
				[0.8, -0.6, 1.2],
				[-1.1, 0.9, -0.5],
			]) {
				assertVec3Close(curlFloatSeries(gradPhi, pt), [0, 0, 0], 1e-10, `gradPhi at [${pt}]`)
			}

			// Inverse-square radial field F(r) = r / |r|^3 = -grad(1 / |r|)
			const radial = ([x, y, z]) => {
				const r3 = (x * x + y * y + z * z) ** 1.5
				return [x / r3, y / r3, z / r3]
			}
			assertVec3Close(curlFloatSeries(radial, [1.5, -2.0, 0.75]), [0, 0, 0], 1e-10)
		})

		it('satisfies linearity: curl(a*F + b*G) = a*curl(F) + b*curl(G)', () => {
			const F = ([x, y, z]) => [Math.sin(y * z), Math.cos(x + z), x * y * Math.exp(-z)]
			const G = ([x, y, z]) => [y * y - z, Math.sin(x) * z, Math.cos(y) + x * z]
			const a = 2.75
			const b = -1.6
			const combined = (p) => {
				const fp = F(p)
				const gp = G(p)
				return [a * fp[0] + b * gp[0], a * fp[1] + b * gp[1], a * fp[2] + b * gp[2]]
			}

			const pt = [0.6, -0.9, 1.3]
			const lhs = curlFloatSeries(combined, pt)
			const cF = curlFloatSeries(F, pt)
			const cG = curlFloatSeries(G, pt)
			const rhs = [a * cF[0] + b * cG[0], a * cF[1] + b * cG[1], a * cF[2] + b * cG[2]]

			assertVec3Close(lhs, rhs, 1e-10)
		})

		it('satisfies scalar-vector product rule: curl(f * F) = f * curl(F) + grad(f) x F', () => {
			const f = ([x, y, z]) => Math.exp(0.3 * x) * (y * y + Math.cos(z))
			const gradF = ([x, y, z]) => {
				const ex = Math.exp(0.3 * x)
				return [0.3 * ex * (y * y + Math.cos(z)), ex * (2 * y), ex * -Math.sin(z)]
			}
			const F = ([x, y, z]) => [y * z, Math.sin(x) + z, x * y]
			const product = (p) => {
				const s = f(p)
				const v = F(p)
				return [s * v[0], s * v[1], s * v[2]]
			}

			const pt = [0.5, -1.2, 0.8]
			const lhs = curlFloatSeries(product, pt)
			const s = f(pt)
			const gf = gradF(pt)
			const v = F(pt)
			const cf = curlFloatSeries(F, pt)
			const cross = [
				gf[1] * v[2] - gf[2] * v[1],
				gf[2] * v[0] - gf[0] * v[2],
				gf[0] * v[1] - gf[1] * v[0],
			]
			const rhs = [s * cf[0] + cross[0], s * cf[1] + cross[1], s * cf[2] + cross[2]]

			assertVec3Close(lhs, rhs, 1e-10)
		})

		it('satisfies div(curl(F)) = 0 for smooth vector fields', () => {
			const F = ([x, y, z]) => [
				Math.sin(x * y) + z * z,
				Math.cos(y * z) * x,
				Math.exp(0.2 * x * z) + y ** 3,
			]
			const pt = [0.7, -0.5, 0.9]
			const d = 1e-3
			const cxp = curlFloatSeries(F, [pt[0] + d, pt[1], pt[2]])[0]
			const cxm = curlFloatSeries(F, [pt[0] - d, pt[1], pt[2]])[0]
			const cyp = curlFloatSeries(F, [pt[0], pt[1] + d, pt[2]])[1]
			const cym = curlFloatSeries(F, [pt[0], pt[1] - d, pt[2]])[1]
			const czp = curlFloatSeries(F, [pt[0], pt[1], pt[2] + d])[2]
			const czm = curlFloatSeries(F, [pt[0], pt[1], pt[2] - d])[2]

			const divCurl = (cxp - cxm + (cyp - cym) + (czp - czm)) / (2 * d)
			assert.ok(Math.abs(divCurl) < 1e-6, `expected div(curl(F)) ≈ 0, got ${divCurl}`)
		})

		it('exhibits O(h^4) fourth-order convergence for the 5-point stencil', () => {
			const F = ([x, y, z]) => [Math.sin(z), Math.cos(x), Math.sin(y)]
			// Analytical curl: (cos(y) - 0, cos(z) - 0, -sin(x) - 0)
			const pt = [0.7, 1.1, 0.4]
			const exact = [Math.cos(pt[1]), Math.cos(pt[2]), -Math.sin(pt[0])]

			const c1 = curlFloatSeries(F, pt, 0.2)
			const c2 = curlFloatSeries(F, pt, 0.1)

			const err1 = Math.hypot(c1[0] - exact[0], c1[1] - exact[1], c1[2] - exact[2])
			const err2 = Math.hypot(c2[0] - exact[0], c2[1] - exact[1], c2[2] - exact[2])
			const ratio = err1 / err2

			assert.ok(
				ratio > 15 && ratio < 17,
				`expected O(h^4) error reduction ratio ≈ 16, got ${ratio} (err1=${err1}, err2=${err2})`
			)
		})
	})

	describe('immutability and explicit step size', () => {
		it('does not mutate point even when F mutates its argument', () => {
			const point = [1.5, -2.5, 3.5]
			const snapshot = [...point]
			const mutatingField = (p) => {
				const out = [-p[1], p[0], 0]
				p[0] = 999
				p[1] = 999
				p[2] = 999
				return out
			}

			const curl = curlFloatSeries(mutatingField, point, 1e-4)
			assertVec3Close(curl, [0, 0, 2], 1e-10)
			assert.deepStrictEqual(point, snapshot)
		})

		it('accepts a frozen point array', () => {
			const frozenPoint = Object.freeze([1, 2, 3])
			const curl = curlFloatSeries(([x, y]) => [-y, x, 0], frozenPoint)
			assertVec3Close(curl, [0, 0, 2], 1e-11)
		})
	})

	describe('input validation', () => {
		const validF = ([x, y, z]) => [x, y, z]

		it('throws TypeError when F is not a function', () => {
			for (const badF of [null, undefined, 42, 'fn', {}, []]) {
				assert.throws(() => curlFloatSeries(badF, [0, 0, 0]), TypeError)
			}
		})

		it('throws TypeError or RangeError for invalid point', () => {
			for (const badPoint of [null, undefined, '123', { 0: 0, 1: 0, 2: 0 }, new Float64Array(3)]) {
				assert.throws(() => curlFloatSeries(validF, badPoint), TypeError)
			}
			for (const badLen of [[], [1], [1, 2], [1, 2, 3, 4]]) {
				assert.throws(() => curlFloatSeries(validF, badLen), RangeError)
			}
			for (const badElem of [[1, '2', 3], [1, null, 3], [undefined, 0, 0], [1, , 3]]) {
				assert.throws(() => curlFloatSeries(validF, badElem), TypeError)
			}
			for (const nonFinite of [[NaN, 0, 0], [0, Infinity, 0], [0, 0, -Infinity]]) {
				assert.throws(() => curlFloatSeries(validF, nonFinite), RangeError)
			}
		})

		it('throws TypeError or RangeError for invalid optional h', () => {
			for (const badTypeH of ['1e-4', null, {}, true]) {
				assert.throws(() => curlFloatSeries(validF, [0, 0, 0], badTypeH), TypeError)
			}
			for (const badRangeH of [0, -0, -1e-4, NaN, Infinity, -Infinity]) {
				assert.throws(() => curlFloatSeries(validF, [0, 0, 0], badRangeH), RangeError)
			}
		})

		it('throws TypeError or RangeError when F returns an invalid vector', () => {
			assert.throws(() => curlFloatSeries(() => null, [0, 0, 0]), TypeError)
			assert.throws(() => curlFloatSeries(() => 'abc', [0, 0, 0]), TypeError)
			assert.throws(() => curlFloatSeries(() => [1, 2], [0, 0, 0]), RangeError)
			assert.throws(() => curlFloatSeries(() => [1, 2, 3, 4], [0, 0, 0]), RangeError)
			assert.throws(() => curlFloatSeries(() => [1, '2', 3], [0, 0, 0]), TypeError)
			assert.throws(() => curlFloatSeries(() => [1, NaN, 3], [0, 0, 0]), RangeError)
			assert.throws(() => curlFloatSeries(() => [1, 2, Infinity], [0, 0, 0]), RangeError)
		})

		it('throws RangeError when stencil points or result overflow float64', () => {
			assert.throws(() => curlFloatSeries(validF, [Number.MAX_VALUE, 0, 0]), RangeError)
			assert.throws(() => curlFloatSeries(validF, [0, 0, 0], 1e308), RangeError)
			assert.throws(
				() => curlFloatSeries(([x, y]) => [-y * 1e308, x * 1e308, 0], [0, 0, 0], 1e-20),
				RangeError
			)
		})
	})
})
