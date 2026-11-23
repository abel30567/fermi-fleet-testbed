import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { xorBoolSeries } from './xorBoolSeries.js'

/**
 * Independent reference implementation for Set symmetric difference:
 * (A \ B) union (B \ A).
 */
function referenceSetXor(a, b) {
	const out = new Set()
	for (const x of a) {
		if (!b.has(x)) out.add(x)
	}
	for (const y of b) {
		if (!a.has(y)) out.add(y)
	}
	return out
}

describe('xorBoolSeries - booleans', () => {
	test('computes the complete boolean XOR truth table', () => {
		assert.strictEqual(xorBoolSeries(false, false), false)
		assert.strictEqual(xorBoolSeries(false, true), true)
		assert.strictEqual(xorBoolSeries(true, false), true)
		assert.strictEqual(xorBoolSeries(true, true), false)
	})

	test('satisfies boolean algebraic identities (commutativity, associativity, identity, self-inverse)', () => {
		const vals = [false, true]
		for (const a of vals) {
			assert.strictEqual(xorBoolSeries(a, false), a)
			assert.strictEqual(xorBoolSeries(false, a), a)
			assert.strictEqual(xorBoolSeries(a, a), false)
			assert.strictEqual(xorBoolSeries(a, true), !a)

			for (const b of vals) {
				assert.strictEqual(xorBoolSeries(a, b), xorBoolSeries(b, a))
				for (const c of vals) {
					assert.strictEqual(
						xorBoolSeries(xorBoolSeries(a, b), c),
						xorBoolSeries(a, xorBoolSeries(b, c))
					)
				}
			}
		}
	})

	test('cross-checks against independent boolean XOR definitions', () => {
		const vals = [false, true]
		for (const a of vals) {
			for (const b of vals) {
				const actual = xorBoolSeries(a, b)
				const dnf = (a || b) && !(a && b)
				const neq = a !== b
				const bitwise = Boolean(Number(a) ^ Number(b))
				assert.strictEqual(actual, dnf)
				assert.strictEqual(actual, neq)
				assert.strictEqual(actual, bitwise)
			}
		}
	})
})

describe('xorBoolSeries - Set objects', () => {
	test('computes symmetric difference for overlapping, disjoint, and subset sets', () => {
		assert.deepStrictEqual(
			xorBoolSeries(new Set([1, 2, 3]), new Set([2, 3, 4])),
			new Set([1, 4])
		)
		assert.deepStrictEqual(
			xorBoolSeries(new Set(['a', 'b']), new Set(['c', 'd'])),
			new Set(['a', 'b', 'c', 'd'])
		)
		assert.deepStrictEqual(
			xorBoolSeries(new Set([1, 2]), new Set([1, 2, 3, 4])),
			new Set([3, 4])
		)
	})

	test('handles empty sets, identical sets, and preserves immutability', () => {
		const empty1 = new Set()
		const empty2 = new Set()
		assert.deepStrictEqual(xorBoolSeries(empty1, empty2), new Set())

		const s = new Set([10, 20, 30])
		const withEmptyRight = xorBoolSeries(s, new Set())
		assert.deepStrictEqual(withEmptyRight, new Set([10, 20, 30]))
		assert.notStrictEqual(withEmptyRight, s)

		const withEmptyLeft = xorBoolSeries(new Set(), s)
		assert.deepStrictEqual(withEmptyLeft, new Set([10, 20, 30]))
		assert.notStrictEqual(withEmptyLeft, s)

		assert.deepStrictEqual(xorBoolSeries(s, s), new Set())
		assert.deepStrictEqual(xorBoolSeries(s, new Set([10, 20, 30])), new Set())
		// Original set unchanged
		assert.deepStrictEqual(s, new Set([10, 20, 30]))
	})

	test('handles special JS values (NaN, +/-0, null, undefined, objects, symbols, BigInt)', () => {
		const objShared = { id: 1 }
		const objOnlyA = { id: 2 }
		const objOnlyB = { id: 3 }
		const symShared = Symbol('shared')
		const symOnlyA = Symbol('a')

		const a = new Set([NaN, -0, null, undefined, objShared, objOnlyA, symShared, symOnlyA, 1n])
		const b = new Set([NaN, +0, null, objShared, objOnlyB, symShared, 2n])

		const res = xorBoolSeries(a, b)
		assert.deepStrictEqual(res, new Set([undefined, objOnlyA, symOnlyA, 1n, objOnlyB, 2n]))

		// NaN in only one set is retained
		const nanOnly = xorBoolSeries(new Set([NaN]), new Set([1]))
		assert.strictEqual(nanOnly.size, 2)
		assert.strictEqual(nanOnly.has(NaN), true)
		assert.strictEqual(nanOnly.has(1), true)
	})

	test('satisfies set algebraic identities (commutativity, associativity, self-inverse)', () => {
		const a = new Set([1, 2, 3, 4])
		const b = new Set([3, 4, 5, 6])
		const c = new Set([2, 4, 6, 7])

		assert.deepStrictEqual(xorBoolSeries(a, b), xorBoolSeries(b, a))
		assert.deepStrictEqual(
			xorBoolSeries(xorBoolSeries(a, b), c),
			xorBoolSeries(a, xorBoolSeries(b, c))
		)
		assert.deepStrictEqual(xorBoolSeries(xorBoolSeries(a, b), b), a)
	})

	test('cross-checks against independent (A \\ B) union (B \\ A) and inclusion-exclusion cardinality', () => {
		// Deterministic pseudo-random sets + large set overlap
		const pairs = [
			[new Set(), new Set()],
			[new Set([1, 2, 3]), new Set([3, 4, 5])],
			[
				new Set(Array.from({ length: 500 }, (_, i) => i)),
				new Set(Array.from({ length: 500 }, (_, i) => i + 250))
			],
			[
				new Set(Array.from({ length: 200 }, (_, i) => i * 2)),
				new Set(Array.from({ length: 200 }, (_, i) => i * 3))
			]
		]

		for (const [a, b] of pairs) {
			const actual = xorBoolSeries(a, b)
			const expected = referenceSetXor(a, b)
			assert.deepStrictEqual(actual, expected)

			// Independent cardinality cross-check: |A Δ B| = |A| + |B| - 2|A ∩ B|
			let intersectionSize = 0
			for (const x of a) {
				if (b.has(x)) intersectionSize += 1
			}
			assert.strictEqual(actual.size, a.size + b.size - 2 * intersectionSize)
		}
	})
})

describe('xorBoolSeries - input validation', () => {
	test('throws TypeError on mixed boolean and Set inputs', () => {
		assert.throws(() => xorBoolSeries(true, new Set()), TypeError)
		assert.throws(() => xorBoolSeries(new Set(), false), TypeError)
	})

	test('throws TypeError on invalid types or missing arguments', () => {
		const invalidPairs = [
			[],
			[true],
			[new Set()],
			[0, 1],
			[1, 0],
			['true', 'false'],
			[null, null],
			[undefined, undefined],
			[[1, 2], [2, 3]],
			[{}, {}],
			[new Boolean(true), new Boolean(false)],
			[true, 1],
			[new Set([1]), [1]]
		]

		for (const args of invalidPairs) {
			assert.throws(() => xorBoolSeries(...args), TypeError)
		}
	})
})
