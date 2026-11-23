import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { xorSortedArrLazy } from './xorSortedArrLazy.js'

/**
 * Independent set-based reference implementation for cross-checking numeric arrays.
 *
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number[]}
 */
function referenceXorNumbers(a, b) {
	const setA = new Set(a)
	const setB = new Set(b)
	const out = []
	for (const x of setA) {
		if (!setB.has(x)) out.push(x)
	}
	for (const x of setB) {
		if (!setA.has(x)) out.push(x)
	}
	return out.sort((x, y) => x - y)
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible property tests.
 *
 * @param {number} seed
 * @returns {() => number}
 */
function createRng(seed) {
	let state = seed >>> 0
	return () => {
		state = (state + 0x6d2b79f5) >>> 0
		let t = Math.imul(state ^ (state >>> 15), 1 | state)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

/**
 * Generate a strictly increasing sorted array of integers.
 *
 * @param {() => number} rng
 * @param {number} maxLen
 * @param {number} minVal
 * @param {number} maxVal
 * @returns {number[]}
 */
function randomSortedUnique(rng, maxLen, minVal, maxVal) {
	const len = Math.floor(rng() * (maxLen + 1))
	const set = new Set()
	const span = maxVal - minVal + 1
	for (let i = 0; i < len; i++) {
		set.add(minVal + Math.floor(rng() * span))
	}
	return Array.from(set).sort((x, y) => x - y)
}

describe('xorSortedArrLazy', () => {
	describe('normal cases', () => {
		test('computes symmetric difference of partially overlapping numeric arrays', () => {
			assert.deepEqual(
				Array.from(xorSortedArrLazy([1, 2, 3, 4], [3, 4, 5, 6])),
				[1, 2, 5, 6]
			)
		})

		test('merges disjoint interleaved sequences in sorted order', () => {
			assert.deepEqual(
				Array.from(xorSortedArrLazy([1, 3, 5, 7], [2, 4, 6, 8])),
				[1, 2, 3, 4, 5, 6, 7, 8]
			)
		})

		test('handles disjoint non-overlapping ranges in both orders', () => {
			assert.deepEqual(
				Array.from(xorSortedArrLazy([1, 2, 3], [10, 20, 30])),
				[1, 2, 3, 10, 20, 30]
			)
			assert.deepEqual(
				Array.from(xorSortedArrLazy([10, 20, 30], [1, 2, 3])),
				[1, 2, 3, 10, 20, 30]
			)
		})

		test('handles subset and superset inputs', () => {
			assert.deepEqual(
				Array.from(xorSortedArrLazy([1, 2, 3, 4, 5], [2, 4])),
				[1, 3, 5]
			)
			assert.deepEqual(
				Array.from(xorSortedArrLazy([2, 4], [1, 2, 3, 4, 5])),
				[1, 3, 5]
			)
		})

		test('supports strings and bigints with default comparator', () => {
			assert.deepEqual(
				Array.from(xorSortedArrLazy(['a', 'c', 'e'], ['b', 'c', 'd'])),
				['a', 'b', 'd', 'e']
			)
			assert.deepEqual(
				Array.from(xorSortedArrLazy([1n, 3n, 5n], [2n, 3n, 4n])),
				[1n, 2n, 4n, 5n]
			)
		})

		test('supports custom comparators (objects and descending order)', () => {
			const a = [{ id: 1 }, { id: 3 }, { id: 5 }]
			const b = [{ id: 2 }, { id: 3 }, { id: 6 }]
			assert.deepEqual(
				Array.from(xorSortedArrLazy(a, b, (x, y) => x.id - y.id)),
				[{ id: 1 }, { id: 2 }, { id: 5 }, { id: 6 }]
			)

			assert.deepEqual(
				Array.from(xorSortedArrLazy([9, 5, 1], [7, 5, 3], (x, y) => y - x)),
				[9, 7, 3, 1]
			)
		})

		test('accepts diverse iterable types (TypedArray, Set, generator, custom iterable)', () => {
			const typed = new Int32Array([-5, 0, 5])
			const set = new Set([0, 2, 5, 8])
			assert.deepEqual(Array.from(xorSortedArrLazy(typed, set)), [-5, 2, 8])

			const customIterable = {
				*[Symbol.iterator]() {
					yield 1
					yield 4
					yield 9
				},
			}
			function* gen() {
				yield 2
				yield 4
				yield 8
			}
			assert.deepEqual(
				Array.from(xorSortedArrLazy(customIterable, gen())),
				[1, 2, 8, 9]
			)
		})
	})

	describe('edge cases', () => {
		test('handles empty sequences', () => {
			assert.deepEqual(Array.from(xorSortedArrLazy([], [])), [])
			assert.deepEqual(Array.from(xorSortedArrLazy([1, 2, 3], [])), [1, 2, 3])
			assert.deepEqual(Array.from(xorSortedArrLazy([], [1, 2, 3])), [1, 2, 3])
		})

		test('returns empty sequence for identical inputs', () => {
			assert.deepEqual(Array.from(xorSortedArrLazy([1, 2, 3], [1, 2, 3])), [])
			assert.deepEqual(Array.from(xorSortedArrLazy([42], [42])), [])
		})

		test('handles single-element sequences', () => {
			assert.deepEqual(Array.from(xorSortedArrLazy([1], [2])), [1, 2])
			assert.deepEqual(Array.from(xorSortedArrLazy([2], [1])), [1, 2])
		})

		test('handles negative numbers, floats, infinities, and -0/+0', () => {
			assert.deepEqual(
				Array.from(
					xorSortedArrLazy(
						[-Infinity, -2.5, -0, 3.14, Infinity],
						[-Infinity, -1.5, 0, 3.14]
					)
				),
				[-2.5, -1.5, Infinity]
			)
		})

		test('chaining xorSortedArrLazy preserves laziness and computes multi-way XOR', () => {
			const ab = xorSortedArrLazy([1, 2, 3, 4], [2, 3, 5])
			const abc = xorSortedArrLazy(ab, [1, 5, 6])
			assert.deepEqual(Array.from(abc), [4, 6])
		})
	})

	describe('lazy and streaming behavior', () => {
		test('does not pull from either iterable until iteration begins', () => {
			let pullsA = 0
			let pullsB = 0

			function* genA() {
				for (const x of [1, 3, 5, 7]) {
					pullsA++
					yield x
				}
			}
			function* genB() {
				for (const x of [2, 4, 6, 8]) {
					pullsB++
					yield x
				}
			}

			const iter = xorSortedArrLazy(genA(), genB())
			assert.equal(pullsA, 0)
			assert.equal(pullsB, 0)

			const first = iter.next()
			assert.deepEqual(first, { value: 1, done: false })
			assert.equal(pullsA, 1)
			assert.equal(pullsB, 1)

			const second = iter.next()
			assert.deepEqual(second, { value: 2, done: false })
			assert.equal(pullsA, 2)
			assert.equal(pullsB, 1)

			iter.return()
		})

		test('streams infinite sorted generators in O(1) memory', () => {
			function* multiplesOf(step) {
				let n = step
				while (true) {
					yield n
					n += step
				}
			}

			const out = []
			for (const val of xorSortedArrLazy(multiplesOf(2), multiplesOf(3))) {
				out.push(val)
				if (out.length === 12) break
			}
			assert.deepEqual(out, [2, 3, 4, 8, 9, 10, 14, 15, 16, 20, 21, 22])
		})

		test('closes both unfinished upstream iterators on early termination', () => {
			let closedA = false
			let closedB = false

			function* trackedA() {
				try {
					let i = 0
					while (true) {
						yield i
						i += 2
					}
				} finally {
					closedA = true
				}
			}

			function* trackedB() {
				try {
					let i = 1
					while (true) {
						yield i
						i += 2
					}
				} finally {
					closedB = true
				}
			}

			const taken = []
			for (const v of xorSortedArrLazy(trackedA(), trackedB())) {
				taken.push(v)
				if (taken.length === 5) break
			}

			assert.deepEqual(taken, [0, 1, 2, 3, 4])
			assert.equal(closedA, true)
			assert.equal(closedB, true)
		})

		test('does not call return() on an already-exhausted iterator when terminating early', () => {
			let returnCalledA = false
			let returnCalledB = false

			const iterA = {
				[Symbol.iterator]() {
					let idx = 0
					const vals = [1]
					return {
						next() {
							return idx < vals.length
								? { value: vals[idx++], done: false }
								: { value: undefined, done: true }
						},
						return() {
							returnCalledA = true
							return { value: undefined, done: true }
						},
					}
				},
			}

			const iterB = {
				[Symbol.iterator]() {
					let v = 10
					return {
						next() {
							const cur = v
							v += 10
							return { value: cur, done: false }
						},
						return() {
							returnCalledB = true
							return { value: undefined, done: true }
						},
					}
				},
			}

			const result = []
			for (const x of xorSortedArrLazy(iterA, iterB)) {
				result.push(x)
				if (result.length === 2) break
			}
			assert.deepEqual(result, [1, 10])
			assert.equal(returnCalledA, false)
			assert.equal(returnCalledB, true)
		})
	})

	describe('invalid input handling', () => {
		test('throws TypeError synchronously for non-iterable or primitive inputs', () => {
			const invalidInputs = [null, undefined, 123, true, 'abc', {}, () => {}]
			for (const bad of invalidInputs) {
				assert.throws(() => xorSortedArrLazy(bad, []), TypeError)
				assert.throws(() => xorSortedArrLazy([], bad), TypeError)
			}
		})

		test('throws TypeError synchronously when compare is not a function', () => {
			for (const badCompare of [null, 42, 'asc', {}, []]) {
				assert.throws(
					() => xorSortedArrLazy([1], [2], badCompare),
					TypeError
				)
			}
		})

		test('throws RangeError for unsorted inputs during merge and tail drain', () => {
			assert.throws(
				() => Array.from(xorSortedArrLazy([1, 5, 3], [2, 4])),
				RangeError
			)
			assert.throws(
				() => Array.from(xorSortedArrLazy([2, 4], [1, 5, 3])),
				RangeError
			)
			assert.throws(
				() => Array.from(xorSortedArrLazy([1, 3, 2], [])),
				RangeError
			)
			assert.throws(
				() => Array.from(xorSortedArrLazy([], [1, 3, 2])),
				RangeError
			)
		})

		test('throws RangeError for duplicate elements in either input', () => {
			assert.throws(
				() => Array.from(xorSortedArrLazy([1, 2, 2, 3], [4])),
				RangeError
			)
			assert.throws(
				() => Array.from(xorSortedArrLazy([4], [1, 2, 2, 3])),
				RangeError
			)
			assert.throws(
				() => Array.from(xorSortedArrLazy([-0, 0], [])),
				RangeError
			)
		})

		test('throws RangeError for NaN values with default comparator', () => {
			assert.throws(() => Array.from(xorSortedArrLazy([NaN], [])), RangeError)
			assert.throws(() => Array.from(xorSortedArrLazy([], [NaN])), RangeError)
			assert.throws(
				() => Array.from(xorSortedArrLazy([1, NaN], [2])),
				RangeError
			)
		})

		test('throws TypeError for mixed or unsupported types with default comparator', () => {
			assert.throws(
				() => Array.from(xorSortedArrLazy([1], ['1'])),
				TypeError
			)
			assert.throws(
				() => Array.from(xorSortedArrLazy([1, '2'], [])),
				TypeError
			)
			assert.throws(
				() => Array.from(xorSortedArrLazy([{ id: 1 }], [])),
				TypeError
			)
		})

		test('throws on broken comparator return values or broken custom iterators', () => {
			assert.throws(
				() => Array.from(xorSortedArrLazy([1], [2], () => NaN)),
				RangeError
			)
			assert.throws(
				() => Array.from(xorSortedArrLazy([1], [2], () => '0')),
				TypeError
			)

			const badIterable = {
				[Symbol.iterator]() {
					return null
				},
			}
			assert.throws(
				() => Array.from(xorSortedArrLazy(badIterable, [])),
				TypeError
			)

			const badStepIterable = {
				[Symbol.iterator]() {
					return { next: () => null }
				},
			}
			assert.throws(
				() => Array.from(xorSortedArrLazy(badStepIterable, [])),
				TypeError
			)
		})

		test('closes healthy upstream iterator when sibling throws during iteration', () => {
			let closedB = false
			function* goodB() {
				try {
					yield 1
					yield 2
					yield 3
				} finally {
					closedB = true
				}
			}

			assert.throws(
				() => Array.from(xorSortedArrLazy([1, 5, 2], goodB())),
				RangeError
			)
			assert.equal(closedB, true)
		})
	})

	describe('independent cross-checks and algebraic properties', () => {
		test('matches Set-based reference XOR across 200 deterministic random test cases', () => {
			const rng = createRng(0x5eed1234)
			for (let i = 0; i < 200; i++) {
				const a = randomSortedUnique(rng, 25, -20, 20)
				const b = randomSortedUnique(rng, 25, -20, 20)
				const expected = referenceXorNumbers(a, b)
				const actual = Array.from(xorSortedArrLazy(a, b))
				assert.deepEqual(actual, expected)
			}
		})

		test('satisfies commutativity, identity, self-inverse, involution, and associativity', () => {
			const rng = createRng(0xabcdef01)
			for (let i = 0; i < 50; i++) {
				const a = randomSortedUnique(rng, 15, -15, 15)
				const b = randomSortedUnique(rng, 15, -15, 15)
				const c = randomSortedUnique(rng, 15, -15, 15)

				// Commutativity: A ^ B === B ^ A
				assert.deepEqual(
					Array.from(xorSortedArrLazy(a, b)),
					Array.from(xorSortedArrLazy(b, a))
				)

				// Identity: A ^ [] === A
				assert.deepEqual(Array.from(xorSortedArrLazy(a, [])), a)

				// Self-inverse: A ^ A === []
				assert.deepEqual(Array.from(xorSortedArrLazy(a, a)), [])

				// Involution: (A ^ B) ^ B === A
				assert.deepEqual(
					Array.from(xorSortedArrLazy(xorSortedArrLazy(a, b), b)),
					a
				)

				// Associativity: (A ^ B) ^ C === A ^ (B ^ C)
				assert.deepEqual(
					Array.from(xorSortedArrLazy(xorSortedArrLazy(a, b), c)),
					Array.from(xorSortedArrLazy(a, xorSortedArrLazy(b, c)))
				)
			}
		})
	})
})
