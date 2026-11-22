import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { derivativeComplexRecursive } from './derivativeComplexRecursive.js'

// --- Complex arithmetic helpers for tests ---

function cAdd(a, b) {
	return { re: a.re + b.re, im: a.im + b.im }
}

function cSub(a, b) {
	return { re: a.re - b.re, im: a.im - b.im }
}

function cMul(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	}
}

function cDiv(a, b) {
	const denom = b.re * b.re + b.im * b.im
	return {
		re: (a.re * b.re + a.im * b.im) / denom,
		im: (a.im * b.re - a.re * b.im) / denom,
	}
}

function cPowInt(z, n) {
	let result = { re: 1, im: 0 }
	for (let i = 0; i < n; i++) {
		result = cMul(result, z)
	}
	return result
}

function cExp(z) {
	const r = Math.exp(z.re)
	return { re: r * Math.cos(z.im), im: r * Math.sin(z.im) }
}

function cSin(z) {
	return {
		re: Math.sin(z.re) * Math.cosh(z.im),
		im: Math.cos(z.re) * Math.sinh(z.im),
	}
}

function cCos(z) {
	return {
		re: Math.cos(z.re) * Math.cosh(z.im),
		im: -Math.sin(z.re) * Math.sinh(z.im),
	}
}

function cLog(z) {
	return {
		re: Math.log(Math.hypot(z.re, z.im)),
		im: Math.atan2(z.im, z.re),
	}
}

function assertComplexClose(actual, expected, tol = 1e-10, message = '') {
	assert.equal(typeof actual, 'object', `${message} expected object`)
	assert.ok(!Object.is(actual.re, -0), `${message} re must not be -0`)
	assert.ok(!Object.is(actual.im, -0), `${message} im must not be -0`)
	const diff = Math.hypot(actual.re - expected.re, actual.im - expected.im)
	assert.ok(
		diff <= tol,
		`${message} expected (${expected.re} + ${expected.im}i), got (${actual.re} + ${actual.im}i), |diff|=${diff} > ${tol}`,
	)
}

describe('derivativeComplexRecursive', () => {
	describe('normal holomorphic functions', () => {
		it('differentiates constant and linear complex functions', () => {
			const c = { re: 3, im: -7 }
			const dConst = derivativeComplexRecursive(() => c, { re: 1.5, im: -2.5 })
			assertComplexClose(dConst, { re: 0, im: 0 }, 1e-13, 'constant')
			assert.ok(Object.is(dConst.re, 0))
			assert.ok(Object.is(dConst.im, 0))

			const slope = { re: 2, im: 3 }
			const intercept = { re: 5, im: -1 }
			const linear = (z) => cAdd(cMul(slope, z), intercept)
			const dLinear = derivativeComplexRecursive(linear, { re: -4, im: 6 })
			assertComplexClose(dLinear, slope, 1e-12, 'linear')
		})

		it('differentiates complex polynomials accurately', () => {
			// f(z) = z^3 - (1 + 2i)z^2 + 4z - 5i
			// f'(z) = 3z^2 - 2(1 + 2i)z + 4
			const coeff2 = { re: 1, im: 2 }
			const f = (z) =>
				cSub(
					cAdd(
						cSub(cPowInt(z, 3), cMul(coeff2, cPowInt(z, 2))),
						{ re: 4 * z.re, im: 4 * z.im },
					),
					{ re: 0, im: 5 },
				)
			const z = { re: 1.5, im: -2.25 }
			const expected = cAdd(
				cSub(
					cMul({ re: 3, im: 0 }, cPowInt(z, 2)),
					cMul({ re: 2, im: 4 }, z),
				),
				{ re: 4, im: 0 },
			)
			const actual = derivativeComplexRecursive(f, z)
			assertComplexClose(actual, expected, 1e-11, 'cubic polynomial')

			// High-degree polynomial: f(z) = z^7, f'(z) = 7z^6
			const z7 = { re: 1.2, im: -0.8 }
			const actual7 = derivativeComplexRecursive((w) => cPowInt(w, 7), z7)
			const expected7 = cMul({ re: 7, im: 0 }, cPowInt(z7, 6))
			assertComplexClose(actual7, expected7, 1e-10, 'degree-7 polynomial')
		})

		it('differentiates complex exponential, sin, cos, reciprocal, and principal log', () => {
			const points = [
				{ re: 0, im: 0 },
				{ re: 1, im: 2 },
				{ re: -0.5, im: Math.PI },
			]
			for (const z of points) {
				assertComplexClose(derivativeComplexRecursive(cExp, z), cExp(z), 1e-11, 'exp')
				assertComplexClose(derivativeComplexRecursive(cSin, z), cCos(z), 1e-11, 'sin')
				const negSin = { re: -cSin(z).re, im: -cSin(z).im }
				assertComplexClose(derivativeComplexRecursive(cCos, z), negSin, 1e-11, 'cos')
			}

			// f(z) = 1/z => f'(z) = -1/z^2
			const zRecip = { re: 1, im: 1 }
			const recip = (w) => cDiv({ re: 1, im: 0 }, w)
			const expectedRecip = cDiv({ re: -1, im: 0 }, cPowInt(zRecip, 2))
			assertComplexClose(derivativeComplexRecursive(recip, zRecip), expectedRecip, 1e-12, '1/z')

			// f(z) = Log(z) => f'(z) = 1/z
			const zLog = { re: 2, im: 3 }
			assertComplexClose(
				derivativeComplexRecursive(cLog, zLog),
				cDiv({ re: 1, im: 0 }, zLog),
				1e-12,
				'Log(z)',
			)
		})

		it('computes higher-order complex derivatives via options.order', () => {
			const z = { re: 0.7, im: -0.4 }
			// d^n/dz^n exp(z) = exp(z)
			for (const order of [2, 3, 4, 5]) {
				const d = derivativeComplexRecursive(cExp, z, { order })
				assertComplexClose(d, cExp(z), 1e-7, `exp order ${order}`)
			}

			// d^3/dz^3 (z^5) = 60 z^2
			const d3 = derivativeComplexRecursive((w) => cPowInt(w, 5), { re: 1.5, im: 0.5 }, { order: 3 })
			const expectedD3 = cMul({ re: 60, im: 0 }, cPowInt({ re: 1.5, im: 0.5 }, 2))
			assertComplexClose(d3, expectedD3, 1e-8, 'z^5 3rd derivative')

			// d^4/dz^4 sin(z) = sin(z)
			const d4Sin = derivativeComplexRecursive(cSin, z, { order: 4 })
			assertComplexClose(d4Sin, cSin(z), 1e-7, 'sin 4th derivative')
		})
	})

	describe('edge cases', () => {
		it('avoids -0 in output components', () => {
			const resZero = derivativeComplexRecursive((z) => ({ re: -0 * z.re, im: -0 * z.im }), { re: 0, im: 0 })
			assert.ok(Object.is(resZero.re, 0))
			assert.ok(Object.is(resZero.im, 0))

			// f(z) = -z^2 at z = 0 => f'(0) = 0 (not -0)
			const resNegSq = derivativeComplexRecursive(
				(z) => {
					const sq = cMul(z, z)
					return { re: -sq.re, im: -sq.im }
				},
				{ re: 0, im: 0 },
			)
			assert.ok(Object.is(resNegSq.re, 0))
			assert.ok(Object.is(resNegSq.im, 0))
		})

		it('supports maxDepth = 0 (single base stencil without extrapolation)', () => {
			const z = { re: 1, im: -1 }
			const res = derivativeComplexRecursive(cExp, z, { h: 1e-2, maxDepth: 0 })
			assertComplexClose(res, cExp(z), 1e-8, 'maxDepth=0')
		})

		it('handles large initial step h via recursive Richardson halving', () => {
			const z = { re: 0.5, im: 0.5 }
			const res = derivativeComplexRecursive(cExp, z, { h: 0.5, maxDepth: 12 })
			assertComplexClose(res, cExp(z), 1e-12, 'large h=0.5')
		})

		it('protects against roundoff blowup when tolerance is below machine precision', () => {
			const z = { re: 1.2, im: 0.9 }
			const res = derivativeComplexRecursive(cExp, z, {
				h: 1e-2,
				maxDepth: 25,
				tolerance: 1e-30,
			})
			assertComplexClose(res, cExp(z), 1e-11, 'roundoff protection')
		})

		it('handles points close to a singularity when given a smaller h', () => {
			const z = { re: 0.02, im: -0.01 }
			const recip = (w) => cDiv({ re: 1, im: 0 }, w)
			const expected = cDiv({ re: -1, im: 0 }, cPowInt(z, 2))
			const res = derivativeComplexRecursive(recip, z, { h: 1e-3 })
			assertComplexClose(res, expected, 1e-8, 'near pole')
		})

		it('does not mutate input z or options', () => {
			const z = Object.freeze({ re: 2, im: -3 })
			const options = Object.freeze({ h: 1e-2, maxDepth: 8, tolerance: 1e-12, order: 1 })
			const res = derivativeComplexRecursive((w) => cMul(w, w), z, options)
			assertComplexClose(res, { re: 4, im: -6 }, 1e-12)
		})
	})

	describe('cross-checks against independent computations and identities', () => {
		it('matches independent iterative central differences along both real and imaginary axes (Cauchy-Riemann)', () => {
			// f(z) = exp(z^2) + sin(z)
			const f = (z) => cAdd(cExp(cMul(z, z)), cSin(z))
			const z = { re: 0.6, im: -0.4 }
			const actual = derivativeComplexRecursive(f, z)

			// Independent iterative central difference along real axis: (f(z+eps) - f(z-eps)) / (2*eps)
			const eps = 1e-6
			const dfReal = {
				re: (f({ re: z.re + eps, im: z.im }).re - f({ re: z.re - eps, im: z.im }).re) / (2 * eps),
				im: (f({ re: z.re + eps, im: z.im }).im - f({ re: z.re - eps, im: z.im }).im) / (2 * eps),
			}

			// Independent central difference along imaginary axis: (f(z+i*eps) - f(z-i*eps)) / (2i*eps)
			// Note: (u + iv) / i = v - iu, so f'(z) = dv/dy - i * du/dy
			const fPlusI = f({ re: z.re, im: z.im + eps })
			const fMinusI = f({ re: z.re, im: z.im - eps })
			const dfImag = {
				re: (fPlusI.im - fMinusI.im) / (2 * eps),
				im: -(fPlusI.re - fMinusI.re) / (2 * eps),
			}

			assertComplexClose(actual, dfReal, 1e-8, 'vs real-axis central difference')
			assertComplexClose(actual, dfImag, 1e-8, 'vs imag-axis central difference')
		})

		it('matches the complex-step derivative formula on the real axis', () => {
			// For real-analytic f, f'(x) = Im(f(x + i*delta)) / delta with delta = 1e-100 (zero cancellation)
			const f = (z) => cDiv(cExp(z), cAdd(cMul(z, z), { re: 1, im: 0 }))
			const x = 1.35
			const delta = 1e-100
			const complexStepRealDerivative = f({ re: x, im: delta }).im / delta

			const actual = derivativeComplexRecursive(f, { re: x, im: 0 })
			assertComplexClose(actual, { re: complexStepRealDerivative, im: 0 }, 1e-12, 'vs complex-step')
		})

		it('satisfies linearity, product rule, quotient rule, and chain rule', () => {
			const f = (z) => cExp(z)
			const g = (z) => cAdd(cPowInt(z, 2), { re: 1, im: -2 })
			const z = { re: 0.8, im: 1.1 }

			const fz = f(z)
			const gz = g(z)
			const dfz = derivativeComplexRecursive(f, z)
			const dgz = derivativeComplexRecursive(g, z)

			// Linearity: (a*f + b*g)' = a*f' + b*g'
			const a = { re: 2, im: -3 }
			const b = { re: -1, im: 4 }
			const linearComb = (w) => cAdd(cMul(a, f(w)), cMul(b, g(w)))
			assertComplexClose(
				derivativeComplexRecursive(linearComb, z),
				cAdd(cMul(a, dfz), cMul(b, dgz)),
				1e-10,
				'linearity',
			)

			// Product rule: (f*g)' = f'*g + f*g'
			const prod = (w) => cMul(f(w), g(w))
			assertComplexClose(
				derivativeComplexRecursive(prod, z),
				cAdd(cMul(dfz, gz), cMul(fz, dgz)),
				1e-10,
				'product rule',
			)

			// Quotient rule: (f/g)' = (f'*g - f*g') / g^2
			const quot = (w) => cDiv(f(w), g(w))
			const expectedQuot = cDiv(cSub(cMul(dfz, gz), cMul(fz, dgz)), cMul(gz, gz))
			assertComplexClose(derivativeComplexRecursive(quot, z), expectedQuot, 1e-10, 'quotient rule')

			// Chain rule: (f o g)'(z) = f'(g(z)) * g'(z)
			const comp = (w) => f(g(w))
			const dfAtGz = derivativeComplexRecursive(f, gz)
			assertComplexClose(
				derivativeComplexRecursive(comp, z),
				cMul(dfAtGz, dgz),
				1e-9,
				'chain rule',
			)
		})
	})

	describe('input validation', () => {
		const id = (z) => z
		const validZ = { re: 1, im: 2 }

		it('throws TypeError when f is not a function', () => {
			for (const badF of [null, undefined, 42, 'fn', {}]) {
				assert.throws(() => derivativeComplexRecursive(badF, validZ), TypeError)
			}
		})

		it('throws TypeError or RangeError on invalid z', () => {
			for (const badZ of [null, undefined, 1, '1+i', [1, 2], { re: 1 }, { re: '1', im: 0 }]) {
				assert.throws(() => derivativeComplexRecursive(id, badZ), TypeError)
			}
			for (const nonFiniteZ of [
				{ re: NaN, im: 0 },
				{ re: 0, im: NaN },
				{ re: Infinity, im: 0 },
				{ re: 0, im: -Infinity },
			]) {
				assert.throws(() => derivativeComplexRecursive(id, nonFiniteZ), RangeError)
			}
		})

		it('throws TypeError or RangeError when f returns invalid complex values', () => {
			assert.throws(() => derivativeComplexRecursive(() => null, validZ), TypeError)
			assert.throws(() => derivativeComplexRecursive(() => 123, validZ), TypeError)
			assert.throws(() => derivativeComplexRecursive(() => ({ re: 1 }), validZ), TypeError)
			assert.throws(() => derivativeComplexRecursive(() => ({ re: NaN, im: 0 }), validZ), RangeError)
			assert.throws(() => derivativeComplexRecursive(() => ({ re: 0, im: Infinity }), validZ), RangeError)
		})

		it('throws TypeError or RangeError on invalid options', () => {
			for (const badOpts of [null, [], 'opts', 123]) {
				assert.throws(() => derivativeComplexRecursive(id, validZ, badOpts), TypeError)
			}

			// h
			assert.throws(() => derivativeComplexRecursive(id, validZ, { h: '0.01' }), TypeError)
			for (const badH of [0, -1e-3, NaN, Infinity, -Infinity]) {
				assert.throws(() => derivativeComplexRecursive(id, validZ, { h: badH }), RangeError)
			}
			assert.throws(() => derivativeComplexRecursive(id, validZ, { h: 1e-200, order: 2 }), RangeError)

			// maxDepth
			assert.throws(() => derivativeComplexRecursive(id, validZ, { maxDepth: '5' }), TypeError)
			for (const badDepth of [-1, 1.5, 31, NaN, Infinity]) {
				assert.throws(() => derivativeComplexRecursive(id, validZ, { maxDepth: badDepth }), RangeError)
			}

			// tolerance
			assert.throws(() => derivativeComplexRecursive(id, validZ, { tolerance: '1e-9' }), TypeError)
			for (const badTol of [0, -1e-9, NaN, Infinity]) {
				assert.throws(() => derivativeComplexRecursive(id, validZ, { tolerance: badTol }), RangeError)
			}

			// order
			assert.throws(() => derivativeComplexRecursive(id, validZ, { order: '1' }), TypeError)
			for (const badOrder of [0, -1, 1.5, 13, NaN, Infinity]) {
				assert.throws(() => derivativeComplexRecursive(id, validZ, { order: badOrder }), RangeError)
			}
		})
	})
})
