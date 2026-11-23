import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { factorialDualIterative } from './factorialDualIterative.js'

const EULER_MASCHERONI = 0.5772156649015328606

/**
 * Independent Lanczos approximation of Γ(z) for Re(z) > 0.5 (g = 7, n = 9),
 * used solely as an independent cross-check for Γ(x + 1) and finite differences.
 */
function gammaLanczos(z) {
	const g = 7
	const coeffs = [
		0.99999999999980993,
		676.5203681218851,
		-1259.1392167224028,
		771.32342877765313,
		-176.61502916214059,
		12.507343278686905,
		-0.13857109526572012,
		9.9843695780195716e-6,
		1.5056327351493116e-7,
	]
	const u = z - 1
	let sum = coeffs[0]
	for (let i = 1; i < coeffs.length; i++) {
		sum += coeffs[i] / (u + i)
	}
	const t = u + g + 0.5
	return Math.sqrt(2 * Math.PI) * Math.pow(t, u + 0.5) * Math.exp(-t) * sum
}

/**
 * Independent 4th-order central finite difference of f at x.
 */
function centralDiff4(f, x, h = 1e-4) {
	return (-f(x + 2 * h) + 8 * f(x + h) - 8 * f(x - h) + f(x - 2 * h)) / (12 * h)
}

/**
 * Independent harmonic number H_n = sum_{k=1..n} 1/k (summed smallest-first).
 */
function harmonicNumber(n) {
	let sum = 0
	for (let k = n; k >= 1; k--) {
		sum += 1 / k
	}
	return sum
}

function assertClose(actual, expected, relTol = 1e-12, absTol = 1e-12) {
	const diff = Math.abs(actual - expected)
	const scale = Math.max(Math.abs(expected), 1)
	assert.ok(
		diff <= Math.max(absTol, relTol * scale),
		`Expected ${actual} to be close to ${expected} (diff=${diff}, rel=${diff / scale})`
	)
}

describe('factorialDualIterative', () => {
	describe('normal cases', () => {
		it('computes 0! and its derivative -γ * d', () => {
			const res = factorialDualIterative({ v: 0, d: 1 })
			assert.equal(res.v, 1)
			assertClose(res.d, -EULER_MASCHERONI, 1e-15)
		})

		it('computes 1! and its derivative (1 - γ) * d', () => {
			const res = factorialDualIterative({ v: 1, d: 1 })
			assert.equal(res.v, 1)
			assertClose(res.d, 1 - EULER_MASCHERONI, 1e-15)
		})

		it('computes small factorials 2! through 10! with exact values and analytic derivatives', () => {
			const exactFactorials = [1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880, 3628800]
			for (let n = 2; n <= 10; n++) {
				const res = factorialDualIterative({ v: n, d: 1 })
				assert.equal(res.v, exactFactorials[n])
				const expectedDer = exactFactorials[n] * (harmonicNumber(n) - EULER_MASCHERONI)
				assertClose(res.d, expectedDer, 1e-14)
			}
		})

		it('scales derivative linearly with arbitrary positive and negative d', () => {
			const base = factorialDualIterative({ v: 6, d: 1 })
			for (const scale of [-3.5, -1, 0.25, 2.5, 42]) {
				const scaled = factorialDualIterative({ v: 6, d: scale })
				assert.equal(scaled.v, base.v)
				assertClose(scaled.d, base.d * scale, 1e-14)
			}
		})
	})

	describe('edge cases', () => {
		it('returns +0 derivative (never -0) when d is 0 or -0', () => {
			for (const n of [0, 1, 5, 20, 170]) {
				const rPos = factorialDualIterative({ v: n, d: 0 })
				const rNeg = factorialDualIterative({ v: n, d: -0 })
				assert.ok(Object.is(rPos.d, 0), `Expected +0 for n=${n}, d=+0`)
				assert.ok(Object.is(rNeg.d, 0), `Expected +0 for n=${n}, d=-0`)
			}
		})

		it('accepts v = -0 as 0', () => {
			const res = factorialDualIterative({ v: -0, d: 1 })
			assert.equal(res.v, 1)
			assertClose(res.d, -EULER_MASCHERONI, 1e-15)
		})

		it('handles the maximum finite factorial input v = 170', () => {
			const res = factorialDualIterative({ v: 170, d: 1 })
			assert.ok(Number.isFinite(res.v))
			assert.ok(Number.isFinite(res.d))
			assertClose(res.v, 7.257415615307994e306, 1e-14)
			const expectedDer = res.v * (harmonicNumber(170) - EULER_MASCHERONI)
			assertClose(res.d, expectedDer, 1e-14)
		})

		it('preserves precision for tiny subnormal d without intermediate underflow', () => {
			const d = 1e-300
			const res = factorialDualIterative({ v: 5, d })
			assert.equal(res.v, 120)
			const expected = 120 * (harmonicNumber(5) - EULER_MASCHERONI) * d
			assertClose(res.d, expected, 1e-14, 0)
		})

		it('does not mutate the input object', () => {
			const input = Object.freeze({ v: 7, d: 2 })
			const res = factorialDualIterative(input)
			assert.equal(res.v, 5040)
			assert.equal(input.v, 7)
			assert.equal(input.d, 2)
		})
	})

	describe('invalid inputs', () => {
		it('throws TypeError for non-object, null, undefined, or array inputs', () => {
			for (const bad of [null, undefined, 5, '5', true, [5, 1], () => {}]) {
				assert.throws(() => factorialDualIterative(bad), TypeError)
			}
		})

		it('throws TypeError when v or d is missing or not a number', () => {
			const badInputs = [
				{},
				{ v: 3 },
				{ d: 1 },
				{ v: '3', d: 1 },
				{ v: 3, d: '1' },
				{ v: 3n, d: 1 },
				{ v: 3, d: null },
			]
			for (const bad of badInputs) {
				assert.throws(() => factorialDualIterative(bad), TypeError)
			}
		})

		it('throws RangeError for non-finite v or d (NaN, Infinity, -Infinity)', () => {
			const badInputs = [
				{ v: Number.NaN, d: 1 },
				{ v: 3, d: Number.NaN },
				{ v: Number.POSITIVE_INFINITY, d: 1 },
				{ v: Number.NEGATIVE_INFINITY, d: 1 },
				{ v: 3, d: Number.POSITIVE_INFINITY },
				{ v: 3, d: Number.NEGATIVE_INFINITY },
			]
			for (const bad of badInputs) {
				assert.throws(() => factorialDualIterative(bad), RangeError)
			}
		})

		it('throws RangeError for negative or non-integer v', () => {
			const badInputs = [
				{ v: -1, d: 1 },
				{ v: -10, d: 0 },
				{ v: 0.5, d: 1 },
				{ v: 3.14, d: 1 },
				{ v: -0.1, d: 1 },
			]
			for (const bad of badInputs) {
				assert.throws(() => factorialDualIterative(bad), RangeError)
			}
		})

		it('throws RangeError when v > 170 (overflows IEEE 754 double precision)', () => {
			assert.throws(() => factorialDualIterative({ v: 171, d: 1 }), RangeError)
			assert.throws(() => factorialDualIterative({ v: 1000, d: 0 }), RangeError)
		})
	})

	describe('independent cross-checks', () => {
		it('matches Lanczos Gamma(x + 1) and 4th-order central finite differences', () => {
			const f = (x) => gammaLanczos(x + 1)
			for (const n of [0, 1, 2, 3, 5, 8, 12, 15]) {
				const res = factorialDualIterative({ v: n, d: 1 })
				assertClose(res.v, f(n), 1e-12)
				const numDer = centralDiff4(f, n, 1e-4)
				assertClose(res.d, numDer, 1e-9)
			}
		})

		it('satisfies the harmonic number / digamma derivative identity across n = 0..50', () => {
			let fact = 1
			for (let n = 0; n <= 50; n++) {
				if (n > 0) fact *= n
				const res = factorialDualIterative({ v: n, d: 1 })
				assertClose(res.v, fact, 1e-14)
				const expectedDer = fact * (harmonicNumber(n) - EULER_MASCHERONI)
				assertClose(res.d, expectedDer, 1e-14)
			}
		})

		it('satisfies the dual recurrence (n + d*ε)! = (n + d*ε) * ((n - 1) + d*ε)!', () => {
			const d = 1.75
			for (let n = 1; n <= 30; n++) {
				const prev = factorialDualIterative({ v: n - 1, d })
				const curr = factorialDualIterative({ v: n, d })
				assert.equal(curr.v, n * prev.v)
				assertClose(curr.d, n * prev.d + prev.v * d, 1e-14)
			}
		})

		it('matches chain rule for composite g(t) = Gamma(t^2 + 1) at t = 2', () => {
			// At t = 2: u = t^2 = 4, u' = 2t = 4
			const res = factorialDualIterative({ v: 4, d: 4 })
			const g = (t) => gammaLanczos(t * t + 1)
			assertClose(res.v, g(2), 1e-12)
			assertClose(res.d, centralDiff4(g, 2, 1e-4), 1e-9)
		})
	})
})
