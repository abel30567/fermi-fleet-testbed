import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { log2ComplexSeries } from './log2ComplexSeries.js'

const PERIOD_IM = (2 * Math.PI) / Math.LN2

function assertNear(actual, expected, tol = 1e-12, label = '') {
	assert.ok(
		Math.abs(actual - expected) <= tol,
		`${label ? `${label}: ` : ''}expected ${actual} to be within ${tol} of ${expected} (diff=${Math.abs(actual - expected)})`
	)
}

function assertComplexNear(actual, expected, tol = 1e-12, label = '') {
	assertNear(actual.re, expected.re, tol, `${label} (re)`)
	assertNear(actual.im, expected.im, tol, `${label} (im)`)
}

/**
 * Independent complex base-2 exponential: 2^(a + bi) = 2^a * (cos(b * ln 2) + i * sin(b * ln 2)).
 */
function pow2Complex({ re, im }) {
	const mag = 2 ** re
	const angle = im * Math.LN2
	return {
		re: mag * Math.cos(angle),
		im: mag * Math.sin(angle),
	}
}

/**
 * Complex multiplication helper for identity cross-checks.
 */
function mulComplex(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	}
}

/**
 * Wraps imaginary difference modulo 2*pi / ln(2) into (-pi/ln(2), pi/ln(2)].
 */
function wrapImDiff(diff) {
	let r = ((diff + PERIOD_IM / 2) % PERIOD_IM + PERIOD_IM) % PERIOD_IM - PERIOD_IM / 2
	if (r <= -PERIOD_IM / 2) r += PERIOD_IM
	return r
}

describe('log2ComplexSeries', () => {
	test('exact positive real powers of 2', () => {
		assertComplexNear(log2ComplexSeries({ re: 1, im: 0 }), { re: 0, im: 0 }, 0)
		assertComplexNear(log2ComplexSeries({ re: 2, im: 0 }), { re: 1, im: 0 }, 0)
		assertComplexNear(log2ComplexSeries({ re: 8, im: 0 }), { re: 3, im: 0 }, 0)
		assertComplexNear(log2ComplexSeries({ re: 0.5, im: 0 }), { re: -1, im: 0 }, 0)
		assertComplexNear(log2ComplexSeries({ re: 0.125, im: 0 }), { re: -3, im: 0 }, 0)
	})

	test('purely imaginary, negative real, and quadrant values', () => {
		const piOverLn2 = Math.PI / Math.LN2

		assertComplexNear(log2ComplexSeries({ re: -1, im: 0 }), { re: 0, im: piOverLn2 }, 1e-14)
		assertComplexNear(log2ComplexSeries({ re: -4, im: 0 }), { re: 2, im: piOverLn2 }, 1e-14)
		assertComplexNear(log2ComplexSeries({ re: 0, im: 1 }), { re: 0, im: piOverLn2 / 2 }, 1e-14)
		assertComplexNear(log2ComplexSeries({ re: 0, im: -1 }), { re: 0, im: -piOverLn2 / 2 }, 1e-14)
		assertComplexNear(log2ComplexSeries({ re: 0, im: 4 }), { re: 2, im: piOverLn2 / 2 }, 1e-14)
		assertComplexNear(log2ComplexSeries({ re: 1, im: 1 }), { re: 0.5, im: piOverLn2 / 4 }, 1e-14)
		assertComplexNear(log2ComplexSeries({ re: -1, im: 1 }), { re: 0.5, im: (3 * piOverLn2) / 4 }, 1e-14)
		assertComplexNear(log2ComplexSeries({ re: -1, im: -1 }), { re: 0.5, im: (-3 * piOverLn2) / 4 }, 1e-14)
		assertComplexNear(log2ComplexSeries({ re: 1, im: -1 }), { re: 0.5, im: -piOverLn2 / 4 }, 1e-14)
	})

	test('series neighborhood near z = 1 avoids catastrophic cancellation', () => {
		// z = 1 + 1e-9 i: ln|z| = 0.5 * ln(1 + 1e-18) ≈ 0.5e-18, arg(z) ≈ 1e-9
		// Naive Math.log2(Math.hypot(1, 1e-9)) would lose all digits and return 0.
		const eps = 1e-9
		const res = log2ComplexSeries({ re: 1, im: eps })
		const expectedRe = (0.5 * eps * eps) / Math.LN2
		const expectedIm = eps / Math.LN2
		assertNear(res.re, expectedRe, 1e-26, 'tiny imaginary perturbation real part')
		assertNear(res.im, expectedIm, 1e-22, 'tiny imaginary perturbation imag part')

		// Exact binary float perturbation near 1: z = 1 + 2^-40
		const h = 2 ** -40
		const resReal = log2ComplexSeries({ re: 1 + h, im: 0 })
		assertNear(resReal.re, Math.log1p(h) / Math.LN2, 1e-26, 'tiny exact real perturbation')
		assert.equal(resReal.im, 0)
	})

	test('continuity across series/closed-form boundary', () => {
		const inside = log2ComplexSeries({ re: 1.249999, im: 0.249999 })
		const outside = log2ComplexSeries({ re: 1.250001, im: 0.250001 })
		assertComplexNear(inside, outside, 1e-5, 'continuity at upper-right boundary')

		const insideNeg = log2ComplexSeries({ re: 0.750001, im: -0.249999 })
		const outsideNeg = log2ComplexSeries({ re: 0.749999, im: -0.250001 })
		assertComplexNear(insideNeg, outsideNeg, 1e-5, 'continuity at lower-left boundary')
	})

	test('unit circle, signed zero branch cut, and extreme magnitudes', () => {
		// Exact Pythagorean unit-circle point (0.8 + 0.6i)
		const unit = log2ComplexSeries({ re: 0.8, im: 0.6 })
		assertNear(unit.re, 0, 1e-15, 'unit circle real part')
		assertNear(unit.im, Math.atan2(0.6, 0.8) / Math.LN2, 1e-14, 'unit circle imag part')

		// Signed zero along negative real branch cut
		const aboveCut = log2ComplexSeries({ re: -2, im: 0 })
		const belowCut = log2ComplexSeries({ re: -2, im: -0 })
		assertNear(aboveCut.re, 1, 1e-15)
		assertNear(aboveCut.im, Math.PI / Math.LN2, 1e-14)
		assertNear(belowCut.re, 1, 1e-15)
		assertNear(belowCut.im, -Math.PI / Math.LN2, 1e-14)

		// Very large magnitude (no overflow in hypot/squaring)
		const huge = log2ComplexSeries({ re: 1e300, im: 1e300 })
		assertNear(huge.re, Math.log2(1e300) + 0.5, 1e-12, 'huge real part')
		assertNear(huge.im, Math.PI / (4 * Math.LN2), 1e-14, 'huge imag part')

		// Very small magnitude (no underflow)
		const tiny = log2ComplexSeries({ re: 1e-300, im: -1e-300 })
		assertNear(tiny.re, Math.log2(1e-300) + 0.5, 1e-12, 'tiny real part')
		assertNear(tiny.im, -Math.PI / (4 * Math.LN2), 1e-14, 'tiny imag part')
	})

	test('independent cross-check: 2^(log2(z)) === z across all regimes', () => {
		const samples = [
			{ re: 1.1, im: 0.15 },
			{ re: 0.85, im: -0.2 },
			{ re: 1.0, im: 0.25 },
			{ re: 0.75, im: -0.25 },
			{ re: 3, im: 4 },
			{ re: -3, im: 4 },
			{ re: -3, im: -4 },
			{ re: 3, im: -4 },
			{ re: 0.01, im: -0.02 },
			{ re: -123.456, im: 78.9 },
			{ re: Math.cos(2.3), im: Math.sin(2.3) },
			{ re: Math.cos(-1.7), im: Math.sin(-1.7) },
		]

		for (const z of samples) {
			const w = log2ComplexSeries(z)
			const reconstructed = pow2Complex(w)
			const scale = Math.max(1, Math.hypot(z.re, z.im))
			assertComplexNear(reconstructed, z, 1e-12 * scale, `2^log2(${z.re}+${z.im}i)`)
		}
	})

	test('independent cross-check: polar formula, product rule, and conjugate symmetry', () => {
		const pairs = [
			[{ re: 1.15, im: -0.1 }, { re: 2.5, im: 1.75 }],
			[{ re: -2, im: 3 }, { re: -1.5, im: -0.5 }],
			[{ re: 0.9, im: 0.2 }, { re: 1.1, im: -0.15 }],
		]

		for (const [a, b] of pairs) {
			// Direct polar reference check
			for (const z of [a, b]) {
				const actual = log2ComplexSeries(z)
				const ref = {
					re: Math.log2(Math.hypot(z.re, z.im)),
					im: Math.atan2(z.im, z.re) / Math.LN2,
				}
				assertComplexNear(actual, ref, 1e-13, `polar ref for ${z.re}+${z.im}i`)

				// Conjugate symmetry: log2(conj(z)) === conj(log2(z))
				const conjLog = log2ComplexSeries({ re: z.re, im: -z.im })
				assertComplexNear(conjLog, { re: actual.re, im: -actual.im }, 1e-13, 'conjugate symmetry')
			}

			// Product rule: log2(a * b) ≡ log2(a) + log2(b) (mod 2*pi*i / ln 2)
			const prodLog = log2ComplexSeries(mulComplex(a, b))
			const logA = log2ComplexSeries(a)
			const logB = log2ComplexSeries(b)
			assertNear(prodLog.re, logA.re + logB.re, 1e-12, 'product rule real part')
			assertNear(wrapImDiff(prodLog.im - (logA.im + logB.im)), 0, 1e-12, 'product rule imag part')
		}
	})

	test('input validation rejects invalid types, non-finite values, and zero', () => {
		for (const bad of [null, undefined, 42, '1+2i', true]) {
			assert.throws(() => log2ComplexSeries(bad), TypeError)
		}

		for (const bad of [{ re: '1', im: 0 }, { re: 1, im: null }, { re: 1 }, {}]) {
			assert.throws(() => log2ComplexSeries(bad), TypeError)
		}

		for (const bad of [
			{ re: NaN, im: 0 },
			{ re: 0, im: NaN },
			{ re: Infinity, im: 1 },
			{ re: 1, im: -Infinity },
			{ re: 0, im: 0 },
			{ re: -0, im: -0 },
		]) {
			assert.throws(() => log2ComplexSeries(bad), RangeError)
		}
	})
})
