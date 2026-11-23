import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { intersectionMask32Recursive } from './intersectionMask32Recursive.js'

/**
 * Independent Set-based reference: converts a Uint32Array bitmask to a JS Set
 * of bit indices.
 */
function maskToBitSet(mask) {
	const bits = new Set()
	for (let w = 0; w < mask.length; w++) {
		const word = mask[w]
		for (let b = 0; b < 32; b++) {
			if ((word >>> b) & 1) {
				bits.add(w * 32 + b)
			}
		}
	}
	return bits
}

/**
 * Independent Set-based reference: builds a Uint32Array bitmask of given word
 * length from a JS Set of bit indices.
 */
function bitSetToMask(bits, wordCount) {
	const out = new Uint32Array(wordCount)
	for (const idx of bits) {
		const w = idx >>> 5
		if (w < wordCount) {
			out[w] = (out[w] | (1 << (idx & 31))) >>> 0
		}
	}
	return out
}

/**
 * Independent Set-based intersection oracle.
 */
function referenceSetIntersection(a, b) {
	const setA = maskToBitSet(a)
	const setB = maskToBitSet(b)
	const common = new Set()
	for (const x of setA) {
		if (setB.has(x)) {
			common.add(x)
		}
	}
	return bitSetToMask(common, Math.min(a.length, b.length))
}

/**
 * Deterministic PRNG (xorshift32) for reproducible property cross-checks.
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

describe('intersectionMask32Recursive', () => {
	test('computes single-word bitmask intersection', () => {
		const a = new Uint32Array([0b11010110])
		const b = new Uint32Array([0b10110011])
		const result = intersectionMask32Recursive(a, b)
		assert.ok(result instanceof Uint32Array)
		assert.deepEqual(result, new Uint32Array([0b10010010]))
	})

	test('computes multi-word intersections for even and odd word counts', () => {
		const aEven = new Uint32Array([0xf0f0f0f0, 0x12345678, 0xaaaaaaaa, 0x00ff00ff])
		const bEven = new Uint32Array([0x0ff00ff0, 0x87654321, 0x55555555, 0x0f0f0f0f])
		assert.deepEqual(
			intersectionMask32Recursive(aEven, bEven),
			new Uint32Array([0x00f000f0, 0x02244220, 0x00000000, 0x000f000f]),
		)

		const aOdd = new Uint32Array([0xffffffff, 0x80000001, 0x7fffffff])
		const bOdd = new Uint32Array([0x80000000, 0x80000001, 0x80000000])
		assert.deepEqual(
			intersectionMask32Recursive(aOdd, bOdd),
			new Uint32Array([0x80000000, 0x80000001, 0x00000000]),
		)
	})

	test('preserves unsigned 32-bit high-bit values without sign issues', () => {
		const a = new Uint32Array([0xffffffff, 0x80000000, 0xdeadbeef])
		const b = new Uint32Array([0xffffffff, 0xffffffff, 0xcafebabe])
		const result = intersectionMask32Recursive(a, b)
		assert.equal(result[0], 0xffffffff)
		assert.equal(result[1], 0x80000000)
		assert.equal(result[2], (0xdeadbeef & 0xcafebabe) >>> 0)
	})

	test('handles empty masks and mismatched mask lengths', () => {
		assert.deepEqual(
			intersectionMask32Recursive(new Uint32Array(0), new Uint32Array(0)),
			new Uint32Array(0),
		)
		assert.deepEqual(
			intersectionMask32Recursive(new Uint32Array([0xffffffff]), new Uint32Array(0)),
			new Uint32Array(0),
		)
		assert.deepEqual(
			intersectionMask32Recursive(new Uint32Array(0), new Uint32Array([0xffffffff])),
			new Uint32Array(0),
		)
		assert.deepEqual(
			intersectionMask32Recursive(
				new Uint32Array([0xff00ff00, 0x0f0f0f0f, 0xffffffff]),
				new Uint32Array([0x00ffff00]),
			),
			new Uint32Array([0x0000ff00]),
		)
		assert.deepEqual(
			intersectionMask32Recursive(
				new Uint32Array([0x00ffff00]),
				new Uint32Array([0xff00ff00, 0x0f0f0f0f, 0xffffffff]),
			),
			new Uint32Array([0x0000ff00]),
		)
	})

	test('does not mutate inputs and safely handles aliased or overlapping views', () => {
		const buf = new ArrayBuffer(20)
		const full = new Uint32Array(buf)
		full.set([0xf0f0f0f0, 0x0f0f0f0f, 0xffff0000, 0x0000ffff, 0xaaaaaaaa])

		const viewA = full.subarray(0, 4)
		const viewB = full.subarray(1, 5)
		const snapA = Uint32Array.from(viewA)
		const snapB = Uint32Array.from(viewB)

		const res = intersectionMask32Recursive(viewA, viewB)
		assert.notEqual(res, viewA)
		assert.notEqual(res, viewB)
		assert.deepEqual(viewA, snapA)
		assert.deepEqual(viewB, snapB)
		assert.deepEqual(
			res,
			new Uint32Array([0x00000000, 0x0f0f0000, 0x00000000, 0x0000aaaa]),
		)

		const selfRes = intersectionMask32Recursive(viewA, viewA)
		assert.notEqual(selfRes, viewA)
		assert.deepEqual(selfRes, snapA)
	})

	test('handles large bitmasks without exceeding recursion depth', () => {
		const n = 65536
		const a = new Uint32Array(n)
		const b = new Uint32Array(n)
		const expected = new Uint32Array(n)
		for (let i = 0; i < n; i++) {
			a[i] = (i * 2654435761) >>> 0
			b[i] = ((i ^ 0x5a5a5a5a) * 2246822519) >>> 0
			expected[i] = (a[i] & b[i]) >>> 0
		}
		const result = intersectionMask32Recursive(a, b)
		assert.deepEqual(result, expected)
	})

	test('cross-checks against independent Set-based oracle and set-algebra laws', () => {
		const rng = makeRng(0x13579bdf)
		const lengths = [0, 1, 2, 3, 4, 5, 7, 8, 15, 16, 31, 33, 64]

		for (const lenA of lengths) {
			const lenB = lengths[(lenA * 7 + 3) % lengths.length]
			const a = new Uint32Array(lenA)
			const b = new Uint32Array(lenB)
			const c = new Uint32Array(lenA)
			for (let i = 0; i < lenA; i++) {
				a[i] = rng()
				c[i] = rng()
			}
			for (let i = 0; i < lenB; i++) {
				b[i] = rng()
			}

			const actual = intersectionMask32Recursive(a, b)
			const expected = referenceSetIntersection(a, b)
			assert.deepEqual(actual, expected)

			// Commutativity: A ∩ B === B ∩ A
			assert.deepEqual(actual, intersectionMask32Recursive(b, a))

			// Idempotence: A ∩ A === A
			assert.deepEqual(intersectionMask32Recursive(a, a), a)

			// Associativity: (A ∩ B) ∩ C === A ∩ (B ∩ C)
			const leftAssoc = intersectionMask32Recursive(actual, c)
			const rightAssoc = intersectionMask32Recursive(
				a,
				intersectionMask32Recursive(b, c),
			)
			assert.deepEqual(leftAssoc, rightAssoc)

			// Identity (all-ones) and annihilator (all-zeros)
			const ones = new Uint32Array(lenA).fill(0xffffffff)
			const zeros = new Uint32Array(lenA)
			assert.deepEqual(intersectionMask32Recursive(a, ones), a)
			assert.deepEqual(intersectionMask32Recursive(a, zeros), zeros)
		}
	})

	test('throws TypeError on invalid inputs', () => {
		const valid = new Uint32Array([1, 2, 3])
		const invalidValues = [
			null,
			undefined,
			42,
			'0xffffffff',
			{},
			[1, 2, 3],
			new ArrayBuffer(12),
			new Int32Array([1, 2, 3]),
			new Uint8Array([1, 2, 3]),
			new Uint16Array([1, 2, 3]),
			new Float32Array([1, 2, 3]),
			new BigUint64Array([1n, 2n]),
		]

		for (const bad of invalidValues) {
			assert.throws(
				() => intersectionMask32Recursive(bad, valid),
				{ name: 'TypeError' },
			)
			assert.throws(
				() => intersectionMask32Recursive(valid, bad),
				{ name: 'TypeError' },
			)
		}

		assert.throws(() => intersectionMask32Recursive(), { name: 'TypeError' })
		assert.throws(() => intersectionMask32Recursive(valid), { name: 'TypeError' })
	})
})
