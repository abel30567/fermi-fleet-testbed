import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { projectionRationalSeries } from './projectionRationalSeries.js'

function q(num, den = 1n) {
	return { num: BigInt(num), den: BigInt(den) }
}

function absBigInt(x) {
	return x < 0n ? -x : x
}

function gcdBigInt(a, b) {
	a = absBigInt(a)
	b = absBigInt(b)
	while (b !== 0n) {
		const r = a % b
		a = b
		b = r
	}
	return a
}

function normQ(num, den) {
	if (num === 0n) return { num: 0n, den: 1n }
	if (den < 0n) {
		num = -num
		den = -den
	}
	const g = gcdBigInt(num, den)
	return { num: num / g, den: den / g }
}

function addQ(a, b) {
	return normQ(a.num * b.den + b.num * a.den, a.den * b.den)
}

function subQ(a, b) {
	return normQ(a.num * b.den - b.num * a.den, a.den * b.den)
}

function mulQ(a, b) {
	return normQ(a.num * b.num, a.den * b.den)
}

function dotQ(a, b) {
	let sum = q(0)
	for (let i = 0; i < a.length; i++) {
		sum = addQ(sum, mulQ(a[i], b[i]))
	}
	return sum
}

function assertNormalizedVector(vec) {
	for (const el of vec) {
		assert.equal(typeof el.num, 'bigint')
		assert.equal(typeof el.den, 'bigint')
		assert.ok(el.den > 0n, `expected positive denominator, got ${el.den}`)
		assert.equal(
			gcdBigInt(el.num, el.den),
			1n,
			`expected lowest terms, got ${el.num}/${el.den}`
		)
	}
}

describe('projectionRationalSeries', () => {
	test('projects onto standard basis vector in 2D', () => {
		const res = projectionRationalSeries([q(3), q(4)], [q(1), q(0)])
		assertNormalizedVector(res)
		assert.deepEqual(res, [q(3), q(0)])
	})

	test('projects non-trivial 2D rational vectors accurately', () => {
		// u = [1/2, 2/3], v = [3/4, -1/2]
		// u·v = 3/8 - 1/3 = 1/24
		// v·v = 9/16 + 1/4 = 13/16
		// scale = (1/24)/(13/16) = 2/39
		// proj = [1/26, -1/39]
		const res = projectionRationalSeries([q(1, 2), q(2, 3)], [q(3, 4), q(-1, 2)])
		assertNormalizedVector(res)
		assert.deepEqual(res, [q(1, 26), q(-1, 39)])
	})

	test('projects 3D vectors accurately', () => {
		const res = projectionRationalSeries([q(1), q(2), q(3)], [q(1), q(1), q(1)])
		assertNormalizedVector(res)
		assert.deepEqual(res, [q(2), q(2), q(2)])
	})

	test('normalizes unreduced and negative-denominator inputs', () => {
		const u = [q(6, -9), q(4, 8)] // [-2/3, 1/2]
		const v = [q(-4, -6), q(6, 12)] // [2/3, 1/2]
		// u·v = -4/9 + 1/4 = -7/36
		// v·v = 4/9 + 1/4 = 25/36
		// scale = -7/25
		// proj = [-14/75, -7/50]
		const res = projectionRationalSeries(u, v)
		assertNormalizedVector(res)
		assert.deepEqual(res, [q(-14, 75), q(-7, 50)])
	})

	test('handles 1D projection (always returns normalized u)', () => {
		const res = projectionRationalSeries([q(-15, 25)], [q(7, -11)])
		assertNormalizedVector(res)
		assert.deepEqual(res, [q(-3, 5)])
	})

	test('returns zero vector when u is zero or orthogonal to v', () => {
		const zeroU = projectionRationalSeries([q(0), q(0), q(0)], [q(2, 3), q(-5, 7), q(11, 13)])
		assertNormalizedVector(zeroU)
		assert.deepEqual(zeroU, [q(0), q(0), q(0)])

		const ortho = projectionRationalSeries([q(3, 2), q(-1, 5)], [q(2, 15), q(1)])
		assertNormalizedVector(ortho)
		assert.deepEqual(ortho, [q(0), q(0)])
	})

	test('returns normalized u when u is parallel or anti-parallel to v', () => {
		const v = [q(2, 3), q(-5, 4), q(7, 6)]
		const u = v.map((c) => mulQ(c, q(-3, 2)))
		const res = projectionRationalSeries(u, v)
		assertNormalizedVector(res)
		assert.deepEqual(res, u)
	})

	test('maintains exactness for large BigInt rationals beyond safe integer range', () => {
		const bigA = 123456789012345678901234567890n
		const bigB = 987654321098765432109876543211n
		const u = [q(bigA, bigB), q(-bigB, bigA)]
		const v = [q(bigA + 1n, bigB - 2n), q(bigB + 3n, bigA + 5n)]

		const p = projectionRationalSeries(u, v)
		assertNormalizedVector(p)

		// Residual (u - p) must be strictly orthogonal to v
		const residual = u.map((ui, i) => subQ(ui, p[i]))
		assert.deepEqual(dotQ(residual, v), q(0))
	})

	test('does not mutate input vectors or rational objects', () => {
		const u = [q(2, 4), q(-3, 6)]
		const v = [q(5, 10), q(4, -8)]
		const uSnap = structuredClone(u)
		const vSnap = structuredClone(v)

		projectionRationalSeries(u, v)
		assert.deepEqual(u, uSnap)
		assert.deepEqual(v, vSnap)
	})

	test('cross-checks: residual orthogonality, idempotence, scale invariance, linearity, and Pythagoras', () => {
		const u1 = [q(5, 7), q(-11, 13), q(3, 4), q(-2, 9)]
		const u2 = [q(-3, 5), q(2, 3), q(7, 8), q(4, 11)]
		const v = [q(1, 2), q(-3, 5), q(4, 7), q(-5, 6)]

		const p1 = projectionRationalSeries(u1, v)
		const p2 = projectionRationalSeries(u2, v)
		assertNormalizedVector(p1)
		assertNormalizedVector(p2)

		// 1. Residual orthogonality: (u - proj_v(u)) · v === 0
		const residual = u1.map((ui, i) => subQ(ui, p1[i]))
		assert.deepEqual(dotQ(residual, v), q(0))

		// 2. Idempotence: proj_v(proj_v(u)) === proj_v(u)
		const p1Twice = projectionRationalSeries(p1, v)
		assertNormalizedVector(p1Twice)
		assert.deepEqual(p1Twice, p1)

		// 3. Scale invariance in target vector v: proj_{k*v}(u) === proj_v(u)
		const k = q(-17, 23)
		const kv = v.map((vi) => mulQ(vi, k))
		assert.deepEqual(projectionRationalSeries(u1, kv), p1)

		// 4. Linearity in u: proj_v(a*u1 + b*u2) === a*proj_v(u1) + b*proj_v(u2)
		const a = q(7, 11)
		const b = q(-5, 13)
		const combinedU = u1.map((ui, i) => addQ(mulQ(a, ui), mulQ(b, u2[i])))
		const lhs = projectionRationalSeries(combinedU, v)
		const rhs = p1.map((p1i, i) => addQ(mulQ(a, p1i), mulQ(b, p2[i])))
		assert.deepEqual(lhs, rhs)

		// 5. Pythagorean identity: ||u||^2 === ||proj_v(u)||^2 + ||u - proj_v(u)||^2
		const normSqU = dotQ(u1, u1)
		const normSqP = dotQ(p1, p1)
		const normSqR = dotQ(residual, residual)
		assert.deepEqual(normSqU, addQ(normSqP, normSqR))
	})

	test('rejects invalid inputs with appropriate errors', () => {
		// Zero target vector
		assert.throws(() => projectionRationalSeries([q(1)], [q(0)]), RangeError)
		assert.throws(
			() => projectionRationalSeries([q(1), q(2)], [q(0, 3), q(0, -5)]),
			RangeError
		)

		// Mismatched lengths
		assert.throws(
			() => projectionRationalSeries([q(1), q(2)], [q(1)]),
			RangeError
		)

		// Empty vectors
		assert.throws(() => projectionRationalSeries([], []), RangeError)

		// Non-array inputs
		assert.throws(() => projectionRationalSeries(null, [q(1)]), TypeError)
		assert.throws(() => projectionRationalSeries([q(1)], 'bad'), TypeError)

		// Malformed elements
		assert.throws(
			() => projectionRationalSeries([{ num: 1, den: 1n }], [q(1)]),
			TypeError
		)
		assert.throws(
			() => projectionRationalSeries([q(1)], [{ num: 1n, den: 1 }]),
			TypeError
		)
		assert.throws(() => projectionRationalSeries([null], [q(1)]), TypeError)

		// Zero denominators
		assert.throws(
			() => projectionRationalSeries([q(1, 0)], [q(1)]),
			RangeError
		)
		assert.throws(
			() => projectionRationalSeries([q(1)], [q(1, 0)]),
			RangeError
		)
	})
})
