import { test } from 'node:test'
import assert from 'node:assert/strict'
import { orMultisetStable } from './orMultisetStable.js'

/**
 * Helper to compute multiset AND (min) for algebraic cross-checks.
 * @template T
 * @param {Map<T, number>} a
 * @param {Map<T, number>} b
 * @returns {Map<T, number>}
 */
function multisetAndRef(a, b) {
	const out = new Map()
	for (const [k, va] of a) {
		const vb = b.get(k)
		if (vb !== undefined) {
			const m = Math.min(va, vb)
			if (m > 0) out.set(k, m)
		}
	}
	return out
}

/**
 * Helper to sum all counts in a multiset using BigInt for exact integer cardinality.
 * @param {Map<unknown, number>} m
 * @returns {bigint}
 */
function exactIntCardinality(m) {
	let total = 0n
	for (const v of m.values()) {
		total += BigInt(v)
	}
	return total
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible property cross-checks.
 * @param {number} seed
 */
function mulberry32(seed) {
	let state = seed >>> 0
	return () => {
		state = (state + 0x6d2b79f5) >>> 0
		let t = Math.imul(state ^ (state >>> 15), 1 | state)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

test('normal cases: binary max union (default mode)', () => {
	const a = new Map([
		['x', 3],
		['y', 1],
	])
	const b = new Map([
		['y', 4],
		['z', 2],
	])

	const out = orMultisetStable(a, b)
	assert.deepEqual(
		out,
		new Map([
			['x', 3],
			['y', 4],
			['z', 2],
		])
	)

	// Input maps must not be mutated
	assert.deepEqual(
		a,
		new Map([
			['x', 3],
			['y', 1],
		])
	)
	assert.deepEqual(
		b,
		new Map([
			['y', 4],
			['z', 2],
		])
	)
})

test('normal cases: n-ary union across multiple multisets and diverse key types', () => {
	const objKey = { id: 1 }
	const symKey = Symbol('k')
	const a = new Map([
		[objKey, 2],
		[symKey, 5],
		[NaN, 1],
	])
	const b = new Map([
		[objKey, 7],
		[42, 3],
		[NaN, 4],
	])
	const c = new Map([
		[symKey, 1],
		[42, 9],
		[false, 2.5],
	])

	const out = orMultisetStable(a, b, c)
	assert.equal(out.get(objKey), 7)
	assert.equal(out.get(symKey), 5)
	assert.equal(out.get(NaN), 4)
	assert.equal(out.get(42), 9)
	assert.equal(out.get(false), 2.5)
	assert.equal(out.size, 5)
})

test('edge cases: empty multisets, zero and -0 counts, extreme finite magnitudes', () => {
	assert.deepEqual(orMultisetStable(new Map(), new Map()), new Map())

	const withZeros = new Map([
		['zero', 0],
		['negZero', -0],
		['tiny', Number.MIN_VALUE],
		['huge', Number.MAX_VALUE],
	])
	const out = orMultisetStable(withZeros, new Map([['negZero', -0]]))
	assert.equal(out.has('zero'), false)
	assert.equal(out.has('negZero'), false)
	assert.equal(out.get('tiny'), Number.MIN_VALUE)
	assert.equal(out.get('huge'), Number.MAX_VALUE)
	assert.equal(out.size, 2)
})

test('edge cases: tolerance prunes numerical dust below threshold', () => {
	const a = new Map([
		['dust', 1e-15],
		['keep', 1e-9],
	])
	const b = new Map([
		['dust', 5e-16],
		['border', 1e-12],
	])

	const out = orMultisetStable(a, b, { tolerance: 1e-12 })
	assert.equal(out.has('dust'), false)
	assert.equal(out.has('border'), false)
	assert.equal(out.get('keep'), 1e-9)
})

test('numerical robustness: sum mode avoids catastrophic rounding loss and is order-independent', () => {
	// Naive JS addition: 1e16 + 1 + 1 + ... (1000 times) === 1e16 (loses 1000!)
	const multisets = [new Map([['a', 1e16]])]
	for (let i = 0; i < 1000; i++) {
		multisets.push(new Map([['a', 1]]))
	}

	const forward = orMultisetStable(...multisets, { mode: 'sum' })
	const reversed = orMultisetStable(...multisets.slice().reverse(), {
		mode: 'sum',
	})

	assert.equal(forward.get('a'), 1e16 + 1000)
	assert.equal(reversed.get('a'), 1e16 + 1000)
})

test('numerical robustness: sum mode handles near-MAX_VALUE scaling, overflow detection, and subnormals', () => {
	const a = new Map([
		['nearMax', 1e308],
		['sub', Number.MIN_VALUE],
	])
	const b = new Map([
		['nearMax', 7e307],
		['sub', Number.MIN_VALUE],
	])
	const out = orMultisetStable(a, b, { mode: 'sum' })
	assert.equal(out.get('nearMax'), 1.7e308)
	assert.equal(out.get('sub'), 2 * Number.MIN_VALUE)

	assert.throws(
		() =>
			orMultisetStable(
				new Map([['x', 1e308]]),
				new Map([['x', 1e308]]),
				{ mode: 'sum' }
			),
		RangeError
	)
})

test('numerical robustness: probabilistic mode avoids cancellation for tiny probabilities and handles p=1', () => {
	// Naive 1 - (1 - 1e-17)^1000 evaluates to 0 in IEEE-754 float64!
	const maps = Array.from({ length: 1000 }, () => new Map([['rare', 1e-17]]))
	const out = orMultisetStable(...maps, { mode: 'probabilistic' })
	const expected = 1e-14 // 1000 * 1e-17 - O(1e-28)
	assert.ok(
		Math.abs(out.get('rare') - expected) / expected < 1e-12,
		`expected ~${expected}, got ${out.get('rare')}`
	)

	// Certain event p = 1 short-circuits cleanly
	const certain = orMultisetStable(
		new Map([['e', 0.25]]),
		new Map([['e', 1]]),
		new Map([['e', 0.5]]),
		{ mode: 'probabilistic' }
	)
	assert.equal(certain.get('e'), 1)
})

test('input validation: rejects invalid arguments, counts, and options', () => {
	const valid = new Map([['a', 1]])

	// Fewer than 2 arguments or non-Map operands
	assert.throws(() => orMultisetStable(), TypeError)
	assert.throws(() => orMultisetStable(valid), TypeError)
	assert.throws(() => orMultisetStable(null, valid), TypeError)
	assert.throws(() => orMultisetStable(valid, {}), TypeError)
	assert.throws(() => orMultisetStable([], valid), TypeError)
	assert.throws(() => orMultisetStable(valid, new Set()), TypeError)
	assert.throws(() => orMultisetStable(valid, valid, 123), TypeError)
	assert.throws(() => orMultisetStable(valid, valid, null), TypeError)

	// Invalid count types and values
	assert.throws(
		() => orMultisetStable(new Map([['a', '2']]), valid),
		TypeError
	)
	assert.throws(
		() => orMultisetStable(new Map([['a', 1n]]), valid),
		TypeError
	)
	assert.throws(
		() => orMultisetStable(valid, new Map([['a', NaN]])),
		RangeError
	)
	assert.throws(
		() => orMultisetStable(valid, new Map([['a', Infinity]])),
		RangeError
	)
	assert.throws(
		() => orMultisetStable(valid, new Map([['a', -1]])),
		RangeError
	)
	// Invalid count must still be caught even when overshadowed by a larger count
	assert.throws(
		() => orMultisetStable(new Map([['a', 100]]), new Map([['a', -0.001]])),
		RangeError
	)
	assert.throws(
		() => orMultisetStable(new Map([['a', 100]]), new Map([['a', NaN]])),
		RangeError
	)

	// Probabilistic mode rejects counts > 1
	assert.throws(
		() =>
			orMultisetStable(new Map([['a', 1.1]]), new Map([['a', 0.2]]), {
				mode: 'probabilistic',
			}),
		RangeError
	)

	// Invalid options
	assert.throws(
		() => orMultisetStable(valid, valid, { mode: 'xor' }),
		RangeError
	)
	assert.throws(
		() => orMultisetStable(valid, valid, { mode: 42 }),
		TypeError
	)
	assert.throws(
		() => orMultisetStable(valid, valid, { tolerance: -1e-6 }),
		RangeError
	)
	assert.throws(
		() => orMultisetStable(valid, valid, { tolerance: NaN }),
		RangeError
	)
	assert.throws(
		() => orMultisetStable(valid, valid, { tolerance: '0' }),
		TypeError
	)
	assert.throws(
		() => orMultisetStable(valid, valid, { unknownOption: true }),
		TypeError
	)
})

test('independent cross-check 1: indicator multisets match native Set union', () => {
	const rand = mulberry32(20261123)
	const universe = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']

	for (let trial = 0; trial < 30; trial++) {
		const setA = new Set()
		const setB = new Set()
		const mapA = new Map()
		const mapB = new Map()

		for (const elem of universe) {
			if (rand() < 0.5) {
				setA.add(elem)
				mapA.set(elem, 1)
			}
			if (rand() < 0.5) {
				setB.add(elem)
				mapB.set(elem, 1)
			}
		}

		const expectedSet = new Set([...setA, ...setB])
		const actualMap = orMultisetStable(mapA, mapB)

		assert.equal(actualMap.size, expectedSet.size)
		for (const elem of expectedSet) {
			assert.equal(actualMap.get(elem), 1)
		}
	}
})

test('independent cross-check 2: lattice axioms and inclusion-exclusion cardinality law', () => {
	const rand = mulberry32(424242)
	const keys = ['k0', 'k1', 'k2', 'k3', 'k4', 'k5']

	const randomMultiset = () => {
		const m = new Map()
		for (const k of keys) {
			const c = Math.floor(rand() * 8)
			if (c > 0) m.set(k, c)
		}
		return m
	}

	for (let trial = 0; trial < 25; trial++) {
		const A = randomMultiset()
		const B = randomMultiset()
		const C = randomMultiset()

		// Commutativity: or(A, B) == or(B, A)
		const ab = orMultisetStable(A, B)
		const ba = orMultisetStable(B, A)
		assert.equal(ab.size, ba.size)
		for (const [k, v] of ab) assert.equal(ba.get(k), v)

		// Idempotence: or(A, A) == A
		assert.deepEqual(orMultisetStable(A, A), A)

		// Associativity: or(or(A, B), C) == or(A, or(B, C)) == or(A, B, C)
		const left = orMultisetStable(ab, C)
		const right = orMultisetStable(A, orMultisetStable(B, C))
		const triple = orMultisetStable(A, B, C)
		assert.equal(left.size, right.size)
		assert.equal(left.size, triple.size)
		for (const [k, v] of left) {
			assert.equal(right.get(k), v)
			assert.equal(triple.get(k), v)
		}

		// Distributivity over AND (min): and(A, or(B, C)) == or(and(A, B), and(A, C))
		const lhs = multisetAndRef(A, orMultisetStable(B, C))
		const rhs = orMultisetStable(multisetAndRef(A, B), multisetAndRef(A, C))
		assert.equal(lhs.size, rhs.size)
		for (const [k, v] of lhs) assert.equal(rhs.get(k), v)

		// Inclusion-exclusion: |or_max(A, B)| + |and_min(A, B)| == |A| + |B| == |or_sum(A, B)|
		const sumAB = orMultisetStable(A, B, { mode: 'sum' })
		const cardUnion = exactIntCardinality(ab)
		const cardInter = exactIntCardinality(multisetAndRef(A, B))
		const cardSum = exactIntCardinality(sumAB)
		assert.equal(cardUnion + cardInter, exactIntCardinality(A) + exactIntCardinality(B))
		assert.equal(cardUnion + cardInter, cardSum)
	}
})

test('independent cross-check 3: BigInt exact arithmetic verifies sum and probabilistic modes', () => {
	// Sum mode against BigInt exact sum across multiple magnitudes
	const bigValues = [
		9007199254740990n,
		1n,
		1n,
		4n,
		8n,
		16n,
		32n,
		1n,
		1n,
		1n,
		1n,
	]
	const maps = bigValues.map((v) => new Map([['total', Number(v)]]))
	const expectedBig = bigValues.reduce((acc, v) => acc + v, 0n)
	const actualSum = orMultisetStable(...maps, { mode: 'sum' }).get('total')
	assert.equal(actualSum, Number(expectedBig))

	// Probabilistic mode against exact rational BigInt: 1 - prod(1 - num/den)
	const den = 1000n
	const nums = [125n, 250n, 50n, 375n]
	const probMaps = nums.map((n) => new Map([['p', Number(n) / Number(den)]]))

	let compNum = 1n
	let compDen = 1n
	for (const n of nums) {
		compNum *= den - n
		compDen *= den
	}
	const exactProb = Number(compDen - compNum) / Number(compDen)
	const actualProb = orMultisetStable(...probMaps, {
		mode: 'probabilistic',
	}).get('p')
	assert.ok(
		Math.abs(actualProb - exactProb) <= 1e-15,
		`expected ${exactProb}, got ${actualProb}`
	)
})
