import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { summationComplexSeries } from './summationComplexSeries.js'

/**
 * Independent direct O(n) naive summation reference:
 * sum_{k=0}^{n-1} (a + k * d) * r^k
 */
function naiveSummation(a, r, n, d = { re: 0, im: 0 }) {
	let sumRe = 0
	let sumIm = 0
	let powRe = 1
	let powIm = 0
	for (let k = 0; k < n; k++) {
		const coeffRe = a.re + k * d.re
		const coeffIm = a.im + k * d.im
		sumRe += coeffRe * powRe - coeffIm * powIm
		sumIm += coeffRe * powIm + coeffIm * powRe
		const nextRe = powRe * r.re - powIm * r.im
		const nextIm = powRe * r.im + powIm * r.re
		powRe = nextRe
		powIm = nextIm
	}
	return { re: sumRe, im: sumIm }
}

function assertComplexClose(actual, expected, tol = 1e-11, label = '') {
	const errRe = Math.abs(actual.re - expected.re)
	const errIm = Math.abs(actual.im - expected.im)
	const scale = Math.max(1, Math.hypot(expected.re, expected.im))
	assert.ok(
		errRe <= tol * scale && errIm <= tol * scale,
		`${label} expected { re: ${expected.re}, im: ${expected.im} }, got { re: ${actual.re}, im: ${actual.im} } (diff: ${errRe}, ${errIm})`
	)
}

describe('summationComplexSeries', () => {
	describe('edge cases', () => {
		it('returns { re: 0, im: 0 } for n = 0', () => {
			assert.deepStrictEqual(
				summationComplexSeries({ re: 3, im: -4 }, { re: 2, im: 1 }, 0, { re: 5, im: 6 }),
				{ re: 0, im: 0 }
			)
		})

		it('returns a for n = 1 (including r = 0 via 0^0 = 1)', () => {
			assert.deepStrictEqual(
				summationComplexSeries({ re: 2.5, im: -1.5 }, { re: 0, im: 0 }, 1, { re: 10, im: 20 }),
				{ re: 2.5, im: -1.5 }
			)
		})

		it('returns a for r = 0 with n >= 2 and n = Infinity', () => {
			const a = { re: -7, im: 3 }
			const d = { re: 11, im: -2 }
			assert.deepStrictEqual(summationComplexSeries(a, { re: 0, im: 0 }, 50, d), a)
			assert.deepStrictEqual(summationComplexSeries(a, { re: 0, im: 0 }, Infinity, d), a)
		})

		it('returns { re: 0, im: 0 } when both a and d are zero even for huge n and |r| > 1', () => {
			const zero = { re: 0, im: 0 }
			assert.deepStrictEqual(summationComplexSeries(zero, { re: 10, im: 5 }, 10000, zero), {
				re: 0,
				im: 0,
			})
			assert.deepStrictEqual(summationComplexSeries(zero, { re: 0.5, im: 0.2 }, Infinity, zero), {
				re: 0,
				im: 0,
			})
		})

		it('normalizes negative zero to positive zero', () => {
			const res = summationComplexSeries({ re: -0, im: -0 }, { re: 1, im: 0 }, 5, { re: -0, im: -0 })
			assert.ok(Object.is(res.re, 0))
			assert.ok(Object.is(res.im, 0))
		})
	})

	describe('closed-form special cases', () => {
		it('computes complex arithmetic series when r = 1', () => {
			const a = { re: 2, im: -3 }
			const d = { re: 1.5, im: 0.5 }
			const n = 100
			const result = summationComplexSeries(a, { re: 1, im: 0 }, n, d)
			const expected = {
				re: n * a.re + ((n * (n - 1)) / 2) * d.re,
				im: n * a.im + ((n * (n - 1)) / 2) * d.im,
			}
			assertComplexClose(result, expected, 1e-12, 'arithmetic r=1')
		})

		it('handles odd and large n cleanly for r = 1', () => {
			const a = { re: 1, im: 2 }
			const d = { re: 3, im: -1 }
			const n = 100001
			const result = summationComplexSeries(a, { re: 1, im: 0 }, n, d)
			const tri = n * ((n - 1) / 2)
			assert.deepStrictEqual(result, {
				re: n * a.re + tri * d.re,
				im: n * a.im + tri * d.im,
			})
		})

		it('computes finite complex geometric series (default d = 0)', () => {
			// sum_{k=0}^{3} i^k = 1 + i - 1 - i = 0
			assertComplexClose(
				summationComplexSeries({ re: 1, im: 0 }, { re: 0, im: 1 }, 4),
				{ re: 0, im: 0 },
				1e-14,
				'4th roots of unity'
			)
			// sum_{k=0}^{4} (2 - i) * (0.5 + 0.5i)^k
			const a = { re: 2, im: -1 }
			const r = { re: 0.5, im: 0.5 }
			assertComplexClose(
				summationComplexSeries(a, r, 5),
				naiveSummation(a, r, 5),
				1e-13,
				'geometric n=5'
			)
		})

		it('computes convergent infinite complex geometric and arithmetico-geometric series', () => {
			// a = 1, r = 0.5i => 1 / (1 - 0.5i) = (1 + 0.5i) / 1.25 = 0.8 + 0.4i
			assertComplexClose(
				summationComplexSeries({ re: 1, im: 0 }, { re: 0, im: 0.5 }, Infinity),
				{ re: 0.8, im: 0.4 },
				1e-14,
				'infinite geometric'
			)

			// Cross-check infinite arithmetico-geometric series against large finite naive sum
			const a = { re: 1.2, im: -0.7 }
			const r = { re: 0.3, im: -0.4 } // |r| = 0.5 < 1
			const d = { re: -0.5, im: 2.1 }
			const infSum = summationComplexSeries(a, r, Infinity, d)
			const truncated = naiveSummation(a, r, 100, d)
			assertComplexClose(infSum, truncated, 1e-13, 'infinite vs 100-term naive')
		})

		it('handles r near 1 without catastrophic cancellation (binomial Taylor branch)', () => {
			const a = { re: 1.5, im: -2.25 }
			const d = { re: -0.75, im: 3.125 }
			const r = { re: 1 + 1e-11, im: -2e-11 }
			const n = 500
			const result = summationComplexSeries(a, r, n, d)
			const ref = naiveSummation(a, r, n, d)
			assertComplexClose(result, ref, 1e-12, 'near r=1 cancellation check')
		})

		it('remains accurate across the n * |r - 1| = 0.5 transition boundary', () => {
			const a = { re: 2.3, im: -1.1 }
			const d = { re: -0.4, im: 1.7 }
			for (const eps of [1e-6, 1e-4, 4.9e-3, 5.1e-3, 2e-2]) {
				const r = { re: 1 + eps * 0.6, im: eps * 0.8 }
				const n = 100
				const actual = summationComplexSeries(a, r, n, d)
				const expected = naiveSummation(a, r, n, d)
				assertComplexClose(actual, expected, 1e-11, `boundary eps=${eps}`)
			}
		})

		it('handles large n via O(log n) binary exponentiation (including n > 2^31)', () => {
			// For |r| = 0.5 and n = 2^33, r^n underflows to 0 so finite sum equals S_infinity
			const a = { re: 3, im: -2 }
			const r = { re: 0.3, im: 0.4 }
			const d = { re: -1, im: 0.5 }
			const hugeN = 2 ** 33 + 7
			const finiteHuge = summationComplexSeries(a, r, hugeN, d)
			const infinite = summationComplexSeries(a, r, Infinity, d)
			assertComplexClose(finiteHuge, infinite, 1e-14, 'huge n > 2^31 convergence')
		})
	})

	describe('mathematical identities & independent cross-checks', () => {
		it('matches naive summation across diverse complex parameters', () => {
			const cases = [
				{ a: { re: 1, im: 2 }, r: { re: -0.7, im: 0.4 }, d: { re: 0.5, im: -1.5 }, n: 25 },
				{ a: { re: -3, im: 0 }, r: { re: 1.1, im: -0.3 }, d: { re: 0, im: 2 }, n: 18 },
				{ a: { re: 0, im: 0 }, r: { re: -1, im: 0 }, d: { re: 4, im: -3 }, n: 37 },
				{ a: { re: 0.5, im: -0.5 }, r: { re: 0, im: -1 }, d: { re: 1, im: 1 }, n: 41 },
				{ a: { re: 2, im: 3 }, r: { re: -1.2, im: -0.5 }, d: { re: -0.8, im: 0.2 }, n: 15 },
			]
			for (const { a, r, d, n } of cases) {
				const actual = summationComplexSeries(a, r, n, d)
				const expected = naiveSummation(a, r, n, d)
				assertComplexClose(actual, expected, 1e-11, `case n=${n}`)
			}
		})

		it('satisfies the Dirichlet kernel identity on the unit circle', () => {
			// sum_{k=0}^{n-1} e^{i k theta} = e^{i (n - 1) theta / 2} * sin(n theta / 2) / sin(theta / 2)
			const n = 29
			const theta = 0.73
			const r = { re: Math.cos(theta), im: Math.sin(theta) }
			const actual = summationComplexSeries({ re: 1, im: 0 }, r, n)

			const amp = Math.sin((n * theta) / 2) / Math.sin(theta / 2)
			const phase = ((n - 1) * theta) / 2
			const expected = { re: amp * Math.cos(phase), im: amp * Math.sin(phase) }
			assertComplexClose(actual, expected, 1e-12, 'Dirichlet kernel')
		})

		it('satisfies nth roots of unity identities for geometric and weighted sums', () => {
			// For r = e^{2 pi i / n}: sum r^k = 0 and sum k r^k = n / (r - 1)
			const n = 17
			const angle = (2 * Math.PI) / n
			const r = { re: Math.cos(angle), im: Math.sin(angle) }

			const geom = summationComplexSeries({ re: 1, im: 0 }, r, n)
			assertComplexClose(geom, { re: 0, im: 0 }, 1e-12, 'roots of unity geometric')

			const weighted = summationComplexSeries({ re: 0, im: 0 }, r, n, { re: 1, im: 0 })
			const denomRe = r.re - 1
			const denomIm = r.im
			const denomNorm2 = denomRe * denomRe + denomIm * denomIm
			const expected = {
				re: (n * denomRe) / denomNorm2,
				im: (-n * denomIm) / denomNorm2,
			}
			assertComplexClose(weighted, expected, 1e-12, 'roots of unity weighted')
		})

		it('satisfies the index-splitting identity S_{n1+n2}(a,r,d) = S_{n1}(a,r,d) + r^{n1} S_{n2}(a+n1*d,r,d)', () => {
			const a = { re: 1.7, im: -0.9 }
			const r = { re: 0.6, im: 0.7 }
			const d = { re: -0.3, im: 1.2 }
			const n1 = 11
			const n2 = 14

			const full = summationComplexSeries(a, r, n1 + n2, d)
			const first = summationComplexSeries(a, r, n1, d)
			const shiftedA = { re: a.re + n1 * d.re, im: a.im + n1 * d.im }
			const second = summationComplexSeries(shiftedA, r, n2, d)

			// Compute r^n1 independently using polar form
			const mod = Math.hypot(r.re, r.im) ** n1
			const arg = Math.atan2(r.im, r.re) * n1
			const rPowN1 = { re: mod * Math.cos(arg), im: mod * Math.sin(arg) }

			const combined = {
				re: first.re + (rPowN1.re * second.re - rPowN1.im * second.im),
				im: first.im + (rPowN1.re * second.im + rPowN1.im * second.re),
			}
			assertComplexClose(full, combined, 1e-11, 'index splitting identity')
		})

		it('satisfies complex linearity in (a, d)', () => {
			const r = { re: -0.4, im: 0.8 }
			const n = 20
			const a1 = { re: 2, im: -1 }
			const d1 = { re: 0.5, im: 1.5 }
			const a2 = { re: -1.5, im: 3 }
			const d2 = { re: -2, im: 0.25 }
			const alpha = { re: 1.2, im: -0.6 }
			const beta = { re: -0.5, im: 2.0 }

			const mul = (u, v) => ({ re: u.re * v.re - u.im * v.im, im: u.re * v.im + u.im * v.re })
			const add = (u, v) => ({ re: u.re + v.re, im: u.im + v.im })

			const lhs = summationComplexSeries(
				add(mul(alpha, a1), mul(beta, a2)),
				r,
				n,
				add(mul(alpha, d1), mul(beta, d2))
			)
			const s1 = summationComplexSeries(a1, r, n, d1)
			const s2 = summationComplexSeries(a2, r, n, d2)
			const rhs = add(mul(alpha, s1), mul(beta, s2))

			assertComplexClose(lhs, rhs, 1e-12, 'linearity')
		})
	})

	describe('input validation', () => {
		const c1 = { re: 1, im: 0 }
		const rHalf = { re: 0.5, im: 0 }

		it('throws TypeError for invalid complex objects', () => {
			for (const bad of [null, undefined, 42, '1+i', [1, 0], { re: '1', im: 0 }, { re: 1 }]) {
				assert.throws(() => summationComplexSeries(bad, rHalf, 5), TypeError)
				assert.throws(() => summationComplexSeries(c1, bad, 5), TypeError)
			}
			for (const badD of [null, 42, '1+i', [1, 0], { re: '1', im: 0 }, { re: 1 }]) {
				assert.throws(() => summationComplexSeries(c1, rHalf, 5, badD), TypeError)
			}
		})

		it('throws RangeError for non-finite complex components', () => {
			for (const bad of [
				{ re: NaN, im: 0 },
				{ re: 0, im: NaN },
				{ re: Infinity, im: 0 },
				{ re: 0, im: -Infinity },
			]) {
				assert.throws(() => summationComplexSeries(bad, rHalf, 5), RangeError)
				assert.throws(() => summationComplexSeries(c1, bad, 5), RangeError)
				assert.throws(() => summationComplexSeries(c1, rHalf, 5, bad), RangeError)
			}
		})

		it('throws TypeError when n is not a number', () => {
			for (const badN of ['5', null, undefined, {}, 5n]) {
				assert.throws(() => summationComplexSeries(c1, rHalf, badN), TypeError)
			}
		})

		it('throws RangeError for invalid finite n values', () => {
			for (const badN of [-1, 1.5, NaN, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
				assert.throws(() => summationComplexSeries(c1, rHalf, badN), RangeError)
			}
		})

		it('throws RangeError for infinite series when |r| >= 1', () => {
			assert.throws(() => summationComplexSeries(c1, { re: 1, im: 0 }, Infinity), RangeError)
			assert.throws(() => summationComplexSeries(c1, { re: 0, im: 1 }, Infinity), RangeError)
			assert.throws(() => summationComplexSeries(c1, { re: -1, im: 0 }, Infinity), RangeError)
			assert.throws(() => summationComplexSeries(c1, { re: 0.8, im: 0.6 }, Infinity), RangeError)
			assert.throws(() => summationComplexSeries(c1, { re: 1.5, im: 0 }, Infinity), RangeError)
		})

		it('throws RangeError when finite sum overflows IEEE-754 double precision', () => {
			assert.throws(() => summationComplexSeries(c1, { re: 10, im: 0 }, 400), RangeError)
			assert.throws(
				() => summationComplexSeries({ re: 1e308, im: 0 }, { re: 1, im: 0 }, 10),
				RangeError
			)
		})
	})
})
