import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { crossProductRationalSeries } from './crossProductRationalSeries.js'

// --- Independent exact rational helpers for verification ---

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

function q(num, den = 1n) {
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

function qAdd(x, y) {
	return q(x.num * y.den + y.num * x.den, x.den * y.den)
}

function qSub(x, y) {
	return q(x.num * y.den - y.num * x.den, x.den * y.den)
}

function qMul(x, y) {
	return q(x.num * y.num, x.den * y.den)
}

function qNeg(x) {
	return x.num === 0n ? { num: 0n, den: 1n } : { num: -x.num, den: x.den }
}

function qToNumber(x) {
	return Number(x.num) / Number(x.den)
}

function dot(u, v) {
	return qAdd(qAdd(qMul(u[0], v[0]), qMul(u[1], v[1])), qMul(u[2], v[2]))
}

function normSq(u) {
	return dot(u, u)
}

function vecAdd(u, v) {
	return [qAdd(u[0], v[0]), qAdd(u[1], v[1]), qAdd(u[2], v[2])]
}

function vecSub(u, v) {
	return [qSub(u[0], v[0]), qSub(u[1], v[1]), qSub(u[2], v[2])]
}

function vecScale(s, u) {
	return [qMul(s, u[0]), qMul(s, u[1]), qMul(s, u[2])]
}

function vecNeg(u) {
	return [qNeg(u[0]), qNeg(u[1]), qNeg(u[2])]
}

function det3x3Sarrus(a, b, c) {
	// Independent 3x3 determinant via Rule of Sarrus: det([a; b; c])
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

function assertCanonicalRational(r, label = 'rational') {
	assert.equal(typeof r, 'object', `${label} must be an object`)
	assert.notEqual(r, null, `${label} must not be null`)
	assert.equal(typeof r.num, 'bigint', `${label}.num must be BigInt`)
	assert.equal(typeof r.den, 'bigint', `${label}.den must be BigInt`)
	assert.ok(r.den > 0n, `${label}.den must be > 0n, got ${r.den}`)
	if (r.num === 0n) {
		assert.equal(r.den, 1n, `${label} zero must have den === 1n`)
	} else {
		assert.equal(gcd(r.num, r.den), 1n, `${label} (${r.num}/${r.den}) must be in lowest terms`)
	}
}

function assertCanonicalVector(vec) {
	assert.ok(Array.isArray(vec), 'result must be an Array')
	assert.equal(vec.length, 3, 'result must have length 3')
	for (let i = 0; i < 3; i++) {
		assertCanonicalRational(vec[i], `result[${i}]`)
	}
}

function assertVectorEqual(actual, expected) {
	assertCanonicalVector(actual)
	assert.deepStrictEqual(actual, expected)
}

const ZERO = q(0n)
const ONE = q(1n)
const NEG_ONE = q(-1n)
const ZERO_VEC = [ZERO, ZERO, ZERO]

describe('crossProductRationalSeries', () => {
	describe('normal cases', () => {
		test('integer vectors [1, 2, 3] × [4, 5, 6] = [-3, 6, -3]', () => {
			const a = [q(1n), q(2n), q(3n)]
			const b = [q(4n), q(5n), q(6n)]
			assertVectorEqual(crossProductRationalSeries(a, b), [q(-3n), q(6n), q(-3n)])
		})

		test('fractional vectors with reduction to lowest terms', () => {
			// a = [1/2, -2/3, 3/4], b = [5/6, 7/8, -9/10]
			// c0 = (-2/3)(-9/10) - (3/4)(7/8) = 3/5 - 21/32 = (96 - 105)/160 = -9/160
			// c1 = (3/4)(5/6) - (1/2)(-9/10) = 5/8 + 9/20 = (25 + 18)/40 = 43/40
			// c2 = (1/2)(7/8) - (-2/3)(5/6) = 7/16 + 5/9 = (63 + 80)/144 = 143/144
			const a = [q(1n, 2n), q(-2n, 3n), q(3n, 4n)]
			const b = [q(5n, 6n), q(7n, 8n), q(-9n, 10n)]
			assertVectorEqual(crossProductRationalSeries(a, b), [
				q(-9n, 160n),
				q(43n, 40n),
				q(143n, 144n),
			])
		})

		test('fractional components canceling into integers and zero', () => {
			// a = [2/3, 4/5, 6/7], b = [3/2, 9/5, 27/14]
			// c0 = (4/5)(27/14) - (6/7)(9/5) = 54/35 - 54/35 = 0
			// c1 = (6/7)(3/2) - (2/3)(27/14) = 9/7 - 9/7 = 0 -> let's pick non-zero c1/c2 too
			const a = [q(2n, 3n), q(4n, 5n), q(6n, 7n)]
			const b = [q(5n, 2n), q(9n, 5n), q(27n, 14n)]
			// c0 = (4/5)(27/14) - (6/7)(9/5) = 54/35 - 54/35 = 0
			// c1 = (6/7)(5/2) - (2/3)(27/14) = 15/7 - 9/7 = 6/7
			// c2 = (2/3)(9/5) - (4/5)(5/2) = 6/5 - 2 = -4/5
			assertVectorEqual(crossProductRationalSeries(a, b), [q(0n), q(6n, 7n), q(-4n, 5n)])
		})

		test('accepts unreduced rationals and negative denominators and returns canonical lowest terms', () => {
			const a = [
				{ num: 6n, den: 12n },     // 1/2
				{ num: 4n, den: -6n },     // -2/3
				{ num: -9n, den: -12n },   // 3/4
			]
			const b = [
				{ num: -10n, den: -12n },  // 5/6
				{ num: 14n, den: 16n },    // 7/8
				{ num: 27n, den: -30n },   // -9/10
			]
			assertVectorEqual(crossProductRationalSeries(a, b), [
				q(-9n, 160n),
				q(43n, 40n),
				q(143n, 144n),
			])
		})

		test('accepts zero with negative or non-unit denominators', () => {
			const a = [
				{ num: 0n, den: -7n },
				{ num: 3n, den: -9n },
				{ num: 0n, den: 42n },
			]
			const b = [
				{ num: 5n, den: 10n },
				{ num: 0n, den: -3n },
				{ num: 0n, den: 8n },
			]
			// a = [0, -1/3, 0], b = [1/2, 0, 0] => a × b = [0, 0, 1/6]
			assertVectorEqual(crossProductRationalSeries(a, b), [q(0n), q(0n), q(1n, 6n)])
		})

		test('does not mutate input vectors or rational objects', () => {
			const a = [
				{ num: 2n, den: -4n },
				{ num: 3n, den: 9n },
				{ num: 0n, den: -5n },
			]
			const b = [
				{ num: 4n, den: 8n },
				{ num: -6n, den: -12n },
				{ num: 10n, den: 15n },
			]
			const aSnapshot = structuredClone(a)
			const bSnapshot = structuredClone(b)

			const result = crossProductRationalSeries(a, b)
			assertCanonicalVector(result)
			assert.deepStrictEqual(a, aSnapshot)
			assert.deepStrictEqual(b, bSnapshot)
		})
	})

	describe('standard basis vectors (right-hand rule)', () => {
		const i = [ONE, ZERO, ZERO]
		const j = [ZERO, ONE, ZERO]
		const k = [ZERO, ZERO, ONE]

		test('cyclic products: i×j=k, j×k=i, k×i=j', () => {
			assertVectorEqual(crossProductRationalSeries(i, j), k)
			assertVectorEqual(crossProductRationalSeries(j, k), i)
			assertVectorEqual(crossProductRationalSeries(k, i), j)
		})

		test('anti-cyclic products: j×i=-k, k×j=-i, i×k=-j', () => {
			assertVectorEqual(crossProductRationalSeries(j, i), [ZERO, ZERO, NEG_ONE])
			assertVectorEqual(crossProductRationalSeries(k, j), [NEG_ONE, ZERO, ZERO])
			assertVectorEqual(crossProductRationalSeries(i, k), [ZERO, NEG_ONE, ZERO])
		})

		test('self products: i×i = j×j = k×k = 0', () => {
			assertVectorEqual(crossProductRationalSeries(i, i), ZERO_VEC)
			assertVectorEqual(crossProductRationalSeries(j, j), ZERO_VEC)
			assertVectorEqual(crossProductRationalSeries(k, k), ZERO_VEC)
		})
	})

	describe('zero, parallel, anti-parallel, and large-BigInt edge cases', () => {
		test('zero vector on left, right, or both yields exact zero vector', () => {
			const v = [q(7n, 11n), q(-13n, 17n), q(19n, 23n)]
			assertVectorEqual(crossProductRationalSeries(ZERO_VEC, v), ZERO_VEC)
			assertVectorEqual(crossProductRationalSeries(v, ZERO_VEC), ZERO_VEC)
			assertVectorEqual(crossProductRationalSeries(ZERO_VEC, ZERO_VEC), ZERO_VEC)
		})

		test('parallel, anti-parallel, and identical vectors yield exact zero vector', () => {
			const v = [q(3n, 7n), q(-11n, 13n), q(17n, 19n)]
			const posScaled = vecScale(q(29n, 31n), v)
			const negScaled = vecScale(q(-37n, 41n), v)

			assertVectorEqual(crossProductRationalSeries(v, v), ZERO_VEC)
			assertVectorEqual(crossProductRationalSeries(v, posScaled), ZERO_VEC)
			assertVectorEqual(crossProductRationalSeries(v, negScaled), ZERO_VEC)
		})

		test('exact arithmetic with very large BigInt components (> 2^100)', () => {
			const big = 10n ** 35n
			const a = [q(big + 1n, 3n), q(big + 2n, 5n), q(big + 3n, 7n)]
			const b = [q(big + 4n, 11n), q(big + 5n, 13n), q(big + 6n, 17n)]

			const c = crossProductRationalSeries(a, b)
			assertCanonicalVector(c)

			// Verify exact orthogonality and Lagrange's identity even at 10^35 scale
			assert.deepStrictEqual(dot(c, a), ZERO)
			assert.deepStrictEqual(dot(c, b), ZERO)
			assert.deepStrictEqual(normSq(c), qSub(qMul(normSq(a), normSq(b)), qMul(dot(a, b), dot(a, b))))
		})
	})

	describe('algebraic properties and independent cross-checks', () => {
		const sampleVectors = [
			[q(1n, 2n), q(-3n, 4n), q(5n, 6n)],
			[q(-7n, 8n), q(9n, 10n), q(-11n, 12n)],
			[q(13n, 17n), q(19n, 23n), q(-29n, 31n)],
			[q(0n), q(100n, 3n), q(-47n, 9n)],
			[q(-123456789012345678901n, 97n), q(987654321098765432109n, 101n), q(42n, 103n)],
		]

		test('anti-commutativity: a × b = -(b × a)', () => {
			for (let i = 0; i < sampleVectors.length; i++) {
				for (let j = i + 1; j < sampleVectors.length; j++) {
					const ab = crossProductRationalSeries(sampleVectors[i], sampleVectors[j])
					const ba = crossProductRationalSeries(sampleVectors[j], sampleVectors[i])
					assertCanonicalVector(ab)
					assertCanonicalVector(ba)
					assert.deepStrictEqual(ab, vecNeg(ba))
				}
			}
		})

		test('orthogonality cross-check: (a × b)·a = 0 and (a × b)·b = 0', () => {
			for (let i = 0; i < sampleVectors.length; i++) {
				for (let j = 0; j < sampleVectors.length; j++) {
					const a = sampleVectors[i]
					const b = sampleVectors[j]
					const c = crossProductRationalSeries(a, b)
					assertCanonicalVector(c)
					assert.deepStrictEqual(dot(c, a), ZERO)
					assert.deepStrictEqual(dot(c, b), ZERO)
				}
			}
		})

		test("Lagrange's identity cross-check: |a × b|^2 = |a|^2 |b|^2 - (a·b)^2", () => {
			for (let i = 0; i < sampleVectors.length; i++) {
				for (let j = 0; j < sampleVectors.length; j++) {
					const a = sampleVectors[i]
					const b = sampleVectors[j]
					const c = crossProductRationalSeries(a, b)
					const lhs = normSq(c)
					const abDot = dot(a, b)
					const rhs = qSub(qMul(normSq(a), normSq(b)), qMul(abDot, abDot))
					assert.deepStrictEqual(lhs, rhs)
				}
			}
		})

		test('bilinearity: (αa + βb) × c = α(a × c) + β(b × c) and second-argument linearity', () => {
			const a = sampleVectors[0]
			const b = sampleVectors[1]
			const c = sampleVectors[2]
			const alpha = q(7n, 13n)
			const beta = q(-5n, 11n)

			const lhs1 = crossProductRationalSeries(vecAdd(vecScale(alpha, a), vecScale(beta, b)), c)
			const rhs1 = vecAdd(
				vecScale(alpha, crossProductRationalSeries(a, c)),
				vecScale(beta, crossProductRationalSeries(b, c)),
			)
			assertVectorEqual(lhs1, rhs1)

			const lhs2 = crossProductRationalSeries(a, vecAdd(vecScale(alpha, b), vecScale(beta, c)))
			const rhs2 = vecAdd(
				vecScale(alpha, crossProductRationalSeries(a, b)),
				vecScale(beta, crossProductRationalSeries(a, c)),
			)
			assertVectorEqual(lhs2, rhs2)
		})

		test('Jacobi identity: a×(b×c) + b×(c×a) + c×(a×b) = 0', () => {
			const a = sampleVectors[0]
			const b = sampleVectors[1]
			const c = sampleVectors[2]

			const term1 = crossProductRationalSeries(a, crossProductRationalSeries(b, c))
			const term2 = crossProductRationalSeries(b, crossProductRationalSeries(c, a))
			const term3 = crossProductRationalSeries(c, crossProductRationalSeries(a, b))
			const sum = vecAdd(vecAdd(term1, term2), term3)
			assert.deepStrictEqual(sum, ZERO_VEC)
		})

		test('vector triple product (BAC-CAB): a × (b × c) = b(a·c) - c(a·b)', () => {
			const a = sampleVectors[0]
			const b = sampleVectors[1]
			const c = sampleVectors[2]

			const lhs = crossProductRationalSeries(a, crossProductRationalSeries(b, c))
			const rhs = vecSub(vecScale(dot(a, c), b), vecScale(dot(a, b), c))
			assertVectorEqual(lhs, rhs)
		})

		test('scalar triple product (a × b)·c equals independent 3×3 Sarrus determinant', () => {
			const a = sampleVectors[0]
			const b = sampleVectors[1]
			const c = sampleVectors[2]

			const stp = dot(crossProductRationalSeries(a, b), c)
			const det = det3x3Sarrus(a, b, c)
			assert.deepStrictEqual(stp, det)
		})

		test('floating-point cross-check against JS Number arithmetic within tolerance', () => {
			const a = [q(17n, 19n), q(-23n, 29n), q(31n, 37n)]
			const b = [q(-41n, 43n), q(47n, 53n), q(59n, 61n)]

			const exact = crossProductRationalSeries(a, b)
			assertCanonicalVector(exact)

			const af = a.map(qToNumber)
			const bf = b.map(qToNumber)
			const expectedFloat = [
				af[1] * bf[2] - af[2] * bf[1],
				af[2] * bf[0] - af[0] * bf[2],
				af[0] * bf[1] - af[1] * bf[0],
			]

			for (let idx = 0; idx < 3; idx++) {
				assert.ok(
					Math.abs(qToNumber(exact[idx]) - expectedFloat[idx]) < 1e-12,
					`component ${idx} mismatch`,
				)
			}
		})
	})

	describe('input validation', () => {
		const validVec = [q(1n), q(2n), q(3n)]

		test('throws TypeError when a or b is not an Array', () => {
			const nonArrays = [null, undefined, 42, '123', {}, { 0: q(1n), 1: q(2n), 2: q(3n), length: 3 }, new Int32Array(3)]
			for (const bad of nonArrays) {
				assert.throws(() => crossProductRationalSeries(bad, validVec), TypeError)
				assert.throws(() => crossProductRationalSeries(validVec, bad), TypeError)
			}
		})

		test('throws RangeError when a or b does not have length 3', () => {
			const wrongLengths = [[], [q(1n)], [q(1n), q(2n)], [q(1n), q(2n), q(3n), q(4n)]]
			for (const bad of wrongLengths) {
				assert.throws(() => crossProductRationalSeries(bad, validVec), RangeError)
				assert.throws(() => crossProductRationalSeries(validVec, bad), RangeError)
			}
		})

		test('throws TypeError for sparse arrays of length 3', () => {
			// eslint-disable-next-line no-sparse-arrays
			const sparse = [q(1n), , q(3n)]
			assert.throws(() => crossProductRationalSeries(sparse, validVec), TypeError)
			assert.throws(() => crossProductRationalSeries(validVec, new Array(3)), TypeError)
		})

		test('throws TypeError when any element is not a valid rational object with BigInt num/den', () => {
			const badElements = [
				null,
				undefined,
				1,
				1n,
				'1/2',
				[1n, 2n],
				{},
				{ num: 1n },
				{ den: 1n },
				{ num: 1, den: 2n },
				{ num: 1n, den: 2 },
				{ num: NaN, den: 1n },
				{ num: '1', den: '2' },
			]
			for (const badEl of badElements) {
				for (let idx = 0; idx < 3; idx++) {
					const vec = [...validVec]
					vec[idx] = badEl
					assert.throws(() => crossProductRationalSeries(vec, validVec), TypeError)
					assert.throws(() => crossProductRationalSeries(validVec, vec), TypeError)
				}
			}
		})

		test('throws RangeError when any component has denominator 0n', () => {
			const zeroDens = [
				{ num: 1n, den: 0n },
				{ num: 0n, den: 0n },
				{ num: -5n, den: 0n },
			]
			for (const badRat of zeroDens) {
				for (let idx = 0; idx < 3; idx++) {
					const vec = [...validVec]
					vec[idx] = badRat
					assert.throws(() => crossProductRationalSeries(vec, validVec), RangeError)
					assert.throws(() => crossProductRationalSeries(validVec, vec), RangeError)
				}
			}
		})
	})
})
