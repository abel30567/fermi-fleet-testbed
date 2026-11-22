import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { derivativeComplexIterative } from './derivativeComplexIterative.js'

// Complex arithmetic helpers for tests
const cAdd = (a, b) => ({ re: a.re + b.re, im: a.im + b.im })
const cSub = (a, b) => ({ re: a.re - b.re, im: a.im - b.im })
const cMul = (a, b) => ({
	re: a.re * b.re - a.im * b.im,
	im: a.re * b.im + a.im * b.re,
})
const cDiv = (a, b) => {
	const denom = b.re * b.re + b.im * b.im
	return {
		re: (a.re * b.re + a.im * b.im) / denom,
		im: (a.im * b.re - a.re * b.im) / denom,
	}
}
const cExp = (z) => {
	const r = Math.exp(z.re)
	return { re: r * Math.cos(z.im), im: r * Math.sin(z.im) }
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
	for (let i = 0; i < n; i++) {
		acc = cMul(acc, z)
	}
	return acc
}

function assertComplexClose(actual, expected, eps = 1e-9, msg = '') {
	assert.equal(typeof actual.re, 'number', `${msg} re must be number`)
	assert.equal(typeof actual.im, 'number', `${msg} im must be number`)
	const errRe = Math.abs(actual.re - expected.re)
	const errIm = Math.abs(actual.im - expected.im)
	const dist = Math.hypot(errRe, errIm)
	assert.ok(
		dist <= eps,
		`${msg} expected (${expected.re}, ${expected.im}), got (${actual.re}, ${actual.im}), |diff|=${dist} > ${eps}`,
	)
}

/**
 * Independent reference computation via Cauchy's Integral Formula:
 *   f^(n)(z) = (n! / (2*pi*i)) * \oint_{|w - z| = r} f(w) / (w - z)^(n+1) dw
 *            = (n! / r^n) * (1 / M) * sum_{k=0}^{M-1} f(z + r e^{i theta_k}) e^{-i n theta_k}
 */
function cauchyIntegralDerivative(fn, z, order = 1, radius = 0.2, samples = 64) {
	let factorial = 1
	for (let i = 2; i <= order; i++) factorial *= i

	let sumRe = 0
	let sumIm = 0
	for (let k = 0; k < samples; k++) {
		const theta = (2 * Math.PI * k) / samples
		const w = {
			re: z.re + radius * Math.cos(theta),
			im: z.im + radius * Math.sin(theta),
		}
		const fw = fn(w)
		const rot = {
			re: Math.cos(-order * theta),
			im: Math.sin(-order * theta),
		}
		const term = cMul(fw, rot)
		sumRe += term.re
		sumIm += term.im
	}

	const scale = factorial / (Math.pow(radius, order) * samples)
	return { re: sumRe * scale, im: sumIm * scale }
}

describe('derivativeComplexIterative', () => {
	describe('normal cases', () => {
		it('differentiates constant functions to zero', () => {
			const c = { re: 7.5, im: -4.2 }
			const d = derivativeComplexIterative(() => c, { re: 1.3, im: -2.7 })
			assertComplexClose(d, { re: 0, im: 0 }, 1e-12)
		})

		it('differentiates linear complex functions a*z + b', () => {
			const a = { re: 3, im: -5 }
			const b = { re: -2, im: 4 }
			const fn = (z) => cAdd(cMul(a, z), b)
			const d = derivativeComplexIterative(fn, { re: -1.2, im: 3.4 })
			assertComplexClose(d, a, 1e-11)
		})

		it('differentiates polynomials accurately', () => {
			// f(z) = z^4 - 3z^2 + 2i*z - 5
			// f'(z) = 4z^3 - 6z + 2i
			const fn = (z) => {
				const z4 = cPowInt(z, 4)
				const z2 = cPowInt(z, 2)
				return cAdd(
					cSub(z4, cMul({ re: 3, im: 0 }, z2)),
					cSub(cMul({ re: 0, im: 2 }, z), { re: 5, im: 0 }),
				)
			}
			const z = { re: 1.5, im: -0.75 }
			const expected = cAdd(
				cSub(cMul({ re: 4, im: 0 }, cPowInt(z, 3)), cMul({ re: 6, im: 0 }, z)),
				{ re: 0, im: 2 },
			)
			const actual = derivativeComplexIterative(fn, z)
			assertComplexClose(actual, expected, 1e-10)
		})

		it('differentiates exp(z), sin(z), cos(z), 1/z, and log(z)', () => {
			const z = { re: 0.7, im: -1.1 }

			assertComplexClose(derivativeComplexIterative(cExp, z), cExp(z), 1e-10, 'exp')
			assertComplexClose(derivativeComplexIterative(cSin, z), cCos(z), 1e-10, 'sin')

			const negSin = { re: -cSin(z).re, im: -cSin(z).im }
			assertComplexClose(derivativeComplexIterative(cCos, z), negSin, 1e-10, 'cos')

			const inv = (w) => cDiv({ re: 1, im: 0 }, w)
			const negInvSq = cDiv({ re: -1, im: 0 }, cMul(z, z))
			assertComplexClose(derivativeComplexIterative(inv, z), negInvSq, 1e-10, '1/z')

			const invZ = cDiv({ re: 1, im: 0 }, z)
			assertComplexClose(derivativeComplexIterative(cLog, z), invZ, 1e-10, 'log')
		})

		it('computes higher-order derivatives (orders 2 through 5)', () => {
			const z = { re: 0.4, im: 0.8 }
			const expectedExp = cExp(z)

			assertComplexClose(
				derivativeComplexIterative(cExp, z, { order: 2 }),
				expectedExp,
				1e-9,
				'exp order 2',
			)
			assertComplexClose(
				derivativeComplexIterative(cExp, z, { order: 3 }),
				expectedExp,
				1e-8,
				'exp order 3',
			)
			assertComplexClose(
				derivativeComplexIterative(cExp, z, { order: 4 }),
				expectedExp,
				1e-7,
				'exp order 4',
			)
			assertComplexClose(
				derivativeComplexIterative(cExp, z, { order: 5 }),
				expectedExp,
				1e-5,
				'exp order 5',
			)

			// For f(z) = z^5, f'''(z) = 60 z^2
			const z5 = (w) => cPowInt(w, 5)
			const expectedZ5Order3 = cMul({ re: 60, im: 0 }, cPowInt(z, 2))
			assertComplexClose(
				derivativeComplexIterative(z5, z, { order: 3 }),
				expectedZ5Order3,
				1e-7,
				'z^5 order 3',
			)
		})
	})

	describe('edge cases', () => {
		it('evaluates accurately at the origin z = 0 + 0i', () => {
			const dExp = derivativeComplexIterative(cExp, { re: 0, im: 0 })
			assertComplexClose(dExp, { re: 1, im: 0 }, 1e-11)

			const dSin = derivativeComplexIterative(cSin, { re: 0, im: 0 })
			assertComplexClose(dSin, { re: 1, im: 0 }, 1e-11)

			const dCos = derivativeComplexIterative(cCos, { re: 0, im: 0 })
			assertComplexClose(dCos, { re: 0, im: 0 }, 1e-11)
		})

		it('handles purely real and purely imaginary points', () => {
			const zReal = { re: 2.5, im: 0 }
			assertComplexClose(derivativeComplexIterative(cExp, zReal), cExp(zReal), 1e-10)

			const zImag = { re: 0, im: Math.PI / 3 }
			assertComplexClose(derivativeComplexIterative(cExp, zImag), cExp(zImag), 1e-10)
		})

		it('normalizes -0 to +0 and does not mutate input point z', () => {
			const z = { re: 1, im: 2 }
			const d = derivativeComplexIterative(() => ({ re: -0, im: -0 }), z)
			assert.equal(Object.is(d.re, -0), false)
			assert.equal(Object.is(d.im, -0), false)
			assert.deepEqual(d, { re: 0, im: 0 })
			assert.deepEqual(z, { re: 1, im: 2 })
		})

		it('supports maxIterations = 1, tolerance = 0, and custom step h near a singularity', () => {
			const z = { re: 1, im: 1 }
			const d1 = derivativeComplexIterative(cExp, z, { maxIterations: 1, h: 1e-4 })
			assertComplexClose(d1, cExp(z), 1e-7)

			const dStrict = derivativeComplexIterative((w) => cPowInt(w, 3), z, { tolerance: 0 })
			assertComplexClose(dStrict, cMul({ re: 3, im: 0 }, cPowInt(z, 2)), 1e-10)

			// Near pole at z = 0: f(z) = 1/z at z = 0.005 + 0i with small h
			const zNearPole = { re: 0.005, im: 0 }
			const inv = (w) => cDiv({ re: 1, im: 0 }, w)
			const expectedNearPole = cDiv({ re: -1, im: 0 }, cMul(zNearPole, zNearPole))
			const dNearPole = derivativeComplexIterative(inv, zNearPole, { h: 1e-5 })
			assertComplexClose(dNearPole, expectedNearPole, 1e-4)
		})

		it('stops safely if step halving reaches floating-point precision limit', () => {
			const zLarge = { re: 1e14, im: 0 }
			const fn = (w) => cMul({ re: 2, im: 3 }, w)
			const d = derivativeComplexIterative(fn, zLarge, { h: 1, maxIterations: 20 })
			assertComplexClose(d, { re: 2, im: 3 }, 1e-1)
		})
	})

	describe('input validation', () => {
		const id = (z) => z

		it('throws TypeError for invalid fn', () => {
			assert.throws(() => derivativeComplexIterative(null, { re: 0, im: 0 }), TypeError)
			assert.throws(() => derivativeComplexIterative('not-a-fn', { re: 0, im: 0 }), TypeError)
			assert.throws(() => derivativeComplexIterative(42, { re: 0, im: 0 }), TypeError)
		})

		it('throws TypeError or RangeError for invalid z', () => {
			assert.throws(() => derivativeComplexIterative(id, null), TypeError)
			assert.throws(() => derivativeComplexIterative(id, 5), TypeError)
			assert.throws(() => derivativeComplexIterative(id, { re: 1 }), TypeError)
			assert.throws(() => derivativeComplexIterative(id, { re: '1', im: 0 }), TypeError)
			assert.throws(() => derivativeComplexIterative(id, { re: NaN, im: 0 }), RangeError)
			assert.throws(() => derivativeComplexIterative(id, { re: 0, im: Infinity }), RangeError)
			assert.throws(() => derivativeComplexIterative(id, { re: -Infinity, im: 0 }), RangeError)
		})

		it('throws TypeError or RangeError when fn returns invalid complex values', () => {
			assert.throws(() => derivativeComplexIterative(() => null, { re: 1, im: 0 }), TypeError)
			assert.throws(() => derivativeComplexIterative(() => 123, { re: 1, im: 0 }), TypeError)
			assert.throws(
				() => derivativeComplexIterative(() => ({ re: 1, im: 'bad' }), { re: 1, im: 0 }),
				TypeError,
			)
			assert.throws(
				() => derivativeComplexIterative(() => ({ re: NaN, im: 0 }), { re: 1, im: 0 }),
				RangeError,
			)
			assert.throws(
				() => derivativeComplexIterative(() => ({ re: Infinity, im: 0 }), { re: 1, im: 0 }),
				RangeError,
			)
		})

		it('throws TypeError or RangeError for invalid options', () => {
			const z = { re: 1, im: 1 }
			assert.throws(() => derivativeComplexIterative(id, z, null), TypeError)
			assert.throws(() => derivativeComplexIterative(id, z, []), TypeError)
			assert.throws(() => derivativeComplexIterative(id, z, 'bad'), TypeError)

			assert.throws(() => derivativeComplexIterative(id, z, { order: '1' }), TypeError)
			assert.throws(() => derivativeComplexIterative(id, z, { order: 0 }), RangeError)
			assert.throws(() => derivativeComplexIterative(id, z, { order: -1 }), RangeError)
			assert.throws(() => derivativeComplexIterative(id, z, { order: 1.5 }), RangeError)
			assert.throws(() => derivativeComplexIterative(id, z, { order: 11 }), RangeError)

			assert.throws(() => derivativeComplexIterative(id, z, { h: '0.01' }), TypeError)
			assert.throws(() => derivativeComplexIterative(id, z, { h: 0 }), RangeError)
			assert.throws(() => derivativeComplexIterative(id, z, { h: -1e-3 }), RangeError)
			assert.throws(() => derivativeComplexIterative(id, z, { h: Infinity }), RangeError)
			assert.throws(() => derivativeComplexIterative(id, z, { h: NaN }), RangeError)

			assert.throws(() => derivativeComplexIterative(id, z, { maxIterations: '5' }), TypeError)
			assert.throws(() => derivativeComplexIterative(id, z, { maxIterations: 0 }), RangeError)
			assert.throws(() => derivativeComplexIterative(id, z, { maxIterations: 2.5 }), RangeError)
			assert.throws(() => derivativeComplexIterative(id, z, { maxIterations: 21 }), RangeError)

			assert.throws(() => derivativeComplexIterative(id, z, { tolerance: '1e-8' }), TypeError)
			assert.throws(() => derivativeComplexIterative(id, z, { tolerance: -1e-9 }), RangeError)
			assert.throws(() => derivativeComplexIterative(id, z, { tolerance: NaN }), RangeError)
			assert.throws(() => derivativeComplexIterative(id, z, { tolerance: Infinity }), RangeError)
		})
	})

	describe('independent cross-checks', () => {
		it('agrees with Cauchy integral formula across orders 1..4 on composite holomorphic functions', () => {
			const f1 = (z) => cMul(cExp(z), cSin(z))
			const z1 = { re: 0.6, im: -0.5 }
			for (let order = 1; order <= 4; order++) {
				const iterative = derivativeComplexIterative(f1, z1, { order })
				const cauchy = cauchyIntegralDerivative(f1, z1, order, 0.25, 64)
				const eps = order <= 2 ? 1e-9 : order === 3 ? 1e-7 : 1e-6
				assertComplexClose(iterative, cauchy, eps, `exp(z)*sin(z) order ${order}`)
			}

			// f2(z) = 1 / (z^2 + 1), poles at +-i; evaluate safely at z = 1.2 + 0.3i
			const f2 = (z) => cDiv({ re: 1, im: 0 }, cAdd(cMul(z, z), { re: 1, im: 0 }))
			const z2 = { re: 1.2, im: 0.3 }
			for (let order = 1; order <= 3; order++) {
				const iterative = derivativeComplexIterative(f2, z2, { order })
				const cauchy = cauchyIntegralDerivative(f2, z2, order, 0.2, 64)
				const eps = order <= 2 ? 1e-9 : 1e-7
				assertComplexClose(iterative, cauchy, eps, `1/(z^2+1) order ${order}`)
			}
		})

		it('satisfies Cauchy-Riemann equivalence against imaginary-axis central difference', () => {
			const funcs = [
				cExp,
				cSin,
				cCos,
				(z) => cPowInt(z, 4),
				(z) => cDiv({ re: 1, im: 0 }, cAdd(z, { re: 2, im: -1 })),
			]
			const z = { re: 0.9, im: 0.4 }
			const h = 1e-5

			for (const fn of funcs) {
				const dRealAxis = derivativeComplexIterative(fn, z)
				// Imaginary-axis central difference: (f(z + i*h) - f(z - i*h)) / (2*i*h)
				const fUp = fn({ re: z.re, im: z.im + h })
				const fDown = fn({ re: z.re, im: z.im - h })
				const diff = cSub(fUp, fDown)
				const dImagAxis = cDiv(diff, { re: 0, im: 2 * h })
				assertComplexClose(dRealAxis, dImagAxis, 1e-8)
			}
		})

		it('satisfies linearity, product rule, and chain rule', () => {
			const f = cSin
			const g = (z) => cAdd(cMul(z, z), { re: 1, im: -2 })
			const a = { re: 2.5, im: -1.5 }
			const b = { re: -0.75, im: 3.25 }
			const z = { re: 0.8, im: -0.6 }

			const df = derivativeComplexIterative(f, z)
			const dg = derivativeComplexIterative(g, z)

			// Linearity: (a*f + b*g)'(z) = a*f'(z) + b*g'(z)
			const linFn = (w) => cAdd(cMul(a, f(w)), cMul(b, g(w)))
			const dLin = derivativeComplexIterative(linFn, z)
			const expectedLin = cAdd(cMul(a, df), cMul(b, dg))
			assertComplexClose(dLin, expectedLin, 1e-9, 'linearity')

			// Product rule: (f*g)'(z) = f'(z)*g(z) + f(z)*g'(z)
			const prodFn = (w) => cMul(f(w), g(w))
			const dProd = derivativeComplexIterative(prodFn, z)
			const expectedProd = cAdd(cMul(df, g(z)), cMul(f(z), dg))
			assertComplexClose(dProd, expectedProd, 1e-9, 'product rule')

			// Chain rule: (f(g(z)))' = f'(g(z)) * g'(z)
			const compFn = (w) => f(g(w))
			const dComp = derivativeComplexIterative(compFn, z)
			const expectedComp = cMul(derivativeComplexIterative(f, g(z)), dg)
			assertComplexClose(dComp, expectedComp, 1e-9, 'chain rule')
		})
	})
})
