import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { andMultisetMemo } from './andMultisetMemo.js'

/**
 * Independent reference implementation of multiset AND (intersection)
 * without memoization or lookup tables.
 *
 * @template T
 * @param {Map<T, number>} a
 * @param {Map<T, number>} b
 * @returns {Map<T, number>}
 */
function referenceAndMultiset(a, b) {
	const out = new Map()
	const keys = new Set([...a.keys(), ...b.keys()])
	for (const k of keys) {
		const ca = a.get(k) ?? 0
		const cb = b.get(k) ?? 0
		const m = Math.min(ca, cb)
		if (m > 0) out.set(k, m)
	}
	return out
}

/**
 * Independent bag-expansion reference: expand multisets into sorted arrays of
 * elements, intersect via two-pointer merge, and recount into a Map.
 *
 * @param {Map<string, number>} a
 * @param {Map<string, number>} b
 * @returns {Map<string, number>}
 */
function arrayBagIntersection(a, b) {
	const expand = (m) => {
		const arr = []
		for (const [k, c] of m) {
			for (let i = 0; i < c; i++) arr.push(k)
		}
		return arr.sort()
	}
	const arrA = expand(a)
	const arrB = expand(b)
	const out = new Map()
	let i = 0
	let j = 0
	while (i < arrA.length && j < arrB.length) {
		if (arrA[i] === arrB[j]) {
			out.set(arrA[i], (out.get(arrA[i]) ?? 0) + 1)
			i++
			j++
		} else if (arrA[i] < arrB[j]) {
			i++
		} else {
			j++
		}
	}
	return out
}

describe('andMultisetMemo', () => {
	beforeEach(() => {
		andMultisetMemo.clearCache()
	})

	describe('normal cases', () => {
		it('computes element-wise minimum counts for overlapping multisets', () => {
			const a = new Map([
				['apple', 3],
				['banana', 2],
				['cherry', 5],
			])
			const b = new Map([
				['apple', 1],
				['banana', 4],
				['date', 2],
			])

			const result = andMultisetMemo(a, b)
			assert.deepEqual(
				result,
				new Map([
					['apple', 1],
					['banana', 2],
				]),
			)
		})

		it('handles identical multisets and equal counts', () => {
			const a = new Map([
				[1, 3],
				[2, 7],
			])
			const b = new Map([
				[1, 3],
				[2, 7],
			])
			assert.deepEqual(
				andMultisetMemo(a, b),
				new Map([
					[1, 3],
					[2, 7],
				]),
			)
		})

		it('supports heterogeneous JavaScript Map key types', () => {
			const objKey = { id: 1 }
			const fnKey = () => {}
			const localSym = Symbol('local')
			const globalSym = Symbol.for('fermi.andMultisetMemo.test')

			const a = new Map([
				[null, 3],
				[undefined, 2],
				[true, 4],
				[false, 1],
				[NaN, 5],
				[-0, 6],
				[42n, 3],
				[objKey, 2],
				[fnKey, 4],
				[localSym, 3],
				[globalSym, 2],
				[Symbol('uniqueA'), 5],
			])
			const b = new Map([
				[null, 1],
				[undefined, 5],
				[true, 2],
				[false, 3],
				[NaN, 2],
				[0, 4],
				[42n, 8],
				[objKey, 7],
				[fnKey, 1],
				[localSym, 1],
				[globalSym, 6],
				[Symbol('uniqueB'), 5],
			])

			const result = andMultisetMemo(a, b)
			assert.equal(result.size, 11)
			assert.equal(result.get(null), 1)
			assert.equal(result.get(undefined), 2)
			assert.equal(result.get(true), 2)
			assert.equal(result.get(false), 1)
			assert.equal(result.get(NaN), 2)
			assert.equal(result.get(0), 4)
			assert.equal(result.get(42n), 3)
			assert.equal(result.get(objKey), 2)
			assert.equal(result.get(fnKey), 1)
			assert.equal(result.get(localSym), 1)
			assert.equal(result.get(globalSym), 2)
		})

		it('does not mutate input Maps', () => {
			const a = new Map([
				['x', 4],
				['y', 2],
			])
			const b = new Map([
				['x', 1],
				['z', 3],
			])
			andMultisetMemo(a, b)
			assert.deepEqual(
				a,
				new Map([
					['x', 4],
					['y', 2],
				]),
			)
			assert.deepEqual(
				b,
				new Map([
					['x', 1],
					['z', 3],
				]),
			)
		})
	})

	describe('edge cases and table boundaries', () => {
		it('handles empty and disjoint multisets', () => {
			assert.deepEqual(andMultisetMemo(new Map(), new Map()), new Map())
			assert.deepEqual(
				andMultisetMemo(new Map([['a', 3]]), new Map()),
				new Map(),
			)
			assert.deepEqual(
				andMultisetMemo(new Map(), new Map([['a', 3]])),
				new Map(),
			)
			assert.deepEqual(
				andMultisetMemo(new Map([['a', 2]]), new Map([['b', 2]])),
				new Map(),
			)
		})

		it('omits entries whose input count is 0 (including -0)', () => {
			const a = new Map([
				['a', 0],
				['b', 5],
				['c', -0],
			])
			const b = new Map([
				['a', 4],
				['b', 0],
				['c', 3],
			])
			const result = andMultisetMemo(a, b)
			assert.equal(result.size, 0)
			assert.deepEqual(result, new Map())
		})

		it('handles counts around and far beyond the precomputed lookup table boundary', () => {
			const { tableMax } = andMultisetMemo.getCacheStats()
			assert.equal(tableMax, 64)

			const a = new Map([
				['below', tableMax - 1],
				['exact', tableMax],
				['above', tableMax + 1],
				['mixedLow', tableMax],
				['mixedHigh', tableMax + 10],
				['maxSafe', Number.MAX_SAFE_INTEGER],
			])
			const b = new Map([
				['below', tableMax],
				['exact', tableMax],
				['above', tableMax + 5],
				['mixedLow', tableMax + 2],
				['mixedHigh', tableMax - 2],
				['maxSafe', Number.MAX_SAFE_INTEGER - 1],
			])

			const result = andMultisetMemo(a, b)
			assert.deepEqual(
				result,
				new Map([
					['below', tableMax - 1],
					['exact', tableMax],
					['above', tableMax + 1],
					['mixedLow', tableMax],
					['mixedHigh', tableMax - 2],
					['maxSafe', Number.MAX_SAFE_INTEGER - 1],
				]),
			)
		})

		it('avoids signature collisions for strings with delimiter characters', () => {
			const a1 = new Map([['a=1;b', 2]])
			const b1 = new Map([['a=1;b', 2]])
			const a2 = new Map([
				['a', 1],
				['b', 2],
			])
			const b2 = new Map([
				['a', 1],
				['b', 2],
			])

			const r1 = andMultisetMemo(a1, b1)
			const r2 = andMultisetMemo(a2, b2)
			assert.deepEqual(r1, new Map([['a=1;b', 2]]))
			assert.deepEqual(
				r2,
				new Map([
					['a', 1],
					['b', 2],
				]),
			)
			assert.equal(andMultisetMemo.getCacheStats().misses, 2)
		})

		it('distinguishes distinct object references and non-registered symbols', () => {
			const o1 = { k: 1 }
			const o2 = { k: 1 }
			const s1 = Symbol('dup')
			const s2 = Symbol('dup')

			assert.deepEqual(
				andMultisetMemo(new Map([[o1, 2]]), new Map([[o2, 2]])),
				new Map(),
			)
			assert.deepEqual(
				andMultisetMemo(new Map([[s1, 2]]), new Map([[s2, 2]])),
				new Map(),
			)
		})
	})

	describe('memoization and cache behavior', () => {
		it('memoizes repeated calls and shares entries commutatively and across insertion orders', () => {
			const a = new Map([
				['x', 3],
				['y', 5],
			])
			const b = new Map([
				['y', 2],
				['x', 7],
			])
			const aReordered = new Map([
				['y', 5],
				['x', 3],
			])

			const r1 = andMultisetMemo(a, b)
			assert.deepEqual(andMultisetMemo.getCacheStats(), {
				size: 1,
				maxSize: 512,
				hits: 0,
				misses: 1,
				tableMax: 64,
			})

			// Exact repeat
			const r2 = andMultisetMemo(a, b)
			assert.deepEqual(r2, r1)
			assert.notEqual(r2, r1) // defensive copy
			assert.equal(andMultisetMemo.getCacheStats().hits, 1)

			// Commutative order (b, a) hits the same cache entry
			const r3 = andMultisetMemo(b, a)
			assert.deepEqual(r3, r1)
			assert.equal(andMultisetMemo.getCacheStats().hits, 2)

			// Same logical multiset with different Map insertion order hits cache
			const r4 = andMultisetMemo(aReordered, b)
			assert.deepEqual(r4, r1)
			assert.equal(andMultisetMemo.getCacheStats().hits, 3)
			assert.equal(andMultisetMemo.getCacheStats().size, 1)
		})

		it('isolates cached entries from caller mutation of returned Map', () => {
			const a = new Map([['k', 4]])
			const b = new Map([['k', 2]])

			const r1 = andMultisetMemo(a, b)
			r1.set('k', 999)
			r1.set('injected', 1)

			const r2 = andMultisetMemo(a, b)
			assert.deepEqual(r2, new Map([['k', 2]]))
			assert.equal(andMultisetMemo.getCacheStats().hits, 1)
		})

		it('reflects mutations made to input Maps after an earlier memoized call', () => {
			const a = new Map([['k', 4]])
			const b = new Map([['k', 2]])

			assert.deepEqual(andMultisetMemo(a, b), new Map([['k', 2]]))

			b.set('k', 1)
			assert.deepEqual(andMultisetMemo(a, b), new Map([['k', 1]]))
			assert.equal(andMultisetMemo.getCacheStats().misses, 2)
		})

		it('enforces bounded LRU cache capacity without unbounded growth', () => {
			const { maxSize } = andMultisetMemo.getCacheStats()
			const total = maxSize + 50
			for (let i = 0; i < total; i++) {
				const a = new Map([[`k${i}`, 2]])
				const b = new Map([[`k${i}`, 1]])
				const res = andMultisetMemo(a, b)
				assert.equal(res.get(`k${i}`), 1)
			}
			const stats = andMultisetMemo.getCacheStats()
			assert.equal(stats.size, maxSize)
			assert.equal(stats.misses, total)
		})
	})

	describe('error handling', () => {
		it('throws TypeError when either argument is not a Map', () => {
			const valid = new Map([['a', 1]])
			for (const bad of [null, undefined, {}, [], new Set(), 'map', 123]) {
				assert.throws(() => andMultisetMemo(bad, valid), TypeError)
				assert.throws(() => andMultisetMemo(valid, bad), TypeError)
			}
		})

		it('throws TypeError when any count is not a number', () => {
			const valid = new Map([['a', 1]])
			for (const badCount of ['1', null, undefined, 1n, true, {}, []]) {
				assert.throws(
					() => andMultisetMemo(new Map([['a', badCount]]), valid),
					TypeError,
				)
				assert.throws(
					() => andMultisetMemo(valid, new Map([['a', badCount]])),
					TypeError,
				)
			}
		})

		it('throws RangeError for negative, fractional, non-finite, or unsafe integer counts', () => {
			const valid = new Map([['a', 1]])
			for (const badCount of [
				-1,
				-100,
				0.5,
				1.1,
				NaN,
				Infinity,
				-Infinity,
				Number.MAX_SAFE_INTEGER + 1,
			]) {
				assert.throws(
					() => andMultisetMemo(new Map([['a', badCount]]), valid),
					RangeError,
				)
				assert.throws(
					() => andMultisetMemo(valid, new Map([['a', badCount]])),
					RangeError,
				)
			}
		})

		it('validates all entries even when the other multiset is empty', () => {
			assert.throws(
				() => andMultisetMemo(new Map(), new Map([['x', -1]])),
				RangeError,
			)
			assert.throws(
				() => andMultisetMemo(new Map([['x', 'bad']]), new Map()),
				TypeError,
			)
		})
	})

	describe('independent cross-checks and algebraic laws', () => {
		/** Deterministic PRNG (Mulberry32) for reproducible fuzz cross-checks. */
		function makeRng(seed) {
			let s = seed >>> 0
			return () => {
				s = (s + 0x6d2b79f5) >>> 0
				let t = Math.imul(s ^ (s >>> 15), 1 | s)
				t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
				return ((t ^ (t >>> 14)) >>> 0) / 4294967296
			}
		}

		function randomMultiset(rng, alphabet, maxCount) {
			const m = new Map()
			for (const k of alphabet) {
				if (rng() < 0.7) {
					m.set(k, Math.floor(rng() * (maxCount + 1)))
				}
			}
			return m
		}

		it('matches independent reference and bag-array intersection across randomized inputs', () => {
			const rng = makeRng(20261123)
			const alphabet = ['a', 'b', 'c', 'd', 'e', 'f']

			for (let trial = 0; trial < 100; trial++) {
				// Mix small counts (in lookup table) and larger counts (above lookup table)
				const maxCount = trial < 60 ? 15 : 100
				const a = randomMultiset(rng, alphabet, maxCount)
				const b = randomMultiset(rng, alphabet, maxCount)

				const actual = andMultisetMemo(a, b)
				const expectedRef = referenceAndMultiset(a, b)
				assert.deepEqual(actual, expectedRef)

				if (maxCount <= 15) {
					const expectedBag = arrayBagIntersection(a, b)
					assert.deepEqual(actual, expectedBag)
				}
			}
		})

		it('satisfies commutativity, associativity, idempotence, and min+max=sum identity', () => {
			const rng = makeRng(424242)
			const alphabet = ['p', 'q', 'r', 's', 't']

			for (let trial = 0; trial < 50; trial++) {
				const a = randomMultiset(rng, alphabet, 80)
				const b = randomMultiset(rng, alphabet, 80)
				const c = randomMultiset(rng, alphabet, 80)

				// Commutativity: A ∧ B = B ∧ A
				assert.deepEqual(andMultisetMemo(a, b), andMultisetMemo(b, a))

				// Associativity: (A ∧ B) ∧ C = A ∧ (B ∧ C)
				assert.deepEqual(
					andMultisetMemo(andMultisetMemo(a, b), c),
					andMultisetMemo(a, andMultisetMemo(b, c)),
				)

				// Idempotence: A ∧ A = normalize(A)
				const normA = new Map([...a].filter(([, count]) => count > 0))
				assert.deepEqual(andMultisetMemo(a, a), normA)

				// Counting-logic inclusion-exclusion: min(a, b) + max(a, b) = a + b
				const ab = andMultisetMemo(a, b)
				for (const k of alphabet) {
					const ca = a.get(k) ?? 0
					const cb = b.get(k) ?? 0
					const minVal = ab.get(k) ?? 0
					const maxVal = Math.max(ca, cb)
					assert.equal(minVal + maxVal, ca + cb)
				}
			}
		})
	})
})
