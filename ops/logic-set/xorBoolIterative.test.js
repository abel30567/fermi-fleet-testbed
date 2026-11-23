import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { xorBoolIterative } from './xorBoolIterative.js'

/**
 * Independent reference for binary Set symmetric difference: (A \ B) ∪ (B \ A).
 * @template T
 * @param {Set<T>} a
 * @param {Set<T>} b
 * @returns {Set<T>}
 */
function symmetricDiffByUnionMinusIntersection(a, b) {
	const union = new Set([...a, ...b])
	const out = new Set()
	for (const item of union) {
		if (!(a.has(item) && b.has(item))) {
			out.add(item)
		}
	}
	return out
}

describe('xorBoolIterative — plain booleans', () => {
	it('evaluates full binary truth table', () => {
		assert.equal(xorBoolIterative(false, false), false)
		assert.equal(xorBoolIterative(false, true), true)
		assert.equal(xorBoolIterative(true, false), true)
		assert.equal(xorBoolIterative(true, true), false)
	})

	it('handles single boolean argument', () => {
		assert.equal(xorBoolIterative(false), false)
		assert.equal(xorBoolIterative(true), true)
	})

	it('evaluates variadic n-ary boolean XOR', () => {
		assert.equal(xorBoolIterative(true, false, false), true)
		assert.equal(xorBoolIterative(true, true, false), false)
		assert.equal(xorBoolIterative(true, true, true), true)
		assert.equal(xorBoolIterative(false, false, false, false), false)
		assert.equal(xorBoolIterative(true, false, true, false, true), true)
	})

	it('matches independent odd-parity reference across all 1..5-bit combinations', () => {
		for (let n = 1; n <= 5; n++) {
			const total = 1 << n
			for (let mask = 0; mask < total; mask++) {
				const bits = []
				let trueCount = 0
				for (let bit = 0; bit < n; bit++) {
					const val = Boolean((mask >> bit) & 1)
					bits.push(val)
					if (val) trueCount++
				}
				const expected = trueCount % 2 === 1
				assert.equal(xorBoolIterative(...bits), expected)
			}
		}
	})

	it('satisfies algebraic laws (commutativity, associativity, identity, self-inverse, disjunctive definition)', () => {
		const vals = [false, true]
		for (const a of vals) {
			assert.equal(xorBoolIterative(a, false), a)
			assert.equal(xorBoolIterative(a, a), false)
			for (const b of vals) {
				assert.equal(xorBoolIterative(a, b), xorBoolIterative(b, a))
				assert.equal(xorBoolIterative(a, b), (a || b) && !(a && b))
				for (const c of vals) {
					assert.equal(
						xorBoolIterative(xorBoolIterative(a, b), c),
						xorBoolIterative(a, xorBoolIterative(b, c)),
					)
				}
			}
		}
	})

	it('handles large iterative boolean input without stack overflow', () => {
		const size = 10_000
		const evenTrues = Array.from({ length: size }, (_, i) => i % 2 === 0) // 5000 trues (even)
		assert.equal(xorBoolIterative(...evenTrues), false)
		const oddTrues = [...evenTrues, true] // 5001 trues (odd)
		assert.equal(xorBoolIterative(...oddTrues), true)
	})
})

describe('xorBoolIterative — JS Set objects', () => {
	it('computes binary symmetric difference for overlapping, disjoint, identical, and empty sets', () => {
		assert.deepEqual(
			xorBoolIterative(new Set([1, 2, 3]), new Set([2, 3, 4])),
			new Set([1, 4]),
		)
		assert.deepEqual(
			xorBoolIterative(new Set(['a', 'b']), new Set(['c', 'd'])),
			new Set(['a', 'b', 'c', 'd']),
		)
		assert.deepEqual(
			xorBoolIterative(new Set([1, 2]), new Set([1, 2])),
			new Set(),
		)
		assert.deepEqual(
			xorBoolIterative(new Set(), new Set([1, 2])),
			new Set([1, 2]),
		)
		assert.deepEqual(xorBoolIterative(new Set(), new Set()), new Set())
	})

	it('returns a fresh shallow copy for a single Set without mutating the input', () => {
		const original = new Set([10, 20, 30])
		const result = xorBoolIterative(original)
		assert.notEqual(result, original)
		assert.deepEqual(result, original)
		result.add(40)
		assert.equal(original.has(40), false)
	})

	it('does not mutate input sets, including repeated references to the same Set', () => {
		const s = new Set([1, 2, 3])
		assert.deepEqual(xorBoolIterative(s, s), new Set())
		assert.deepEqual(s, new Set([1, 2, 3]))
		assert.deepEqual(xorBoolIterative(s, s, s), new Set([1, 2, 3]))
		assert.deepEqual(s, new Set([1, 2, 3]))
	})

	it('handles SameValueZero edge cases (NaN, +0/-0, null, undefined, object references)', () => {
		const objA = { id: 1 }
		const objB = { id: 2 }
		const a = new Set([Number.NaN, -0, null, undefined, objA])
		const b = new Set([Number.NaN, +0, null, objB])
		const result = xorBoolIterative(a, b)
		assert.deepEqual(result, new Set([undefined, objA, objB]))
	})

	it('cross-checks binary symmetric difference against (A ∪ B) \\ (A ∩ B)', () => {
		const pairs = [
			[new Set([1, 2, 3, 4]), new Set([3, 4, 5, 6])],
			[new Set(['x']), new Set(['x', 'y', 'z'])],
			[new Set(), new Set([1])],
			[new Set([1, 2, 3]), new Set([4, 5, 6])],
		]
		for (const [a, b] of pairs) {
			assert.deepEqual(
				xorBoolIterative(a, b),
				symmetricDiffByUnionMinusIntersection(a, b),
			)
		}
	})

	it('cross-checks n-ary symmetric difference against independent odd-occurrence parity', () => {
		const sets = [
			new Set([1, 2, 3, 4]),
			new Set([2, 3, 5]),
			new Set([3, 4, 5, 6]),
			new Set([1, 6, 7]),
		]

		const counts = new Map()
		for (const s of sets) {
			for (const item of s) {
				counts.set(item, (counts.get(item) ?? 0) + 1)
			}
		}
		const expected = new Set()
		for (const [item, count] of counts) {
			if (count % 2 === 1) expected.add(item)
		}

		assert.deepEqual(xorBoolIterative(...sets), expected)
		// Also check associativity: ((A △ B) △ C) △ D === A △ B △ C △ D
		const nested = xorBoolIterative(
			xorBoolIterative(xorBoolIterative(sets[0], sets[1]), sets[2]),
			sets[3],
		)
		assert.deepEqual(nested, expected)
	})
})

describe('xorBoolIterative — input validation', () => {
	it('throws TypeError when called with no arguments', () => {
		assert.throws(() => xorBoolIterative(), TypeError)
	})

	it('throws TypeError for non-boolean, non-Set inputs (including boxed Boolean)', () => {
		const invalidValues = [
			0,
			1,
			'true',
			'',
			null,
			undefined,
			{},
			[true, false],
			new Map(),
			new Boolean(true),
			Symbol('x'),
			1n,
			() => true,
		]
		for (const value of invalidValues) {
			assert.throws(() => xorBoolIterative(value), TypeError)
			assert.throws(() => xorBoolIterative(true, value), TypeError)
			assert.throws(() => xorBoolIterative(new Set([1]), value), TypeError)
		}
	})

	it('throws TypeError when mixing plain booleans and Set instances', () => {
		assert.throws(() => xorBoolIterative(true, new Set([1])), TypeError)
		assert.throws(() => xorBoolIterative(new Set([1]), false), TypeError)
		assert.throws(
			() => xorBoolIterative(true, false, new Set([true])),
			TypeError,
		)
		assert.throws(
			() => xorBoolIterative(new Set([1]), new Set([2]), true),
			TypeError,
		)
	})
})
