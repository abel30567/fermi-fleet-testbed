import { describe, test } from 'node:test'
import assert from 'node:assert'
import { unionBoolIterative } from './unionBoolIterative.js'

/**
 * Helper: compares two Sets for exact element equality (ignoring insertion order).
 *
 * @param {Set<unknown>} actual
 * @param {Set<unknown>} expected
 */
function assertSetsEqual(actual, expected) {
	assert.ok(actual instanceof Set, 'result should be a Set')
	assert.strictEqual(actual.size, expected.size, `expected size ${expected.size}, got ${actual.size}`)
	for (const item of expected) {
		assert.ok(actual.has(item), `expected set to contain ${String(item)}`)
	}
}

/**
 * Independent intersection helper for inclusion-exclusion verification.
 *
 * @param {Set<unknown>} a
 * @param {Set<unknown>} b
 * @returns {Set<unknown>}
 */
function intersect(a, b) {
	const out = new Set()
	for (const x of a) {
		if (b.has(x)) out.add(x)
	}
	return out
}

/**
 * Independent array-deduplication union using SameValueZero semantics.
 *
 * @param {...Set<unknown>} sets
 * @returns {unknown[]}
 */
function arrayDedupUnion(...sets) {
	const out = []
	for (const s of sets) {
		for (const item of s) {
			const exists = out.some((x) => x === item || (Number.isNaN(x) && Number.isNaN(item)))
			if (!exists) out.push(item)
		}
	}
	return out
}

describe('unionBoolIterative', () => {
	test('unions plain boolean sets across all subsets of {true, false}', () => {
		const empty = new Set()
		const t = new Set([true])
		const f = new Set([false])
		const tf = new Set([true, false])

		assertSetsEqual(unionBoolIterative(empty, empty), empty)
		assertSetsEqual(unionBoolIterative(t, empty), t)
		assertSetsEqual(unionBoolIterative(empty, f), f)
		assertSetsEqual(unionBoolIterative(t, f), tf)
		assertSetsEqual(unionBoolIterative(f, t), tf)
		assertSetsEqual(unionBoolIterative(t, t), t)
		assertSetsEqual(unionBoolIterative(f, f), f)
		assertSetsEqual(unionBoolIterative(t, tf), tf)
		assertSetsEqual(unionBoolIterative(tf, f), tf)
		assertSetsEqual(unionBoolIterative(tf, tf), tf)
	})

	test('unions disjoint, overlapping, and identical sets', () => {
		assertSetsEqual(
			unionBoolIterative(new Set([1, 2]), new Set([3, 4])),
			new Set([1, 2, 3, 4]),
		)
		assertSetsEqual(
			unionBoolIterative(new Set([1, 2, 3]), new Set([2, 3, 4])),
			new Set([1, 2, 3, 4]),
		)
		assertSetsEqual(
			unionBoolIterative(new Set(['a', 'b']), new Set(['a', 'b'])),
			new Set(['a', 'b']),
		)
	})

	test('handles empty sets and single-set input', () => {
		assertSetsEqual(unionBoolIterative(new Set(), new Set()), new Set())
		assertSetsEqual(unionBoolIterative(new Set(), new Set([10, 20])), new Set([10, 20]))
		assertSetsEqual(unionBoolIterative(new Set([10, 20]), new Set()), new Set([10, 20]))

		const single = new Set([true, false])
		const singleResult = unionBoolIterative(single)
		assertSetsEqual(singleResult, single)
		assert.notStrictEqual(singleResult, single)
	})

	test('unions three or more sets', () => {
		const a = new Set([1, 2])
		const b = new Set([2, 3])
		const c = new Set([3, 4])
		const d = new Set([5, 1])

		assertSetsEqual(unionBoolIterative(a, b, c), new Set([1, 2, 3, 4]))
		assertSetsEqual(unionBoolIterative(a, b, c, d), new Set([1, 2, 3, 4, 5]))
		assertSetsEqual(
			unionBoolIterative(new Set(), new Set([true]), new Set(), new Set([false])),
			new Set([true, false]),
		)
	})

	test('handles NaN, -0/+0, null, undefined, symbols, booleans, and object references', () => {
		const obj1 = { id: 1 }
		const obj2 = { id: 2 }
		const obj1Clone = { id: 1 }
		const sym = Symbol('flag')

		const a = new Set([NaN, -0, null, true, obj1, sym])
		const b = new Set([NaN, +0, undefined, false, obj1, obj2, obj1Clone])

		const res = unionBoolIterative(a, b)
		// NaN deduplicates with NaN; -0 deduplicates with +0; obj1 deduplicates with obj1; obj1Clone is distinct
		assert.strictEqual(res.size, 10)
		assert.ok(res.has(NaN))
		assert.ok(res.has(0))
		assert.ok(res.has(null))
		assert.ok(res.has(undefined))
		assert.ok(res.has(true))
		assert.ok(res.has(false))
		assert.ok(res.has(obj1))
		assert.ok(res.has(obj2))
		assert.ok(res.has(obj1Clone))
		assert.ok(res.has(sym))
	})

	test('does not mutate input sets and returns an independent Set', () => {
		const a = new Set([1, 2])
		const b = new Set([2, 3])
		const c = new Set([3, 4])

		const res = unionBoolIterative(a, b, c)
		assert.notStrictEqual(res, a)
		assert.notStrictEqual(res, b)
		assert.notStrictEqual(res, c)

		res.add(999)
		res.delete(1)

		assert.deepStrictEqual([...a], [1, 2])
		assert.deepStrictEqual([...b], [2, 3])
		assert.deepStrictEqual([...c], [3, 4])
	})

	test('throws TypeError on invalid or missing inputs', () => {
		assert.throws(() => unionBoolIterative(), TypeError)

		const invalidValues = [
			null,
			undefined,
			true,
			false,
			0,
			42,
			'set',
			[1, 2],
			{ a: 1 },
			new Map([['a', 1]]),
			new WeakSet(),
		]

		for (const bad of invalidValues) {
			assert.throws(() => unionBoolIterative(bad), TypeError)
			assert.throws(() => unionBoolIterative(new Set([1]), bad), TypeError)
			assert.throws(() => unionBoolIterative(bad, new Set([1])), TypeError)
			assert.throws(() => unionBoolIterative(new Set([1]), new Set([2]), bad), TypeError)
		}
	})

	test('cross-checks against inclusion-exclusion, spread Set, array dedup, and Set.prototype.union', () => {
		// Deterministic pseudo-random generator (LCG) for reproducible test cases
		let seed = 123456789
		const nextInt = (max) => {
			seed = (seed * 1664525 + 1013904223) >>> 0
			return seed % max
		}

		for (let trial = 0; trial < 50; trial++) {
			const a = new Set()
			const b = new Set()
			const c = new Set()

			const sizeA = nextInt(12)
			const sizeB = nextInt(12)
			const sizeC = nextInt(12)
			for (let i = 0; i < sizeA; i++) a.add(nextInt(15))
			for (let i = 0; i < sizeB; i++) b.add(nextInt(15))
			for (let i = 0; i < sizeC; i++) c.add(nextInt(15))

			const ab = unionBoolIterative(a, b)

			// 1. 2-set inclusion-exclusion: |A ∪ B| = |A| + |B| - |A ∩ B|
			const abInter = intersect(a, b)
			assert.strictEqual(ab.size, a.size + b.size - abInter.size)

			// 2. Compare against spread Set construction
			assertSetsEqual(ab, new Set([...a, ...b]))

			// 3. Compare against independent array deduplication
			const dedupAB = arrayDedupUnion(a, b)
			assert.strictEqual(ab.size, dedupAB.length)
			for (const item of dedupAB) {
				assert.ok(ab.has(item))
			}

			// 4. Compare against native Set.prototype.union when available (Node 22+)
			if (typeof Set.prototype.union === 'function') {
				assertSetsEqual(ab, a.union(b))
			}

			// 5. Algebraic properties: commutativity, idempotence, identity, associativity
			assertSetsEqual(ab, unionBoolIterative(b, a))
			assertSetsEqual(unionBoolIterative(a, a), a)
			assertSetsEqual(unionBoolIterative(a, new Set()), a)

			const abc = unionBoolIterative(a, b, c)
			assertSetsEqual(abc, unionBoolIterative(ab, c))
			assertSetsEqual(abc, unionBoolIterative(a, unionBoolIterative(b, c)))

			// 6. 3-set inclusion-exclusion:
			// |A ∪ B ∪ C| = |A| + |B| + |C| - |A∩B| - |A∩C| - |B∩C| + |A∩B∩C|
			const acInter = intersect(a, c)
			const bcInter = intersect(b, c)
			const abcInter = intersect(abInter, c)
			assert.strictEqual(
				abc.size,
				a.size + b.size + c.size - abInter.size - acInter.size - bcInter.size + abcInter.size,
			)
		}
	})
})
