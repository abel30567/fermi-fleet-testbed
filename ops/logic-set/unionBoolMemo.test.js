import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { unionBoolMemo } from './unionBoolMemo.js'

/**
 * Independent reference implementation for Set union.
 *
 * @template T
 * @param {...Set<T>} sets
 * @returns {Set<T>}
 */
function referenceSetUnion(...sets) {
	const out = new Set()
	for (const s of sets) {
		for (const item of s) {
			out.add(item)
		}
	}
	return out
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible property-based cross-checks.
 *
 * @param {number} seed
 * @returns {() => number}
 */
function mulberry32(seed) {
	let a = seed >>> 0
	return () => {
		a = (a + 0x6d2b79f5) >>> 0
		let t = Math.imul(a ^ (a >>> 15), 1 | a)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

describe('unionBoolMemo - plain booleans', () => {
	test('handles all 4 truth-table combinations', () => {
		assert.equal(unionBoolMemo(false, false), false)
		assert.equal(unionBoolMemo(false, true), true)
		assert.equal(unionBoolMemo(true, false), true)
		assert.equal(unionBoolMemo(true, true), true)
	})

	test('supports variadic boolean operands', () => {
		assert.equal(unionBoolMemo(false, false, false), false)
		assert.equal(unionBoolMemo(false, false, true), true)
		assert.equal(unionBoolMemo(true, false, false, false), true)
		assert.equal(unionBoolMemo(false, true, false, true), true)
	})

	test('cross-checks against native logical OR and De Morgan law', () => {
		const bools = [false, true]
		for (const a of bools) {
			for (const b of bools) {
				const expectedOr = a || b
				const expectedDeMorgan = !(!a && !b)
				const actual = unionBoolMemo(a, b)
				assert.equal(actual, expectedOr)
				assert.equal(actual, expectedDeMorgan)
				assert.equal(actual, unionBoolMemo(b, a)) // commutativity
			}
		}

		// Associativity across all 8 triples
		for (const a of bools) {
			for (const b of bools) {
				for (const c of bools) {
					assert.equal(
						unionBoolMemo(unionBoolMemo(a, b), c),
						unionBoolMemo(a, unionBoolMemo(b, c)),
					)
					assert.equal(unionBoolMemo(a, b, c), a || b || c)
				}
			}
		}
	})
})

describe('unionBoolMemo - JS Set objects', () => {
	test('computes union of disjoint and overlapping sets', () => {
		const a = new Set([1, 2])
		const b = new Set([3, 4])
		assert.deepEqual(unionBoolMemo(a, b), new Set([1, 2, 3, 4]))

		const c = new Set([1, 2, 3])
		const d = new Set([2, 3, 4])
		assert.deepEqual(unionBoolMemo(c, d), new Set([1, 2, 3, 4]))
	})

	test('handles empty sets and identical set references', () => {
		const empty1 = new Set()
		const empty2 = new Set()
		const nonEmpty = new Set(['a', 'b'])

		assert.deepEqual(unionBoolMemo(empty1, empty2), new Set())
		assert.deepEqual(unionBoolMemo(empty1, nonEmpty), new Set(['a', 'b']))
		assert.deepEqual(unionBoolMemo(nonEmpty, empty1), new Set(['a', 'b']))

		const selfUnion = unionBoolMemo(nonEmpty, nonEmpty)
		assert.deepEqual(selfUnion, new Set(['a', 'b']))
		assert.notEqual(selfUnion, nonEmpty)
	})

	test('handles special JS values (NaN, -0/+0, null, undefined, objects, symbols)', () => {
		const obj = { id: 1 }
		const sym = Symbol('k')
		const a = new Set([NaN, -0, null, obj])
		const b = new Set([NaN, +0, undefined, sym, 42n])

		const result = unionBoolMemo(a, b)
		assert.equal(result.size, 7)
		assert.equal(result.has(NaN), true)
		assert.equal(result.has(0), true)
		assert.equal(result.has(null), true)
		assert.equal(result.has(undefined), true)
		assert.equal(result.has(obj), true)
		assert.equal(result.has(sym), true)
		assert.equal(result.has(42n), true)
	})

	test('memoization returns isolated copies and invalidates on input mutation', () => {
		const a = new Set([1, 2])
		const b = new Set([2, 3])

		const first = unionBoolMemo(a, b)
		const second = unionBoolMemo(a, b)
		assert.deepEqual(first, new Set([1, 2, 3]))
		assert.deepEqual(second, new Set([1, 2, 3]))
		assert.notEqual(first, second)

		// Mutating returned Set must not poison cache or inputs
		first.add(999)
		assert.equal(a.has(999), false)
		assert.equal(b.has(999), false)
		assert.deepEqual(unionBoolMemo(a, b), new Set([1, 2, 3]))

		// Adding to input Set invalidates cache
		a.add(4)
		assert.deepEqual(unionBoolMemo(a, b), new Set([1, 2, 4, 3]))

		// Same-size replacement in input Set also invalidates cache
		b.delete(3)
		b.add(5)
		assert.deepEqual(unionBoolMemo(a, b), new Set([1, 2, 4, 5]))
	})

	test('supports variadic Set operands', () => {
		const a = new Set([1, 2])
		const b = new Set([2, 3])
		const c = new Set([3, 4, 5])
		assert.deepEqual(unionBoolMemo(a, b, c), new Set([1, 2, 3, 4, 5]))
	})

	test('independent cross-check against reference union and inclusion-exclusion', () => {
		const rand = mulberry32(20261123)
		const universe = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 'x', 'y', null, NaN]

		for (let trial = 0; trial < 50; trial++) {
			const a = new Set()
			const b = new Set()
			const c = new Set()

			for (const item of universe) {
				if (rand() < 0.4) a.add(item)
				if (rand() < 0.4) b.add(item)
				if (rand() < 0.4) c.add(item)
			}

			const actualAB = unionBoolMemo(a, b)
			const expectedAB = referenceSetUnion(a, b)
			assert.deepEqual(actualAB, expectedAB)

			// Inclusion-exclusion principle: |A ∪ B| = |A| + |B| - |A ∩ B|
			let intersectionSize = 0
			for (const item of a) {
				if (b.has(item)) intersectionSize++
			}
			assert.equal(actualAB.size, a.size + b.size - intersectionSize)

			// Element-wise membership equivalence and commutativity of membership
			const actualBA = unionBoolMemo(b, a)
			assert.equal(actualAB.size, actualBA.size)
			for (const item of universe) {
				const expectedHas = a.has(item) || b.has(item)
				assert.equal(actualAB.has(item), expectedHas)
				assert.equal(actualBA.has(item), expectedHas)
			}

			// Associativity and variadic agreement
			const leftAssoc = unionBoolMemo(unionBoolMemo(a, b), c)
			const rightAssoc = unionBoolMemo(a, unionBoolMemo(b, c))
			const variadic = unionBoolMemo(a, b, c)
			const refABC = referenceSetUnion(a, b, c)
			assert.deepEqual(variadic, refABC)
			assert.equal(leftAssoc.size, rightAssoc.size)
			for (const item of universe) {
				assert.equal(leftAssoc.has(item), rightAssoc.has(item))
				assert.equal(variadic.has(item), leftAssoc.has(item))
			}
		}
	})
})

describe('unionBoolMemo - input validation', () => {
	test('throws TypeError on missing, invalid, boxed, or mixed arguments', () => {
		assert.throws(() => unionBoolMemo(), TypeError)
		assert.throws(() => unionBoolMemo(true), TypeError)
		assert.throws(() => unionBoolMemo(new Set([1])), TypeError)

		// Mixed boolean and Set
		assert.throws(() => unionBoolMemo(true, new Set()), TypeError)
		assert.throws(() => unionBoolMemo(new Set(), false), TypeError)

		// Boxed Boolean objects are not plain booleans
		assert.throws(() => unionBoolMemo(new Boolean(true), false), TypeError)
		assert.throws(() => unionBoolMemo(true, new Boolean(false)), TypeError)

		// Non-boolean / non-Set values
		assert.throws(() => unionBoolMemo(1, 0), TypeError)
		assert.throws(() => unionBoolMemo('true', 'false'), TypeError)
		assert.throws(() => unionBoolMemo(null, undefined), TypeError)
		assert.throws(() => unionBoolMemo([1, 2], [3, 4]), TypeError)
		assert.throws(() => unionBoolMemo(new Map(), new Map()), TypeError)
		assert.throws(() => unionBoolMemo({}, {}), TypeError)

		// Invalid variadic trailing arguments (must not be bypassed by short-circuiting)
		assert.throws(() => unionBoolMemo(true, false, 1), TypeError)
		assert.throws(() => unionBoolMemo(true, true, new Set()), TypeError)
		assert.throws(
			() => unionBoolMemo(new Set([1]), new Set([2]), [3]),
			TypeError,
		)
		assert.throws(
			() => unionBoolMemo(new Set([1]), new Set([2]), true),
			TypeError,
		)
	})
})
