import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { intersectionSortedArrLazy } from './intersectionSortedArrLazy.js'

function take(iterable, count) {
	const result = []
	for (const value of iterable) {
		result.push(value)
		if (result.length >= count) break
	}
	return result
}

describe('intersectionSortedArrLazy', () => {
	describe('normal cases', () => {
		test('intersects overlapping sorted number arrays', () => {
			const result = [...intersectionSortedArrLazy([1, 2, 4, 7, 9], [2, 3, 4, 8, 9, 10])]
			assert.deepEqual(result, [2, 4, 9])
		})

		test('intersects identical arrays', () => {
			assert.deepEqual(
				[...intersectionSortedArrLazy([-5, 0, 5, 10], [-5, 0, 5, 10])],
				[-5, 0, 5, 10],
			)
		})

		test('intersects sorted string arrays', () => {
			assert.deepEqual(
				[...intersectionSortedArrLazy(['apple', 'banana', 'date', 'fig'], ['apricot', 'banana', 'cherry', 'fig'])],
				['banana', 'fig'],
			)
		})

		test('intersects sorted BigInt arrays', () => {
			assert.deepEqual(
				[...intersectionSortedArrLazy([1n, 5n, 100n, 1000n], [2n, 5n, 50n, 1000n])],
				[5n, 1000n],
			)
		})

		test('supports custom comparator for objects', () => {
			const a = [
				{ id: 1, label: 'a1' },
				{ id: 3, label: 'a3' },
				{ id: 5, label: 'a5' },
			]
			const b = [
				{ id: 2, label: 'b2' },
				{ id: 3, label: 'b3' },
				{ id: 5, label: 'b5' },
			]
			const byId = (x, y) => x.id - y.id
			const result = [...intersectionSortedArrLazy(a, b, byId)]
			assert.deepEqual(result, [
				{ id: 3, label: 'a3' },
				{ id: 5, label: 'a5' },
			])
		})

		test('supports descending order with custom comparator', () => {
			const desc = (x, y) => y - x
			assert.deepEqual(
				[...intersectionSortedArrLazy([10, 7, 4, 1], [9, 7, 3, 1], desc)],
				[7, 1],
			)
		})

		test('accepts TypedArrays and Sets as sorted iterables', () => {
			const a = new Int32Array([1, 3, 5, 7, 9])
			const b = new Set([2, 3, 6, 7, 10])
			assert.deepEqual([...intersectionSortedArrLazy(a, b)], [3, 7])
		})
	})

	describe('edge cases', () => {
		test('returns empty sequence when both inputs are empty', () => {
			assert.deepEqual([...intersectionSortedArrLazy([], [])], [])
		})

		test('returns empty sequence when one input is empty', () => {
			assert.deepEqual([...intersectionSortedArrLazy([], [1, 2, 3])], [])
			assert.deepEqual([...intersectionSortedArrLazy([1, 2, 3], [])], [])
		})

		test('returns empty sequence for disjoint arrays', () => {
			assert.deepEqual([...intersectionSortedArrLazy([1, 3, 5], [2, 4, 6])], [])
			assert.deepEqual([...intersectionSortedArrLazy([1, 2, 3], [10, 20, 30])], [])
		})

		test('handles single-element arrays', () => {
			assert.deepEqual([...intersectionSortedArrLazy([42], [42])], [42])
			assert.deepEqual([...intersectionSortedArrLazy([42], [43])], [])
		})

		test('handles negative numbers, -0/0, and infinities', () => {
			const a = [-Infinity, -10, -0, 5, Infinity]
			const b = [-Infinity, -5, 0, 5, Infinity]
			const result = [...intersectionSortedArrLazy(a, b)]
			assert.equal(result.length, 4)
			assert.equal(result[0], -Infinity)
			assert.equal(result[1] === 0, true)
			assert.equal(result[2], 5)
			assert.equal(result[3], Infinity)
		})

		test('does not mutate input arrays', () => {
			const a = [1, 2, 3, 4]
			const b = [2, 4, 6]
			const aCopy = [...a]
			const bCopy = [...b]
			assert.deepEqual([...intersectionSortedArrLazy(a, b)], [2, 4])
			assert.deepEqual(a, aCopy)
			assert.deepEqual(b, bCopy)
		})
	})

	describe('lazy and streaming behavior', () => {
		test('does not pull from either iterable until iterated', () => {
			let pullsA = 0
			let pullsB = 0
			const a = {
				*[Symbol.iterator]() {
					pullsA++
					yield 1
				},
			}
			const b = {
				*[Symbol.iterator]() {
					pullsB++
					yield 1
				},
			}

			const gen = intersectionSortedArrLazy(a, b)
			assert.equal(pullsA, 0)
			assert.equal(pullsB, 0)

			const first = gen.next()
			assert.deepEqual(first, { value: 1, done: false })
			assert.equal(pullsA, 1)
			assert.equal(pullsB, 1)
		})

		test('intersects infinite sorted generators lazily and pulls minimal elements', () => {
			let pullsA = 0
			let pullsB = 0
			let closedA = false
			let closedB = false

			function* multiplesOf(step, onPull, onClose) {
				try {
					for (let n = 0; ; n += step) {
						onPull()
						yield n
					}
				} finally {
					onClose()
				}
			}

			const evens = multiplesOf(2, () => pullsA++, () => { closedA = true })
			const threes = multiplesOf(3, () => pullsB++, () => { closedB = true })

			const firstFive = take(intersectionSortedArrLazy(evens, threes), 5)
			assert.deepEqual(firstFive, [0, 6, 12, 18, 24])
			// To reach 24: evens pulls 0,2,4,...,24 (13 items); threes pulls 0,3,6,...,24 (9 items).
			assert.equal(pullsA, 13)
			assert.equal(pullsB, 9)
			// Early break must close both underlying generators.
			assert.equal(closedA, true)
			assert.equal(closedB, true)
		})

		test('yields match before advancing either iterator to the next element', () => {
			let pullsA = 0
			let pullsB = 0
			function* tracked(items, onPull) {
				for (const item of items) {
					onPull()
					yield item
				}
			}

			const gen = intersectionSortedArrLazy(
				tracked([10, 20, 30], () => pullsA++),
				tracked([10, 20, 30], () => pullsB++),
			)

			assert.deepEqual(gen.next(), { value: 10, done: false })
			assert.equal(pullsA, 1)
			assert.equal(pullsB, 1)

			assert.deepEqual(gen.next(), { value: 20, done: false })
			assert.equal(pullsA, 2)
			assert.equal(pullsB, 2)
		})

		test('never pulls from second iterable when first iterable is empty', () => {
			let pulledB = false
			const b = {
				*[Symbol.iterator]() {
					pulledB = true
					yield 1
				},
			}
			assert.deepEqual([...intersectionSortedArrLazy([], b)], [])
			assert.equal(pulledB, false)
		})

		test('stops pulling from longer infinite stream once finite stream finishes', () => {
			let pullsInfinite = 0
			let closedInfinite = false
			function* naturals() {
				try {
					for (let i = 0; ; i++) {
						pullsInfinite++
						yield i
					}
				} finally {
					closedInfinite = true
				}
			}

			const result = [...intersectionSortedArrLazy([1, 3, 5], naturals())]
			assert.deepEqual(result, [1, 3, 5])
			// Pulls 0,1,2,3,4,5 (6 pulls) then finite stream ends on next advanceA() before pulling 6.
			assert.equal(pullsInfinite, 6)
			assert.equal(closedInfinite, true)
		})
	})

	describe('invalid input handling', () => {
		test('throws TypeError eagerly for non-iterable inputs', () => {
			for (const bad of [null, undefined, 42, true, 'abc', {}, () => {}]) {
				assert.throws(() => intersectionSortedArrLazy(bad, [1, 2]), TypeError)
				assert.throws(() => intersectionSortedArrLazy([1, 2], bad), TypeError)
			}
		})

		test('throws TypeError eagerly for non-function comparator', () => {
			for (const badCompare of [null, 123, 'asc', {}, []]) {
				assert.throws(
					() => intersectionSortedArrLazy([1, 2], [1, 2], badCompare),
					TypeError,
				)
			}
		})

		test('throws RangeError when sequence a or b is not sorted', () => {
			assert.throws(
				() => [...intersectionSortedArrLazy([1, 5, 3], [1, 6])],
				RangeError,
			)
			assert.throws(
				() => [...intersectionSortedArrLazy([1, 6], [1, 4, 2])],
				RangeError,
			)
		})

		test('throws RangeError when sequence a or b contains duplicates', () => {
			assert.throws(
				() => [...intersectionSortedArrLazy([1, 2, 2, 3], [1, 2, 3])],
				RangeError,
			)
			assert.throws(
				() => [...intersectionSortedArrLazy([1, 2, 3, 4], [1, 3, 3, 4])],
				RangeError,
			)
		})

		test('throws RangeError for NaN elements under default comparator', () => {
			assert.throws(
				() => [...intersectionSortedArrLazy([1, NaN, 3], [1, 2, 3])],
				RangeError,
			)
			assert.throws(
				() => [...intersectionSortedArrLazy([NaN], [])],
				RangeError,
			)
		})

		test('throws TypeError for unsupported or mixed types under default comparator', () => {
			assert.throws(
				() => [...intersectionSortedArrLazy([1, 2], ['1', '2'])],
				TypeError,
			)
			assert.throws(
				() => [...intersectionSortedArrLazy([null], [null])],
				TypeError,
			)
			assert.throws(
				() => [...intersectionSortedArrLazy([{ id: 1 }], [{ id: 1 }])],
				TypeError,
			)
		})

		test('throws TypeError when custom comparator returns NaN or non-number', () => {
			assert.throws(
				() => [...intersectionSortedArrLazy([1, 2], [1, 2], () => NaN)],
				TypeError,
			)
			assert.throws(
				() => [...intersectionSortedArrLazy([1, 2], [1, 2], () => '0')],
				TypeError,
			)
		})
	})

	describe('independent cross-checks and algebraic properties', () => {
		// Deterministic PRNG (Mulberry32) for reproducible property-based cross-checks.
		function mulberry32(seed) {
			let s = seed >>> 0
			return () => {
				s += 0x6d2b79f5
				let t = Math.imul(s ^ (s >>> 15), 1 | s)
				t ^= t + Math.imul(t ^ (t >>> 7), 61 | t)
				return ((t ^ (t >>> 14)) >>> 0) / 4294967296
			}
		}

		function randomSortedUniqueArray(rand, maxLen, minVal, maxVal) {
			const len = Math.floor(rand() * (maxLen + 1))
			const set = new Set()
			for (let i = 0; i < len; i++) {
				set.add(minVal + Math.floor(rand() * (maxVal - minVal + 1)))
			}
			return [...set].sort((x, y) => x - y)
		}

		function referenceSetIntersection(a, b) {
			const setB = new Set(b)
			return a.filter((x) => setB.has(x))
		}

		test('matches independent Set-based intersection across 200 randomized trials', () => {
			const rand = mulberry32(0x5eed1234)
			for (let trial = 0; trial < 200; trial++) {
				const a = randomSortedUniqueArray(rand, 40, -30, 30)
				const b = randomSortedUniqueArray(rand, 40, -30, 30)
				const expected = referenceSetIntersection(a, b)
				const actual = [...intersectionSortedArrLazy(a, b)]
				assert.deepEqual(actual, expected)
			}
		})

		test('satisfies commutativity, idempotence, and associativity', () => {
			const rand = mulberry32(0xabcdef01)
			for (let trial = 0; trial < 50; trial++) {
				const a = randomSortedUniqueArray(rand, 25, -20, 20)
				const b = randomSortedUniqueArray(rand, 25, -20, 20)
				const c = randomSortedUniqueArray(rand, 25, -20, 20)

				// Commutativity: A ∩ B === B ∩ A
				assert.deepEqual(
					[...intersectionSortedArrLazy(a, b)],
					[...intersectionSortedArrLazy(b, a)],
				)

				// Idempotence: A ∩ A === A
				assert.deepEqual([...intersectionSortedArrLazy(a, a)], a)

				// Associativity: (A ∩ B) ∩ C === A ∩ (B ∩ C) (chaining lazy generators directly!)
				const left = [...intersectionSortedArrLazy(intersectionSortedArrLazy(a, b), c)]
				const right = [...intersectionSortedArrLazy(a, intersectionSortedArrLazy(b, c))]
				assert.deepEqual(left, right)
			}
		})
	})
})
