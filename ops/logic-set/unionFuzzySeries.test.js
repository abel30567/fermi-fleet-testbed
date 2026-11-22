import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { unionFuzzySeries } from './unionFuzzySeries.js'

const EPS = 1e-15

function assertClose(actual, expected, tol = EPS) {
	assert.ok(
		Math.abs(actual - expected) <= tol,
		`Expected ${actual} to be within ${tol} of ${expected} (diff=${Math.abs(actual - expected)})`,
	)
}

describe('unionFuzzySeries', () => {
	describe('normal cases', () => {
		it('computes Zadeh union for scalar fuzzy truth values', () => {
			assert.strictEqual(unionFuzzySeries(0.25, 0.75), 0.75)
			assert.strictEqual(unionFuzzySeries(0.75, 0.25), 0.75)
			assertClose(unionFuzzySeries(0.1, 0.2), 0.2)
			assertClose(unionFuzzySeries(0.85, 0.33), 0.85)
			assertClose(unionFuzzySeries(0.15, 0.42, 0.91, 0.6), 0.91)
		})

		it('computes element-wise Zadeh union for indexed membership arrays', () => {
			const res = unionFuzzySeries([0.25, 0.5, 0.75, 0], [0.5, 0.25, 0.75, 1])
			assert.deepStrictEqual(res, [0.5, 0.5, 0.75, 1])

			const multi = unionFuzzySeries([0.1, 0.8], [0.4, 0.2], [0.3, 0.9])
			assert.strictEqual(multi.length, 2)
			assertClose(multi[0], 0.4)
			assertClose(multi[1], 0.9)
		})

		it('computes Zadeh union for keyed fuzzy sets with overlapping and disjoint supports', () => {
			const a = { cold: 0.8, warm: 0.25, hot: 0 }
			const b = { warm: 0.75, hot: 0.5, boiling: 1 }
			const res = unionFuzzySeries(a, b)
			assert.deepStrictEqual(res, {
				cold: 0.8,
				warm: 0.75,
				hot: 0.5,
				boiling: 1,
			})
		})

		it('supports variadic (3+) keyed fuzzy sets without mutating inputs', () => {
			const a = { x: 0.25, y: 0.5 }
			const b = { y: 0.75, z: 0.125 }
			const c = { x: 0.5, z: 0.25, w: 1 }
			const res = unionFuzzySeries(a, b, c)
			assert.deepStrictEqual(res, { x: 0.5, y: 0.75, z: 0.25, w: 1 })
			assert.deepStrictEqual(a, { x: 0.25, y: 0.5 })
			assert.deepStrictEqual(b, { y: 0.75, z: 0.125 })
			assert.deepStrictEqual(c, { x: 0.5, z: 0.25, w: 1 })
		})
	})

	describe('edge cases and Zadeh algebraic laws', () => {
		it('reduces to classical Boolean OR / crisp set union on {0, 1}', () => {
			assert.strictEqual(unionFuzzySeries(0, 0), 0)
			assert.strictEqual(unionFuzzySeries(0, 1), 1)
			assert.strictEqual(unionFuzzySeries(1, 0), 1)
			assert.strictEqual(unionFuzzySeries(1, 1), 1)
			assert.deepStrictEqual(
				unionFuzzySeries({ a: 1, b: 0 }, { b: 1, c: 0 }),
				{ a: 1, b: 1, c: 0 },
			)
		})

		it('handles empty arrays, empty objects, null-prototype objects, and -0', () => {
			assert.deepStrictEqual(unionFuzzySeries([], []), [])
			assert.deepStrictEqual(unionFuzzySeries({}, {}), {})
			assert.deepStrictEqual(unionFuzzySeries({}, { a: 0.5 }), { a: 0.5 })
			assert.deepStrictEqual(unionFuzzySeries({ a: 0.5 }, {}), { a: 0.5 })

			const nullProtoA = Object.assign(Object.create(null), { p: 0.25 })
			const nullProtoB = Object.assign(Object.create(null), { p: 0.75, q: 0.5 })
			assert.deepStrictEqual(unionFuzzySeries(nullProtoA, nullProtoB), {
				p: 0.75,
				q: 0.5,
			})

			const z = unionFuzzySeries(-0, -0)
			assert.strictEqual(Object.is(z, 0), true)
			assert.strictEqual(Object.is(unionFuzzySeries(-0, 0), 0), true)
		})

		it('handles __proto__ key safely as an own enumerable data property', () => {
			const a = JSON.parse('{"__proto__": 0.25, "x": 0.5}')
			const b = JSON.parse('{"__proto__": 0.75}')
			const res = unionFuzzySeries(a, b)
			assert.strictEqual(Object.getPrototypeOf(res), Object.prototype)
			assert.strictEqual(
				Object.prototype.hasOwnProperty.call(res, '__proto__'),
				true,
			)
			assert.strictEqual(res['__proto__'], 0.75)
			assert.strictEqual(res.x, 0.5)
		})

		it('satisfies commutativity, associativity, idempotence, identity, and annihilator laws', () => {
			const samples = [0, 0.0001, 0.125, 0.37, 0.5, 0.73, 0.9999, 1]
			for (const a of samples) {
				// Idempotence: a ∨ a = a
				assert.strictEqual(unionFuzzySeries(a, a), a)
				// Identity: a ∨ 0 = a
				assert.strictEqual(unionFuzzySeries(a, 0), a)
				assert.strictEqual(unionFuzzySeries(0, a), a)
				// Annihilator: a ∨ 1 = 1
				assertClose(unionFuzzySeries(a, 1), 1)
				assertClose(unionFuzzySeries(1, a), 1)

				for (const b of samples) {
					// Commutativity: a ∨ b = b ∨ a (bit-exact)
					assert.strictEqual(unionFuzzySeries(a, b), unionFuzzySeries(b, a))
					for (const c of samples) {
						// Associativity: (a ∨ b) ∨ c = a ∨ (b ∨ c)
						assertClose(
							unionFuzzySeries(unionFuzzySeries(a, b), c),
							unionFuzzySeries(a, unionFuzzySeries(b, c)),
						)
					}
				}
			}
		})

		it('stays strictly within [0, 1] near extreme boundary values', () => {
			const tiny = Number.MIN_VALUE
			const nearOne = 1 - Number.EPSILON / 2
			const u1 = unionFuzzySeries(tiny, 0)
			const u2 = unionFuzzySeries(nearOne, 1)
			const u3 = unionFuzzySeries(tiny, nearOne)
			for (const v of [u1, u2, u3]) {
				assert.ok(v >= 0 && v <= 1, `Expected ${v} to be in [0, 1]`)
			}
		})
	})

	describe('invalid inputs', () => {
		it('throws TypeError when given fewer than 2 operands', () => {
			assert.throws(() => unionFuzzySeries(), TypeError)
			assert.throws(() => unionFuzzySeries(0.5), TypeError)
			assert.throws(() => unionFuzzySeries([0.5]), TypeError)
			assert.throws(() => unionFuzzySeries({ a: 0.5 }), TypeError)
		})

		it('throws TypeError for unsupported or mixed operand types', () => {
			assert.throws(() => unionFuzzySeries('0.5', '0.6'), TypeError)
			assert.throws(() => unionFuzzySeries(null, { a: 0.5 }), TypeError)
			assert.throws(() => unionFuzzySeries(undefined, 0.5), TypeError)
			assert.throws(() => unionFuzzySeries(true, false), TypeError)
			assert.throws(() => unionFuzzySeries(0.5, [0.5]), TypeError)
			assert.throws(() => unionFuzzySeries([0.5], { a: 0.5 }), TypeError)
			assert.throws(() => unionFuzzySeries({ a: 0.5 }, [0.5]), TypeError)
			assert.throws(() => unionFuzzySeries(new Map(), new Map()), TypeError)
			assert.throws(() => unionFuzzySeries(new Date(), new Date()), TypeError)
		})

		it('throws TypeError for non-number membership entries or sparse arrays', () => {
			assert.throws(() => unionFuzzySeries([0.5, '0.2'], [0.1, 0.2]), TypeError)
			assert.throws(() => unionFuzzySeries({ a: '0.5' }, { a: 0.5 }), TypeError)
			// eslint-disable-next-line no-sparse-arrays
			assert.throws(() => unionFuzzySeries([0.5, , 0.2], [0.1, 0.2, 0.3]), TypeError)
		})

		it('throws RangeError for membership degrees outside [0, 1] or non-finite', () => {
			for (const bad of [-0.001, -1, 1.001, 2, NaN, Infinity, -Infinity]) {
				assert.throws(() => unionFuzzySeries(bad, 0.5), RangeError)
				assert.throws(() => unionFuzzySeries(0.5, bad), RangeError)
				assert.throws(() => unionFuzzySeries([bad], [0.5]), RangeError)
				assert.throws(() => unionFuzzySeries({ a: bad }, { a: 0.5 }), RangeError)
			}
		})

		it('throws RangeError when array operands have different lengths', () => {
			assert.throws(() => unionFuzzySeries([0.1, 0.2], [0.1]), RangeError)
			assert.throws(
				() => unionFuzzySeries([0.1, 0.2], [0.3, 0.4], [0.5]),
				RangeError,
			)
		})
	})

	describe('independent cross-checks', () => {
		it('matches Zadeh De Morgan identity 1 - min(1 - a, 1 - b) and Math.max across a grid', () => {
			const deMorganUnion = (a, b) => 1 - Math.min(1 - a, 1 - b)
			const grid = Array.from({ length: 21 }, (_, i) => i / 20)

			for (const a of grid) {
				for (const b of grid) {
					const actual = unionFuzzySeries(a, b)
					assertClose(actual, Math.max(a, b))
					assertClose(actual, deMorganUnion(a, b))
				}
			}
		})

		it('matches the Chebyshev L_p norm limit (a^p + b^p)^(1/p) as p grows large', () => {
			// For a, b in [0, 1], max(a, b) = lim_{p -> inf} (a^p + b^p)^(1/p).
			// With p = 256, 2^(1/256) - 1 ≈ 0.00271, so L_p matches max(a, b) within 3e-3
			// everywhere and much tighter when a !== b.
			const lpNorm = (a, b, p) => (a ** p + b ** p) ** (1 / p)
			const pairs = [
				[0.15, 0.85],
				[0.72, 0.31],
				[0.4, 0.4],
				[0.0, 0.63],
				[0.95, 0.91],
			]

			for (const [a, b] of pairs) {
				const actual = unionFuzzySeries(a, b)
				const approxP64 = lpNorm(a, b, 64)
				const approxP256 = lpNorm(a, b, 256)
				// L_p norm converges monotonically from above toward Zadeh union
				assert.ok(
					approxP64 + 1e-12 >= approxP256 && approxP256 + 1e-12 >= actual,
					`Expected monotonic convergence for (${a}, ${b})`,
				)
				assertClose(actual, approxP256, 3e-3)
			}
		})

		it('matches independent set-level Zadeh De Morgan computation on random-like fuzzy sets', () => {
			// Deterministic pseudo-random fuzzy sets via LCG
			let seed = 42
			const next = () => {
				seed = (seed * 1664525 + 1013904223) >>> 0
				return seed / 0xffffffff
			}

			const universe = Array.from({ length: 30 }, (_, i) => `u${i}`)
			const setA = {}
			const setB = {}
			const setC = {}
			for (const u of universe) {
				if (next() > 0.2) setA[u] = next()
				if (next() > 0.2) setB[u] = next()
				if (next() > 0.2) setC[u] = next()
			}

			const actual = unionFuzzySeries(setA, setB, setC)
			const expectedKeys = new Set([
				...Object.keys(setA),
				...Object.keys(setB),
				...Object.keys(setC),
			])

			assert.deepStrictEqual(
				Object.keys(actual).sort(),
				[...expectedKeys].sort(),
			)

			for (const k of expectedKeys) {
				const muA = setA[k] ?? 0
				const muB = setB[k] ?? 0
				const muC = setC[k] ?? 0
				// Independent De Morgan formula: 1 - min(1 - muA, 1 - muB, 1 - muC)
				const expected = 1 - Math.min(1 - muA, 1 - muB, 1 - muC)
				assertClose(actual[k], expected)
			}
		})
	})
})
