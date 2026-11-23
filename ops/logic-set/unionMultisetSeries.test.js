import { test } from 'node:test'
import assert from 'node:assert/strict'
import { unionMultisetSeries } from './unionMultisetSeries.js'

/**
 * Independent reference implementation via explicit counting-logic threshold series:
 * m_{A U B}(x) = sum_{k=1..M} 1[m_A(x) >= k OR m_B(x) >= k]
 */
function unionByThresholdSeries(a, b) {
	const keys = new Set([...a.keys(), ...b.keys()])
	const out = new Map()
	for (const key of keys) {
		const ca = a.get(key) ?? 0
		const cb = b.get(key) ?? 0
		const upper = ca + cb
		let total = 0
		for (let k = 1; k <= upper; k++) {
			if (ca >= k || cb >= k) {
				total += 1
			}
		}
		if (total > 0) {
			out.set(key, total)
		}
	}
	return out
}

/**
 * Independent multiset intersection reference: m_{A n B}(x) = min(m_A(x), m_B(x))
 */
function intersectReference(a, b) {
	const out = new Map()
	for (const [key, ca] of a) {
		const cb = b.get(key) ?? 0
		const m = Math.min(ca, cb)
		if (m > 0) {
			out.set(key, m)
		}
	}
	return out
}

/**
 * Total cardinality |M| = sum_x m_M(x)
 */
function cardinality(m) {
	let sum = 0
	for (const c of m.values()) {
		sum += c
	}
	return sum
}

test('unionMultisetSeries: basic overlapping and disjoint multisets', () => {
	const a = new Map([
		['apple', 3],
		['banana', 1],
		['cherry', 2],
	])
	const b = new Map([
		['banana', 4],
		['cherry', 2],
		['date', 5],
	])

	const result = unionMultisetSeries(a, b)
	assert.deepEqual(
		result,
		new Map([
			['apple', 3],
			['banana', 4],
			['cherry', 2],
			['date', 5],
		])
	)
})

test('unionMultisetSeries: does not mutate input maps', () => {
	const a = new Map([['x', 2], ['y', 0]])
	const b = new Map([['y', 3], ['z', 1]])
	const aSnapshot = new Map(a)
	const bSnapshot = new Map(b)

	const res = unionMultisetSeries(a, b)
	assert.notEqual(res, a)
	assert.notEqual(res, b)
	assert.deepEqual(a, aSnapshot)
	assert.deepEqual(b, bSnapshot)
})

test('unionMultisetSeries: empty multisets and zero-multiplicity canonicalization', () => {
	const empty = new Map()
	const nonEmpty = new Map([['a', 2], ['b', 0]])
	const allZeros = new Map([['a', 0], ['c', 0]])

	assert.deepEqual(unionMultisetSeries(empty, empty), new Map())
	assert.deepEqual(unionMultisetSeries(nonEmpty, empty), new Map([['a', 2]]))
	assert.deepEqual(unionMultisetSeries(empty, nonEmpty), new Map([['a', 2]]))
	assert.deepEqual(unionMultisetSeries(allZeros, allZeros), new Map())
	assert.deepEqual(unionMultisetSeries(allZeros, nonEmpty), new Map([['a', 2]]))
})

test('unionMultisetSeries: supports arbitrary Map key types (objects, symbols, NaN, null, undefined, -0)', () => {
	const objKey = { id: 1 }
	const symKey = Symbol('k')
	const a = new Map([
		[objKey, 2],
		[symKey, 5],
		[NaN, 1],
		[null, 3],
		[undefined, 4],
		[-0, 2],
	])
	const b = new Map([
		[objKey, 6],
		[NaN, 3],
		[+0, 7],
		[false, 1],
	])

	const result = unionMultisetSeries(a, b)
	assert.equal(result.get(objKey), 6)
	assert.equal(result.get(symKey), 5)
	assert.equal(result.get(NaN), 3)
	assert.equal(result.get(null), 3)
	assert.equal(result.get(undefined), 4)
	assert.equal(result.get(0), 7)
	assert.equal(result.get(false), 1)
	assert.equal(result.size, 7)
})

test('unionMultisetSeries: exact near Number.MAX_SAFE_INTEGER without overflow', () => {
	const MAX = Number.MAX_SAFE_INTEGER
	const a = new Map([
		['max_zero', MAX],
		['max_one', MAX],
		['max_max', MAX],
		['max_minus_1', MAX - 1],
		['max_minus_2', MAX - 2],
	])
	const b = new Map([
		['max_zero', 0],
		['max_one', 1],
		['max_max', MAX],
		['max_minus_1', MAX],
		['max_minus_2', MAX - 1],
	])

	const result = unionMultisetSeries(a, b)
	assert.equal(result.get('max_zero'), MAX)
	assert.equal(result.get('max_one'), MAX)
	assert.equal(result.get('max_max'), MAX)
	assert.equal(result.get('max_minus_1'), MAX)
	assert.equal(result.get('max_minus_2'), MAX - 1)
})

test('unionMultisetSeries: variadic union over three or more multisets', () => {
	const a = new Map([['a', 1], ['b', 4]])
	const b = new Map([['b', 2], ['c', 3]])
	const c = new Map([['a', 5], ['d', 2]])
	const d = new Map([['c', 6], ['e', 0]])

	assert.deepEqual(
		unionMultisetSeries(a, b, c, d),
		new Map([
			['a', 5],
			['b', 4],
			['c', 6],
			['d', 2],
		])
	)
})

test('unionMultisetSeries: algebraic laws (commutativity, associativity, idempotence, boolean set compatibility)', () => {
	const a = new Map([['p', 3], ['q', 1], ['r', 4]])
	const b = new Map([['q', 5], ['r', 2], ['s', 6]])
	const c = new Map([['p', 1], ['s', 2], ['t', 7]])

	// Commutativity: A U B = B U A
	assert.deepEqual(unionMultisetSeries(a, b), unionMultisetSeries(b, a))

	// Associativity: (A U B) U C = A U (B U C) = U(A, B, C)
	const leftAssoc = unionMultisetSeries(unionMultisetSeries(a, b), c)
	const rightAssoc = unionMultisetSeries(a, unionMultisetSeries(b, c))
	assert.deepEqual(leftAssoc, rightAssoc)
	assert.deepEqual(leftAssoc, unionMultisetSeries(a, b, c))

	// Idempotence: A U A = A
	assert.deepEqual(unionMultisetSeries(a, a), a)

	// Ordinary set compatibility: counts in {0, 1} behave like logical OR
	const s1 = new Map([['x', 1], ['y', 1]])
	const s2 = new Map([['y', 1], ['z', 1]])
	assert.deepEqual(unionMultisetSeries(s1, s2), new Map([['x', 1], ['y', 1], ['z', 1]]))
})

test('unionMultisetSeries: independent cross-check against threshold indicator series and inclusion-exclusion', () => {
	// Deterministic LCG PRNG for reproducible cross-checking across 50 random multiset pairs
	let seed = 0x12345678
	const nextInt = (maxExclusive) => {
		seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
		return seed % maxExclusive
	}

	const universe = ['k0', 'k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7']
	for (let trial = 0; trial < 50; trial++) {
		const a = new Map()
		const b = new Map()
		for (const key of universe) {
			if (nextInt(3) !== 0) a.set(key, nextInt(12))
			if (nextInt(3) !== 0) b.set(key, nextInt(12))
		}

		const actual = unionMultisetSeries(a, b)
		const expectedSeries = unionByThresholdSeries(a, b)
		const intersection = intersectReference(a, b)

		// 1. Exact agreement with explicit counting-logic threshold series
		assert.deepEqual(actual, expectedSeries)

		// 2. Multiset inclusion-exclusion identity: |A U B| + |A n B| = |A| + |B|
		assert.equal(
			cardinality(actual) + cardinality(intersection),
			cardinality(a) + cardinality(b)
		)

		// 3. Pointwise inclusion-exclusion: m_{A U B}(x) + m_{A n B}(x) = m_A(x) + m_B(x)
		for (const key of universe) {
			const mUnion = actual.get(key) ?? 0
			const mInter = intersection.get(key) ?? 0
			const mA = a.get(key) ?? 0
			const mB = b.get(key) ?? 0
			assert.equal(mUnion + mInter, mA + mB)
		}
	}
})

test('unionMultisetSeries: thorough input validation', () => {
	const valid = new Map([['a', 1]])

	// Missing or non-Map arguments -> TypeError
	assert.throws(() => unionMultisetSeries(), TypeError)
	assert.throws(() => unionMultisetSeries(valid), TypeError)
	assert.throws(() => unionMultisetSeries(null, valid), TypeError)
	assert.throws(() => unionMultisetSeries(valid, undefined), TypeError)
	assert.throws(() => unionMultisetSeries({ a: 1 }, valid), TypeError)
	assert.throws(() => unionMultisetSeries(valid, [['a', 1]]), TypeError)
	assert.throws(() => unionMultisetSeries(new Set(['a']), valid), TypeError)
	assert.throws(() => unionMultisetSeries(valid, valid, 'not-a-map'), TypeError)

	// Non-number multiplicities -> TypeError
	assert.throws(() => unionMultisetSeries(new Map([['a', '1']]), valid), TypeError)
	assert.throws(() => unionMultisetSeries(valid, new Map([['a', 1n]])), TypeError)
	assert.throws(() => unionMultisetSeries(valid, new Map([['a', null]])), TypeError)
	assert.throws(() => unionMultisetSeries(valid, new Map([['a', undefined]])), TypeError)

	// Invalid numeric multiplicities -> RangeError
	assert.throws(() => unionMultisetSeries(new Map([['a', -1]]), valid), RangeError)
	assert.throws(() => unionMultisetSeries(valid, new Map([['a', 1.5]])), RangeError)
	assert.throws(() => unionMultisetSeries(new Map([['a', NaN]]), valid), RangeError)
	assert.throws(() => unionMultisetSeries(valid, new Map([['a', Infinity]])), RangeError)
	assert.throws(() => unionMultisetSeries(valid, new Map([['a', -Infinity]])), RangeError)
	assert.throws(
		() => unionMultisetSeries(valid, new Map([['a', Number.MAX_SAFE_INTEGER + 1]])),
		RangeError
	)
})
