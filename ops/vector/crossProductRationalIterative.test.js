import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { crossProductRationalIterative } from './crossProductRationalIterative.js'

/**
 * Helper to construct a rational literal.
 * @param {bigint} num
 * @param {bigint} [den=1n]
 */
function rat(num, den = 1n) {
	return { num, den }
}

/**
 * Independent iterative GCD for test assertions and reference arithmetic.
 */
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

/**
 * Independent rational helpers for algebraic cross-checks.
 */
function ratNorm(num, den) {
	if (num === 0n) return { num: 0n, den: 1n }
	if (den < 0n) {
		num = -num
		den = -den
	}
	const g = gcd(num, den)
	return { num: num / g, den: den / g }
}

function ratAdd(x, y) {
	return ratNorm(x.num * y.den + y.num * x.den, x.den * y.den)
}

function ratSub(x, y) {
	return ratNorm(x.num * y.den - y.num * x.den, x.den * y.den)
}

function ratMul(x, y) {
	return ratNorm(x.num * y.num, x.den * y.den)
}

function dotRat(u, v) {
	let acc = rat(0n, 1n)
	for (let i = 0; i < 3; i++) {
		acc = ratAdd(acc, ratMul(u[i], v[i]))
	}
	return acc
}

function vecAdd(u, v) {
	return [ratAdd(u[0], v[0]), ratAdd(u[1], v[1]), ratAdd(u[2], v[2])]
}

function vecNeg(u) {
	return u.map((c) => ratNorm(-c.num, c.den))
}

function vecScale(s, u) {
	return u.map((c) => ratMul(s, c))
}

function assertCanonicalRationals(vec) {
	assert.equal(vec.length, 3)
	for (const c of vec) {
		assert.equal(typeof c.num, 'bigint')
		assert.equal(typeof c.den, 'bigint')
		assert.ok(c.den > 0n, `expected den > 0n, got ${c.den}`)
		if (c.num === 0n) {
			assert.equal(c.den, 1n, `expected canonical zero 0n/1n, got 0n/${c.den}`)
		} else {
			assert.equal(gcd(c.num, c.den), 1n, `expected lowest terms for ${c.num}/${c.den}`)
		}
	}
}

describe('crossProductRationalIterative', () => {
	describe('normal cases', () => {
		it('computes cross product of integer-valued rational vectors', () => {
			const a = [rat(2n), rat(3n), rat(4n)]
			const b = [rat(5n), rat(6n), rat(7n)]
			// (3*7 - 4*6, 4*5 - 2*7, 2*6 - 3*5) = (-3, 6, -3)
			const res = crossProductRationalIterative(a, b)
			assertCanonicalRationals(res)
			assert.deepStrictEqual(res, [rat(-3n, 1n), rat(6n, 1n), rat(-3n, 1n)])
		})

		it('computes exact reduced fractions for rational vectors', () => {
			const a = [rat(1n, 2n), rat(2n, 3n), rat(3n, 4n)]
			const b = [rat(4n, 5n), rat(5n, 6n), rat(6n, 7n)]
			// x: (2/3)*(6/7) - (3/4)*(5/6) = 4/7 - 5/8 = (32 - 35)/56 = -3/56
			// y: (3/4)*(4/5) - (1/2)*(6/7) = 3/5 - 3/7 = (21 - 15)/35 = 6/35
			// z: (1/2)*(5/6) - (2/3)*(4/5) = 5/12 - 8/15 = (25 - 32)/60 = -7/60
			const res = crossProductRationalIterative(a, b)
			assertCanonicalRationals(res)
			assert.deepStrictEqual(res, [rat(-3n, 56n), rat(6n, 35n), rat(-7n, 60n)])
		})

		it('handles unreduced inputs and negative denominators, returning lowest terms with den > 0n', () => {
			const a = [rat(-6n, -12n), rat(4n, -6n), rat(9n, 12n)] // (1/2, -2/3, 3/4)
			const b = [rat(-8n, 10n), rat(10n, -12n), rat(-12n, -14n)] // (-4/5, -5/6, 6/7)
			// x: (-2/3)*(6/7) - (3/4)*(-5/6) = -4/7 + 5/8 = (-32 + 35)/56 = 3/56
			// y: (3/4)*(-4/5) - (1/2)*(6/7) = -3/5 - 3/7 = -36/35
			// z: (1/2)*(-5/6) - (-2/3)*(-4/5) = -5/12 - 8/15 = (-25 - 32)/60 = -57/60 = -19/20
			const res = crossProductRationalIterative(a, b)
			assertCanonicalRationals(res)
			assert.deepStrictEqual(res, [rat(3n, 56n), rat(-36n, 35n), rat(-19n, 20n)])
		})

		it('does not mutate input vectors or rational objects', () => {
			const a = [rat(6n, -4n), rat(2n, 4n), rat(0n, -5n)]
			const b = [rat(1n, 3n), rat(-3n, 9n), rat(5n, 2n)]
			const aSnap = a.map((r) => ({ ...r }))
			const bSnap = b.map((r) => ({ ...r }))

			crossProductRationalIterative(a, b)

			assert.deepStrictEqual(a, aSnap)
			assert.deepStrictEqual(b, bSnap)
		})
	})

	describe('edge cases', () => {
		const e1 = [rat(1n), rat(0n), rat(0n)]
		const e2 = [rat(0n), rat(1n), rat(0n)]
		const e3 = [rat(0n), rat(0n), rat(1n)]
		const zero = [rat(0n), rat(0n), rat(0n)]

		it('satisfies right-hand rule for standard basis vectors', () => {
			assert.deepStrictEqual(crossProductRationalIterative(e1, e2), e3)
			assert.deepStrictEqual(crossProductRationalIterative(e2, e3), e1)
			assert.deepStrictEqual(crossProductRationalIterative(e3, e1), e2)

			assert.deepStrictEqual(crossProductRationalIterative(e2, e1), [rat(0n), rat(0n), rat(-1n)])
			assert.deepStrictEqual(crossProductRationalIterative(e3, e2), [rat(-1n), rat(0n), rat(0n)])
			assert.deepStrictEqual(crossProductRationalIterative(e1, e3), [rat(0n), rat(-1n), rat(0n)])
		})

		it('returns canonical zero vector for parallel and anti-parallel vectors', () => {
			const a = [rat(3n, 7n), rat(-5n, 11n), rat(13n, 17n)]
			const parallel = vecScale(rat(19n, 23n), a)
			const antiParallel = vecScale(rat(-41n, 29n), a)

			const resSelf = crossProductRationalIterative(a, a)
			const resPar = crossProductRationalIterative(a, parallel)
			const resAnti = crossProductRationalIterative(a, antiParallel)

			assertCanonicalRationals(resSelf)
			assertCanonicalRationals(resPar)
			assertCanonicalRationals(resAnti)

			assert.deepStrictEqual(resSelf, zero)
			assert.deepStrictEqual(resPar, zero)
			assert.deepStrictEqual(resAnti, zero)
		})

		it('returns canonical zero vector when either operand is the zero vector', () => {
			const v = [rat(-7n, 13n), rat(22n, 7n), rat(0n, 9n)]
			assert.deepStrictEqual(crossProductRationalIterative(zero, v), zero)
			assert.deepStrictEqual(crossProductRationalIterative(v, zero), zero)
			assert.deepStrictEqual(crossProductRationalIterative(zero, zero), zero)
		})

		it('handles very large BigInts without precision loss', () => {
			const big1 = (1n << 200n) + 123456789012345678901n
			const big2 = (1n << 180n) + 987654321098765432103n
			const p1 = (1n << 127n) - 1n // Mersenne prime M127
			const p2 = (1n << 89n) - 1n  // Mersenne prime M89

			const a = [rat(big1, p1), rat(-big2, p2), rat(big1 + 1n, p1)]
			const b = [rat(big2, p2), rat(big1, p1), rat(-big2 + 3n, p2)]

			const res = crossProductRationalIterative(a, b)
			assertCanonicalRationals(res)

			// Independent exact verification of each coordinate
			const expected = [
				ratSub(ratMul(a[1], b[2]), ratMul(a[2], b[1])),
				ratSub(ratMul(a[2], b[0]), ratMul(a[0], b[2])),
				ratSub(ratMul(a[0], b[1]), ratMul(a[1], b[0])),
			]
			assert.deepStrictEqual(res, expected)
			// Verify orthogonality on large BigInts
			assert.deepStrictEqual(dotRat(res, a), rat(0n, 1n))
			assert.deepStrictEqual(dotRat(res, b), rat(0n, 1n))
		})
	})

	describe('input validation', () => {
		const valid = [rat(1n), rat(2n), rat(3n)]

		it('rejects non-array arguments', () => {
			for (const bad of [null, undefined, 42, 'abc', { 0: rat(1n), 1: rat(2n), 2: rat(3n) }]) {
				assert.throws(() => crossProductRationalIterative(bad, valid), TypeError)
				assert.throws(() => crossProductRationalIterative(valid, bad), TypeError)
			}
		})

		it('rejects wrong vector dimensions', () => {
			const dims = [
				[],
				[rat(1n)],
				[rat(1n), rat(2n)],
				[rat(1n), rat(2n), rat(3n), rat(4n)],
			]
			for (const bad of dims) {
				assert.throws(() => crossProductRationalIterative(bad, valid), RangeError)
				assert.throws(() => crossProductRationalIterative(valid, bad), RangeError)
			}
		})

		it('rejects sparse arrays and malformed rational entries', () => {
			const sparse = new Array(3)
			assert.throws(() => crossProductRationalIterative(sparse, valid), TypeError)
			assert.throws(() => crossProductRationalIterative(valid, sparse), TypeError)

			const badEntries = [
				null,
				undefined,
				5n,
				{ num: 1, den: 2n },
				{ num: 1n, den: 2 },
				{ num: '1', den: 2n },
				{ num: 1n },
				{ den: 1n },
			]
			for (const entry of badEntries) {
				assert.throws(() => crossProductRationalIterative([entry, rat(0n), rat(0n)], valid), TypeError)
				assert.throws(() => crossProductRationalIterative(valid, [rat(0n), entry, rat(0n)]), TypeError)
			}
		})

		it('rejects zero denominators (den === 0n) in any position', () => {
			for (let idx = 0; idx < 3; idx++) {
				const badVec = [rat(1n), rat(2n), rat(3n)]
				badVec[idx] = { num: 5n, den: 0n }
				assert.throws(() => crossProductRationalIterative(badVec, valid), RangeError)
				assert.throws(() => crossProductRationalIterative(valid, badVec), RangeError)

				const zeroOverZero = [rat(1n), rat(2n), rat(3n)]
				zeroOverZero[idx] = { num: 0n, den: 0n }
				assert.throws(() => crossProductRationalIterative(zeroOverZero, valid), RangeError)
				assert.throws(() => crossProductRationalIterative(valid, zeroOverZero), RangeError)
			}
		})
	})

	describe('algebraic cross-checks against independent computations', () => {
		const vectors = [
			[rat(3n, 5n), rat(-7n, 11n), rat(13n, 17n)],
			[rat(-19n, 23n), rat(29n, 31n), rat(-37n, 41n)],
			[rat(43n, 47n), rat(53n, 59n), rat(-61n, 67n)],
			[rat(-101n, 12n), rat(0n, 7n), rat(88n, -15n)],
		]

		it('satisfies orthogonality: (a × b) · a = 0 and (a × b) · b = 0', () => {
			for (let i = 0; i < vectors.length; i++) {
				for (let j = 0; j < vectors.length; j++) {
					const a = vectors[i]
					const b = vectors[j]
					const c = crossProductRationalIterative(a, b)
					assertCanonicalRationals(c)
					assert.deepStrictEqual(dotRat(c, a), rat(0n, 1n))
					assert.deepStrictEqual(dotRat(c, b), rat(0n, 1n))
				}
			}
		})

		it('satisfies anti-commutativity: a × b = -(b × a)', () => {
			for (let i = 0; i < vectors.length; i++) {
				for (let j = i; j < vectors.length; j++) {
					const ab = crossProductRationalIterative(vectors[i], vectors[j])
					const ba = crossProductRationalIterative(vectors[j], vectors[i])
					assert.deepStrictEqual(ab, vecNeg(ba))
				}
			}
		})

		it("satisfies Lagrange's identity: ||a × b||² = ||a||² ||b||² - (a · b)²", () => {
			for (let i = 0; i < vectors.length; i++) {
				for (let j = 0; j < vectors.length; j++) {
					const a = vectors[i]
					const b = vectors[j]
					const c = crossProductRationalIterative(a, b)

					const lhs = dotRat(c, c)
					const normASq = dotRat(a, a)
					const normBSq = dotRat(b, b)
					const abDot = dotRat(a, b)
					const rhs = ratSub(ratMul(normASq, normBSq), ratMul(abDot, abDot))

					assert.deepStrictEqual(lhs, rhs)
				}
			}
		})

		it('satisfies Jacobi identity: a × (b × c) + b × (c × a) + c × (a × b) = 0', () => {
			const [a, b, c] = vectors
			const term1 = crossProductRationalIterative(a, crossProductRationalIterative(b, c))
			const term2 = crossProductRationalIterative(b, crossProductRationalIterative(c, a))
			const term3 = crossProductRationalIterative(c, crossProductRationalIterative(a, b))
			const sum = vecAdd(vecAdd(term1, term2), term3)

			assert.deepStrictEqual(sum, [rat(0n, 1n), rat(0n, 1n), rat(0n, 1n)])
		})

		it('satisfies bilinearity (distributivity and scalar homogeneity)', () => {
			const [a, b, c] = vectors
			const s = rat(-17n, 13n)

			const lhsDist = crossProductRationalIterative(a, vecAdd(b, c))
			const rhsDist = vecAdd(
				crossProductRationalIterative(a, b),
				crossProductRationalIterative(a, c)
			)
			assert.deepStrictEqual(lhsDist, rhsDist)

			const lhsScale = crossProductRationalIterative(vecScale(s, a), b)
			const rhsScale = vecScale(s, crossProductRationalIterative(a, b))
			assert.deepStrictEqual(lhsScale, rhsScale)
		})
	})
})
