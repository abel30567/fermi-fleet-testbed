import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { unionBitsetLazy } from './unionBitsetLazy.js'

/**
 * Converts a non-negative BigInt bitset to a Set of 0-based bit indices.
 *
 * @param {bigint} bitset
 * @returns {Set<number>}
 */
function bitsetToIndexSet(bitset) {
	const result = new Set()
	let remaining = bitset
	let index = 0
	while (remaining > 0n) {
		if ((remaining & 1n) === 1n) {
			result.add(index)
		}
		remaining >>= 1n
		index += 1
	}
	return result
}

/**
 * Converts an iterable of non-negative integer bit indices to a BigInt bitset.
 *
 * @param {Iterable<number>} indices
 * @returns {bigint}
 */
function indexSetToBitset(indices) {
	let bitset = 0n
	for (const idx of indices) {
		bitset |= 1n << BigInt(idx)
	}
	return bitset
}

describe('unionBitsetLazy', () => {
	it('yields cumulative unions for normal bitset sequences', () => {
		const steps = [...unionBitsetLazy([0b0001n, 0b0100n, 0b0011n, 0b1000n])]
		assert.deepEqual(steps, [0b0001n, 0b0101n, 0b0111n, 0b1111n])
	})

	it('handles empty iterable and returns identity 0n (or initial)', () => {
		const genDefault = unionBitsetLazy([])
		assert.deepEqual(genDefault.next(), { value: 0n, done: true })

		const genWithInitial = unionBitsetLazy([], 0b1010n)
		assert.deepEqual(genWithInitial.next(), { value: 0b1010n, done: true })
	})

	it('handles single-element iterable and zero bitsets', () => {
		assert.deepEqual([...unionBitsetLazy([0n])], [0n])
		assert.deepEqual([...unionBitsetLazy([0b10110n])], [0b10110n])
		assert.deepEqual([...unionBitsetLazy([0n, 0n, 0b101n, 0n])], [0n, 0n, 0b101n, 0b101n])
	})

	it('supports arbitrary-width BigInt bitsets beyond 64, 256, and 4096 bits', () => {
		const b1 = (1n << 0n) | (1n << 65n)
		const b2 = (1n << 256n) | (1n << 1024n)
		const b3 = (1n << 4096n) | (1n << 10000n)

		const steps = [...unionBitsetLazy([b1, b2, b3])]
		assert.equal(steps.length, 3)
		assert.equal(steps[0], b1)
		assert.equal(steps[1], b1 | b2)
		assert.equal(steps[2], b1 | b2 | b3)

		// Verify specific high bit membership without 32/53/64-bit truncation
		const finalUnion = steps[2]
		for (const bit of [0n, 65n, 256n, 1024n, 4096n, 10000n]) {
			assert.equal((finalUnion >> bit) & 1n, 1n)
		}
		assert.equal((finalUnion >> 64n) & 1n, 0n)
		assert.equal((finalUnion >> 9999n) & 1n, 0n)
	})

	it('supports custom initial accumulator bitset', () => {
		const gen = unionBitsetLazy([0b0010n, 0b1000n], 0b0001n)
		assert.deepEqual(gen.next(), { value: 0b0011n, done: false })
		assert.deepEqual(gen.next(), { value: 0b1011n, done: false })
		assert.deepEqual(gen.next(), { value: 0b1011n, done: true })
	})

	it('consumes input iterables strictly lazily and supports infinite streams with cleanup', () => {
		let pulled = 0
		let closed = false

		function* infiniteBits() {
			try {
				let i = 0n
				while (true) {
					pulled += 1
					yield 1n << i
					i += 1n
				}
			} finally {
				closed = true
			}
		}

		const stream = unionBitsetLazy(infiniteBits())
		// Nothing pulled before first .next()
		assert.equal(pulled, 0)
		assert.equal(closed, false)

		assert.deepEqual(stream.next(), { value: 0b1n, done: false })
		assert.equal(pulled, 1)

		assert.deepEqual(stream.next(), { value: 0b11n, done: false })
		assert.equal(pulled, 2)

		assert.deepEqual(stream.next(), { value: 0b111n, done: false })
		assert.equal(pulled, 3)

		// Early termination via for...of break closes underlying source generator
		let last = 0n
		for (const u of stream) {
			last = u
			if (u === 0b11111n) break
		}
		assert.equal(last, 0b11111n)
		assert.equal(pulled, 5)
		assert.equal(closed, true)
	})

	it('works with Set and custom single-pass iterators', () => {
		const setInput = new Set([1n << 3n, 1n << 7n])
		assert.deepEqual([...unionBitsetLazy(setInput)], [1n << 3n, (1n << 3n) | (1n << 7n)])

		const values = [0b100n, 0b010n, 0b001n]
		let idx = 0
		const customIterable = {
			[Symbol.iterator]() {
				return {
					next() {
						if (idx < values.length) {
							return { value: values[idx++], done: false }
						}
						return { value: undefined, done: true }
					},
				}
			},
		}
		assert.deepEqual([...unionBitsetLazy(customIterable)], [0b100n, 0b110n, 0b111n])
	})

	it('validates top-level arguments synchronously and elements lazily', () => {
		for (const bad of [null, undefined, 42, 42n, true, {}, '101']) {
			assert.throws(() => unionBitsetLazy(bad), TypeError)
		}

		assert.throws(() => unionBitsetLazy([], 0), TypeError)
		assert.throws(() => unionBitsetLazy([], '0'), TypeError)
		assert.throws(() => unionBitsetLazy([], null), TypeError)
		assert.throws(() => unionBitsetLazy([], -1n), RangeError)

		// Lazy element validation: valid prefix yields before hitting invalid element
		const badTypeGen = unionBitsetLazy([0b01n, 0b10n, 4])
		assert.deepEqual(badTypeGen.next(), { value: 0b01n, done: false })
		assert.deepEqual(badTypeGen.next(), { value: 0b11n, done: false })
		assert.throws(() => badTypeGen.next(), TypeError)

		const negativeGen = unionBitsetLazy([0b01n, -1n, 0b10n])
		assert.deepEqual(negativeGen.next(), { value: 0b01n, done: false })
		assert.throws(() => negativeGen.next(), RangeError)
	})

	it('satisfies set-union algebraic laws (idempotence, commutativity, associativity, monotonicity)', () => {
		const a = (1n << 2n) | (1n << 70n) | (1n << 300n)
		const b = (1n << 70n) | (1n << 128n) | (1n << 512n)
		const c = (1n << 0n) | (1n << 300n) | (1n << 999n)

		const fullUnion = (seq) => {
			let last = 0n
			for (const v of unionBitsetLazy(seq)) last = v
			return last
		}

		// Idempotence
		assert.equal(fullUnion([a, a, a]), a)
		// Commutativity
		assert.equal(fullUnion([a, b]), fullUnion([b, a]))
		// Associativity
		assert.equal(fullUnion([fullUnion([a, b]), c]), fullUnion([a, fullUnion([b, c])]))
		// Monotonicity (each yielded union is a superset of the previous)
		let prev = 0n
		for (const cur of unionBitsetLazy([a, b, c])) {
			assert.equal(cur & prev, prev)
			assert.ok(cur >= prev)
			prev = cur
		}
	})

	it('cross-checks against independent JS Set union and De Morgan complement law', () => {
		const indexSets = [
			[0, 3, 17, 64, 129],
			[3, 18, 64, 255, 513],
			[1, 17, 128, 513, 1023],
			[],
			[0, 1022],
		]

		const bitsets = indexSets.map(indexSetToBitset)
		const lazyResults = [...unionBitsetLazy(bitsets)]

		// 1. Independent Set<number> reference check at every streaming step
		const expectedSet = new Set()
		for (let i = 0; i < indexSets.length; i += 1) {
			for (const elem of indexSets[i]) {
				expectedSet.add(elem)
			}
			assert.deepEqual(bitsetToIndexSet(lazyResults[i]), expectedSet)
			assert.equal(lazyResults[i], indexSetToBitset(expectedSet))
		}

		// 2. Independent De Morgan's Law cross-check over universe [0, 1024):
		//    union(B_i) == U ^ intersection(U ^ B_i)
		const universe = (1n << 1024n) - 1n
		const deMorganUnion = universe ^ bitsets.reduce((acc, b) => acc & (universe ^ b), universe)
		assert.equal(lazyResults[lazyResults.length - 1], deMorganUnion)
	})
})
