import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { orMask32Lazy } from './orMask32Lazy.js'

/**
 * Independent helper: decodes a sequence of uint32 words into a Set of set bit indices.
 *
 * @param {Iterable<number>} words
 * @returns {Set<number>}
 */
function wordsToBitSet(words) {
	const bits = new Set()
	let wordIndex = 0
	for (const w of words) {
		for (let b = 0; b < 32; b++) {
			if (((w >>> b) & 1) === 1) {
				bits.add(wordIndex * 32 + b)
			}
		}
		wordIndex++
	}
	return bits
}

/**
 * Independent helper: encodes a Uint32Array into a BigInt for bitwise OR cross-checking.
 *
 * @param {Uint32Array} arr
 * @returns {bigint}
 */
function uint32ArrayToBigInt(arr) {
	let result = 0n
	for (let i = arr.length - 1; i >= 0; i--) {
		result = (result << 32n) | BigInt(arr[i])
	}
	return result
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible property tests.
 *
 * @param {number} seed
 * @returns {() => number}
 */
function mulberry32(seed) {
	let s = seed >>> 0
	return () => {
		s = (s + 0x6d2b79f5) >>> 0
		let t = Math.imul(s ^ (s >>> 15), 1 | s)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0)
	}
}

describe('orMask32Lazy', () => {
	describe('normal cases', () => {
		it('computes wordwise bitwise OR over two equal-length Uint32Arrays', () => {
			const a = new Uint32Array([0b1010, 0x80000000, 0x0f0f0f0f])
			const b = new Uint32Array([0b0101, 0x00000001, 0xf0f0f0f0])

			const result = new Uint32Array(orMask32Lazy(a, b))
			assert.deepEqual(
				result,
				new Uint32Array([0b1111, 0x80000001, 0xffffffff])
			)
		})

		it('combines three or more masks in a single streaming pass', () => {
			const a = new Uint32Array([0x000000ff, 0x00000001])
			const b = new Uint32Array([0x0000ff00, 0x00000010])
			const c = new Uint32Array([0x00ff0000, 0x80000000])
			const d = new Uint32Array([0xff000000, 0x00000100])

			assert.deepEqual(
				[...orMask32Lazy(a, b, c, d)],
				[0xffffffff, 0x80000111]
			)
		})

		it('handles mixed Uint32Array, plain array, and generator inputs', () => {
			function* gen() {
				yield 0x00000001
				yield 0x80000000
			}
			const a = new Uint32Array([0x00000010, 0x00000002])
			const b = [0x00000100, 0x00000004]

			assert.deepEqual(
				[...orMask32Lazy(a, b, gen())],
				[0x00000111, 0x80000006]
			)
		})

		it('composes nested orMask32Lazy generators cleanly', () => {
			const a = new Uint32Array([0x1, 0x10])
			const b = new Uint32Array([0x2, 0x20, 0x80000000])
			const c = new Uint32Array([0x4])

			const composed = orMask32Lazy(orMask32Lazy(a, b), c)
			assert.deepEqual(
				new Uint32Array(composed),
				new Uint32Array([0x7, 0x30, 0x80000000])
			)
		})
	})

	describe('edge cases', () => {
		it('handles zero masks and single mask identity', () => {
			assert.deepEqual([...orMask32Lazy()], [])
			const single = new Uint32Array([0, 0x80000000, 0xffffffff])
			assert.deepEqual([...orMask32Lazy(single)], [0, 0x80000000, 0xffffffff])
		})

		it('handles empty masks', () => {
			assert.deepEqual(
				[...orMask32Lazy(new Uint32Array(0), new Uint32Array(0))],
				[]
			)
			assert.deepEqual(
				[...orMask32Lazy(new Uint32Array(0), new Uint32Array([42, 0x80000000]))],
				[42, 0x80000000]
			)
		})

		it('zero-extends shorter masks regardless of argument order', () => {
			const shortMask = new Uint32Array([0x0000000f])
			const longMask = new Uint32Array([0x000000f0, 0x12345678, 0x80000001])

			assert.deepEqual(
				[...orMask32Lazy(shortMask, longMask)],
				[0x000000ff, 0x12345678, 0x80000001]
			)
			assert.deepEqual(
				[...orMask32Lazy(longMask, shortMask)],
				[0x000000ff, 0x12345678, 0x80000001]
			)
		})

		it('preserves unsigned uint32 range and normalizes -0 to +0', () => {
			const result = [...orMask32Lazy([-0, 0x7fffffff, 0x80000000], [-0, 1, 0])]
			assert.equal(Object.is(result[0], 0), true)
			assert.equal(result[1], 0x7fffffff)
			assert.equal(result[2], 0x80000000)
		})

		it('consumes iterables strictly lazily and supports infinite streams', () => {
			let pulledA = 0
			let pulledB = 0
			let closedA = false

			function* infiniteA() {
				try {
					while (true) {
						yield (1 << (pulledA % 32)) >>> 0
						pulledA++
					}
				} finally {
					closedA = true
				}
			}

			function* finiteB() {
				const words = [0x80000000, 0x40000000]
				for (const w of words) {
					pulledB++
					yield w
				}
			}

			const stream = orMask32Lazy(infiniteA(), finiteB())
			// Calling orMask32Lazy must not pull any elements yet
			assert.equal(pulledA, 0)
			assert.equal(pulledB, 0)

			const taken = []
			for (const word of stream) {
				taken.push(word)
				if (taken.length === 4) {
					break
				}
			}

			assert.deepEqual(taken, [
				0x80000001,
				0x40000002,
				0x00000004,
				0x00000008,
			])
			assert.equal(pulledA, 3) // yielded 4 times, post-incremented 3 times before break
			assert.equal(pulledB, 2)
			assert.equal(closedA, true)
		})

		it('does not re-poll an already exhausted iterator', () => {
			let nextCalls = 0
			const customShort = {
				[Symbol.iterator]() {
					return {
						next() {
							nextCalls++
							if (nextCalls === 1) {
								return { value: 0x01, done: false }
							}
							if (nextCalls === 2) {
								return { value: undefined, done: true }
							}
							throw new Error('Iterator was polled after returning done: true')
						},
					}
				},
			}

			const longMask = new Uint32Array([0x10, 0x20, 0x30, 0x40])
			assert.deepEqual(
				[...orMask32Lazy(customShort, longMask)],
				[0x11, 0x20, 0x30, 0x40]
			)
			assert.equal(nextCalls, 2)
		})
	})

	describe('input validation', () => {
		it('eagerly rejects invalid top-level arguments with TypeError', () => {
			const invalidInputs = [
				null,
				undefined,
				42,
				true,
				{},
				'1234',
				new Uint8Array([1, 2]),
				new Int32Array([1, 2]),
				new Float32Array([1, 2]),
			]

			for (const bad of invalidInputs) {
				assert.throws(() => orMask32Lazy(bad), TypeError)
				assert.throws(
					() => orMask32Lazy(new Uint32Array([1]), bad),
					TypeError
				)
			}
		})

		it('rejects non-integer or out-of-range words and closes sibling iterators', () => {
			let siblingClosed = false
			function* sibling() {
				try {
					yield 1
					yield 2
					yield 3
				} finally {
					siblingClosed = true
				}
			}

			assert.throws(
				() => [...orMask32Lazy(sibling(), [0, -1])],
				RangeError
			)
			assert.equal(siblingClosed, true)

			assert.throws(() => [...orMask32Lazy([0x100000000])], RangeError)
			assert.throws(() => [...orMask32Lazy([1.5])], TypeError)
			assert.throws(() => [...orMask32Lazy([NaN])], TypeError)
			assert.throws(() => [...orMask32Lazy([Infinity])], TypeError)
			assert.throws(() => [...orMask32Lazy(['1'])], TypeError)
			assert.throws(() => [...orMask32Lazy([1n])], TypeError)
		})
	})

	describe('independent cross-checks', () => {
		it('matches set-union over bit positions and BigInt bitwise OR across random masks', () => {
			const rng = mulberry32(0xdeadbeef)

			for (let trial = 0; trial < 30; trial++) {
				const numMasks = 1 + (rng() % 4)
				const masks = []

				for (let m = 0; m < numMasks; m++) {
					const len = rng() % 8
					const arr = new Uint32Array(len)
					for (let i = 0; i < len; i++) {
						arr[i] = rng()
					}
					masks.push(arr)
				}

				const actualWords = new Uint32Array(orMask32Lazy(...masks))

				// Cross-check 1: Set union of active bit indices
				const expectedBitSet = new Set()
				for (const mask of masks) {
					for (const bit of wordsToBitSet(mask)) {
						expectedBitSet.add(bit)
					}
				}
				const actualBitSet = wordsToBitSet(actualWords)
				assert.deepEqual(actualBitSet, expectedBitSet)

				// Cross-check 2: BigInt bitwise OR
				let expectedBig = 0n
				for (const mask of masks) {
					expectedBig |= uint32ArrayToBigInt(mask)
				}
				assert.equal(uint32ArrayToBigInt(actualWords), expectedBig)
			}
		})

		it('satisfies algebraic laws of logic-set OR (commutativity, associativity, idempotence, identity)', () => {
			const a = new Uint32Array([0xa5a5a5a5, 0x80000001, 0x00ff00ff])
			const b = new Uint32Array([0x5a5a5a5a, 0x12345678])
			const c = new Uint32Array([0x0f0f0f0f, 0x00000000, 0xf0f0f0f0, 0x1])
			const zero = new Uint32Array([0, 0, 0])

			// Commutativity: a | b === b | a
			assert.deepEqual([...orMask32Lazy(a, b)], [...orMask32Lazy(b, a)])

			// Associativity: (a | b) | c === a | (b | c)
			assert.deepEqual(
				[...orMask32Lazy(orMask32Lazy(a, b), c)],
				[...orMask32Lazy(a, orMask32Lazy(b, c))]
			)

			// Idempotence: a | a === a
			assert.deepEqual([...orMask32Lazy(a, a)], [...a])

			// Identity: a | 0 === a
			assert.deepEqual([...orMask32Lazy(a, zero)], [...a])
		})
	})
})
