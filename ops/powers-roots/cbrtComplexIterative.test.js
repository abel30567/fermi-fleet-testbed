import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { cbrtComplexIterative } from './cbrtComplexIterative.js'

function complexMul(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	}
}

function complexCube(w) {
	return complexMul(complexMul(w, w), w)
}

function complexPolarCbrt(z) {
	const re = z.re === 0 ? 0 : z.re
	const im = z.im === 0 ? 0 : z.im
	const r = Math.hypot(re, im)
	if (r === 0) return { re: 0, im: 0 }
	const theta = Math.atan2(im, re)
	const mag = Math.cbrt(r)
	return {
		re: mag * Math.cos(theta / 3),
		im: mag * Math.sin(theta / 3),
	}
}

function assertComplexClose(actual, expected, tol = 1e-12, label = '') {
	const scale = Math.max(1, Math.hypot(expected.re, expected.im))
	const err = Math.hypot(actual.re - expected.re, actual.im - expected.im)
	assert.ok(
		err <= tol * scale,
		`${label} expected (${expected.re}, ${expected.im}), got (${actual.re}, ${actual.im}), error=${err}, limit=${tol * scale}`
	)
}

describe('cbrtComplexIterative', () => {
	test('handles zero and signed zero', () => {
		assert.deepStrictEqual(cbrtComplexIterative({ re: 0, im: 0 }), { re: 0, im: 0 })
		assert.deepStrictEqual(cbrtComplexIterative({ re: -0, im: -0 }), { re: 0, im: 0 })
		assert.deepStrictEqual(cbrtComplexIterative({ re: 0, im: -0 }), { re: 0, im: 0 })
	})

	test('computes exact principal roots for positive reals', () => {
		assertComplexClose(cbrtComplexIterative({ re: 1, im: 0 }), { re: 1, im: 0 }, 1e-15)
		assertComplexClose(cbrtComplexIterative({ re: 8, im: 0 }), { re: 2, im: 0 }, 1e-15)
		assertComplexClose(cbrtComplexIterative({ re: 27, im: 0 }), { re: 3, im: 0 }, 1e-15)
		assertComplexClose(cbrtComplexIterative({ re: 0.125, im: 0 }), { re: 0.5, im: 0 }, 1e-15)
	})

	test('computes principal branch for negative reals (arg = +pi -> pi/3)', () => {
		// (-8)^(1/3) principal = 2 * (cos(pi/3) + i*sin(pi/3)) = 1 + i*sqrt(3)
		assertComplexClose(
			cbrtComplexIterative({ re: -8, im: 0 }),
			{ re: 1, im: Math.sqrt(3) },
			1e-14
		)
		// (-1)^(1/3) principal = 1/2 + i*sqrt(3)/2
		assertComplexClose(
			cbrtComplexIterative({ re: -1, im: 0 }),
			{ re: 0.5, im: Math.sqrt(3) / 2 },
			1e-14
		)
		// Negative zero imaginary component still selects canonical +pi principal branch
		assertComplexClose(
			cbrtComplexIterative({ re: -8, im: -0 }),
			{ re: 1, im: Math.sqrt(3) },
			1e-14
		)
	})

	test('computes principal roots for pure imaginary numbers', () => {
		// (8i)^(1/3) = 2 * (cos(pi/6) + i*sin(pi/6)) = sqrt(3) + i
		assertComplexClose(
			cbrtComplexIterative({ re: 0, im: 8 }),
			{ re: Math.sqrt(3), im: 1 },
			1e-14
		)
		// (-8i)^(1/3) = 2 * (cos(-pi/6) + i*sin(-pi/6)) = sqrt(3) - i
		assertComplexClose(
			cbrtComplexIterative({ re: 0, im: -8 }),
			{ re: Math.sqrt(3), im: -1 },
			1e-14
		)
		assertComplexClose(
			cbrtComplexIterative({ re: 0, im: 1 }),
			{ re: Math.sqrt(3) / 2, im: 0.5 },
			1e-14
		)
		assertComplexClose(
			cbrtComplexIterative({ re: 0, im: -1 }),
			{ re: Math.sqrt(3) / 2, im: -0.5 },
			1e-14
		)
	})

	test('computes principal roots across all four quadrants', () => {
		const cases = [
			// Q1: (2 + i)^3 = 2 + 11i
			{ z: { re: 2, im: 11 }, expected: { re: 2, im: 1 } },
			// Q2: (-2 + 3i) -> principal arg in (pi/6, pi/3)
			{ z: { re: -2, im: 3 }, expected: complexPolarCbrt({ re: -2, im: 3 }) },
			// Q3: (-2 - 3i) -> principal arg in (-pi/3, -pi/6)
			{ z: { re: -2, im: -3 }, expected: complexPolarCbrt({ re: -2, im: -3 }) },
			// Q4: (2 - i)^3 = 2 - 11i
			{ z: { re: 2, im: -11 }, expected: { re: 2, im: -1 } },
		]

		for (const { z, expected } of cases) {
			const w = cbrtComplexIterative(z)
			assertComplexClose(w, expected, 1e-14, `z=(${z.re},${z.im})`)
			// Verify principal argument lies in (-pi/3, pi/3]
			const argW = Math.atan2(w.im, w.re)
			assert.ok(argW > -Math.PI / 3 - 1e-12 && argW <= Math.PI / 3 + 1e-12)
		}
	})

	test('handles extreme magnitudes without overflow or underflow', () => {
		const large = { re: 1e240, im: -1e240 }
		const wLarge = cbrtComplexIterative(large)
		assert.ok(Number.isFinite(wLarge.re) && Number.isFinite(wLarge.im))
		assertComplexClose(wLarge, complexPolarCbrt(large), 1e-13, 'large')

		const veryLarge = { re: Number.MAX_VALUE / 2, im: Number.MAX_VALUE / 2 }
		const wVeryLarge = cbrtComplexIterative(veryLarge)
		assert.ok(Number.isFinite(wVeryLarge.re) && Number.isFinite(wVeryLarge.im))
		const rExpected = Math.cbrt(Math.hypot(0.5, 0.5)) * Math.cbrt(Number.MAX_VALUE)
		assert.ok(Math.abs(Math.hypot(wVeryLarge.re, wVeryLarge.im) - rExpected) / rExpected < 1e-13)

		const tiny = { re: 1e-240, im: 1e-240 }
		const wTiny = cbrtComplexIterative(tiny)
		assert.ok(Number.isFinite(wTiny.re) && Number.isFinite(wTiny.im))
		assertComplexClose(wTiny, complexPolarCbrt(tiny), 1e-13, 'tiny')

		const subnormal = { re: Number.MIN_VALUE, im: 0 }
		const wSub = cbrtComplexIterative(subnormal)
		assert.ok(Number.isFinite(wSub.re) && wSub.re > 0 && wSub.im === 0)
		assert.ok(Math.abs(wSub.re - 2 ** -358) <= 1e-15 * 2 ** -358)
	})

	test('supports custom convergence options', () => {
		const z = { re: -5, im: 12 }
		const w = cbrtComplexIterative(z, { maxIterations: 20, tolerance: 1e-15 })
		assertComplexClose(complexCube(w), z, 1e-13)
	})

	test('independent cross-check: w^3 === z, polar formula, and conjugate symmetry', () => {
		const samples = [
			{ re: 3, im: 4 },
			{ re: -3, im: 4 },
			{ re: -3, im: -4 },
			{ re: 3, im: -4 },
			{ re: 0.001, im: -1000 },
			{ re: -1000, im: 0.001 },
			{ re: -1000, im: -0.001 },
			{ re: 7.25, im: 0 },
			{ re: -7.25, im: 0 },
			{ re: 0, im: 19.5 },
			{ re: 0, im: -19.5 },
			{ re: Math.PI, im: Math.E },
			{ re: -Math.SQRT2, im: Math.LN10 },
		]

		for (const z of samples) {
			const w = cbrtComplexIterative(z)

			// 1. Inverse algebraic check: w^3 === z
			const cubed = complexCube(w)
			assertComplexClose(cubed, z, 1e-12, `w^3 for (${z.re},${z.im})`)

			// 2. Independent polar formula check
			const polar = complexPolarCbrt(z)
			assertComplexClose(w, polar, 1e-14, `polar for (${z.re},${z.im})`)

			// 3. Principal branch range check: Re(w) > 0 and arg(w) in (-pi/3, pi/3]
			assert.ok(w.re > 0, `expected Re(w) > 0 for z=(${z.re},${z.im}), got ${w.re}`)
			const argW = Math.atan2(w.im, w.re)
			assert.ok(argW > -Math.PI / 3 - 1e-12 && argW <= Math.PI / 3 + 1e-12)

			// 4. Conjugate symmetry away from negative real branch cut: cbrt(conj(z)) === conj(cbrt(z))
			if (!(z.re < 0 && z.im === 0)) {
				const wConj = cbrtComplexIterative({ re: z.re, im: -z.im })
				assertComplexClose(wConj, { re: w.re, im: -w.im }, 1e-14, `conjugate for (${z.re},${z.im})`)
			}
		}
	})

	test('validates invalid inputs and options', () => {
		// Invalid z types
		assert.throws(() => cbrtComplexIterative(null), TypeError)
		assert.throws(() => cbrtComplexIterative(undefined), TypeError)
		assert.throws(() => cbrtComplexIterative(8), TypeError)
		assert.throws(() => cbrtComplexIterative('8+0i'), TypeError)
		assert.throws(() => cbrtComplexIterative([8, 0]), TypeError)
		assert.throws(() => cbrtComplexIterative({ re: '8', im: 0 }), TypeError)
		assert.throws(() => cbrtComplexIterative({ re: 8 }), TypeError)
		assert.throws(() => cbrtComplexIterative({ im: 0 }), TypeError)

		// Non-finite z components
		assert.throws(() => cbrtComplexIterative({ re: NaN, im: 0 }), RangeError)
		assert.throws(() => cbrtComplexIterative({ re: 0, im: NaN }), RangeError)
		assert.throws(() => cbrtComplexIterative({ re: Infinity, im: 0 }), RangeError)
		assert.throws(() => cbrtComplexIterative({ re: -Infinity, im: 1 }), RangeError)
		assert.throws(() => cbrtComplexIterative({ re: 1, im: Infinity }), RangeError)
		assert.throws(() => cbrtComplexIterative({ re: 1, im: -Infinity }), RangeError)

		// Invalid options
		assert.throws(() => cbrtComplexIterative({ re: 1, im: 0 }, null), TypeError)
		assert.throws(() => cbrtComplexIterative({ re: 1, im: 0 }, []), TypeError)
		assert.throws(() => cbrtComplexIterative({ re: 1, im: 0 }, 'fast'), TypeError)
		assert.throws(() => cbrtComplexIterative({ re: 1, im: 0 }, { maxIterations: '10' }), TypeError)
		assert.throws(() => cbrtComplexIterative({ re: 1, im: 0 }, { maxIterations: 0 }), RangeError)
		assert.throws(() => cbrtComplexIterative({ re: 1, im: 0 }, { maxIterations: -5 }), RangeError)
		assert.throws(() => cbrtComplexIterative({ re: 1, im: 0 }, { maxIterations: 1.5 }), RangeError)
		assert.throws(() => cbrtComplexIterative({ re: 1, im: 0 }, { tolerance: '1e-12' }), TypeError)
		assert.throws(() => cbrtComplexIterative({ re: 1, im: 0 }, { tolerance: 0 }), RangeError)
		assert.throws(() => cbrtComplexIterative({ re: 1, im: 0 }, { tolerance: -1e-12 }), RangeError)
		assert.throws(() => cbrtComplexIterative({ re: 1, im: 0 }, { tolerance: NaN }), RangeError)
		assert.throws(() => cbrtComplexIterative({ re: 1, im: 0 }, { tolerance: Infinity }), RangeError)
	})
})
