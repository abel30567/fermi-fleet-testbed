import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { orBitsetLazy } from './orBitsetLazy.js'

describe('orBitsetLazy', () => {
	describe('normal cases', () => {
		it('yields cumulative bitwise OR over an array of bitsets', () => {
			const result = [...orBitsetLazy([0b0001n, 0b0100n, 0b0011n, 0b1000n])]
			assert.deepEqual(result, [0b0001n, 0b0101n, 0b0111n, 0b1111n])
		})

		it('supports an optional initial bitset accumulator', () => {
			const result = [...orBitsetLazy([0b0010n, 0b1000n], 0b0101n)]
			assert.deepEqual(result, [0b0111n, 0b1111n])
		})

		it('is idempotent on duplicate bitsets and treats 0n as identity', () => {
			const result = [...orBitsetLazy([0n, 0b1010n, 0n, 0b1010n, 0b0010n])]
			assert.deepEqual(result, [0n, 0b1010n, 0b1010n, 0b1010n, 0b1010n])
		})

		it('accepts arbitrary iterables such as Set and custom generators', () => {
			const setInput = new Set([0b001n, 0b010n, 0b100n])
			assert.deepEqual([...orBitsetLazy(setInput)], [0b001n, 0b011n, 0b111n])

			function* gen() {
				yield 0b1000n
				yield 0b0001n
			}
			assert.deepEqual([...orBitsetLazy(gen())], [0b1000n, 0b1001n])
		})
	})

	describe('edge cases and arbitrary-width bitsets', () => {
		it('yields nothing for an empty iterable', () => {
			assert.deepEqual([...orBitsetLazy([])], [])
			assert.deepEqual([...orBitsetLazy([], 0b1111n)], [])
		})

		it('handles single-element and all-zero iterables', () => {
			assert.deepEqual([...orBitsetLazy([0n])], [0n])
			assert.deepEqual([...orBitsetLazy([0n, 0n, 0n])], [0n, 0n, 0n])
			assert.deepEqual([...orBitsetLazy([0b10101n])], [0b10101n])
		})

		it('handles very wide arbitrary-precision BigInt bitsets without truncation', () => {
			const b0 = 1n << 0n
			const b64 = 1n << 64n
			const b512 = 1n << 512n
			const b4096 = 1n << 4096n
			const b16384 = 1n << 16384n

			const result = [...orBitsetLazy([b0, b64, b512, b4096, b16384])]
			assert.equal(result.length, 5)
			assert.equal(result[0], b0)
			assert.equal(result[1], b0 | b64)
			assert.equal(result[2], b0 | b64 | b512)
			assert.equal(result[3], b0 | b64 | b512 | b4096)
			assert.equal(result[4], b0 | b64 | b512 | b4096 | b16384)
			assert.equal((result[4] >> 16384n) & 1n, 1n)
			assert.equal((result[4] >> 16383n) & 1n, 0n)
		})
	})

	describe('input validation', () => {
		it('throws TypeError eagerly when bitsets is not a valid iterable', () => {
			for (const bad of [undefined, null, 0, 42, 42n, true, false, {}, '101']) {
				assert.throws(() => orBitsetLazy(bad), TypeError)
			}
		})

		it('throws TypeError eagerly when initial is not a BigInt', () => {
			for (const bad of [0, 1, '0', null, {}, []]) {
				assert.throws(() => orBitsetLazy([], bad), TypeError)
			}
		})

		it('throws RangeError eagerly when initial is negative', () => {
			assert.throws(() => orBitsetLazy([], -1n), RangeError)
			assert.throws(() => orBitsetLazy([], -(1n << 200n)), RangeError)
		})

		it('validates elements lazily and throws TypeError on non-BigInt elements', () => {
			const gen = orBitsetLazy([0b01n, 0b10n, 4, 0b1000n])
			assert.deepEqual(gen.next(), { value: 0b01n, done: false })
			assert.deepEqual(gen.next(), { value: 0b11n, done: false })
			assert.throws(() => gen.next(), TypeError)
		})

		it('validates elements lazily and throws RangeError on negative BigInt elements', () => {
			const gen = orBitsetLazy([0b01n, -1n, 0b10n])
			assert.deepEqual(gen.next(), { value: 0b01n, done: false })
			assert.throws(() => gen.next(), RangeError)
		})
	})

	describe('laziness guarantees', () => {
		it('does not invoke Symbol.iterator or pull elements until consumed, pulling strictly one by one', () => {
			let iteratorCreated = false
			let pulled = 0
			let finalized = false

			const infiniteSource = {
				[Symbol.iterator]() {
					iteratorCreated = true
					return (function* () {
						try {
							for (let i = 0n; ; i++) {
								pulled++
								yield 1n << i
							}
						} finally {
							finalized = true
						}
					})()
				}
			}

			const stream = orBitsetLazy(infiniteSource)
			assert.equal(iteratorCreated, false)
			assert.equal(pulled, 0)

			const first = stream.next()
			assert.equal(iteratorCreated, true)
			assert.equal(pulled, 1)
			assert.deepEqual(first, { value: 0b1n, done: false })

			const second = stream.next()
			assert.equal(pulled, 2)
			assert.deepEqual(second, { value: 0b11n, done: false })

			const third = stream.next()
			assert.equal(pulled, 3)
			assert.deepEqual(third, { value: 0b111n, done: false })

			assert.equal(finalized, false)
			stream.return()
			assert.equal(finalized, true)
			assert.equal(pulled, 3)
		})

		it('supports early break in for...of over an infinite stream with invalid later elements', () => {
			let pulled = 0
			let closed = false

			function* guardedInfinite() {
				try {
					for (let i = 0n; ; i++) {
						pulled++
						if (i === 10n) {
							yield -1n // would throw RangeError if eagerly materialized
						}
						yield 1n << (i * 2n)
					}
				} finally {
					closed = true
				}
			}

			const collected = []
			for (const acc of orBitsetLazy(guardedInfinite())) {
				collected.push(acc)
				if (collected.length === 4) {
					break
				}
			}

			assert.deepEqual(collected, [0b1n, 0b101n, 0b10101n, 0b1010101n])
			assert.equal(pulled, 4)
			assert.equal(closed, true)
		})
	})

	describe('independent cross-checks and algebraic properties', () => {
		it('matches closed-form (1n << k) - 1n across 512 single-bit steps', () => {
			function* singleBits() {
				for (let i = 0n; ; i++) {
					yield 1n << i
				}
			}

			let step = 0n
			for (const acc of orBitsetLazy(singleBits())) {
				step++
				assert.equal(acc, (1n << step) - 1n)
				if (step === 512n) {
					break
				}
			}
			assert.equal(step, 512n)
		})

		it('agrees step-by-step with an independent Set<number> union reference', () => {
			const indexSets = [
				[0, 5, 63],
				[63, 64, 127],
				[],
				[128, 500, 2048],
				[0, 17, 500, 1024]
			]

			const toBitset = (indices) =>
				indices.reduce((mask, idx) => mask | (1n << BigInt(idx)), 0n)

			const bitsets = indexSets.map(toBitset)
			const actual = [...orBitsetLazy(bitsets)]

			const refUnion = new Set()
			const expected = indexSets.map((indices) => {
				for (const idx of indices) {
					refUnion.add(idx)
				}
				return toBitset([...refUnion])
			})

			assert.deepEqual(actual, expected)
		})

		it('satisfies monotonicity, commutativity of final union, and De Morgan law', () => {
			const width = 300n
			const universeMask = (1n << width) - 1n
			const inputs = [
				(1n << 0n) | (1n << 73n) | (1n << 299n),
				(1n << 12n) | (1n << 73n) | (1n << 150n),
				(1n << 64n) | (1n << 199n),
				(1n << 255n) | (1n << 299n)
			]

			const forward = [...orBitsetLazy(inputs)]
			const reversed = [...orBitsetLazy([...inputs].reverse())]

			// Monotonicity: prev <= curr and prev is a subset of curr
			for (let i = 1; i < forward.length; i++) {
				assert.ok(forward[i - 1] <= forward[i])
				assert.equal(forward[i - 1] & forward[i], forward[i - 1])
			}

			// Commutativity: final union matches regardless of order
			const finalUnion = forward.at(-1)
			assert.equal(finalUnion, reversed.at(-1))

			// De Morgan's Law: union(A_i) === ~intersection(~A_i) within universeMask
			const complementIntersection = inputs
				.map((bs) => universeMask ^ bs)
				.reduce((acc, comp) => acc & comp, universeMask)
			assert.equal(finalUnion, universeMask ^ complementIntersection)
		})
	})
})
