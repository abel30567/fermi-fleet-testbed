import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { moduloComplexIterative } from './moduloComplexIterative.js'

/**
 * Independent closed-form complex modulo reference:
 * q = round(Re(a / b)) + i * round(Im(a / b)), r = a - q * b.
 */
function referenceClosedForm(a, b) {
	const denom = b.re * b.re + b.im * b.im
	const qRe = Math.round((a.re * b.re + a.im * b.im) / denom)
	const qIm = Math.round((a.im * b.re - a.re * b.im) / denom)
	const re = a.re - (qRe * b.re - qIm * b.im)
	const im = a.im - (qRe * b.im + qIm * b.re)
	return { re: re === 0 ? 0 : re, im: im === 0 ? 0 : im }
}

/**
 * Squared Euclidean norm |z|^2.
 */
function normSq(z) {
	return z.re * z.re + z.im * z.im
}

/**
 * Complex multiplication.
 */
function mulC(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	}
}

/**
 * Complex addition.
 */
function addC(a, b) {
	return { re: a.re + b.re, im: a.im + b.im }
}

describe('moduloComplexIterative', () => {
	describe('normal cases', () => {
		test('purely real complex numbers', () => {
			assert.deepStrictEqual(moduloComplexIterative({ re: 7, im: 0 }, { re: 3, im: 0 }), { re: 1, im: 0 })
			assert.deepStrictEqual(moduloComplexIterative({ re: 8, im: 0 }, { re: 3, im: 0 }), { re: -1, im: 0 })
			assert.deepStrictEqual(moduloComplexIterative({ re: -7, im: 0 }, { re: 3, im: 0 }), { re: -1, im: 0 })
			assert.deepStrictEqual(moduloComplexIterative({ re: 7, im: 0 }, { re: -3, im: 0 }), { re: 1, im: 0 })
			assert.deepStrictEqual(moduloComplexIterative({ re: 9, im: 0 }, { re: 3, im: 0 }), { re: 0, im: 0 })
		})

		test('purely imaginary numbers and mixed axes', () => {
			assert.deepStrictEqual(moduloComplexIterative({ re: 0, im: 7 }, { re: 0, im: 3 }), { re: 0, im: 1 })
			assert.deepStrictEqual(moduloComplexIterative({ re: 5, im: 0 }, { re: 0, im: 2 }), { re: 1, im: 0 })
			assert.deepStrictEqual(moduloComplexIterative({ re: 0, im: 5 }, { re: 2, im: 0 }), { re: 0, im: -1 })
		})

		test('general Gaussian integers across quadrants', () => {
			assert.deepStrictEqual(moduloComplexIterative({ re: 10, im: 5 }, { re: 3, im: 2 }), { re: 1, im: -1 })
			assert.deepStrictEqual(moduloComplexIterative({ re: 11, im: 3 }, { re: 1, im: 8 }), { re: 2, im: -4 })
			assert.deepStrictEqual(moduloComplexIterative({ re: -13, im: 17 }, { re: 4, im: -3 }), { re: 0, im: 1 })
			assert.deepStrictEqual(moduloComplexIterative({ re: -25, im: -19 }, { re: -5, im: -2 }), { re: 1, im: 3 })
		})

		test('exact multiples produce zero remainder', () => {
			const divisors = [
				{ re: 1, im: 0 },
				{ re: 0, im: 1 },
				{ re: 3, im: 4 },
				{ re: -2, im: 5 },
				{ re: -7, im: -3 },
			]
			const quotients = [
				{ re: 0, im: 0 },
				{ re: 1, im: 0 },
				{ re: -1, im: 0 },
				{ re: 0, im: 1 },
				{ re: 0, im: -1 },
				{ re: 5, im: -11 },
				{ re: -19, im: 23 },
			]
			for (const b of divisors) {
				for (const q of quotients) {
					const a = mulC(q, b)
					assert.deepStrictEqual(moduloComplexIterative(a, b), { re: 0, im: 0 })
				}
			}
		})

		test('non-integer floating-point complex numbers', () => {
			const a = { re: 10.75, im: -4.25 }
			const b = { re: 1.5, im: 0.5 }
			const result = moduloComplexIterative(a, b)
			const expected = referenceClosedForm(a, b)
			assert.ok(Math.abs(result.re - expected.re) < 1e-12)
			assert.ok(Math.abs(result.im - expected.im) < 1e-12)
			assert.ok(normSq(result) <= 0.5 * normSq(b) + 1e-12)
		})
	})

	describe('edge cases', () => {
		test('zero dividend and negative zero normalization', () => {
			const res1 = moduloComplexIterative({ re: 0, im: 0 }, { re: 3, im: -4 })
			assert.deepStrictEqual(res1, { re: 0, im: 0 })
			assert.ok(Object.is(res1.re, 0))
			assert.ok(Object.is(res1.im, 0))

			const res2 = moduloComplexIterative({ re: -0, im: -0 }, { re: -2, im: 5 })
			assert.deepStrictEqual(res2, { re: 0, im: 0 })
			assert.ok(Object.is(res2.re, 0))
			assert.ok(Object.is(res2.im, 0))
		})

		test('already reduced dividend is returned unchanged without mutating inputs', () => {
			const a = { re: 1, im: -1 }
			const b = { re: 5, im: 2 }
			const aCopy = { ...a }
			const bCopy = { ...b }
			const res = moduloComplexIterative(a, b)
			assert.deepStrictEqual(res, { re: 1, im: -1 })
			assert.notStrictEqual(res, a)
			assert.deepStrictEqual(a, aCopy)
			assert.deepStrictEqual(b, bCopy)
		})

		test('half-integer boundary tie-breaking matches round-half-toward-+Infinity', () => {
			// a / b = 0.5 -> q = 1, r = -1
			assert.deepStrictEqual(moduloComplexIterative({ re: 1, im: 0 }, { re: 2, im: 0 }), { re: -1, im: 0 })
			// a / b = -0.5 -> q = 0, r = -1
			assert.deepStrictEqual(moduloComplexIterative({ re: -1, im: 0 }, { re: 2, im: 0 }), { re: -1, im: 0 })
			// a / b = 0.5i -> q = i, r = -i * 2 = -2i? No, a = i, b = 2 -> r = i - 2i = -i
			assert.deepStrictEqual(moduloComplexIterative({ re: 0, im: 1 }, { re: 2, im: 0 }), { re: 0, im: -1 })
			// a / b = -0.5i -> q = 0, r = -i
			assert.deepStrictEqual(moduloComplexIterative({ re: 0, im: -1 }, { re: 2, im: 0 }), { re: 0, im: -1 })
			// a / b = 0.5 + 0.5i -> q = 1 + i, r = (1 + i) - (2 + 2i) = -1 - i
			assert.deepStrictEqual(moduloComplexIterative({ re: 1, im: 1 }, { re: 2, im: 0 }), { re: -1, im: -1 })
			// a / b = -0.5 + 0.5i -> q = 0 + i, r = (-1 + i) - 2i = -1 - i
			assert.deepStrictEqual(moduloComplexIterative({ re: -1, im: 1 }, { re: 2, im: 0 }), { re: -1, im: -1 })
		})

		test('large Gaussian integers complete quickly and accurately', () => {
			const b = { re: 7, im: -11 }
			const q = { re: 123456789, im: -987654321 }
			const expectedRem = { re: 3, im: -2 }
			const a = addC(mulC(q, b), expectedRem)
			assert.deepStrictEqual(moduloComplexIterative(a, b), expectedRem)

			// 1e17 === 1 (mod 3): exact power-of-two reduction preserves exactness
			assert.deepStrictEqual(moduloComplexIterative({ re: 1e17, im: 0 }, { re: 3, im: 0 }), { re: 1, im: 0 })
		})

		test('extreme magnitudes without norm overflow or underflow', () => {
			const bigB = { re: 3e200, im: 4e200 }
			const bigA = { re: 10e200, im: 5e200 } // q = 2 - i -> q*b = (10 + 5i)*1e200
			const bigRes = moduloComplexIterative(bigA, bigB)
			assert.ok(Math.abs(bigRes.re) <= 1e186)
			assert.ok(Math.abs(bigRes.im) <= 1e186)

			const smallB = { re: 3e-200, im: 4e-200 }
			const smallA = { re: 11e-200, im: 5e-200 } // remainder should be ~1e-200
			const smallRes = moduloComplexIterative(smallA, smallB)
			assert.ok(Math.abs(smallRes.re - 1e-200) <= 1e-214)
			assert.ok(Math.abs(smallRes.im) <= 1e-214)

			// Near Number.MAX_VALUE where naive dot product would overflow
			const hugeA = { re: 1.5e308, im: 1.5e308 }
			const hugeB = { re: 1e308, im: 1e308 }
			const hugeRes = moduloComplexIterative(hugeA, hugeB)
			assert.ok(Number.isFinite(hugeRes.re) && Number.isFinite(hugeRes.im))
			assert.ok(Math.abs(hugeRes.re - -0.5e308) < 1e294)
			assert.ok(Math.abs(hugeRes.im - -0.5e308) < 1e294)
		})
	})

	describe('input validation', () => {
		test('throws TypeError for non-object or malformed complex inputs', () => {
			const badInputs = [null, undefined, 42, '1+2i', true, [1, 2], {}, { re: 1 }, { im: 2 }, { re: '1', im: 0 }, { re: 0, im: null }]
			for (const bad of badInputs) {
				assert.throws(() => moduloComplexIterative(bad, { re: 1, im: 0 }), TypeError)
				assert.throws(() => moduloComplexIterative({ re: 1, im: 0 }, bad), TypeError)
			}
		})

		test('throws RangeError for non-finite components', () => {
			const nonFinite = [NaN, Infinity, -Infinity]
			for (const val of nonFinite) {
				assert.throws(() => moduloComplexIterative({ re: val, im: 0 }, { re: 1, im: 0 }), RangeError)
				assert.throws(() => moduloComplexIterative({ re: 0, im: val }, { re: 1, im: 0 }), RangeError)
				assert.throws(() => moduloComplexIterative({ re: 1, im: 0 }, { re: val, im: 0 }), RangeError)
				assert.throws(() => moduloComplexIterative({ re: 1, im: 0 }, { re: 0, im: val }), RangeError)
			}
		})

		test('throws RangeError for zero divisor', () => {
			assert.throws(() => moduloComplexIterative({ re: 5, im: 3 }, { re: 0, im: 0 }), RangeError)
			assert.throws(() => moduloComplexIterative({ re: 0, im: 0 }, { re: -0, im: 0 }), RangeError)
		})

		test('throws RangeError when quotient overflows finite floating-point range', () => {
			assert.throws(() => moduloComplexIterative({ re: 1e200, im: 0 }, { re: 1e-200, im: 0 }), RangeError)
		})
	})

	describe('independent cross-checks', () => {
		test('matches closed-form formula, norm bound, and lattice congruence across Gaussian integer grid', () => {
			const divisors = [
				{ re: 1, im: 1 },
				{ re: 2, im: 3 },
				{ re: -3, im: 2 },
				{ re: 4, im: -5 },
				{ re: -6, im: -1 },
				{ re: 0, im: 3 },
				{ re: 5, im: 0 },
			]

			for (const b of divisors) {
				const normB = normSq(b)
				for (let aRe = -12; aRe <= 12; aRe += 3) {
					for (let aIm = -12; aIm <= 12; aIm += 3) {
						const a = { re: aRe, im: aIm }
						const actual = moduloComplexIterative(a, b)
						const expected = referenceClosedForm(a, b)

						// 1. Exact agreement with independent closed-form reference
						assert.deepStrictEqual(actual, expected)

						// 2. Euclidean norm descent bound: |r|^2 <= 0.5 * |b|^2
						assert.ok(normSq(actual) <= 0.5 * normB)

						// 3. Lattice congruence: (a - r) / b must be an exact Gaussian integer
						const diffRe = a.re - actual.re
						const diffIm = a.im - actual.im
						const numRe = diffRe * b.re + diffIm * b.im
						const numIm = diffIm * b.re - diffRe * b.im
						assert.strictEqual(numRe % normB === 0, true)
						assert.strictEqual(numIm % normB === 0, true)
					}
				}
			}
		})

		test('brute-force lattice search confirms global minimum remainder norm', () => {
			const cases = [
				{ a: { re: 17, im: -23 }, b: { re: 4, im: 3 } },
				{ a: { re: -19, im: -7 }, b: { re: -2, im: 5 } },
				{ a: { re: 8.3, im: -6.7 }, b: { re: 2.1, im: 1.4 } },
				{ a: { re: -12.5, im: 9.25 }, b: { re: -1.75, im: 3.25 } },
			]

			for (const { a, b } of cases) {
				const r = moduloComplexIterative(a, b)
				const rNorm = normSq(r)

				// Brute-force search over a wide grid of Gaussian integer quotients q
				let minNorm = Infinity
				for (let qRe = -15; qRe <= 15; qRe++) {
					for (let qIm = -15; qIm <= 15; qIm++) {
						const candRe = a.re - (qRe * b.re - qIm * b.im)
						const candIm = a.im - (qRe * b.im + qIm * b.re)
						const candNorm = candRe * candRe + candIm * candIm
						if (candNorm < minNorm) {
							minNorm = candNorm
						}
					}
				}

				assert.ok(Math.abs(rNorm - minNorm) < 1e-11, `Expected norm ${rNorm} to equal global minimum ${minNorm}`)
			}
		})

		test('algebraic identities: periodicity, idempotence, unit invariance, and scaling', () => {
			const a = { re: 29, im: -14 }
			const b = { re: 5, im: 3 }
			const base = moduloComplexIterative(a, b)

			// Idempotence: mod(mod(a, b), b) === mod(a, b)
			assert.deepStrictEqual(moduloComplexIterative(base, b), base)

			// Periodicity: mod(a + k * b, b) === mod(a, b) for Gaussian integer k
			const ks = [
				{ re: 1, im: 0 },
				{ re: -4, im: 7 },
				{ re: 12, im: -9 },
			]
			for (const k of ks) {
				assert.deepStrictEqual(moduloComplexIterative(addC(a, mulC(k, b)), b), base)
			}

			// Unit invariance of remainder norm: |mod(a, u * b)|^2 === |mod(a, b)|^2 for u in {1, -1, i, -i}
			const units = [
				{ re: 1, im: 0 },
				{ re: -1, im: 0 },
				{ re: 0, im: 1 },
				{ re: 0, im: -1 },
			]
			for (const u of units) {
				const rUnit = moduloComplexIterative(a, mulC(u, b))
				assert.strictEqual(normSq(rUnit), normSq(base))
			}

			// Positive scalar homogeneity: mod(c * a, c * b) === c * mod(a, b)
			const c = 4
			const scaled = moduloComplexIterative({ re: c * a.re, im: c * a.im }, { re: c * b.re, im: c * b.im })
			assert.deepStrictEqual(scaled, { re: c * base.re, im: c * base.im })
		})

		test('Euclidean GCD over Gaussian integers converges using moduloComplexIterative', () => {
			// Construct a = g * u and b = g * v where u = 3 + 2i (norm 13) and v = 4 + i (norm 17) are coprime.
			const g = { re: 2, im: 3 } // norm 13
			const u = { re: 3, im: 2 } // norm 13
			const v = { re: 4, im: 1 } // norm 17 (coprime to 13)
			let x = mulC(g, u)
			let y = mulC(g, v)

			let steps = 0
			while (y.re !== 0 || y.im !== 0) {
				const r = moduloComplexIterative(x, y)
				assert.ok(normSq(r) < normSq(y))
				x = y
				y = r
				steps++
				assert.ok(steps < 20)
			}

			// Result x must be an associate of g (i.e., x = unit * g, so N(x) === N(g) and g divides x)
			assert.strictEqual(normSq(x), normSq(g))
			assert.deepStrictEqual(moduloComplexIterative(x, g), { re: 0, im: 0 })
		})
	})
})
