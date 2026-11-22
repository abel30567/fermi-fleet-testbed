import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setDifferenceSortedArrIterative } from './setDifferenceSortedArrIterative.js'

test('normal cases: overlapping sorted numeric arrays', () => {
	assert.deepEqual(
		setDifferenceSortedArrIterative([1, 2, 3, 5, 8], [2, 4, 5, 9]),
		[1, 3, 8],
	)
	assert.deepEqual(
		setDifferenceSortedArrIterative([-10, -3, 0, 1.5, 4.25, 100], [-3, 1.5, 50]),
		[-10, 0, 4.25, 100],
	)
})

test('normal cases: strings, bigints, and booleans with default comparator', () => {
	assert.deepEqual(
		setDifferenceSortedArrIterative(['alpha', 'beta', 'delta', 'gamma'], ['beta', 'epsilon']),
		['alpha', 'delta', 'gamma'],
	)
	assert.deepEqual(
		setDifferenceSortedArrIterative([1n, 2n, 3n, 10n ** 30n], [2n, 5n]),
		[1n, 3n, 10n ** 30n],
	)
	assert.deepEqual(
		setDifferenceSortedArrIterative([false, true], [false]),
		[true],
	)
})

test('normal cases: custom comparators (objects, case-insensitive strings, descending order)', () => {
	const a = [{ id: 1, name: 'a' }, { id: 2, name: 'b' }, { id: 4, name: 'd' }]
	const b = [{ id: 2, name: 'B' }, { id: 3, name: 'c' }]
	const byId = (x, y) => x.id - y.id

	assert.deepEqual(
		setDifferenceSortedArrIterative(a, b, byId),
		[{ id: 1, name: 'a' }, { id: 4, name: 'd' }],
	)

	const ciCompare = (x, y) => {
		const lx = x.toLowerCase()
		const ly = y.toLowerCase()
		return lx < ly ? -1 : lx > ly ? 1 : 0
	}
	assert.deepEqual(
		setDifferenceSortedArrIterative(['Apple', 'banana', 'Cherry'], ['BANANA', 'date'], ciCompare),
		['Apple', 'Cherry'],
	)

	const descCompare = (x, y) => y - x
	assert.deepEqual(
		setDifferenceSortedArrIterative([10, 7, 5, 1], [7, 3, 1], descCompare),
		[10, 5],
	)
})

test('immutability: inputs are not mutated and output is a new array', () => {
	const a = [1, 2, 3]
	const b = []
	const out = setDifferenceSortedArrIterative(a, b)

	assert.deepEqual(out, [1, 2, 3])
	assert.notEqual(out, a)

	const aCopy = [1, 2, 4, 5]
	const bCopy = [2, 3, 5]
	setDifferenceSortedArrIterative(aCopy, bCopy)
	assert.deepEqual(aCopy, [1, 2, 4, 5])
	assert.deepEqual(bCopy, [2, 3, 5])
})

test('edge cases: empty inputs, subsets, supersets, disjoint, identical, singletons', () => {
	assert.deepEqual(setDifferenceSortedArrIterative([], []), [])
	assert.deepEqual(setDifferenceSortedArrIterative([], [1, 2, 3]), [])
	assert.deepEqual(setDifferenceSortedArrIterative([1, 2, 3], []), [1, 2, 3])

	const same = [1, 2, 3]
	assert.deepEqual(setDifferenceSortedArrIterative(same, same), [])
	assert.deepEqual(setDifferenceSortedArrIterative([1, 2, 3], [1, 2, 3]), [])

	// Disjoint (a completely before b, and a completely after b)
	assert.deepEqual(setDifferenceSortedArrIterative([1, 2, 3], [4, 5, 6]), [1, 2, 3])
	assert.deepEqual(setDifferenceSortedArrIterative([4, 5, 6], [1, 2, 3]), [4, 5, 6])

	// Subset and superset
	assert.deepEqual(setDifferenceSortedArrIterative([2, 4], [1, 2, 3, 4, 5]), [])
	assert.deepEqual(setDifferenceSortedArrIterative([1, 2, 3, 4, 5], [2, 4]), [1, 3, 5])

	// Singletons
	assert.deepEqual(setDifferenceSortedArrIterative([7], [7]), [])
	assert.deepEqual(setDifferenceSortedArrIterative([7], [8]), [7])
	assert.deepEqual(setDifferenceSortedArrIterative([8], [7]), [8])
})

test('edge cases: special numeric values (Infinity, safe integer bounds, -0 vs +0)', () => {
	const a = [-Infinity, Number.MIN_SAFE_INTEGER, -0, Number.MAX_SAFE_INTEGER, Infinity]
	const b = [-Infinity, 0, Infinity]
	assert.deepEqual(
		setDifferenceSortedArrIterative(a, b),
		[Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
	)
	assert.deepEqual(setDifferenceSortedArrIterative([-0], [0]), [])
})

test('validation errors: invalid argument types and sparse arrays', () => {
	assert.throws(() => setDifferenceSortedArrIterative(null, []), TypeError)
	assert.throws(() => setDifferenceSortedArrIterative('abc', []), TypeError)
	assert.throws(() => setDifferenceSortedArrIterative([], undefined), TypeError)
	assert.throws(() => setDifferenceSortedArrIterative([], new Set([1])), TypeError)
	assert.throws(() => setDifferenceSortedArrIterative([1], [1], 'not-a-fn'), TypeError)
	assert.throws(() => setDifferenceSortedArrIterative([1], [1], null), TypeError)

	// Sparse arrays
	const sparseA = [1, , 3]
	const sparseB = new Array(2)
	assert.throws(() => setDifferenceSortedArrIterative(sparseA, []), TypeError)
	assert.throws(() => setDifferenceSortedArrIterative([], sparseB), TypeError)
	assert.throws(
		() => setDifferenceSortedArrIterative(sparseA, [], (x, y) => (x ?? 0) - (y ?? 0)),
		TypeError,
	)
})

test('validation errors: unsupported or mismatched types and NaN under default comparator', () => {
	assert.throws(() => setDifferenceSortedArrIterative([NaN], []), RangeError)
	assert.throws(() => setDifferenceSortedArrIterative([1, 2], [NaN]), RangeError)
	assert.throws(() => setDifferenceSortedArrIterative([1, NaN, 3], []), RangeError)

	assert.throws(() => setDifferenceSortedArrIterative([{}], []), TypeError)
	assert.throws(() => setDifferenceSortedArrIterative([null], []), TypeError)
	assert.throws(() => setDifferenceSortedArrIterative([undefined], []), TypeError)
	assert.throws(() => setDifferenceSortedArrIterative([Symbol('x')], []), TypeError)

	// Mixed types within an array or across a and b
	assert.throws(() => setDifferenceSortedArrIterative([1, '2'], []), TypeError)
	assert.throws(() => setDifferenceSortedArrIterative([1, 2], ['1', '2']), TypeError)
	assert.throws(() => setDifferenceSortedArrIterative([1n], [1]), TypeError)
})

test('validation errors: unsorted arrays and duplicate elements', () => {
	// Unsorted a / b
	assert.throws(() => setDifferenceSortedArrIterative([3, 1, 2], []), RangeError)
	assert.throws(() => setDifferenceSortedArrIterative([], [1, 5, 4]), RangeError)
	// Unsorted tail of b well beyond max(a) must still be rejected
	assert.throws(() => setDifferenceSortedArrIterative([1], [2, 10, 5]), RangeError)

	// Duplicates in a / b
	assert.throws(() => setDifferenceSortedArrIterative([1, 2, 2, 3], []), RangeError)
	assert.throws(() => setDifferenceSortedArrIterative([], [1, 1]), RangeError)
	assert.throws(() => setDifferenceSortedArrIterative([-0, 0], []), RangeError)
	// Duplicate in tail of b well beyond max(a) must still be rejected
	assert.throws(() => setDifferenceSortedArrIterative([1], [2, 5, 5]), RangeError)

	// Unsorted / duplicates with custom comparator
	const byId = (x, y) => x.id - y.id
	assert.throws(
		() => setDifferenceSortedArrIterative([{ id: 2 }, { id: 1 }], [], byId),
		RangeError,
	)
	assert.throws(
		() => setDifferenceSortedArrIterative([], [{ id: 1 }, { id: 1 }], byId),
		RangeError,
	)
})

test('validation errors: invalid custom comparator return values', () => {
	assert.throws(
		() => setDifferenceSortedArrIterative([1, 2], [1], () => '0'),
		TypeError,
	)
	assert.throws(
		() => setDifferenceSortedArrIterative([1], [2], () => undefined),
		TypeError,
	)
	assert.throws(
		() => setDifferenceSortedArrIterative([1, 2], [1], () => NaN),
		RangeError,
	)
	assert.throws(
		() => setDifferenceSortedArrIterative([1], [2], () => NaN),
		RangeError,
	)
})

test('cross-check: matches Set-based reference and algebraic identities over generated datasets', () => {
	// Deterministic linear congruential generator for reproducible property tests
	let seed = 0x12345678
	function nextRand() {
		seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
		return seed / 0x100000000
	}

	function randomSortedUnique(maxLen, domainSize) {
		const len = Math.floor(nextRand() * (maxLen + 1))
		const picked = new Set()
		for (let k = 0; k < len; k += 1) {
			picked.add(Math.floor(nextRand() * domainSize) - Math.floor(domainSize / 2))
		}
		return Array.from(picked).sort((x, y) => x - y)
	}

	function setDifferenceReference(a, b) {
		const bSet = new Set(b)
		return a.filter((x) => !bSet.has(x))
	}

	for (let trial = 0; trial < 200; trial += 1) {
		const a = randomSortedUnique(40, 60)
		const b = randomSortedUnique(40, 60)
		const c = randomSortedUnique(40, 60)

		const diffAB = setDifferenceSortedArrIterative(a, b)
		const expectedAB = setDifferenceReference(a, b)

		// 1. Exact match against independent Set-based reference
		assert.deepEqual(diffAB, expectedAB)

		// 2. Output is strictly sorted and de-duplicated
		for (let k = 1; k < diffAB.length; k += 1) {
			assert.ok(diffAB[k - 1] < diffAB[k])
		}

		// 3. Idempotence: (A \ B) \ B === A \ B
		assert.deepEqual(setDifferenceSortedArrIterative(diffAB, b), diffAB)

		// 4. Double difference equals intersection: A \ (A \ B) === A ∩ B
		const bSet = new Set(b)
		const intersectionAB = a.filter((x) => bSet.has(x))
		assert.deepEqual(setDifferenceSortedArrIterative(a, diffAB), intersectionAB)

		// 5. Partition cardinality: |A \ B| + |A ∩ B| === |A|
		assert.equal(diffAB.length + intersectionAB.length, a.length)

		// 6. Order independence of sequential subtraction: (A \ B) \ C === (A \ C) \ B
		const diffABThenC = setDifferenceSortedArrIterative(diffAB, c)
		const diffACThenB = setDifferenceSortedArrIterative(
			setDifferenceSortedArrIterative(a, c),
			b,
		)
		assert.deepEqual(diffABThenC, diffACThenB)
	}

	// Larger dataset cross-check (2,000 elements)
	const largeA = Array.from({ length: 2000 }, (_, i) => i * 2)
	const largeB = Array.from({ length: 2000 }, (_, i) => i * 3)
	assert.deepEqual(
		setDifferenceSortedArrIterative(largeA, largeB),
		setDifferenceReference(largeA, largeB),
	)
})
