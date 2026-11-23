import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { crossProductRationalStable } from './crossProductRationalStable.js'

const Q = (num, den = 1n) => ({ num: BigInt(num), den: BigInt(den) })
const ZERO = Q(0n, 1n)

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

function assertCanonicalVector(v) {
	assert.equal(Array.isArray(v), true)
	assert.equal(v.length, 3)
	for (const r of v) {
		assert.equal(typeof r.num, 'bigint')
		assert.equal(typeof r.den, 'bigint')
		assert.ok(r.den > 0n, `expected den > 0n, got ${r.den}`)
		if (r.num === 0n) {
			assert.equal(r.den, 1n, 'zero must be represented as 0n/1n')
		} else {
			assert.equal(gcd(r.num, r.den), 1n, `not in lowest terms: ${r.num}/${r.den}`)
		}
	}
}

// Independent naive rational arithmetic for cross-checking (no scaling or lattice reduction).
function qNorm(num, den) {
	if (num === 0n) return { num: 0n, den: 1n }
	const s = den < 0n ? -1n : 1n
	const n = num * s
	const d = den * s
	const g = gcd(n, d)
	return { num: n / g, den: d / g }
}

function qAdd(x, y) {
	return qNorm(x.num * y.den + y.num * x.den, x.den * y.den)
}

function qSub(x, y) {
	return qNorm(x.num * y.den - y.num * x.den, x.den * y.den)
}

function qMul(x, y) {
	return qNorm(x.num * y.num, x.den * y.den)
}

function qNeg(x) {
	return qNorm(-x.num, x.den)
}

function qDot(a, b) {
	return qAdd(qAdd(qMul(a[0], b[0]), qMul(a[1], b[1])), qMul(a[2], b[2]))
}

function qVecAdd(a, b) {
	return [qAdd(a[0], b[0]), qAdd(a[1], b[1]), qAdd(a[2], b[2])]
}

function qVecSub(a, b) {
	return [qSub(a[0], b[0]), qSub(a[1], b[1]), qSub(a[2], b[2])]
}

function qVecScale(s, v) {
	return [qMul(s, v[0]), qMul(s, v[1]), qMul(s, v[2])]
}

function naiveCrossProduct(a, b) {
	return [
		qSub(qMul(a[1], b[2]), qMul(a[2], b[1])),
		qSub(qMul(a[2], b[0]), qMul(a[0], b[2])),
		qSub(qMul(a[0], b[1]), qMul(a[1], b[0])),
	]
}

// Independent 3x3 determinant via Rule of Sarrus.
function det3x3(a, b, c) {
	const pos = qAdd(
		qAdd(qMul(qMul(a[0], b[1]), c[2]), qMul(qMul(a[1], b[2]), c[0])),
		qMul(qMul(a[2], b[0]), c[1]),
	)
	const neg = qAdd(
		qAdd(qMul(qMul(a[2], b[1]), c[0]), qMul(qMul(a[0], b[2]), c[1])),
		qMul(qMul(a[1], b[0]), c[2]),
	)
	return qSub(pos, neg)
}

describe('crossProductRationalStable', () => {
	test('standard orthonormal basis vectors (right-hand rule)', () => {
		const i = [Q(1), Q(0), Q(0)]
		const j = [Q(0), Q(1), Q(0)]
		const k = [Q(0), Q(0), Q(1)]

		assert.deepEqual(crossProductRationalStable(i, j), k)
		assert.deepEqual(crossProductRationalStable(j, k), i)
		assert.deepEqual(crossProductRationalStable(k, i), j)

		assert.deepEqual(crossProductRationalStable(j, i), [Q(0), Q(0), Q(-1)])
		assert.deepEqual(crossProductRationalStable(k, j), [Q(-1), Q(0), Q(0)])
		assert.deepEqual(crossProductRationalStable(i, k), [Q(0), Q(-1), Q(0)])
	})

	test('general rational vectors reduced to lowest terms', () => {
		const a = [Q(1, 2), Q(2, 3), Q(3, 4)]
		const b = [Q(4, 5), Q(5, 6), Q(6, 7)]
		const res = crossProductRationalStable(a, b)
		assertCanonicalVector(res)
		// (2/3)*(6/7) - (3/4)*(5/6) = 4/7 - 5/8 = -3/56
		// (3/4)*(4/5) - (1/2)*(6/7) = 3/5 - 3/7 = 6/35
		// (1/2)*(5/6) - (2/3)*(4/5) = 5/12 - 8/15 = -7/60
		assert.deepEqual(res, [Q(-3, 56), Q(6, 35), Q(-7, 60)])
	})

	test('normalizes unreduced inputs and negative denominators', () => {
		const a = [Q(6, -12), Q(-8, -12), Q(0, -99)]
		const b = [Q(10, 20), Q(-15, 25), Q(21, -7)]
		const res = crossProductRationalStable(a, b)
		assertCanonicalVector(res)
		assert.deepEqual(res, naiveCrossProduct(a, b))
	})

	test('zero vectors and collinear / antiparallel vectors yield canonical zero vector', () => {
		const zero = [ZERO, ZERO, ZERO]
		const v = [Q(3, 7), Q(-5, 11), Q(13, 17)]

		for (const res of [
			crossProductRationalStable(zero, v),
			crossProductRationalStable(v, zero),
			crossProductRationalStable(zero, zero),
			crossProductRationalStable(v, v),
			crossProductRationalStable(v, qVecScale(Q(-1), v)),
			crossProductRationalStable(v, qVecScale(Q(10n ** 60n, 97n), v)),
			crossProductRationalStable(qVecScale(Q(1n, 10n ** 60n), v), v),
		]) {
			assertCanonicalVector(res)
			assert.deepEqual(res, zero)
			// Distinct object references per component
			assert.notEqual(res[0], res[1])
			assert.notEqual(res[1], res[2])
		}
	})

	test('nearly collinear vectors with catastrophic floating-point cancellation', () => {
		const big = 10n ** 50n
		// a = [1, 1, 1], b = [1 + 10^-50, 1, 1] -> a × b = [0, 10^-50, -10^-50]
		const a1 = [Q(1), Q(1), Q(1)]
		const b1 = [Q(big + 1n, big), Q(1), Q(1)]
		const r1 = crossProductRationalStable(a1, b1)
		assertCanonicalVector(r1)
		assert.deepEqual(r1, [ZERO, Q(1n, big), Q(-1n, big)])

		// b = (10^80 + 1) * a + [0, 0, 1] -> a × b = a × [0, 0, 1] = [a1, -a0, 0]
		const huge = 10n ** 80n
		const a2 = [Q(huge), Q(huge + 1n), Q(1n)]
		const factor = huge + 1n
		const b2 = [Q(factor * huge), Q(factor * (huge + 1n)), Q(factor + 1n)]
		const r2 = crossProductRationalStable(a2, b2)
		assertCanonicalVector(r2)
		assert.deepEqual(r2, [Q(huge + 1n), Q(-huge), ZERO])

		// Kahan-like closely spaced large integers
		const base = 10n ** 35n
		const a3 = [Q(base), Q(base + 1n), Q(base + 2n)]
		const b3 = [Q(base + 3n), Q(base + 4n), Q(base + 5n)]
		const r3 = crossProductRationalStable(a3, b3)
		assertCanonicalVector(r3)
		assert.deepEqual(r3, [Q(-3), Q(6), Q(-3)])
	})

	test('extreme mixed scales (10^100 and 10^-100)', () => {
		const big = 10n ** 100n
		const a = [Q(big, 3n), Q(1n, big), Q(-7n, 11n)]
		const b = [Q(1n, big * 5n), Q(big, 7n), Q(13n, 19n)]
		const res = crossProductRationalStable(a, b)
		assertCanonicalVector(res)
		assert.deepEqual(res, naiveCrossProduct(a, b))
	})

	test('does not mutate inputs', () => {
		const a = [Q(4, -6), Q(9, 12), Q(-10, -15)]
		const b = [Q(2, 4), Q(-6, 8), Q(14, -21)]
		const aSnap = a.map((r) => ({ ...r }))
		const bSnap = b.map((r) => ({ ...r }))
		crossProductRationalStable(a, b)
		assert.deepEqual(a, aSnap)
		assert.deepEqual(b, bSnap)
	})

	test('input validation throws TypeError or RangeError on malformed inputs', () => {
		const valid = [Q(1), Q(2), Q(3)]
		const zero = [ZERO, ZERO, ZERO]

		// Non-array inputs
		assert.throws(() => crossProductRationalStable(null, valid), TypeError)
		assert.throws(() => crossProductRationalStable(valid, undefined), TypeError)
		assert.throws(() => crossProductRationalStable({}, valid), TypeError)
		assert.throws(() => crossProductRationalStable('123', valid), TypeError)

		// Wrong lengths
		assert.throws(() => crossProductRationalStable([], valid), RangeError)
		assert.throws(() => crossProductRationalStable([Q(1), Q(2)], valid), RangeError)
		assert.throws(() => crossProductRationalStable(valid, [Q(1), Q(2), Q(3), Q(4)]), RangeError)

		// Sparse array
		const sparse = new Array(3)
		assert.throws(() => crossProductRationalStable(sparse, valid), TypeError)

		// Invalid element types (numbers instead of BigInts, null, missing properties)
		assert.throws(() => crossProductRationalStable([{ num: 1, den: 1n }, Q(0), Q(0)], valid), TypeError)
		assert.throws(() => crossProductRationalStable([Q(0), { num: 1n, den: 1 }, Q(0)], valid), TypeError)
		assert.throws(() => crossProductRationalStable([null, Q(0), Q(0)], valid), TypeError)
		assert.throws(() => crossProductRationalStable([{}, Q(0), Q(0)], valid), TypeError)

		// Zero denominator (including when the other vector is zero!)
		assert.throws(() => crossProductRationalStable([Q(1, 0), Q(0), Q(0)], valid), RangeError)
		assert.throws(() => crossProductRationalStable(zero, [Q(0), Q(0, 0), Q(1)]), RangeError)
	})

	test('independent cross-checks: naive implementation and vector algebra identities', () => {
		// Deterministic LCG PRNG for reproducible test vectors
		let seed = 0x5eed1234n
		const nextInt = (min, max) => {
			seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n)
			const span = BigInt(max - min + 1)
			return BigInt(min) + (seed % span)
		}
		const randRational = () => {
			const num = nextInt(-50, 50)
			let den = nextInt(-30, 30)
			if (den === 0n) den = 1n
			return { num, den }
		}
		const randVec = () => [randRational(), randRational(), randRational()]

		for (let trial = 0; trial < 40; trial++) {
			const a = randVec()
			const b = randVec()
			const c = randVec()

			const ab = crossProductRationalStable(a, b)
			assertCanonicalVector(ab)

			// 1. Cross-check against independent naive rational implementation
			assert.deepEqual(ab, naiveCrossProduct(a, b))

			// 2. Orthogonality: a · (a × b) === 0 and b · (a × b) === 0
			assert.deepEqual(qDot(a, ab), ZERO)
			assert.deepEqual(qDot(b, ab), ZERO)

			// 3. Anti-commutativity: a × b === -(b × a)
			const ba = crossProductRationalStable(b, a)
			assert.deepEqual(ab, [qNeg(ba[0]), qNeg(ba[1]), qNeg(ba[2])])

			// 4. Lagrange's identity: ||a × b||^2 === ||a||^2 ||b||^2 - (a · b)^2
			const lhsLagrange = qDot(ab, ab)
			const rhsLagrange = qSub(qMul(qDot(a, a), qDot(b, b)), qMul(qDot(a, b), qDot(a, b)))
			assert.deepEqual(lhsLagrange, rhsLagrange)

			// 5. Scalar triple product equals independent 3x3 determinant: c · (a × b) === det(a, b, c)
			assert.deepEqual(qDot(c, ab), det3x3(a, b, c))

			// 6. Jacobi identity: a×(b×c) + b×(c×a) + c×(a×b) === 0
			const bc = crossProductRationalStable(b, c)
			const ca = crossProductRationalStable(c, a)
			const t1 = crossProductRationalStable(a, bc)
			const t2 = crossProductRationalStable(b, ca)
			const t3 = crossProductRationalStable(c, ab)
			assert.deepEqual(qVecAdd(qVecAdd(t1, t2), t3), [ZERO, ZERO, ZERO])

			// 7. BAC-CAB identity: a × (b × c) === (a · c)b - (a · b)c
			const bacCab = qVecSub(qVecScale(qDot(a, c), b), qVecScale(qDot(a, b), c))
			assert.deepEqual(t1, bacCab)

			// 8. Bilinearity: (s*a + t*c) × b === s*(a × b) + t*(c × b)
			const s = randRational()
			const t = randRational()
			const lhsLin = crossProductRationalStable(qVecAdd(qVecScale(s, a), qVecScale(t, c)), b)
			const cb = crossProductRationalStable(c, b)
			const rhsLin = qVecAdd(qVecScale(s, ab), qVecScale(t, cb))
			assert.deepEqual(lhsLin, rhsLin)
		}
	})

	test('Gauss lattice reduction stress test: Fibonacci-like nearly collinear vectors', () => {
		// Consecutive Fibonacci numbers are worst-case inputs for Euclidean/Gauss reduction.
		let f0 = 1n
		let f1 = 1n
		for (let i = 0; i < 120; i++) {
			;[f0, f1] = [f1, f0 + f1]
		}
		const f2 = f0 + f1
		const f3 = f1 + f2
		const a = [Q(f0, 7n), Q(f1, 11n), Q(f2, 13n)]
		const b = [Q(f1, 7n), Q(f2, 11n), Q(f3, 13n)]
		const res = crossProductRationalStable(a, b)
		assertCanonicalVector(res)
		assert.deepEqual(res, naiveCrossProduct(a, b))
		assert.deepEqual(qDot(a, res), ZERO)
		assert.deepEqual(qDot(b, res), ZERO)
	})
})
