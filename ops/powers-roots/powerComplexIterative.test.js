import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { powerComplexIterative } from './powerComplexIterative.js'

/**
 * Asserts two complex numbers are equal within a tolerance.
 */
function assertComplexClose(actual, expected, eps = 1e-12, msg = '') {
	const diffRe = Math.abs(actual.re - expected.re)
	const diffIm = Math.abs(actual.im - expected.im)
	const scale = Math.max(1, Math.hypot(expected.re, expected.im))
	assert.ok(
		diffRe <= eps * scale && diffIm <= eps * scale,
		`${msg ? `${msg}: ` : ''}expected (${expected.re}, ${expected.im}), got (${actual.re}, ${actual.im}) (diff: ${diffRe}, ${diffIm})`
	)
}

/**
 * Independent naive complex multiplication.
 */
function naiveMul(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	}
}

/**
 * Independent naive complex integer power via O(|n|) repeated multiplication.
 */
function naiveIntPow(z, n) {
	let acc = { re: 1, im: 0 }
	const steps = Math.abs(n)
	for (let i = 0; i < steps; i++) {
		acc = naiveMul(acc, z)
	}
	if (n < 0) {
		const normSq = acc.re * acc.re + acc.im * acc.im
		return { re: acc.re / normSq, im: -acc.im / normSq }
	}
	return acc
}

/**
 * Independent principal complex power via explicit polar exp(w * Log(z)).
 */
function referenceExpLogPow(z, w) {
	const r = Math.sqrt(z.re * z.re + z.im * z.im)
	const theta = Math.atan2(z.im, z.re)
	const logZ = { re: Math.log(r), im: theta }
	const prod = naiveMul(w, logZ)
	const expRe = Math.exp(prod.re)
	return {
		re: expRe * Math.cos(prod.im),
		im: expRe * Math.sin(prod.im),
	}
}

describe('powerComplexIterative', () => {
	describe('integer exponents', () => {
		test('powers of real numbers', () => {
			assert.deepEqual(powerComplexIterative({ re: 2, im: 0 }, { re: 10, im: 0 }), { re: 1024, im: 0 })
			assert.deepEqual(powerComplexIterative({ re: -2, im: 0 }, { re: 3, im: 0 }), { re: -8, im: 0 })
			assert.deepEqual(powerComplexIterative({ re: -2, im: 0 }, { re: 4, im: 0 }), { re: 16, im: 0 })
			assert.deepEqual(powerComplexIterative({ re: 2, im: 0 }, { re: -3, im: 0 }), { re: 0.125, im: 0 })
			assert.deepEqual(powerComplexIterative({ re: 5, im: 0 }, { re: 0, im: 0 }), { re: 1, im: 0 })
		})

		test('powers of the imaginary unit i', () => {
			const i = { re: 0, im: 1 }
			assert.deepEqual(powerComplexIterative(i, { re: 0, im: 0 }), { re: 1, im: 0 })
			assert.deepEqual(powerComplexIterative(i, { re: 1, im: 0 }), { re: 0, im: 1 })
			assert.deepEqual(powerComplexIterative(i, { re: 2, im: 0 }), { re: -1, im: 0 })
			assert.deepEqual(powerComplexIterative(i, { re: 3, im: 0 }), { re: 0, im: -1 })
			assert.deepEqual(powerComplexIterative(i, { re: 4, im: 0 }), { re: 1, im: 0 })
			assert.deepEqual(powerComplexIterative(i, { re: -1, im: 0 }), { re: 0, im: -1 })
			assert.deepEqual(powerComplexIterative(i, { re: -2, im: 0 }), { re: -1, im: 0 })
			assert.deepEqual(powerComplexIterative(i, { re: -3, im: 0 }), { re: 0, im: 1 })
			// Large safe integer exponents: 2^53 - 1 === 3 (mod 4)
			assert.deepEqual(
				powerComplexIterative(i, { re: Number.MAX_SAFE_INTEGER, im: 0 }),
				{ re: 0, im: -1 }
			)
			assert.deepEqual(
				powerComplexIterative(i, { re: Number.MIN_SAFE_INTEGER, im: 0 }),
				{ re: 0, im: 1 }
			)
		})

		test('Gaussian integers with positive and negative integer exponents', () => {
			assert.deepEqual(powerComplexIterative({ re: 1, im: 1 }, { re: 2, im: 0 }), { re: 0, im: 2 })
			assert.deepEqual(powerComplexIterative({ re: 1, im: 1 }, { re: 4, im: 0 }), { re: -4, im: 0 })
			assert.deepEqual(powerComplexIterative({ re: 1, im: 1 }, { re: -4, im: 0 }), { re: -0.25, im: 0 })
			assert.deepEqual(powerComplexIterative({ re: 3, im: 4 }, { re: 2, im: 0 }), { re: -7, im: 24 })
			assertComplexClose(
				powerComplexIterative({ re: 3, im: 4 }, { re: -1, im: 0 }),
				{ re: 0.12, im: -0.16 }
			)
			assert.deepEqual(powerComplexIterative({ re: 2, im: -3 }, { re: 3, im: 0 }), { re: -46, im: -9 })
		})

		test("De Moivre's theorem across angles and integer exponents", () => {
			const angles = [0, Math.PI / 6, Math.PI / 4, Math.PI / 3, (2 * Math.PI) / 5, -1.234]
			const exponents = [-7, -3, -1, 0, 1, 2, 5, 13]
			for (const theta of angles) {
				const z = { re: Math.cos(theta), im: Math.sin(theta) }
				for (const n of exponents) {
					const actual = powerComplexIterative(z, { re: n, im: 0 })
					const expected = { re: Math.cos(n * theta), im: Math.sin(n * theta) }
					assertComplexClose(actual, expected, 1e-12, `De Moivre theta=${theta}, n=${n}`)
				}
			}
		})
	})

	describe('general complex and fractional exponents', () => {
		test('i^i = e^(-pi/2)', () => {
			const res = powerComplexIterative({ re: 0, im: 1 }, { re: 0, im: 1 })
			assertComplexClose(res, { re: Math.exp(-Math.PI / 2), im: 0 }, 1e-15)
			assert.equal(res.im, 0)
		})

		test("Euler's identity e^(i*pi) = -1", () => {
			const res = powerComplexIterative({ re: Math.E, im: 0 }, { re: 0, im: Math.PI })
			assertComplexClose(res, { re: -1, im: 0 }, 1e-15)
		})

		test('principal roots of negative reals', () => {
			assertComplexClose(
				powerComplexIterative({ re: -1, im: 0 }, { re: 0.5, im: 0 }),
				{ re: 0, im: 1 },
				1e-15
			)
			// (-8)^(1/3) = 2 * (cos(pi/3) + i*sin(pi/3)) = 1 + sqrt(3)*i
			assertComplexClose(
				powerComplexIterative({ re: -8, im: 0 }, { re: 1 / 3, im: 0 }),
				{ re: 1, im: Math.sqrt(3) },
				1e-14
			)
		})

		test('real base with purely imaginary exponent: 2^i = cos(ln 2) + i*sin(ln 2)', () => {
			const res = powerComplexIterative({ re: 2, im: 0 }, { re: 0, im: 1 })
			assertComplexClose(res, { re: Math.cos(Math.LN2), im: Math.sin(Math.LN2) }, 1e-15)
		})

		test('complex base with complex exponent: (1 + i)^(1 - i)', () => {
			// Log(1 + i) = 0.5*ln(2) + i*(pi/4)
			// (1 - i)*Log(1 + i) = (0.5*ln(2) + pi/4) + i*(pi/4 - 0.5*ln(2))
			const u = 0.5 * Math.LN2 + Math.PI / 4
			const v = Math.PI / 4 - 0.5 * Math.LN2
			const expected = { re: Math.exp(u) * Math.cos(v), im: Math.exp(u) * Math.sin(v) }
			const actual = powerComplexIterative({ re: 1, im: 1 }, { re: 1, im: -1 })
			assertComplexClose(actual, expected, 1e-14)
		})

		test('positive real base with non-integer real exponent', () => {
			assert.deepEqual(powerComplexIterative({ re: 4, im: 0 }, { re: 0.5, im: 0 }), { re: 2, im: 0 })
			assert.deepEqual(powerComplexIterative({ re: 9, im: 0 }, { re: 0.5, im: 0 }), { re: 3, im: 0 })
			assert.deepEqual(powerComplexIterative({ re: 16, im: 0 }, { re: -0.25, im: 0 }), { re: 0.5, im: 0 })
		})
	})

	describe('edge cases', () => {
		test('zero base with valid exponents', () => {
			assert.deepEqual(powerComplexIterative({ re: 0, im: 0 }, { re: 0, im: 0 }), { re: 1, im: 0 })
			assert.deepEqual(powerComplexIterative({ re: 0, im: 0 }, { re: 2, im: 0 }), { re: 0, im: 0 })
			assert.deepEqual(powerComplexIterative({ re: 0, im: 0 }, { re: 0.5, im: 3 }), { re: 0, im: 0 })
			assert.deepEqual(powerComplexIterative({ re: 0, im: 0 }, { re: 1e-9, im: -5 }), { re: 0, im: 0 })
		})

		test('base 1 raised to any complex exponent equals 1', () => {
			const exponents = [
				{ re: 0, im: 0 },
				{ re: 5, im: 0 },
				{ re: -3.5, im: 0 },
				{ re: 0, im: 10 },
				{ re: -2.3, im: 4.7 },
			]
			for (const w of exponents) {
				assert.deepEqual(powerComplexIterative({ re: 1, im: 0 }, w), { re: 1, im: 0 })
			}
		})

		test('negative zero normalization and principal branch consistency', () => {
			const zeroZero = powerComplexIterative({ re: -0, im: -0 }, { re: -0, im: -0 })
			assert.ok(Object.is(zeroZero.re, 1) && Object.is(zeroZero.im, 0))

			const zeroPos = powerComplexIterative({ re: -0, im: -0 }, { re: 3, im: -0 })
			assert.ok(Object.is(zeroPos.re, 0) && Object.is(zeroPos.im, 0))

			// {-1, -0}^0.5 should normalize -0 to +0 so Arg(-1) = +pi -> +i
			const sqrtNegOne = powerComplexIterative({ re: -1, im: -0 }, { re: 0.5, im: 0 })
			assertComplexClose(sqrtNegOne, { re: 0, im: 1 }, 1e-15)
		})

		test('extreme magnitudes without spurious intermediate overflow', () => {
			// (1e200)^(-2) underflows cleanly to 0 instead of throwing from (1e200)^2 overflow
			assert.deepEqual(powerComplexIterative({ re: 1e200, im: 0 }, { re: -2, im: 0 }), { re: 0, im: 0 })
			// Underflow via general path
			assert.deepEqual(powerComplexIterative({ re: 2, im: 0 }, { re: -2000, im: 0 }), { re: 0, im: 0 })
			// Large components where Math.hypot(1e308, 1e308) would overflow, raised to 0.25
			const large = powerComplexIterative({ re: 1e308, im: 1e308 }, { re: 0.25, im: 0 })
			const expectedMag = Math.pow(Math.SQRT2, 0.25) * Math.pow(1e308, 0.25)
			assertComplexClose(
				large,
				{ re: expectedMag * Math.cos(Math.PI / 16), im: expectedMag * Math.sin(Math.PI / 16) },
				1e-12
			)
		})
	})

	describe('input validation and error handling', () => {
		test('throws TypeError for invalid argument types', () => {
			const invalidValues = [
				null,
				undefined,
				42,
				'1+2i',
				true,
				[1, 2],
				{},
				{ re: 1 },
				{ im: 2 },
				{ re: '1', im: 0 },
				{ re: 1, im: null },
			]
			for (const bad of invalidValues) {
				assert.throws(() => powerComplexIterative(bad, { re: 1, im: 0 }), TypeError)
				assert.throws(() => powerComplexIterative({ re: 1, im: 0 }, bad), TypeError)
			}
		})

		test('throws RangeError for non-finite components', () => {
			const nonFinite = [
				{ re: NaN, im: 0 },
				{ re: 0, im: NaN },
				{ re: Infinity, im: 0 },
				{ re: 0, im: -Infinity },
			]
			for (const bad of nonFinite) {
				assert.throws(() => powerComplexIterative(bad, { re: 1, im: 0 }), RangeError)
				assert.throws(() => powerComplexIterative({ re: 1, im: 0 }, bad), RangeError)
			}
		})

		test('throws RangeError for undefined 0^w powers', () => {
			const zero = { re: 0, im: 0 }
			assert.throws(() => powerComplexIterative(zero, { re: -1, im: 0 }), RangeError)
			assert.throws(() => powerComplexIterative(zero, { re: -0.5, im: 2 }), RangeError)
			assert.throws(() => powerComplexIterative(zero, { re: 0, im: 1 }), RangeError)
			assert.throws(() => powerComplexIterative(zero, { re: 0, im: -3 }), RangeError)
		})

		test('throws RangeError when result overflows finite range', () => {
			assert.throws(() => powerComplexIterative({ re: 1e200, im: 0 }, { re: 3, im: 0 }), RangeError)
			assert.throws(() => powerComplexIterative({ re: 1e-200, im: 0 }, { re: -2, im: 0 }), RangeError)
			assert.throws(() => powerComplexIterative({ re: 10, im: 0 }, { re: 1000, im: 0 }), RangeError)
			assert.throws(() => powerComplexIterative({ re: 10, im: 0 }, { re: 1000.5, im: 0 }), RangeError)
			assert.throws(() => powerComplexIterative({ re: 10, im: 0 }, { re: 1000, im: 2 }), RangeError)
		})
	})

	describe('independent cross-checks', () => {
		test('matches naive repeated multiplication across integer exponents', () => {
			const bases = [
				{ re: 2, im: 1 },
				{ re: -1.5, im: 0.75 },
				{ re: 0.6, im: -0.8 },
				{ re: -3, im: -2 },
				{ re: 0, im: -2 },
			]
			for (const z of bases) {
				for (let n = -10; n <= 10; n++) {
					const actual = powerComplexIterative(z, { re: n, im: 0 })
					const expected = naiveIntPow(z, n)
					assertComplexClose(actual, expected, 1e-11, `z=(${z.re},${z.im}), n=${n}`)
				}
			}
		})

		test('matches independent exp(w * Log(z)) reference and algebraic identities', () => {
			const bases = [
				{ re: 1.5, im: 2.25 },
				{ re: -2.0, im: 1.5 },
				{ re: -1.2, im: -3.4 },
				{ re: 0.5, im: -0.9 },
			]
			const exponents = [
				{ re: 0.5, im: 0.5 },
				{ re: -1.25, im: 2.1 },
				{ re: 2.3, im: -0.7 },
				{ re: 0, im: 1.75 },
			]

			for (const z of bases) {
				for (const w of exponents) {
					const actual = powerComplexIterative(z, w)
					const ref = referenceExpLogPow(z, w)
					assertComplexClose(actual, ref, 1e-12, `exp(w*Log(z)) cross-check`)

					// Identity: z^w * z^(-w) = 1
					const invW = { re: -w.re, im: -w.im }
					const prod = naiveMul(actual, powerComplexIterative(z, invW))
					assertComplexClose(prod, { re: 1, im: 0 }, 1e-11, 'z^w * z^(-w) = 1')

					// Identity: |z^w| = |z|^Re(w) * exp(-Im(w) * Arg(z))
					const expectedMod =
						Math.pow(Math.hypot(z.re, z.im), w.re) * Math.exp(-w.im * Math.atan2(z.im, z.re))
					const actualMod = Math.hypot(actual.re, actual.im)
					assert.ok(
						Math.abs(actualMod - expectedMod) <= 1e-12 * Math.max(1, expectedMod),
						`modulus identity mismatch: ${actualMod} vs ${expectedMod}`
					)
				}

				// Identity: z^(w1 + w2) = z^w1 * z^w2 (exact on same principal branch)
				const w1 = { re: 0.7, im: -1.3 }
				const w2 = { re: -1.1, im: 0.9 }
				const wSum = { re: w1.re + w2.re, im: w1.im + w2.im }
				const lhs = powerComplexIterative(z, wSum)
				const rhs = naiveMul(powerComplexIterative(z, w1), powerComplexIterative(z, w2))
				assertComplexClose(lhs, rhs, 1e-12, 'z^(w1 + w2) = z^w1 * z^w2')
			}
		})
	})
})
