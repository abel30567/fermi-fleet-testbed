import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { combinationsComplexIterative } from './combinationsComplexIterative.js'

function assertComplexClose(actual, expected, tol = 1e-12, message = '') {
	assert.equal(typeof actual, 'object', `${message}: expected object`)
	assert.ok(actual !== null, `${message}: expected non-null object`)
	assert.ok(
		Math.abs(actual.re - expected.re) <= tol,
		`${message}: real mismatch: actual=${actual.re}, expected=${expected.re}, diff=${Math.abs(actual.re - expected.re)}`,
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= tol,
		`${message}: imag mismatch: actual=${actual.im}, expected=${expected.im}, diff=${Math.abs(actual.im - expected.im)}`,
	)
}

function cAdd(a, b) {
	return { re: a.re + b.re, im: a.im + b.im }
}

function cMul(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	}
}

function cScale(a, s) {
	return { re: a.re * s, im: a.im * s }
}

function cConj(a) {
	return { re: a.re, im: -a.im }
}

/**
 * Independent naive reference: compute the falling factorial
 * z * (z - 1) * ... * (z - k + 1) first, then divide by k!.
 */
function naiveComplexCombinations(z, k) {
	let prod = { re: 1, im: 0 }
	let fact = 1
	for (let j = 0; j < k; j++) {
		prod = cMul(prod, { re: z.re - j, im: z.im })
		fact *= j + 1
	}
	return { re: prod.re / fact, im: prod.im / fact }
}

describe('combinationsComplexIterative', () => {
	describe('normal cases', () => {
		it('computes standard non-negative integer combinations with im = 0', () => {
			assert.deepStrictEqual(combinationsComplexIterative({ re: 5, im: 0 }, 2), { re: 10, im: 0 })
			assert.deepStrictEqual(combinationsComplexIterative({ re: 10, im: 0 }, 3), { re: 120, im: 0 })
			assert.deepStrictEqual(combinationsComplexIterative({ re: 20, im: 0 }, 10), { re: 184756, im: 0 })
			assert.deepStrictEqual(combinationsComplexIterative({ re: 52, im: 0 }, 5), { re: 2598960, im: 0 })
		})

		it('computes generalized combinations for fractional and negative real upper indices', () => {
			assertComplexClose(combinationsComplexIterative({ re: 0.5, im: 0 }, 3), { re: 0.0625, im: 0 })
			assertComplexClose(combinationsComplexIterative({ re: 0.5, im: 0 }, 4), { re: -5 / 128, im: 0 })
			assert.deepStrictEqual(combinationsComplexIterative({ re: -1, im: 0 }, 4), { re: 1, im: 0 })
			assert.deepStrictEqual(combinationsComplexIterative({ re: -1, im: 0 }, 5), { re: -1, im: 0 })
			assert.deepStrictEqual(combinationsComplexIterative({ re: -3, im: 0 }, 4), { re: 15, im: 0 })
		})

		it('computes combinations for complex upper indices with nonzero imaginary parts', () => {
			// C(1+i, 2) = (1+i)(i)/2 = (-1+i)/2
			assertComplexClose(combinationsComplexIterative({ re: 1, im: 1 }, 2), { re: -0.5, im: 0.5 })
			// C(1+i, 3) = (-0.5+0.5i)(-1+i)/3 = 0 - (1/3)i
			assertComplexClose(combinationsComplexIterative({ re: 1, im: 1 }, 3), { re: 0, im: -1 / 3 })
			// C(2i, 3) = (2i)(-1+2i)(-2+2i)/6 = (12 - 4i)/6 = 2 - (2/3)i
			assertComplexClose(combinationsComplexIterative({ re: 0, im: 2 }, 3), { re: 2, im: -2 / 3 })
			// C(3-2i, 2) = (3-2i)(2-2i)/2 = (2 - 10i)/2 = 1 - 5i
			assertComplexClose(combinationsComplexIterative({ re: 3, im: -2 }, 2), { re: 1, im: -5 })
		})
	})

	describe('edge cases', () => {
		it('returns { re: 1, im: 0 } when k = 0 for any valid z', () => {
			for (const z of [
				{ re: 0, im: 0 },
				{ re: -5, im: 3 },
				{ re: 1e100, im: -1e100 },
				{ re: 0.25, im: -0.75 },
			]) {
				assert.deepStrictEqual(combinationsComplexIterative(z, 0), { re: 1, im: 0 })
			}
		})

		it('returns z when k = 1', () => {
			assert.deepStrictEqual(combinationsComplexIterative({ re: 3.5, im: -2.25 }, 1), {
				re: 3.5,
				im: -2.25,
			})
			assert.deepStrictEqual(combinationsComplexIterative({ re: 0, im: 0 }, 1), { re: 0, im: 0 })
		})

		it('returns { re: 0, im: 0 } when z is a non-negative integer and k > z.re', () => {
			assert.deepStrictEqual(combinationsComplexIterative({ re: 0, im: 0 }, 1), { re: 0, im: 0 })
			assert.deepStrictEqual(combinationsComplexIterative({ re: 4, im: 0 }, 5), { re: 0, im: 0 })
			assert.deepStrictEqual(combinationsComplexIterative({ re: 3, im: 0 }, 1000), { re: 0, im: 0 })
		})

		it('handles symmetry cleanly for large non-negative integer z and k near z', () => {
			assert.deepStrictEqual(combinationsComplexIterative({ re: 1000, im: 0 }, 1000), { re: 1, im: 0 })
			assert.deepStrictEqual(combinationsComplexIterative({ re: 1000, im: 0 }, 999), { re: 1000, im: 0 })
			assert.deepStrictEqual(combinationsComplexIterative({ re: 1000, im: 0 }, 998), { re: 499500, im: 0 })
		})

		it('normalizes -0 to +0 in returned components', () => {
			const r1 = combinationsComplexIterative({ re: -0, im: -0 }, 1)
			assert.ok(Object.is(r1.re, 0))
			assert.ok(Object.is(r1.im, 0))

			const r2 = combinationsComplexIterative({ re: -2, im: 0 }, 2)
			assert.ok(Object.is(r2.im, 0))
			assert.equal(r2.re, 3)
		})

		it('throws RangeError when intermediate or final result overflows', () => {
			assert.throws(
				() => combinationsComplexIterative({ re: 1e200, im: 1e200 }, 2),
				RangeError,
			)
			assert.throws(
				() => combinationsComplexIterative({ re: 1e308, im: 0 }, 2),
				RangeError,
			)
		})
	})

	describe('input validation', () => {
		it('throws TypeError when z is not a complex object { re, im }', () => {
			for (const badZ of [null, undefined, 5, '1+i', true, [1, 2]]) {
				assert.throws(() => combinationsComplexIterative(badZ, 2), TypeError)
				assert.throws(() => combinationsComplexIterative(badZ, 0), TypeError)
			}
		})

		it('throws TypeError when z.re or z.im is not a number', () => {
			for (const badZ of [
				{},
				{ re: 1 },
				{ im: 1 },
				{ re: '1', im: 0 },
				{ re: 1, im: null },
				{ re: 1n, im: 0 },
			]) {
				assert.throws(() => combinationsComplexIterative(badZ, 2), TypeError)
			}
		})

		it('throws RangeError when z.re or z.im is non-finite', () => {
			for (const badZ of [
				{ re: NaN, im: 0 },
				{ re: 0, im: NaN },
				{ re: Infinity, im: 0 },
				{ re: 0, im: -Infinity },
			]) {
				assert.throws(() => combinationsComplexIterative(badZ, 2), RangeError)
				assert.throws(() => combinationsComplexIterative(badZ, 0), RangeError)
			}
		})

		it('throws TypeError when k is not a number', () => {
			for (const badK of [null, undefined, '2', true, { re: 2, im: 0 }, 2n]) {
				assert.throws(() => combinationsComplexIterative({ re: 3, im: 1 }, badK), TypeError)
			}
		})

		it('throws RangeError when k is negative, non-integer, non-finite, or unsafe integer', () => {
			for (const badK of [-1, -100, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
				assert.throws(() => combinationsComplexIterative({ re: 3, im: 1 }, badK), RangeError)
			}
		})
	})

	describe('independent cross-checks', () => {
		const sampleZ = [
			{ re: 2.5, im: -1.5 },
			{ re: -1.25, im: 2.75 },
			{ re: 0, im: 3 },
			{ re: -4, im: 0 },
			{ re: 3.14159, im: 2.71828 },
		]

		it('matches naive falling-factorial / k! reference across complex grid', () => {
			for (const z of sampleZ) {
				for (let k = 0; k <= 8; k++) {
					const actual = combinationsComplexIterative(z, k)
					const expected = naiveComplexCombinations(z, k)
					const scale = Math.max(1, Math.hypot(expected.re, expected.im))
					assertComplexClose(actual, expected, 1e-11 * scale, `z=${z.re}+${z.im}i, k=${k}`)
				}
			}
		})

		it("satisfies Pascal's identity C(z, k) = C(z - 1, k - 1) + C(z - 1, k)", () => {
			for (const z of sampleZ) {
				const zMinus1 = { re: z.re - 1, im: z.im }
				for (let k = 1; k <= 8; k++) {
					const lhs = combinationsComplexIterative(z, k)
					const rhs = cAdd(
						combinationsComplexIterative(zMinus1, k - 1),
						combinationsComplexIterative(zMinus1, k),
					)
					const scale = Math.max(1, Math.hypot(lhs.re, lhs.im))
					assertComplexClose(lhs, rhs, 1e-11 * scale, `Pascal z=${z.re}+${z.im}i, k=${k}`)
				}
			}
		})

		it('satisfies the Chu-Vandermonde identity C(z + w, k) = sum_{j=0..k} C(z, j) * C(w, k - j)', () => {
			const pairs = [
				[{ re: 1.5, im: 2.25 }, { re: -0.75, im: 1.5 }],
				[{ re: 3, im: -1 }, { re: -2, im: 4 }],
				[{ re: 0.5, im: 0.5 }, { re: 0.5, im: -0.5 }],
			]

			for (const [z, w] of pairs) {
				const sumZW = cAdd(z, w)
				for (let k = 0; k <= 7; k++) {
					const lhs = combinationsComplexIterative(sumZW, k)
					let rhs = { re: 0, im: 0 }
					for (let j = 0; j <= k; j++) {
						rhs = cAdd(
							rhs,
							cMul(combinationsComplexIterative(z, j), combinationsComplexIterative(w, k - j)),
						)
					}
					const scale = Math.max(1, Math.hypot(lhs.re, lhs.im))
					assertComplexClose(lhs, rhs, 1e-11 * scale, `Chu-Vandermonde k=${k}`)
				}
			}
		})

		it('satisfies upper negation C(-z, k) = (-1)^k * C(z + k - 1, k) and conjugate symmetry', () => {
			for (const z of sampleZ) {
				const negZ = { re: -z.re, im: -z.im }
				const conjZ = cConj(z)
				for (let k = 0; k <= 7; k++) {
					const lhsNeg = combinationsComplexIterative(negZ, k)
					const rhsNeg = cScale(
						combinationsComplexIterative({ re: z.re + k - 1, im: z.im }, k),
						k % 2 === 0 ? 1 : -1,
					)
					const scale = Math.max(1, Math.hypot(lhsNeg.re, lhsNeg.im))
					assertComplexClose(lhsNeg, rhsNeg, 1e-11 * scale, `upper negation k=${k}`)

					const lhsConj = combinationsComplexIterative(conjZ, k)
					const rhsConj = cConj(combinationsComplexIterative(z, k))
					assertComplexClose(lhsConj, rhsConj, 1e-12 * scale, `conjugate symmetry k=${k}`)
				}
			}
		})

		it('reproduces complex power (1 + x)^z = exp(z * ln(1 + x)) via Newton binomial series', () => {
			const z = { re: 1.5, im: -0.75 }
			const x = 0.25
			const ln1px = Math.log(1 + x)
			// exp((a + bi) * ln(1+x)) = exp(a * ln(1+x)) * (cos(b * ln(1+x)) + i sin(b * ln(1+x)))
			const mag = Math.exp(z.re * ln1px)
			const expected = {
				re: mag * Math.cos(z.im * ln1px),
				im: mag * Math.sin(z.im * ln1px),
			}

			let series = { re: 0, im: 0 }
			let xPow = 1
			for (let k = 0; k <= 30; k++) {
				const coeff = combinationsComplexIterative(z, k)
				series = cAdd(series, cScale(coeff, xPow))
				xPow *= x
			}

			assertComplexClose(series, expected, 1e-12, 'Newton binomial series')
		})
	})
})
