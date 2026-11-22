import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { cosComplexRecursive } from './cosComplexRecursive.js'

function assertComplexClose(actual, expected, relTol = 1e-13, absTol = 1e-14) {
	const scaleRe = Math.max(1, Math.abs(expected.re), Math.abs(actual.re))
	const scaleIm = Math.max(1, Math.abs(expected.im), Math.abs(actual.im))
	const diffRe = Math.abs(actual.re - expected.re)
	const diffIm = Math.abs(actual.im - expected.im)

	assert.ok(
		diffRe <= Math.max(absTol, relTol * scaleRe),
		`Real part mismatch: actual=${actual.re}, expected=${expected.re}, diff=${diffRe}`,
	)
	assert.ok(
		diffIm <= Math.max(absTol, relTol * scaleIm),
		`Imag part mismatch: actual=${actual.im}, expected=${expected.im}, diff=${diffIm}`,
	)
}

function complexMul(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	}
}

function complexAdd(a, b) {
	return { re: a.re + b.re, im: a.im + b.im }
}

/**
 * Independent reference using standard library hyperbolic & trig functions:
 *   cos(x + i·y) = cos(x)·cosh(y) - i·sin(x)·sinh(y)
 */
function referenceCosDirect({ re, im }) {
	return {
		re: Math.cos(re) * Math.cosh(im),
		im: -Math.sin(re) * Math.sinh(im),
	}
}

/**
 * Independent reference using Euler's exponential formula:
 *   cos(z) = (e^(i·z) + e^(-i·z)) / 2
 * where i·z = -y + i·x and -i·z = y - i·x.
 */
function referenceCosEuler({ re, im }) {
	const ePos = Math.exp(-im)
	const eNeg = Math.exp(im)
	const cosX = Math.cos(re)
	const sinX = Math.sin(re)
	return {
		re: 0.5 * (ePos + eNeg) * cosX,
		im: 0.5 * (ePos - eNeg) * sinX,
	}
}

describe('cosComplexRecursive', () => {
	describe('normal cases (general complex inputs)', () => {
		it('computes accurate cosine across all four quadrants', () => {
			const samples = [
				{ re: 1, im: 2 },
				{ re: -1.3, im: 0.7 },
				{ re: 2.5, im: -3.1 },
				{ re: -4.2, im: -1.8 },
				{ re: 0.5, im: 0.5 },
				{ re: 0.01, im: -0.02 }, // inside base case |w| <= 2^-4
				{ re: 10.75, im: 6.25 }, // multiple halving levels
			]

			for (const z of samples) {
				const actual = cosComplexRecursive(z)
				assertComplexClose(actual, referenceCosDirect(z))
				assertComplexClose(actual, referenceCosEuler(z))
			}
		})

		it('matches exact known special values', () => {
			assertComplexClose(cosComplexRecursive({ re: 0, im: 0 }), { re: 1, im: 0 })
			assertComplexClose(cosComplexRecursive({ re: Math.PI / 3, im: 0 }), { re: 0.5, im: 0 })
			assertComplexClose(cosComplexRecursive({ re: Math.PI / 2, im: 0 }), { re: 0, im: 0 })
			assertComplexClose(cosComplexRecursive({ re: Math.PI, im: 0 }), { re: -1, im: 0 })
			assertComplexClose(cosComplexRecursive({ re: 2 * Math.PI, im: 0 }), { re: 1, im: 0 })
			assertComplexClose(cosComplexRecursive({ re: 0, im: 1 }), { re: Math.cosh(1), im: 0 })
			assertComplexClose(cosComplexRecursive({ re: 0, im: -1 }), { re: Math.cosh(1), im: 0 })
		})
	})

	describe('edge cases', () => {
		it('normalizes -0 to +0 in output components', () => {
			const cases = [
				{ re: 0, im: 0 },
				{ re: -0, im: -0 },
				{ re: 0, im: -0 },
				{ re: Math.PI, im: 0 },
				{ re: Math.PI, im: -0 },
				{ re: 0, im: 2.5 },
			]
			for (const z of cases) {
				const res = cosComplexRecursive(z)
				if (res.re === 0) assert.ok(Object.is(res.re, 0), `Expected +0 real part for ${JSON.stringify(z)}`)
				if (res.im === 0) assert.ok(Object.is(res.im, 0), `Expected +0 imag part for ${JSON.stringify(z)}`)
			}
		})

		it('handles pure real inputs including tiny and very large arguments', () => {
			const reals = [
				-1e100,
				-1e15,
				-1e8,
				-100,
				-1e-12,
				0,
				1e-12,
				1e-7,
				100,
				1e8,
				1e15,
				1e100,
				Number.MAX_VALUE,
			]
			for (const x of reals) {
				const actual = cosComplexRecursive({ re: x, im: 0 })
				assertComplexClose(actual, { re: Math.cos(x), im: 0 }, 1e-14, 1e-15)
				assert.ok(Object.is(actual.im, 0))
			}
		})

		it('handles pure imaginary inputs including tiny and large arguments', () => {
			const imags = [-700, -50, -10, -1e-12, 0, 1e-12, 10, 50, 700]
			for (const y of imags) {
				const actual = cosComplexRecursive({ re: 0, im: y })
				assertComplexClose(actual, { re: Math.cosh(y), im: 0 }, 1e-13, 1e-14)
				assert.ok(Object.is(actual.im, 0))
			}
		})

		it('avoids premature overflow near |im| = 710.6 when product is finite', () => {
			// cosh(710.6) alone exceeds Number.MAX_VALUE (~2.04e308),
			// but cos(pi/4) * cosh(710.6) ≈ 1.445e308 is finite.
			const z = { re: Math.PI / 4, im: 710.6 }
			const actual = cosComplexRecursive(z)
			assert.ok(Number.isFinite(actual.re) && Number.isFinite(actual.im))

			// Cross-check via factored exp(710.6 / 2)^2 * cos(pi/4) / 2
			const halfExp = Math.exp(710.6 / 2)
			const expectedMag = (Math.SQRT1_2 * halfExp) * (0.5 * halfExp)
			assertComplexClose(actual, { re: expectedMag, im: -expectedMag }, 1e-12)
		})

		it('throws RangeError when result overflows IEEE-754 double precision', () => {
			assert.throws(() => cosComplexRecursive({ re: 0, im: 711 }), RangeError)
			assert.throws(() => cosComplexRecursive({ re: 1, im: 1000 }), RangeError)
			assert.throws(() => cosComplexRecursive({ re: -2, im: -800 }), RangeError)
			assert.throws(() => cosComplexRecursive({ re: 0, im: 1e100 }), RangeError)
		})
	})

	describe('input validation', () => {
		it('throws TypeError for non-object or malformed inputs', () => {
			for (const bad of [null, undefined, 0, 1, '1+2i', true, [1, 2], () => {}]) {
				assert.throws(() => cosComplexRecursive(bad), TypeError)
			}
			for (const bad of [
				{},
				{ re: 1 },
				{ im: 1 },
				{ re: '1', im: 0 },
				{ re: 0, im: '1' },
				{ re: null, im: 0 },
				{ re: 0, im: undefined },
			]) {
				assert.throws(() => cosComplexRecursive(bad), TypeError)
			}
		})

		it('throws RangeError for NaN and ±Infinity inputs', () => {
			for (const bad of [
				{ re: Number.NaN, im: 0 },
				{ re: 0, im: Number.NaN },
				{ re: Number.POSITIVE_INFINITY, im: 0 },
				{ re: Number.NEGATIVE_INFINITY, im: 0 },
				{ re: 0, im: Number.POSITIVE_INFINITY },
				{ re: 0, im: Number.NEGATIVE_INFINITY },
			]) {
				assert.throws(() => cosComplexRecursive(bad), RangeError)
			}
		})
	})

	describe('algebraic identities & independent cross-checks', () => {
		it('satisfies evenness cos(-z) === cos(z) and conjugate symmetry cos(conj(z)) === conj(cos(z))', () => {
			const samples = [
				{ re: 0.7, im: 1.9 },
				{ re: -2.4, im: 3.3 },
				{ re: 5.1, im: -0.4 },
			]
			for (const z of samples) {
				const cz = cosComplexRecursive(z)
				const cNeg = cosComplexRecursive({ re: -z.re, im: -z.im })
				const cConj = cosComplexRecursive({ re: z.re, im: -z.im })

				assertComplexClose(cNeg, cz, 1e-14, 1e-15)
				assertComplexClose(cConj, { re: cz.re, im: -cz.im }, 1e-14, 1e-15)
			}
		})

		it('satisfies periodicity cos(z + 2π) === cos(z) and half-period cos(z + π) === -cos(z)', () => {
			const samples = [
				{ re: 0.3, im: 1.2 },
				{ re: -1.7, im: -2.6 },
				{ re: 4.1, im: 0.9 },
			]
			for (const z of samples) {
				const cz = cosComplexRecursive(z)
				const cPlus2Pi = cosComplexRecursive({ re: z.re + 2 * Math.PI, im: z.im })
				const cPlusPi = cosComplexRecursive({ re: z.re + Math.PI, im: z.im })

				assertComplexClose(cPlus2Pi, cz, 1e-13, 1e-14)
				assertComplexClose(cPlusPi, { re: -cz.re, im: -cz.im }, 1e-13, 1e-14)
			}
		})

		it('satisfies the double-angle identity cos(2z) === 2·cos(z)^2 - 1', () => {
			const samples = [
				{ re: 0.4, im: 0.6 },
				{ re: -1.2, im: 2.1 },
				{ re: 2.3, im: -1.5 },
			]
			for (const z of samples) {
				const cz = cosComplexRecursive(z)
				const c2z = cosComplexRecursive({ re: 2 * z.re, im: 2 * z.im })
				const czSq = complexMul(cz, cz)
				const rhs = { re: 2 * czSq.re - 1, im: 2 * czSq.im }

				assertComplexClose(c2z, rhs, 1e-13, 1e-14)
			}
		})

		it('satisfies product-to-sum identity cos(z1 + z2) + cos(z1 - z2) === 2·cos(z1)·cos(z2)', () => {
			const pairs = [
				[
					{ re: 0.8, im: 1.1 },
					{ re: -0.5, im: 0.9 },
				],
				[
					{ re: 2.1, im: -1.4 },
					{ re: 1.3, im: 2.2 },
				],
			]
			for (const [z1, z2] of pairs) {
				const sum = { re: z1.re + z2.re, im: z1.im + z2.im }
				const diff = { re: z1.re - z2.re, im: z1.im - z2.im }
				const lhs = complexAdd(cosComplexRecursive(sum), cosComplexRecursive(diff))
				const prod = complexMul(cosComplexRecursive(z1), cosComplexRecursive(z2))
				const rhs = { re: 2 * prod.re, im: 2 * prod.im }

				assertComplexClose(lhs, rhs, 1e-13, 1e-14)
			}
		})
	})
})
