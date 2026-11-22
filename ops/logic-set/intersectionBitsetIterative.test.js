import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { intersectionBitsetIterative } from './intersectionBitsetIterative.js'

/**
 * Independent helper: build a BigInt bitset from an iterable of non-negative
 * integer element indices.
 */
function elementsToBitset(elements) {
	let bits = 0n
	for (const el of elements) {
		bits |= 1n << BigInt(el)
	}
	return bits
}

/**
 * Independent helper: decode a non-negative BigInt bitset into a Set of bit indices.
 */
function bitsetToElements(bitset) {
	const result = new Set()
	let remaining = bitset
	let index = 0
	while (remaining > 0n) {
		if ((remaining & 1n) === 1n) {
			result.add(index)
		}
		remaining >>= 1n
		index++
	}
	return result
}

/**
 * Independent reference: intersect JS Sets of element indices directly without
 * using BigInt bitwise AND.
 */
function intersectElementSets(sets) {
	const result = new Set()
	const [first, ...rest] = sets
	for (const el of first) {
		if (rest.every((s) => s.has(el))) {
			result.add(el)
		}
	}
	return result
}

/**
 * Independent reference: bit-by-bit intersection of arbitrary-width BigInts
 * using explicit division/modulo by 2n (no bitwise `&`).
 */
function bitByBitIntersection(bitsets) {
	const copies = bitsets.slice()
	let out = 0n
	let place = 1n
	while (copies.every((v) => v > 0n)) {
		let allOnes = true
		for (let i = 0; i < copies.length; i++) {
			if (copies[i] % 2n === 0n) {
				allOnes = false
			}
			copies[i] = copies[i] / 2n
		}
		if (allOnes) {
			out += place
		}
		place *= 2n
	}
	return out
}

describe('intersectionBitsetIterative', () => {
	describe('normal cases', () => {
		it('computes intersection of two overlapping bitsets', () => {
			assert.equal(intersectionBitsetIterative(0b11010n, 0b10110n), 0b10010n)
			assert.equal(intersectionBitsetIterative(0xff0fn, 0x0ff0n), 0x0f00n)
		})

		it('returns 0n for two disjoint bitsets', () => {
			assert.equal(intersectionBitsetIterative(0b10101n, 0b01010n), 0n)
		})

		it('computes intersection of three or more variadic bitsets', () => {
			assert.equal(
				intersectionBitsetIterative(0b11111n, 0b10110n, 0b01110n),
				0b00110n,
			)
			assert.equal(
				intersectionBitsetIterative(
					0b11111111n,
					0b11110000n,
					0b10101010n,
					0b11001100n,
				),
				0b10000000n,
			)
		})

		it('accepts a single array of bitsets and matches variadic results', () => {
			const inputs = [0b111011n, 0b101111n, 0b011011n, 0b111001n]
			assert.equal(
				intersectionBitsetIterative(inputs),
				intersectionBitsetIterative(...inputs),
			)
			assert.equal(intersectionBitsetIterative(inputs), 0b001001n)
		})

		it('returns the same bitset when given a single bitset (variadic or array)', () => {
			assert.equal(intersectionBitsetIterative(0b101101n), 0b101101n)
			assert.equal(intersectionBitsetIterative([0b101101n]), 0b101101n)
			assert.equal(intersectionBitsetIterative(0n), 0n)
		})

		it('does not mutate the input array', () => {
			const inputs = [0b1110n, 0b1011n, 0b1010n]
			const snapshot = [...inputs]
			assert.equal(intersectionBitsetIterative(inputs), 0b1010n)
			assert.deepEqual(inputs, snapshot)
		})
	})

	describe('edge cases and arbitrary-width BigInts', () => {
		it('handles empty bitset (0n) in any position', () => {
			assert.equal(intersectionBitsetIterative(0n, 0b1111n), 0n)
			assert.equal(intersectionBitsetIterative(0b1111n, 0n), 0n)
			assert.equal(intersectionBitsetIterative(0b1111n, 0n, 0b1111n), 0n)
			assert.equal(intersectionBitsetIterative(0n, 0n, 0n), 0n)
		})

		it('handles subset and identical bitsets', () => {
			const sub = (1n << 3n) | (1n << 70n) | (1n << 200n)
			const sup = sub | (1n << 1n) | (1n << 99n) | (1n << 512n)
			assert.equal(intersectionBitsetIterative(sub, sup), sub)
			assert.equal(intersectionBitsetIterative(sup, sub), sub)
			assert.equal(intersectionBitsetIterative(sup, sup, sup), sup)
		})

		it('handles arbitrary-width bitsets beyond 64, 128, 512, and 65536 bits', () => {
			const shared =
				(1n << 0n) |
				(1n << 63n) |
				(1n << 64n) |
				(1n << 127n) |
				(1n << 128n) |
				(1n << 1024n) |
				(1n << 65537n)

			const a = shared | (1n << 53n) | (1n << 4096n) | (1n << 70000n)
			const b = shared | (1n << 53n) | (1n << 8192n)
			const c = shared | (1n << 8192n) | (1n << 70000n)

			assert.equal(intersectionBitsetIterative(a, b, c), shared)
		})

		it('handles dense all-ones masks of large width', () => {
			const mask512 = (1n << 512n) - 1n
			const mask256 = (1n << 256n) - 1n
			const highBits = ((1n << 256n) - 1n) << 256n

			assert.equal(intersectionBitsetIterative(mask512, mask256), mask256)
			assert.equal(intersectionBitsetIterative(mask512, highBits), highBits)
			assert.equal(intersectionBitsetIterative(mask256, highBits), 0n)
		})

		it('handles thousands of bitsets iteratively without stack overflow', () => {
			const common = (1n << 42n) | (1n << 500n)
			const many = []
			for (let i = 0; i < 5000; i++) {
				many.push(common | (1n << BigInt(1000 + i)))
			}
			assert.equal(intersectionBitsetIterative(many), common)

			// Also test early collapse to 0n followed by thousands of valid bitsets
			const withDisjoint = [1n << 10n, 1n << 11n, ...many]
			assert.equal(intersectionBitsetIterative(withDisjoint), 0n)
		})
	})

	describe('input validation', () => {
		it('throws RangeError when called with no bitsets or an empty array', () => {
			assert.throws(() => intersectionBitsetIterative(), {
				name: 'RangeError',
				message: /at least one bitset/i,
			})
			assert.throws(() => intersectionBitsetIterative([]), {
				name: 'RangeError',
				message: /at least one bitset/i,
			})
		})

		it('throws RangeError for negative BigInts in any position', () => {
			assert.throws(() => intersectionBitsetIterative(-1n), {
				name: 'RangeError',
				message: /index 0.*non-negative BigInt/i,
			})
			assert.throws(() => intersectionBitsetIterative(0b11n, -1n), {
				name: 'RangeError',
				message: /index 1.*non-negative BigInt/i,
			})
			assert.throws(
				() => intersectionBitsetIterative([1n, 3n, -(1n << 256n)]),
				{
					name: 'RangeError',
					message: /index 2.*non-negative BigInt/i,
				},
			)
		})

		it('throws TypeError for non-BigInt values', () => {
			const invalidValues = [
				0,
				42,
				NaN,
				Infinity,
				'1',
				true,
				false,
				null,
				undefined,
				{},
				Object(1n),
				Symbol('bits'),
			]

			for (const bad of invalidValues) {
				assert.throws(() => intersectionBitsetIterative(bad), {
					name: 'TypeError',
					message: /index 0.*BigInt/i,
				})
				assert.throws(() => intersectionBitsetIterative(0b11n, bad), {
					name: 'TypeError',
					message: /index 1.*BigInt/i,
				})
				assert.throws(() => intersectionBitsetIterative([0b11n, bad]), {
					name: 'TypeError',
					message: /index 1.*BigInt/i,
				})
			}
		})

		it('rejects nested arrays, multiple array arguments, and sparse arrays', () => {
			assert.throws(() => intersectionBitsetIterative([[1n]]), {
				name: 'TypeError',
			})
			assert.throws(() => intersectionBitsetIterative([1n], [2n]), {
				name: 'TypeError',
			})
			assert.throws(() => intersectionBitsetIterative(new Array(2)), {
				name: 'TypeError',
			})
		})

		it('validates trailing elements even after an earlier 0n bitset', () => {
			assert.throws(() => intersectionBitsetIterative(0n, -5n), {
				name: 'RangeError',
				message: /index 1/i,
			})
			assert.throws(() => intersectionBitsetIterative([0n, 1n, 'invalid']), {
				name: 'TypeError',
				message: /index 2/i,
			})
		})
	})

	describe('independent cross-checks and algebraic identities', () => {
		it('matches Set-based element intersection across pseudo-random multi-set trials', () => {
			// Deterministic LCG PRNG for reproducible tests
			let seed = 0x12345678
			const nextUint = () => {
				seed = (Math.imul(1664525, seed) + 1013904223) >>> 0
				return seed
			}

			for (let trial = 0; trial < 40; trial++) {
				const numSets = 2 + (nextUint() % 5) // 2..6 sets
				const universeSize = 150 + (nextUint() % 150) // up to 300 bits
				const elementSets = []
				const bitsets = []

				for (let s = 0; s < numSets; s++) {
					const set = new Set()
					for (let el = 0; el < universeSize; el++) {
						// ~65% density so multi-set intersections are frequently non-empty
						if (nextUint() % 100 < 65) {
							set.add(el)
						}
					}
					elementSets.push(set)
					bitsets.push(elementsToBitset(set))
				}

				const actualBitset = intersectionBitsetIterative(bitsets)
				const expectedSet = intersectElementSets(elementSets)
				const expectedBitset = elementsToBitset(expectedSet)

				assert.equal(actualBitset, expectedBitset)
				assert.deepEqual(bitsetToElements(actualBitset), expectedSet)
			}
		})

		it('matches independent division/modulo bit-by-bit intersection on wide BigInts', () => {
			const a = (1n << 300n) - 1n - (1n << 17n) - (1n << 199n)
			const b =
				((1n << 160n) - 1n) |
				(1n << 199n) |
				(1n << 250n) |
				(1n << 299n)
			const c =
				((1n << 260n) - 1n) ^
				((1n << 80n) - 1n) ^
				(1n << 299n)

			const expected = bitByBitIntersection([a, b, c])
			assert.equal(intersectionBitsetIterative(a, b, c), expected)
		})

		it('satisfies Boolean algebra laws (commutativity, associativity, distributivity, absorption, De Morgan)', () => {
			const U = (1n << 200n) - 1n
			const A =
				0xdeadbeefcafebabe0123456789abcdef0123456789abcdef01n & U
			const B =
				0x0123456789abcdefdeadbeefcafebabeff00ff00ff00ff00ffn & U
			const C =
				0xf0f0f0f0aaaa5555123456789abcdef000ff00ff55aa55aa55n & U

			// Commutativity: A ∩ B === B ∩ A
			assert.equal(
				intersectionBitsetIterative(A, B),
				intersectionBitsetIterative(B, A),
			)

			// Associativity: (A ∩ B) ∩ C === A ∩ (B ∩ C) === ∩(A, B, C)
			const left = intersectionBitsetIterative(
				intersectionBitsetIterative(A, B),
				C,
			)
			const right = intersectionBitsetIterative(
				A,
				intersectionBitsetIterative(B, C),
			)
			const all = intersectionBitsetIterative(A, B, C)
			assert.equal(left, right)
			assert.equal(left, all)

			// Idempotence: A ∩ A === A
			assert.equal(intersectionBitsetIterative(A, A), A)

			// Absorption: A ∩ (A ∪ B) === A
			assert.equal(intersectionBitsetIterative(A, A | B), A)

			// Distributivity over union: A ∩ (B ∪ C) === (A ∩ B) ∪ (A ∩ C)
			assert.equal(
				intersectionBitsetIterative(A, B | C),
				intersectionBitsetIterative(A, B) | intersectionBitsetIterative(A, C),
			)

			// De Morgan's law in universe U: A ∩ B === U \ ((U \ A) ∪ (U \ B))
			const complementA = U ^ A
			const complementB = U ^ B
			const deMorgan = U ^ (complementA | complementB)
			assert.equal(intersectionBitsetIterative(A, B), deMorgan)
		})
	})
})
