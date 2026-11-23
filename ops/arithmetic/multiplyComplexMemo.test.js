import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { multiplyComplexMemo } from './multiplyComplexMemo.js'

/**
 * Independent cross-check #1: 2x2 real matrix representation of complex numbers.
 * z = a + bi corresponds to [[a, -b], [b, a]].
 */
function multiplyViaMatrix(a, b) {
	const mA = [
		[a.re, -a.im],
		[a.im, a.re],
	]
	const mB = [
		[b.re, -b.im],
		[b.im, b.re],
	]
	const re = mA[0][0] * mB[0][0] + mA[0][1] * mB[1][0]
	const im = mA[1][0] * mB[0][0] + mA[1][1] * mB[1][0]
	return {
		re: re === 0 ? 0 : re,
		im: im === 0 ? 0 : im,
	}
}

/**
 * Independent cross-check #2: Polar form multiplication r1*r2 * e^(i*(theta1+theta2)).
 */
function multiplyViaPolar(a, b) {
	const r = Math.hypot(a.re, a.im) * Math.hypot(b.re, b.im)
	const theta = Math.atan2(a.im, a.re) + Math.atan2(b.im, b.re)
	return {
		re: r * Math.cos(theta),
		im: r * Math.sin(theta),
	}
}

describe('multiplyComplexMemo', () => {
	describe('normal cases', () => {
		it('multiplies small Gaussian integers via the precomputed table', () => {
			assert.deepStrictEqual(multiplyComplexMemo({ re: 2, im: 3 }, { re: 1, im: -2 }), {
				re: 8,
				im: -1,
			})
			assert.deepStrictEqual(multiplyComplexMemo({ re: -3, im: 2 }, { re: 3, im: -3 }), {
				re: -3,
				im: 15,
			})
			assert.deepStrictEqual(multiplyComplexMemo({ re: 1, im: 1 }, { re: 1, im: -1 }), {
				re: 2,
				im: 0,
			})
		})

		it('multiplies larger integers and floating-point complex numbers via memoization', () => {
			assert.deepStrictEqual(multiplyComplexMemo({ re: 4, im: 5 }, { re: 6, im: 7 }), {
				re: -11,
				im: 58,
			})
			const res = multiplyComplexMemo({ re: 1.5, im: -2.25 }, { re: -0.5, im: 4.0 })
			assert.ok(Math.abs(res.re - 8.25) < 1e-12)
			assert.ok(Math.abs(res.im - 7.125) < 1e-12)
		})

		it('handles purely real and purely imaginary numbers', () => {
			assert.deepStrictEqual(multiplyComplexMemo({ re: 5, im: 0 }, { re: -4, im: 0 }), {
				re: -20,
				im: 0,
			})
			assert.deepStrictEqual(multiplyComplexMemo({ re: 0, im: 1 }, { re: 0, im: 1 }), {
				re: -1,
				im: 0,
			})
			assert.deepStrictEqual(multiplyComplexMemo({ re: 0, im: 4 }, { re: 0, im: -5 }), {
				re: 20,
				im: 0,
			})
			assert.deepStrictEqual(multiplyComplexMemo({ re: 7, im: 0 }, { re: 0, im: 3 }), {
				re: 0,
				im: 21,
			})
		})
	})

	describe('edge cases and memoization properties', () => {
		it('handles zero, multiplicative identity (1 + 0i), and negative zero normalization', () => {
			const zero = { re: 0, im: 0 }
			const one = { re: 1, im: 0 }
			const z = { re: -12.5, im: 7.25 }

			assert.deepStrictEqual(multiplyComplexMemo(z, zero), { re: 0, im: 0 })
			assert.deepStrictEqual(multiplyComplexMemo(zero, z), { re: 0, im: 0 })
			assert.deepStrictEqual(multiplyComplexMemo(z, one), { re: -12.5, im: 7.25 })
			assert.deepStrictEqual(multiplyComplexMemo(one, z), { re: -12.5, im: 7.25 })

			// Negative zero inputs and products must normalize cleanly to +0
			const negZeroProd = multiplyComplexMemo({ re: -0, im: 1 }, { re: -1, im: -0 })
			assert.ok(Object.is(negZeroProd.re, 0))
			assert.strictEqual(negZeroProd.im, -1)

			const largeNegZero = multiplyComplexMemo({ re: -0, im: 10 }, { re: -10, im: -0 })
			assert.ok(Object.is(largeNegZero.re, 0))
			assert.strictEqual(largeNegZero.im, -100)
		})

		it('returns defensive copies so mutating results never corrupts table or cache entries', () => {
			// Table path
			const t1 = multiplyComplexMemo({ re: 2, im: 1 }, { re: 3, im: -1 })
			assert.deepStrictEqual(t1, { re: 7, im: 1 })
			t1.re = 9999
			t1.im = -9999
			const t2 = multiplyComplexMemo({ re: 2, im: 1 }, { re: 3, im: -1 })
			assert.deepStrictEqual(t2, { re: 7, im: 1 })

			// Memoization cache path
			const m1 = multiplyComplexMemo({ re: 10.5, im: -4.25 }, { re: -3.5, im: 8.75 })
			const expected = { re: m1.re, im: m1.im }
			m1.re = NaN
			m1.im = Infinity
			const m2 = multiplyComplexMemo({ re: 10.5, im: -4.25 }, { re: -3.5, im: 8.75 })
			assert.deepStrictEqual(m2, expected)
			assert.notStrictEqual(m1, m2)
		})

		it('returns consistent results across repeated calls, commuted arguments, and cache eviction', () => {
			const a = { re: 13.75, im: -9.5 }
			const b = { re: -6.25, im: 11.125 }
			const ab1 = multiplyComplexMemo(a, b)
			const ba1 = multiplyComplexMemo(b, a)
			const ab2 = multiplyComplexMemo(a, b)

			assert.deepStrictEqual(ab1, ba1)
			assert.deepStrictEqual(ab1, ab2)

			// Exercise cache eviction beyond MAX_CACHE_SIZE (4096)
			for (let k = 0; k < 4500; k++) {
				const x = { re: k + 10.5, im: -0.5 }
				const y = { re: 2, im: 1 }
				const prod = multiplyComplexMemo(x, y)
				assert.deepStrictEqual(prod, multiplyViaMatrix(x, y))
			}

			// Re-querying an evicted entry still produces the exact product
			assert.deepStrictEqual(multiplyComplexMemo(a, b), ab1)
		})

		it('handles very small subnormal and large finite magnitudes', () => {
			const tiny = multiplyComplexMemo({ re: 1e-150, im: 2e-150 }, { re: 3e-150, im: -4e-150 })
			assert.ok(Math.abs(tiny.re - 11e-300) <= 1e-314)
			assert.ok(Math.abs(tiny.im - 2e-300) <= 1e-314)

			const large = multiplyComplexMemo({ re: 1e100, im: -2e100 }, { re: 3e100, im: 4e100 })
			assert.ok(Math.abs(large.re - 11e200) / 11e200 < 1e-12)
			assert.ok(Math.abs(large.im - -2e200) / 2e200 < 1e-12)
		})
	})

	describe('input validation', () => {
		it('throws TypeError when arguments are missing or not plain objects', () => {
			const valid = { re: 1, im: 2 }
			const badObjects = [null, undefined, 42, '1+2i', true, [1, 2], () => ({ re: 1, im: 2 })]

			assert.throws(() => multiplyComplexMemo(), TypeError)
			assert.throws(() => multiplyComplexMemo(valid), TypeError)

			for (const bad of badObjects) {
				assert.throws(() => multiplyComplexMemo(bad, valid), TypeError)
				assert.throws(() => multiplyComplexMemo(valid, bad), TypeError)
			}
		})

		it('throws TypeError when re or im is missing or non-numeric', () => {
			const valid = { re: 1, im: 2 }
			const badShapes = [
				{},
				{ re: 1 },
				{ im: 2 },
				{ re: '1', im: 2 },
				{ re: 1, im: '2' },
				{ re: null, im: 0 },
				{ re: 0, im: undefined },
				{ re: true, im: false },
				{ re: 1n, im: 2n },
			]

			for (const bad of badShapes) {
				assert.throws(() => multiplyComplexMemo(bad, valid), TypeError)
				assert.throws(() => multiplyComplexMemo(valid, bad), TypeError)
			}
		})

		it('throws RangeError when re or im is NaN or infinite', () => {
			const valid = { re: 1, im: 2 }
			const nonFinite = [
				{ re: NaN, im: 0 },
				{ re: 0, im: NaN },
				{ re: Infinity, im: 1 },
				{ re: 1, im: Infinity },
				{ re: -Infinity, im: 1 },
				{ re: 1, im: -Infinity },
			]

			for (const bad of nonFinite) {
				assert.throws(() => multiplyComplexMemo(bad, valid), RangeError)
				assert.throws(() => multiplyComplexMemo(valid, bad), RangeError)
			}
		})
	})

	describe('independent cross-checks and algebraic laws', () => {
		it('matches 2x2 real matrix multiplication across the full precomputed table and floating-point samples', () => {
			// Exhaustively verify every pair in the [-3, 3]^2 precomputed table
			for (let ar = -3; ar <= 3; ar++) {
				for (let ai = -3; ai <= 3; ai++) {
					for (let br = -3; br <= 3; br++) {
						for (let bi = -3; bi <= 3; bi++) {
							const a = { re: ar, im: ai }
							const b = { re: br, im: bi }
							assert.deepStrictEqual(
								multiplyComplexMemo(a, b),
								multiplyViaMatrix(a, b),
							)
						}
					}
				}
			}

			// Verify non-table floating-point values across all 4 quadrants
			const samples = [
				{ re: 3.14159, im: -2.71828 },
				{ re: -7.5, im: 4.25 },
				{ re: -0.125, im: -19.875 },
				{ re: 42.1, im: 0.003 },
				{ re: 0, im: -11.4 },
				{ re: 100.25, im: 0 },
			]
			for (const a of samples) {
				for (const b of samples) {
					assert.deepStrictEqual(multiplyComplexMemo(a, b), multiplyViaMatrix(a, b))
				}
			}
		})

		it('matches independent polar-form multiplication across all quadrants', () => {
			const samples = [
				{ re: 3, im: 4 },
				{ re: -5, im: 12 },
				{ re: -8, im: -15 },
				{ re: 7, im: -24 },
				{ re: 1.23, im: -4.56 },
				{ re: -0.75, im: 9.1 },
			]

			for (const a of samples) {
				for (const b of samples) {
					const actual = multiplyComplexMemo(a, b)
					const expected = multiplyViaPolar(a, b)
					assert.ok(
						Math.abs(actual.re - expected.re) < 1e-11,
						`re mismatch for (${a.re}+${a.im}i)*(${b.re}+${b.im}i): ${actual.re} vs ${expected.re}`,
					)
					assert.ok(
						Math.abs(actual.im - expected.im) < 1e-11,
						`im mismatch for (${a.re}+${a.im}i)*(${b.re}+${b.im}i): ${actual.im} vs ${expected.im}`,
					)
				}
			}
		})

		it('satisfies associativity, distributivity, conjugate norm, and multiplicative inverse', () => {
			const a = { re: 2.5, im: -3.5 }
			const b = { re: -1.25, im: 4.75 }
			const c = { re: 6.125, im: 2.875 }

			// Associativity: (a * b) * c == a * (b * c)
			const lhsAssoc = multiplyComplexMemo(multiplyComplexMemo(a, b), c)
			const rhsAssoc = multiplyComplexMemo(a, multiplyComplexMemo(b, c))
			assert.ok(Math.abs(lhsAssoc.re - rhsAssoc.re) < 1e-12)
			assert.ok(Math.abs(lhsAssoc.im - rhsAssoc.im) < 1e-12)

			// Distributivity: a * (b + c) == a * b + a * c
			const bPlusC = { re: b.re + c.re, im: b.im + c.im }
			const lhsDist = multiplyComplexMemo(a, bPlusC)
			const ab = multiplyComplexMemo(a, b)
			const ac = multiplyComplexMemo(a, c)
			assert.ok(Math.abs(lhsDist.re - (ab.re + ac.re)) < 1e-12)
			assert.ok(Math.abs(lhsDist.im - (ab.im + ac.im)) < 1e-12)

			// Conjugate product: z * conj(z) == |z|^2 + 0i
			const conjA = { re: a.re, im: -a.im }
			const normSq = a.re * a.re + a.im * a.im
			const zConj = multiplyComplexMemo(a, conjA)
			assert.ok(Math.abs(zConj.re - normSq) < 1e-12)
			assert.strictEqual(zConj.im, 0)

			// Multiplicative inverse: z * z^-1 == 1 + 0i
			const invA = { re: a.re / normSq, im: -a.im / normSq }
			const prodInv = multiplyComplexMemo(a, invA)
			assert.ok(Math.abs(prodInv.re - 1) < 1e-12)
			assert.ok(Math.abs(prodInv.im) < 1e-12)
		})
	})
})
