import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { cosComplexStable } from './cosComplexStable.js'

/**
 * Asserts two finite numbers are close within a combined relative + absolute tolerance.
 */
function assertClose(actual, expected, relTol = 1e-13, absTol = 1e-15, label = '') {
	assert.ok(
		Number.isFinite(actual) && Number.isFinite(expected),
		`${label}: expected finite values, got actual=${actual}, expected=${expected}`
	)
	const diff = Math.abs(actual - expected)
	const limit = Math.max(absTol, relTol * Math.max(Math.abs(actual), Math.abs(expected)))
	assert.ok(
		diff <= limit,
		`${label}: |${actual} - ${expected}| = ${diff} exceeds tolerance ${limit}`
	)
}

/**
 * Independent reference 1: Euler exponential formula
 * cos(z) = (exp(i*z) + exp(-i*z)) / 2
 */
function cosViaEuler(z) {
	// i*z = -im + i*re, -i*z = im - i*re
	const e1 = Math.exp(-z.im)
	const e2 = Math.exp(z.im)
	const cosRe = Math.cos(z.re)
	const sinRe = Math.sin(z.re)
	return {
		re: 0.5 * (e1 * cosRe + e2 * cosRe),
		im: 0.5 * (e1 * sinRe - e2 * sinRe),
	}
}

/**
 * Independent reference 2: Taylor power series
 * cos(z) = sum_{n=0}^{N} (-1)^n * z^(2n) / (2n)!
 */
function cosViaTaylor(z, terms = 40) {
	// z^2 = (re^2 - im^2) + i*(2*re*im)
	const z2Re = z.re * z.re - z.im * z.im
	const z2Im = 2 * z.re * z.im

	let termRe = 1
	let termIm = 0
	let sumRe = 1
	let sumIm = 0

	for (let n = 1; n <= terms; n++) {
		const denom = -(2 * n - 1) * (2 * n)
		const nextRe = (termRe * z2Re - termIm * z2Im) / denom
		const nextIm = (termRe * z2Im + termIm * z2Re) / denom
		termRe = nextRe
		termIm = nextIm
		sumRe += termRe
		sumIm += termIm
	}

	return { re: sumRe, im: sumIm }
}

describe('cosComplexStable', () => {
	test('validates input shape and types', () => {
		const invalidInputs = [
			undefined,
			null,
			0,
			42,
			'1+2i',
			true,
			[1, 2],
			{},
			{ re: 1 },
			{ im: 2 },
			{ re: '1', im: 0 },
			{ re: 0, im: '2' },
			{ re: null, im: 0 },
			{ re: 0, im: undefined },
			{ re: 1n, im: 0 },
			{ re: 0, im: {} },
		]

		for (const input of invalidInputs) {
			assert.throws(() => cosComplexStable(input), TypeError)
		}
	})

	test('does not mutate input object and returns a fresh object', () => {
		const z = Object.freeze({ re: 1.25, im: -0.75 })
		const res = cosComplexStable(z)
		assert.notEqual(res, z)
		assert.deepEqual(Object.keys(res).sort(), ['im', 're'])
	})

	test('matches exact known values on real and imaginary axes', () => {
		// Real axis
		const c0 = cosComplexStable({ re: 0, im: 0 })
		assert.equal(c0.re, 1)
		assert.ok(Object.is(c0.im, -0))

		const cPi = cosComplexStable({ re: Math.PI, im: 0 })
		assertClose(cPi.re, -1, 1e-15, 1e-15)
		assert.ok(Object.is(cPi.im, -0))

		const cHalfPi = cosComplexStable({ re: Math.PI / 2, im: 0 })
		assertClose(cHalfPi.re, Math.cos(Math.PI / 2), 1e-15, 1e-16)
		assert.ok(Object.is(cHalfPi.im, -0))

		// Purely imaginary axis: cos(i*y) = cosh(y)
		for (const y of [-10, -1, -1e-6, 1e-6, 1, 10]) {
			const res = cosComplexStable({ re: 0, im: y })
			assertClose(res.re, Math.cosh(y), 1e-14, 1e-15, `cos(i*${y}).re`)
			assert.ok(Object.is(res.im, y > 0 ? -0 : +0))
		}
	})

	test('preserves signed zeros at the origin', () => {
		const cases = [
			[{ re: +0, im: +0 }, 1, -0],
			[{ re: +0, im: -0 }, 1, +0],
			[{ re: -0, im: +0 }, 1, +0],
			[{ re: -0, im: -0 }, 1, -0],
		]

		for (const [z, expectedRe, expectedIm] of cases) {
			const res = cosComplexStable(z)
			assert.ok(Object.is(res.re, expectedRe))
			assert.ok(Object.is(res.im, expectedIm))
		}
	})

	test('cross-checks against Euler exponential formula across a grid', () => {
		const reValues = [-10, -2.5, -1, -0.1, 0.3, 1.2, 3.7, 15]
		const imValues = [-25, -10, -2, -0.5, -1e-3, 1e-3, 0.5, 2, 10, 25]

		for (const re of reValues) {
			for (const im of imValues) {
				const z = { re, im }
				const actual = cosComplexStable(z)
				const expected = cosViaEuler(z)
				assertClose(actual.re, expected.re, 1e-13, 1e-14, `Euler re (${re},${im})`)
				assertClose(actual.im, expected.im, 1e-13, 1e-14, `Euler im (${re},${im})`)
			}
		}
	})

	test('cross-checks against Taylor power series for small and moderate z', () => {
		const samples = [
			{ re: 1e-12, im: 1e-12 },
			{ re: 1e-6, im: -1e-6 },
			{ re: 0.5, im: 1e-10 },
			{ re: 1.0, im: 1e-5 },
			{ re: -0.7, im: 0.8 },
			{ re: 2.1, im: -1.9 },
			{ re: 3.0, im: 2.5 },
		]

		for (const z of samples) {
			const actual = cosComplexStable(z)
			const expected = cosViaTaylor(z)
			assertClose(actual.re, expected.re, 1e-14, 1e-15, `Taylor re (${z.re},${z.im})`)
			assertClose(actual.im, expected.im, 1e-14, 1e-15, `Taylor im (${z.re},${z.im})`)
		}
	})

	test('satisfies algebraic, symmetry, periodicity, and modulus identities', () => {
		const samples = [
			{ re: 0.4, im: 0.9 },
			{ re: -1.7, im: 2.3 },
			{ re: 2.8, im: -4.1 },
			{ re: 0.15, im: 1e-7 },
		]

		for (const z of samples) {
			const cz = cosComplexStable(z)

			// Evenness: cos(-z) = cos(z)
			const cNeg = cosComplexStable({ re: -z.re, im: -z.im })
			assertClose(cNeg.re, cz.re, 1e-14, 1e-15, 'evenness re')
			assertClose(cNeg.im, cz.im, 1e-14, 1e-15, 'evenness im')

			// Conjugate symmetry: cos(conj(z)) = conj(cos(z))
			const cConj = cosComplexStable({ re: z.re, im: -z.im })
			assertClose(cConj.re, cz.re, 1e-14, 1e-15, 'conjugate re')
			assertClose(cConj.im, -cz.im, 1e-14, 1e-15, 'conjugate im')

			// Half-period shift: cos(z + pi) = -cos(z)
			const cShift = cosComplexStable({ re: z.re + Math.PI, im: z.im })
			assertClose(cShift.re, -cz.re, 1e-12, 1e-12, 'pi-shift re')
			assertClose(cShift.im, -cz.im, 1e-12, 1e-12, 'pi-shift im')

			// Double-angle identity: cos(2z) = 2*cos(z)^2 - 1
			const c2z = cosComplexStable({ re: 2 * z.re, im: 2 * z.im })
			const rhsRe = 2 * (cz.re * cz.re - cz.im * cz.im) - 1
			const rhsIm = 4 * cz.re * cz.im
			assertClose(c2z.re, rhsRe, 1e-13, 1e-13, 'double-angle re')
			assertClose(c2z.im, rhsIm, 1e-13, 1e-13, 'double-angle im')

			// Modulus identity: |cos(x + i*y)|^2 = cos^2(x) + sinh^2(y)
			const modSq = cz.re * cz.re + cz.im * cz.im
			const expectedModSq = Math.cos(z.re) ** 2 + Math.sinh(z.im) ** 2
			assertClose(modSq, expectedModSq, 1e-13, 1e-14, 'modulus squared')
		}
	})

	test('avoids spurious overflow via power-of-2 scaling when |im| > 710.48', () => {
		// Case 1: x = Math.PI / 2 has tiny cos(x) ~ 6.123e-17, while cosh(715) overflows.
		// True re = cos(pi/2) * 0.5 * exp(715) ~ 1.003e294 (finite!).
		const z1 = { re: Math.PI / 2, im: 715 }
		const r1 = cosComplexStable(z1)
		assert.ok(Number.isFinite(r1.re), `Expected finite re, got ${r1.re}`)
		assert.equal(r1.im, -Infinity)
		const expectedLogRe1 = Math.log(Math.abs(Math.cos(z1.re))) + Math.abs(z1.im) - Math.LN2
		assertClose(Math.log(Math.abs(r1.re)), expectedLogRe1, 1e-14, 1e-14, 'log|re| at pi/2 + 715i')
		assert.ok(r1.re > 0)

		// Negative imaginary counterpart
		const r1Neg = cosComplexStable({ re: Math.PI / 2, im: -715 })
		assert.equal(r1Neg.re, r1.re)
		assert.equal(r1Neg.im, Infinity)

		// Case 2: tiny x = 1e-100 with im = 800; sin(x) ~ 1e-100 so im part is finite!
		const z2 = { re: 1e-100, im: 800 }
		const r2 = cosComplexStable(z2)
		assert.equal(r2.re, Infinity)
		assert.ok(Number.isFinite(r2.im), `Expected finite im, got ${r2.im}`)
		const expectedLogIm2 = Math.log(Math.abs(Math.sin(z2.re))) + Math.abs(z2.im) - Math.LN2
		assertClose(Math.log(Math.abs(r2.im)), expectedLogIm2, 1e-14, 1e-14, 'log|im| at 1e-100 + 800i')
		assert.ok(r2.im < 0)

		// Case 3: subnormal x = Number.MIN_VALUE with im = 1450 (near upper scaling limit)
		const z3 = { re: Number.MIN_VALUE, im: 1450 }
		const r3 = cosComplexStable(z3)
		assert.equal(r3.re, Infinity)
		assert.ok(Number.isFinite(r3.im), `Expected finite im for subnormal x, got ${r3.im}`)
		const expectedLogIm3 = Math.log(Number.MIN_VALUE) + 1450 - Math.LN2
		assertClose(Math.log(Math.abs(r3.im)), expectedLogIm3, 1e-14, 1e-14, 'log|im| for subnormal x')
		assert.ok(r3.im < 0)

		// Case 4: x = 0 with large |y| must NOT produce NaN in imaginary part
		const r4Pos = cosComplexStable({ re: 0, im: 1000 })
		assert.equal(r4Pos.re, Infinity)
		assert.ok(Object.is(r4Pos.im, -0))

		const r4Neg = cosComplexStable({ re: 0, im: -1000 })
		assert.equal(r4Neg.re, Infinity)
		assert.ok(Object.is(r4Neg.im, +0))
	})

	test('matches exact threshold behavior around cosh overflow and regime boundaries', () => {
		// Smoothness across internal thresholds: ay = 1e-4, 22, 700
		for (const boundary of [1e-4, 22, 700]) {
			const below = cosComplexStable({ re: 0.7, im: boundary * (1 - 1e-12) })
			const at = cosComplexStable({ re: 0.7, im: boundary })
			const above = cosComplexStable({ re: 0.7, im: boundary * (1 + 1e-12) })
			assertClose(below.re, at.re, 1e-9, 1e-12, `smoothness re below ${boundary}`)
			assertClose(above.re, at.re, 1e-9, 1e-12, `smoothness re above ${boundary}`)
			assertClose(below.im, at.im, 1e-9, 1e-12, `smoothness im below ${boundary}`)
			assertClose(above.im, at.im, 1e-9, 1e-12, `smoothness im above ${boundary}`)
		}

		// Just below and just above 0.5 * exp(y) = MAX_VALUE (~710.4758600739439)
		const justBelow = cosComplexStable({ re: 0, im: 710.47586 })
		assert.ok(Number.isFinite(justBelow.re) && justBelow.re > 1e308)
		const justAbove = cosComplexStable({ re: 0, im: 710.47587 })
		assert.equal(justAbove.re, Infinity)

		// Guaranteed overflow regime (|y| > 1460)
		const huge = cosComplexStable({ re: 0.5, im: 2000 })
		assert.equal(huge.re, Infinity)
		assert.equal(huge.im, -Infinity)
	})

	test('handles very small subnormal imaginary parts without underflow to NaN', () => {
		const res = cosComplexStable({ re: 1.0, im: 1e-300 })
		assertClose(res.re, Math.cos(1.0), 1e-15, 1e-16)
		assertClose(res.im, -Math.sin(1.0) * 1e-300, 1e-14, 0)
	})

	test('handles C99 Annex G special values (Infinity and NaN)', () => {
		// (±0, ±Inf) -> (+Inf, ∓0)
		const z0Inf = cosComplexStable({ re: 0, im: Infinity })
		assert.equal(z0Inf.re, Infinity)
		assert.ok(Object.is(z0Inf.im, -0))

		const z0NegInf = cosComplexStable({ re: 0, im: -Infinity })
		assert.equal(z0NegInf.re, Infinity)
		assert.ok(Object.is(z0NegInf.im, +0))

		// (finite nonzero, ±Inf)
		const z1Inf = cosComplexStable({ re: 1, im: Infinity })
		assert.equal(z1Inf.re, Infinity)
		assert.equal(z1Inf.im, -Infinity)

		const z2NegInf = cosComplexStable({ re: 2, im: -Infinity })
		// cos(2) < 0, sin(2) > 0, y = -Inf => re = -Inf, im = +Inf
		assert.equal(z2NegInf.re, -Infinity)
		assert.equal(z2NegInf.im, Infinity)

		// (±Inf, 0) -> (NaN, ±0)
		const zInf0 = cosComplexStable({ re: Infinity, im: 0 })
		assert.ok(Number.isNaN(zInf0.re))
		assert.ok(zInf0.im === 0)

		// (±Inf, finite nonzero) -> (NaN, NaN)
		const zInf1 = cosComplexStable({ re: Infinity, im: 1 })
		assert.ok(Number.isNaN(zInf1.re))
		assert.ok(Number.isNaN(zInf1.im))

		// (±Inf, ±Inf) -> (+Inf, NaN)
		const zInfInf = cosComplexStable({ re: -Infinity, im: Infinity })
		assert.equal(zInfInf.re, Infinity)
		assert.ok(Number.isNaN(zInfInf.im))

		// (NaN, 0) -> (NaN, 0)
		const zNan0 = cosComplexStable({ re: NaN, im: 0 })
		assert.ok(Number.isNaN(zNan0.re))
		assert.equal(zNan0.im, 0)

		// (0, NaN) -> (NaN, 0)
		const z0Nan = cosComplexStable({ re: 0, im: NaN })
		assert.ok(Number.isNaN(z0Nan.re))
		assert.equal(z0Nan.im, 0)

		// (NaN, ±Inf) -> (+Inf, NaN)
		const zNanInf = cosComplexStable({ re: NaN, im: -Infinity })
		assert.equal(zNanInf.re, Infinity)
		assert.ok(Number.isNaN(zNanInf.im))

		// (NaN, finite nonzero) and (finite nonzero, NaN) -> (NaN, NaN)
		const zNan1 = cosComplexStable({ re: NaN, im: 1 })
		assert.ok(Number.isNaN(zNan1.re) && Number.isNaN(zNan1.im))

		const z1Nan = cosComplexStable({ re: 1, im: NaN })
		assert.ok(Number.isNaN(z1Nan.re) && Number.isNaN(z1Nan.im))

		const zNanNan = cosComplexStable({ re: NaN, im: NaN })
		assert.ok(Number.isNaN(zNanNan.re) && Number.isNaN(zNanNan.im))
	})
})
