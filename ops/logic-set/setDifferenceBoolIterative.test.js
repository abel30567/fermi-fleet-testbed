import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setDifferenceBoolIterative } from './setDifferenceBoolIterative.js'

test('computes difference of overlapping numeric sets', () => {
	const a = new Set([1, 2, 3, 4])
	const b = new Set([3, 4, 5, 6])
	const diff = setDifferenceBoolIterative(a, b)

	assert.ok(diff instanceof Set)
	assert.deepEqual(diff, new Set([1, 2]))
})

test('computes difference of disjoint sets', () => {
	const a = new Set(['alpha', 'beta'])
	const b = new Set(['gamma', 'delta'])

	assert.deepEqual(setDifferenceBoolIterative(a, b), new Set(['alpha', 'beta']))
})

test('handles subset and superset relationships', () => {
	const small = new Set([1, 2])
	const large = new Set([1, 2, 3, 4])

	assert.deepEqual(setDifferenceBoolIterative(small, large), new Set())
	assert.deepEqual(setDifferenceBoolIterative(large, small), new Set([3, 4]))
})

test('works over plain booleans and mixed value types including object references', () => {
	const obj1 = { id: 1 }
	const obj2 = { id: 2 }
	const sym = Symbol('k')

	assert.deepEqual(
		setDifferenceBoolIterative(new Set([true, false]), new Set([false])),
		new Set([true]),
	)
	assert.deepEqual(
		setDifferenceBoolIterative(new Set([true, false]), new Set([true, false])),
		new Set(),
	)
	assert.deepEqual(
		setDifferenceBoolIterative(new Set([true, obj1, obj2, sym]), new Set([obj2, { id: 1 }])),
		new Set([true, obj1, sym]),
	)
})

test('handles empty sets and identical set references', () => {
	const empty = new Set()
	const a = new Set([10, 20, 30])

	assert.deepEqual(setDifferenceBoolIterative(empty, empty), new Set())
	assert.deepEqual(setDifferenceBoolIterative(empty, a), new Set())
	assert.deepEqual(setDifferenceBoolIterative(a, empty), new Set([10, 20, 30]))

	const selfDiff = setDifferenceBoolIterative(a, a)
	assert.deepEqual(selfDiff, new Set())
	assert.notEqual(selfDiff, a)
})

test('respects JS Set SameValueZero semantics for NaN, -0/+0, null, undefined', () => {
	const a = new Set([NaN, -0, null, undefined, 'keep'])
	const b = new Set([NaN, +0, undefined])

	const diff = setDifferenceBoolIterative(a, b)
	assert.deepEqual(diff, new Set([null, 'keep']))
	assert.equal(diff.has(NaN), false)
	assert.equal(diff.has(0), false)
})

test('does not mutate inputs and preserves insertion order from minuend', () => {
	const a = new Set(['z', 'a', 'm', 'b'])
	const b = new Set(['a', 'x'])

	const diff = setDifferenceBoolIterative(a, b)
	assert.deepEqual([...diff], ['z', 'm', 'b'])
	assert.deepEqual([...a], ['z', 'a', 'm', 'b'])
	assert.deepEqual([...b], ['a', 'x'])

	diff.add('new')
	assert.equal(a.has('new'), false)
	assert.equal(b.has('new'), false)
})

test('validates inputs and throws TypeError for non-Set arguments', () => {
	const valid = new Set([1, 2])
	const invalidInputs = [null, undefined, [], [1, 2], {}, new Map(), true, false, 0, 42, 'set']

	for (const bad of invalidInputs) {
		assert.throws(() => setDifferenceBoolIterative(bad, valid), TypeError)
		assert.throws(() => setDifferenceBoolIterative(valid, bad), TypeError)
	}
	assert.throws(() => setDifferenceBoolIterative(), TypeError)
	assert.throws(() => setDifferenceBoolIterative(valid), TypeError)
})

test('satisfies set-theoretic identities and matches independent reference implementation', () => {
	// Deterministic LCG for reproducible universe subsets
	let seed = 0x12345678
	const nextBit = () => {
		seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
		return (seed >>> 31) === 1
	}

	const universe = Array.from({ length: 24 }, (_, i) => i)

	for (let trial = 0; trial < 50; trial++) {
		const a = new Set(universe.filter(() => nextBit()))
		const b = new Set(universe.filter(() => nextBit()))

		const diff = setDifferenceBoolIterative(a, b)
		const intersection = new Set([...a].filter((x) => b.has(x)))
		const reference = new Set([...a].filter((x) => !b.has(x)))

		// Cross-check against independent array-filter reference
		assert.deepEqual(diff, reference)

		// Cardinality partition identity: |A \ B| + |A ∩ B| = |A|
		assert.equal(diff.size + intersection.size, a.size)

		// Disjointness: (A \ B) ∩ B = ∅
		for (const x of diff) {
			assert.equal(b.has(x), false)
		}

		// Reconstruction: (A \ B) ∪ (A ∩ B) = A
		const reconstructed = new Set([...diff, ...intersection])
		assert.deepEqual(reconstructed, a)

		// Double difference identity: A \ (A \ B) = A ∩ B
		assert.deepEqual(setDifferenceBoolIterative(a, diff), intersection)
	}
})
