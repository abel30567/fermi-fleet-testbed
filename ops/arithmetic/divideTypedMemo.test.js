import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { divideTypedMemo } from './divideTypedMemo.js'

/**
 * Independent reference implementation of element-wise Float64Array division
 * with no caching or lookup tables, used for cross-checking.
 *
 * @param {Float64Array} a
 * @param {Float64Array} b
 * @returns {Float64Array}
 */
function referenceDivide(a, b) {
	const out = new Float64Array(a.length)
	for (let i = 0; i < a.length; i++) {
		out[i] = a[i] / b[i]
	}
	return out
}

describe('divideTypedMemo', () => {
	beforeEach(() => {
		divideTypedMemo.clearCache()
	})

	describe('normal cases', () => {
		it('divides positive, negative, and fractional Float64Array elements', () => {
			const a = new Float64Array([10, -20, 7.5, -9.25, 1])
			const b = new Float64Array([2, 4, -2.5, -0.5, 3])
			const result = divideTypedMemo(a, b)

			assert.ok(result instanceof Float64Array)
			assert.equal(result.length, a.length)
			assert.deepEqual(result, new Float64Array([5, -5, -3, 18.5, 1 / 3]))
		})

		it('does not mutate input arrays and handles identical array reference', () => {
			const a = new Float64Array([3.5, -7.25, 42, 0.125])
			const snapshot = new Float64Array(a)

			const result = divideTypedMemo(a, a)
			assert.deepEqual(a, snapshot)
			assert.deepEqual(result, new Float64Array([1, 1, 1, 1]))
		})

		it('supports subarray views with non-zero byteOffset', () => {
			const backingA = new Float64Array([999, 12, 30, -45, 999])
			const backingB = new Float64Array([888, 3, -5, -9, 888])
			const viewA = backingA.subarray(1, 4)
			const viewB = backingB.subarray(1, 4)

			assert.equal(viewA.byteOffset, 8)
			assert.equal(viewB.byteOffset, 8)

			const result = divideTypedMemo(viewA, viewB)
			assert.deepEqual(result, new Float64Array([4, -6, 5]))
		})
	})

	describe('edge cases', () => {
		it('handles empty Float64Arrays', () => {
			const result = divideTypedMemo(new Float64Array(0), new Float64Array(0))
			assert.ok(result instanceof Float64Array)
			assert.equal(result.length, 0)
		})

		it('preserves IEEE-754 signed zeros (+0 and -0) without cache collisions', () => {
			const posZero = new Float64Array([0, 0])
			const negZero = new Float64Array([-0, -0])
			const divisors = new Float64Array([5, -5])

			const resPos = divideTypedMemo(posZero, divisors)
			const resNeg = divideTypedMemo(negZero, divisors)

			assert.equal(Object.is(resPos[0], 0), true)
			assert.equal(Object.is(resPos[1], -0), true)
			assert.equal(Object.is(resNeg[0], -0), true)
			assert.equal(Object.is(resNeg[1], 0), true)

			// Re-run to verify array cache keeps +0 and -0 distinct.
			const resPosCached = divideTypedMemo(posZero, divisors)
			const resNegCached = divideTypedMemo(negZero, divisors)
			assert.equal(Object.is(resPosCached[0], 0), true)
			assert.equal(Object.is(resPosCached[1], -0), true)
			assert.equal(Object.is(resNegCached[0], -0), true)
			assert.equal(Object.is(resNegCached[1], 0), true)
		})

		it('handles extreme magnitudes, subnormals, overflow, and underflow', () => {
			const a = new Float64Array([
				Number.MAX_VALUE,
				Number.MIN_VALUE,
				Number.MIN_VALUE,
				Number.MAX_SAFE_INTEGER,
			])
			const b = new Float64Array([
				0.5,
				Number.MIN_VALUE,
				2,
				Number.MAX_SAFE_INTEGER,
			])
			const result = divideTypedMemo(a, b)

			assert.equal(result[0], Number.POSITIVE_INFINITY)
			assert.equal(result[1], 1)
			assert.equal(result[2], 0)
			assert.equal(result[3], 1)
		})

		it('handles table boundary integers (-64, 64, -65, 65)', () => {
			const a = new Float64Array([-64, 64, -65, 65])
			const b = new Float64Array([64, -64, 65, -65])
			const result = divideTypedMemo(a, b)

			assert.deepEqual(result, new Float64Array([-1, -1, -1, -1]))
			const s = divideTypedMemo.getStats()
			assert.equal(s.tableHits, 2)
			assert.equal(s.misses, 2)
		})

		it('handles arrays larger than maxArrayCacheLength', () => {
			const len = 1500
			const a = new Float64Array(len)
			const b = new Float64Array(len)
			for (let i = 0; i < len; i++) {
				a[i] = (i % 20) + 100.5
				b[i] = (i % 10) + 0.5
			}
			const result = divideTypedMemo(a, b)
			assert.deepEqual(result, referenceDivide(a, b))

			const s = divideTypedMemo.getStats()
			assert.equal(s.arrayCacheSize, 0)
			assert.ok(s.pairCacheHits > 0)
		})
	})

	describe('invalid inputs', () => {
		it('throws TypeError when either argument is not a Float64Array', () => {
			const valid = new Float64Array([1, 2])
			const invalidValues = [
				undefined,
				null,
				[1, 2],
				new Float32Array([1, 2]),
				new Int32Array([1, 2]),
				'1,2',
				42,
				{},
			]

			for (const bad of invalidValues) {
				assert.throws(() => divideTypedMemo(bad, valid), TypeError)
				assert.throws(() => divideTypedMemo(valid, bad), TypeError)
			}
		})

		it('throws RangeError on mismatched Float64Array lengths', () => {
			assert.throws(
				() => divideTypedMemo(new Float64Array([1, 2]), new Float64Array([1])),
				RangeError,
			)
			assert.throws(
				() => divideTypedMemo(new Float64Array(0), new Float64Array([1])),
				RangeError,
			)
		})

		it('throws RangeError on division by +0 or -0', () => {
			assert.throws(
				() =>
					divideTypedMemo(new Float64Array([1, 2]), new Float64Array([1, 0])),
				/Division by zero at index 1/,
			)
			assert.throws(
				() =>
					divideTypedMemo(new Float64Array([1, 2]), new Float64Array([-0, 1])),
				/Division by zero at index 0/,
			)
		})

		it('throws RangeError on non-finite values (NaN, Infinity, -Infinity)', () => {
			const nonFinites = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]
			for (const bad of nonFinites) {
				assert.throws(
					() => divideTypedMemo(new Float64Array([bad]), new Float64Array([1])),
					RangeError,
				)
				assert.throws(
					() => divideTypedMemo(new Float64Array([1]), new Float64Array([bad])),
					RangeError,
				)
			}
		})
	})

	describe('table-driven and memoization behavior', () => {
		it('serves small-integer pairs from the precomputed table with zero misses', () => {
			const a = new Float64Array([-64, -10, 0, 15, 64])
			const b = new Float64Array([8, -5, 3, -4, 16])

			const result = divideTypedMemo(a, b)
			assert.deepEqual(result, new Float64Array([-8, 2, 0, -3.75, 4]))

			const s = divideTypedMemo.getStats()
			assert.equal(s.tableHits, 5)
			assert.equal(s.misses, 0)
			assert.equal(s.pairCacheSize, 0)
		})

		it('memoizes non-table scalar pairs across distinct array shapes', () => {
			const r1 = divideTypedMemo(
				new Float64Array([100.25, 200.5, 100.25]),
				new Float64Array([3.75, 7.25, 3.75]),
			)
			const s1 = divideTypedMemo.getStats()
			assert.equal(s1.misses, 2)
			assert.equal(s1.pairCacheHits, 1)
			assert.equal(s1.pairCacheSize, 2)

			// Different array containing previously memoized pairs hits pairCache.
			const r2 = divideTypedMemo(
				new Float64Array([200.5, 100.25]),
				new Float64Array([7.25, 3.75]),
			)
			const s2 = divideTypedMemo.getStats()
			assert.equal(s2.misses, 2)
			assert.equal(s2.pairCacheHits, 3)
			assert.equal(r2[0], r1[1])
			assert.equal(r2[1], r1[0])
		})

		it('memoizes whole arrays and protects cached values from caller mutation', () => {
			const a = new Float64Array([123.456, 789.012])
			const b = new Float64Array([0.123, 4.567])

			const first = divideTypedMemo(a, b)
			const expected = new Float64Array(first)

			// Mutate returned array and verify cache is uncorrupted.
			first[0] = -999999
			first[1] = -888888

			const second = divideTypedMemo(a, b)
			assert.notEqual(second, first)
			assert.deepEqual(second, expected)
			assert.equal(divideTypedMemo.getStats().arrayCacheHits, 1)
		})

		it('enforces bounded cache capacity via LRU eviction', () => {
			const { maxArrayCacheSize, maxPairCacheSize } = divideTypedMemo.getStats()

			for (let i = 1; i <= maxArrayCacheSize + 20; i++) {
				divideTypedMemo(new Float64Array([1000 + i]), new Float64Array([3.5]))
			}
			assert.equal(divideTypedMemo.getStats().arrayCacheSize, maxArrayCacheSize)

			divideTypedMemo.clearCache()
			const batchSize = 512
			for (let offset = 0; offset < maxPairCacheSize + 512; offset += batchSize) {
				const a = new Float64Array(batchSize)
				const b = new Float64Array(batchSize)
				for (let j = 0; j < batchSize; j++) {
					a[j] = 10000 + offset + j + 0.125
					b[j] = 7.3
				}
				divideTypedMemo(a, b)
			}
			assert.equal(divideTypedMemo.getStats().pairCacheSize, maxPairCacheSize)
		})
	})

	describe('independent cross-checks', () => {
		it('matches direct Float64 division bit-for-bit across deterministic pseudo-random inputs and verifies multiplication inverse', () => {
			// Deterministic LCG for reproducible testing with zero dependencies.
			let seed = 0x12345678
			const nextFloat = () => {
				seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
				return (seed / 0x100000000) * 200 - 100
			}

			const n = 500
			const a = new Float64Array(n)
			const b = new Float64Array(n)
			for (let i = 0; i < n; i++) {
				// Mix small integers (table path), repeated floats (pair cache), and arbitrary floats.
				if (i % 5 === 0) {
					a[i] = Math.trunc(nextFloat() * 0.6)
					const d = Math.trunc(nextFloat() * 0.6)
					b[i] = d === 0 ? 1 : d
				} else if (i % 7 === 0) {
					a[i] = 314.159265
					b[i] = 2.718281828
				} else {
					a[i] = nextFloat()
					const d = nextFloat()
					b[i] = Math.abs(d) < 1e-6 ? 1.5 : d
				}
			}

			const actual = divideTypedMemo(a, b)
			const expected = referenceDivide(a, b)

			// 1. Bit-exact cross-check against independent direct division.
			const actualBits = new BigUint64Array(actual.buffer)
			const expectedBits = new BigUint64Array(expected.buffer)
			assert.deepEqual(actualBits, expectedBits)

			// 2. Algebraic inverse cross-check: (a / b) * b ≈ a within floating-point tolerance.
			for (let i = 0; i < n; i++) {
				const reconstructed = actual[i] * b[i]
				const tol = Math.max(1e-12, Math.abs(a[i]) * 1e-12)
				assert.ok(
					Math.abs(reconstructed - a[i]) <= tol,
					`Inverse check failed at ${i}: (${actual[i]} * ${b[i]}) = ${reconstructed}, expected ${a[i]}`,
				)
			}

			// 3. Re-running returns identical bits via array cache.
			const cached = divideTypedMemo(a, b)
			assert.deepEqual(new BigUint64Array(cached.buffer), expectedBits)
			assert.equal(divideTypedMemo.getStats().arrayCacheHits, 1)
		})
	})
})
