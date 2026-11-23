import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { derivativeComplexSeries } from './derivativeComplexSeries.js'

// Complex arithmetic helpers for test functions
const cAdd = (a, b) => ({ re: a.re + b.re, im: a.im + b.im })
const cSub = (a, b) => ({ re: a.re - b.re, im: a.im - b.im })
const cMul = (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re })
const cDiv = (a, b) => {
	const d = b.re * b.re + b.im * b.im
	return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d }
}
const cExp = (z) => {
	const e = Math.exp(z.re)
	return { re: e * Math.cos(z.im), im: e * Math.sin(z.im) }
}
const cSin = (z) => ({
	re: Math.sin(z.re) * Math.cosh(z.im),
	im: Math.cos(z.re) * Math.sinh(z.im),
})
const cCos = (z) => ({
	re: Math.cos(z.re) * Math.cosh(z.im),
	im: -Math.sin(z.re) * Math.sinh(z.im),
})
const cLog = (z) => ({
	re: Math.log(Math.hypot(z.re, z.im)),
	im: Math.atan2(z.im, z.re),
})
const cPowInt = (z, n) => {
	let acc = { re: 1, im: 0 }
	for (let i = 0; i < n; i++) acc = cMul(acc, z)
	return acc
}

function assertComplexClose(actual, expected, tol = 1e-10, label = '') {
	const prefix = label ? `${label}: ` : ''
	assert.ok(
		Math.abs(actual.re - expected.re) <= tol,
		`${prefix}re mismatch: got ${actual.re}, expected ${expected.re} (diff ${Math.abs(actual.re - expected.re)}, tol ${tol})`
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= tol,
		`${prefix}im mismatch: got ${actual.im}, expected ${expected.im} (diff ${Math.abs(actual.im - expected.im)}, tol ${tol})`
	)
}

describe('derivativeComplexSeries', () => {
	describe('normal cases — closed-form analytic derivatives', () => {
		test('polynomial f(z) = z^3 - (2+i)z + 5', () => {
			const c1 = { re: 2, im: 1 }
			const c0 = { re: 5, im: 0 }
			const f = (z) => cAdd(cSub(cPowInt(z, 3), cMul(c1, z)), c0)
			const z = { re: 1.5, im: -2.25 }

			// f'(z) = 3z^2 - (2+i)
			const expected = cSub(cMul({ re: 3, im: 0 }, cPowInt(z, 2)), c1)
			assertComplexClose(derivativeComplexSeries(f, z), expected, 1e-11)
		})

		test('exponential f(z) = exp(z) has f^(n)(z) = exp(z)', () => {
			const z = { re: 0.7, im: -1.3 }
			const expected = cExp(z)

			assertComplexClose(derivativeComplexSeries(cExp, z), expected, 1e-11, 'order 1')
			assertComplexClose(derivativeComplexSeries(cExp, z, { order: 2 }), expected, 1e-10, 'order 2')
			assertComplexClose(derivativeComplexSeries(cExp, z, { order: 3 }), expected, 1e-9, 'order 3')
			assertComplexClose(derivativeComplexSeries(cExp, z, { order: 4 }), expected, 1e-8, 'order 4')
		})

		test('trigonometric functions sin(z) and cos(z)', () => {
			const z = { re: 0.4, im: 1.1 }
			// d/dz sin(z) = cos(z)
			assertComplexClose(derivativeComplexSeries(cSin, z), cCos(z), 1e-11, 'd/dz sin(z)')
			// d/dz cos(z) = -sin(z)
			const negSin = { re: -cSin(z).re, im: -cSin(z).im }
			assertComplexClose(derivativeComplexSeries(cCos, z), negSin, 1e-11, 'd/dz cos(z)')
			// d^2/dz^2 sin(z) = -sin(z)
			assertComplexClose(derivativeComplexSeries(cSin, z, { order: 2 }), negSin, 1e-10, 'd^2/dz^2 sin(z)')
		})

		test('reciprocal f(z) = 1 / z', () => {
			const inv = (z) => cDiv({ re: 1, im: 0 }, z)
			const z = { re: 2, im: 3 }
			// f'(z) = -1 / z^2
			const expected1 = cDiv({ re: -1, im: 0 }, cPowInt(z, 2))
			// f''(z) = 2 / z^3
			const expected2 = cDiv({ re: 2, im: 0 }, cPowInt(z, 3))

			assertComplexClose(derivativeComplexSeries(inv, z), expected1, 1e-11, 'order 1')
			assertComplexClose(derivativeComplexSeries(inv, z, { order: 2 }), expected2, 1e-10, 'order 2')
		})

		test('principal complex logarithm f(z) = log(z) away from branch cut', () => {
			const z = { re: 1.2, im: 0.9 }
			const expected = cDiv({ re: 1, im: 0 }, z)
			assertComplexClose(derivativeComplexSeries(cLog, z), expected, 1e-11)
		})
	})

	describe('edge cases', () => {
		test('constant function has zero derivative', () => {
			const f = () => ({ re: 7, im: -4 })
			const result = derivativeComplexSeries(f, { re: 3, im: -2 })
			assertComplexClose(result, { re: 0, im: 0 }, 1e-12)
		})

		test('order 0 returns f(z) directly without contour sampling', () => {
			let calls = 0
			const f = (z) => {
				calls++
				return { re: z.re * 2, im: -0 }
			}
			const res = derivativeComplexSeries(f, { re: 3, im: 4 }, { order: 0 })
			assert.equal(calls, 1)
			assert.deepStrictEqual(res, { re: 6, im: 0 })
			assert.ok(!Object.is(res.im, -0))
		})

		test('derivative at origin z = 0 + 0i', () => {
			// f(z) = z^2 + 3i*z + 1 => f'(0) = 3i, f''(0) = 2, f'''(0) = 0
			const f = (z) => cAdd(cAdd(cPowInt(z, 2), cMul({ re: 0, im: 3 }, z)), { re: 1, im: 0 })
			const z0 = { re: 0, im: 0 }

			assertComplexClose(derivativeComplexSeries(f, z0, { order: 1 }), { re: 0, im: 3 }, 1e-12)
			assertComplexClose(derivativeComplexSeries(f, z0, { order: 2 }), { re: 2, im: 0 }, 1e-11)
			assertComplexClose(derivativeComplexSeries(f, z0, { order: 3 }), { re: 0, im: 0 }, 1e-10)
		})

		test('purely real and purely imaginary points', () => {
			const f = (z) => cPowInt(z, 4)
			assertComplexClose(derivativeComplexSeries(f, { re: -2, im: 0 }), { re: -32, im: 0 }, 1e-10)
			// 4 * (2i)^3 = 4 * (-8i) = -32i
			assertComplexClose(derivativeComplexSeries(f, { re: 0, im: 2 }), { re: 0, im: -32 }, 1e-10)
		})

		test('higher order derivative exceeding polynomial degree vanishes', () => {
			const f = (z) => cPowInt(z, 3)
			const z = { re: 1, im: -1 }
			assertComplexClose(derivativeComplexSeries(f, z, { order: 3 }), { re: 6, im: 0 }, 1e-9)
			assertComplexClose(derivativeComplexSeries(f, z, { order: 4 }), { re: 0, im: 0 }, 1e-8)
		})

		test('custom small radius near singularity', () => {
			// Pole at z = 0; evaluate at z = 1e-3 using radius 1e-5 so contour avoids pole
			const inv = (z) => cDiv({ re: 1, im: 0 }, z)
			const z = { re: 1e-3, im: 0 }
			const res = derivativeComplexSeries(inv, z, { radius: 1e-5, samples: 16 })
			// -1 / (1e-3)^2 = -1e6
			assertComplexClose(res, { re: -1e6, im: 0 }, 1e-4)
		})

		test('non-holomorphic conjugate f(z) = conj(z) yields Wirtinger derivative 0', () => {
			const conj = (z) => ({ re: z.re, im: -z.im })
			const res = derivativeComplexSeries(conj, { re: 2.5, im: -1.5 })
			assertComplexClose(res, { re: 0, im: 0 }, 1e-12)
		})

		test('normalizes -0 to 0 in output', () => {
			const f = () => ({ re: -0, im: -0 })
			const res = derivativeComplexSeries(f, { re: 1, im: 1 })
			assert.ok(!Object.is(res.re, -0))
			assert.ok(!Object.is(res.im, -0))
		})
	})

	describe('independent cross-checks', () => {
		test('Cauchy-Riemann partial derivatives match complex derivative', () => {
			// f(z) = exp(z) * sin(z)
			const f = (z) => cMul(cExp(z), cSin(z))
			const z = { re: 0.6, im: -0.8 }
			const h = 1e-6

			// Independent central finite differences along real (x) and imaginary (y) axes
			const dfdx = cDiv(
				cSub(f({ re: z.re + h, im: z.im }), f({ re: z.re - h, im: z.im })),
				{ re: 2 * h, im: 0 }
			)
			const dfdy = cDiv(
				cSub(f({ re: z.re, im: z.im + h }), f({ re: z.re, im: z.im - h })),
				{ re: 2 * h, im: 0 }
			)
			// Cauchy-Riemann: f'(z) = u_x + i*v_x = v_y - i*u_y
			const fromY = { re: dfdy.im, im: -dfdy.re }

			const seriesResult = derivativeComplexSeries(f, z)
			assertComplexClose(dfdx, fromY, 1e-8, 'Cauchy-Riemann consistency')
			assertComplexClose(seriesResult, dfdx, 1e-8, 'series vs partial x')
			assertComplexClose(seriesResult, fromY, 1e-8, 'series vs partial y')
		})

		test('product rule and chain rule identities', () => {
			const z = { re: -0.5, im: 0.9 }
			const f = cExp
			const g = cSin

			// Product rule: (f * g)'(z) = f'(z)g(z) + f(z)g'(z)
			const prod = (w) => cMul(f(w), g(w))
			const lhsProd = derivativeComplexSeries(prod, z)
			const rhsProd = cAdd(
				cMul(derivativeComplexSeries(f, z), g(z)),
				cMul(f(z), derivativeComplexSeries(g, z))
			)
			assertComplexClose(lhsProd, rhsProd, 1e-11, 'product rule')

			// Chain rule: (f o h)'(z) = f'(h(z)) * h'(z) with h(z) = z^2 + i*z
			const h = (w) => cAdd(cPowInt(w, 2), cMul({ re: 0, im: 1 }, w))
			const comp = (w) => f(h(w))
			const lhsChain = derivativeComplexSeries(comp, z)
			const rhsChain = cMul(derivativeComplexSeries(f, h(z)), derivativeComplexSeries(h, z))
			assertComplexClose(lhsChain, rhsChain, 1e-10, 'chain rule')
		})

		test('independent 4th-order Richardson directional difference along tilted ray', () => {
			// f(z) = cos(z) / (z + 2)
			const f = (w) => cDiv(cCos(w), cAdd(w, { re: 2, im: 0 }))
			const z = { re: 0.3, im: 0.7 }

			// Direction unit vector u = exp(i * 1.1)
			const alpha = 1.1
			const dir = { re: Math.cos(alpha), im: Math.sin(alpha) }
			const centralDiff = (h) => {
				const step = { re: h * dir.re, im: h * dir.im }
				const num = cSub(f(cAdd(z, step)), f(cSub(z, step)))
				const den = { re: 2 * step.re, im: 2 * step.im }
				return cDiv(num, den)
			}
			const h = 1e-3
			const d1 = centralDiff(h)
			const d2 = centralDiff(h / 2)
			// Richardson extrapolation eliminates O(h^2): (4*D(h/2) - D(h)) / 3
			const richardson = {
				re: (4 * d2.re - d1.re) / 3,
				im: (4 * d2.im - d1.im) / 3,
			}

			const seriesResult = derivativeComplexSeries(f, z)
			assertComplexClose(seriesResult, richardson, 1e-10, 'series vs Richardson directional diff')
		})
	})

	describe('input validation', () => {
		const id = (z) => z
		const validZ = { re: 1, im: 2 }

		test('rejects non-function f', () => {
			assert.throws(() => derivativeComplexSeries(null, validZ), TypeError)
			assert.throws(() => derivativeComplexSeries(42, validZ), TypeError)
			assert.throws(() => derivativeComplexSeries({}, validZ), TypeError)
		})

		test('rejects invalid z', () => {
			assert.throws(() => derivativeComplexSeries(id, null), TypeError)
			assert.throws(() => derivativeComplexSeries(id, 5), TypeError)
			assert.throws(() => derivativeComplexSeries(id, [1, 2]), TypeError)
			assert.throws(() => derivativeComplexSeries(id, { re: '1', im: 2 }), TypeError)
			assert.throws(() => derivativeComplexSeries(id, { re: 1 }), TypeError)
			assert.throws(() => derivativeComplexSeries(id, { re: NaN, im: 0 }), RangeError)
			assert.throws(() => derivativeComplexSeries(id, { re: 0, im: Infinity }), RangeError)
			assert.throws(() => derivativeComplexSeries(id, { re: -Infinity, im: 0 }), RangeError)
		})

		test('rejects invalid options', () => {
			assert.throws(() => derivativeComplexSeries(id, validZ, null), TypeError)
			assert.throws(() => derivativeComplexSeries(id, validZ, []), TypeError)
			assert.throws(() => derivativeComplexSeries(id, validZ, 'bad'), TypeError)

			assert.throws(() => derivativeComplexSeries(id, validZ, { order: '1' }), TypeError)
			assert.throws(() => derivativeComplexSeries(id, validZ, { order: -1 }), RangeError)
			assert.throws(() => derivativeComplexSeries(id, validZ, { order: 1.5 }), RangeError)
			assert.throws(() => derivativeComplexSeries(id, validZ, { order: NaN }), RangeError)

			assert.throws(() => derivativeComplexSeries(id, validZ, { radius: '0.1' }), TypeError)
			assert.throws(() => derivativeComplexSeries(id, validZ, { radius: 0 }), RangeError)
			assert.throws(() => derivativeComplexSeries(id, validZ, { radius: -0.01 }), RangeError)
			assert.throws(() => derivativeComplexSeries(id, validZ, { radius: Infinity }), RangeError)

			assert.throws(() => derivativeComplexSeries(id, validZ, { samples: '16' }), TypeError)
			assert.throws(() => derivativeComplexSeries(id, validZ, { order: 2, samples: 2 }), RangeError)
			assert.throws(() => derivativeComplexSeries(id, validZ, { samples: 0 }), RangeError)
			assert.throws(() => derivativeComplexSeries(id, validZ, { samples: 16.5 }), RangeError)
		})

		test('rejects invalid return values from f', () => {
			assert.throws(() => derivativeComplexSeries(() => null, validZ), TypeError)
			assert.throws(() => derivativeComplexSeries(() => ({ re: 1, im: 'x' }), validZ), TypeError)
			assert.throws(() => derivativeComplexSeries(() => ({ re: NaN, im: 0 }), validZ), RangeError)
			assert.throws(() => derivativeComplexSeries(() => ({ re: Infinity, im: 0 }), validZ), RangeError)
		})

		test('rejects scale overflow for huge order', () => {
			assert.throws(() => derivativeComplexSeries(id, validZ, { order: 200 }), RangeError)
		})
	})
})
