import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { projectionRationalMemo } from './projectionRationalMemo.js'

/**
 * Helper to construct a Rational object.
 * @param {bigint | number} num
 * @param {bigint | number} [den=1n]
 * @returns {{ num: bigint, den: bigint }}
 */
const r = (num, den = 1n) => ({ num: BigInt(num), den: BigInt(den) })

/**
 * Independent BigInt Euclidean GCD for test verification helpers.
 */
function refGcd(a, b) {
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
 * Independent rational normalization for cross-checking.
 */
function refNorm(num, den) {
	if (num === 0n) return { num: 0n, den: 1n }
	let n = num
	let d = den
	if (d < 0n) {
		n = -n
		d = -d
	}
	const g = refGcd(n, d)
	return { num: n / g, den: d / g }
}

function refAdd(a, b) {
	return refNorm(a.num * b.den + b.num * a.den, a.den * b.den)
}

function refSub(a, b) {
	return refNorm(a.num * b.den - b.num * a.den, a.den * b.den)
}

function refMul(a, b) {
	return refNorm(a.num * b.num, a.den * b.den)
}

function refDot(u, v) {
	let acc = { num: 0n, den: 1n }
	for (let i = 0; i < u.length; i++) {
		acc = refAdd(acc, refMul(u[i], v[i]))
	}
	return acc
}

function refVecSub(u, v) {
	return u.map((ui, i) => refSub(ui, v[i]))
}

function refVecScale(s, v) {
	return v.map((vi) => refMul(s, vi))
}

function refVecAdd(u, v) {
	return u.map((ui, i) => refAdd(ui, v[i]))
}

/**
 * Asserts every element of a rational vector is in canonical lowest terms.
 */
function assertCanonical(vec) {
	for (const q of vec) {
		assert.equal(typeof q.num, 'bigint')
		assert.equal(typeof q.den, 'bigint')
		assert.ok(q.den > 0n, `Expected positive denominator, got ${q.den}`)
		if (q.num === 0n) {
			assert.equal(q.den, 1n, `Zero rational must have den=1n, got ${q.den}`)
		} else {
			assert.equal(refGcd(q.num, q.den), 1n, `Rational ${q.num}/${q.den} is not in lowest terms`)
		}
	}
}

describe('projectionRationalMemo', () => {
	describe('normal cases', () => {
		it('projects 1D rational vector onto 1D non-zero vector', () => {
			const u = [r(5, 7)]
			const v = [r(-3, 4)]
			const res = projectionRationalMemo(u, v)
			assertCanonical(res)
			assert.deepEqual(res, [r(5, 7)])
		})

		it('projects 2D integer-valued rational vectors accurately', () => {
			// u = (3, 4), v = (1, 0) => proj = (3, 0)
			assert.deepEqual(
				projectionRationalMemo([r(3), r(4)], [r(1), r(0)]),
				[r(3), r(0)],
			)
			// u = (1, 2), v = (3, 4) => u·v = 11, v·v = 25 => (33/25, 44/25)
			const res = projectionRationalMemo([r(1), r(2)], [r(3), r(4)])
			assertCanonical(res)
			assert.deepEqual(res, [r(33, 25), r(44, 25)])
		})

		it('projects 3D fractional vectors and reduces output to lowest terms', () => {
			// u = (1/2, -2/3, 3/4), v = (2/5, 1/3, -1/2)
			// u·v = 1/5 - 2/9 - 3/8 = (72 - 80 - 135) / 360 = -143 / 360
			// v·v = 4/25 + 1/9 + 1/4 = (144 + 100 + 225) / 900 = 469 / 900
			// scalar = (-143 / 360) * (900 / 469) = -715 / 938
			// proj = (-715/938)*(2/5, 1/3, -1/2) = (-143/469, -715/2814, 715/1876)
			const u = [r(1, 2), r(-2, 3), r(3, 4)]
			const v = [r(2, 5), r(1, 3), r(-1, 2)]
			const res = projectionRationalMemo(u, v)
			assertCanonical(res)
			assert.deepEqual(res, [r(-143, 469), r(-715, 2814), r(715, 1876)])
		})

		it('handles unreduced inputs and negative denominators', () => {
			const u = [r(6, -12), r(-4, -6)] // (-1/2, 2/3)
			const v = [r(-10, -5), r(8, -4)] // (2, -2)
			// u·v = -1 - 4/3 = -7/3, v·v = 8 => scalar = -7/24 => proj = (-7/12, 7/12)
			const res = projectionRationalMemo(u, v)
			assertCanonical(res)
			assert.deepEqual(res, [r(-7, 12), r(7, 12)])
		})

		it('handles zero source vector u onto non-zero v', () => {
			const u = [r(0, 5), r(0, -3), r(0, 1)]
			const v = [r(1, 2), r(3, 4), r(-5, 6)]
			const res = projectionRationalMemo(u, v)
			assertCanonical(res)
			assert.deepEqual(res, [r(0, 1), r(0, 1), r(0, 1)])
		})

		it('preserves exact arithmetic for very large BigInts beyond MAX_SAFE_INTEGER', () => {
			const big = 10n ** 30n
			const u = [{ num: big + 1n, den: 3n }, { num: big + 2n, den: 5n }]
			const v = [{ num: big, den: 1n }, { num: 0n, den: 1n }]
			const res = projectionRationalMemo(u, v)
			assertCanonical(res)
			assert.deepEqual(res, [refNorm(big + 1n, 3n), r(0, 1)])
		})
	})

	describe('edge cases', () => {
		it('maps orthogonal vectors to the zero vector', () => {
			const u = [r(2, 3), r(-4, 5), r(1, 7)]
			// Pick v orthogonal to u: (4/5, 2/3, 0) => u·v = 8/15 - 8/15 + 0 = 0
			const v = [r(4, 5), r(2, 3), r(0, 1)]
			const res = projectionRationalMemo(u, v)
			assertCanonical(res)
			assert.deepEqual(res, [r(0, 1), r(0, 1), r(0, 1)])
		})

		it('maps parallel and anti-parallel vectors to normalized u', () => {
			const u = [r(3, 5), r(-9, 10), r(6, 7)]
			// v = (-7/3) * u
			const v = [r(-7, 5), r(21, 10), r(-2, 1)]
			const res = projectionRationalMemo(u, v)
			assertCanonical(res)
			assert.deepEqual(res, u)
		})

		it('throws RangeError for zero target vector v', () => {
			assert.throws(
				() => projectionRationalMemo([r(1), r(2)], [r(0), r(0)]),
				RangeError,
			)
			assert.throws(
				() => projectionRationalMemo([r(5, 3)], [r(0, -7)]),
				RangeError,
			)
		})

		it('throws RangeError for mismatched vector lengths', () => {
			assert.throws(
				() => projectionRationalMemo([r(1), r(2)], [r(1), r(2), r(3)]),
				RangeError,
			)
			assert.throws(
				() => projectionRationalMemo([r(1), r(2), r(3)], [r(1)]),
				RangeError,
			)
		})

		it('throws RangeError for empty vectors', () => {
			assert.throws(() => projectionRationalMemo([], []), RangeError)
			assert.throws(() => projectionRationalMemo([], [r(1)]), RangeError)
			assert.throws(() => projectionRationalMemo([r(1)], []), RangeError)
		})

		it('throws TypeError or RangeError for invalid inputs', () => {
			assert.throws(() => projectionRationalMemo(null, [r(1)]), TypeError)
			assert.throws(() => projectionRationalMemo([r(1)], undefined), TypeError)
			assert.throws(() => projectionRationalMemo('123', [r(1)]), TypeError)
			assert.throws(() => projectionRationalMemo([null], [r(1)]), TypeError)
			assert.throws(() => projectionRationalMemo([{ num: 1, den: 2n }], [r(1)]), TypeError)
			assert.throws(() => projectionRationalMemo([{ num: 1n, den: 2 }], [r(1)]), TypeError)
			assert.throws(() => projectionRationalMemo([{ num: 1n }], [r(1)]), TypeError)
			assert.throws(() => projectionRationalMemo([r(1)], [{ num: 1n, den: 0n }]), RangeError)
			assert.throws(() => projectionRationalMemo([{ num: 1n, den: 0n }], [r(1)]), RangeError)
		})
	})

	describe('memoization consistency', () => {
		it('returns consistent results across repeated and equivalent unreduced calls', () => {
			const u1 = [r(1, 2), r(3, 4), r(-5, 6)]
			const v1 = [r(2, 3), r(-1, 5), r(4, 7)]

			const u2 = [r(-3, -6), r(9, 12), r(10, -12)]
			const v2 = [r(4, 6), r(2, -10), r(-8, -14)]

			const first = projectionRationalMemo(u1, v1)
			const second = projectionRationalMemo(u1, v1)
			const equiv = projectionRationalMemo(u2, v2)

			assert.deepEqual(second, first)
			assert.deepEqual(equiv, first)
			assert.notEqual(second, first, 'Must return a fresh array copy from cache')
			assert.notEqual(second[0], first[0], 'Must return fresh rational copies from cache')
		})

		it('is immune to caller mutation of returned vectors and elements', () => {
			const u = [r(7, 3), r(-11, 4)]
			const v = [r(5, 2), r(1, 3)]

			const first = projectionRationalMemo(u, v)
			const snapshot = first.map((q) => ({ num: q.num, den: q.den }))

			// Mutate returned result aggressively
			first[0].num = 999999n
			first[0].den = 1n
			first.push(r(42))

			const afterMutation = projectionRationalMemo(u, v)
			assert.deepEqual(afterMutation, snapshot)
		})

		it('reuses memoized v·v consistently across different u vectors', () => {
			const v = [r(3, 7), r(-5, 11), r(13, 17)]
			const us = [
				[r(1, 2), r(0, 1), r(2, 3)],
				[r(-4, 5), r(7, 8), r(-1, 9)],
				[r(3, 7), r(-5, 11), r(13, 17)],
			]

			for (const u of us) {
				const p1 = projectionRationalMemo(u, v)
				const p2 = projectionRationalMemo(u, v)
				assert.deepEqual(p1, p2)
				assertCanonical(p1)
			}
		})
	})

	describe('independent mathematical cross-checks', () => {
		const testPairs = [
			{
				name: '2D mixed fractions',
				u: [r(5, 6), r(-7, 8)],
				v: [r(3, 4), r(2, 9)],
			},
			{
				name: '3D negative and positive fractions',
				u: [r(-11, 13), r(17, 19), r(-23, 29)],
				v: [r(2, 3), r(-5, 7), r(11, 13)],
			},
			{
				name: '4D with zeros and large primes',
				u: [r(101, 103), r(0, 1), r(-107, 109), r(113, 127)],
				v: [r(-1, 17), r(19, 23), r(0, 1), r(29, 31)],
			},
			{
				name: 'Large BigInt components',
				u: [r(10n ** 20n + 7n, 10n ** 10n + 3n), r(-(10n ** 18n) + 5n, 97n)],
				v: [r(10n ** 19n + 11n, 89n), r(10n ** 15n + 13n, 10n ** 8n + 1n)],
			},
		]

		it('satisfies idempotence: proj_v(proj_v(u)) == proj_v(u)', () => {
			for (const { name, u, v } of testPairs) {
				const p1 = projectionRationalMemo(u, v)
				const p2 = projectionRationalMemo(p1, v)
				assert.deepEqual(p2, p1, `Idempotence failed for ${name}`)
			}
		})

		it('satisfies residual orthogonality: (u - proj_v(u)) · v == 0', () => {
			for (const { name, u, v } of testPairs) {
				const p = projectionRationalMemo(u, v)
				const residual = refVecSub(u, p)
				const dot = refDot(residual, v)
				assert.deepEqual(dot, r(0, 1), `Residual orthogonality failed for ${name}`)
			}
		})

		it('satisfies Pythagorean theorem: ||u||^2 == ||proj_v(u)||^2 + ||u - proj_v(u)||^2', () => {
			for (const { name, u, v } of testPairs) {
				const p = projectionRationalMemo(u, v)
				const residual = refVecSub(u, p)
				const lhs = refDot(u, u)
				const rhs = refAdd(refDot(p, p), refDot(residual, residual))
				assert.deepEqual(rhs, lhs, `Pythagorean identity failed for ${name}`)
			}
		})

		it('satisfies target scale invariance: proj_{c*v}(u) == proj_v(u) and linearity in u', () => {
			const u1 = [r(2, 3), r(-5, 7), r(11, 13)]
			const u2 = [r(-3, 5), r(7, 11), r(-13, 17)]
			const v = [r(4, 9), r(-2, 5), r(7, 8)]

			// Scale invariance for positive and negative rational scalars
			const pBase = projectionRationalMemo(u1, v)
			assert.deepEqual(projectionRationalMemo(u1, refVecScale(r(-17, 23), v)), pBase)
			assert.deepEqual(projectionRationalMemo(u1, refVecScale(r(31, 7), v)), pBase)

			// Linearity: proj_v(a*u1 + b*u2) == a*proj_v(u1) + b*proj_v(u2)
			const a = r(5, 11)
			const b = r(-7, 13)
			const combinedU = refVecAdd(refVecScale(a, u1), refVecScale(b, u2))
			const lhs = projectionRationalMemo(combinedU, v)
			const rhs = refVecAdd(
				refVecScale(a, projectionRationalMemo(u1, v)),
				refVecScale(b, projectionRationalMemo(u2, v)),
			)
			assert.deepEqual(lhs, rhs)
		})
	})
})
