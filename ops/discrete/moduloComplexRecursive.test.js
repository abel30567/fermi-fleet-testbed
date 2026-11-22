import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { moduloComplexRecursive } from './moduloComplexRecursive.js'

/**
 * Independent direct reference implementation of Gaussian modulo:
 * a mod b = a - b * round(a / b).
 *
 * @param {{ re: number, im: number }} a
 * @param {{ re: number, im: number }} b
 * @returns {{ re: number, im: number }}
 */
function directComplexModulo(a, b) {
	const denom = b.re * b.re + b.im * b.im
	const qRe = Math.round((a.re * b.re + a.im * b.im) / denom)
	const qIm = Math.round((a.im * b.re - a.re * b.im) / denom)
	const re = a.re - (b.re * qRe - b.im * qIm)
	const im = a.im - (b.re * qIm + b.im * qRe)
	return { re: re === 0 ? 0 : re, im: im === 0 ? 0 : im }
}

function normSq(z) {
	return z.re * z.re + z.im * z.im
}

function mulComplex(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	}
}

function addComplex(a, b) {
	return { re: a.re + b.re, im: a.im + b.im }
}

function assertComplexClose(actual, expected, eps = 1e-10) {
	assert.ok(
		Math.abs(actual.re - expected.re) <= eps,
		`re mismatch: expected ${expected.re}, got ${actual.re} (diff ${Math.abs(actual.re - expected.re)})`,
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= eps,
		`im mismatch: expected ${expected.im}, got ${actual.im} (diff ${Math.abs(actual.im - expected.im)})`,
	)
}

describe('moduloComplexRecursive', () => {
	describe('normal cases', () => {
		test('computes Gaussian integer modulo across quadrants', () => {
			// (13 + 7i) / (2 + i) = 6.6 + 0.2i -> round = 7 -> r = (13+7i) - 7(2+i) = -1 + 0i
			assert.deepEqual(moduloComplexRecursive({ re: 13, im: 7 }, { re: 2, im: 1 }), { re: -1, im: 0 })

			// (11 + 3i) / (3 + 2i) = (39 - 13i)/13 = 3 - i -> exact multiple -> 0
			assert.deepEqual(moduloComplexRecursive({ re: 11, im: 3 }, { re: 3, im: 2 }), { re: 0, im: 0 })

			// (-17 + 19i) / (4 - 3i) = (-125 + 25i)/25 = -5 + i -> exact multiple -> 0
			assert.deepEqual(moduloComplexRecursive({ re: -17, im: 19 }, { re: 4, im: -3 }), { re: 0, im: 0 })

			// (-10 - 11i) / (-3 + 2i) = (8 + 53i)/13 ≈ 0.615 + 4.077i -> round = 1 + 4i
			// (-3 + 2i)(1 + 4i) = (-11 - 10i) -> r = 1 - i
			assert.deepEqual(moduloComplexRecursive({ re: -10, im: -11 }, { re: -3, im: 2 }), { re: 1, im: -1 })
		})

		test('handles purely real and purely imaginary numbers', () => {
			// Centered modulo on reals: 7 mod 3 = 1, 8 mod 3 = -1
			assert.deepEqual(moduloComplexRecursive({ re: 7, im: 0 }, { re: 3, im: 0 }), { re: 1, im: 0 })
			assert.deepEqual(moduloComplexRecursive({ re: 8, im: 0 }, { re: 3, im: 0 }), { re: -1, im: 0 })

			// Purely imaginary: (10i) / (3i) = 3.333... -> q = 3 -> r = i
			assert.deepEqual(moduloComplexRecursive({ re: 0, im: 10 }, { re: 0, im: 3 }), { re: 0, im: 1 })

			// Real dividend, imaginary divisor: 11 / (3i) = -(11/3)i -> q = -4i -> 3i * (-4i) = 12 -> r = -1
			assert.deepEqual(moduloComplexRecursive({ re: 11, im: 0 }, { re: 0, im: 3 }), { re: -1, im: 0 })
		})

		test('handles non-integer floating-point complex numbers', () => {
			const cases = [
				[{ re: 10.7, im: -3.2 }, { re: 1.3, im: 0.7 }],
				[{ re: -25.4, im: 41.9 }, { re: -2.1, im: 3.4 }],
				[{ re: 123.456, im: -789.012 }, { re: 4.5, im: -2.25 }],
				[{ re: Math.PI, im: Math.E }, { re: 0.5, im: 0.25 }],
			]

			for (const [a, b] of cases) {
				const actual = moduloComplexRecursive(a, b)
				const expected = directComplexModulo(a, b)
				assertComplexClose(actual, expected, 1e-11)
				assert.ok(normSq(actual) <= 0.5 * normSq(b) + 1e-12)
			}
		})

		test('handles large magnitude ratios requiring deep recursive doubling', () => {
			const b = { re: 3, im: 2 }
			const q = { re: 1_000_000_007, im: -500_000_003 }
			const rExpected = { re: 1, im: -1 }
			const a = addComplex(mulComplex(b, q), rExpected)

			const actual = moduloComplexRecursive(a, b)
			assert.deepEqual(actual, rExpected)
		})
	})

	describe('edge cases', () => {
		test('returns { re: 0, im: 0 } without -0 when dividend is zero or exact multiple', () => {
			const r1 = moduloComplexRecursive({ re: 0, im: 0 }, { re: 3, im: 4 })
			assert.ok(Object.is(r1.re, 0))
			assert.ok(Object.is(r1.im, 0))

			const r2 = moduloComplexRecursive({ re: -0, im: -0 }, { re: -2, im: 5 })
			assert.ok(Object.is(r2.re, 0))
			assert.ok(Object.is(r2.im, 0))

			const r3 = moduloComplexRecursive({ re: -6, im: -8 }, { re: 3, im: 4 })
			assert.ok(Object.is(r3.re, 0))
			assert.ok(Object.is(r3.im, 0))
		})

		test('returns equivalent copy without mutating inputs when dividend is already reduced', () => {
			const a = { re: 1, im: -1 }
			const b = { re: 5, im: 3 }
			const r = moduloComplexRecursive(a, b)
			assert.deepEqual(r, { re: 1, im: -1 })
			assert.notEqual(r, a)
			assert.deepEqual(a, { re: 1, im: -1 })
			assert.deepEqual(b, { re: 5, im: 3 })
		})

		test('handles Gaussian unit divisors (±1, ±i)', () => {
			const units = [
				{ re: 1, im: 0 },
				{ re: -1, im: 0 },
				{ re: 0, im: 1 },
				{ re: 0, im: -1 },
			]
			for (const u of units) {
				assert.deepEqual(moduloComplexRecursive({ re: 17, im: -23 }, u), { re: 0, im: 0 })
			}
			// Non-integer mod 1 gives fractional centered part
			assertComplexClose(
				moduloComplexRecursive({ re: 3.25, im: -2.75 }, { re: 1, im: 0 }),
				{ re: 0.25, im: 0.25 },
				1e-15,
			)
		})

		test('matches half-integer tie-breaking of Math.round', () => {
			const tieCases = [
				[{ re: 1, im: 0 }, { re: 2, im: 0 }], // 0.5 -> round 1 -> -1
				[{ re: -1, im: 0 }, { re: 2, im: 0 }], // -0.5 -> round 0 -> -1
				[{ re: 5, im: 0 }, { re: 2, im: 0 }], // 2.5 -> round 3 -> -1
				[{ re: -5, im: 0 }, { re: 2, im: 0 }], // -2.5 -> round -2 -> -1
				[{ re: 5, im: 3 }, { re: 2, im: 2 }], // 2 - 0.5i -> round (2, 0) -> 1 - i
				[{ re: 3, im: 5 }, { re: 2, im: 2 }], // 2 + 0.5i -> round (2, 1) -> 1 - i
			]
			for (const [a, b] of tieCases) {
				assert.deepEqual(moduloComplexRecursive(a, b), directComplexModulo(a, b))
			}
		})

		test('handles extreme magnitudes near MAX_VALUE and subnormals without overflow/underflow', () => {
			// Near MAX_VALUE: b * 2 overflows, must still reduce cleanly via unit steps
			const large = moduloComplexRecursive({ re: 1.5e308, im: 0 }, { re: 1e308, im: 0 })
			assertComplexClose(large, { re: -0.5e308, im: 0 }, 1e293)

			const largeComplex = moduloComplexRecursive(
				{ re: 1.5e308, im: 1.5e308 },
				{ re: 1e308, im: 1e308 },
			)
			assertComplexClose(largeComplex, { re: -0.5e308, im: -0.5e308 }, 1e293)

			// Huge scale where naive b.re^2 + b.im^2 overflows Infinity
			const hugeScale = moduloComplexRecursive({ re: 13e200, im: 7e200 }, { re: 2e200, im: 1e200 })
			assertComplexClose(hugeScale, { re: -1e200, im: 0 }, 1e186)

			// Tiny scale where naive b.re^2 + b.im^2 underflows to 0
			const tinyScale = moduloComplexRecursive(
				{ re: 13e-200, im: 7e-200 },
				{ re: 2e-200, im: 1e-200 },
			)
			assertComplexClose(tinyScale, { re: -1e-200, im: 0 }, 1e-214)

			// Subnormal scale
			const subnormal = moduloComplexRecursive({ re: 7e-322, im: 0 }, { re: 3e-322, im: 0 })
			assert.ok(Number.isFinite(subnormal.re) && Number.isFinite(subnormal.im))
			assert.ok(normSq(subnormal) <= 0.5 * normSq({ re: 3e-322, im: 0 }) + 1e-323)
		})

		test('throws TypeError on non-object or non-numeric inputs', () => {
			const invalidTypes = [
				null,
				undefined,
				42,
				'1+2i',
				true,
				[1, 2],
				{},
				{ re: 1 },
				{ im: 2 },
				{ re: '1', im: 2 },
				{ re: 1, im: null },
			]
			for (const bad of invalidTypes) {
				assert.throws(() => moduloComplexRecursive(bad, { re: 1, im: 0 }), TypeError)
				assert.throws(() => moduloComplexRecursive({ re: 1, im: 0 }, bad), TypeError)
			}
		})

		test('throws RangeError on non-finite components or zero divisor', () => {
			const nonFinite = [
				{ re: NaN, im: 0 },
				{ re: 0, im: NaN },
				{ re: Infinity, im: 1 },
				{ re: 1, im: -Infinity },
			]
			for (const bad of nonFinite) {
				assert.throws(() => moduloComplexRecursive(bad, { re: 1, im: 1 }), RangeError)
				assert.throws(() => moduloComplexRecursive({ re: 1, im: 1 }, bad), RangeError)
			}

			assert.throws(
				() => moduloComplexRecursive({ re: 5, im: 3 }, { re: 0, im: 0 }),
				RangeError,
			)
			assert.throws(
				() => moduloComplexRecursive({ re: 0, im: 0 }, { re: -0, im: -0 }),
				RangeError,
			)
		})
	})

	describe('independent cross-checks and mathematical identities', () => {
		test('matches direct formula a - b * round(a / b) across exhaustive Gaussian integer grid', () => {
			for (let bRe = -3; bRe <= 3; bRe++) {
				for (let bIm = -3; bIm <= 3; bIm++) {
					if (bRe === 0 && bIm === 0) continue
					const b = { re: bRe, im: bIm }
					for (let aRe = -12; aRe <= 12; aRe++) {
						for (let aIm = -12; aIm <= 12; aIm++) {
							const a = { re: aRe, im: aIm }
							const actual = moduloComplexRecursive(a, b)
							const expected = directComplexModulo(a, b)
							assert.deepEqual(
								actual,
								expected,
								`Mismatch for (${aRe}+${aIm}i) mod (${bRe}+${bIm}i)`,
							)
							assert.ok(normSq(actual) <= 0.5 * normSq(b))
						}
					}
				}
			}
		})

		test('satisfies shift invariance, idempotence, and lattice reconstruction', () => {
			const a = { re: 19, im: -27 }
			const b = { re: 5, im: -3 }
			const r = moduloComplexRecursive(a, b)

			// Idempotence: (a mod b) mod b === a mod b
			assert.deepEqual(moduloComplexRecursive(r, b), r)

			// Shift invariance: (a + k * b) mod b === a mod b for any Gaussian integer k
			const shifts = [
				{ re: 1, im: 0 },
				{ re: -4, im: 7 },
				{ re: 123, im: -456 },
				{ re: -1024, im: 2048 },
			]
			for (const k of shifts) {
				const shifted = addComplex(a, mulComplex(k, b))
				assert.deepEqual(moduloComplexRecursive(shifted, b), r)
			}

			// Lattice reconstruction: (a - r) / b must be an exact Gaussian integer
			const diff = { re: a.re - r.re, im: a.im - r.im }
			const denom = normSq(b)
			const qRe = (diff.re * b.re + diff.im * b.im) / denom
			const qIm = (diff.im * b.re - diff.re * b.im) / denom
			assert.ok(Number.isInteger(qRe), `Expected integer qRe, got ${qRe}`)
			assert.ok(Number.isInteger(qIm), `Expected integer qIm, got ${qIm}`)
		})

		test('satisfies scaling homogeneity (c * a) mod (c * b) = c * (a mod b)', () => {
			const a = { re: 31, im: -17 }
			const b = { re: 4, im: 3 }
			const baseRem = moduloComplexRecursive(a, b)

			const scales = [
				{ re: 2, im: 0 },
				{ re: 0, im: 3 },
				{ re: 2, im: -1 },
				{ re: -3, im: 5 },
			]
			for (const c of scales) {
				const lhs = moduloComplexRecursive(mulComplex(c, a), mulComplex(c, b))
				const rhs = mulComplex(c, baseRem)
				assert.deepEqual(lhs, rhs)
			}
		})

		test('computes correct Gaussian GCD via Euclidean algorithm using moduloComplexRecursive', () => {
			function gaussianGcd(x, y) {
				let a = x
				let b = y
				while (b.re !== 0 || b.im !== 0) {
					const r = moduloComplexRecursive(a, b)
					a = b
					b = r
				}
				return a
			}

			// Known GCD: (2 + i) * (3 + 2i) = 4 + 7i, (2 + i) * (4 + i) = 7 + 6i
			// Since (3 + 2i) (norm 13) and (4 + i) (norm 17) are coprime Gaussian primes, gcd is (2 + i) up to a unit.
			const g = { re: 2, im: 1 } // norm 5
			const x = mulComplex(g, { re: 3, im: 2 }) // 4 + 7i
			const y = mulComplex(g, { re: 4, im: 1 }) // 7 + 6i
			const computed = gaussianGcd(x, y)

			// GCD is unique up to Gaussian units (±1, ±i), so its norm must equal norm(g) = 5
			assert.equal(normSq(computed), normSq(g))
			// And computed GCD divides both x and y with zero remainder
			assert.deepEqual(moduloComplexRecursive(x, computed), { re: 0, im: 0 })
			assert.deepEqual(moduloComplexRecursive(y, computed), { re: 0, im: 0 })
		})
	})
})
