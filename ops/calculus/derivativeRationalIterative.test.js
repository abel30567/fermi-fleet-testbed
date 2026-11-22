import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { derivativeRationalIterative } from './derivativeRationalIterative.js'

// --- Independent exact rational helpers for testing and cross-checks ---

function gcd(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const r = x % y
		x = y
		y = r
	}
	return x
}

function rat(num, den = 1n) {
	if (den === 0n) throw new Error('Zero denominator in test helper')
	if (num === 0n) return { num: 0n, den: 1n }
	let n = num
	let d = den
	if (d < 0n) {
		n = -n
		d = -d
	}
	const g = gcd(n, d)
	return { num: n / g, den: d / g }
}

function ratAdd(a, b) {
	return rat(a.num * b.den + b.num * a.den, a.den * b.den)
}

function ratSub(a, b) {
	return rat(a.num * b.den - b.num * a.den, a.den * b.den)
}

function ratMul(a, b) {
	return rat(a.num * b.num, a.den * b.den)
}

function ratDiv(a, b) {
	return rat(a.num * b.den, a.den * b.num)
}

function evalPoly(coeffs, x) {
	let acc = rat(0n, 1n)
	for (let i = coeffs.length - 1; i >= 0; i--) {
		acc = ratAdd(ratMul(acc, x), coeffs[i])
	}
	return acc
}

function polyTrim(p) {
	const out = p.slice()
	while (out.length > 1 && out[out.length - 1].num === 0n) {
		out.pop()
	}
	return out
}

function polyAdd(f, g) {
	const len = Math.max(f.length, g.length)
	const out = new Array(len)
	for (let i = 0; i < len; i++) {
		const a = i < f.length ? f[i] : rat(0n, 1n)
		const b = i < g.length ? g[i] : rat(0n, 1n)
		out[i] = ratAdd(a, b)
	}
	return polyTrim(out)
}

function polyMul(f, g) {
	const out = Array.from({ length: f.length + g.length - 1 }, () => rat(0n, 1n))
	for (let i = 0; i < f.length; i++) {
		for (let j = 0; j < g.length; j++) {
			out[i + j] = ratAdd(out[i + j], ratMul(f[i], g[j]))
		}
	}
	return polyTrim(out)
}

function assertLowestTerms(poly) {
	for (const c of poly) {
		assert.equal(typeof c.num, 'bigint')
		assert.equal(typeof c.den, 'bigint')
		assert.ok(c.den > 0n, `expected den > 0n, got ${c.den}`)
		if (c.num === 0n) {
			assert.equal(c.den, 1n)
		} else {
			assert.equal(gcd(c.num, c.den), 1n)
		}
	}
}

function fallingFactorial(n, k) {
	let prod = 1n
	for (let i = 0; i < k; i++) {
		prod *= BigInt(n - i)
	}
	return prod
}

describe('derivativeRationalIterative', () => {
	describe('normal cases', () => {
		it('differentiates constant polynomials to zero', () => {
			assert.deepEqual(derivativeRationalIterative([rat(5n)]), [rat(0n)])
			assert.deepEqual(derivativeRationalIterative([rat(0n)]), [rat(0n)])
			assert.deepEqual(derivativeRationalIterative([rat(-7n, 3n)]), [rat(0n)])
		})

		it('differentiates linear polynomials', () => {
			// p(x) = 3/2 - (4/5)x => p'(x) = -4/5
			const p = [rat(3n, 2n), rat(-4n, 5n)]
			const dp = derivativeRationalIterative(p)
			assert.deepEqual(dp, [rat(-4n, 5n)])
			assertLowestTerms(dp)
		})

		it('differentiates quadratic polynomials and reduces fractions', () => {
			// p(x) = 1/3 + (5/7)x + (3/4)x^2 => p'(x) = 5/7 + (3/2)x
			const p = [rat(1n, 3n), rat(5n, 7n), rat(3n, 4n)]
			const dp = derivativeRationalIterative(p)
			assert.deepEqual(dp, [rat(5n, 7n), rat(3n, 2n)])
			assertLowestTerms(dp)
		})

		it('differentiates higher-degree polynomials with negative and fractional coefficients', () => {
			// p(x) = -2/9 + 0*x + (1/6)x^2 - (5/6)x^3 + (7/12)x^4 - (11/15)x^5
			// p'(x) = 0 + (1/3)x - (5/2)x^2 + (7/3)x^3 - (11/3)x^4
			const p = [
				rat(-2n, 9n),
				rat(0n, 1n),
				rat(1n, 6n),
				rat(-5n, 6n),
				rat(7n, 12n),
				rat(-11n, 15n),
			]
			const dp = derivativeRationalIterative(p)
			assert.deepEqual(dp, [
				rat(0n, 1n),
				rat(1n, 3n),
				rat(-5n, 2n),
				rat(7n, 3n),
				rat(-11n, 3n),
			])
			assertLowestTerms(dp)
		})
	})

	describe('higher-order derivatives', () => {
		const cubic = [rat(2n, 5n), rat(-3n, 4n), rat(5n, 6n), rat(-7n, 18n)]

		it('order 0 returns normalized copy without mutating input', () => {
			const unreduced = [
				{ num: 4n, den: -6n },
				{ num: 0n, den: -5n },
				{ num: 9n, den: 12n },
			]
			const out = derivativeRationalIterative(unreduced, 0)
			assert.deepEqual(out, [rat(-2n, 3n), rat(0n, 1n), rat(3n, 4n)])
			assertLowestTerms(out)
			// Original objects untouched
			assert.deepEqual(unreduced[0], { num: 4n, den: -6n })
			assert.notEqual(out, unreduced)
			assert.notEqual(out[0], unreduced[0])
		})

		it('computes 1st, 2nd, 3rd derivatives and zero for order > degree', () => {
			// p(x)   = 2/5 - 3/4 x + 5/6 x^2 - 7/18 x^3
			// p'(x)  = -3/4 + 5/3 x - 7/6 x^2
			// p''(x) = 5/3 - 7/3 x
			// p'''(x)= -7/3
			// p^(4)  = 0
			assert.deepEqual(derivativeRationalIterative(cubic, 1), [
				rat(-3n, 4n),
				rat(5n, 3n),
				rat(-7n, 6n),
			])
			assert.deepEqual(derivativeRationalIterative(cubic, 2), [
				rat(5n, 3n),
				rat(-7n, 3n),
			])
			assert.deepEqual(derivativeRationalIterative(cubic, 3), [rat(-7n, 3n)])
			assert.deepEqual(derivativeRationalIterative(cubic, 4), [rat(0n, 1n)])
			assert.deepEqual(derivativeRationalIterative(cubic, 1_000_000), [rat(0n, 1n)])
		})
	})

	describe('edge cases', () => {
		it('handles trailing zero coefficients consistently', () => {
			// p(x) = 5 + 0x + 0x^2 is constant 5
			assert.deepEqual(
				derivativeRationalIterative([rat(5n), rat(0n), rat(0n)], 1),
				[rat(0n)]
			)
			// p(x) = 1 + 2x + 0x^2 => p'(x) = 2
			assert.deepEqual(
				derivativeRationalIterative([rat(1n), rat(2n), rat(0n)], 1),
				[rat(2n)]
			)
			// Zero polynomial with multiple zero terms
			assert.deepEqual(
				derivativeRationalIterative([rat(0n), rat(0n)], 0),
				[rat(0n)]
			)
		})

		it('normalizes unreduced inputs and negative denominators during differentiation', () => {
			// p(x) = (2/-4) + (6/-9)x + (-10/-15)x^2 = -1/2 - 2/3 x + 2/3 x^2
			// p'(x) = -2/3 + 4/3 x
			const p = [
				{ num: 2n, den: -4n },
				{ num: 6n, den: -9n },
				{ num: -10n, den: -15n },
			]
			const dp = derivativeRationalIterative(p)
			assert.deepEqual(dp, [rat(-2n, 3n), rat(4n, 3n)])
			assertLowestTerms(dp)
		})

		it('handles arbitrarily large BigInt rationals without precision loss', () => {
			const bigNum = 10n ** 40n + 7n
			const bigDen = 10n ** 35n + 3n
			const p = [rat(1n, 1n), rat(0n, 1n), { num: bigNum, den: bigDen }]
			const dp = derivativeRationalIterative(p, 2)
			assert.deepEqual(dp, [rat(2n * bigNum, bigDen)])
			assertLowestTerms(dp)
		})
	})

	describe('invalid input handling', () => {
		it('throws TypeError when coeffs is not an array', () => {
			for (const bad of [null, undefined, 42, 'abc', {}, { num: 1n, den: 1n }]) {
				assert.throws(() => derivativeRationalIterative(bad), TypeError)
			}
		})

		it('throws RangeError when coeffs is empty', () => {
			assert.throws(() => derivativeRationalIterative([]), RangeError)
		})

		it('throws TypeError for malformed rational elements', () => {
			assert.throws(() => derivativeRationalIterative([null]), TypeError)
			assert.throws(() => derivativeRationalIterative([undefined]), TypeError)
			assert.throws(() => derivativeRationalIterative([5n]), TypeError)
			assert.throws(() => derivativeRationalIterative([{ num: 1, den: 2 }]), TypeError)
			assert.throws(() => derivativeRationalIterative([{ num: 1n, den: 2 }]), TypeError)
			assert.throws(() => derivativeRationalIterative([{ num: 1n }]), TypeError)
		})

		it('throws RangeError for zero denominators', () => {
			assert.throws(() => derivativeRationalIterative([{ num: 1n, den: 0n }]), RangeError)
			assert.throws(() => derivativeRationalIterative([{ num: 0n, den: 0n }]), RangeError)
			assert.throws(
				() => derivativeRationalIterative([rat(1n), { num: -3n, den: 0n }], 0),
				RangeError
			)
		})

		it('throws TypeError or RangeError for invalid order values', () => {
			const p = [rat(1n), rat(2n)]
			for (const badType of ['1', null, 1n, {}, true, NaN]) {
				assert.throws(() => derivativeRationalIterative(p, badType), TypeError)
			}
			for (const badRange of [-1, -100, 1.5, 0.1, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
				assert.throws(() => derivativeRationalIterative(p, badRange), RangeError)
			}
		})
	})

	describe('mathematical cross-checks', () => {
		it('matches exact central difference quotient (p(x+h) - p(x-h)) / (2h) for quadratics', () => {
			// For any quadratic p(x) = c0 + c1*x + c2*x^2, the central difference quotient
			// is algebraically identical to p'(x) for every x and every h != 0.
			const quadratics = [
				[rat(3n, 7n), rat(-5n, 11n), rat(13n, 17n)],
				[rat(-100n, 3n), rat(0n, 1n), rat(-9n, 4n)],
				[rat(1n, 2n), rat(1n, 3n), rat(1n, 6n)],
			]
			const xs = [rat(0n), rat(1n), rat(-5n, 3n), rat(19n, 7n)]
			const hs = [rat(1n, 2n), rat(3n, 11n), rat(-7n, 13n)]

			for (const p of quadratics) {
				const dp = derivativeRationalIterative(p)
				for (const x of xs) {
					const expected = evalPoly(dp, x)
					for (const h of hs) {
						const num = ratSub(evalPoly(p, ratAdd(x, h)), evalPoly(p, ratSub(x, h)))
						const den = ratMul(rat(2n), h)
						const quotient = ratDiv(num, den)
						assert.deepEqual(quotient, expected)
					}
				}
			}
		})

		it('satisfies the exact product rule (f * g)\' = f\' * g + f * g\'', () => {
			const pairs = [
				[
					[rat(1n, 2n), rat(-3n, 4n), rat(5n, 6n)],
					[rat(-7n, 3n), rat(2n, 5n), rat(-1n, 7n), rat(4n, 9n)],
				],
				[
					[rat(9n, 11n)],
					[rat(2n, 3n), rat(-5n, 8n), rat(7n, 10n)],
				],
				[
					[rat(0n), rat(0n), rat(3n, 5n), rat(-2n, 7n)],
					[rat(1n), rat(-1n), rat(1n), rat(-1n)],
				],
			]

			for (const [f, g] of pairs) {
				const fg = polyMul(f, g)
				const lhs = derivativeRationalIterative(fg)

				const df = derivativeRationalIterative(f)
				const dg = derivativeRationalIterative(g)
				const rhs = polyAdd(polyMul(df, g), polyMul(f, dg))

				assert.deepEqual(lhs, rhs)
			}
		})

		it('matches closed-form falling-factorial formula for k-th derivatives', () => {
			const p = [
				rat(3n, 5n),
				rat(-2n, 7n),
				rat(11n, 12n),
				rat(-5n, 9n),
				rat(7n, 16n),
				rat(-13n, 20n),
				rat(17n, 18n),
			]
			for (let k = 0; k <= p.length + 2; k++) {
				const actual = derivativeRationalIterative(p, k)
				let expected
				if (k >= p.length) {
					expected = [rat(0n)]
				} else {
					expected = []
					for (let j = 0; j < p.length - k; j++) {
						const c = p[j + k]
						const factor = fallingFactorial(j + k, k)
						expected.push(rat(c.num * factor, c.den))
					}
					expected = polyTrim(expected)
				}
				assert.deepEqual(actual, expected)
				assertLowestTerms(actual)
			}
		})
	})
})
