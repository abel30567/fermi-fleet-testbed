import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { lnComplexIterative } from './lnComplexIterative.js'

const TOL = 1e-13

function assertComplexClose(actual, expected, tol = TOL, label = '') {
	const prefix = label ? `${label}: ` : ''
	assert.equal(typeof actual.re, 'number', `${prefix}re must be a number`)
	assert.equal(typeof actual.im, 'number', `${prefix}im must be a number`)
	assert.ok(
		Math.abs(actual.re - expected.re) <= tol * Math.max(1, Math.abs(expected.re)),
		`${prefix}re mismatch: got ${actual.re}, expected ${expected.re}`
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= tol * Math.max(1, Math.abs(expected.im)),
		`${prefix}im mismatch: got ${actual.im}, expected ${expected.im}`
	)
}

function expComplex({ re, im }) {
	const r = Math.exp(re)
	return {
		re: r * Math.cos(im),
		im: r * Math.sin(im),
	}
}

describe('lnComplexIterative', () => {
	test('handles canonical exact and axis edge cases (1, -1, i, -i, e)', () => {
		assert.deepEqual(lnComplexIterative({ re: 1, im: 0 }), { re: 0, im: 0 })
		assertComplexClose(lnComplexIterative({ re: -1, im: 0 }), { re: 0, im: Math.PI }, TOL, 'ln(-1)')
		assertComplexClose(lnComplexIterative({ re: 0, im: 1 }), { re: 0, im: Math.PI / 2 }, TOL, 'ln(i)')
		assertComplexClose(lnComplexIterative({ re: 0, im: -1 }), { re: 0, im: -Math.PI / 2 }, TOL, 'ln(-i)')
		assertComplexClose(lnComplexIterative({ re: Math.E, im: 0 }), { re: 1, im: 0 }, TOL, 'ln(e)')
		assertComplexClose(lnComplexIterative({ re: -Math.E, im: 0 }), { re: 1, im: Math.PI }, TOL, 'ln(-e)')
		assertComplexClose(lnComplexIterative({ re: 0, im: Math.E }), { re: 1, im: Math.PI / 2 }, TOL, 'ln(e*i)')
		assertComplexClose(lnComplexIterative({ re: 0, im: -Math.E }), { re: 1, im: -Math.PI / 2 }, TOL, 'ln(-e*i)')
	})

	test('handles signed zeros cleanly without returning -0', () => {
		const res1 = lnComplexIterative({ re: 1, im: -0 })
		assert.ok(Object.is(res1.re, 0))
		assert.ok(Object.is(res1.im, 0))

		const resNeg1 = lnComplexIterative({ re: -1, im: -0 })
		assert.ok(Object.is(resNeg1.re, 0))
		assertComplexClose(resNeg1, { re: 0, im: Math.PI })
	})

	test('computes normal values across all four quadrants', () => {
		assertComplexClose(
			lnComplexIterative({ re: 1, im: 1 }),
			{ re: 0.5 * Math.LN2, im: Math.PI / 4 },
			TOL,
			'Q1 (1 + i)'
		)
		assertComplexClose(
			lnComplexIterative({ re: -1, im: 1 }),
			{ re: 0.5 * Math.LN2, im: (3 * Math.PI) / 4 },
			TOL,
			'Q2 (-1 + i)'
		)
		assertComplexClose(
			lnComplexIterative({ re: -1, im: -1 }),
			{ re: 0.5 * Math.LN2, im: (-3 * Math.PI) / 4 },
			TOL,
			'Q3 (-1 - i)'
		)
		assertComplexClose(
			lnComplexIterative({ re: 1, im: -1 }),
			{ re: 0.5 * Math.LN2, im: -Math.PI / 4 },
			TOL,
			'Q4 (1 - i)'
		)
		assertComplexClose(
			lnComplexIterative({ re: 3, im: 4 }),
			{ re: Math.log(5), im: Math.atan2(4, 3) },
			TOL,
			'3 + 4i'
		)
	})

	test('handles very large, very small, and near-unit-circle magnitudes without overflow/underflow', () => {
		// Huge magnitude where Math.hypot(1e308, 1e308) would overflow to Infinity
		const huge = lnComplexIterative({ re: 1e308, im: 1e308 })
		assertComplexClose(
			huge,
			{ re: 308 * Math.LN10 + 0.5 * Math.LN2, im: Math.PI / 4 },
			1e-12,
			'1e308 + 1e308i'
		)

		// Very small magnitude
		const tiny = lnComplexIterative({ re: -1e-300, im: 1e-300 })
		assertComplexClose(
			tiny,
			{ re: -300 * Math.LN10 + 0.5 * Math.LN2, im: (3 * Math.PI) / 4 },
			1e-12,
			'-1e-300 + 1e-300i'
		)

		// Subnormal input
		const sub = lnComplexIterative({ re: Number.MIN_VALUE, im: 0 })
		assertComplexClose(sub, { re: -1074 * Math.LN2, im: 0 }, 1e-12, 'Number.MIN_VALUE')

		// Near unit circle: 1 + 1e-10i should preserve tiny positive real part 0.5 * 1e-20
		const nearUnit = lnComplexIterative({ re: 1, im: 1e-10 })
		assert.ok(Math.abs(nearUnit.re - 5e-21) <= 1e-33, `expected ~5e-21, got ${nearUnit.re}`)
		assert.ok(Math.abs(nearUnit.im - 1e-10) <= 1e-23, `expected ~1e-10, got ${nearUnit.im}`)
	})

	test('throws RangeError at zero and for non-finite components', () => {
		assert.throws(() => lnComplexIterative({ re: 0, im: 0 }), RangeError)
		assert.throws(() => lnComplexIterative({ re: -0, im: 0 }), RangeError)
		assert.throws(() => lnComplexIterative({ re: 0, im: -0 }), RangeError)
		assert.throws(() => lnComplexIterative({ re: -0, im: -0 }), RangeError)
		assert.throws(() => lnComplexIterative({ re: NaN, im: 1 }), RangeError)
		assert.throws(() => lnComplexIterative({ re: 1, im: NaN }), RangeError)
		assert.throws(() => lnComplexIterative({ re: Infinity, im: 0 }), RangeError)
		assert.throws(() => lnComplexIterative({ re: 0, im: -Infinity }), RangeError)
		assert.throws(() => lnComplexIterative({ re: -Infinity, im: Infinity }), RangeError)
	})

	test('throws TypeError for invalid input types', () => {
		assert.throws(() => lnComplexIterative(), TypeError)
		assert.throws(() => lnComplexIterative(null), TypeError)
		assert.throws(() => lnComplexIterative(42), TypeError)
		assert.throws(() => lnComplexIterative('1+2i'), TypeError)
		assert.throws(() => lnComplexIterative([1, 2]), TypeError)
		assert.throws(() => lnComplexIterative({}), TypeError)
		assert.throws(() => lnComplexIterative({ re: 1 }), TypeError)
		assert.throws(() => lnComplexIterative({ im: 1 }), TypeError)
		assert.throws(() => lnComplexIterative({ re: '1', im: 0 }), TypeError)
		assert.throws(() => lnComplexIterative({ re: 1, im: null }), TypeError)
		assert.throws(() => lnComplexIterative({ re: 1n, im: 0 }), TypeError)
	})

	test('cross-check: matches Math.log(Math.hypot(re, im)) + i * Math.atan2(im, re) and satisfies exp(ln(z)) === z', () => {
		const samples = [
			{ re: 2.5, im: 0.75 },
			{ re: -2.5, im: 0.75 },
			{ re: -2.5, im: -0.75 },
			{ re: 2.5, im: -0.75 },
			{ re: 0.123, im: 9.876 },
			{ re: -0.123, im: -9.876 },
			{ re: 100, im: -0.001 },
			{ re: -0.001, im: 100 },
			{ re: 1e-6, im: 2e-6 },
			{ re: 1e6, im: -3e6 },
			{ re: -7.5, im: 1e-12 },
			{ re: -7.5, im: -1e-12 },
		]

		for (const z of samples) {
			const w = lnComplexIterative(z)

			// Independent formula cross-check
			const expected = {
				re: Math.log(Math.hypot(z.re, z.im)),
				im: Math.atan2(z.im, z.re),
			}
			assertComplexClose(w, expected, 1e-13, `formula check for (${z.re}, ${z.im})`)

			// Principal branch range check: Im(ln(z)) in (-pi, pi]
			assert.ok(w.im > -Math.PI && w.im <= Math.PI, `im out of principal branch for (${z.re}, ${z.im}): ${w.im}`)

			// Inverse operation cross-check: exp(ln(z)) === z
			const reconstructed = expComplex(w)
			const scale = Math.hypot(z.re, z.im)
			assert.ok(
				Math.abs(reconstructed.re - z.re) <= 1e-12 * scale,
				`exp(ln(z)).re mismatch for (${z.re}, ${z.im}): got ${reconstructed.re}`
			)
			assert.ok(
				Math.abs(reconstructed.im - z.im) <= 1e-12 * scale,
				`exp(ln(z)).im mismatch for (${z.re}, ${z.im}): got ${reconstructed.im}`
			)
		}
	})

	test('cross-check: algebraic identity ln(z1 * z2) = ln(z1) + ln(z2) (mod 2*pi*i)', () => {
		const pairs = [
			[{ re: 2, im: 3 }, { re: 4, im: -1 }],
			[{ re: -1.5, im: 2.5 }, { re: 0.7, im: 1.2 }],
			[{ re: -3, im: -4 }, { re: -2, im: -5 }],
		]

		for (const [z1, z2] of pairs) {
			const prod = {
				re: z1.re * z2.re - z1.im * z2.im,
				im: z1.re * z2.im + z1.im * z2.re,
			}
			const lhs = lnComplexIterative(prod)
			const w1 = lnComplexIterative(z1)
			const w2 = lnComplexIterative(z2)

			let sumIm = w1.im + w2.im
			while (sumIm > Math.PI) sumIm -= 2 * Math.PI
			while (sumIm <= -Math.PI) sumIm += 2 * Math.PI

			assertComplexClose(lhs, { re: w1.re + w2.re, im: sumIm }, 1e-13)
		}
	})
})
