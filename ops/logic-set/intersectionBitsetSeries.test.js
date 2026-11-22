import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { intersectionBitsetSeries } from './intersectionBitsetSeries.js'

/**
 * Converts a non-negative BigInt bitset into an explicit JS Set of element indices.
 * @param {bigint} bitset
 * @returns {Set<number>}
 */
function bitsetToSet(bitset) {
	const set = new Set()
	let q = bitset
	let k = 0
	while (q > 0n) {
		if (q % 2n === 1n) {
			set.add(k)
		}
		q /= 2n
		k++
	}
	return set
}

/**
 * Converts an iterable of non-negative integer element indices into a BigInt bitset.
 * @param {Iterable<number>} elements
 * @returns {bigint}
 */
function setToBitset(elements) {
	let result = 0n
	for (const k of elements) {
		result |= 1n << BigInt(k)
	}
	return result
}

/**
 * Reference intersection implemented directly via JS Set membership.
 * @param {...Set<number>} sets
 * @returns {Set<number>}
 */
function jsSetIntersection(...sets) {
	const [first, ...rest] = sets
	const result = new Set()
	for (const elem of first) {
		if (rest.every((s) => s.has(elem))) {
			result.add(elem)
		}
	}
	return result
}

/**
 * Deterministic xorshift64* PRNG for reproducible arbitrary-width bitset generation.
 * @param {bigint} seed
 * @returns {() => bigint}
 */
function createPrng(seed) {
	const MASK64 = (1n << 64n) - 1n
	let state = seed & MASK64
	return () => {
		state ^= state >> 12n
		state ^= (state << 25n) & MASK64
		state ^= state >> 27n
		return (state * 0x2545f4914f6cdd1dn) & MASK64
	}
}

/**
 * Generates a deterministic BigInt of up to `bitWidth` bits using `next64`.
 * @param {() => bigint} next64
 * @param {number} bitWidth
 * @returns {bigint}
 */
function randomBitset(next64, bitWidth) {
	if (bitWidth === 0) return 0n
	const chunks = Math.ceil(bitWidth / 64)
	let value = 0n
	for (let i = 0; i < chunks; i++) {
		value = (value << 64n) | next64()
	}
	const mask = (1n << BigInt(bitWidth)) - 1n
	return value & mask
}

describe('intersectionBitsetSeries', () => {
	describe('normal cases', () => {
		it('computes binary intersection of small bitsets', () => {
			assert.equal(intersectionBitsetSeries(0b10110n, 0b11010n), 0b10010n)
			assert.equal(intersectionBitsetSeries(0b1111n, 0b0101n), 0b0101n)
			assert.equal(intersectionBitsetSeries(0xffn, 0x0fn), 0x0fn)
			assert.equal(
				intersectionBitsetSeries(setToBitset([0, 2, 4, 7]), setToBitset([1, 2, 3, 4, 9])),
				setToBitset([2, 4]),
			)
		})

		it('computes n-ary intersection of three or more bitsets', () => {
			const a = setToBitset([0, 1, 2, 5, 8, 13, 21, 34])
			const b = setToBitset([1, 2, 3, 5, 8, 12, 21, 55])
			const c = setToBitset([2, 4, 5, 8, 16, 21, 32])
			const d = setToBitset([5, 8, 21, 64, 100])

			assert.equal(intersectionBitsetSeries(a, b, c), setToBitset([2, 5, 8, 21]))
			assert.equal(intersectionBitsetSeries(a, b, c, d), setToBitset([5, 8, 21]))
		})

		it('returns the bitset unchanged for a single argument', () => {
			assert.equal(intersectionBitsetSeries(0n), 0n)
			assert.equal(intersectionBitsetSeries(1n), 1n)
			const wide = (1n << 300n) + 0xdeadbeefn
			assert.equal(intersectionBitsetSeries(wide), wide)
		})
	})

	describe('edge cases', () => {
		it('handles empty sets (0n) in any position', () => {
			const nonEmpty = (1n << 512n) - 1n
			assert.equal(intersectionBitsetSeries(0n, 0n), 0n)
			assert.equal(intersectionBitsetSeries(0n, nonEmpty), 0n)
			assert.equal(intersectionBitsetSeries(nonEmpty, 0n), 0n)
			assert.equal(intersectionBitsetSeries(nonEmpty, 0n, nonEmpty), 0n)
		})

		it('returns 0n for disjoint sets including wide alternating masks', () => {
			assert.equal(intersectionBitsetSeries(0b10101010n, 0b01010101n), 0n)
			assert.equal(intersectionBitsetSeries(1n << 500n, (1n << 500n) - 1n), 0n)

			// 512-bit alternating even vs odd bit masks
			let evenMask = 0n
			let oddMask = 0n
			for (let k = 0; k < 512; k += 2) {
				evenMask |= 1n << BigInt(k)
				oddMask |= 1n << BigInt(k + 1)
			}
			assert.equal(intersectionBitsetSeries(evenMask, oddMask), 0n)
		})

		it('satisfies idempotence for identical sets', () => {
			const cases = [
				1n,
				0x123456789abcdef0n,
				(1n << 30n) - 1n,
				1n << 30n,
				(1n << 300n) + (1n << 150n) + 1n,
				(1n << 512n) - 1n,
			]
			for (const a of cases) {
				assert.equal(intersectionBitsetSeries(a, a), a)
				assert.equal(intersectionBitsetSeries(a, a, a), a)
			}
		})

		it('returns the subset when one bitset is a subset of another', () => {
			const sub = setToBitset([0, 29, 30, 31, 60, 128, 256, 400])
			const sup = setToBitset([0, 1, 29, 30, 31, 59, 60, 61, 127, 128, 255, 256, 399, 400, 512])
			assert.equal(intersectionBitsetSeries(sub, sup), sub)
			assert.equal(intersectionBitsetSeries(sup, sub), sub)
		})

		it('handles exact limb-width (30-bit) and power-of-two boundaries accurately', () => {
			const boundaries = [0, 1, 28, 29, 30, 31, 58, 59, 60, 61, 89, 90, 91, 127, 128, 255, 256, 257, 511, 512, 513]
			for (const bit of boundaries) {
				const single = 1n << BigInt(bit)
				const neighborhood =
					(bit > 0 ? 1n << BigInt(bit - 1) : 0n) | single | (1n << BigInt(bit + 1))
				assert.equal(intersectionBitsetSeries(single, neighborhood), single)
				assert.equal(intersectionBitsetSeries(single, single - 1n), 0n)
			}

			// Exact full 30-bit limb (2^30 - 1) and 60-bit two-limb mask (2^60 - 1)
			const limb1 = (1n << 30n) - 1n
			const limb2 = (1n << 60n) - 1n
			assert.equal(intersectionBitsetSeries(limb1, limb2), limb1)
			assert.equal(intersectionBitsetSeries(limb2, limb1 << 30n), limb1 << 30n)
		})

		it('handles >256-bit sets including 1024-bit, 4096-bit, and asymmetric widths', () => {
			const a = (1n << 1024n) | (1n << 513n) | (1n << 257n) | (1n << 30n) | 0b10101n
			const b = (1n << 2048n) | (1n << 1024n) | (1n << 257n) | (1n << 29n) | 0b10011n
			assert.equal(intersectionBitsetSeries(a, b), (1n << 1024n) | (1n << 257n) | 0b10001n)

			// 4096-bit bitset intersected with a small 8-bit bitset (early termination)
			const huge = ((1n << 4096n) - 1n) ^ 0b01010100n
			const small = 0b11111111n
			assert.equal(intersectionBitsetSeries(huge, small), 0b10101011n)
			assert.equal(intersectionBitsetSeries(small, huge), 0b10101011n)

			// Two full 4096-bit bitsets with selective gaps
			const hugeA = (1n << 4096n) - 1n - (1n << 3333n) - (1n << 777n)
			const hugeB = (1n << 4096n) - 1n - (1n << 2222n) - (1n << 777n)
			const expectedHuge = (1n << 4096n) - 1n - (1n << 3333n) - (1n << 2222n) - (1n << 777n)
			assert.equal(intersectionBitsetSeries(hugeA, hugeB), expectedHuge)
		})
	})

	describe('algebraic identities and independent cross-checks', () => {
		it('matches explicit JS Set intersection across small and wide (>256-bit) bitsets', () => {
			const next64 = createPrng(0x9e3779b97f4a7c15n)
			const widths = [1, 8, 30, 31, 60, 64, 128, 257, 384, 512]

			for (const width of widths) {
				const a = randomBitset(next64, width)
				const b = randomBitset(next64, width)
				const c = randomBitset(next64, width)

				const setA = bitsetToSet(a)
				const setB = bitsetToSet(b)
				const setC = bitsetToSet(c)

				const expectedAB = setToBitset(jsSetIntersection(setA, setB))
				const expectedABC = setToBitset(jsSetIntersection(setA, setB, setC))

				assert.equal(intersectionBitsetSeries(a, b), expectedAB)
				assert.equal(intersectionBitsetSeries(a, b, c), expectedABC)
				assert.deepEqual(bitsetToSet(intersectionBitsetSeries(a, b)), jsSetIntersection(setA, setB))
			}
		})

		it('matches native BigInt & across 100 randomized arbitrary-width pairs and n-tuples', () => {
			const next64 = createPrng(0x243f6a8885a308d3n)

			for (let trial = 0; trial < 100; trial++) {
				const widthA = Number(next64() % 1025n)
				const widthB = Number(next64() % 1025n)
				const a = randomBitset(next64, widthA)
				const b = randomBitset(next64, widthB)

				assert.equal(intersectionBitsetSeries(a, b), a & b)

				// Also verify 4-way intersection against folded native &
				const c = randomBitset(next64, Number(next64() % 600n))
				const d = randomBitset(next64, Number(next64() % 600n))
				assert.equal(intersectionBitsetSeries(a, b, c, d), a & b & c & d)
			}
		})

		it('satisfies commutativity, associativity, distributivity, inclusion-exclusion, and De Morgan laws', () => {
			const next64 = createPrng(0x13198a2e03707344n)
			const width = 320
			const universe = (1n << BigInt(width)) - 1n

			for (let i = 0; i < 20; i++) {
				const a = randomBitset(next64, width)
				const b = randomBitset(next64, width)
				const c = randomBitset(next64, width)

				const ab = intersectionBitsetSeries(a, b)

				// Commutativity: A ∩ B = B ∩ A
				assert.equal(ab, intersectionBitsetSeries(b, a))

				// Associativity: (A ∩ B) ∩ C = A ∩ (B ∩ C) = ⋂(A, B, C)
				assert.equal(
					intersectionBitsetSeries(ab, c),
					intersectionBitsetSeries(a, intersectionBitsetSeries(b, c)),
				)
				assert.equal(intersectionBitsetSeries(ab, c), intersectionBitsetSeries(a, b, c))

				// Inclusion-exclusion identity: A ∩ B = A + B - (A ∪ B)
				assert.equal(ab, a + b - (a | b))

				// De Morgan's law on finite universe U: A ∩ B = U - ((U - A) ∪ (U - B))
				assert.equal(ab, universe - ((universe - a) | (universe - b)))

				// Distributivity over union: A ∩ (B ∪ C) = (A ∩ B) ∪ (A ∩ C)
				assert.equal(
					intersectionBitsetSeries(a, b | c),
					intersectionBitsetSeries(a, b) | intersectionBitsetSeries(a, c),
				)
			}
		})
	})

	describe('input validation', () => {
		it('throws RangeError when called with no arguments', () => {
			assert.throws(() => intersectionBitsetSeries(), RangeError)
		})

		it('throws TypeError for non-BigInt arguments', () => {
			const invalidValues = [0, 1, 42, -1, NaN, Infinity, '1', '0n', true, false, null, undefined, {}, [1n], Symbol('s')]
			for (const bad of invalidValues) {
				assert.throws(() => intersectionBitsetSeries(bad), TypeError)
				assert.throws(() => intersectionBitsetSeries(bad, 1n), TypeError)
				assert.throws(() => intersectionBitsetSeries(1n, bad), TypeError)
			}
		})

		it('throws RangeError for negative BigInt arguments', () => {
			const negatives = [-1n, -2n, -1000n, -(1n << 300n)]
			for (const neg of negatives) {
				assert.throws(() => intersectionBitsetSeries(neg), RangeError)
				assert.throws(() => intersectionBitsetSeries(neg, 5n), RangeError)
				assert.throws(() => intersectionBitsetSeries(5n, neg), RangeError)
				assert.throws(() => intersectionBitsetSeries(5n, 3n, neg), RangeError)
			}
		})

		it('validates all arguments even when an earlier argument is 0n', () => {
			assert.throws(() => intersectionBitsetSeries(0n, -1n), RangeError)
			assert.throws(() => intersectionBitsetSeries(0n, '1'), TypeError)
			assert.throws(() => intersectionBitsetSeries(0n, 1n, null), TypeError)
			assert.throws(() => intersectionBitsetSeries(0n, 1n, -(1n << 512n)), RangeError)
		})
	})
})
