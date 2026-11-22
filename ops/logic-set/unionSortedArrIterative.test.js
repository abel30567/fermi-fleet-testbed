import { test } from 'node:test'
import assert from 'node:assert/strict'
import { unionSortedArrIterative } from './unionSortedArrIterative.js'

test('unionSortedArrIterative: normal overlapping, disjoint, and interleaved numeric arrays', () => {
	assert.deepEqual(
		unionSortedArrIterative([1, 3, 5, 7], [2, 3, 6, 7, 9]),
		[1, 2, 3, 5, 6, 7, 9]
	)
	assert.deepEqual(unionSortedArrIterative([1, 2], [3, 4]), [1, 2, 3, 4])
	assert.deepEqual(unionSortedArrIterative([10, 20], [-5, 0]), [-5, 0, 10, 20])
	assert.deepEqual(unionSortedArrIterative([1, 3, 5], [2, 4, 6]), [1, 2, 3, 4, 5, 6])
	assert.deepEqual(unionSortedArrIterative([1, 2, 3], [1, 2, 3]), [1, 2, 3])
	assert.deepEqual(unionSortedArrIterative([1, 2, 3, 4, 5], [2, 4]), [1, 2, 3, 4, 5])
})

test('unionSortedArrIterative: strings, bigints, and custom object comparator', () => {
	assert.deepEqual(
		unionSortedArrIterative(['alpha', 'gamma'], ['beta', 'delta', 'gamma']),
		['alpha', 'beta', 'delta', 'gamma']
	)

	assert.deepEqual(
		unionSortedArrIterative([-10n, 0n, 5n], [-5n, 0n, 100n]),
		[-10n, -5n, 0n, 5n, 100n]
	)

	const byId = (x, y) => x.id - y.id
	const a = [
		{ id: 1, src: 'a' },
		{ id: 3, src: 'a' },
	]
	const b = [
		{ id: 2, src: 'b' },
		{ id: 3, src: 'b' },
		{ id: 4, src: 'b' },
	]
	assert.deepEqual(unionSortedArrIterative(a, b, byId), [
		{ id: 1, src: 'a' },
		{ id: 2, src: 'b' },
		{ id: 3, src: 'a' },
		{ id: 4, src: 'b' },
	])
})

test('unionSortedArrIterative: edge cases (empty, single-element, special values, duplicates, non-mutation)', () => {
	assert.deepEqual(unionSortedArrIterative([], []), [])

	const a = [1, 2, 3]
	const b = [4, 5]
	const outLeft = unionSortedArrIterative(a, [])
	const outRight = unionSortedArrIterative([], b)
	assert.deepEqual(outLeft, [1, 2, 3])
	assert.deepEqual(outRight, [4, 5])
	assert.notEqual(outLeft, a)
	assert.notEqual(outRight, b)

	assert.deepEqual(unionSortedArrIterative([42], [42]), [42])
	assert.deepEqual(unionSortedArrIterative([42], [7]), [7, 42])

	assert.deepEqual(
		unionSortedArrIterative(
			[-Infinity, Number.MIN_SAFE_INTEGER, -0, Infinity],
			[-100, 0, Number.MAX_SAFE_INTEGER, Infinity]
		),
		[-Infinity, Number.MIN_SAFE_INTEGER, -100, -0, Number.MAX_SAFE_INTEGER, Infinity]
	)

	// Sorted arrays containing internal duplicates are de-duplicated in the union
	assert.deepEqual(
		unionSortedArrIterative([1, 1, 2, 2, 5], [2, 3, 3, 5, 5]),
		[1, 2, 3, 5]
	)

	// Inputs remain unmutated
	assert.deepEqual(a, [1, 2, 3])
	assert.deepEqual(b, [4, 5])
})

test('unionSortedArrIterative: handles large inputs iteratively without stack overflow', () => {
	const n = 50_000
	const evens = new Array(n)
	const odds = new Array(n)
	for (let i = 0; i < n; i += 1) {
		evens[i] = i * 2
		odds[i] = i * 2 + 1
	}
	const merged = unionSortedArrIterative(evens, odds)
	assert.equal(merged.length, 2 * n)
	assert.equal(merged[0], 0)
	assert.equal(merged[merged.length - 1], 2 * n - 1)
	for (let i = 0; i < merged.length; i += 1) {
		assert.equal(merged[i], i)
	}
})

test('unionSortedArrIterative: input validation throws TypeError and RangeError', () => {
	// Non-array inputs
	assert.throws(() => unionSortedArrIterative(null, []), TypeError)
	assert.throws(() => unionSortedArrIterative([], undefined), TypeError)
	assert.throws(() => unionSortedArrIterative('abc', []), TypeError)
	assert.throws(() => unionSortedArrIterative([], new Set([1, 2])), TypeError)
	assert.throws(() => unionSortedArrIterative({}, []), TypeError)

	// Sparse arrays
	const sparse = new Array(3)
	sparse[0] = 1
	sparse[2] = 3
	assert.throws(() => unionSortedArrIterative(sparse, [2]), TypeError)
	assert.throws(() => unionSortedArrIterative([2], sparse), TypeError)

	// Invalid comparator
	assert.throws(() => unionSortedArrIterative([1], [2], 'not-a-fn'), TypeError)
	assert.throws(() => unionSortedArrIterative([1, 2], [3], () => '0'), TypeError)
	assert.throws(() => unionSortedArrIterative([1], [2], () => Number.NaN), TypeError)

	// NaN values with default comparator
	assert.throws(() => unionSortedArrIterative([Number.NaN], []), RangeError)
	assert.throws(() => unionSortedArrIterative([], [1, Number.NaN]), RangeError)

	// Unsorted inputs
	assert.throws(() => unionSortedArrIterative([3, 1, 2], [1, 2]), RangeError)
	assert.throws(() => unionSortedArrIterative([1, 2], [5, 4]), RangeError)
	assert.throws(
		() => unionSortedArrIterative([{ id: 2 }, { id: 1 }], [], (x, y) => x.id - y.id),
		RangeError
	)

	// Mismatched or unsupported types with default comparator
	assert.throws(() => unionSortedArrIterative([1, '2'], []), TypeError)
	assert.throws(() => unionSortedArrIterative([1, 2], ['a', 'b']), TypeError)
	assert.throws(() => unionSortedArrIterative([{}], []), TypeError)
	assert.throws(() => unionSortedArrIterative([true], [false]), TypeError)
})

test('unionSortedArrIterative: cross-check against Set reference and set-algebraic identities', () => {
	// Deterministic LCG PRNG for reproducible property checks
	let state = 0x12345678
	const nextInt = (max) => {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0
		return state % max
	}

	const makeSortedUnique = (len, domain) => {
		const s = new Set()
		for (let i = 0; i < len; i += 1) {
			s.add(nextInt(domain) - Math.floor(domain / 2))
		}
		return Array.from(s).sort((x, y) => x - y)
	}

	const referenceUnion = (x, y) =>
		Array.from(new Set([...x, ...y])).sort((p, q) => p - q)

	for (let trial = 0; trial < 100; trial += 1) {
		const a = makeSortedUnique(nextInt(40), 50)
		const b = makeSortedUnique(nextInt(40), 50)
		const c = makeSortedUnique(nextInt(40), 50)

		const actualAB = unionSortedArrIterative(a, b)
		const expectedAB = referenceUnion(a, b)

		// Cross-check against independent Set-based reference
		assert.deepEqual(actualAB, expectedAB)

		// Commutativity: A ∪ B === B ∪ A
		assert.deepEqual(actualAB, unionSortedArrIterative(b, a))

		// Associativity: (A ∪ B) ∪ C === A ∪ (B ∪ C)
		assert.deepEqual(
			unionSortedArrIterative(actualAB, c),
			unionSortedArrIterative(a, unionSortedArrIterative(b, c))
		)

		// Idempotence & identity element
		assert.deepEqual(unionSortedArrIterative(a, a), a)
		assert.deepEqual(unionSortedArrIterative(a, []), a)
		assert.deepEqual(unionSortedArrIterative([], a), a)

		// Inclusion-exclusion: |A ∪ B| + |A ∩ B| === |A| + |B|
		const setB = new Set(b)
		const intersectionSize = a.filter((x) => setB.has(x)).length
		assert.equal(actualAB.length + intersectionSize, a.length + b.length)
	}
})
