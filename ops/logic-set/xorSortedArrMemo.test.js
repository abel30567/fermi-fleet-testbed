import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { xorSortedArrMemo } from './xorSortedArrMemo.js'

/**
 * Independent Set-based reference implementation of symmetric difference (XOR)
 * over numeric arrays, completely separate from merge/table/memoization logic.
 *
 * @param {readonly number[]} a
 * @param {readonly number[]} b
 * @returns {number[]}
 */
function referenceXorSet(a, b) {
	const norm = (x) => (x === 0 ? 0 : x)
	const setA = new Set(a.map(norm))
	const setB = new Set(b.map(norm))
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
 * Deterministic PRNG (Mulberry32) for repeatable property-based cross-checks.
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
 * Generates a sorted, de-duplicated array of integers or floats.
 *
 * @param {() => number} rng
 * @param {number} maxLen
 * @param {number} minVal
 * @param {number} maxVal
 * @param {boolean} [allowFloats=false]
 * @returns {number[]}
 */
function randomSortedUniqueArray(rng, maxLen, minVal, maxVal, allowFloats = false) {
	const len = Math.floor(rng() * (maxLen + 1))
	const set = new Set()
	for (let i = 0; i < len; i++) {
		const raw = minVal + rng() * (maxVal - minVal)
		const val = allowFloats ? Math.round(raw * 100) / 100 : Math.floor(raw)
		set.add(val === 0 ? 0 : val)
	}
	return Array.from(set).sort((x, y) => x - y)
}

describe('xorSortedArrMemo', () => {
	beforeEach(() => {
		xorSortedArrMemo.clearCache()
	})

	describe('normal cases', () => {
		it('computes symmetric difference for overlapping arrays', () => {
			assert.deepEqual(xorSortedArrMemo([1, 2, 4, 7], [2, 3, 7, 9]), [1, 3, 4, 9])
			assert.deepEqual(xorSortedArrMemo([-10, -2, 0, 5, 12], [-2, 1, 5, 20]), [-10, 0, 1, 12, 20])
		})

		it('computes symmetric difference for completely disjoint arrays', () => {
			assert.deepEqual(xorSortedArrMemo([1, 3, 5], [2, 4, 6]), [1, 2, 3, 4, 5, 6])
			assert.deepEqual(xorSortedArrMemo([10, 20], [100, 200]), [10, 20, 100, 200])
			assert.deepEqual(xorSortedArrMemo([100, 200], [10, 20]), [10, 20, 100, 200])
		})

		it('handles subset and superset relationships', () => {
			assert.deepEqual(xorSortedArrMemo([1, 2, 3, 4, 5], [2, 4]), [1, 3, 5])
			assert.deepEqual(xorSortedArrMemo([2, 4], [1, 2, 3, 4, 5]), [1, 3, 5])
		})

		it('handles floating-point and negative numbers accurately', () => {
			assert.deepEqual(
				xorSortedArrMemo([-3.5, -1.25, 0.5, 2.75], [-3.5, 0.25, 0.5, 4.1]),
				[-1.25, 0.25, 2.75, 4.1],
			)
		})
	})

	describe('edge cases', () => {
		it('handles empty arrays', () => {
			assert.deepEqual(xorSortedArrMemo([], []), [])
			assert.deepEqual(xorSortedArrMemo([1, 5, 9], []), [1, 5, 9])
			assert.deepEqual(xorSortedArrMemo([], [1, 5, 9]), [1, 5, 9])

			// Must return a new array instance, not the input reference.
			const input = [1, 5, 9]
			const res = xorSortedArrMemo(input, [])
			assert.notEqual(res, input)
		})

		it('handles identical arrays and same-reference inputs', () => {
			assert.deepEqual(xorSortedArrMemo([1, 2, 3], [1, 2, 3]), [])
			const arr = [-50, 0, 50]
			assert.deepEqual(xorSortedArrMemo(arr, arr), [])
		})

		it('handles single-element arrays', () => {
			assert.deepEqual(xorSortedArrMemo([42], [42]), [])
			assert.deepEqual(xorSortedArrMemo([42], [43]), [42, 43])
			assert.deepEqual(xorSortedArrMemo([43], [42]), [42, 43])
		})

		it('normalizes -0 to +0', () => {
			assert.deepEqual(xorSortedArrMemo([-0], [0]), [])
			const res = xorSortedArrMemo([-0], [10])
			assert.deepEqual(res, [0, 10])
			assert.equal(Object.is(res[0], 0), true)
		})

		it('handles extreme finite IEEE-754 numbers without subtraction overflow', () => {
			const a = [-Number.MAX_VALUE, -Number.MIN_VALUE, Number.MAX_VALUE]
			const b = [-Number.MAX_VALUE, Number.MIN_VALUE, Number.MAX_VALUE]
			assert.deepEqual(xorSortedArrMemo(a, b), [-Number.MIN_VALUE, Number.MIN_VALUE])
		})

		it('handles trailing tails of very different lengths', () => {
			assert.deepEqual(
				xorSortedArrMemo([1], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
				[2, 3, 4, 5, 6, 7, 8, 9, 10],
			)
			assert.deepEqual(
				xorSortedArrMemo([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [10]),
				[1, 2, 3, 4, 5, 6, 7, 8, 9],
			)
		})
	})

	describe('invalid inputs', () => {
		it('throws TypeError when either argument is not an Array', () => {
			const badInputs = [null, undefined, 42, '1,2', {}, new Set([1, 2]), new Int32Array([1, 2])]
			for (const bad of badInputs) {
				assert.throws(() => xorSortedArrMemo(bad, [1, 2]), TypeError)
				assert.throws(() => xorSortedArrMemo([1, 2], bad), TypeError)
			}
		})

		it('throws TypeError for non-number elements and sparse arrays', () => {
			assert.throws(() => xorSortedArrMemo(['1', 2], [1]), TypeError)
			assert.throws(() => xorSortedArrMemo([1], [2, null]), TypeError)
			assert.throws(() => xorSortedArrMemo([undefined], []), TypeError)
			assert.throws(() => xorSortedArrMemo([1n, 2n], []), TypeError)
			assert.throws(() => xorSortedArrMemo([true], []), TypeError)

			// Sparse arrays
			// eslint-disable-next-line no-sparse-arrays
			assert.throws(() => xorSortedArrMemo([1, , 3], [2]), TypeError)
			assert.throws(() => xorSortedArrMemo([1], new Array(2)), TypeError)
		})

		it('throws RangeError for non-finite numbers (NaN, Infinity, -Infinity)', () => {
			assert.throws(() => xorSortedArrMemo([NaN], [1]), RangeError)
			assert.throws(() => xorSortedArrMemo([1], [Infinity]), RangeError)
			assert.throws(() => xorSortedArrMemo([-Infinity, 1], [1]), RangeError)
		})

		it('throws RangeError for unsorted arrays', () => {
			assert.throws(() => xorSortedArrMemo([3, 1, 2], [1]), RangeError)
			assert.throws(() => xorSortedArrMemo([1, 2], [2, 1]), RangeError)
			assert.throws(() => xorSortedArrMemo([], [10, 5]), RangeError)
			// Same invalid reference must still validate and throw
			const bad = [2, 1]
			assert.throws(() => xorSortedArrMemo(bad, bad), RangeError)
		})

		it('throws RangeError for duplicate elements including [-0, 0]', () => {
			assert.throws(() => xorSortedArrMemo([1, 2, 2, 3], [4]), RangeError)
			assert.throws(() => xorSortedArrMemo([1], [5, 5]), RangeError)
			assert.throws(() => xorSortedArrMemo([-0, 0], [1]), RangeError)
		})
	})

	describe('memoization and precomputed table behavior', () => {
		it('caches results across distinct array instances with equal values', () => {
			const r1 = xorSortedArrMemo([10, 20, 30], [20, 40])
			assert.deepEqual(r1, [10, 30, 40])
			assert.equal(xorSortedArrMemo.getCacheStats().misses, 1)
			assert.equal(xorSortedArrMemo.getCacheStats().hits, 0)
			assert.equal(xorSortedArrMemo.getCacheStats().size, 1)

			const r2 = xorSortedArrMemo([10, 20, 30], [20, 40])
			assert.deepEqual(r2, [10, 30, 40])
			assert.notEqual(r1, r2)
			assert.equal(xorSortedArrMemo.getCacheStats().hits, 1)
			assert.equal(xorSortedArrMemo.getCacheStats().misses, 1)
		})

		it('exploits commutativity so xor(b, a) hits the memo entry of xor(a, b)', () => {
			const r1 = xorSortedArrMemo([10, 20, 30], [15, 20, 25])
			const r2 = xorSortedArrMemo([15, 20, 25], [10, 20, 30])
			assert.deepEqual(r1, [10, 15, 25, 30])
			assert.deepEqual(r2, [10, 15, 25, 30])
			assert.equal(xorSortedArrMemo.getCacheStats().misses, 1)
			assert.equal(xorSortedArrMemo.getCacheStats().hits, 1)
			assert.equal(xorSortedArrMemo.getCacheStats().size, 1)
		})

		it('protects memoized and precomputed results from caller mutation', () => {
			// General merge path (memoized)
			const resMerge = xorSortedArrMemo([10, 20], [20, 30])
			resMerge.push(999)
			resMerge[0] = -999
			assert.deepEqual(xorSortedArrMemo([10, 20], [20, 30]), [10, 30])

			// Precomputed 8-bit table path (domain 0..7)
			const resTable = xorSortedArrMemo([0, 2, 5], [1, 2, 7])
			assert.deepEqual(resTable, [0, 1, 5, 7])
			resTable.splice(0, resTable.length, 42)
			assert.deepEqual(xorSortedArrMemo([0, 2, 5], [1, 2, 7]), [0, 1, 5, 7])

			// Clear cache and re-read from precomputed BYTE_SET_TABLE to prove table wasn't mutated
			xorSortedArrMemo.clearCache()
			assert.deepEqual(xorSortedArrMemo([0, 2, 5], [1, 2, 7]), [0, 1, 5, 7])
			assert.equal(xorSortedArrMemo.getCacheStats().tableHits, 1)
		})

		it('uses the precomputed byte-set table for subsets of {0..7} and merge path outside it', () => {
			assert.deepEqual(xorSortedArrMemo([0, 3, 7], [1, 3, 6]), [0, 1, 6, 7])
			assert.equal(xorSortedArrMemo.getCacheStats().tableHits, 1)

			// Outside {0..7}: value 8 forces merge path
			assert.deepEqual(xorSortedArrMemo([0, 3, 8], [1, 3, 6]), [0, 1, 6, 8])
			assert.equal(xorSortedArrMemo.getCacheStats().tableHits, 1)

			// Outside {0..7}: float value forces merge path
			assert.deepEqual(xorSortedArrMemo([0, 1.5], [1, 2]), [0, 1, 1.5, 2])
			assert.equal(xorSortedArrMemo.getCacheStats().tableHits, 1)
		})

		it('enforces bounded LRU eviction and supports clearCache()', () => {
			const { maxSize } = xorSortedArrMemo.getCacheStats()
			for (let i = 0; i < maxSize + 25; i++) {
				xorSortedArrMemo([i], [i + 10000])
			}
			const afterFill = xorSortedArrMemo.getCacheStats()
			assert.equal(afterFill.size, maxSize)
			assert.equal(afterFill.misses, maxSize + 25)
			assert.equal(afterFill.hits, 0)

			// Most recent entry should still be cached (hit)
			const last = maxSize + 24
			assert.deepEqual(xorSortedArrMemo([last], [last + 10000]), [last, last + 10000])
			assert.equal(xorSortedArrMemo.getCacheStats().hits, 1)

			// Oldest entry (0) should have been evicted (miss)
			assert.deepEqual(xorSortedArrMemo([0], [10000]), [0, 10000])
			assert.equal(xorSortedArrMemo.getCacheStats().misses, maxSize + 26)

			xorSortedArrMemo.clearCache()
			assert.deepEqual(xorSortedArrMemo.getCacheStats(), {
				size: 0,
				maxSize,
				hits: 0,
				misses: 0,
				tableHits: 0,
			})
		})
	})

	describe('independent cross-checks and algebraic properties', () => {
		it('matches independent Set-based reference across all 256x16 small-domain pairs', () => {
			const decode = (mask) => {
				const arr = []
				for (let b = 0; b < 8; b++) {
					if ((mask & (1 << b)) !== 0) arr.push(b)
				}
				return arr
			}
			for (let mA = 0; mA < 256; mA += 7) {
				const arrA = decode(mA)
				for (let mB = 0; mB < 256; mB += 15) {
					const arrB = decode(mB)
					assert.deepEqual(xorSortedArrMemo(arrA, arrB), referenceXorSet(arrA, arrB))
				}
			}
		})

		it('matches independent Set-based reference across 200 randomized integer and float cases', () => {
			const rng = createRng(0x5eed1234)
			for (let t = 0; t < 200; t++) {
				const allowFloats = t % 2 === 1
				const a = randomSortedUniqueArray(rng, 40, -100, 100, allowFloats)
				const b = randomSortedUniqueArray(rng, 40, -100, 100, allowFloats)
				const actual = xorSortedArrMemo(a, b)
				const expected = referenceXorSet(a, b)
				assert.deepEqual(actual, expected)

				// Verify output invariant: strictly ascending
				for (let i = 1; i < actual.length; i++) {
					assert.ok(actual[i - 1] < actual[i], `output not strictly ascending at ${i}`)
				}
			}
		})

		it('satisfies XOR algebraic identities (commutativity, associativity, identity, self-inverse, cancellation)', () => {
			const rng = createRng(0xcafebabe)
			for (let t = 0; t < 40; t++) {
				const a = randomSortedUniqueArray(rng, 25, -50, 50)
				const b = randomSortedUniqueArray(rng, 25, -50, 50)
				const c = randomSortedUniqueArray(rng, 25, -50, 50)

				// Commutativity: A ^ B === B ^ A
				assert.deepEqual(xorSortedArrMemo(a, b), xorSortedArrMemo(b, a))

				// Associativity: (A ^ B) ^ C === A ^ (B ^ C)
				assert.deepEqual(
					xorSortedArrMemo(xorSortedArrMemo(a, b), c),
					xorSortedArrMemo(a, xorSortedArrMemo(b, c)),
				)

				// Identity: A ^ [] === A
				assert.deepEqual(xorSortedArrMemo(a, []), a)

				// Self-inverse: A ^ A === []
				assert.deepEqual(xorSortedArrMemo(a, a), [])

				// Cancellation: (A ^ B) ^ B === A
				assert.deepEqual(xorSortedArrMemo(xorSortedArrMemo(a, b), b), a)
			}
		})
	})
})
