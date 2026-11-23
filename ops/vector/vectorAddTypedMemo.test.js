import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { vectorAddTypedMemo } from './vectorAddTypedMemo.js'

/**
 * Deterministic linear congruential generator for reproducible property tests.
 * @param {number} seed
 * @returns {() => number}
 */
function createPrng(seed) {
	let state = seed >>> 0
	return () => {
		state = (Math.imul(1664525, state) + 1013904223) >>> 0
		return state / 0x100000000
	}
}

describe('vectorAddTypedMemo', () => {
	test('adds normal Float64Array vectors (table-eligible ints and floats)', () => {
		const a = new Float64Array([1, -2, 64, -64, 0, 1.5, 1e10])
		const b = new Float64Array([3, 5, -64, 64, 0, -2.25, -1e10])
		const out = vectorAddTypedMemo(a, b)

		assert.ok(out instanceof Float64Array)
		assert.deepStrictEqual(out, new Float64Array([4, 3, 0, 0, 0, -0.75, 0]))
	})

	test('handles single-element and subarray views with non-zero byteOffset', () => {
		const single = vectorAddTypedMemo(new Float64Array([42]), new Float64Array([-12]))
		assert.deepStrictEqual(single, new Float64Array([30]))

		const backingA = new Float64Array([100, 1.25, 2.5, 3.75, 200])
		const backingB = new Float64Array([300, 4.75, 5.5, 6.25, 400])
		const viewA = backingA.subarray(1, 4)
		const viewB = backingB.subarray(1, 4)

		const out = vectorAddTypedMemo(viewA, viewB)
		assert.deepStrictEqual(out, new Float64Array([6, 8, 10]))
	})

	test('handles empty Float64Array inputs and returns fresh instances', () => {
		const a = new Float64Array(0)
		const b = new Float64Array(0)
		const res1 = vectorAddTypedMemo(a, b)
		const res2 = vectorAddTypedMemo(a, b)

		assert.ok(res1 instanceof Float64Array)
		assert.strictEqual(res1.length, 0)
		assert.notStrictEqual(res1, a)
		assert.notStrictEqual(res1, b)
		assert.notStrictEqual(res1, res2)
	})

	test('throws RangeError on mismatched lengths', () => {
		assert.throws(
			() => vectorAddTypedMemo(new Float64Array([1, 2]), new Float64Array([1, 2, 3])),
			RangeError,
		)
		assert.throws(
			() => vectorAddTypedMemo(new Float64Array(0), new Float64Array([1])),
			RangeError,
		)
	})

	test('throws TypeError on invalid input types and detached buffers', () => {
		const valid = new Float64Array([1, 2])
		const invalidInputs = [
			null,
			undefined,
			[1, 2],
			new Float32Array([1, 2]),
			new Int32Array([1, 2]),
			new Uint8Array([1, 2]),
			new BigInt64Array([1n, 2n]),
			'12',
			42,
			{ 0: 1, 1: 2, length: 2 },
			{ [Symbol.toStringTag]: 'Float64Array', length: 2 },
		]

		for (const bad of invalidInputs) {
			assert.throws(() => vectorAddTypedMemo(bad, valid), TypeError)
			assert.throws(() => vectorAddTypedMemo(valid, bad), TypeError)
		}

		if (typeof ArrayBuffer.prototype.transfer === 'function') {
			const bufA = new ArrayBuffer(16)
			const detachedA = new Float64Array(bufA)
			bufA.transfer()
			assert.throws(() => vectorAddTypedMemo(detachedA, valid), TypeError)
			assert.throws(() => vectorAddTypedMemo(valid, detachedA), TypeError)
		}
	})

	test('preserves IEEE 754 NaN, Infinity, signed zeros, overflow, and subnormals', () => {
		const a = new Float64Array([
			Number.NaN,
			1,
			Infinity,
			-Infinity,
			Infinity,
			-0,
			-0,
			+0,
			Number.MAX_VALUE,
			Number.MIN_VALUE,
		])
		const b = new Float64Array([
			5,
			Number.NaN,
			1,
			-1,
			-Infinity,
			-0,
			+0,
			-0,
			Number.MAX_VALUE,
			Number.MIN_VALUE,
		])

		const out1 = vectorAddTypedMemo(a, b)
		const out2 = vectorAddTypedMemo(a, b) // cache hit path

		for (const out of [out1, out2]) {
			assert.ok(Number.isNaN(out[0]))
			assert.ok(Number.isNaN(out[1]))
			assert.strictEqual(out[2], Infinity)
			assert.strictEqual(out[3], -Infinity)
			assert.ok(Number.isNaN(out[4]))
			assert.ok(Object.is(out[5], -0), '(-0) + (-0) must preserve -0')
			assert.ok(Object.is(out[6], +0), '(-0) + (+0) must yield +0')
			assert.ok(Object.is(out[7], +0), '(+0) + (-0) must yield +0')
			assert.strictEqual(out[8], Infinity)
			assert.strictEqual(out[9], Number.MIN_VALUE + Number.MIN_VALUE)
		}

		// Ensure +0 vs -0 keys do not collide in the memoization cache
		const negZeroAdd = vectorAddTypedMemo(new Float64Array([-0]), new Float64Array([-0]))
		const posZeroAdd = vectorAddTypedMemo(new Float64Array([+0]), new Float64Array([+0]))
		assert.ok(Object.is(negZeroAdd[0], -0))
		assert.ok(Object.is(posZeroAdd[0], +0))
	})

	test('enforces cache isolation, immutability, and input non-mutation', () => {
		const a = new Float64Array([10, 20, 30])
		const b = new Float64Array([1, 2, 3])
		const aSnapshot = new Float64Array(a)
		const bSnapshot = new Float64Array(b)

		const res1 = vectorAddTypedMemo(a, b)
		assert.deepStrictEqual(res1, new Float64Array([11, 22, 33]))
		assert.deepStrictEqual(a, aSnapshot)
		assert.deepStrictEqual(b, bSnapshot)

		// Mutate first result; cached value must remain untouched
		res1[0] = 99999
		res1[1] = -88888

		const res2 = vectorAddTypedMemo(a, b)
		assert.notStrictEqual(res2, res1)
		assert.deepStrictEqual(res2, new Float64Array([11, 22, 33]))

		// Commutative cache hit must also return an isolated fresh copy
		const res3 = vectorAddTypedMemo(b, a)
		assert.notStrictEqual(res3, res2)
		assert.deepStrictEqual(res3, new Float64Array([11, 22, 33]))

		// Mutating input array after caching must produce updated result, never stale cache
		a[0] = 50
		const res4 = vectorAddTypedMemo(a, b)
		assert.deepStrictEqual(res4, new Float64Array([51, 22, 33]))
	})

	test('handles vectors larger than cache length limit and cache LRU eviction', () => {
		const largeLen = 5000
		const a = new Float64Array(largeLen)
		const b = new Float64Array(largeLen)
		for (let i = 0; i < largeLen; i++) {
			a[i] = i - 2500
			b[i] = (i % 129) - 64
		}
		const out = vectorAddTypedMemo(a, b)
		assert.strictEqual(out.length, largeLen)
		for (let i = 0; i < largeLen; i++) {
			assert.strictEqual(out[i], a[i] + b[i])
		}

		// Exceed MAX_CACHE_ENTRIES (512) to exercise LRU eviction path
		for (let k = 0; k < 600; k++) {
			const v1 = new Float64Array([k, k + 1])
			const v2 = new Float64Array([10, -10])
			const sum = vectorAddTypedMemo(v1, v2)
			assert.deepStrictEqual(sum, new Float64Array([k + 10, k - 9]))
		}
		// Recompute an evicted entry and confirm accuracy
		assert.deepStrictEqual(
			vectorAddTypedMemo(new Float64Array([0, 1]), new Float64Array([10, -10])),
			new Float64Array([10, -9]),
		)
	})

	test('independent cross-check: naive Array.map, commutativity, associativity, identity & inverse', () => {
		const rand = createPrng(20261123)

		for (let trial = 0; trial < 30; trial++) {
			const len = 1 + Math.floor(rand() * 50)
			const a = new Float64Array(len)
			const b = new Float64Array(len)
			const c = new Float64Array(len)
			const zeros = new Float64Array(len)
			const negA = new Float64Array(len)

			for (let i = 0; i < len; i++) {
				// Mix small integers (table path) and fractional values (direct path)
				a[i] = i % 2 === 0 ? Math.floor(rand() * 129) - 64 : (rand() - 0.5) * 1e6
				b[i] = i % 2 === 0 ? Math.floor(rand() * 129) - 64 : (rand() - 0.5) * 1e6
				c[i] = Math.floor(rand() * 129) - 64
				negA[i] = -a[i]
			}

			const ab = vectorAddTypedMemo(a, b)
			const ba = vectorAddTypedMemo(b, a)

			// Cross-check against naive Array.prototype.map
			const expected = Array.from(a).map((v, i) => v + b[i])
			assert.deepStrictEqual(Array.from(ab), expected)

			// Commutativity: a + b === b + a
			assert.deepStrictEqual(ab, ba)

			// Additive identity: a + 0 === a
			assert.deepStrictEqual(vectorAddTypedMemo(a, zeros), a)

			// Additive inverse: a + (-a) === 0
			assert.deepStrictEqual(vectorAddTypedMemo(a, negA), zeros)

			// Exact associativity on integer vectors: (x + y) + z === x + (y + z)
			const intA = new Float64Array(Array.from({ length: len }, () => Math.floor(rand() * 200) - 100))
			const intB = new Float64Array(Array.from({ length: len }, () => Math.floor(rand() * 200) - 100))
			const leftAssoc = vectorAddTypedMemo(vectorAddTypedMemo(intA, intB), c)
			const rightAssoc = vectorAddTypedMemo(intA, vectorAddTypedMemo(intB, c))
			assert.deepStrictEqual(leftAssoc, rightAssoc)
		}
	})
})
