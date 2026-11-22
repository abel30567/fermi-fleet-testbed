import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { intersectionBitsetLazy } from './intersectionBitsetLazy.js'

/**
 * Independent reference helper: converts a non-negative BigInt bitset to a Set of set bit indices.
 * @param {bigint} bitset
 * @returns {Set<number>}
 */
function bitsetToIndices(bitset) {
	const indices = new Set()
	let remaining = bitset
	let bit = 0
	while (remaining > 0n) {
		if ((remaining & 1n) === 1n) {
			indices.add(bit)
		}
		remaining >>= 1n
		bit += 1
	}
	return indices
}

/**
 * Independent reference helper: converts an iterable of non-negative integer bit indices to a BigInt bitset.
 * @param {Iterable<number>} indices
 * @returns {bigint}
 */
function indicesToBitset(indices) {
	let result = 0n
	for (const idx of indices) {
		result |= 1n << BigInt(idx)
	}
	return result
}

/**
 * Independent reference helper: naive intersection of two JS Sets.
 * @template T
 * @param {Set<T>} a
 * @param {Set<T>} b
 * @returns {Set<T>}
 */
function naiveSetIntersection(a, b) {
	const out = new Set()
	for (const elem of a) {
		if (b.has(elem)) {
			out.add(elem)
		}
	}
	return out
}

describe('intersectionBitsetLazy', () => {
	describe('normal cases', () => {
		it('yields cumulative bitwise intersections for an array of bitsets', () => {
			const input = [0b11110n, 0b10111n, 0b11100n, 0b00101n]
			const result = [...intersectionBitsetLazy(input)]
			assert.deepEqual(result, [0b11110n, 0b10110n, 0b10100n, 0b00100n])
		})

		it('handles a single-element iterable', () => {
			assert.deepEqual([...intersectionBitsetLazy([0b101010n])], [0b101010n])
		})

		it('accepts diverse iterable types (Set, BigUint64Array, generator)', () => {
			const setInput = new Set([0b1111n, 0b0111n, 0b0011n])
			assert.deepEqual([...intersectionBitsetLazy(setInput)], [0b1111n, 0b0111n, 0b0011n])

			const typedInput = new BigUint64Array([0xff0fn, 0x0fffn, 0x0f0fn])
			assert.deepEqual([...intersectionBitsetLazy(typedInput)], [0xff0fn, 0x0f0fn, 0x0f0fn])

			function* genInput() {
				yield 0b11011n
				yield 0b10011n
				yield 0b10001n
			}
			assert.deepEqual([...intersectionBitsetLazy(genInput())], [0b11011n, 0b10011n, 0b10001n])
		})

		it('continues yielding 0n after disjoint bitsets by default (shortCircuit: false)', () => {
			const input = [0b1010n, 0b0101n, 0b1111n, 0b1010n]
			assert.deepEqual([...intersectionBitsetLazy(input)], [0b1010n, 0n, 0n, 0n])
		})

		it('stops immediately after yielding 0n when shortCircuit is true', () => {
			const input = [0b1010n, 0b0101n, 0b1111n, 0b1010n]
			assert.deepEqual(
				[...intersectionBitsetLazy(input, { shortCircuit: true })],
				[0b1010n, 0n]
			)
		})
	})

	describe('edge cases', () => {
		it('yields nothing for an empty iterable', () => {
			assert.deepEqual([...intersectionBitsetLazy([])], [])

			function* emptyGen() {}
			assert.deepEqual([...intersectionBitsetLazy(emptyGen())], [])
		})

		it('handles zero bitsets at any position', () => {
			assert.deepEqual([...intersectionBitsetLazy([0n])], [0n])
			assert.deepEqual([...intersectionBitsetLazy([0n, 0b111n, 0b101n])], [0n, 0n, 0n])
			assert.deepEqual(
				[...intersectionBitsetLazy([0n, 0b111n, 0b101n], { shortCircuit: true })],
				[0n]
			)
			assert.deepEqual([...intersectionBitsetLazy([0b111n, 0b101n, 0n])], [0b111n, 0b101n, 0n])
		})

		it('handles arbitrary-width huge BigInt bitsets accurately', () => {
			const bit0 = 1n << 0n
			const bit64 = 1n << 64n
			const bit512 = 1n << 512n
			const bit4096 = 1n << 4096n
			const bit65536 = 1n << 65536n

			const b1 = bit0 | bit64 | bit512 | bit4096 | bit65536
			const b2 = bit64 | bit512 | bit65536 | (1n << 10000n)
			const b3 = bit0 | bit512 | bit65536 | (1n << 20000n)

			const results = [...intersectionBitsetLazy([b1, b2, b3])]
			assert.equal(results.length, 3)
			assert.equal(results[0], b1)
			assert.equal(results[1], bit64 | bit512 | bit65536)
			assert.equal(results[2], bit512 | bit65536)
		})

		it('handles dense all-ones masks of width 2048', () => {
			const mask2048 = (1n << 2048n) - 1n
			const mask1024 = (1n << 1024n) - 1n
			const mask512 = (1n << 512n) - 1n
			assert.deepEqual(
				[...intersectionBitsetLazy([mask2048, mask1024, mask512])],
				[mask2048, mask1024, mask512]
			)
		})
	})

	describe('input validation and errors', () => {
		it('throws TypeError eagerly if bitsets is not a non-string iterable', () => {
			for (const bad of [null, undefined, 42, 42n, true, {}, '1010']) {
				assert.throws(() => intersectionBitsetLazy(bad), TypeError)
			}
		})

		it('throws TypeError eagerly for invalid options', () => {
			assert.throws(() => intersectionBitsetLazy([], null), TypeError)
			assert.throws(() => intersectionBitsetLazy([], []), TypeError)
			assert.throws(() => intersectionBitsetLazy([], 'true'), TypeError)
			assert.throws(() => intersectionBitsetLazy([], { shortCircuit: 1 }), TypeError)
			assert.throws(() => intersectionBitsetLazy([], { shortCircuit: 'yes' }), TypeError)
		})

		it('throws TypeError lazily when an element is not a bigint', () => {
			for (const badElem of [1, '1', null, undefined, true, {}, NaN]) {
				const gen = intersectionBitsetLazy([0b111n, badElem])
				assert.deepEqual(gen.next(), { value: 0b111n, done: false })
				assert.throws(() => gen.next(), TypeError)
			}
		})

		it('throws RangeError lazily when an element is a negative bigint', () => {
			const gen1 = intersectionBitsetLazy([-1n])
			assert.throws(() => gen1.next(), RangeError)

			const gen2 = intersectionBitsetLazy([0b1111n, -(1n << 256n)])
			assert.deepEqual(gen2.next(), { value: 0b1111n, done: false })
			assert.throws(() => gen2.next(), RangeError)
		})

		it('does not validate or pull invalid elements after shortCircuit terminates', () => {
			const input = [0b10n, 0b01n, -99n, 'not-a-bigint']
			assert.deepEqual(
				[...intersectionBitsetLazy(input, { shortCircuit: true })],
				[0b10n, 0n]
			)
		})
	})

	describe('laziness and streaming guarantees', () => {
		it('consumes input strictly one item per .next() call without eager materialization', () => {
			let pulled = 0
			let closed = false

			function* trackedInfiniteSource() {
				try {
					let mask = (1n << 100n) - 1n
					while (true) {
						pulled += 1
						yield mask
						mask >>= 1n
					}
				} finally {
					closed = true
				}
			}

			const gen = intersectionBitsetLazy(trackedInfiniteSource())
			assert.equal(pulled, 0, 'must not pull before first .next()')

			const first = gen.next()
			assert.equal(pulled, 1)
			assert.equal(first.done, false)
			assert.equal(first.value, (1n << 100n) - 1n)

			const second = gen.next()
			assert.equal(pulled, 2)
			assert.equal(second.done, false)
			assert.equal(second.value, (1n << 99n) - 1n)

			const third = gen.next()
			assert.equal(pulled, 3)
			assert.equal(third.done, false)
			assert.equal(third.value, (1n << 98n) - 1n)

			assert.equal(closed, false)
			gen.return()
			assert.equal(closed, true, 'early termination must close upstream generator')
			assert.equal(pulled, 3, 'closing must not pull additional elements')
		})

		it('terminates on an infinite stream when shortCircuit reaches 0n and closes upstream', () => {
			let pulled = 0
			let closed = false

			function* infiniteCollapsingStream() {
				try {
					const prefix = [0b1111n, 0b1100n, 0b0011n]
					let i = 0
					while (true) {
						pulled += 1
						yield i < prefix.length ? prefix[i] : 0b1111n
						i += 1
					}
				} finally {
					closed = true
				}
			}

			const results = [
				...intersectionBitsetLazy(infiniteCollapsingStream(), { shortCircuit: true })
			]
			assert.deepEqual(results, [0b1111n, 0b1100n, 0n])
			assert.equal(pulled, 3, 'must stop pulling immediately once 0n is reached')
			assert.equal(closed, true, 'must close the upstream iterator on short-circuit')
		})
	})

	describe('independent cross-checks and algebraic properties', () => {
		it('matches naive Set<number> index intersection on sparse and dense wide bitsets', () => {
			const indexSets = [
				new Set([0, 1, 2, 7, 63, 64, 65, 128, 255, 512, 1024, 2047, 4095]),
				new Set([0, 2, 7, 64, 100, 128, 512, 1024, 3000, 4095]),
				new Set([2, 7, 64, 128, 512, 999, 4095]),
				new Set([7, 64, 512, 4095]),
				new Set([64, 512])
			]

			const bitsets = indexSets.map(indicesToBitset)
			const streamed = [...intersectionBitsetLazy(bitsets)]

			let expectedSet = new Set(indexSets[0])
			for (let i = 0; i < indexSets.length; i += 1) {
				if (i > 0) {
					expectedSet = naiveSetIntersection(expectedSet, indexSets[i])
				}
				assert.equal(
					streamed[i],
					indicesToBitset(expectedSet),
					`mismatch at step ${i}`
				)
				assert.deepEqual(bitsetToIndices(streamed[i]), expectedSet)
			}
		})

		it("satisfies De Morgan's Law over a finite universe mask U", () => {
			const width = 512n
			const universe = (1n << width) - 1n

			// Deterministic pseudo-random arbitrary-width bitsets within universe
			let seed = 0x123456789abcdef0123456789abcdef0n
			const bitsets = []
			for (let i = 0; i < 6; i += 1) {
				let val = 0n
				for (let chunk = 0; chunk < 8; chunk += 1) {
					seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n)
					val = (val << 64n) | seed
				}
				// Ensure a few shared bits remain across all sets so intersection is non-trivial
				bitsets.push((val & universe) | (1n << 17n) | (1n << 333n))
			}

			const streamed = [...intersectionBitsetLazy(bitsets)]
			const actualFinal = streamed[streamed.length - 1]

			// De Morgan: ∩_i B_i = U ^ (∪_i (U ^ B_i))
			let unionOfComplements = 0n
			for (const b of bitsets) {
				unionOfComplements |= universe ^ b
			}
			const deMorganFinal = universe ^ unionOfComplements

			assert.equal(actualFinal, deMorganFinal)
			assert.notEqual(actualFinal, 0n)
		})

		it('satisfies monotonicity, idempotence, and commutativity of final intersection', () => {
			const a = indicesToBitset([1, 3, 5, 7, 100, 250, 1000])
			const b = indicesToBitset([3, 5, 8, 100, 250, 999, 1000])
			const c = indicesToBitset([3, 5, 100, 1000, 2000])

			// Monotonicity: each step is a subset of the previous step
			const run = [...intersectionBitsetLazy([a, b, c])]
			for (let i = 1; i < run.length; i += 1) {
				assert.ok(run[i] <= run[i - 1])
				assert.equal(run[i] & run[i - 1], run[i])
			}

			// Idempotence
			assert.deepEqual([...intersectionBitsetLazy([a, a, a])], [a, a, a])

			// Commutativity across all 6 permutations of [a, b, c]
			const permutations = [
				[a, b, c],
				[a, c, b],
				[b, a, c],
				[b, c, a],
				[c, a, b],
				[c, b, a]
			]
			const expectedFinal = run[run.length - 1]
			for (const perm of permutations) {
				const permRun = [...intersectionBitsetLazy(perm)]
				assert.equal(permRun[permRun.length - 1], expectedFinal)
			}
		})
	})
})
