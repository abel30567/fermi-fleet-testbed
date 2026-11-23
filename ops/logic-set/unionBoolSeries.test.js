import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { unionBoolSeries } from './unionBoolSeries.js'

/**
 * Helper to check exact Set equality (SameValueZero membership & identical size).
 * @template T
 * @param {Set<T>} actual
 * @param {Set<T>} expected
 */
function assertSetsEqual(actual, expected) {
	assert.ok(actual instanceof Set, 'result should be a Set instance')
	assert.equal(actual.size, expected.size, `expected size ${expected.size}, got ${actual.size}`)
	for (const item of expected) {
		assert.ok(actual.has(item), `missing expected element ${String(item)}`)
	}
}

/**
 * Independent intersection helper for inclusion-exclusion and De Morgan cross-checks.
 * @template T
 * @param {Set<T>} a
 * @param {Set<T>} b
 * @returns {Set<T>}
 */
function intersect(a, b) {
	const out = new Set()
	for (const x of a) {
		if (b.has(x)) out.add(x)
	}
	return out
}

/**
 * Independent complement helper over a finite universe U.
 * @template T
 * @param {Set<T>} universe
 * @param {Set<T>} s
 * @returns {Set<T>}
 */
function complement(universe, s) {
	const out = new Set()
	for (const x of universe) {
		if (!s.has(x)) out.add(x)
	}
	return out
}

describe('unionBoolSeries - plain booleans', () => {
	test('binary truth table', () => {
		assert.equal(unionBoolSeries(false, false), false)
		assert.equal(unionBoolSeries(false, true), true)
		assert.equal(unionBoolSeries(true, false), true)
		assert.equal(unionBoolSeries(true, true), true)
	})

	test('unary and n-ary boolean edge cases', () => {
		assert.equal(unionBoolSeries(false), false)
		assert.equal(unionBoolSeries(true), true)
		assert.equal(unionBoolSeries(false, false, false), false)
		assert.equal(unionBoolSeries(false, false, true), true)
		assert.equal(unionBoolSeries(true, false, false, false), true)

		const manyFalse = new Array(500).fill(false)
		assert.equal(unionBoolSeries(...manyFalse), false)
		manyFalse[499] = true
		assert.equal(unionBoolSeries(...manyFalse), true)
	})

	test('independent cross-check: exhaustive truth tables vs native OR and De Morgan', () => {
		for (let arity = 1; arity <= 4; arity++) {
			const total = 1 << arity
			for (let mask = 0; mask < total; mask++) {
				const args = []
				for (let bit = 0; bit < arity; bit++) {
					args.push(Boolean((mask >> bit) & 1))
				}
				const expectedOr = args.some(Boolean)
				const expectedDeMorgan = !args.every((v) => !v)
				const actual = unionBoolSeries(...args)
				assert.equal(actual, expectedOr)
				assert.equal(actual, expectedDeMorgan)
			}
		}
	})

	test('boolean algebraic laws (commutativity, associativity, idempotence, identity, annihilation)', () => {
		for (const a of [false, true]) {
			assert.equal(unionBoolSeries(a, a), a)
			assert.equal(unionBoolSeries(a, false), a)
			assert.equal(unionBoolSeries(a, true), true)
			for (const b of [false, true]) {
				assert.equal(unionBoolSeries(a, b), unionBoolSeries(b, a))
				for (const c of [false, true]) {
					assert.equal(
						unionBoolSeries(unionBoolSeries(a, b), c),
						unionBoolSeries(a, unionBoolSeries(b, c)),
					)
				}
			}
		}
	})
})

describe('unionBoolSeries - Set objects', () => {
	test('normal overlapping, disjoint, and n-ary set unions', () => {
		assertSetsEqual(unionBoolSeries(new Set([1, 2]), new Set([2, 3])), new Set([1, 2, 3]))
		assertSetsEqual(unionBoolSeries(new Set(['a']), new Set(['b', 'c'])), new Set(['a', 'b', 'c']))
		assertSetsEqual(
			unionBoolSeries(new Set([1, 2]), new Set([2, 3]), new Set([3, 4, 5])),
			new Set([1, 2, 3, 4, 5]),
		)
	})

	test('empty sets, unary sets, and non-mutation', () => {
		const empty = new Set()
		const a = new Set([10, 20])
		const b = new Set([20, 30])

		assertSetsEqual(unionBoolSeries(empty, empty), new Set())
		assertSetsEqual(unionBoolSeries(empty, a), new Set([10, 20]))
		assertSetsEqual(unionBoolSeries(a, empty), new Set([10, 20]))

		const unary = unionBoolSeries(a)
		assertSetsEqual(unary, a)
		assert.notEqual(unary, a)

		const selfUnion = unionBoolSeries(a, a)
		assertSetsEqual(selfUnion, a)
		assert.notEqual(selfUnion, a)

		const merged = unionBoolSeries(a, b)
		assert.notEqual(merged, a)
		assert.notEqual(merged, b)
		assertSetsEqual(a, new Set([10, 20]))
		assertSetsEqual(b, new Set([20, 30]))
	})

	test('preserves JS SameValueZero semantics (NaN, -0/+0, objects, symbols, null, undefined, bigint)', () => {
		const obj1 = { k: 1 }
		const obj2 = { k: 1 }
		const sym = Symbol('u')
		const s1 = new Set([NaN, -0, null, undefined, obj1, sym, 42n, false])
		const s2 = new Set([NaN, +0, obj2, sym, 42n, true])

		const u = unionBoolSeries(s1, s2)
		assert.equal(u.size, 10)
		assert.ok(u.has(NaN))
		assert.ok(u.has(0))
		assert.ok(u.has(null))
		assert.ok(u.has(undefined))
		assert.ok(u.has(obj1))
		assert.ok(u.has(obj2))
		assert.ok(u.has(sym))
		assert.ok(u.has(42n))
		assert.ok(u.has(false))
		assert.ok(u.has(true))
	})

	test('independent cross-check: inclusion-exclusion cardinality and De Morgan law over universe', () => {
		const universe = new Set(Array.from({ length: 16 }, (_, i) => i))
		const a = new Set([0, 1, 2, 3, 4, 5, 6, 7])
		const b = new Set([4, 5, 6, 7, 8, 9, 10, 11])
		const c = new Set([2, 3, 6, 7, 10, 11, 14, 15])

		// 2-set inclusion-exclusion & De Morgan: A U B = U \ ((U \ A) n (U \ B))
		const ab = unionBoolSeries(a, b)
		assert.equal(ab.size, a.size + b.size - intersect(a, b).size)
		const abDeMorgan = complement(universe, intersect(complement(universe, a), complement(universe, b)))
		assertSetsEqual(ab, abDeMorgan)

		// 3-set inclusion-exclusion: |A U B U C| = |A|+|B|+|C|-|AnB|-|AnC|-|BnC|+|AnBnC|
		const abc = unionBoolSeries(a, b, c)
		const abInt = intersect(a, b)
		const acInt = intersect(a, c)
		const bcInt = intersect(b, c)
		const abcInt = intersect(abInt, c)
		const expectedSize = a.size + b.size + c.size - abInt.size - acInt.size - bcInt.size + abcInt.size
		assert.equal(abc.size, expectedSize)

		// De Morgan for 3 sets
		const abcDeMorgan = complement(
			universe,
			intersect(intersect(complement(universe, a), complement(universe, b)), complement(universe, c)),
		)
		assertSetsEqual(abc, abcDeMorgan)

		// Associativity and commutativity
		assertSetsEqual(unionBoolSeries(a, b), unionBoolSeries(b, a))
		assertSetsEqual(unionBoolSeries(unionBoolSeries(a, b), c), unionBoolSeries(a, unionBoolSeries(b, c)))
	})
})

describe('unionBoolSeries - input validation', () => {
	test('throws TypeError on missing, unsupported, or mixed inputs', () => {
		assert.throws(() => unionBoolSeries(), TypeError)
		assert.throws(() => unionBoolSeries(null), TypeError)
		assert.throws(() => unionBoolSeries(undefined), TypeError)
		assert.throws(() => unionBoolSeries(1, 0), TypeError)
		assert.throws(() => unionBoolSeries('true', 'false'), TypeError)
		assert.throws(() => unionBoolSeries([1], [2]), TypeError)
		assert.throws(() => unionBoolSeries({}, {}), TypeError)
		assert.throws(() => unionBoolSeries(new Map(), new Map()), TypeError)
		assert.throws(() => unionBoolSeries(new Boolean(true), false), TypeError)
		assert.throws(() => unionBoolSeries(true, new Set()), TypeError)
		assert.throws(() => unionBoolSeries(new Set(), false), TypeError)
		assert.throws(() => unionBoolSeries(true, false, 1), TypeError)
		assert.throws(() => unionBoolSeries(new Set([1]), [2]), TypeError)
	})
})
