import test from 'node:test'
import assert from 'node:assert/strict'
import { xorBoolRecursive } from './xorBoolRecursive.js'

/**
 * Independent oracle for n-ary boolean XOR via parity counting.
 *
 * @param {boolean[]} values
 * @returns {boolean}
 */
function referenceXorBooleans(values) {
	let trueCount = 0
	for (const v of values) {
		if (v) trueCount++
	}
	return trueCount % 2 === 1
}

/**
 * Independent oracle for n-ary Set symmetric difference via element frequency map.
 *
 * @param {Set<*>[]} sets
 * @returns {Set<*>}
 */
function referenceXorSets(sets) {
	const counts = new Map()
	for (const s of sets) {
		for (const item of s) {
			counts.set(item, (counts.get(item) ?? 0) + 1)
		}
	}
	const result = new Set()
	for (const [item, count] of counts.entries()) {
		if (count % 2 === 1) {
			result.add(item)
		}
	}
	return result
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible property cross-checks.
 *
 * @param {number} seed
 * @returns {() => number}
 */
function makeRng(seed) {
	let state = seed >>> 0
	return () => {
		state = (state + 0x6d2b79f5) >>> 0
		let t = Math.imul(state ^ (state >>> 15), 1 | state)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

test('booleans: full 2-input truth table', () => {
	assert.strictEqual(xorBoolRecursive(false, false), false)
	assert.strictEqual(xorBoolRecursive(false, true), true)
	assert.strictEqual(xorBoolRecursive(true, false), true)
	assert.strictEqual(xorBoolRecursive(true, true), false)
})

test('booleans: single-argument edge cases', () => {
	assert.strictEqual(xorBoolRecursive(true), true)
	assert.strictEqual(xorBoolRecursive(false), false)
})

test('booleans: n-ary parity cases (odd, even, all-false, all-true)', () => {
	assert.strictEqual(xorBoolRecursive(true, true, true), true)
	assert.strictEqual(xorBoolRecursive(true, true, true, true), false)
	assert.strictEqual(xorBoolRecursive(false, false, false, false, false), false)
	assert.strictEqual(xorBoolRecursive(false, true, false, false, false), true)
	assert.strictEqual(xorBoolRecursive(true, false, true, false, true), true)
	assert.strictEqual(xorBoolRecursive(true, false, true, false, false), false)
})

test('booleans: algebraic laws (commutativity, associativity, identity, self-inverse)', () => {
	const vals = [false, true]
	for (const a of vals) {
		assert.strictEqual(xorBoolRecursive(a, false), a)
		assert.strictEqual(xorBoolRecursive(a, true), !a)
		assert.strictEqual(xorBoolRecursive(a, a), false)
		for (const b of vals) {
			assert.strictEqual(xorBoolRecursive(a, b), xorBoolRecursive(b, a))
			for (const c of vals) {
				assert.strictEqual(
					xorBoolRecursive(xorBoolRecursive(a, b), c),
					xorBoolRecursive(a, xorBoolRecursive(b, c))
				)
				assert.strictEqual(
					xorBoolRecursive(a, b, c),
					xorBoolRecursive(xorBoolRecursive(a, b), c)
				)
			}
		}
	}
})

test('booleans: exhaustive cross-check against parity oracle for n = 1..6', () => {
	for (let n = 1; n <= 6; n++) {
		const total = 1 << n
		for (let mask = 0; mask < total; mask++) {
			const input = []
			for (let bit = 0; bit < n; bit++) {
				input.push(Boolean((mask >> bit) & 1))
			}
			const actual = xorBoolRecursive(...input)
			const expected = referenceXorBooleans(input)
			const bitwiseExpected = Boolean(
				input.reduce((acc, v) => acc ^ Number(v), 0)
			)
			assert.strictEqual(actual, expected)
			assert.strictEqual(actual, bitwiseExpected)
		}
	}
})

test('booleans: large variadic input cross-check (no stack overflow)', () => {
	const rng = makeRng(20261123)
	const large = Array.from({ length: 10000 }, () => rng() < 0.5)
	assert.strictEqual(xorBoolRecursive(...large), referenceXorBooleans(large))
})

test('sets: basic binary symmetric difference cases', () => {
	// Overlapping sets
	assert.deepStrictEqual(
		xorBoolRecursive(new Set([1, 2, 3]), new Set([3, 4, 5])),
		new Set([1, 2, 4, 5])
	)
	// Disjoint sets
	assert.deepStrictEqual(
		xorBoolRecursive(new Set(['a', 'b']), new Set(['c', 'd'])),
		new Set(['a', 'b', 'c', 'd'])
	)
	// Identical sets -> empty
	assert.deepStrictEqual(
		xorBoolRecursive(new Set([1, 2, 3]), new Set([1, 2, 3])),
		new Set()
	)
	// Subset / superset
	assert.deepStrictEqual(
		xorBoolRecursive(new Set([1, 2, 3, 4]), new Set([2, 4])),
		new Set([1, 3])
	)
})

test('sets: empty sets and single-set cloning without mutation', () => {
	assert.deepStrictEqual(xorBoolRecursive(new Set()), new Set())
	assert.deepStrictEqual(xorBoolRecursive(new Set(), new Set()), new Set())
	assert.deepStrictEqual(
		xorBoolRecursive(new Set([10, 20]), new Set()),
		new Set([10, 20])
	)
	assert.deepStrictEqual(
		xorBoolRecursive(new Set(), new Set([10, 20])),
		new Set([10, 20])
	)

	const original = new Set([1, 2, 3])
	const cloned = xorBoolRecursive(original)
	assert.deepStrictEqual(cloned, original)
	assert.notStrictEqual(cloned, original)
	cloned.add(4)
	assert.strictEqual(original.has(4), false)

	const a = new Set([1, 2])
	const b = new Set([2, 3])
	const res = xorBoolRecursive(a, b)
	assert.deepStrictEqual(res, new Set([1, 3]))
	assert.deepStrictEqual(a, new Set([1, 2]))
	assert.deepStrictEqual(b, new Set([2, 3]))
})

test('sets: n-ary symmetric difference keeps elements in an odd number of sets', () => {
	const s1 = new Set([1, 2, 3, 4])
	const s2 = new Set([2, 3, 5])
	const s3 = new Set([3, 4, 6])
	// Element counts: 1->1, 2->2, 3->3, 4->2, 5->1, 6->1
	const result = xorBoolRecursive(s1, s2, s3)
	assert.deepStrictEqual(result, new Set([1, 3, 5, 6]))
})

test('sets: SameValueZero semantics (NaN, -0/+0, objects, symbols, BigInt, null, undefined)', () => {
	const objShared = { id: 1 }
	const objOnlyA = { id: 2 }
	const symShared = Symbol('shared')
	const symOnlyB = Symbol('onlyB')

	const a = new Set([NaN, -0, null, undefined, objShared, objOnlyA, symShared, 1n])
	const b = new Set([NaN, +0, null, objShared, symShared, symOnlyB, 2n])

	const result = xorBoolRecursive(a, b)
	assert.deepStrictEqual(result, new Set([undefined, objOnlyA, symOnlyB, 1n, 2n]))
	assert.strictEqual(result.has(NaN), false)
	assert.strictEqual(result.has(0), false)
})

test('sets: algebraic laws (commutativity, associativity, identity, self-inverse)', () => {
	const a = new Set([1, 2, 3])
	const b = new Set([2, 3, 4])
	const c = new Set([3, 4, 5])
	const empty = new Set()

	assert.deepStrictEqual(xorBoolRecursive(a, b), xorBoolRecursive(b, a))
	assert.deepStrictEqual(
		xorBoolRecursive(xorBoolRecursive(a, b), c),
		xorBoolRecursive(a, xorBoolRecursive(b, c))
	)
	assert.deepStrictEqual(
		xorBoolRecursive(a, b, c),
		xorBoolRecursive(xorBoolRecursive(a, b), c)
	)
	assert.deepStrictEqual(xorBoolRecursive(a, empty), a)
	assert.deepStrictEqual(xorBoolRecursive(a, a), empty)
})

test('sets: independent cross-check against frequency map and (A union B) \\ (A intersect B)', () => {
	const rng = makeRng(424242)
	for (let trial = 0; trial < 50; trial++) {
		const numSets = 1 + Math.floor(rng() * 7)
		const sets = []
		for (let i = 0; i < numSets; i++) {
			const s = new Set()
			for (let v = 0; v < 25; v++) {
				if (rng() < 0.4) s.add(v)
			}
			sets.push(s)
		}

		const actual = xorBoolRecursive(...sets)
		const expected = referenceXorSets(sets)
		assert.deepStrictEqual(actual, expected)

		if (sets.length === 2) {
			const [sA, sB] = sets
			const union = new Set([...sA, ...sB])
			const unionMinusIntersection = new Set(
				[...union].filter((x) => !(sA.has(x) && sB.has(x)))
			)
			assert.deepStrictEqual(actual, unionMinusIntersection)
		}
	}
})

test('sets: large sets cross-check (O(log n) recursion depth)', () => {
	const a = new Set()
	const b = new Set()
	for (let i = 0; i < 10000; i++) {
		if (i % 2 === 0) a.add(i)
		if (i % 3 === 0) b.add(i)
	}
	const actual = xorBoolRecursive(a, b)
	const expected = referenceXorSets([a, b])
	assert.deepStrictEqual(actual, expected)
})

test('invalid inputs throw TypeError', () => {
	assert.throws(() => xorBoolRecursive(), TypeError)

	const invalidSingles = [
		null,
		undefined,
		0,
		1,
		NaN,
		'true',
		'false',
		'',
		{},
		[],
		[true, false],
		new Map(),
		new Boolean(true),
		Symbol('x'),
		1n,
		() => true
	]

	for (const bad of invalidSingles) {
		assert.throws(() => xorBoolRecursive(bad), TypeError)
		assert.throws(() => xorBoolRecursive(true, bad), TypeError)
		assert.throws(() => xorBoolRecursive(false, true, bad), TypeError)
		assert.throws(() => xorBoolRecursive(new Set([1]), bad), TypeError)
		assert.throws(
			() => xorBoolRecursive(new Set([1]), new Set([2]), bad),
			TypeError
		)
	}

	// Mixing booleans and Sets must throw
	assert.throws(() => xorBoolRecursive(true, new Set()), TypeError)
	assert.throws(() => xorBoolRecursive(false, new Set([1])), TypeError)
	assert.throws(() => xorBoolRecursive(new Set([1]), true), TypeError)
	assert.throws(
		() => xorBoolRecursive(new Set([1]), new Set([2]), false),
		TypeError
	)
})
