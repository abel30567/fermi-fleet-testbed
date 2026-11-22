import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { intersectionBoolStable } from './intersectionBoolStable.js'

/**
 * Helper to check exact set equality under SameValueZero semantics.
 * @param {Set<unknown>} actual
 * @param {Set<unknown>} expected
 */
function assertSetEqual(actual, expected) {
	assert.ok(actual instanceof Set, 'result should be a Set')
	assert.equal(actual.size, expected.size, `expected size ${expected.size}, got ${actual.size}`)
	for (const value of expected) {
		assert.ok(actual.has(value), `expected result set to contain ${String(value)}`)
	}
}

describe('intersectionBoolStable - Set intersection (normal cases)', () => {
	test('overlapping sets', () => {
		const a = new Set([1, 2, 3, 4])
		const b = new Set([3, 4, 5, 6])
		assertSetEqual(intersectionBoolStable(a, b), new Set([3, 4]))
	})

	test('disjoint sets', () => {
		const a = new Set(['a', 'b'])
		const b = new Set(['c', 'd'])
		assertSetEqual(intersectionBoolStable(a, b), new Set())
	})

	test('subset and superset in both argument orders', () => {
		const sub = new Set([2, 4])
		const sup = new Set([1, 2, 3, 4, 5])
		assertSetEqual(intersectionBoolStable(sub, sup), new Set([2, 4]))
		assertSetEqual(intersectionBoolStable(sup, sub), new Set([2, 4]))
	})

	test('variadic sets (3+ operands)', () => {
		const a = new Set([1, 2, 3, 4, 5])
		const b = new Set([2, 3, 4, 6])
		const c = new Set([3, 4, 7])
		const d = new Set([4, 3, 8, 9])
		assertSetEqual(intersectionBoolStable(a, b, c), new Set([3, 4]))
		assertSetEqual(intersectionBoolStable(a, b, c, d), new Set([3, 4]))
		assertSetEqual(intersectionBoolStable(a, b, c, new Set([99])), new Set())
	})

	test('heterogeneous element types including objects, symbols, null, undefined, bigint', () => {
		const obj1 = { id: 1 }
		const obj2 = { id: 2 }
		const sym = Symbol('k')
		const a = new Set([obj1, obj2, sym, null, undefined, 10n, 'x', true])
		const b = new Set([obj1, { id: 2 }, sym, null, 10n, 'y', false])
		assertSetEqual(intersectionBoolStable(a, b), new Set([obj1, sym, null, 10n]))
	})
})

describe('intersectionBoolStable - Set edge cases', () => {
	test('empty sets in various positions', () => {
		const nonEmpty = new Set([1, 2, 3])
		assertSetEqual(intersectionBoolStable(new Set(), nonEmpty), new Set())
		assertSetEqual(intersectionBoolStable(nonEmpty, new Set()), new Set())
		assertSetEqual(intersectionBoolStable(new Set(), new Set()), new Set())
		assertSetEqual(intersectionBoolStable(nonEmpty, new Set(), nonEmpty), new Set())
	})

	test('NaN handling via SameValueZero', () => {
		const a = new Set([NaN, 1, 2])
		const b = new Set([0 / 0, 2, 3])
		const res = intersectionBoolStable(a, b)
		assertSetEqual(res, new Set([NaN, 2]))
		assert.equal(res.has(Number.NaN), true)
	})

	test('-0 and +0 handling via SameValueZero', () => {
		const a = new Set([-0, 1])
		const b = new Set([+0, 2])
		const res = intersectionBoolStable(a, b)
		assert.equal(res.size, 1)
		assert.equal(res.has(0), true)
		assert.equal(res.has(-0), true)
		const [onlyValue] = res
		assert.equal(Object.is(onlyValue, +0), true)
	})

	test('large vs small set efficiency and correctness in both orders', () => {
		const large = new Set()
		for (let i = 0; i < 100_000; i++) {
			large.add(i)
		}
		const small = new Set([-1, 0, 42, 99_999, 100_000])

		const start = performance.now()
		const res1 = intersectionBoolStable(large, small)
		const res2 = intersectionBoolStable(small, large)
		const elapsedMs = performance.now() - start

		const expected = new Set([0, 42, 99_999])
		assertSetEqual(res1, expected)
		assertSetEqual(res2, expected)
		// Iterating over the 5-element set first should complete well under 100ms
		assert.ok(elapsedMs < 500, `expected fast smallest-set pivot, took ${elapsedMs}ms`)
	})

	test('input immutability and fresh result reference', () => {
		const a = new Set([1, 2, 3])
		const b = new Set([2, 3, 4])
		const res = intersectionBoolStable(a, b)

		assert.notEqual(res, a)
		assert.notEqual(res, b)

		res.add(999)
		res.delete(2)

		assert.deepEqual([...a], [1, 2, 3])
		assert.deepEqual([...b], [2, 3, 4])

		// Same set reference passed twice still returns a new independent Set
		const selfRes = intersectionBoolStable(a, a)
		assert.notEqual(selfRes, a)
		assertSetEqual(selfRes, a)
		selfRes.clear()
		assert.deepEqual([...a], [1, 2, 3])
	})
})

describe('intersectionBoolStable - plain booleans', () => {
	test('binary boolean truth table (logical AND)', () => {
		assert.equal(intersectionBoolStable(true, true), true)
		assert.equal(intersectionBoolStable(true, false), false)
		assert.equal(intersectionBoolStable(false, true), false)
		assert.equal(intersectionBoolStable(false, false), false)
	})

	test('variadic boolean meet', () => {
		assert.equal(intersectionBoolStable(true, true, true, true), true)
		assert.equal(intersectionBoolStable(false, true, true, true), false)
		assert.equal(intersectionBoolStable(true, true, false, true), false)
		assert.equal(intersectionBoolStable(true, true, true, false), false)
	})
})

describe('intersectionBoolStable - strict input validation', () => {
	test('throws TypeError for fewer than 2 arguments', () => {
		assert.throws(() => intersectionBoolStable(), TypeError)
		assert.throws(() => intersectionBoolStable(true), TypeError)
		assert.throws(() => intersectionBoolStable(false), TypeError)
		assert.throws(() => intersectionBoolStable(new Set([1])), TypeError)
	})

	test('throws TypeError on mixed Set and boolean arguments without short-circuiting', () => {
		assert.throws(() => intersectionBoolStable(false, new Set()), TypeError)
		assert.throws(() => intersectionBoolStable(true, new Set([1])), TypeError)
		assert.throws(() => intersectionBoolStable(new Set(), false), TypeError)
		assert.throws(() => intersectionBoolStable(new Set([1]), true), TypeError)
		assert.throws(() => intersectionBoolStable(true, true, new Set()), TypeError)
		assert.throws(() => intersectionBoolStable(new Set(), new Set(), true), TypeError)
	})

	test('throws TypeError on invalid types even when earlier arguments could short-circuit', () => {
		assert.throws(() => intersectionBoolStable(false, 'not-bool'), TypeError)
		assert.throws(() => intersectionBoolStable(false, 0), TypeError)
		assert.throws(() => intersectionBoolStable(false, null), TypeError)
		assert.throws(() => intersectionBoolStable(false, undefined), TypeError)
		assert.throws(() => intersectionBoolStable(new Set(), [1, 2]), TypeError)
		assert.throws(() => intersectionBoolStable(new Set(), null), TypeError)
		assert.throws(() => intersectionBoolStable(new Set(), new Map()), TypeError)
		assert.throws(() => intersectionBoolStable(new Set(), new WeakSet()), TypeError)
	})

	test('rejects boxed Booleans and non-Set / non-boolean primitives', () => {
		// eslint-disable-next-line no-new-wrappers
		assert.throws(() => intersectionBoolStable(new Boolean(true), true), TypeError)
		// eslint-disable-next-line no-new-wrappers
		assert.throws(() => intersectionBoolStable(true, new Boolean(true)), TypeError)
		assert.throws(() => intersectionBoolStable(1, 1), TypeError)
		assert.throws(() => intersectionBoolStable('a', 'b'), TypeError)
		assert.throws(() => intersectionBoolStable([1], [1]), TypeError)
		assert.throws(() => intersectionBoolStable({}, {}), TypeError)
		assert.throws(() => intersectionBoolStable(null, null), TypeError)
		assert.throws(() => intersectionBoolStable(undefined, undefined), TypeError)
	})
})

describe('intersectionBoolStable - mathematical cross-checks', () => {
	/**
	 * Independent universe complement: U \ X
	 * @template T
	 * @param {Set<T>} universe
	 * @param {Set<T>} subset
	 * @returns {Set<T>}
	 */
	function complement(universe, subset) {
		const out = new Set()
		for (const x of universe) {
			if (!subset.has(x)) out.add(x)
		}
		return out
	}

	/**
	 * Independent union of sets
	 * @template T
	 * @param {...Set<T>} sets
	 * @returns {Set<T>}
	 */
	function union(...sets) {
		const out = new Set()
		for (const s of sets) {
			for (const x of s) out.add(x)
		}
		return out
	}

	test("De Morgan's law via universe complement: A ∩ B = U \\ ((U \\ A) ∪ (U \\ B))", () => {
		const sharedObj = { tag: 'shared' }
		const universe = new Set([0, 1, 2, 3, 4, 5, NaN, 'alpha', 'beta', sharedObj, null])

		const cases = [
			[new Set([0, 2, NaN, sharedObj]), new Set([-0, 2, 3, NaN, 'alpha'])],
			[new Set([1, 3, 5]), new Set([0, 2, 4])],
			[new Set(), new Set([1, 2, 3])],
			[new Set(universe), new Set([null, 'beta'])],
			[new Set([1, 2, 3, 4]), new Set([2, 3, 4, 5]), new Set([3, 4, 'alpha'])],
		]

		for (const sets of cases) {
			const actual = intersectionBoolStable(...sets)
			const unionOfComplements = union(...sets.map((s) => complement(universe, s)))
			const deMorganExpected = complement(universe, unionOfComplements)
			assertSetEqual(actual, deMorganExpected)
		}
	})

	test('Inclusion-exclusion principle for pairs and triples', () => {
		const pairs = [
			[new Set([1, 2, 3, 4]), new Set([3, 4, 5, 6])],
			[new Set([NaN, -0, 'a']), new Set([NaN, +0, 'b', 'c'])],
			[new Set([1, 2]), new Set([3, 4, 5])],
			[new Set(), new Set([1, 2, 3])],
		]

		for (const [a, b] of pairs) {
			const inter = intersectionBoolStable(a, b)
			const u = union(a, b)
			assert.equal(inter.size, a.size + b.size - u.size)
		}

		// 3-set inclusion-exclusion:
		// |A ∪ B ∪ C| = |A| + |B| + |C| - |A∩B| - |A∩C| - |B∩C| + |A∩B∩C|
		const a = new Set([1, 2, 3, 4, NaN, -0])
		const b = new Set([2, 3, 5, 6, NaN])
		const c = new Set([3, 4, 6, 7, +0])
		const lhs = union(a, b, c).size
		const rhs =
			a.size +
			b.size +
			c.size -
			intersectionBoolStable(a, b).size -
			intersectionBoolStable(a, c).size -
			intersectionBoolStable(b, c).size +
			intersectionBoolStable(a, b, c).size
		assert.equal(lhs, rhs)
	})

	test("Boolean De Morgan's law cross-check across all 2^3 triples", () => {
		const vals = [false, true]
		for (const x of vals) {
			for (const y of vals) {
				for (const z of vals) {
					const actual = intersectionBoolStable(x, y, z)
					const expected = !(!x || !y || !z)
					assert.equal(actual, expected)
				}
			}
		}
	})
})
