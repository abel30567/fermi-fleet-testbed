import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { projectionRationalIterative } from './projectionRationalIterative.js'

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

function assertCanonicalVector(vec) {
	for (const q of vec) {
		assert.equal(typeof q.num, 'bigint')
		assert.equal(typeof q.den, 'bigint')
		assert.ok(q.den > 0n, `Expected positive denominator, got ${q.den}`)
		if (q.num === 0n) {
			assert.equal(q.den, 1n, `Expected zero denominator to be 1n, got ${q.den}`)
		} else {
			assert.equal(gcd(q.num, q.den), 1n, `Expected lowest terms for ${q.num}/${q.den}`)
		}
	}
}

/**
 * Independent exact rational arithmetic via naive unreduced cross-multiplication + final reduction,
 * used solely as an independent cross-check in tests.
 */
function naiveSub(a, b) {
	const num = a.num * b.den - b.num * a.den
	const den = a.den * b.den
	if (num === 0n) return { num: 0n, den: 1n }
	const s = den < 0n ? -1n : 1n
	const g = gcd(num, den)
	return { num: (num * s) / g, den: (den * s) / g }
}

function naiveAdd(a, b) {
	const num = a.num * b.den + b.num * a.den
	const den = a.den * b.den
	if (num === 0n) return { num: 0n, den: 1n }
	const s = den < 0n ? -1n : 1n
	const g = gcd(num, den)
	return { num: (num * s) / g, den: (den * s) / g }
}

function naiveMul(a, b) {
	const num = a.num * b.num
	const den = a.den * b.den
	if (num === 0n) return { num: 0n, den: 1n }
	const s = den < 0n ? -1n : 1n
	const g = gcd(num, den)
	return { num: (num * s) / g, den: (den * s) / g }
}

function naiveDot(a, b) {
	return a.reduce((acc, ai, i) => naiveAdd(acc, naiveMul(ai, b[i])), r(0, 1))
}

function toFloat(q) {
	return Number(q.num) / Number(q.den)
}

describe('projectionRationalIterative', () => {
	describe('normal cases', () => {
		it('computes exact 2D vector projection', () => {
			const u = [r(3), r(4)]
			const v = [r(1), r(2)]
			// u · v = 11, v · v = 5 -> (11/5) * [1, 2] = [11/5, 22/5]
			const res = projectionRationalIterative(u, v)
			assertCanonicalVector(res)
			assert.deepEqual(res, [r(11, 5), r(22, 5)])
		})

		it('computes exact 3D vector projection', () => {
			const u = [r(1), r(2), r(3)]
			const v = [r(2), r(-1), r(4)]
			// u · v = 2 - 2 + 12 = 12, v · v = 4 + 1 + 16 = 21, scale = 4/7
			const res = projectionRationalIterative(u, v)
			assertCanonicalVector(res)
			assert.deepEqual(res, [r(8, 7), r(-4, 7), r(16, 7)])
		})

		it('handles negative and fractional components accurately', () => {
			const u = [r(-3, 4), r(5, 6), r(-7, 2)]
			const v = [r(2, 3), r(-1, 2), r(4, 5)]
			// u · v = -1/2 - 5/12 - 14/5 = (-30 - 25 - 168)/60 = -223/60
			// v · v = 4/9 + 1/4 + 16/25 = (400 + 225 + 576)/900 = 1201/900
			// scale = (-223/60) / (1201/900) = (-223 * 15) / 1201 = -3345/1201
			// proj = [-2230/1201, 3345/2402, -2676/1201]
			const res = projectionRationalIterative(u, v)
			assertCanonicalVector(res)
			assert.deepEqual(res, [r(-2230, 1201), r(3345, 2402), r(-2676, 1201)])
		})

		it('handles 1D vectors (always yields normalized u)', () => {
			const u = [r(7, 3)]
			const v = [r(-5, 2)]
			const res = projectionRationalIterative(u, v)
			assertCanonicalVector(res)
			assert.deepEqual(res, [r(7, 3)])
		})
	})

	describe('geometric and edge cases', () => {
		it('yields zero vector for orthogonal vectors', () => {
			const u = [r(1), r(2), r(-1)]
			const v = [r(2), r(-1), r(0)]
			const res = projectionRationalIterative(u, v)
			assertCanonicalVector(res)
			assert.deepEqual(res, [r(0), r(0), r(0)])
		})

		it('yields zero vector when u is the zero vector', () => {
			const u = [r(0), r(0), r(0)]
			const v = [r(3, 7), r(-2, 5), r(1, 11)]
			const res = projectionRationalIterative(u, v)
			assertCanonicalVector(res)
			assert.deepEqual(res, [r(0), r(0), r(0)])
		})

		it('yields u when u is parallel or antiparallel to v', () => {
			const v = [r(3, 2), r(-5, 4), r(7, 6)]
			const same = projectionRationalIterative(v, v)
			assertCanonicalVector(same)
			assert.deepEqual(same, v)

			// u = (-4/3) * v = [-2, 5/3, -14/9]
			const uScaled = [r(-2), r(5, 3), r(-14, 9)]
			const anti = projectionRationalIterative(uScaled, v)
			assertCanonicalVector(anti)
			assert.deepEqual(anti, uScaled)
		})

		it('normalizes unreduced and negative-denominator inputs without mutating them', () => {
			const u = [
				{ num: 6n, den: 2n },
				{ num: -8n, den: -2n },
			]
			const v = [
				{ num: -2n, den: -2n },
				{ num: 6n, den: 3n },
			]
			const uSnapshot = u.map((q) => ({ ...q }))
			const vSnapshot = v.map((q) => ({ ...q }))

			const res = projectionRationalIterative(u, v)
			assertCanonicalVector(res)
			assert.deepEqual(res, [r(11, 5), r(22, 5)])
			assert.deepEqual(u, uSnapshot)
			assert.deepEqual(v, vSnapshot)
		})

		it('preserves exact precision for very large BigInts beyond MAX_SAFE_INTEGER', () => {
			const big = 10n ** 30n
			const u = [{ num: big + 1n, den: 1n }, { num: 0n, den: 1n }]
			const v = [{ num: big, den: 1n }, { num: big, den: 1n }]
			// u · v = big * (big + 1), v · v = 2 * big^2 -> scale = (big + 1) / (2 * big)
			// proj = [(big + 1) / 2, (big + 1) / 2]
			const res = projectionRationalIterative(u, v)
			assertCanonicalVector(res)
			assert.deepEqual(res, [
				{ num: big + 1n, den: 2n },
				{ num: big + 1n, den: 2n },
			])
		})
	})

	describe('invalid inputs', () => {
		it('throws TypeError when u or v is not an array', () => {
			const valid = [r(1), r(2)]
			for (const bad of [null, undefined, 42, 'abc', {}, new Float64Array([1, 2])]) {
				assert.throws(() => projectionRationalIterative(bad, valid), TypeError)
				assert.throws(() => projectionRationalIterative(valid, bad), TypeError)
			}
		})

		it('throws RangeError for empty vectors or mismatched lengths', () => {
			assert.throws(() => projectionRationalIterative([], []), RangeError)
			assert.throws(() => projectionRationalIterative([], [r(1)]), RangeError)
			assert.throws(() => projectionRationalIterative([r(1)], []), RangeError)
			assert.throws(() => projectionRationalIterative([r(1), r(2)], [r(1)]), RangeError)
		})

		it('throws TypeError for invalid rational elements', () => {
			const badElements = [
				null,
				undefined,
				1,
				'1/2',
				[1n, 2n],
				{},
				{ num: 1, den: 2n },
				{ num: 1n, den: 2 },
				{ num: 1n },
				{ den: 2n },
			]
			for (const bad of badElements) {
				assert.throws(() => projectionRationalIterative([bad], [r(1)]), TypeError)
				assert.throws(() => projectionRationalIterative([r(1)], [bad]), TypeError)
			}
		})

		it('throws RangeError for zero denominators', () => {
			assert.throws(() => projectionRationalIterative([{ num: 1n, den: 0n }], [r(1)]), RangeError)
			assert.throws(() => projectionRationalIterative([{ num: 0n, den: 0n }], [r(1)]), RangeError)
			assert.throws(() => projectionRationalIterative([r(1)], [{ num: 2n, den: 0n }]), RangeError)
		})

		it('throws RangeError when target vector v is the zero vector', () => {
			assert.throws(() => projectionRationalIterative([r(1), r(2)], [r(0), r(0)]), RangeError)
			assert.throws(
				() => projectionRationalIterative([r(1), r(2)], [{ num: 0n, den: 5n }, { num: 0n, den: -3n }]),
				RangeError,
			)
		})
	})

	describe('mathematical identities and independent cross-checks', () => {
		const testPairs = [
			{
				name: '3D integer vectors',
				u: [r(5), r(-3), r(7)],
				v: [r(-2), r(4), r(1)],
			},
			{
				name: '4D fractional vectors',
				u: [r(1, 3), r(-2, 5), r(7, 11), r(-4, 9)],
				v: [r(-3, 7), r(5, 8), r(-1, 2), r(9, 13)],
			},
			{
				name: '5D mixed-sign sparse vectors',
				u: [r(0), r(13, 6), r(-8, 3), r(0), r(5, 4)],
				v: [r(7, 2), r(0), r(-3, 5), r(11, 7), r(-2, 9)],
			},
		]

		for (const { name, u, v } of testPairs) {
			it(`satisfies idempotence, residual orthogonality, scale invariance, Pythagorean identity, and float sanity check (${name})`, () => {
				const p = projectionRationalIterative(u, v)
				assertCanonicalVector(p)

				// 1. Idempotence: proj_v(proj_v(u)) === proj_v(u)
				const p2 = projectionRationalIterative(p, v)
				assert.deepEqual(p2, p)

				// 2. Orthogonality of residual: (u - proj_v(u)) · v === 0
				const residual = u.map((ui, i) => naiveSub(ui, p[i]))
				const residualDotV = naiveDot(residual, v)
				assert.deepEqual(residualDotV, r(0, 1))

				// 3. Scale invariance of target vector: proj_{c*v}(u) === proj_v(u)
				const scalar = r(-17, 19)
				const scaledV = v.map((vi) => naiveMul(scalar, vi))
				const pScaled = projectionRationalIterative(u, scaledV)
				assert.deepEqual(pScaled, p)

				// 4. Pythagorean theorem: ||u||^2 === ||proj_v(u)||^2 + ||u - proj_v(u)||^2
				const normU2 = naiveDot(u, u)
				const normP2 = naiveDot(p, p)
				const normRes2 = naiveDot(residual, residual)
				assert.deepEqual(naiveAdd(normP2, normRes2), normU2)

				// 5. Floating-point independent computation cross-check
				const uf = u.map(toFloat)
				const vf = v.map(toFloat)
				const dotUVf = uf.reduce((acc, x, i) => acc + x * vf[i], 0)
				const dotVVf = vf.reduce((acc, x) => acc + x * x, 0)
				const expectedFloat = vf.map((x) => (dotUVf / dotVVf) * x)
				for (let i = 0; i < p.length; i++) {
					assert.ok(
						Math.abs(toFloat(p[i]) - expectedFloat[i]) < 1e-12,
						`Component ${i} float mismatch: ${toFloat(p[i])} vs ${expectedFloat[i]}`,
					)
				}
			})
		}

		it('satisfies linearity in u: proj_v(a*u1 + b*u2) === a*proj_v(u1) + b*proj_v(u2)', () => {
			const u1 = [r(2, 3), r(-1, 4), r(5, 6)]
			const u2 = [r(-7, 5), r(3, 2), r(-1, 3)]
			const v = [r(4, 7), r(-3, 5), r(2, 9)]
			const a = r(-5, 3)
			const b = r(7, 4)

			const combinedU = u1.map((x, i) => naiveAdd(naiveMul(a, x), naiveMul(b, u2[i])))
			const lhs = projectionRationalIterative(combinedU, v)

			const p1 = projectionRationalIterative(u1, v)
			const p2 = projectionRationalIterative(u2, v)
			const rhs = p1.map((x, i) => naiveAdd(naiveMul(a, x), naiveMul(b, p2[i])))

			assert.deepEqual(lhs, rhs)
		})
	})
})
