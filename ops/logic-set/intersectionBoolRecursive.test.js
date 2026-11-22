import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { intersectionBoolRecursive } from './intersectionBoolRecursive.js'

/**
 * Independent iterative reference implementation for cross-checking.
 *
 * @template T
 * @param {...Set<T>} sets
 * @returns {Set<T>}
 */
function iterativeIntersection(...sets) {
	const [first, ...rest] = sets
	const out = new Set()
	for (const value of first) {
		let inAll = true
		for (const s of rest) {
			if (!s.has(value)) {
				inAll = false
				break
			}
		}
		if (inAll) {
			out.add(value)
		}
	}
	return out
}

/**
 * Computes set union for identity checks.
 *
 * @template T
 * @param {...Set<T>} sets
 * @returns {Set<T>}
 */
function unionSets(...sets) {
	const out = new Set()
	for (const s of sets) {
		for (const value of s) {
			out.add(value)
		}
	}
	return out
}

/**
 * Computes complement of `set` relative to finite universe `universe`.
 *
 * @template T
 * @param {Set<T>} universe
 * @param {Set<T>} set
 * @returns {Set<T>}
 */
function complementSet(universe, set) {
	const out = new Set()
	for (const value of universe) {
		if (!set.has(value)) {
			out.add(value)
		}
	}
	return out
}

describe('intersectionBoolRecursive', () => {
	describe('normal cases', () => {
		test('intersects two sets with partial overlap', () => {
			const a = new Set([1, 2, 3, 4])
			const b = new Set([3, 4, 5, 6])
			const result = intersectionBoolRecursive(a, b)
			assert.deepEqual(result, new Set([3, 4]))
		})

		test('intersects sets of plain booleans', () => {
			assert.deepEqual(
				intersectionBoolRecursive(new Set([true, false]), new Set([true])),
				new Set([true]),
			)
			assert.deepEqual(
				intersectionBoolRecursive(new Set([true, false]), new Set([false, true])),
				new Set([true, false]),
			)
			assert.deepEqual(
				intersectionBoolRecursive(new Set([true]), new Set([false])),
				new Set(),
			)
		})

		test('intersects many sets across even and odd argument counts', () => {
			const s1 = new Set([1, 2, 3, 4, 5, 6])
			const s2 = new Set([2, 3, 4, 5, 7])
			const s3 = new Set([3, 4, 5, 8])
			assert.deepEqual(intersectionBoolRecursive(s1, s2, s3), new Set([3, 4, 5]))

			const s4 = new Set([0, 3, 5, 9])
			assert.deepEqual(intersectionBoolRecursive(s1, s2, s3, s4), new Set([3, 5]))

			const manySets = Array.from({ length: 15 }, (_, idx) => {
				const s = new Set(['common', `only-${idx}`])
				if (idx % 2 === 0) s.add('even')
				return s
			})
			assert.deepEqual(intersectionBoolRecursive(...manySets), new Set(['common']))
		})

		test('returns empty set for disjoint sets', () => {
			assert.deepEqual(
				intersectionBoolRecursive(new Set([1, 2]), new Set([3, 4])),
				new Set(),
			)

			// Pairwise overlapping, but globally disjoint
			const a = new Set([1, 2])
			const b = new Set([2, 3])
			const c = new Set([3, 1])
			assert.deepEqual(intersectionBoolRecursive(a, b, c), new Set())
		})

		test('handles mixed value types including NaN, -0/+0, null, undefined, symbols, BigInts, and objects', () => {
			const sharedObj = { id: 1 }
			const sym = Symbol('shared')
			const a = new Set([
				true,
				false,
				0,
				NaN,
				Infinity,
				'hello',
				null,
				undefined,
				sym,
				10n,
				sharedObj,
				{ id: 2 },
			])
			const b = new Set([
				false,
				-0,
				NaN,
				'hello',
				null,
				undefined,
				sym,
				10n,
				sharedObj,
				{ id: 2 },
				'extra',
			])

			const result = intersectionBoolRecursive(a, b)
			assert.equal(result.size, 9)
			assert.equal(result.has(false), true)
			assert.equal(result.has(true), false)
			assert.equal(result.has(0), true)
			assert.equal(result.has(NaN), true)
			assert.equal(result.has('hello'), true)
			assert.equal(result.has(null), true)
			assert.equal(result.has(undefined), true)
			assert.equal(result.has(sym), true)
			assert.equal(result.has(10n), true)
			assert.equal(result.has(sharedObj), true)
		})
	})

	describe('edge cases', () => {
		test('handles a single set argument by returning a distinct copy', () => {
			const original = new Set([1, 2, 3])
			const result = intersectionBoolRecursive(original)
			assert.notEqual(result, original)
			assert.deepEqual(result, new Set([1, 2, 3]))
		})

		test('handles empty sets in any position', () => {
			const nonEmpty = new Set([1, 2, 3])
			assert.deepEqual(intersectionBoolRecursive(new Set()), new Set())
			assert.deepEqual(intersectionBoolRecursive(new Set(), nonEmpty), new Set())
			assert.deepEqual(intersectionBoolRecursive(nonEmpty, new Set()), new Set())
			assert.deepEqual(
				intersectionBoolRecursive(nonEmpty, new Set(), new Set([1, 2])),
				new Set(),
			)
			assert.deepEqual(intersectionBoolRecursive(new Set(), new Set()), new Set())
		})

		test('handles identical sets and aliased references', () => {
			const a = new Set(['x', 'y', 'z'])
			const b = new Set(['x', 'y', 'z'])
			const resDistinct = intersectionBoolRecursive(a, b)
			assert.deepEqual(resDistinct, new Set(['x', 'y', 'z']))
			assert.notEqual(resDistinct, a)
			assert.notEqual(resDistinct, b)

			const resAliased = intersectionBoolRecursive(a, a, a)
			assert.deepEqual(resAliased, new Set(['x', 'y', 'z']))
			assert.notEqual(resAliased, a)
		})

		test('does not mutate inputs and returns an independent Set', () => {
			const a = new Set([1, 2, 3, 4])
			const b = new Set([2, 3, 5])
			const c = new Set([3, 4, 5])

			const result = intersectionBoolRecursive(a, b, c)
			assert.deepEqual(a, new Set([1, 2, 3, 4]))
			assert.deepEqual(b, new Set([2, 3, 5]))
			assert.deepEqual(c, new Set([3, 4, 5]))

			result.add(999)
			result.delete(3)
			assert.deepEqual(a, new Set([1, 2, 3, 4]))
			assert.deepEqual(b, new Set([2, 3, 5]))
			assert.deepEqual(c, new Set([3, 4, 5]))
		})

		test('handles large sets without stack overflow', () => {
			const size = 5000
			const a = new Set(Array.from({ length: size }, (_, i) => i))
			const b = new Set(Array.from({ length: size }, (_, i) => i * 2))
			const result = intersectionBoolRecursive(a, b)
			assert.equal(result.size, size / 2)
			assert.equal(result.has(0), true)
			assert.equal(result.has(size - 2), true)
			assert.equal(result.has(1), false)
		})

		test('throws TypeError for invalid inputs', () => {
			assert.throws(() => intersectionBoolRecursive(), TypeError)

			const invalidInputs = [null, undefined, true, false, 42, 'set', [1, 2], { a: 1 }, new Map()]
			for (const bad of invalidInputs) {
				assert.throws(() => intersectionBoolRecursive(bad), TypeError)
				assert.throws(() => intersectionBoolRecursive(new Set([1]), bad), TypeError)
				assert.throws(() => intersectionBoolRecursive(bad, new Set([1])), TypeError)
				// Ensure validation runs even when an earlier set is empty (no premature short-circuit)
				assert.throws(() => intersectionBoolRecursive(new Set(), bad), TypeError)
			}
		})
	})

	describe('cross-checks and mathematical identities', () => {
		test('matches independent iterative filter computation across varied inputs', () => {
			let seed = 1337
			const nextInt = (max) => {
				seed = (seed * 1103515245 + 12345) & 0x7fffffff
				return seed % max
			}

			for (let trial = 0; trial < 30; trial += 1) {
				const numSets = 1 + (trial % 7)
				const sets = Array.from({ length: numSets }, () => {
					const s = new Set()
					const count = nextInt(25)
					for (let j = 0; j < count; j += 1) {
						s.add(nextInt(20))
					}
					return s
				})

				const actual = intersectionBoolRecursive(...sets)
				const expected = iterativeIntersection(...sets)
				assert.deepEqual(actual, expected)
			}
		})

		test('satisfies De Morgan law over a finite universe', () => {
			const universe = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
			const a = new Set([1, 2, 3, 4, 5])
			const b = new Set([3, 4, 5, 6, 7])
			const c = new Set([0, 2, 4, 5, 8])

			// A ∩ B = U \ ((U \ A) ∪ (U \ B))
			const lhs2 = intersectionBoolRecursive(a, b)
			const rhs2 = complementSet(
				universe,
				unionSets(complementSet(universe, a), complementSet(universe, b)),
			)
			assert.deepEqual(lhs2, rhs2)

			// A ∩ B ∩ C = U \ ((U \ A) ∪ (U \ B) ∪ (U \ C))
			const lhs3 = intersectionBoolRecursive(a, b, c)
			const rhs3 = complementSet(
				universe,
				unionSets(
					complementSet(universe, a),
					complementSet(universe, b),
					complementSet(universe, c),
				),
			)
			assert.deepEqual(lhs3, rhs3)
		})

		test('satisfies inclusion-exclusion principle for 2 and 3 sets', () => {
			const a = new Set([1, 2, 3, 4, 5])
			const b = new Set([3, 4, 5, 6, 7])
			const c = new Set([4, 5, 6, 8, 9])

			// |A ∪ B| = |A| + |B| - |A ∩ B|
			const ab = intersectionBoolRecursive(a, b)
			assert.equal(unionSets(a, b).size, a.size + b.size - ab.size)

			// |A ∪ B ∪ C| = |A| + |B| + |C| - |A ∩ B| - |A ∩ C| - |B ∩ C| + |A ∩ B ∩ C|
			const ac = intersectionBoolRecursive(a, c)
			const bc = intersectionBoolRecursive(b, c)
			const abc = intersectionBoolRecursive(a, b, c)
			assert.equal(
				unionSets(a, b, c).size,
				a.size + b.size + c.size - ab.size - ac.size - bc.size + abc.size,
			)
		})

		test('satisfies commutativity, associativity, and idempotence', () => {
			const a = new Set([1, 2, 3, 4])
			const b = new Set([2, 3, 5])
			const c = new Set([3, 4, 5, 6])

			assert.deepEqual(intersectionBoolRecursive(a, b), intersectionBoolRecursive(b, a))
			assert.deepEqual(
				intersectionBoolRecursive(intersectionBoolRecursive(a, b), c),
				intersectionBoolRecursive(a, intersectionBoolRecursive(b, c)),
			)
			assert.deepEqual(
				intersectionBoolRecursive(intersectionBoolRecursive(a, b), c),
				intersectionBoolRecursive(a, b, c),
			)
			assert.deepEqual(intersectionBoolRecursive(a, a), a)
		})
	})
})
