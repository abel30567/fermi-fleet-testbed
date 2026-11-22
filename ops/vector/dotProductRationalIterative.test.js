import { describe, test } from 'node:test'
import assert from 'node:assert'
import { dotProductRationalIterative } from './dotProductRationalIterative.js'

const r = (num, den = 1n) => ({ num: BigInt(num), den: BigInt(den) })

function independentGcd(a, b) {
	a = a < 0n ? -a : a
	b = b < 0n ? -b : b
	return b === 0n ? a : independentGcd(b, a % b)
}

function independentLcm(a, b) {
	a = a < 0n ? -a : a
	b = b < 0n ? -b : b
	return (a / independentGcd(a, b)) * b
}

function independentNormalize(num, den) {
	if (num === 0n) return { num: 0n, den: 1n }
	if (den < 0n) {
		num = -num
		den = -den
	}
	const g = independentGcd(num, den)
	return { num: num / g, den: den / g }
}

function independentRationalAdd(x, y) {
	return independentNormalize(x.num * y.den + y.num * x.den, x.den * y.den)
}

function independentRationalMul(x, y) {
	return independentNormalize(x.num * y.num, x.den * y.den)
}

describe('dotProductRationalIterative', () => {
	describe('normal cases', () => {
		test('computes dot product of simple positive rational vectors in lowest terms', () => {
			const a = [r(1, 2), r(2, 3), r(3, 4)]
			const b = [r(2, 5), r(3, 7), r(4, 9)]
			// (1/5) + (2/7) + (1/3) = (21 + 30 + 35) / 105 = 86 / 105
			assert.deepStrictEqual(dotProductRationalIterative(a, b), r(86, 105))
		})

		test('reduces final result and unreduced inputs to lowest terms', () => {
			const a = [r(4, 6), r(6, 9)]
			const b = [r(9, 12), r(3, 4)]
			// (2/3)*(3/4) + (2/3)*(3/4) = 1/2 + 1/2 = 1/1
			assert.deepStrictEqual(dotProductRationalIterative(a, b), r(1, 1))
		})

		test('handles negative numerators and negative denominators, returning den > 0n', () => {
			const a = [r(-1, 2), r(3, -4), r(-5, -6)]
			const b = [r(2, -3), r(-4, 5), r(-6, 7)]
			// (1/3) + (3/5) + (-5/7) = (35 + 63 - 75) / 105 = 23 / 105
			assert.deepStrictEqual(dotProductRationalIterative(a, b), r(23, 105))

			const negResult = dotProductRationalIterative([r(1, -2)], [r(3, 4)])
			assert.deepStrictEqual(negResult, r(-3, 8))
			assert.ok(negResult.den > 0n)
		})

		test('does not mutate input arrays or elements', () => {
			const a = [r(2, -4), r(3, 6)]
			const b = [r(-4, 8), r(5, -10)]
			const aSnap = a.map((x) => ({ ...x }))
			const bSnap = b.map((x) => ({ ...x }))

			dotProductRationalIterative(a, b)

			assert.deepStrictEqual(a, aSnap)
			assert.deepStrictEqual(b, bSnap)
		})
	})

	describe('edge cases', () => {
		test('empty vectors return exact zero { num: 0n, den: 1n }', () => {
			assert.deepStrictEqual(dotProductRationalIterative([], []), r(0, 1))
		})

		test('1D vectors', () => {
			assert.deepStrictEqual(dotProductRationalIterative([r(7, 12)], [r(8, 21)]), r(2, 9))
			assert.deepStrictEqual(dotProductRationalIterative([r(0, 5)], [r(99, -7)]), r(0, 1))
		})

		test('orthogonal vectors cancel to exact zero { num: 0n, den: 1n }', () => {
			const a = [r(1, 2), r(1, 3), r(-1, 6)]
			const b = [r(2, 5), r(-3, 5), r(0, 1)]
			// (1/5) + (-1/5) + 0 = 0/1
			assert.deepStrictEqual(dotProductRationalIterative(a, b), r(0, 1))

			const u = [r(3, 7), r(-5, 11)]
			const v = [r(5, 11), r(3, 7)]
			assert.deepStrictEqual(dotProductRationalIterative(u, v), r(0, 1))
		})

		test('exact arithmetic with very large BigInts beyond Number.MAX_SAFE_INTEGER', () => {
			const big = 10n ** 60n
			// (big + 1)/big * 1 + (-1) * 1 = 1/big (catastrophic cancellation in float64)
			const a = [
				{ num: big + 1n, den: big },
				{ num: -1n, den: 1n },
			]
			const b = [
				{ num: 1n, den: 1n },
				{ num: 1n, den: 1n },
			]
			assert.deepStrictEqual(dotProductRationalIterative(a, b), { num: 1n, den: big })

			// Large coprime denominators and numerators
			const p = 10n ** 40n + 7n
			const q = 10n ** 40n + 9n
			const result = dotProductRationalIterative(
				[{ num: p, den: q }, { num: q, den: p }],
				[{ num: q, den: p }, { num: -p, den: q }],
			)
			assert.deepStrictEqual(result, r(0, 1))
		})
	})

	describe('input validation', () => {
		test('throws TypeError when arguments are not arrays', () => {
			assert.throws(() => dotProductRationalIterative(null, []), TypeError)
			assert.throws(() => dotProductRationalIterative([], undefined), TypeError)
			assert.throws(() => dotProductRationalIterative({}, []), TypeError)
			assert.throws(() => dotProductRationalIterative('ab', ['a', 'b']), TypeError)
			assert.throws(() => dotProductRationalIterative([], 123), TypeError)
		})

		test('throws RangeError when vector lengths do not match', () => {
			assert.throws(() => dotProductRationalIterative([r(1, 2)], []), RangeError)
			assert.throws(() => dotProductRationalIterative([r(1, 2)], [r(1, 2), r(3, 4)]), RangeError)
		})

		test('throws TypeError for malformed rational elements', () => {
			assert.throws(() => dotProductRationalIterative([null], [r(1, 1)]), TypeError)
			assert.throws(() => dotProductRationalIterative([r(1, 1)], [undefined]), TypeError)
			assert.throws(() => dotProductRationalIterative([[1n, 2n]], [r(1, 1)]), TypeError)
			assert.throws(() => dotProductRationalIterative([{ num: 1, den: 2n }], [r(1, 1)]), TypeError)
			assert.throws(() => dotProductRationalIterative([r(1, 1)], [{ num: 1n, den: 2 }]), TypeError)
			assert.throws(() => dotProductRationalIterative([{ num: 1n }], [r(1, 1)]), TypeError)

			// Sparse array hole
			const sparse = new Array(1)
			assert.throws(() => dotProductRationalIterative(sparse, [r(1, 1)]), TypeError)
		})

		test('throws RangeError for zero denominator, even when paired with a zero numerator', () => {
			assert.throws(() => dotProductRationalIterative([r(1, 0)], [r(1, 1)]), RangeError)
			assert.throws(() => dotProductRationalIterative([r(0, 1)], [r(5, 0)]), RangeError)
			assert.throws(() => dotProductRationalIterative([r(0, 0)], [r(0, 1)]), RangeError)
		})
	})

	describe('independent cross-checks', () => {
		test('cross-check against scaled integer dot product via LCM denominator clearing', () => {
			const vectors = [
				[
					[r(1, 2), r(-3, 5), r(7, 12), r(11, -18), r(0, 7)],
					[r(5, 6), r(10, 9), r(-4, 7), r(-9, 22), r(13, 17)],
				],
				[
					[r(12345678901234567890n, 987654321n), r(-42n, 13n), r(17n, 29n)],
					[r(9876543210987654321n, 123456789n), r(26n, -21n), r(58n, 51n)],
				],
			]

			for (const [u, v] of vectors) {
				const lcmU = u.reduce((acc, q) => independentLcm(acc, q.den), 1n)
				const lcmV = v.reduce((acc, q) => independentLcm(acc, q.den), 1n)

				let scaledSum = 0n
				for (let i = 0; i < u.length; i++) {
					const intU = u[i].num * (lcmU / u[i].den)
					const intV = v[i].num * (lcmV / v[i].den)
					scaledSum += intU * intV
				}

				const expected = independentNormalize(scaledSum, lcmU * lcmV)
				assert.deepStrictEqual(dotProductRationalIterative(u, v), expected)
			}
		})

		test('satisfies commutativity: dot(u, v) === dot(v, u)', () => {
			const u = [r(3, 8), r(-5, 12), r(17, 24), r(-11, 30)]
			const v = [r(-7, 15), r(4, 9), r(-13, 18), r(25, 42)]

			assert.deepStrictEqual(
				dotProductRationalIterative(u, v),
				dotProductRationalIterative(v, u),
			)
		})

		test('satisfies bilinearity: dot(alpha*u + beta*w, v) === alpha*dot(u, v) + beta*dot(w, v)', () => {
			const u = [r(1, 3), r(-2, 5), r(7, 11)]
			const w = [r(-4, 7), r(9, 13), r(5, 6)]
			const v = [r(3, 4), r(5, -8), r(-11, 14)]
			const alpha = r(-7, 9)
			const beta = r(11, 15)

			const combined = u.map((ui, i) =>
				independentRationalAdd(
					independentRationalMul(alpha, ui),
					independentRationalMul(beta, w[i]),
				),
			)

			const lhs = dotProductRationalIterative(combined, v)
			const rhs = independentRationalAdd(
				independentRationalMul(alpha, dotProductRationalIterative(u, v)),
				independentRationalMul(beta, dotProductRationalIterative(w, v)),
			)

			assert.deepStrictEqual(lhs, rhs)
		})
	})
})
