import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { andMask32Lazy } from './andMask32Lazy.js'

describe('andMask32Lazy', () => {
	it('computes unsigned 32-bit bitwise AND over Uint32Array bitmasks', () => {
		const a = new Uint32Array([0xf0f0f0f0, 0x80000001, 0xffffffff, 0x12345678])
		const b = new Uint32Array([0x0ff00ff0, 0x80000003, 0xaaaaaaaa, 0x0f0f0f0f])

		const result = Uint32Array.from(andMask32Lazy(a, b))
		assert.deepEqual(
			result,
			new Uint32Array([0x00f000f0, 0x80000001, 0xaaaaaaaa, 0x02040608])
		)

		// Verify high-bit words are yielded as unsigned positive integers, not negative signed ints
		const words = [...andMask32Lazy(a, b)]
		assert.equal(words[1], 0x80000001)
		assert.ok(words.every((w) => w >= 0 && w <= 0xffffffff))
	})

	it('supports 3 or more bitmask sequences and mixed iterable types', () => {
		const a = new Uint32Array([0xffffffff, 0xdeadbeef, 0x0f0f0f0f])
		const b = [0xf0f0f0f0, 0x00ff00ff, 0x00ff00ff]
		function* genC() {
			yield 0x0ff00ff0
			yield 0x00ab00ef
			yield 0x000f000f
		}

		const result = [...andMask32Lazy(a, b, genC())]
		assert.deepEqual(result, [0x00f000f0, 0x00a900ef, 0x000f000f])
	})

	it('supports chaining lazy generator outputs directly as inputs', () => {
		const a = new Uint32Array([0xff00ff00, 0x12345678])
		const b = new Uint32Array([0x0ff00ff0, 0xfedcba98])
		const c = new Uint32Array([0x0f000f00, 0x00ffff00])

		const chained = [...andMask32Lazy(andMask32Lazy(a, b), c)]
		const direct = [...andMask32Lazy(a, b, c)]
		assert.deepEqual(chained, direct)
		assert.deepEqual(chained, [0x0f000f00, 0x00141200])
	})

	it('consumes iterables lazily one word at a time and cleans up on early break', () => {
		let pulledA = 0
		let pulledB = 0
		let closedA = false
		let closedB = false

		function* streamA() {
			try {
				for (let i = 0; i < 10; i++) {
					pulledA++
					yield 0xffffffff
				}
			} finally {
				closedA = true
			}
		}

		function* streamB() {
			try {
				for (let i = 0; i < 10; i++) {
					pulledB++
					yield (1 << i) >>> 0
				}
			} finally {
				closedB = true
			}
		}

		const gen = andMask32Lazy(streamA(), streamB())
		// Nothing pulled before first .next()
		assert.equal(pulledA, 0)
		assert.equal(pulledB, 0)

		assert.deepEqual(gen.next(), { value: 1, done: false })
		assert.equal(pulledA, 1)
		assert.equal(pulledB, 1)

		assert.deepEqual(gen.next(), { value: 2, done: false })
		assert.equal(pulledA, 2)
		assert.equal(pulledB, 2)

		assert.equal(closedA, false)
		assert.equal(closedB, false)

		// Early termination closes both upstream iterators
		gen.return()
		assert.equal(closedA, true)
		assert.equal(closedB, true)
		assert.equal(pulledA, 2)
		assert.equal(pulledB, 2)
	})

	it('terminates on shortest input when paired with an infinite stream and closes it', () => {
		let pulledInf = 0
		let closedInf = false

		function* infiniteMask() {
			try {
				while (true) {
					pulledInf++
					yield 0x55555555
				}
			} finally {
				closedInf = true
			}
		}

		const finite = new Uint32Array([0xffffffff, 0x0f0f0f0f])
		const result = [...andMask32Lazy(finite, infiniteMask())]

		assert.deepEqual(result, [0x55555555, 0x05050505])
		assert.equal(pulledInf, 2)
		assert.equal(closedInf, true)
	})

	it('handles empty inputs and unequal lengths', () => {
		const empty = new Uint32Array(0)
		const nonEmpty = new Uint32Array([0xffffffff, 0x12345678])

		assert.deepEqual([...andMask32Lazy(empty, empty)], [])
		assert.deepEqual([...andMask32Lazy(empty, nonEmpty)], [])
		assert.deepEqual([...andMask32Lazy(nonEmpty, empty)], [])

		const short = new Uint32Array([0x00ff00ff])
		const long = new Uint32Array([0x12345678, 0x9abcdef0, 0xffffffff])
		assert.deepEqual([...andMask32Lazy(short, long)], [0x00340078])
		assert.deepEqual([...andMask32Lazy(long, short)], [0x00340078])
	})

	it('satisfies boolean algebra identities (zero, all-ones, idempotence, commutativity)', () => {
		const a = new Uint32Array([0x00000000, 0xffffffff, 0x80000000, 0x76543210])
		const b = new Uint32Array([0xabcdef01, 0x13579bdf, 0xdeadbeef, 0x01234567])
		const zeros = new Uint32Array(4)
		const ones = new Uint32Array(4).fill(0xffffffff)

		assert.deepEqual(Uint32Array.from(andMask32Lazy(a, zeros)), zeros)
		assert.deepEqual(Uint32Array.from(andMask32Lazy(a, ones)), a)
		assert.deepEqual(Uint32Array.from(andMask32Lazy(a, a)), a)
		assert.deepEqual(
			Uint32Array.from(andMask32Lazy(a, b)),
			Uint32Array.from(andMask32Lazy(b, a))
		)
	})

	it('validates input arguments eagerly', () => {
		const valid = new Uint32Array([1])

		assert.throws(() => andMask32Lazy(), TypeError)
		assert.throws(() => andMask32Lazy(valid), TypeError)
		assert.throws(() => andMask32Lazy(null, valid), TypeError)
		assert.throws(() => andMask32Lazy(valid, undefined), TypeError)
		assert.throws(() => andMask32Lazy(42, valid), TypeError)
		assert.throws(() => andMask32Lazy({}, valid), TypeError)
		assert.throws(() => andMask32Lazy('1234', valid), TypeError)
		assert.throws(() => andMask32Lazy(valid, valid, 'bad'), TypeError)

		const brokenIterable = {
			[Symbol.iterator]() {
				return null
			}
		}
		assert.throws(() => [...andMask32Lazy(brokenIterable, valid)], TypeError)
	})

	it('validates yielded uint32 words lazily and closes sibling iterators on error', () => {
		const invalidWords = [-1, 0x100000000, 1.5, NaN, Infinity, -Infinity, '1', 1n, null]

		for (const bad of invalidWords) {
			let siblingClosed = false
			function* sibling() {
				try {
					yield 0xffffffff
					yield 0xffffffff
				} finally {
					siblingClosed = true
				}
			}

			assert.throws(() => [...andMask32Lazy(sibling(), [bad])], RangeError)
			assert.equal(siblingClosed, true)
		}
	})

	it('cross-checks against independent JS Set intersection and BigInt bitwise AND oracles', () => {
		// Deterministic LCG PRNG
		let seed = 0x12345678
		function nextU32() {
			seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
			return seed
		}

		function setToMask(bitSet, wordCount) {
			const arr = new Uint32Array(wordCount)
			for (const bit of bitSet) {
				arr[bit >>> 5] = (arr[bit >>> 5] | (1 << (bit & 31))) >>> 0
			}
			return arr
		}

		function maskToSet(words) {
			const out = new Set()
			let wordIdx = 0
			for (const w of words) {
				for (let bit = 0; bit < 32; bit++) {
					if (((w >>> bit) & 1) === 1) {
						out.add(wordIdx * 32 + bit)
					}
				}
				wordIdx++
			}
			return out
		}

		function wordsToBigInt(words) {
			let acc = 0n
			for (let i = words.length - 1; i >= 0; i--) {
				acc = (acc << 32n) | BigInt(words[i])
			}
			return acc
		}

		for (let trial = 0; trial < 25; trial++) {
			const lenA = 1 + (nextU32() % 12)
			const lenB = 1 + (nextU32() % 12)
			const lenC = 1 + (nextU32() % 12)

			const setA = new Set()
			const setB = new Set()
			const setC = new Set()

			for (let i = 0; i < lenA * 16; i++) setA.add(nextU32() % (lenA * 32))
			for (let i = 0; i < lenB * 16; i++) setB.add(nextU32() % (lenB * 32))
			for (let i = 0; i < lenC * 16; i++) setC.add(nextU32() % (lenC * 32))

			const maskA = setToMask(setA, lenA)
			const maskB = setToMask(setB, lenB)
			const maskC = setToMask(setC, lenC)

			// 2-way cross-check against Set intersection and BigInt AND
			const lazyAB = [...andMask32Lazy(maskA, maskB)]
			const expectedSetAB = new Set([...setA].filter((x) => setB.has(x)))
			assert.deepEqual(maskToSet(lazyAB), expectedSetAB)
			assert.equal(wordsToBigInt(lazyAB), wordsToBigInt(maskA) & wordsToBigInt(maskB))

			// 3-way cross-check against Set intersection and BigInt AND
			const lazyABC = [...andMask32Lazy(maskA, maskB, maskC)]
			const expectedSetABC = new Set(
				[...setA].filter((x) => setB.has(x) && setC.has(x))
			)
			assert.deepEqual(maskToSet(lazyABC), expectedSetABC)
			assert.equal(
				wordsToBigInt(lazyABC),
				wordsToBigInt(maskA) & wordsToBigInt(maskB) & wordsToBigInt(maskC)
			)
		}
	})
})
