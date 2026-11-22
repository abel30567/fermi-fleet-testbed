import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { dotProductRationalSeries } from './dotProductRationalSeries.js'

const r = (num, den = 1n) => ({ num: BigInt(num), den: BigInt(den) })

function gcd(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const t = x % y
		x = y
		y = t
	}
	return x
}

function assertLowestTerms(q) {
	assert.equal(typeof q.num, 'bigint', 'num must be a BigInt')
	assert.equal(typeof q.den, 'bigint', 'den must be a BigInt')
	assert.ok(q.den > 0n, `den must be > 0n, got ${q.den}`)
	if (q.num === 0n) {
		assert.equal(q.den, 1n, 'zero must be represented as { num: 0n, den: 1n }')
	} else {
		assert.equal(gcd(q.num, q.den), 1n, `result ${q.num}/${q.den} must be in lowest terms`)
	}
}

function mulQ(a, b) {
	const num = a.num * b.num
	const den = a.den * b.den
	if (num === 0n) return { num: 0n, den: 1n }
	const sNum = den < 0n ? -num : num
	const sDen = den < 0n ? -den : den
	const g = gcd(sNum, sDen)
	return { num: sNum / g, den: sDen / g }
}

function addQ(a, b) {
	const num = a.num * b.den + b.num * a.den
	const den = a.den * b.den
	if (num === 0n) return { num: 0n, den: 1n }
	const g = gcd(num, den)
	return { num: num / g, den: den / g }
}

function subQ(a, b) {
	return addQ(a, { num: -b.num, den: b.den })
}

function scaleVec(scalar, v) {
	return v.map((x) => mulQ(scalar, x))
}

function addVec(u, v) {
	return u.map((x, i) => addQ(x, v[i]))
}

function subVec(u, v) {
	return u.map((x, i) => subQ(x, v[i]))
}

function compareQ(a, b) {
	const lhs = a.num * b.den
	const rhs = b.num * a.den
	return lhs < rhs ? -1 : lhs > rhs ? 1 : 0
}

describe('dotProductRationalSeries', () => {
	describe('normal cases', () => {
		test('integer-valued rational vectors', () => {
			const res = dotProductRationalSeries([r(1), r(2), r(3)], [r(4), r(5), r(6)])
			assertLowestTerms(res)
			assert.deepEqual(res, { num: 32n, den: 1n })
		})

		test('fractional rational vectors with cross-cancellation and reduction', () => {
			// (1/2)*(2/3) + (2/3)*(3/4) + (3/4)*(4/5) = 1/3 + 1/2 + 3/5 = 43/30
			const a = [r(1, 2), r(2, 3), r(3, 4)]
			const b = [r(2, 3), r(3, 4), r(4, 5)]
			const res = dotProductRationalSeries(a, b)
			assertLowestTerms(res)
			assert.deepEqual(res, { num: 43n, den: 30n })
		})

		test('single-element vectors', () => {
			const res = dotProductRationalSeries([r(7, 15)], [r(10, 21)])
			assertLowestTerms(res)
			assert.deepEqual(res, { num: 2n, den: 9n })
		})

		test('unreduced inputs and negative denominators are normalized properly', () => {
			// (2/4)*(-4/2) + (3/-6)*(6/3) = (1/2)*(-2) + (-1/2)*(2) = -1 + (-1) = -2
			const a = [r(2, 4), r(3, -6)]
			const b = [r(-4, 2), r(6, 3)]
			const res = dotProductRationalSeries(a, b)
			assertLowestTerms(res)
			assert.deepEqual(res, { num: -2n, den: 1n })
		})

		test('large BigInt numerators and denominators without precision loss', () => {
			const big = 10n ** 30n
			const a = [
				{ num: big + 1n, den: 3n },
				{ num: 1n, den: big },
			]
			const b = [
				{ num: 3n, den: big + 1n },
				{ num: big, den: 1n },
			]
			// 1 + 1 = 2
			const res = dotProductRationalSeries(a, b)
			assertLowestTerms(res)
			assert.deepEqual(res, { num: 2n, den: 1n })

			const a2 = [
				{ num: big + 1n, den: 1n },
				{ num: -big, den: 1n },
			]
			const b2 = [
				{ num: big + 1n, den: 1n },
				{ num: big, den: 1n },
			]
			// (big + 1)^2 - big^2 = 2*big + 1
			const res2 = dotProductRationalSeries(a2, b2)
			assertLowestTerms(res2)
			assert.deepEqual(res2, { num: 2n * big + 1n, den: 1n })
		})
	})

	describe('edge cases', () => {
		test('empty vectors return exact zero { num: 0n, den: 1n }', () => {
			const res = dotProductRationalSeries([], [])
			assertLowestTerms(res)
			assert.deepEqual(res, { num: 0n, den: 1n })
		})

		test('zero vectors return exact zero', () => {
			const z = [r(0, 1), r(0, 7), r(0, -5)]
			const v = [r(5, 3), r(-11, 4), r(2, 9)]
			assert.deepEqual(dotProductRationalSeries(z, z), { num: 0n, den: 1n })
			assert.deepEqual(dotProductRationalSeries(z, v), { num: 0n, den: 1n })
			assert.deepEqual(dotProductRationalSeries(v, z), { num: 0n, den: 1n })
		})

		test('negative vectors', () => {
			const negA = [r(-1, 2), r(-3, 4), r(-5, 6)]
			const negB = [r(-2, 5), r(-4, 9), r(-6, 7)]
			// 1/5 + 1/3 + 5/7 = (21 + 35 + 75) / 105 = 131/105
			const posRes = dotProductRationalSeries(negA, negB)
			assertLowestTerms(posRes)
			assert.deepEqual(posRes, { num: 131n, den: 105n })

			const posB = [r(2, 5), r(4, 9), r(6, 7)]
			const negRes = dotProductRationalSeries(negA, posB)
			assertLowestTerms(negRes)
			assert.deepEqual(negRes, { num: -131n, den: 105n })
		})

		test('orthogonal vectors cancel to exact zero { num: 0n, den: 1n }', () => {
			// Standard basis vectors in R^3
			const e1 = [r(1), r(0), r(0)]
			const e2 = [r(0), r(1), r(0)]
			assert.deepEqual(dotProductRationalSeries(e1, e2), { num: 0n, den: 1n })

			// Non-trivial fractional orthogonal vectors:
			// (1/2)*(2/3) + (-1/3)*(1) + (5/7)*(0) = 1/3 - 1/3 + 0 = 0
			const u = [r(1, 2), r(-1, 3), r(5, 7)]
			const v = [r(2, 3), r(1, 1), r(0, 1)]
			const res1 = dotProductRationalSeries(u, v)
			assertLowestTerms(res1)
			assert.deepEqual(res1, { num: 0n, den: 1n })

			// 4D orthogonal vectors with all non-zero components:
			// (1/2)*(2/5) + (3/4)*(-4/15) + (-7/6)*(3/7) + (5/8)*(4/5)
			// = 1/5 - 1/5 - 1/2 + 1/2 = 0
			const p = [r(1, 2), r(3, 4), r(-7, 6), r(5, 8)]
			const q = [r(2, 5), r(-4, 15), r(3, 7), r(4, 5)]
			const res2 = dotProductRationalSeries(p, q)
			assertLowestTerms(res2)
			assert.deepEqual(res2, { num: 0n, den: 1n })
		})

		test('intermediate sum hits zero then accumulates further terms', () => {
			// 1/2 + (-1/2) + 3/7 = 3/7
			const a = [r(1, 2), r(-1, 2), r(3, 7)]
			const b = [r(1), r(1), r(1)]
			const res = dotProductRationalSeries(a, b)
			assertLowestTerms(res)
			assert.deepEqual(res, { num: 3n, den: 7n })
		})
	})

	describe('input validation', () => {
		test('throws TypeError when a or b is not an array', () => {
			assert.throws(() => dotProductRationalSeries(null, []), TypeError)
			assert.throws(() => dotProductRationalSeries([], null), TypeError)
			assert.throws(() => dotProductRationalSeries(undefined, []), TypeError)
			assert.throws(() => dotProductRationalSeries([], undefined), TypeError)
			assert.throws(() => dotProductRationalSeries('abc', [r(1), r(2), r(3)]), TypeError)
			assert.throws(() => dotProductRationalSeries([r(1)], { num: 1n, den: 1n }), TypeError)
			assert.throws(() => dotProductRationalSeries(42, []), TypeError)
		})

		test('throws RangeError when vector lengths do not match', () => {
			assert.throws(() => dotProductRationalSeries([r(1)], []), RangeError)
			assert.throws(() => dotProductRationalSeries([], [r(1)]), RangeError)
			assert.throws(() => dotProductRationalSeries([r(1), r(2)], [r(1), r(2), r(3)]), RangeError)
		})

		test('throws TypeError on invalid rational elements', () => {
			assert.throws(() => dotProductRationalSeries([null], [r(1)]), TypeError)
			assert.throws(() => dotProductRationalSeries([r(1)], [undefined]), TypeError)
			assert.throws(() => dotProductRationalSeries([[1n, 2n]], [r(1)]), TypeError)
			assert.throws(() => dotProductRationalSeries([{ num: 1, den: 2n }], [r(1)]), TypeError)
			assert.throws(() => dotProductRationalSeries([r(1)], [{ num: 1n, den: 2 }]), TypeError)
			assert.throws(() => dotProductRationalSeries([{ num: 1n }], [r(1)]), TypeError)
			assert.throws(() => dotProductRationalSeries([r(1)], [123]), TypeError)
		})

		test('throws TypeError on sparse array holes', () => {
			const sparse = new Array(2)
			sparse[0] = r(1)
			assert.throws(() => dotProductRationalSeries(sparse, [r(1), r(2)]), TypeError)
			assert.throws(() => dotProductRationalSeries([r(1), r(2)], sparse), TypeError)
		})

		test('throws RangeError on zero denominator, even when paired with zero', () => {
			assert.throws(() => dotProductRationalSeries([{ num: 1n, den: 0n }], [r(1)]), RangeError)
			assert.throws(() => dotProductRationalSeries([r(1)], [{ num: 0n, den: 0n }]), RangeError)
			// Must validate partner element even if one element has num === 0n
			assert.throws(() => dotProductRationalSeries([r(0)], [{ num: 1n, den: 0n }]), RangeError)
			assert.throws(() => dotProductRationalSeries([{ num: 1n, den: 0n }], [r(0)]), RangeError)
		})
	})

	describe('independent cross-checks and algebraic identities', () => {
		test('matches floating-point dot product within tight tolerance', () => {
			const a = [r(13, 17), r(-29, 41), r(7, 19), r(-5, 23), r(11, 31)]
			const b = [r(-3, 11), r(17, 13), r(-23, 29), r(37, 7), r(-2, 5)]

			const exact = dotProductRationalSeries(a, b)
			assertLowestTerms(exact)

			const floatExact = Number(exact.num) / Number(exact.den)
			const floatDot = a.reduce(
				(sum, ai, i) => sum + (Number(ai.num) / Number(ai.den)) * (Number(b[i].num) / Number(b[i].den)),
				0,
			)
			assert.ok(
				Math.abs(floatExact - floatDot) < 1e-12,
				`Expected ${floatExact} to match floating-point ${floatDot} within 1e-12`,
			)
		})

		test('symmetry and exact bilinearity identities', () => {
			const a = [r(3, 5), r(-7, 11), r(2, 3), r(5, 8)]
			const b = [r(-1, 4), r(9, 7), r(-5, 6), r(11, 13)]
			const c = [r(4, 9), r(2, 5), r(7, 12), r(-3, 4)]
			const alpha = r(5, 7)
			const beta = r(-3, 4)

			// Symmetry: <a, b> = <b, a>
			assert.deepEqual(dotProductRationalSeries(a, b), dotProductRationalSeries(b, a))

			// Linearity in first argument: <alpha*a + beta*b, c> = alpha*<a, c> + beta*<b, c>
			const lhs1 = dotProductRationalSeries(addVec(scaleVec(alpha, a), scaleVec(beta, b)), c)
			const rhs1 = addQ(
				mulQ(alpha, dotProductRationalSeries(a, c)),
				mulQ(beta, dotProductRationalSeries(b, c)),
			)
			assertLowestTerms(lhs1)
			assert.deepEqual(lhs1, rhs1)

			// Linearity in second argument: <c, alpha*a + beta*b> = alpha*<c, a> + beta*<c, b>
			const lhs2 = dotProductRationalSeries(c, addVec(scaleVec(alpha, a), scaleVec(beta, b)))
			const rhs2 = addQ(
				mulQ(alpha, dotProductRationalSeries(c, a)),
				mulQ(beta, dotProductRationalSeries(c, b)),
			)
			assertLowestTerms(lhs2)
			assert.deepEqual(lhs2, rhs2)
		})

		test('Cauchy-Schwarz inequality (strict for independent, equality for collinear)', () => {
			const a = [r(2, 3), r(-5, 7), r(11, 13), r(-1, 2)]
			const b = [r(-3, 5), r(4, 9), r(2, 11), r(7, 8)]

			const ab = dotProductRationalSeries(a, b)
			const aa = dotProductRationalSeries(a, a)
			const bb = dotProductRationalSeries(b, b)

			// Positive-definiteness
			assert.ok(compareQ(aa, r(0)) > 0)
			assert.ok(compareQ(bb, r(0)) > 0)

			// Strict Cauchy-Schwarz: <a, b>^2 < <a, a> * <b, b>
			const lhs = mulQ(ab, ab)
			const rhs = mulQ(aa, bb)
			assert.ok(compareQ(lhs, rhs) < 0, 'Expected strict Cauchy-Schwarz inequality')

			// Equality case for collinear vectors b = lambda * a
			const lambda = r(-7, 5)
			const collinear = scaleVec(lambda, a)
			const ac = dotProductRationalSeries(a, collinear)
			const cc = dotProductRationalSeries(collinear, collinear)
			assert.deepEqual(mulQ(ac, ac), mulQ(aa, cc))
		})

		test('polarization identity: <a, b> = (||a + b||^2 - ||a - b||^2) / 4', () => {
			const a = [r(5, 6), r(-4, 9), r(7, 10)]
			const b = [r(-2, 3), r(3, 5), r(11, 14)]

			const sumVec = addVec(a, b)
			const diffVec = subVec(a, b)
			const normSumSq = dotProductRationalSeries(sumVec, sumVec)
			const normDiffSq = dotProductRationalSeries(diffVec, diffVec)
			const polarized = mulQ(r(1, 4), subQ(normSumSq, normDiffSq))

			const direct = dotProductRationalSeries(a, b)
			assertLowestTerms(direct)
			assert.deepEqual(direct, polarized)
		})

		test('closed-form series cross-checks (telescoping and geometric series)', () => {
			// Telescoping series: sum_{k=1}^{n} (1/k) * (1/(k+1)) = n / (n + 1)
			const n = 50
			const u = Array.from({ length: n }, (_, i) => r(1, i + 1))
			const v = Array.from({ length: n }, (_, i) => r(1, i + 2))
			const telescoping = dotProductRationalSeries(u, v)
			assertLowestTerms(telescoping)
			assert.deepEqual(telescoping, { num: BigInt(n), den: BigInt(n + 1) })

			// Geometric series: sum_{k=0}^{m-1} (1/2)^k * (1/3)^k = (6^m - 1) / (5 * 6^(m-1))
			const m = 12
			const g1 = Array.from({ length: m }, (_, k) => ({ num: 1n, den: 2n ** BigInt(k) }))
			const g2 = Array.from({ length: m }, (_, k) => ({ num: 1n, den: 3n ** BigInt(k) }))
			const geom = dotProductRationalSeries(g1, g2)
			assertLowestTerms(geom)
			const expectedNum = 6n ** BigInt(m) - 1n
			const expectedDen = 5n * 6n ** BigInt(m - 1)
			const gDiv = gcd(expectedNum, expectedDen)
			assert.deepEqual(geom, { num: expectedNum / gDiv, den: expectedDen / gDiv })
		})
	})
})
