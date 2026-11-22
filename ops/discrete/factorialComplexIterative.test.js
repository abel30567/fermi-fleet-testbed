import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { factorialComplexIterative } from './factorialComplexIterative.js'

function assertComplexClose(actual, expected, relTol = 1e-12, absTol = 1e-12, label = '') {
	assert.equal(typeof actual, 'object', `${label}: result must be an object`)
	assert.equal(typeof actual.re, 'number', `${label}: re must be a number`)
	assert.equal(typeof actual.im, 'number', `${label}: im must be a number`)
	const errRe = Math.abs(actual.re - expected.re)
	const errIm = Math.abs(actual.im - expected.im)
	const scale = Math.max(1, Math.hypot(expected.re, expected.im))
	const tol = Math.max(absTol, relTol * scale)
	assert.ok(
		errRe <= tol && errIm <= tol,
		`${label}: expected (${expected.re} + ${expected.im}i), got (${actual.re} + ${actual.im}i) (tol=${tol})`,
	)
}

function cMul(a, b) {
	return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }
}

function cDiv(a, b) {
	const denom = b.re * b.re + b.im * b.im
	return {
		re: (a.re * b.re + a.im * b.im) / denom,
		im: (a.im * b.re - a.re * b.im) / denom,
	}
}

function cSin(z) {
	return {
		re: Math.sin(z.re) * Math.cosh(z.im),
		im: Math.cos(z.re) * Math.sinh(z.im),
	}
}

/**
 * Independent reference computation of z! = Gamma(z + 1) using iterative
 * argument shifting + Stirling's asymptotic series with Bernoulli numbers.
 */
function stirlingFactorialRef(z) {
	const BERNOULLI = [
		1 / 12,
		-1 / 360,
		1 / 1260,
		-1 / 1680,
		1 / 1188,
		-691 / 360360,
		1 / 156,
		-3617 / 122400,
	]
	// Shift w = z + 1 rightward until Re(w) >= 14: Gamma(w) = Gamma(w + m) / prod_{k=0}^{m-1} (w + k)
	let w = { re: z.re + 1, im: z.im }
	let denom = { re: 1, im: 0 }
	while (w.re < 14) {
		denom = cMul(denom, w)
		w = { re: w.re + 1, im: w.im }
	}
	// Stirling series for log(Gamma(w))
	const logW = { re: Math.log(Math.hypot(w.re, w.im)), im: Math.atan2(w.im, w.re) }
	const main = cMul({ re: w.re - 0.5, im: w.im }, logW)
	let logG = {
		re: main.re - w.re + 0.5 * Math.log(2 * Math.PI),
		im: main.im - w.im,
	}
	const invW = cDiv({ re: 1, im: 0 }, w)
	const invW2 = cMul(invW, invW)
	let termPow = invW
	for (const coeff of BERNOULLI) {
		logG = {
			re: logG.re + coeff * termPow.re,
			im: logG.im + coeff * termPow.im,
		}
		termPow = cMul(termPow, invW2)
	}
	const mag = Math.exp(logG.re)
	const gammaShifted = { re: mag * Math.cos(logG.im), im: mag * Math.sin(logG.im) }
	return cDiv(gammaShifted, denom)
}

describe('factorialComplexIterative', () => {
	describe('normal cases', () => {
		it('computes exact factorials for non-negative integers', () => {
			assert.deepStrictEqual(factorialComplexIterative({ re: 0, im: 0 }), { re: 1, im: 0 })
			assert.deepStrictEqual(factorialComplexIterative({ re: 1, im: 0 }), { re: 1, im: 0 })
			assert.deepStrictEqual(factorialComplexIterative({ re: 2, im: 0 }), { re: 2, im: 0 })
			assert.deepStrictEqual(factorialComplexIterative({ re: 5, im: 0 }), { re: 120, im: 0 })
			assert.deepStrictEqual(factorialComplexIterative({ re: 10, im: 0 }), { re: 3628800, im: 0 })
			assert.deepStrictEqual(factorialComplexIterative({ re: 20, im: 0 }), { re: 2432902008176640000, im: 0 })
		})

		it('computes half-integer factorials (positive and negative)', () => {
			const sqrtPi = Math.sqrt(Math.PI)
			assertComplexClose(factorialComplexIterative({ re: 0.5, im: 0 }), { re: sqrtPi / 2, im: 0 }, 1e-13, 1e-13, '(0.5)!')
			assertComplexClose(factorialComplexIterative({ re: 1.5, im: 0 }), { re: (3 * sqrtPi) / 4, im: 0 }, 1e-13, 1e-13, '(1.5)!')
			assertComplexClose(factorialComplexIterative({ re: 2.5, im: 0 }), { re: (15 * sqrtPi) / 8, im: 0 }, 1e-13, 1e-13, '(2.5)!')
			assertComplexClose(factorialComplexIterative({ re: -0.5, im: 0 }), { re: sqrtPi, im: 0 }, 1e-13, 1e-13, '(-0.5)!')
			assertComplexClose(factorialComplexIterative({ re: -1.5, im: 0 }), { re: -2 * sqrtPi, im: 0 }, 1e-13, 1e-13, '(-1.5)!')
			assertComplexClose(factorialComplexIterative({ re: -2.5, im: 0 }), { re: (4 * sqrtPi) / 3, im: 0 }, 1e-13, 1e-13, '(-2.5)!')

			// Purely real non-integers must have exact zero imaginary part
			assert.equal(factorialComplexIterative({ re: 0.5, im: 0 }).im, 0)
			assert.equal(factorialComplexIterative({ re: -1.5, im: 0 }).im, 0)
			assert.equal(factorialComplexIterative({ re: -2.5, im: 0 }).im, 0)
		})

		it('computes known complex factorials accurately', () => {
			// i! = Gamma(1 + i) = 0.49801566811835604 - 0.15494982830181068i
			assertComplexClose(
				factorialComplexIterative({ re: 0, im: 1 }),
				{ re: 0.49801566811835604, im: -0.15494982830181068 },
				1e-13,
				1e-13,
				'i!',
			)
			// (1 + i)! = (1 + i) * i!
			assertComplexClose(
				factorialComplexIterative({ re: 1, im: 1 }),
				{ re: 0.6529654964201667, im: 0.34306583981654535 },
				1e-13,
				1e-13,
				'(1 + i)!',
			)
			// (-2 + i)! = i! / ((-1 + i) * i)
			assertComplexClose(
				factorialComplexIterative({ re: -2, im: 1 }),
				{ re: -0.17153291990827268, im: 0.32648274821008335 },
				1e-13,
				1e-13,
				'(-2 + i)!',
			)
		})
	})

	describe('edge cases and input validation', () => {
		it('handles largest finite integer factorial (170!) and overflows at 171!', () => {
			const res170 = factorialComplexIterative({ re: 170, im: 0 })
			assert.ok(Number.isFinite(res170.re) && res170.re > 7e306)
			assert.equal(res170.im, 0)
			assert.throws(() => factorialComplexIterative({ re: 171, im: 0 }), RangeError)
			assert.throws(() => factorialComplexIterative({ re: 171.5, im: 0 }), RangeError)
			assert.throws(() => factorialComplexIterative({ re: 200, im: 1 }), RangeError)
		})

		it('handles underflow cleanly without NaN or Infinity', () => {
			assert.deepStrictEqual(factorialComplexIterative({ re: 0, im: 500 }), { re: 0, im: 0 })
			assert.deepStrictEqual(factorialComplexIterative({ re: -5, im: 500 }), { re: 0, im: 0 })
			assert.deepStrictEqual(factorialComplexIterative({ re: -5, im: -500 }), { re: 0, im: 0 })
			assert.deepStrictEqual(factorialComplexIterative({ re: -1000.5, im: 0 }), { re: 0, im: 0 })
		})

		it('normalizes negative zero to positive zero', () => {
			const r1 = factorialComplexIterative({ re: 0, im: -0 })
			assert.ok(Object.is(r1.re, 1) && Object.is(r1.im, 0))
			const r2 = factorialComplexIterative({ re: -0, im: 0 })
			assert.ok(Object.is(r2.re, 1) && Object.is(r2.im, 0))
		})

		it('throws RangeError at negative integer poles', () => {
			assert.throws(() => factorialComplexIterative({ re: -1, im: 0 }), RangeError)
			assert.throws(() => factorialComplexIterative({ re: -1, im: -0 }), RangeError)
			assert.throws(() => factorialComplexIterative({ re: -2, im: 0 }), RangeError)
			assert.throws(() => factorialComplexIterative({ re: -100, im: 0 }), RangeError)
		})

		it('throws RangeError on non-finite components', () => {
			assert.throws(() => factorialComplexIterative({ re: NaN, im: 0 }), RangeError)
			assert.throws(() => factorialComplexIterative({ re: 0, im: NaN }), RangeError)
			assert.throws(() => factorialComplexIterative({ re: Infinity, im: 0 }), RangeError)
			assert.throws(() => factorialComplexIterative({ re: -Infinity, im: 0 }), RangeError)
			assert.throws(() => factorialComplexIterative({ re: 1, im: Infinity }), RangeError)
			assert.throws(() => factorialComplexIterative({ re: 1, im: -Infinity }), RangeError)
		})

		it('throws TypeError on invalid input types', () => {
			assert.throws(() => factorialComplexIterative(), TypeError)
			assert.throws(() => factorialComplexIterative(null), TypeError)
			assert.throws(() => factorialComplexIterative(5), TypeError)
			assert.throws(() => factorialComplexIterative('5'), TypeError)
			assert.throws(() => factorialComplexIterative([1, 2]), TypeError)
			assert.throws(() => factorialComplexIterative({ re: 1 }), TypeError)
			assert.throws(() => factorialComplexIterative({ im: 1 }), TypeError)
			assert.throws(() => factorialComplexIterative({ re: '1', im: 0 }), TypeError)
			assert.throws(() => factorialComplexIterative({ re: 1, im: '0' }), TypeError)
		})
	})

	describe('independent mathematical cross-checks', () => {
		const samplePoints = [
			{ re: 0.25, im: 0.75 },
			{ re: 3.2, im: -2.1 },
			{ re: -0.5, im: 1.5 },
			{ re: -0.75, im: 0.4 },
			{ re: -3.3, im: 2.2 },
			{ re: -4.5, im: -1.8 },
			{ re: 12.4, im: 5.6 },
		]

		it('satisfies recurrence identity z! = z * (z - 1)! across the complex plane', () => {
			for (const z of samplePoints) {
				const lhs = factorialComplexIterative(z)
				const rhs = cMul(z, factorialComplexIterative({ re: z.re - 1, im: z.im }))
				assertComplexClose(lhs, rhs, 1e-12, 1e-12, `recurrence at ${z.re}+${z.im}i`)
			}
		})

		it("satisfies Euler's reflection formula z! * (-z)! = pi * z / sin(pi * z)", () => {
			for (const z of samplePoints) {
				const lhs = cMul(
					factorialComplexIterative(z),
					factorialComplexIterative({ re: -z.re, im: -z.im }),
				)
				const piZ = { re: Math.PI * z.re, im: Math.PI * z.im }
				const rhs = cDiv(piZ, cSin(piZ))
				assertComplexClose(lhs, rhs, 1e-12, 1e-12, `reflection at ${z.re}+${z.im}i`)
			}
		})

		it('satisfies conjugate symmetry conj(z!) = (conj(z))!', () => {
			for (const z of samplePoints) {
				const fz = factorialComplexIterative(z)
				const fConjZ = factorialComplexIterative({ re: z.re, im: -z.im })
				assertComplexClose(
					{ re: fz.re, im: -fz.im },
					fConjZ,
					1e-13,
					1e-13,
					`conjugate at ${z.re}+${z.im}i`,
				)
			}
		})

		it('satisfies closed-form modulus identities on imaginary and half-integer vertical lines', () => {
			for (const y of [0.5, 1, 2.5, 5, -3.2]) {
				// |(iy)!|^2 = pi * y / sinh(pi * y)
				const fiy = factorialComplexIterative({ re: 0, im: y })
				const modSq = fiy.re * fiy.re + fiy.im * fiy.im
				const expected = (Math.PI * y) / Math.sinh(Math.PI * y)
				assert.ok(
					Math.abs(modSq - expected) <= 1e-12 * Math.max(1, expected),
					`|(i*${y})!|^2 mismatch: got ${modSq}, expected ${expected}`,
				)

				// |(-0.5 + iy)!|^2 = |Gamma(0.5 + iy)|^2 = pi / cosh(pi * y)
				const fHalf = factorialComplexIterative({ re: -0.5, im: y })
				const modSqHalf = fHalf.re * fHalf.re + fHalf.im * fHalf.im
				const expectedHalf = Math.PI / Math.cosh(Math.PI * y)
				assert.ok(
					Math.abs(modSqHalf - expectedHalf) <= 1e-12 * Math.max(1, expectedHalf),
					`|(-0.5 + i*${y})!|^2 mismatch: got ${modSqHalf}, expected ${expectedHalf}`,
				)
			}
		})

		it('matches independent iterative Stirling asymptotic series reference', () => {
			const testGrid = [
				{ re: 0, im: 1 },
				{ re: 0.5, im: 0.5 },
				{ re: 4.3, im: -1.7 },
				{ re: -0.3, im: 2.0 },
				{ re: -2.4, im: 1.1 },
				{ re: -5.2, im: -3.4 },
				{ re: 15.5, im: -4.2 },
				{ re: 50.25, im: 10.5 },
			]
			for (const z of testGrid) {
				const actual = factorialComplexIterative(z)
				const expected = stirlingFactorialRef(z)
				assertComplexClose(actual, expected, 1e-12, 1e-12, `Stirling ref at ${z.re}+${z.im}i`)
			}
		})
	})
})
