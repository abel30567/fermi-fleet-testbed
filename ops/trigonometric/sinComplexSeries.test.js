import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { sinComplexSeries } from './sinComplexSeries.js'

/**
 * Helper to assert two complex numbers are approximately equal within an absolute + relative tolerance.
 */
function assertComplexClose(actual, expected, tol = 1e-12, label = '') {
	const prefix = label ? `${label}: ` : ''
	const reTol = tol * Math.max(1, Math.abs(expected.re))
	const imTol = tol * Math.max(1, Math.abs(expected.im))
	assert.ok(
		Math.abs(actual.re - expected.re) <= reTol,
		`${prefix}real part mismatch: got ${actual.re}, expected ${expected.re} (tol ${reTol})`
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= imTol,
		`${prefix}imag part mismatch: got ${actual.im}, expected ${expected.im} (tol ${imTol})`
	)
}

/**
 * Independent reference #1: Direct complex Maclaurin series
 *   sin(z) = sum_{k=0}^{terms-1} (-1)^k * z^(2k+1) / (2k+1)!
 */
function sinComplexMaclaurinRef(z, terms = 35) {
	const z2Re = z.re * z.re - z.im * z.im
	const z2Im = 2 * z.re * z.im

	let termRe = z.re
	let termIm = z.im
	let sumRe = termRe
	let sumIm = termIm

	for (let k = 1; k < terms; k++) {
		const denom = (2 * k) * (2 * k + 1)
		const nextRe = -(termRe * z2Re - termIm * z2Im) / denom
		const nextIm = -(termRe * z2Im + termIm * z2Re) / denom
		termRe = nextRe
		termIm = nextIm
		sumRe += termRe
		sumIm += termIm
	}

	return { re: sumRe, im: sumIm }
}

/**
 * Independent reference #2: Complex exponential definition
 *   sin(z) = (exp(i*z) - exp(-i*z)) / (2i)
 */
function sinComplexExpRef(z) {
	// i*z = -im + i*re  => exp(i*z) = exp(-im) * (cos(re) + i*sin(re))
	const eMinusY = Math.exp(-z.im)
	const ePlusY = Math.exp(z.im)
	const c = Math.cos(z.re)
	const s = Math.sin(z.re)

	const eIzRe = eMinusY * c
	const eIzIm = eMinusY * s
	const eNegIzRe = ePlusY * c
	const eNegIzIm = -ePlusY * s

	const diffRe = eIzRe - eNegIzRe
	const diffIm = eIzIm - eNegIzIm

	// Divide (diffRe + i*diffIm) by 2i  =>  (diffIm / 2) + i * (-diffRe / 2)
	return { re: diffIm / 2, im: -diffRe / 2 }
}

function complexMul(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	}
}

describe('sinComplexSeries', () => {
	test('reduces to real Math.sin on the real axis', () => {
		const xs = [0, Math.PI / 6, Math.PI / 4, Math.PI / 3, Math.PI / 2, Math.PI, -Math.PI / 2, 2.5, -10]
		for (const x of xs) {
			const res = sinComplexSeries({ re: x, im: 0 })
			assertComplexClose(res, { re: Math.sin(x), im: 0 }, 1e-15, `x=${x}`)
			assert.ok(Object.is(res.im, 0), `expected +0 imaginary part for x=${x}`)
		}
	})

	test('reduces to i * Math.sinh(y) on the pure imaginary axis', () => {
		const ys = [0, 0.5, 1, -1, 3.25, -5, 10]
		for (const y of ys) {
			const res = sinComplexSeries({ re: 0, im: y })
			assertComplexClose(res, { re: 0, im: Math.sinh(y) }, 1e-14, `y=${y}`)
			assert.ok(Object.is(res.re, 0), `expected +0 real part for y=${y}`)
		}
	})

	test('computes known complex values accurately', () => {
		// sin(pi/2 + i*ln(2)) = cosh(ln(2)) = (2 + 1/2)/2 = 1.25
		assertComplexClose(
			sinComplexSeries({ re: Math.PI / 2, im: Math.log(2) }),
			{ re: 1.25, im: 0 },
			1e-14
		)

		// sin(1 + i) = sin(1)*cosh(1) + i*cos(1)*sinh(1)
		assertComplexClose(
			sinComplexSeries({ re: 1, im: 1 }),
			{ re: 1.2984575814159773, im: 0.6349639147847361 },
			1e-14
		)

		// sin(-pi/4 - 2i)
		assertComplexClose(
			sinComplexSeries({ re: -Math.PI / 4, im: -2 }),
			{
				re: -Math.SQRT1_2 * Math.cosh(2),
				im: -Math.SQRT1_2 * Math.sinh(2),
			},
			1e-14
		)
	})

	test('handles edge cases: zero, negative zero, very small values, and large imaginary parts', () => {
		const z0 = sinComplexSeries({ re: 0, im: 0 })
		assert.deepStrictEqual(z0, { re: 0, im: 0 })
		assert.ok(Object.is(z0.re, 0) && Object.is(z0.im, 0))

		const zNeg0 = sinComplexSeries({ re: -0, im: -0 })
		assert.deepStrictEqual(zNeg0, { re: 0, im: 0 })
		assert.ok(Object.is(zNeg0.re, 0) && Object.is(zNeg0.im, 0))

		// Near zero, sin(z) ~ z
		const tiny = { re: 1e-10, im: -2e-10 }
		assertComplexClose(sinComplexSeries(tiny), tiny, 1e-14)

		// Pure imaginary with huge |im| should not produce NaN in real part
		const hugeImagPos = sinComplexSeries({ re: 0, im: 1000 })
		assert.ok(Object.is(hugeImagPos.re, 0))
		assert.strictEqual(hugeImagPos.im, Infinity)

		const hugeImagNeg = sinComplexSeries({ re: 0, im: -1000 })
		assert.ok(Object.is(hugeImagNeg.re, 0))
		assert.strictEqual(hugeImagNeg.im, -Infinity)

		// Near overflow threshold with tiny sin(x): scaling avoids premature Infinity
		const nearOverflow = sinComplexSeries({ re: 1e-5, im: 710.5 })
		assert.ok(Number.isFinite(nearOverflow.re), 'scaled real part should remain finite')
		assert.ok(nearOverflow.re > 0)
		assert.strictEqual(nearOverflow.im, Infinity)
	})

	test('independent cross-check against direct complex Maclaurin power series', () => {
		const samples = [
			{ re: 0.25, im: 0.5 },
			{ re: -0.7, im: 0.9 },
			{ re: 1.5, im: -1.2 },
			{ re: -2.1, im: -0.4 },
			{ re: 0.01, im: -3.0 },
			{ re: 3.14, im: 2.0 },
		]

		for (const z of samples) {
			const actual = sinComplexSeries(z)
			const ref = sinComplexMaclaurinRef(z)
			assertComplexClose(actual, ref, 1e-13, `Maclaurin(${z.re}, ${z.im})`)
		}
	})

	test('independent cross-check against complex exponential definition (e^(iz) - e^(-iz)) / (2i)', () => {
		const samples = [
			{ re: 0.5, im: 1.5 },
			{ re: -2.3, im: 4.1 },
			{ re: 5.0, im: -3.7 },
			{ re: 12.34, im: 8.5 },
			{ re: -100.25, im: -15.2 },
		]

		for (const z of samples) {
			const actual = sinComplexSeries(z)
			const ref = sinComplexExpRef(z)
			assertComplexClose(actual, ref, 1e-12, `ExpRef(${z.re}, ${z.im})`)
		}
	})

	test('satisfies fundamental complex trigonometric identities', () => {
		const samples = [
			{ re: 0.7, im: 1.1 },
			{ re: -1.8, im: 2.3 },
			{ re: 3.5, im: -0.6 },
		]

		for (const z of samples) {
			const s = sinComplexSeries(z)
			// cos(z) = sin(z + pi/2)
			const c = sinComplexSeries({ re: z.re + Math.PI / 2, im: z.im })

			// Odd symmetry: sin(-z) = -sin(z)
			const sNeg = sinComplexSeries({ re: -z.re, im: -z.im })
			assertComplexClose(sNeg, { re: -s.re, im: -s.im }, 1e-13, 'odd symmetry')

			// Conjugate symmetry: sin(conj(z)) = conj(sin(z))
			const sConj = sinComplexSeries({ re: z.re, im: -z.im })
			assertComplexClose(sConj, { re: s.re, im: -s.im }, 1e-13, 'conjugate symmetry')

			// 2*pi periodicity: sin(z + 2*pi) = sin(z)
			const sShift = sinComplexSeries({ re: z.re + 2 * Math.PI, im: z.im })
			assertComplexClose(sShift, s, 1e-12, '2pi periodicity')

			// Pythagorean identity: sin^2(z) + cos^2(z) = 1
			const s2 = complexMul(s, s)
			const c2 = complexMul(c, c)
			assertComplexClose({ re: s2.re + c2.re, im: s2.im + c2.im }, { re: 1, im: 0 }, 1e-11, 'Pythagorean')

			// Double-angle identity: sin(2z) = 2 * sin(z) * cos(z)
			const s2z = sinComplexSeries({ re: 2 * z.re, im: 2 * z.im })
			const prod = complexMul(s, c)
			assertComplexClose(s2z, { re: 2 * prod.re, im: 2 * prod.im }, 1e-11, 'double-angle')

			// Modulus identity: |sin(x + iy)|^2 = sin^2(x) + sinh^2(y)
			const modSq = s.re * s.re + s.im * s.im
			const expectedModSq = Math.sin(z.re) ** 2 + Math.sinh(z.im) ** 2
			assert.ok(
				Math.abs(modSq - expectedModSq) <= 1e-12 * Math.max(1, expectedModSq),
				`modulus squared mismatch for (${z.re}, ${z.im})`
			)
		}
	})

	test('validates inputs and rejects invalid or non-finite arguments', () => {
		const invalidTypes = [
			undefined,
			null,
			42,
			'1+2i',
			[1, 2],
			{},
			{ re: 1 },
			{ im: 2 },
			{ re: '1', im: 0 },
			{ re: 0, im: null },
		]
		for (const input of invalidTypes) {
			assert.throws(() => sinComplexSeries(input), TypeError)
		}

		const nonFinite = [
			{ re: NaN, im: 0 },
			{ re: 0, im: NaN },
			{ re: Infinity, im: 0 },
			{ re: -Infinity, im: 1 },
			{ re: 1, im: Infinity },
			{ re: 1, im: -Infinity },
		]
		for (const input of nonFinite) {
			assert.throws(() => sinComplexSeries(input), RangeError)
		}
	})
})
