import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { intersectionBoolSeries } from './intersectionBoolSeries.js'

/**
 * Independent De Morgan reference for Set intersection over finite universe U:
 * ⋂_k S_k = U \ ⋃_k (U \ S_k)
 */
function deMorganSetIntersection(sets) {
	const universe = new Set()
	for (const s of sets) {
		for (const x of s) universe.add(x)
	}
	const complementUnion = new Set()
	for (const s of sets) {
		for (const x of universe) {
			if (!s.has(x)) complementUnion.add(x)
		}
	}
	const out = new Set()
	for (const x of universe) {
		if (!complementUnion.has(x)) out.add(x)
	}
	return out
}

/**
 * Independent set equality check (order-independent, SameValueZero).
 */
function setsEqual(a, b) {
	if (a.size !== b.size) return false
	for (const x of a) {
		if (!b.has(x)) return false
	}
	return true
}

describe('intersectionBoolSeries - plain booleans', () => {
	test('computes the complete 2-variable boolean truth table', () => {
		assert.equal(intersectionBoolSeries(false, false), false)
		assert.equal(intersectionBoolSeries(false, true), false)
		assert.equal(intersectionBoolSeries(true, false), false)
		assert.equal(intersectionBoolSeries(true, true), true)
	})

	test('supports n-ary boolean intersections', () => {
		assert.equal(intersectionBoolSeries(true, true, true), true)
		assert.equal(intersectionBoolSeries(true, true, true, true, true), true)
		assert.equal(intersectionBoolSeries(false, true, true), false)
		assert.equal(intersectionBoolSeries(true, false, true), false)
		assert.equal(intersectionBoolSeries(true, true, false), false)
		assert.equal(intersectionBoolSeries(false, false, false), false)
	})

	test('satisfies boolean algebraic laws (commutativity, associativity, idempotence, identity, annihilator)', () => {
		const bools = [false, true]
		for (const a of bools) {
			// Idempotence, identity (true), annihilator (false)
			assert.equal(intersectionBoolSeries(a, a), a)
			assert.equal(intersectionBoolSeries(a, true), a)
			assert.equal(intersectionBoolSeries(a, false), false)
			for (const b of bools) {
				// Commutativity
				assert.equal(intersectionBoolSeries(a, b), intersectionBoolSeries(b, a))
				for (const c of bools) {
					// Associativity
					assert.equal(
						intersectionBoolSeries(intersectionBoolSeries(a, b), c),
						intersectionBoolSeries(a, intersectionBoolSeries(b, c))
					)
					// Distributivity over OR: a ∧ (b ∨ c) === (a ∧ b) ∨ (a ∧ c)
					assert.equal(
						intersectionBoolSeries(a, b || c),
						intersectionBoolSeries(a, b) || intersectionBoolSeries(a, c)
					)
				}
			}
		}
	})

	test('independent cross-check against De Morgan law and inclusion-exclusion for k = 2..4', () => {
		for (const k of [2, 3, 4]) {
			const total = 1 << k
			for (let mask = 0; mask < total; mask++) {
				const args = []
				for (let bit = 0; bit < k; bit++) {
					args.push(((mask >> bit) & 1) === 1)
				}
				const actual = intersectionBoolSeries(...args)
				const viaDeMorgan = !args.some((x) => !x)
				const viaEvery = args.every(Boolean)
				assert.equal(actual, viaDeMorgan)
				assert.equal(actual, viaEvery)

				if (k === 2) {
					const [a, b] = args
					const viaInclusionExclusion = Number(a) + Number(b) - Number(a || b) === 1
					assert.equal(actual, viaInclusionExclusion)
				}
			}
		}
	})
})

describe('intersectionBoolSeries - JS Set objects', () => {
	test('computes intersection of overlapping, disjoint, subset, and identical sets', () => {
		assert.deepEqual(
			intersectionBoolSeries(new Set([1, 2, 3]), new Set([2, 3, 4])),
			new Set([2, 3])
		)
		assert.deepEqual(
			intersectionBoolSeries(new Set(['a', 'b']), new Set(['c', 'd'])),
			new Set()
		)
		assert.deepEqual(
			intersectionBoolSeries(new Set([1, 2]), new Set([1, 2, 3, 4])),
			new Set([1, 2])
		)
		assert.deepEqual(
			intersectionBoolSeries(new Set([10, 20]), new Set([10, 20])),
			new Set([10, 20])
		)
	})

	test('supports n-ary Set intersections', () => {
		const s1 = new Set([1, 2, 3, 4, 5])
		const s2 = new Set([2, 3, 4, 6])
		const s3 = new Set([3, 4, 5, 7])
		const s4 = new Set([0, 3, 4, 9])
		assert.deepEqual(intersectionBoolSeries(s1, s2, s3, s4), new Set([3, 4]))
		assert.deepEqual(intersectionBoolSeries(s1, s2, new Set([99])), new Set())
	})

	test('handles empty sets and preserves immutability', () => {
		const empty = new Set()
		const nonEmpty = new Set([1, 2, 3])

		assert.deepEqual(intersectionBoolSeries(empty, empty), new Set())
		assert.deepEqual(intersectionBoolSeries(empty, nonEmpty), new Set())
		assert.deepEqual(intersectionBoolSeries(nonEmpty, empty), new Set())

		const selfResult = intersectionBoolSeries(nonEmpty, nonEmpty)
		assert.notEqual(selfResult, nonEmpty)
		assert.deepEqual(selfResult, nonEmpty)
		selfResult.add(999)
		assert.equal(nonEmpty.has(999), false)
	})

	test('handles JS SameValueZero edge cases (NaN, -0/+0, objects, symbols, BigInt, null, undefined)', () => {
		const sharedObj = { id: 1 }
		const distinctObjA = { id: 2 }
		const distinctObjB = { id: 2 }
		const sym = Symbol('k')

		const a = new Set([NaN, -0, null, undefined, 42n, sym, sharedObj, distinctObjA])
		const b = new Set([NaN, +0, null, undefined, 42n, sym, sharedObj, distinctObjB])

		const res = intersectionBoolSeries(a, b)
		assert.equal(res.size, 7)
		assert.equal(res.has(NaN), true)
		assert.equal(res.has(0), true)
		assert.equal(res.has(null), true)
		assert.equal(res.has(undefined), true)
		assert.equal(res.has(42n), true)
		assert.equal(res.has(sym), true)
		assert.equal(res.has(sharedObj), true)
		assert.equal(res.has(distinctObjA), false)
		assert.equal(res.has(distinctObjB), false)
	})

	test('independent cross-check against De Morgan complement identity and inclusion-exclusion cardinality', () => {
		// Deterministic PRNG (LCG) for reproducible subset generation over U = {0..15}
		let seed = 0x12345678
		const nextMask = () => {
			seed = (Math.imul(1664525, seed) + 1013904223) >>> 0
			return seed & 0xffff
		}
		const maskToSet = (mask) => {
			const s = new Set()
			for (let bit = 0; bit < 16; bit++) {
				if ((mask >> bit) & 1) s.add(bit)
			}
			return s
		}
		const unionOf = (...sets) => {
			const u = new Set()
			for (const s of sets) {
				for (const x of s) u.add(x)
			}
			return u
		}

		for (let trial = 0; trial < 50; trial++) {
			const a = maskToSet(nextMask())
			const b = maskToSet(nextMask())
			const c = maskToSet(nextMask())

			// 2-set De Morgan & inclusion-exclusion: |A ∩ B| = |A| + |B| - |A ∪ B|
			const ab = intersectionBoolSeries(a, b)
			const abDeMorgan = deMorganSetIntersection([a, b])
			assert.equal(setsEqual(ab, abDeMorgan), true)
			assert.equal(ab.size, a.size + b.size - unionOf(a, b).size)

			// Cross-check with native Set.prototype.intersection when available (Node 22+)
			if (typeof Set.prototype.intersection === 'function') {
				assert.equal(setsEqual(ab, a.intersection(b)), true)
			}

			// 3-set De Morgan & inclusion-exclusion:
			// |A ∩ B ∩ C| = |A ∪ B ∪ C| - |A| - |B| - |C| + |A ∩ B| + |A ∩ C| + |B ∩ C|
			const abc = intersectionBoolSeries(a, b, c)
			const abcDeMorgan = deMorganSetIntersection([a, b, c])
			assert.equal(setsEqual(abc, abcDeMorgan), true)
			const ac = intersectionBoolSeries(a, c)
			const bc = intersectionBoolSeries(b, c)
			assert.equal(
				abc.size,
				unionOf(a, b, c).size - a.size - b.size - c.size + ab.size + ac.size + bc.size
			)
		}
	})
})

describe('intersectionBoolSeries - input validation', () => {
	test('throws TypeError when fewer than two arguments are provided', () => {
		assert.throws(() => intersectionBoolSeries(), TypeError)
		assert.throws(() => intersectionBoolSeries(true), TypeError)
		assert.throws(() => intersectionBoolSeries(new Set([1])), TypeError)
	})

	test('throws TypeError for mixed boolean and Set operands', () => {
		assert.throws(() => intersectionBoolSeries(true, new Set([true])), TypeError)
		assert.throws(() => intersectionBoolSeries(new Set([true]), true), TypeError)
		assert.throws(() => intersectionBoolSeries(true, false, new Set()), TypeError)
		assert.throws(() => intersectionBoolSeries(new Set(), new Set(), false), TypeError)
	})

	test('throws TypeError for non-boolean, non-Set values including boxed Booleans', () => {
		assert.throws(() => intersectionBoolSeries(1, 1), TypeError)
		assert.throws(() => intersectionBoolSeries(0, 1), TypeError)
		assert.throws(() => intersectionBoolSeries('true', 'true'), TypeError)
		assert.throws(() => intersectionBoolSeries(null, null), TypeError)
		assert.throws(() => intersectionBoolSeries(undefined, undefined), TypeError)
		assert.throws(() => intersectionBoolSeries([1, 2], [2, 3]), TypeError)
		assert.throws(() => intersectionBoolSeries(new Map(), new Map()), TypeError)
		assert.throws(() => intersectionBoolSeries(new Boolean(true), true), TypeError)
		assert.throws(() => intersectionBoolSeries(true, new Boolean(true)), TypeError)
	})
})
