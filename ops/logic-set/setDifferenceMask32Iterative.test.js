import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setDifferenceMask32Iterative } from './setDifferenceMask32Iterative.js'

/**
 * Independent reference helper: decodes a Uint32Array bitmask into a JS Set of bit indices.
 *
 * @param {Uint32Array} mask
 * @returns {Set<number>}
 */
function maskToSet(mask) {
	const bits = new Set()
	for (let w = 0; w < mask.length; w += 1) {
		const word = mask[w]
		for (let b = 0; b < 32; b += 1) {
			if ((word & (1 << b)) !== 0) {
				bits.add(w * 32 + b)
			}
		}
	}
	return bits
}

/**
 * Independent reference helper: encodes a JS Set of bit indices into a Uint32Array bitmask.
 *
 * @param {Set<number>} bits
 * @param {number} wordCount
 * @returns {Uint32Array}
 */
function setToMask(bits, wordCount) {
	const mask = new Uint32Array(wordCount)
	for (const index of bits) {
		const w = Math.floor(index / 32)
		const b = index % 32
		mask[w] = (mask[w] | (1 << b)) >>> 0
	}
	return mask
}

/**
 * Deterministic PRNG (xorshift32) for reproducible cross-check inputs.
 *
 * @param {number} seed
 * @returns {() => number}
 */
function makePrng(seed) {
	let state = seed >>> 0
	return () => {
		state ^= state << 13
		state ^= state >>> 17
		state ^= state << 5
		return state >>> 0
	}
}

test('normal cases: single-word and multi-word partial overlap', () => {
	const a = new Uint32Array([0b11110000, 0xdeadbeef, 0x0f0f0f0f])
	const b = new Uint32Array([0b10101010, 0x00ff00ff, 0x0000ffff])

	const diff = setDifferenceMask32Iterative(a, b)

	assert.ok(diff instanceof Uint32Array)
	assert.deepEqual(
		diff,
		new Uint32Array([0b01010000, 0xde00be00, 0x0f0f0000]),
	)
})

test('high-bit and unsigned 32-bit boundary values', () => {
	const a = new Uint32Array([0xffffffff, 0x80000000, 0x80000001, 0x7fffffff])
	const b = new Uint32Array([0x7fffffff, 0x00000000, 0x80000000, 0xffffffff])

	const diff = setDifferenceMask32Iterative(a, b)

	assert.deepEqual(
		diff,
		new Uint32Array([0x80000000, 0x80000000, 0x00000001, 0x00000000]),
	)
})

test('edge cases: empty arrays, disjoint sets, subsets, identical sets, and zero masks', () => {
	// Empty Uint32Array
	const emptyResult = setDifferenceMask32Iterative(
		new Uint32Array(0),
		new Uint32Array(0),
	)
	assert.ok(emptyResult instanceof Uint32Array)
	assert.equal(emptyResult.length, 0)

	// Disjoint sets: A \ B === A
	const disjointA = new Uint32Array([0xaaaaaaaa, 0x00ff00ff])
	const disjointB = new Uint32Array([0x55555555, 0xff00ff00])
	assert.deepEqual(setDifferenceMask32Iterative(disjointA, disjointB), disjointA)

	// Identical sets (distinct instances and same reference): A \ A === 0
	const same = new Uint32Array([0x12345678, 0xfedcba98])
	assert.deepEqual(
		setDifferenceMask32Iterative(same, new Uint32Array(same)),
		new Uint32Array([0, 0]),
	)
	assert.deepEqual(
		setDifferenceMask32Iterative(same, same),
		new Uint32Array([0, 0]),
	)

	// Subset: A ⊆ B => A \ B === 0
	const subA = new Uint32Array([0x000f000f, 0x00000001])
	const supB = new Uint32Array([0x00ff00ff, 0xffffffff])
	assert.deepEqual(setDifferenceMask32Iterative(subA, supB), new Uint32Array([0, 0]))

	// Empty minuend or empty subtrahend
	const zeros = new Uint32Array([0, 0])
	assert.deepEqual(setDifferenceMask32Iterative(zeros, supB), zeros)
	assert.deepEqual(setDifferenceMask32Iterative(supB, zeros), supB)
})

test('immutability and subarray views with non-zero byteOffset', () => {
	const backingA = new Uint32Array([0xffffffff, 0xf0f0f0f0, 0x12345678, 0xffffffff])
	const backingB = new Uint32Array([0x00000000, 0x0f0f0f0f, 0x12005600, 0x00000000])
	const viewA = backingA.subarray(1, 3)
	const viewB = backingB.subarray(1, 3)
	const snapshotA = new Uint32Array(backingA)
	const snapshotB = new Uint32Array(backingB)

	const diff = setDifferenceMask32Iterative(viewA, viewB)

	assert.notEqual(diff, viewA)
	assert.notEqual(diff, viewB)
	assert.deepEqual(diff, new Uint32Array([0xf0f0f0f0, 0x00340078]))
	assert.deepEqual(backingA, snapshotA)
	assert.deepEqual(backingB, snapshotB)
})

test('invalid inputs throw TypeError or RangeError', () => {
	const valid = new Uint32Array([1, 2])
	const badInputs = [
		null,
		undefined,
		[1, 2],
		new Int32Array([1, 2]),
		new Uint8Array([1, 2]),
		new Uint16Array([1, 2]),
		new BigUint64Array([1n, 2n]),
		new Set([1, 2]),
		42,
		'12',
		{},
	]

	for (const bad of badInputs) {
		assert.throws(() => setDifferenceMask32Iterative(bad, valid), TypeError)
		assert.throws(() => setDifferenceMask32Iterative(valid, bad), TypeError)
	}

	assert.throws(
		() => setDifferenceMask32Iterative(new Uint32Array(2), new Uint32Array(3)),
		RangeError,
	)
	assert.throws(
		() => setDifferenceMask32Iterative(new Uint32Array(1), new Uint32Array(0)),
		RangeError,
	)
})

test('independent cross-check against Set-based reference and set-algebraic laws', () => {
	const nextUint32 = makePrng(0x20261123)
	const lengths = [0, 1, 2, 5, 16]

	for (const len of lengths) {
		for (let trial = 0; trial < 10; trial += 1) {
			const a = new Uint32Array(len)
			const b = new Uint32Array(len)
			const c = new Uint32Array(len)
			for (let i = 0; i < len; i += 1) {
				a[i] = nextUint32()
				b[i] = nextUint32()
				c[i] = nextUint32()
			}

			const actual = setDifferenceMask32Iterative(a, b)

			// Cross-check against explicit Set<number> of bit indices
			const setA = maskToSet(a)
			const setB = maskToSet(b)
			const expectedSet = new Set([...setA].filter((bit) => !setB.has(bit)))
			const expected = setToMask(expectedSet, len)
			assert.deepEqual(actual, expected)

			// Algebraic identities:
			// 1. (A \ B) ∩ B = ∅
			// 2. (A \ B) ∪ (A ∩ B) = A
			// 3. (A \ B) \ C = A \ (B ∪ C)
			const bUnionC = new Uint32Array(len)
			for (let i = 0; i < len; i += 1) {
				assert.equal((actual[i] & b[i]) >>> 0, 0)
				assert.equal((actual[i] | (a[i] & b[i])) >>> 0, a[i])
				bUnionC[i] = (b[i] | c[i]) >>> 0
			}
			assert.deepEqual(
				setDifferenceMask32Iterative(actual, c),
				setDifferenceMask32Iterative(a, bUnionC),
			)
		}
	}
})
