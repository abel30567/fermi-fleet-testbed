import { describe, test } from 'node:test'
import assert from 'node:assert'
import { projectionRationalIterative } from './projectionRationalIterative.js'

/** Helper to construct a rational literal concisely. */
const q = (num, den = 1n) => ({ num: BigInt(num), den: BigInt(den) })

/** Independent exact rational helpers for cross-checking algebraic identities. */
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

function norm(num, den) {
	if (num === 0n) return { num: 0n, den: 1n }
	if (den < 0n) {
		num = -num
		den = -den
	}
	const g = gcd(num, den)
	return { num: num / g, den: den / g }
}

function rAdd(a, b) {
	return norm(a.num * b.den + b.num * a.den, a.den * b.den)
}

function rSub(a, b) {
	return norm(a.num * b.den - b.num * a.den, a.den * b.den)
}

function rMul(a, b) {
	return norm(a.num * b.num, a.den * b.den)
}

function vDot(a, b) {
	let acc = q(0)
	for (let i = 0; i < a.length; i++) {
		acc = rAdd(acc, rMul(a[i], b[i]))
	}
	return acc
}

function vSub(a, b) {
	return a.map((ai, i) => rSub(ai, b[i]))
}

function vScale(s, v) {
	return v.map((vi) => rMul(s, vi))
}

function vAdd(a, b) {
	return a.map((ai, i) => rAdd(ai, b[i]))
}

function assertLowestTerms(vec) {
	for (const r of vec) {
		assert.strictEqual(typeof r.num, 'bigint')
		assert.strictEqual(typeof r.den, 'bigint')
		assert.ok(r.den > 0n, `expected positive denominator, got ${r.den}`)
		if (r.num === 0n) {
			assert.strictEqual(r.den, 1n, 'zero must be represented as 0n/1n')
		} else {
			assert.strictEqual(
				gcd(r.num, r.den),
				1n,
				`expected lowest terms for ${r.num}/${r.den}`
			)
		}
	}
}

describe('projectionRationalIterative', () => {
	test('projects onto a standard basis vector in 2D', () => {
		const u = [q(3), q(4)]
		const v = [q(1), q(0)]
		const p = projectionRationalIterative(u, v)
		assert.deepStrictEqual(p, [q(3), q(0)])
		assertLowestTerms(p)
	})

	test('projects non-trivial 2D fractions exactly', () => {
		// u = [1/2, 2/3], v = [3/4, -1/2]
		// u·v = 3/8 - 1/3 = 1/24
		// v·v = 9/16 + 1/4 = 13/16
		// scale = (1/24)/(13/16) = 2/39
		// proj = [1/26, -1/39]
		const u = [q(1, 2), q(2, 3)]
		const v = [q(3, 4), q(-1, 2)]
		const p = projectionRationalIterative(u, v)
		assert.deepStrictEqual(p, [q(1, 26), q(-1, 39)])
		assertLowestTerms(p)
	})

	test('projects 3D vectors with exact rational reduction', () => {
		const u = [q(1), q(2), q(3)]
		const v = [q(1), q(1), q(1)]
		const p = projectionRationalIterative(u, v)
		assert.deepStrictEqual(p, [q(2), q(2), q(2)])
		assertLowestTerms(p)
	})

	test('handles 1D vectors (projection equals u)', () => {
		const u = [q(5, 7)]
		const v = [q(-3, 11)]
		const p = projectionRationalIterative(u, v)
		assert.deepStrictEqual(p, [q(5, 7)])
		assertLowestTerms(p)
	})

	test('handles zero vector u and returns distinct canonical zero entries', () => {
		const u = [q(0), q(0), q(0)]
		const v = [q(2, 3), q(-5, 7), q(1, 2)]
		const p = projectionRationalIterative(u, v)
		assert.deepStrictEqual(p, [q(0), q(0), q(0)])
		assertLowestTerms(p)
		assert.notStrictEqual(p[0], p[1])
		assert.notStrictEqual(p[1], p[2])
	})

	test('returns canonical zero vector for orthogonal inputs', () => {
		const u = [q(1, 2), q(-1, 3)]
		const v = [q(2, 5), q(3, 5)]
		const p = projectionRationalIterative(u, v)
		assert.deepStrictEqual(p, [q(0), q(0)])
		assertLowestTerms(p)
	})

	test('preserves u when u is collinear with v (positive and negative scalar)', () => {
		const v = [q(3, 5), q(-7, 4), q(2, 9)]
		const uPos = vScale(q(5, 3), v)
		const uNeg = vScale(q(-11, 2), v)
		assert.deepStrictEqual(projectionRationalIterative(uPos, v), uPos)
		assert.deepStrictEqual(projectionRationalIterative(uNeg, v), uNeg)
	})

	test('normalizes unreduced inputs and negative denominators without mutating inputs', () => {
		const u = [
			{ num: 6n, den: -4n }, // -3/2
			{ num: 0n, den: -7n }, // 0/1
		]
		const v = [
			{ num: -4n, den: -6n }, // 2/3
			{ num: 8n, den: 12n }, // 2/3
		]
		const uSnap = u.map((r) => ({ ...r }))
		const vSnap = v.map((r) => ({ ...r }))

		const p = projectionRationalIterative(u, v)
		// u = [-3/2, 0], v = [2/3, 2/3]
		// u·v = -1, v·v = 8/9, scale = -9/8, proj = [-3/4, -3/4]
		assert.deepStrictEqual(p, [q(-3, 4), q(-3, 4)])
		assertLowestTerms(p)
		assert.deepStrictEqual(u, uSnap)
		assert.deepStrictEqual(v, vSnap)
	})

	test('preserves exact precision for BigInts far beyond Number.MAX_SAFE_INTEGER', () => {
		const big = 10n ** 30n
		const u = [{ num: big + 1n, den: 3n }, { num: big - 1n, den: 3n }]
		const v = [{ num: big, den: 1n }, { num: big, den: 1n }]
		// u·v = (2*big^2)/3, v·v = 2*big^2 => scale = 1/3 => proj = [big/3, big/3]
		const p = projectionRationalIterative(u, v)
		assert.deepStrictEqual(p, [
			{ num: big, den: 3n },
			{ num: big, den: 3n },
		])
		assertLowestTerms(p)
	})

	test('cross-check: orthogonality, idempotence, scale invariance, and Pythagorean theorem', () => {
		const cases = [
			{
				u: [q(5, 3), q(-2, 7), q(11, 4)],
				v: [q(-3, 2), q(4, 5), q(1, 6)],
			},
			{
				u: [q(-13, 17), q(19, 23), q(-29, 31), q(37, 41)],
				v: [q(2, 3), q(-5, 7), q(11, 13), q(-17, 19)],
			},
			{
				u: [q(1000003, 97), q(-999983, 101), q(0, 1), q(42, 13), q(-7, 1)],
				v: [q(1, 1000000007), q(-3, 500000003), q(7, 11), q(0, 1), q(5, 2)],
			},
		]

		for (const { u, v } of cases) {
			const proj = projectionRationalIterative(u, v)
			assertLowestTerms(proj)

			// 1. Orthogonality: (u - proj_v(u)) · v === 0
			const residual = vSub(u, proj)
			assert.deepStrictEqual(vDot(residual, v), q(0))

			// 2. Idempotence: proj_v(proj_v(u)) === proj_v(u)
			const projTwice = projectionRationalIterative(proj, v)
			assert.deepStrictEqual(projTwice, proj)

			// 3. Scale invariance in v: proj_{k*v}(u) === proj_v(u)
			for (const k of [q(7, 3), q(-11, 5)]) {
				const scaledV = vScale(k, v)
				assert.deepStrictEqual(projectionRationalIterative(u, scaledV), proj)
			}

			// 4. Pythagorean identity: ||u||^2 === ||proj||^2 + ||u - proj||^2
			const normU2 = vDot(u, u)
			const normProj2 = vDot(proj, proj)
			const normRes2 = vDot(residual, residual)
			assert.deepStrictEqual(normU2, rAdd(normProj2, normRes2))
		}
	})

	test('cross-check: linearity in u and agreement with floating-point projection', () => {
		const u1 = [q(3, 5), q(-4, 7), q(2, 3)]
		const u2 = [q(-1, 2), q(5, 6), q(-7, 4)]
		const v = [q(2, 3), q(-1, 5), q(4, 7)]
		const a = q(7, 4)
		const b = q(-3, 5)

		const lhs = projectionRationalIterative(vAdd(vScale(a, u1), vScale(b, u2)), v)
		const rhs = vAdd(
			vScale(a, projectionRationalIterative(u1, v)),
			vScale(b, projectionRationalIterative(u2, v))
		)
		assert.deepStrictEqual(lhs, rhs)

		// Independent floating-point cross-check on bounded inputs
		const uF = u1.map((r) => Number(r.num) / Number(r.den))
		const vF = v.map((r) => Number(r.num) / Number(r.den))
		const uvF = uF.reduce((acc, x, i) => acc + x * vF[i], 0)
		const vvF = vF.reduce((acc, x) => acc + x * x, 0)
		const projF = vF.map((x) => (uvF / vvF) * x)
		const projQ = projectionRationalIterative(u1, v)
		for (let i = 0; i < projQ.length; i++) {
			const asFloat = Number(projQ[i].num) / Number(projQ[i].den)
			assert.ok(Math.abs(asFloat - projF[i]) < 1e-12)
		}
	})

	test('validates input types and throws descriptive errors', () => {
		const valid = [q(1), q(2)]

		// Non-array inputs
		assert.throws(() => projectionRationalIterative(null, valid), TypeError)
		assert.throws(() => projectionRationalIterative(valid, undefined), TypeError)
		assert.throws(() => projectionRationalIterative('12', valid), TypeError)
		assert.throws(() => projectionRationalIterative(valid, { 0: q(1) }), TypeError)

		// Dimension mismatch & empty vectors
		assert.throws(() => projectionRationalIterative([q(1)], valid), RangeError)
		assert.throws(() => projectionRationalIterative([], []), RangeError)

		// Sparse array holes
		const sparse = new Array(2)
		sparse[0] = q(1)
		assert.throws(() => projectionRationalIterative(sparse, valid), TypeError)
		assert.throws(() => projectionRationalIterative(valid, sparse), TypeError)

		// Invalid rational element shapes
		assert.throws(() => projectionRationalIterative([null, q(1)], valid), TypeError)
		assert.throws(() => projectionRationalIterative([valid[0], 3], valid), TypeError)
		assert.throws(
			() => projectionRationalIterative([{ num: 1, den: 2n }, q(1)], valid),
			TypeError
		)
		assert.throws(
			() => projectionRationalIterative(valid, [{ num: 1n, den: 2 }, q(1)]),
			TypeError
		)

		// Zero denominator
		assert.throws(
			() => projectionRationalIterative([{ num: 1n, den: 0n }, q(1)], valid),
			RangeError
		)
		assert.throws(
			() => projectionRationalIterative(valid, [q(1), { num: 2n, den: 0n }]),
			RangeError
		)

		// Zero vector v (including unnormalized zeros)
		assert.throws(
			() => projectionRationalIterative(valid, [q(0), q(0)]),
			RangeError
		)
		assert.throws(
			() =>
				projectionRationalIterative(valid, [
					{ num: 0n, den: 5n },
					{ num: 0n, den: -3n },
				]),
			RangeError
		)
	})
})
