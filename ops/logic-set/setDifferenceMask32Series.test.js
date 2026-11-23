import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { setDifferenceMask32Series } from './setDifferenceMask32Series.js'

/**
 * Independent reference 1: explicit per-bit indicator series sum_{k=0}^{31} a_k * (1 - b_k) * 2^k.
 */
function referenceBitSeries(a, b) {
	const out = new Uint32Array(a.length)
	for (let i = 0; i < a.length; i++) {
		let sum = 0
		for (let k = 0; k < 32; k++) {
			const ak = (a[i] >>> k) & 1
			const bk = (b[i] >>> k) & 1
			if (ak === 1 && bk === 0) {
				sum += 2 ** k
			}
		}
		out[i] = sum >>> 0
	}
	return out
}

/**
 * Independent reference 2: direct bitwise AND-NOT (A & ~B).
 */
function referenceAndNot(a, b) {
	const out = new Uint32Array(a.length)
	for (let i = 0; i < a.length; i++) {
		out[i] = (a[i] & ~b[i]) >>> 0
	}
	return out
}

/**
 * Independent reference 3: union-XOR identity ((A | B) ^ B).
 */
function referenceUnionXor(a, b) {
	const out = new Uint32Array(a.length)
	for (let i = 0; i < a.length; i++) {
		out[i] = ((a[i] | b[i]) ^ b[i]) >>> 0
	}
	return out
}

/**
 * Deterministic xorshift32 PRNG for reproducible fuzz/cross-check tests.
 */
function makeRng(seed) {
	let state = seed >>> 0
	return () => {
		state ^= state << 13
		state ^= state >>> 17
		state ^= state << 5
		return state >>> 0
	}
}

describe('setDifferenceMask32Series', () => {
	it('computes set difference on typical single-word and multi-word masks', () => {
		const a = new Uint32Array([0b11001010, 0xf0f0f0f0, 0x12345678])
		const b = new Uint32Array([0b10101100, 0x0f0ff000, 0x00ff00ff])
		const result = setDifferenceMask32Series(a, b)

		assert.ok(result instanceof Uint32Array)
		assert.deepEqual(
			result,
			new Uint32Array([0b01000010, 0xf0f000f0, 0x12005600])
		)
	})

	it('handles empty Uint32Array inputs', () => {
		const a = new Uint32Array(0)
		const b = new Uint32Array(0)
		const result = setDifferenceMask32Series(a, b)

		assert.ok(result instanceof Uint32Array)
		assert.equal(result.length, 0)
		assert.notEqual(result, a)
		assert.notEqual(result, b)
	})

	it('handles boundary 32-bit unsigned values including MSB (bit 31)', () => {
		const a = new Uint32Array([
			0x00000000,
			0xffffffff,
			0xffffffff,
			0x80000000,
			0x80000000,
			0x80000001,
			0x7fffffff,
		])
		const b = new Uint32Array([
			0xffffffff,
			0x00000000,
			0xffffffff,
			0x80000000,
			0x00000001,
			0x80000000,
			0x80000000,
		])

		const result = setDifferenceMask32Series(a, b)
		assert.deepEqual(
			result,
			new Uint32Array([
				0x00000000,
				0xffffffff,
				0x00000000,
				0x00000000,
				0x80000000,
				0x00000001,
				0x7fffffff,
			])
		)
	})

	it('handles identical references (A \\ A = empty) without mutating input', () => {
		const a = new Uint32Array([0xdeadbeef, 0x80000001, 0xffffffff])
		const snapshot = new Uint32Array(a)

		const result = setDifferenceMask32Series(a, a)
		assert.deepEqual(result, new Uint32Array([0, 0, 0]))
		assert.deepEqual(a, snapshot)
		assert.notEqual(result, a)
	})

	it('does not mutate inputs and supports subarray views with non-zero byteOffset', () => {
		const backingA = new Uint32Array([0xffffffff, 0xaaaaaaaa, 0x55555555, 0x00000000])
		const backingB = new Uint32Array([0x00000000, 0x0f0f0f0f, 0xf0f0f0f0, 0xffffffff])
		const subA = backingA.subarray(1, 3)
		const subB = backingB.subarray(1, 3)

		const snapA = new Uint32Array(backingA)
		const snapB = new Uint32Array(backingB)

		const result = setDifferenceMask32Series(subA, subB)
		assert.deepEqual(result, new Uint32Array([0xa0a0a0a0, 0x05050505]))
		assert.deepEqual(backingA, snapA)
		assert.deepEqual(backingB, snapB)
	})

	it('cross-checks against independent bit-series, AND-NOT, and union-XOR references', () => {
		const nextU32 = makeRng(0x9e3779b9)
		for (const wordCount of [1, 2, 7, 32, 128]) {
			const a = new Uint32Array(wordCount)
			const b = new Uint32Array(wordCount)
			for (let i = 0; i < wordCount; i++) {
				a[i] = nextU32()
				b[i] = nextU32()
			}

			const actual = setDifferenceMask32Series(a, b)
			assert.deepEqual(actual, referenceBitSeries(a, b))
			assert.deepEqual(actual, referenceAndNot(a, b))
			assert.deepEqual(actual, referenceUnionXor(a, b))
		}
	})

	it('satisfies Boolean set-algebra laws on random masks', () => {
		const nextU32 = makeRng(0x13579bdf)
		const len = 16
		const a = new Uint32Array(len)
		const b = new Uint32Array(len)
		const c = new Uint32Array(len)
		const empty = new Uint32Array(len)
		const universe = new Uint32Array(len).fill(0xffffffff)

		for (let i = 0; i < len; i++) {
			a[i] = nextU32()
			b[i] = nextU32()
			c[i] = nextU32()
		}

		const diffAB = setDifferenceMask32Series(a, b)

		// Identity laws: A \ ∅ = A, ∅ \ B = ∅, A \ U = ∅
		assert.deepEqual(setDifferenceMask32Series(a, empty), a)
		assert.deepEqual(setDifferenceMask32Series(empty, b), empty)
		assert.deepEqual(setDifferenceMask32Series(a, universe), empty)

		// Right-idempotence: (A \ B) \ B = A \ B
		assert.deepEqual(setDifferenceMask32Series(diffAB, b), diffAB)

		// Partition & disjointness: (A \ B) ∩ B = ∅ and (A \ B) ∪ (A ∩ B) = A
		for (let i = 0; i < len; i++) {
			assert.equal((diffAB[i] & b[i]) >>> 0, 0)
			assert.equal((diffAB[i] | (a[i] & b[i])) >>> 0, a[i])
		}

		// Right-union law: A \ (B ∪ C) = (A \ B) \ C
		const bUnionC = new Uint32Array(len)
		for (let i = 0; i < len; i++) {
			bUnionC[i] = (b[i] | c[i]) >>> 0
		}
		assert.deepEqual(
			setDifferenceMask32Series(a, bUnionC),
			setDifferenceMask32Series(diffAB, c)
		)
	})

	it('rejects non-Uint32Array inputs with TypeError', () => {
		const valid = new Uint32Array([1, 2])
		const invalidValues = [
			null,
			undefined,
			[1, 2],
			new Int32Array([1, 2]),
			new Uint8Array([1, 2]),
			new Uint16Array([1, 2]),
			new BigUint64Array([1n, 2n]),
			new ArrayBuffer(8),
			{ length: 2, 0: 1, 1: 2 },
			42,
			'12',
		]

		for (const bad of invalidValues) {
			assert.throws(
				() => setDifferenceMask32Series(bad, valid),
				{ name: 'TypeError' }
			)
			assert.throws(
				() => setDifferenceMask32Series(valid, bad),
				{ name: 'TypeError' }
			)
		}
	})

	it('rejects mismatched Uint32Array lengths with RangeError', () => {
		assert.throws(
			() => setDifferenceMask32Series(new Uint32Array([1, 2]), new Uint32Array([1])),
			{ name: 'RangeError' }
		)
		assert.throws(
			() => setDifferenceMask32Series(new Uint32Array(0), new Uint32Array(1)),
			{ name: 'RangeError' }
		)
		assert.throws(
			() => setDifferenceMask32Series(new Uint32Array(3), new Uint32Array(5)),
			{ name: 'RangeError' }
		)
	})
})
