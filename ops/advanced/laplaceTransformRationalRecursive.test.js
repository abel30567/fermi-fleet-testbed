import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { laplaceTransformRationalRecursive } from './laplaceTransformRationalRecursive.js'

/** Helper to construct a rational literal concisely in tests. */
const Q = (num, den = 1n) => ({ num: BigInt(num), den: BigInt(den) })

/** Independent reference GCD for verification. */
function refGcd(a, b) {
	a = a < 0n ? -a : a
	b = b < 0n ? -b : b
	while (b !== 0n) {
		;[a, b] = [b, a % b]
	}
	return a
}

/** Independent naive iterative Laplace transform for exact cross-checking. */
function naiveLaplaceIterative(coeffs, s, shift = Q(0n)) {
	// u = s - shift
	const uNum = s.num * shift.den - shift.num * s.den
	const uDen = s.den * shift.den

	let totalNum = 0n
	let totalDen = 1n
	let fact = 1n
	let powUNum = uNum
	let powUDen = uDen

	for (let k = 0; k < coeffs.length; k++) {
		if (k > 0) {
			fact *= BigInt(k)
			powUNum *= uNum
			powUDen *= uDen
		}
		// term = coeffs[k] * k! / u^(k+1) = (c.num * fact * powUDen) / (c.den * powUNum)
		const termNum = coeffs[k].num * fact * powUDen
		const termDen = coeffs[k].den * powUNum

		const nextNum = totalNum * termDen + termNum * totalDen
		const nextDen = totalDen * termDen
		const g = refGcd(nextNum, nextDen)
		totalNum = nextNum / g
		totalDen = nextDen / g
		if (totalDen < 0n) {
			totalNum = -totalNum
			totalDen = -totalDen
		}
	}

	if (totalNum === 0n) return { num: 0n, den: 1n }
	const g = refGcd(totalNum, totalDen)
	let num = totalNum / g
	let den = totalDen / g
	if (den < 0n) {
		num = -num
		den = -den
	}
	return { num, den }
}

/** Exact rational helper for algebraic identity tests. */
function qAdd(a, b) {
	const num = a.num * b.den + b.num * a.den
	const den = a.den * b.den
	if (num === 0n) return { num: 0n, den: 1n }
	const g = refGcd(num, den)
	return den < 0n ? { num: -num / g, den: -den / g } : { num: num / g, den: den / g }
}

function qSub(a, b) {
	return qAdd(a, { num: -b.num, den: b.den })
}

function qMul(a, b) {
	const num = a.num * b.num
	const den = a.den * b.den
	if (num === 0n) return { num: 0n, den: 1n }
	const g = refGcd(num, den)
	return den < 0n ? { num: -num / g, den: -den / g } : { num: num / g, den: den / g }
}

describe('laplaceTransformRationalRecursive', () => {
	describe('normal cases', () => {
		it('computes L{1}(s) = 1/s for constant functions', () => {
			assert.deepEqual(laplaceTransformRationalRecursive([Q(1n)], Q(3n)), Q(1n, 3n))
			assert.deepEqual(laplaceTransformRationalRecursive([Q(5n, 2n)], Q(3n, 4n)), Q(10n, 3n))
		})

		it('computes L{t^n}(s) = n! / s^(n+1) for monomials', () => {
			// L{t}(2) = 1! / 2^2 = 1/4
			assert.deepEqual(laplaceTransformRationalRecursive([Q(0n), Q(1n)], Q(2n)), Q(1n, 4n))
			// L{t^3}(3) = 6 / 81 = 2/27
			assert.deepEqual(
				laplaceTransformRationalRecursive([Q(0n), Q(0n), Q(0n), Q(1n)], Q(3n)),
				Q(2n, 27n),
			)
			// L{t^5}(2) = 120 / 64 = 15/8
			assert.deepEqual(
				laplaceTransformRationalRecursive([Q(0n), Q(0n), Q(0n), Q(0n), Q(0n), Q(1n)], Q(2n)),
				Q(15n, 8n),
			)
		})

		it('computes Laplace transform of multi-term polynomials accurately', () => {
			// f(t) = 1 + 2t + 3t^2 at s = 2 => 1/2 + 2/4 + 6/8 = 7/4
			assert.deepEqual(laplaceTransformRationalRecursive([Q(1n), Q(2n), Q(3n)], Q(2n)), Q(7n, 4n))

			// f(t) = 1/3 - (2/5)t + (1/7)t^3 at s = 1 => 1/3 - 2/5 + 6/7 = 83/105
			assert.deepEqual(
				laplaceTransformRationalRecursive([Q(1n, 3n), Q(-2n, 5n), Q(0n), Q(1n, 7n)], Q(1n)),
				Q(83n, 105n),
			)
		})

		it('supports exponential frequency shifting L{e^(at) P(t)}(s) = L{P}(s - a)', () => {
			// f(t) = e^((1/2)t) * (1/3 - (2/5)t + (1/7)t^3) at s = 3/2 => u = 1 => 83/105
			const res = laplaceTransformRationalRecursive(
				[Q(1n, 3n), Q(-2n, 5n), Q(0n), Q(1n, 7n)],
				Q(3n, 2n),
				Q(1n, 2n),
			)
			assert.deepEqual(res, Q(83n, 105n))

			// Negative shift allows negative s as long as s > shift:
			// shift = -5, s = -2 => u = 3; L{e^(-5t) * (1 + t)}(-2) = 1/3 + 1/9 = 4/9
			assert.deepEqual(
				laplaceTransformRationalRecursive([Q(1n), Q(1n)], Q(-2n), Q(-5n)),
				Q(4n, 9n),
			)
		})
	})

	describe('edge cases and normalization', () => {
		it('handles empty and all-zero polynomials', () => {
			assert.deepEqual(laplaceTransformRationalRecursive([], Q(5n)), Q(0n, 1n))
			assert.deepEqual(laplaceTransformRationalRecursive([Q(0n), Q(0n), Q(0n)], Q(2n, 3n)), Q(0n, 1n))
		})

		it('handles exact cancellation to zero with normalized { num: 0n, den: 1n }', () => {
			// f(t) = -1 + 2t at s = 2 => -1/2 + 2/4 = 0/1
			const res = laplaceTransformRationalRecursive([Q(-1n), Q(2n)], Q(2n))
			assert.deepEqual(res, { num: 0n, den: 1n })
		})

		it('normalizes unreduced inputs and negative denominators in inputs', () => {
			// coeffs = [2/4, -6/-3] = [1/2, 2], s = -10/-5 = 2, shift = 0/-7 = 0
			// L{1/2 + 2t}(2) = (1/2)/2 + 2/4 = 1/4 + 1/2 = 3/4
			const res = laplaceTransformRationalRecursive(
				[{ num: 2n, den: 4n }, { num: -6n, den: -3n }],
				{ num: -10n, den: -5n },
				{ num: 0n, den: -7n },
			)
			assert.deepEqual(res, { num: 3n, den: 4n })
			assert.ok(res.den > 0n)
			assert.equal(refGcd(res.num, res.den), 1n)
		})

		it('handles negative transform outputs with positive denominator', () => {
			// f(t) = -3 - t at s = 2 => -3/2 - 1/4 = -7/4
			const res = laplaceTransformRationalRecursive([Q(-3n), Q(-1n)], Q(2n))
			assert.deepEqual(res, { num: -7n, den: 4n })
			assert.ok(res.den > 0n)
		})

		it('preserves exact BigInt precision for high-degree polynomials and large rationals', () => {
			// Degree 30 polynomial with BigInt coefficients exceeding Number.MAX_SAFE_INTEGER
			const big = 10n ** 30n + 7n
			const coeffs = Array.from({ length: 31 }, (_, k) =>
				k % 2 === 0 ? Q(big + BigInt(k), BigInt(k + 3)) : Q(-(big - BigInt(k)), BigInt(k + 5)),
			)
			const s = Q(17n, 3n)
			const shift = Q(2n, 3n)

			const actual = laplaceTransformRationalRecursive(coeffs, s, shift)
			const expected = naiveLaplaceIterative(coeffs, s, shift)

			assert.deepEqual(actual, expected)
			assert.ok(actual.den > 0n)
			assert.equal(refGcd(actual.num, actual.den), 1n)
		})
	})

	describe('independent mathematical cross-checks', () => {
		it('matches naive iterative Laplace implementation across varied degrees and shifts', () => {
			const cases = [
				{ coeffs: [Q(7n, 11n)], s: Q(13n, 5n), shift: Q(0n) },
				{ coeffs: [Q(1n), Q(-1n), Q(1n), Q(-1n), Q(1n)], s: Q(3n, 2n), shift: Q(1n, 4n) },
				{
					coeffs: Array.from({ length: 16 }, (_, k) => Q(BigInt((k % 5) - 2), BigInt(k + 1))),
					s: Q(5n, 3n),
					shift: Q(-1n, 3n),
				},
				{
					coeffs: Array.from({ length: 17 }, (_, k) => Q(BigInt(k * k + 1), BigInt(2 * k + 1))),
					s: Q(7n, 2n),
					shift: Q(3n, 2n),
				},
			]

			for (const { coeffs, s, shift } of cases) {
				const actual = laplaceTransformRationalRecursive(coeffs, s, shift)
				const expected = naiveLaplaceIterative(coeffs, s, shift)
				assert.deepEqual(actual, expected)
				assert.ok(actual.den > 0n)
				assert.equal(refGcd(actual.num, actual.den), 1n)
			}
		})

		it('satisfies linearity: L{alpha*f + beta*g}(s) = alpha*L{f}(s) + beta*L{g}(s)', () => {
			const f = [Q(3n, 4n), Q(-2n, 5n), Q(7n, 6n), Q(1n, 2n)]
			const g = [Q(-1n, 3n), Q(4n, 7n), Q(-5n, 8n), Q(9n, 10n)]
			const alpha = Q(5n, 3n)
			const beta = Q(-7n, 4n)
			const s = Q(11n, 4n)

			const combined = f.map((cf, i) => qAdd(qMul(alpha, cf), qMul(beta, g[i])))
			const lhs = laplaceTransformRationalRecursive(combined, s)
			const rhs = qAdd(
				qMul(alpha, laplaceTransformRationalRecursive(f, s)),
				qMul(beta, laplaceTransformRationalRecursive(g, s)),
			)
			assert.deepEqual(lhs, rhs)
		})

		it('satisfies the time-derivative theorem: L{f\'}(s) = s*L{f}(s) - f(0)', () => {
			const f = [Q(5n, 3n), Q(-7n, 4n), Q(2n, 9n), Q(11n, 6n), Q(-3n, 5n), Q(4n, 7n)]
			// f'(t) = sum_{k=1}^{n} (k * c_k) * t^(k-1)
			const df = f.slice(1).map((c, idx) => qMul(Q(BigInt(idx + 1)), c))
			const s = Q(13n, 5n)

			const lhs = laplaceTransformRationalRecursive(df, s)
			const rhs = qSub(qMul(s, laplaceTransformRationalRecursive(f, s)), f[0])
			assert.deepEqual(lhs, rhs)
		})

		it('satisfies the time-scaling theorem: L{f(lambda*t)}(s) = (1/lambda) * L{f(t)}(s/lambda)', () => {
			const f = [Q(2n, 3n), Q(-5n, 7n), Q(11n, 13n), Q(-1n, 4n)]
			const lambda = Q(3n, 2n)
			const s = Q(9n, 2n)

			// Coefficients of f(lambda * t) are c_k * lambda^k
			let lamPow = Q(1n)
			const scaled = f.map((c) => {
				const out = qMul(c, lamPow)
				lamPow = qMul(lamPow, lambda)
				return out
			})

			const lhs = laplaceTransformRationalRecursive(scaled, s)
			const sOverLambda = qMul(s, { num: lambda.den, den: lambda.num })
			const invLambda = { num: lambda.den, den: lambda.num }
			const rhs = qMul(invLambda, laplaceTransformRationalRecursive(f, sOverLambda))
			assert.deepEqual(lhs, rhs)
		})

		it('matches numerical Simpson integration of int_0^1 u^(s-1) f(-ln u) du', () => {
			// Substitution u = exp(-t) maps int_0^inf exp(-s*t) f(t) dt to int_0^1 u^(s-1) f(-ln u) du
			// For f(t) = 1 + 2t - t^2/2 and s = 4, integrand u^3 * (1 - 2*ln(u) - 0.5*(ln u)^2) vanishes at u=0.
			const coeffs = [Q(1n), Q(2n), Q(-1n, 2n)]
			const s = Q(4n)
			const exact = laplaceTransformRationalRecursive(coeffs, s)
			const exactFloat = Number(exact.num) / Number(exact.den)

			const N = 2000
			const h = 1 / N
			const integrand = (u) => {
				if (u === 0) return 0
				const t = -Math.log(u)
				return u ** 3 * (1 + 2 * t - 0.5 * t * t)
			}
			let sum = integrand(0) + integrand(1)
			for (let i = 1; i < N; i++) {
				sum += (i % 2 === 0 ? 2 : 4) * integrand(i * h)
			}
			const numeric = (h / 3) * sum

			assert.ok(
				Math.abs(exactFloat - numeric) < 1e-9,
				`Expected ${exactFloat} to match numerical integral ${numeric}`,
			)
		})
	})

	describe('invalid inputs', () => {
		it('throws TypeError when coeffs is not an array', () => {
			assert.throws(() => laplaceTransformRationalRecursive(null, Q(2n)), TypeError)
			assert.throws(() => laplaceTransformRationalRecursive('123', Q(2n)), TypeError)
			assert.throws(() => laplaceTransformRationalRecursive(Q(1n), Q(2n)), TypeError)
		})

		it('throws TypeError for non-rational or non-BigInt entries', () => {
			assert.throws(() => laplaceTransformRationalRecursive([{ num: 1, den: 1n }], Q(2n)), TypeError)
			assert.throws(() => laplaceTransformRationalRecursive([{ num: 1n, den: 1 }], Q(2n)), TypeError)
			assert.throws(() => laplaceTransformRationalRecursive([null], Q(2n)), TypeError)
			assert.throws(() => laplaceTransformRationalRecursive([Q(1n)], { num: 2, den: 1n }), TypeError)
			assert.throws(() => laplaceTransformRationalRecursive([Q(1n)], Q(2n), null), TypeError)
			// Sparse array hole
			const sparse = new Array(2)
			sparse[0] = Q(1n)
			assert.throws(() => laplaceTransformRationalRecursive(sparse, Q(2n)), TypeError)
		})

		it('throws RangeError for zero denominators', () => {
			assert.throws(() => laplaceTransformRationalRecursive([Q(1n, 0n)], Q(2n)), RangeError)
			assert.throws(() => laplaceTransformRationalRecursive([Q(1n)], Q(2n, 0n)), RangeError)
			assert.throws(() => laplaceTransformRationalRecursive([Q(1n)], Q(2n), Q(0n, 0n)), RangeError)
		})

		it('throws RangeError when s <= shift (divergent integral)', () => {
			assert.throws(() => laplaceTransformRationalRecursive([Q(1n)], Q(0n)), RangeError)
			assert.throws(() => laplaceTransformRationalRecursive([Q(1n)], Q(-1n, 2n)), RangeError)
			assert.throws(() => laplaceTransformRationalRecursive([Q(1n)], Q(3n, 2n), Q(3n, 2n)), RangeError)
			assert.throws(() => laplaceTransformRationalRecursive([Q(1n)], Q(1n), Q(2n)), RangeError)
			assert.throws(() => laplaceTransformRationalRecursive([], Q(0n)), RangeError)
		})
	})
})
