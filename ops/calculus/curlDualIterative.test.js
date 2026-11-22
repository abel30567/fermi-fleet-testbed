import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { curlDualIterative } from './curlDualIterative.js'

// Local dual-number arithmetic helpers for constructing test vector fields
const dAdd = (a, b) => ({ v: a.v + b.v, d: a.d + b.d })
const dSub = (a, b) => ({ v: a.v - b.v, d: a.d - b.d })
const dNeg = (a) => ({ v: -a.v, d: -a.d })
const dMul = (a, b) => ({ v: a.v * b.v, d: a.d * b.v + a.v * b.d })
const dScale = (k, a) => ({ v: k * a.v, d: k * a.d })
const dPowInt = (a, n) => {
	let res = { v: 1, d: 0 }
	for (let i = 0; i < n; i++) {
		res = dMul(res, a)
	}
	return res
}
const dSin = (a) => ({ v: Math.sin(a.v), d: Math.cos(a.v) * a.d })
const dCos = (a) => ({ v: Math.cos(a.v), d: -Math.sin(a.v) * a.d })
const dExp = (a) => {
	const ev = Math.exp(a.v)
	return { v: ev, d: ev * a.d }
}

/**
 * Helper to assert two numbers are close within an absolute tolerance.
 */
function assertClose(actual, expected, tol = 1e-10, message = '') {
	assert.ok(
		Math.abs(actual - expected) <= tol,
		`${message ? message + ': ' : ''}expected ${actual} to be within ${tol} of ${expected} (diff = ${Math.abs(actual - expected)})`,
	)
}

/**
 * Independent primal-only numerical curl via central finite differences.
 */
function numericalCurl(primalField, coords, h = 1e-6) {
	const jacobian = [
		[0, 0, 0],
		[0, 0, 0],
		[0, 0, 0],
	]
	for (let c = 0; c < 3; c++) {
		const pPlus = [...coords]
		const pMinus = [...coords]
		pPlus[c] += h
		pMinus[c] -= h
		const fPlus = primalField(pPlus)
		const fMinus = primalField(pMinus)
		for (let r = 0; r < 3; r++) {
			jacobian[r][c] = (fPlus[r] - fMinus[r]) / (2 * h)
		}
	}
	return [
		jacobian[2][1] - jacobian[1][2],
		jacobian[0][2] - jacobian[2][0],
		jacobian[1][0] - jacobian[0][1],
	]
}

describe('curlDualIterative', () => {
	describe('normal cases', () => {
		test('rotational field F(x, y, z) = [-y, x, 0] has curl [0, 0, 2]', () => {
			const field = ([_x, y, _z]) => [dNeg(y), _x, { v: 0, d: 0 }]
			const point = [
				{ v: 1.5, d: 0.7 },
				{ v: -2.3, d: -1.1 },
				{ v: 4.1, d: 2.5 },
			]
			const res = curlDualIterative(field, point)

			assert.equal(res.length, 3)
			assertClose(res[0].v, 0, 1e-14, 'curl_x.v')
			assertClose(res[1].v, 0, 1e-14, 'curl_y.v')
			assertClose(res[2].v, 2, 1e-14, 'curl_z.v')
			assertClose(res[0].d, 0, 1e-12, 'curl_x.d')
			assertClose(res[1].d, 0, 1e-12, 'curl_y.d')
			assertClose(res[2].d, 0, 1e-12, 'curl_z.d')
		})

		test('rigid-body rotation F = omega x r has curl 2 * omega', () => {
			const omega = [1.5, -2.25, 3.75]
			const field = ([x, y, z]) => [
				dSub(dScale(omega[1], z), dScale(omega[2], y)),
				dSub(dScale(omega[2], x), dScale(omega[0], z)),
				dSub(dScale(omega[0], y), dScale(omega[1], x)),
			]
			const point = [
				{ v: -3.2, d: 1.0 },
				{ v: 0.4, d: -2.0 },
				{ v: 5.1, d: 0.5 },
			]
			const res = curlDualIterative(field, point)

			for (let i = 0; i < 3; i++) {
				assertClose(res[i].v, 2 * omega[i], 1e-14, `curl[${i}].v`)
				assertClose(res[i].d, 0, 1e-12, `curl[${i}].d`)
			}
		})

		test('nonlinear 3D polynomial field F = [x*y^2, y*z^2, z*x^2]', () => {
			const field = ([x, y, z]) => [
				dMul(x, dPowInt(y, 2)),
				dMul(y, dPowInt(z, 2)),
				dMul(z, dPowInt(x, 2)),
			]
			const point = [
				{ v: 2.0, d: 0.5 },
				{ v: -3.0, d: -1.2 },
				{ v: 1.5, d: 2.4 },
			]
			const [x, y, z] = point.map((p) => p.v)
			const [dx, dy, dz] = point.map((p) => p.d)

			// Analytical curl: [-2*y*z, -2*z*x, -2*x*y]
			const expectedV = [-2 * y * z, -2 * z * x, -2 * x * y]
			const expectedD = [
				-2 * (dy * z + y * dz),
				-2 * (dz * x + z * dx),
				-2 * (dx * y + x * dy),
			]

			const res = curlDualIterative(field, point)
			for (let i = 0; i < 3; i++) {
				assertClose(res[i].v, expectedV[i], 1e-13, `poly curl[${i}].v`)
				assertClose(res[i].d, expectedD[i], 1e-10, `poly curl[${i}].d`)
			}
		})

		test('nonlinear 3D trigonometric/exponential field matches analytical curl and directional derivative', () => {
			// F = [sin(y)*exp(z), cos(z)*x^2, sin(x)*cos(y)]
			const field = ([x, y, z]) => [
				dMul(dSin(y), dExp(z)),
				dMul(dCos(z), dPowInt(x, 2)),
				dMul(dSin(x), dCos(y)),
			]
			const point = [
				{ v: 0.8, d: 1.3 },
				{ v: -0.6, d: -0.9 },
				{ v: 0.4, d: 0.7 },
			]
			const [x, y, z] = point.map((p) => p.v)
			const [dx, dy, dz] = point.map((p) => p.d)

			const expectedV = [
				-Math.sin(x) * Math.sin(y) + x * x * Math.sin(z),
				Math.sin(y) * Math.exp(z) - Math.cos(x) * Math.cos(y),
				2 * x * Math.cos(z) - Math.cos(y) * Math.exp(z),
			]
			const expectedD = [
				(-Math.cos(x) * Math.sin(y) + 2 * x * Math.sin(z)) * dx +
					(-Math.sin(x) * Math.cos(y)) * dy +
					(x * x * Math.cos(z)) * dz,
				(Math.sin(x) * Math.cos(y)) * dx +
					(Math.cos(y) * Math.exp(z) + Math.cos(x) * Math.sin(y)) * dy +
					(Math.sin(y) * Math.exp(z)) * dz,
				(2 * Math.cos(z)) * dx +
					(Math.sin(y) * Math.exp(z)) * dy +
					(-2 * x * Math.sin(z) - Math.cos(y) * Math.exp(z)) * dz,
			]

			const res = curlDualIterative(field, point)
			for (let i = 0; i < 3; i++) {
				assertClose(res[i].v, expectedV[i], 1e-13, `trig/exp curl[${i}].v`)
				assertClose(res[i].d, expectedD[i], 1e-10, `trig/exp curl[${i}].d`)
			}
		})

		test('higher-degree polynomial field F = [y^4, z^4, x^4] verifies Richardson extrapolation accuracy', () => {
			const field = ([x, y, z]) => [dPowInt(y, 4), dPowInt(z, 4), dPowInt(x, 4)]
			const point = [
				{ v: 1.7, d: -0.4 },
				{ v: -1.2, d: 1.5 },
				{ v: 0.9, d: 2.1 },
			]
			const [x, y, z] = point.map((p) => p.v)
			const [dx, dy, dz] = point.map((p) => p.d)

			// Curl = [-4*z^3, -4*x^3, -4*y^3]
			const expectedV = [-4 * z ** 3, -4 * x ** 3, -4 * y ** 3]
			const expectedD = [-12 * z ** 2 * dz, -12 * x ** 2 * dx, -12 * y ** 2 * dy]

			const res = curlDualIterative(field, point)
			for (let i = 0; i < 3; i++) {
				assertClose(res[i].v, expectedV[i], 1e-13, `quartic curl[${i}].v`)
				assertClose(res[i].d, expectedD[i], 1e-10, `quartic curl[${i}].d`)
			}
		})
	})

	describe('edge cases', () => {
		test('constant vector field has exact zero curl and zero derivative', () => {
			const field = () => [
				{ v: 7.5, d: 0 },
				{ v: -3.2, d: 0 },
				{ v: 11.0, d: 0 },
			]
			const point = [
				{ v: 1, d: 3 },
				{ v: 2, d: -4 },
				{ v: 3, d: 5 },
			]
			const res = curlDualIterative(field, point)

			for (let i = 0; i < 3; i++) {
				assert.equal(res[i].v, 0)
				assert.equal(res[i].d, 0)
			}
		})

		test('zero point.d short-circuits derivative computation to exact +0 without extra field calls', () => {
			let calls = 0
			const field = ([x, y, z]) => {
				calls++
				return [dMul(y, z), dMul(x, x), dMul(y, y)]
			}
			const point = [
				{ v: 2.0, d: 0 },
				{ v: -1.5, d: 0 },
				{ v: 3.0, d: 0 },
			]
			const res = curlDualIterative(field, point)

			assert.equal(calls, 3, 'should only evaluate field 3 times when all point[c].d === 0')
			// F = [y*z, x^2, y^2] -> curl = [2*y - 0, y - 0, 2*x - z] = [-3, -1.5, 1]
			assertClose(res[0].v, -3.0, 1e-14)
			assertClose(res[1].v, -1.5, 1e-14)
			assertClose(res[2].v, 1.0, 1e-14)
			for (let i = 0; i < 3; i++) {
				assert.ok(Object.is(res[i].d, 0), `res[${i}].d should be +0`)
			}
		})

		test('handles very small and very large point.d scales accurately', () => {
			const field = ([x, y, z]) => [
				dMul(x, dPowInt(y, 2)),
				dMul(y, dPowInt(z, 2)),
				dMul(z, dPowInt(x, 2)),
			]

			for (const scale of [1e-12, 1e8]) {
				const point = [
					{ v: 2.0, d: 1.0 * scale },
					{ v: 3.0, d: -2.0 * scale },
					{ v: -1.0, d: 0.5 * scale },
				]
				const [x, y, z] = [2.0, 3.0, -1.0]
				const [dx, dy, dz] = [1.0 * scale, -2.0 * scale, 0.5 * scale]
				const expectedD = [
					-2 * (dy * z + y * dz),
					-2 * (dz * x + z * dx),
					-2 * (dx * y + x * dy),
				]

				const res = curlDualIterative(field, point)
				for (let i = 0; i < 3; i++) {
					assertClose(res[i].d, expectedD[i], 1e-9 * scale, `scale=${scale} curl[${i}].d`)
				}
			}
		})

		test('does not mutate input point array or dual objects', () => {
			const field = ([x, y, z]) => [dNeg(y), x, z]
			const point = [
				{ v: 1, d: 2 },
				{ v: 3, d: 4 },
				{ v: 5, d: 6 },
			]
			const snapshot = structuredClone(point)
			curlDualIterative(field, point)
			assert.deepEqual(point, snapshot)
		})

		test('validates inputs and field outputs thoroughly', () => {
			const validField = ([x, y, z]) => [x, y, z]
			const validPoint = [
				{ v: 0, d: 0 },
				{ v: 0, d: 0 },
				{ v: 0, d: 0 },
			]

			// Non-function field -> TypeError
			for (const badField of [null, undefined, 42, 'field', {}, []]) {
				assert.throws(() => curlDualIterative(badField, validPoint), TypeError)
			}

			// Non-array point -> TypeError
			for (const badPoint of [null, undefined, 123, 'point', { v: 0, d: 0 }]) {
				assert.throws(() => curlDualIterative(validField, badPoint), TypeError)
			}

			// Non-3D point -> RangeError
			for (const badLenPoint of [
				[],
				[{ v: 0, d: 0 }],
				[
					{ v: 0, d: 0 },
					{ v: 1, d: 0 },
				],
				[
					{ v: 0, d: 0 },
					{ v: 1, d: 0 },
					{ v: 2, d: 0 },
					{ v: 3, d: 0 },
				],
			]) {
				assert.throws(() => curlDualIterative(validField, badLenPoint), RangeError)
			}

			// Invalid dual elements in point -> TypeError
			for (const badDual of [
				null,
				undefined,
				5,
				[1, 2],
				{},
				{ v: 1 },
				{ d: 1 },
				{ v: '1', d: 0 },
				{ v: 0, d: '1' },
				{ v: Number.NaN, d: 0 },
				{ v: 0, d: Number.NaN },
				{ v: Number.POSITIVE_INFINITY, d: 0 },
				{ v: 0, d: Number.NEGATIVE_INFINITY },
			]) {
				assert.throws(
					() => curlDualIterative(validField, [badDual, { v: 0, d: 0 }, { v: 0, d: 0 }]),
					TypeError,
				)
			}

			// Invalid field return types -> TypeError / RangeError
			assert.throws(() => curlDualIterative(() => null, validPoint), TypeError)
			assert.throws(() => curlDualIterative(() => ({ v: 0, d: 0 }), validPoint), TypeError)
			assert.throws(
				() =>
					curlDualIterative(
						() => [
							{ v: 0, d: 0 },
							{ v: 0, d: 0 },
						],
						validPoint,
					),
				RangeError,
			)
			assert.throws(
				() =>
					curlDualIterative(
						() => [
							{ v: 0, d: 0 },
							{ v: 0, d: 0 },
							{ v: 0, d: 0 },
							{ v: 0, d: 0 },
						],
						validPoint,
					),
				RangeError,
			)
			assert.throws(
				() =>
					curlDualIterative(
						() => [{ v: Number.NaN, d: 0 }, { v: 0, d: 0 }, { v: 0, d: 0 }],
						validPoint,
					),
				TypeError,
			)
			assert.throws(
				() =>
					curlDualIterative(
						() => [{ v: 0, d: Number.POSITIVE_INFINITY }, { v: 0, d: 0 }, { v: 0, d: 0 }],
						validPoint,
					),
				TypeError,
			)
		})
	})

	describe('mathematical and numerical cross-checks', () => {
		test('vector calculus identity: curl(grad(phi)) = 0 for conservative field', () => {
			// Scalar potential phi(x, y, z) = x^3 * sin(y) + exp(y * z) + x * y * z^2
			// grad(phi) = [
			//   3*x^2*sin(y) + y*z^2,
			//   x^3*cos(y) + z*exp(y*z) + x*z^2,
			//   y*exp(y*z) + 2*x*y*z
			// ]
			const gradPhi = ([x, y, z]) => {
				const eyz = dExp(dMul(y, z))
				const z2 = dPowInt(z, 2)
				return [
					dAdd(dMul(dScale(3, dPowInt(x, 2)), dSin(y)), dMul(y, z2)),
					dAdd(dAdd(dMul(dPowInt(x, 3), dCos(y)), dMul(z, eyz)), dMul(x, z2)),
					dAdd(dMul(y, eyz), dScale(2, dMul(dMul(x, y), z))),
				]
			}
			const point = [
				{ v: 1.1, d: 0.6 },
				{ v: -0.7, d: 1.4 },
				{ v: 0.9, d: -0.8 },
			]
			const res = curlDualIterative(gradPhi, point)

			for (let i = 0; i < 3; i++) {
				assertClose(res[i].v, 0, 1e-13, `curl(grad phi)[${i}].v`)
				assertClose(res[i].d, 0, 1e-10, `curl(grad phi)[${i}].d`)
			}
		})

		test('cross-check against independent finite-difference numerical curl and directional derivative', () => {
			const dualField = ([x, y, z]) => [
				dAdd(dMul(dSin(x), dCos(y)), dMul(z, dPowInt(y, 2))),
				dSub(dMul(dExp(dScale(0.5, x)), dSin(z)), dMul(x, y)),
				dAdd(dMul(dPowInt(x, 2), dCos(z)), dMul(dSin(y), dExp(dScale(0.3, z)))),
			]
			const primalField = ([x, y, z]) => [
				Math.sin(x) * Math.cos(y) + z * y * y,
				Math.exp(0.5 * x) * Math.sin(z) - x * y,
				x * x * Math.cos(z) + Math.sin(y) * Math.exp(0.3 * z),
			]

			const point = [
				{ v: 0.9, d: -0.5 },
				{ v: 1.2, d: 0.8 },
				{ v: -0.7, d: 1.1 },
			]
			const baseV = point.map((p) => p.v)
			const baseD = point.map((p) => p.d)

			const res = curlDualIterative(dualField, point)

			// Independent numerical curl at baseV
			const numCurlV = numericalCurl(primalField, baseV, 1e-6)

			// Independent numerical directional derivative of numericalCurl along baseD
			const ht = 1e-4
			const curlPlus = numericalCurl(
				primalField,
				baseV.map((v, i) => v + ht * baseD[i]),
				1e-5,
			)
			const curlMinus = numericalCurl(
				primalField,
				baseV.map((v, i) => v - ht * baseD[i]),
				1e-5,
			)
			const numCurlD = curlPlus.map((val, i) => (val - curlMinus[i]) / (2 * ht))

			for (let i = 0; i < 3; i++) {
				assertClose(res[i].v, numCurlV[i], 1e-8, `numerical curl[${i}].v`)
				assertClose(res[i].d, numCurlD[i], 1e-5, `numerical curl[${i}].d`)
			}
		})

		test('linearity identity: curl(a*F + b*G) = a*curl(F) + b*curl(G) for both v and d', () => {
			const a = 2.5
			const b = -1.75
			const F = ([x, y, z]) => [dMul(y, dSin(z)), dMul(z, dCos(x)), dMul(x, dExp(y))]
			const G = ([x, y, z]) => [dPowInt(z, 2), dMul(x, y), dMul(y, z)]
			const combined = (vec) => {
				const f = F(vec)
				const g = G(vec)
				return [
					dAdd(dScale(a, f[0]), dScale(b, g[0])),
					dAdd(dScale(a, f[1]), dScale(b, g[1])),
					dAdd(dScale(a, f[2]), dScale(b, g[2])),
				]
			}
			const point = [
				{ v: 0.6, d: 1.2 },
				{ v: -0.4, d: -0.7 },
				{ v: 1.1, d: 0.3 },
			]

			const curlF = curlDualIterative(F, point)
			const curlG = curlDualIterative(G, point)
			const curlComb = curlDualIterative(combined, point)

			for (let i = 0; i < 3; i++) {
				assertClose(curlComb[i].v, a * curlF[i].v + b * curlG[i].v, 1e-13, `linearity v[${i}]`)
				assertClose(curlComb[i].d, a * curlF[i].d + b * curlG[i].d, 1e-10, `linearity d[${i}]`)
			}
		})
	})
})
