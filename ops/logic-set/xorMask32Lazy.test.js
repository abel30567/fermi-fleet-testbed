import test from 'node:test'
import assert from 'node:assert/strict'
import { xorMask32Lazy } from './xorMask32Lazy.js'

/**
 * Helper: converts a sequence of uint32 words into a Set of set bit indices.
 *
 * @param {Iterable<number>} words
 * @returns {Set<number>}
 */
function maskToBitSet(words) {
	const bits = new Set()
	let wordIndex = 0
	for (const w of words) {
		for (let bit = 0; bit < 32; bit++) {
			if (((w >>> bit) & 1) === 1) {
				bits.add(wordIndex * 32 + bit)
			}
		}
		wordIndex++
	}
	return bits
}

/**
 * Helper: converts a sequence of uint32 words into a BigInt bitmask.
 *
 * @param {Iterable<number>} words
 * @returns {bigint}
 */
function maskToBigInt(words) {
	let result = 0n
	let shift = 0n
	for (const w of words) {
		result |= BigInt(w >>> 0) << shift
		shift += 32n
	}
	return result
}

/**
 * Deterministic PRNG (xorshift32) for reproducible property cross-checks.
 *
 * @param {number} seed
 * @returns {() => number}
 */
function makeRng(seed) {
	let state = seed >>> 0 || 1
	return () => {
		state ^= (state << 13) >>> 0
		state ^= state >>> 17
		state ^= (state << 5) >>> 0
		return state >>> 0
	}
}

test('xorMask32Lazy computes bitwise XOR over equal-length Uint32Arrays', () => {
	const a = new Uint32Array([0b1100, 0x0f0f0f0f, 0x12345678])
	const b = new Uint32Array([0b1010, 0x00ff00ff, 0x87654321])
	const result = Uint32Array.from(xorMask32Lazy(a, b))

	assert.deepEqual(
		result,
		new Uint32Array([0b0110, 0x0ff00ff0, (0x12345678 ^ 0x87654321) >>> 0]),
	)
})

test('xorMask32Lazy preserves unsigned 32-bit range when high bit is set', () => {
	const a = new Uint32Array([0x80000000, 0xffffffff, 0xaaaaaaaa])
	const b = new Uint32Array([0x00000000, 0x00000001, 0x55555555])
	const words = [...xorMask32Lazy(a, b)]

	assert.deepEqual(words, [0x80000000, 0xfffffffe, 0xffffffff])
	for (const w of words) {
		assert.ok(w >= 0 && w <= 0xffffffff, `expected uint32, got ${w}`)
	}
})

test('xorMask32Lazy handles masks of different lengths by zero-padding shorter inputs', () => {
	const shortMask = new Uint32Array([0xffffffff])
	const longMask = new Uint32Array([0x0f0f0f0f, 0x80000001, 0xdeadbeef])

	assert.deepEqual(
		[...xorMask32Lazy(shortMask, longMask)],
		[0xf0f0f0f0, 0x80000001, 0xdeadbeef],
	)
	assert.deepEqual(
		[...xorMask32Lazy(longMask, shortMask)],
		[0xf0f0f0f0, 0x80000001, 0xdeadbeef],
	)
})

test('xorMask32Lazy handles empty masks', () => {
	const empty = new Uint32Array(0)
	const nonEmpty = new Uint32Array([0x12345678, 0x80000000])

	assert.deepEqual([...xorMask32Lazy(empty, empty)], [])
	assert.deepEqual([...xorMask32Lazy(empty, nonEmpty)], [0x12345678, 0x80000000])
	assert.deepEqual([...xorMask32Lazy(nonEmpty, empty)], [0x12345678, 0x80000000])
})

test('xorMask32Lazy supports variadic (3+) masks and mixed iterable sources', () => {
	function* genC() {
		yield 0x0000ffff
		yield 0x80000000
		yield 0x00000001
	}

	const a = new Uint32Array([0x00ff00ff, 0x00000001])
	const b = [0x0f0f0f0f, 0xffffffff]
	const result = [...xorMask32Lazy(a, b, genC())]

	assert.deepEqual(result, [
		(0x00ff00ff ^ 0x0f0f0f0f ^ 0x0000ffff) >>> 0,
		(0x00000001 ^ 0xffffffff ^ 0x80000000) >>> 0,
		0x00000001,
	])
})

test('xorMask32Lazy consumes iterables lazily and closes underlying iterators on early exit', () => {
	let pulledA = 0
	let pulledB = 0
	let closedA = false
	let closedB = false

	function* infiniteA() {
		try {
			while (true) {
				pulledA++
				yield (pulledA * 0x01010101) >>> 0
			}
		} finally {
			closedA = true
		}
	}

	function* infiniteB() {
		try {
			while (true) {
				pulledB++
				yield 0x80000000
			}
		} finally {
			closedB = true
		}
	}

	const stream = xorMask32Lazy(infiniteA(), infiniteB())
	// Nothing consumed before iteration begins
	assert.equal(pulledA, 0)
	assert.equal(pulledB, 0)

	const taken = []
	for (const word of stream) {
		taken.push(word)
		assert.equal(pulledA, taken.length)
		assert.equal(pulledB, taken.length)
		if (taken.length === 4) {
			break
		}
	}

	assert.deepEqual(taken, [
		(0x01010101 ^ 0x80000000) >>> 0,
		(0x02020202 ^ 0x80000000) >>> 0,
		(0x03030303 ^ 0x80000000) >>> 0,
		(0x04040404 ^ 0x80000000) >>> 0,
	])
	assert.equal(pulledA, 4)
	assert.equal(pulledB, 4)
	assert.equal(closedA, true)
	assert.equal(closedB, true)
})

test('xorMask32Lazy does not re-poll exhausted iterators', () => {
	let callsShort = 0
	const shortIterable = {
		[Symbol.iterator]() {
			return {
				next() {
					callsShort++
					if (callsShort === 1) {
						return { value: 0x000000ff, done: false }
					}
					if (callsShort === 2) {
						return { value: undefined, done: true }
					}
					throw new Error('Exhausted iterator should not be polled again')
				},
			}
		},
	}

	const longMask = new Uint32Array([0x0000000f, 0x11111111, 0x22222222, 0x33333333])
	const out = [...xorMask32Lazy(shortIterable, longMask)]

	assert.deepEqual(out, [0x000000f0, 0x11111111, 0x22222222, 0x33333333])
	assert.equal(callsShort, 2)
})

test('independent cross-check: matches Set symmetric difference and BigInt XOR across random masks', () => {
	const rng = makeRng(0x5eed1234)

	for (let trial = 0; trial < 40; trial++) {
		const lenA = rng() % 9
		const lenB = rng() % 9
		const a = new Uint32Array(lenA)
		const b = new Uint32Array(lenB)
		for (let i = 0; i < lenA; i++) a[i] = rng()
		for (let i = 0; i < lenB; i++) b[i] = rng()

		// Alternate between passing raw Uint32Array and lazy generator wrapper
		const srcA = trial % 2 === 0 ? a : (function* () { yield* a })()
		const srcB = trial % 3 === 0 ? b : (function* () { yield* b })()

		const actualWords = [...xorMask32Lazy(srcA, srcB)]

		// Length matches max(lenA, lenB)
		assert.equal(actualWords.length, Math.max(lenA, lenB))

		// Cross-check 1: BigInt arbitrary-precision XOR
		const expectedBig = maskToBigInt(a) ^ maskToBigInt(b)
		assert.equal(maskToBigInt(actualWords), expectedBig)

		// Cross-check 2: Explicit set symmetric difference (A \ B) U (B \ A)
		const setA = maskToBitSet(a)
		const setB = maskToBitSet(b)
		const expectedSet = new Set()
		for (const bit of setA) {
			if (!setB.has(bit)) expectedSet.add(bit)
		}
		for (const bit of setB) {
			if (!setA.has(bit)) expectedSet.add(bit)
		}
		assert.deepEqual(maskToBitSet(actualWords), expectedSet)

		// Cross-check 3: Boolean algebra identity (a | b) & ~(a & b)
		const maxLen = Math.max(lenA, lenB)
		for (let i = 0; i < maxLen; i++) {
			const wa = i < lenA ? a[i] : 0
			const wb = i < lenB ? b[i] : 0
			const viaOrAndNot = ((wa | wb) & ~(wa & wb)) >>> 0
			assert.equal(actualWords[i], viaOrAndNot)
		}
	}
})

test('algebraic properties: self-inverse, commutativity, associativity, and streaming composition', () => {
	const a = new Uint32Array([0x13579bdf, 0x80000001, 0xdeadbeef])
	const b = new Uint32Array([0x2468ace0, 0x7fffffff])
	const c = new Uint32Array([0xffffffff, 0x00000000, 0x12345678, 0x9abcdef0])

	// Self-inverse: a ^ a === 0
	assert.deepEqual([...xorMask32Lazy(a, a)], [0, 0, 0])

	// Commutativity: a ^ b === b ^ a
	assert.deepEqual([...xorMask32Lazy(a, b)], [...xorMask32Lazy(b, a)])

	// Associativity & chaining: (a ^ b) ^ c === a ^ (b ^ c) === xor(a, b, c)
	const leftAssoc = [...xorMask32Lazy(xorMask32Lazy(a, b), c)]
	const rightAssoc = [...xorMask32Lazy(a, xorMask32Lazy(b, c))]
	const nAry = [...xorMask32Lazy(a, b, c)]
	assert.deepEqual(leftAssoc, rightAssoc)
	assert.deepEqual(leftAssoc, nAry)

	// Involutivity: (a ^ b) ^ b === a (since len(a) >= len(b))
	assert.deepEqual(Uint32Array.from(xorMask32Lazy(xorMask32Lazy(a, b), b)), a)
})

test('input validation rejects invalid arity, invalid mask sources, and invalid word values', () => {
	const valid = new Uint32Array([1, 2])

	// Fewer than 2 arguments
	assert.throws(() => xorMask32Lazy(), TypeError)
	assert.throws(() => xorMask32Lazy(valid), TypeError)

	// Invalid source types (eager validation on call)
	assert.throws(() => xorMask32Lazy(null, valid), TypeError)
	assert.throws(() => xorMask32Lazy(valid, undefined), TypeError)
	assert.throws(() => xorMask32Lazy('1234', valid), TypeError)
	assert.throws(() => xorMask32Lazy(valid, 42), TypeError)
	assert.throws(() => xorMask32Lazy({}, valid), TypeError)
	assert.throws(() => xorMask32Lazy(new Int32Array([1]), valid), TypeError)
	assert.throws(() => xorMask32Lazy(valid, new Uint8Array([1])), TypeError)
	assert.throws(() => xorMask32Lazy(valid, new Float64Array([1])), TypeError)

	// Malformed iterator
	const badIterable = { [Symbol.iterator]: () => ({}) }
	assert.throws(() => [...xorMask32Lazy(badIterable, valid)], TypeError)

	// Invalid word values yielded lazily
	assert.throws(() => [...xorMask32Lazy([-1], valid)], RangeError)
	assert.throws(() => [...xorMask32Lazy([0x100000000], valid)], RangeError)
	assert.throws(() => [...xorMask32Lazy([1.5], valid)], TypeError)
	assert.throws(() => [...xorMask32Lazy([NaN], valid)], TypeError)
	assert.throws(() => [...xorMask32Lazy([Infinity], valid)], TypeError)
	assert.throws(() => [...xorMask32Lazy(['1'], valid)], TypeError)
	assert.throws(() => [...xorMask32Lazy([1n], valid)], TypeError)
})
