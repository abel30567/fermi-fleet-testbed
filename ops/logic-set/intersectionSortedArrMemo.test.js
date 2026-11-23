import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { intersectionSortedArrMemo } from './intersectionSortedArrMemo.js'

/**
 * Independent reference implementation using Set membership.
 * @template T
 * @param {ReadonlyArray<T>} a
 * @param {ReadonlyArray<T>} b
 * @returns {T[]}
 */
function referenceSetIntersection(a, b) {
	const setB = new Set(b)
	const out = []
	for (const x of a) {
		if (setB.has(x)) {
			out.push(typeof x === 'number' && x === 0 ? 0 : x)
		}
	}
	return out
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible property-based cross-checks.
 * @param {number} seed
 * @returns {() => number}
 */
function mulberry32(seed) {
	let s = seed >>> 0
	return () => {
		s = (s + 0x6d2b79f5) >>> 0
		let t = Math.imul(s ^ (s >>> 15), 1 | s)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

describe('intersectionSortedArrMemo', () => {
	beforeEach(() => {
		intersectionSortedArrMemo.clearCache()
	})

	describe('normal cases', () => {
		it('computes intersection of overlapping sorted number arrays', () => {
			assert.deepEqual(
				intersectionSortedArrMemo([1, 2, 4, 6, 8, 10], [2, 3, 4, 7, 10, 12]),
				[2, 4, 10],
			)
		})

		it('handles negative numbers, floats, and infinities', () => {
			assert.deepEqual(
				intersectionSortedArrMemo(
					[-Infinity, -10.5, -1, 0, 2.25, 100, Infinity],
					[-Infinity, -2, -1, 2.25, 50, Infinity],
				),
				[-Infinity, -1, 2.25, Infinity],
			)
		})

		it('handles sorted string arrays', () => {
			assert.deepEqual(
				intersectionSortedArrMemo(
					['apple', 'banana', 'cherry', 'fig'],
					['apricot', 'banana', 'date', 'fig', 'grape'],
				),
				['banana', 'fig'],
			)
		})

		it('handles sorted bigint arrays', () => {
			assert.deepEqual(
				intersectionSortedArrMemo(
					[-10n, 0n, 1n, 9007199254740993n, 100000000000000000000n],
					[0n, 2n, 9007199254740993n, 999999999999999999999n],
				),
				[0n, 9007199254740993n],
			)
		})

		it('supports custom comparators (descending numbers and objects)', () => {
			const desc = (x, y) => y - x
			assert.deepEqual(
				intersectionSortedArrMemo([10, 8, 5, 2, 0], [9, 8, 4, 2, -1], { compare: desc }),
				[8, 2],
			)

			const byId = (x, y) => x.id - y.id
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
			assert.deepEqual(intersectionSortedArrMemo(a, b, { compare: byId }), [
				{ id: 3, label: 'a3' },
				{ id: 5, label: 'a5' },
			])
		})
	})

	describe('edge cases', () => {
		it('handles empty arrays', () => {
			assert.deepEqual(intersectionSortedArrMemo([], []), [])
			assert.deepEqual(intersectionSortedArrMemo([], [1, 2, 3]), [])
			assert.deepEqual(intersectionSortedArrMemo([1, 2, 3], []), [])
			assert.deepEqual(intersectionSortedArrMemo([], ['a', 'b']), [])
		})

		it('handles disjoint arrays', () => {
			assert.deepEqual(intersectionSortedArrMemo([1, 3, 5, 7], [2, 4, 6, 8]), [])
			assert.deepEqual(intersectionSortedArrMemo([10, 20, 30], [40, 50, 60]), [])
		})

		it('handles identical arrays and subsets', () => {
			assert.deepEqual(intersectionSortedArrMemo([10, 20, 30], [10, 20, 30]), [10, 20, 30])
			assert.deepEqual(intersectionSortedArrMemo([20], [10, 20, 30]), [20])
			assert.deepEqual(intersectionSortedArrMemo([10, 20, 30], [20]), [20])
		})

		it('handles single-element arrays and boundary matches', () => {
			assert.deepEqual(intersectionSortedArrMemo([42], [42]), [42])
			assert.deepEqual(intersectionSortedArrMemo([42], [43]), [])
			assert.deepEqual(intersectionSortedArrMemo([1, 2, 3], [3, 4, 5]), [3])
		})

		it('canonicalizes -0 and +0 consistently', () => {
			const res = intersectionSortedArrMemo([-0, 10], [0, 10])
			assert.deepEqual(res, [0, 10])
			assert.equal(Object.is(res[0], 0), true)
		})

		it('does not mutate inputs and defends cached output against caller mutation', () => {
			const a = [10, 20, 30]
			const b = [20, 30, 40]
			const first = intersectionSortedArrMemo(a, b)
			assert.deepEqual(first, [20, 30])

			first.push(999)
			first[0] = -1

			const second = intersectionSortedArrMemo(a, b)
			assert.deepEqual(second, [20, 30])
			assert.deepEqual(a, [10, 20, 30])
			assert.deepEqual(b, [20, 30, 40])
		})

		it('avoids cache key collisions for strings containing delimiters and control characters', () => {
			const r1 = intersectionSortedArrMemo(['a,b'], ['a,b'])
			const r2 = intersectionSortedArrMemo(['a', 'b'], ['a', 'b'])
			const r3 = intersectionSortedArrMemo(['a|b'], ['c'])
			const r4 = intersectionSortedArrMemo(['a'], ['b|c'])
			const r5 = intersectionSortedArrMemo(['', '\0', '1:a'], ['\0', '1:a', '2:bb'])

			assert.deepEqual(r1, ['a,b'])
			assert.deepEqual(r2, ['a', 'b'])
			assert.deepEqual(r3, [])
			assert.deepEqual(r4, [])
			assert.deepEqual(r5, ['\0', '1:a'])
		})

		it('reflects in-place mutations to input arrays instead of returning stale cache data', () => {
			const a = [10, 20, 30]
			const b = [20, 30, 40]
			assert.deepEqual(intersectionSortedArrMemo(a, b), [20, 30])

			a[1] = 25 // still strictly sorted: [10, 25, 30]
			assert.deepEqual(intersectionSortedArrMemo(a, b), [30])
		})
	})

	describe('invalid inputs', () => {
		it('rejects non-array arguments', () => {
			for (const bad of [null, undefined, 123, 'abc', {}, new Set([1]), new Int32Array([1])]) {
				assert.throws(() => intersectionSortedArrMemo(bad, [1]), TypeError)
				assert.throws(() => intersectionSortedArrMemo([1], bad), TypeError)
			}
		})

		it('rejects sparse arrays', () => {
			// eslint-disable-next-line no-sparse-arrays
			const sparse = [1, , 3]
			assert.throws(() => intersectionSortedArrMemo(sparse, [1, 3]), TypeError)
			assert.throws(() => intersectionSortedArrMemo([1, 3], new Array(2)), TypeError)
		})

		it('rejects unsorted arrays (even when the other array is empty)', () => {
			assert.throws(() => intersectionSortedArrMemo([3, 1, 2], [1, 2]), RangeError)
			assert.throws(() => intersectionSortedArrMemo([1, 2], [2, 1]), RangeError)
			assert.throws(() => intersectionSortedArrMemo([], [5, 2]), RangeError)
			assert.throws(() => intersectionSortedArrMemo([5, 2], []), RangeError)
		})

		it('rejects duplicate elements (including -0 and +0)', () => {
			assert.throws(() => intersectionSortedArrMemo([1, 2, 2, 3], [1, 3]), RangeError)
			assert.throws(() => intersectionSortedArrMemo([1, 3], [2, 2]), RangeError)
			assert.throws(() => intersectionSortedArrMemo([-0, 0], [0]), RangeError)
			assert.throws(() => intersectionSortedArrMemo(['a', 'a'], ['a']), RangeError)
		})

		it('rejects NaN, unsupported types, and mixed element types', () => {
			assert.throws(() => intersectionSortedArrMemo([1, NaN], [1]), RangeError)
			assert.throws(() => intersectionSortedArrMemo([1], [NaN]), RangeError)
			assert.throws(() => intersectionSortedArrMemo([true], [true]), TypeError)
			assert.throws(() => intersectionSortedArrMemo([null], [null]), TypeError)
			assert.throws(() => intersectionSortedArrMemo([{}], [{}]), TypeError)
			assert.throws(() => intersectionSortedArrMemo([1, '2'], [1]), TypeError)
			assert.throws(() => intersectionSortedArrMemo([1, 2], ['1', '2']), TypeError)
			assert.throws(() => intersectionSortedArrMemo([1, 2], [1n, 2n]), TypeError)
		})

		it('rejects invalid options and bad comparator return values', () => {
			assert.throws(() => intersectionSortedArrMemo([1], [1], null), TypeError)
			assert.throws(() => intersectionSortedArrMemo([1], [1], []), TypeError)
			assert.throws(() => intersectionSortedArrMemo([1], [1], 'bad'), TypeError)
			assert.throws(() => intersectionSortedArrMemo([1], [1], { compare: 'not-fn' }), TypeError)
			assert.throws(() => intersectionSortedArrMemo([1], [1], { memoize: 'yes' }), TypeError)
			assert.throws(
				() => intersectionSortedArrMemo([1, 2], [1, 2], { compare: () => '0' }),
				TypeError,
			)
			assert.throws(
				() => intersectionSortedArrMemo([1, 2], [1, 2], { compare: () => NaN }),
				RangeError,
			)
		})
	})

	describe('memoization and table-driven behavior', () => {
		it('exposes a frozen 3-state merge transition table', () => {
			const table = intersectionSortedArrMemo.transitionTable
			assert.equal(Object.isFrozen(table), true)
			assert.equal(table.length, 3)
			assert.deepEqual(table[0], { di: 1, dj: 0, emit: false })
			assert.deepEqual(table[1], { di: 1, dj: 1, emit: true })
			assert.deepEqual(table[2], { di: 0, dj: 1, emit: false })
			for (const entry of table) {
				assert.equal(Object.isFrozen(entry), true)
			}
		})

		it('caches results and reuses commutative pair entries', () => {
			assert.deepEqual(intersectionSortedArrMemo([10, 20, 30], [20, 30, 40]), [20, 30])
			let stats = intersectionSortedArrMemo.getCacheStats()
			assert.equal(stats.misses, 1)
			assert.equal(stats.hits, 0)
			assert.equal(stats.tableHits, 0)
			assert.equal(stats.size, 1)

			// Identical call -> cache hit
			assert.deepEqual(intersectionSortedArrMemo([10, 20, 30], [20, 30, 40]), [20, 30])
			stats = intersectionSortedArrMemo.getCacheStats()
			assert.equal(stats.hits, 1)
			assert.equal(stats.misses, 1)

			// Reversed argument order -> commutative cache hit
			assert.deepEqual(intersectionSortedArrMemo([20, 30, 40], [10, 20, 30]), [20, 30])
			stats = intersectionSortedArrMemo.getCacheStats()
			assert.equal(stats.hits, 2)
			assert.equal(stats.misses, 1)
			assert.equal(stats.size, 1)
		})

		it('uses the precomputed small-domain lookup table for integers in [0, 7] and caches the result', () => {
			assert.deepEqual(intersectionSortedArrMemo([0, 2, 5, 7], [1, 2, 4, 7]), [2, 7])
			let stats = intersectionSortedArrMemo.getCacheStats()
			assert.equal(stats.misses, 1)
			assert.equal(stats.tableHits, 1)
			assert.equal(stats.hits, 0)

			// Second call hits memo cache before precomputed table
			assert.deepEqual(intersectionSortedArrMemo([0, 2, 5, 7], [1, 2, 4, 7]), [2, 7])
			stats = intersectionSortedArrMemo.getCacheStats()
			assert.equal(stats.hits, 1)
			assert.equal(stats.tableHits, 1)
		})

		it('respects options.memoize = false', () => {
			assert.deepEqual(
				intersectionSortedArrMemo([10, 20], [20, 30], { memoize: false }),
				[20],
			)
			assert.deepEqual(
				intersectionSortedArrMemo([10, 20], [20, 30], { memoize: false }),
				[20],
			)
			const stats = intersectionSortedArrMemo.getCacheStats()
			assert.equal(stats.hits, 0)
			assert.equal(stats.misses, 0)
			assert.equal(stats.size, 0)
		})

		it('memoizes custom comparator calls on primitive inputs without redundant merge comparisons', () => {
			let calls = 0
			const desc = (x, y) => {
				calls++
				return y - x
			}
			const a = [50, 40, 30, 20, 10]
			const b = [45, 40, 25, 20, 5]

			assert.deepEqual(intersectionSortedArrMemo(a, b, { compare: desc }), [40, 20])
			const firstCallComparisons = calls
			// Validation takes (a.length - 1) + (b.length - 1) = 8 comparisons; merge adds more
			assert.ok(firstCallComparisons > 8)

			calls = 0
			assert.deepEqual(intersectionSortedArrMemo(a, b, { compare: desc }), [40, 20])
			// Cache hit only runs validation (8 comparisons), skipping the merge loop
			assert.equal(calls, 8)
		})

		it('enforces bounded LRU cache capacity and evicts least-recently-used entries', () => {
			const { maxSize } = intersectionSortedArrMemo.getCacheStats()
			for (let k = 0; k < maxSize + 25; k++) {
				intersectionSortedArrMemo([k, k + 10000], [k + 10000, k + 20000])
			}
			const stats = intersectionSortedArrMemo.getCacheStats()
			assert.equal(stats.size, maxSize)
			assert.equal(stats.evictions, 25)

			// Most recent entry is still cached
			const hitsBefore = stats.hits
			assert.deepEqual(
				intersectionSortedArrMemo(
					[maxSize + 24, maxSize + 10024],
					[maxSize + 10024, maxSize + 20024],
				),
				[maxSize + 10024],
			)
			assert.equal(intersectionSortedArrMemo.getCacheStats().hits, hitsBefore + 1)

			// Oldest entry (k=0) was evicted -> miss
			const missesBefore = intersectionSortedArrMemo.getCacheStats().misses
			assert.deepEqual(intersectionSortedArrMemo([0, 10000], [10000, 20000]), [10000])
			assert.equal(intersectionSortedArrMemo.getCacheStats().misses, missesBefore + 1)
		})
	})

	describe('independent cross-checks and algebraic laws', () => {
		it('matches Set-based reference exhaustively across all subsets of {0, 1, 2, 3, 4}', () => {
			const subsets = []
			for (let mask = 0; mask < 32; mask++) {
				const arr = []
				for (let bit = 0; bit < 5; bit++) {
					if ((mask & (1 << bit)) !== 0) arr.push(bit)
				}
				subsets.push(arr)
			}

			for (const a of subsets) {
				for (const b of subsets) {
					const actual = intersectionSortedArrMemo(a, b)
					const expected = referenceSetIntersection(a, b)
					assert.deepEqual(actual, expected)
				}
			}
		})

		it('matches Set-based reference and satisfies set-algebra laws on randomized sorted arrays', () => {
			const rand = mulberry32(20261123)

			const makeRandomSortedInts = (maxLen, minVal, maxVal) => {
				const len = Math.floor(rand() * (maxLen + 1))
				const set = new Set()
				const span = maxVal - minVal + 1
				for (let i = 0; i < len; i++) {
					set.add(minVal + Math.floor(rand() * span))
				}
				return Array.from(set).sort((x, y) => x - y)
			}

			for (let trial = 0; trial < 200; trial++) {
				const a = makeRandomSortedInts(40, -50, 50)
				const b = makeRandomSortedInts(40, -50, 50)
				const c = makeRandomSortedInts(40, -50, 50)

				const ab = intersectionSortedArrMemo(a, b)
				const ba = intersectionSortedArrMemo(b, a)
				const refAB = referenceSetIntersection(a, b)

				// Cross-check against independent Set implementation
				assert.deepEqual(ab, refAB)

				// Commutativity: A ∩ B = B ∩ A
				assert.deepEqual(ab, ba)

				// Idempotence: A ∩ A = A
				assert.deepEqual(intersectionSortedArrMemo(a, a), a)

				// Associativity: (A ∩ B) ∩ C = A ∩ (B ∩ C)
				const leftAssoc = intersectionSortedArrMemo(ab, c)
				const rightAssoc = intersectionSortedArrMemo(a, intersectionSortedArrMemo(b, c))
				assert.deepEqual(leftAssoc, rightAssoc)

				// Output invariant: strictly sorted & de-duplicated
				for (let i = 1; i < ab.length; i++) {
					assert.ok(ab[i - 1] < ab[i])
				}
			}
		})

		it('matches Set-based reference on randomized sorted string arrays', () => {
			const rand = mulberry32(99887766)
			const alphabet = ['a', 'b', 'c', ':', ',', '|', '\0', 'z']

			const makeRandomSortedStrings = (maxLen) => {
				const len = Math.floor(rand() * (maxLen + 1))
				const set = new Set()
				for (let i = 0; i < len; i++) {
					const strLen = Math.floor(rand() * 5)
					let s = ''
					for (let j = 0; j < strLen; j++) {
						s += alphabet[Math.floor(rand() * alphabet.length)]
					}
					set.add(s)
				}
				return Array.from(set).sort()
			}

			for (let trial = 0; trial < 100; trial++) {
				const a = makeRandomSortedStrings(25)
				const b = makeRandomSortedStrings(25)
				assert.deepEqual(intersectionSortedArrMemo(a, b), referenceSetIntersection(a, b))
			}
		})
	})
})
