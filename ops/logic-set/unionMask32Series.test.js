import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { unionMask32Series } from './unionMask32Series.js'

/**
 * Extracts all set bit indices from a Uint32Array bitmask into a Set<number>.
 * Bit k of word i corresponds to global bit index (i * 32 + k).
 *
 * @param {Uint32Array} mask
 * @returns {Set<number>}
 */
function maskToBitSet(mask) {
	const bits = new Set()
	for (let i = 0; i < mask.length; i++) {
		const word = mask[i]
		for (let b = 0; b < 32; b++) {
			if (((word >>> b) & 1) === 1) {
				bits.add(i * 32 + b)
			}
		}
	}
	return bits
}

/**
 * Deterministic xorshift32 PRNG for reproducible fuzz testing.
 *
 * @param {number} seed
 * @returns {() => number}
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

/**
 * Counts total set bits across a Uint32Array mask.
 *
 * @param {Uint32Array} mask
 * @returns {number}
 */
function popcountMask(mask) {
	return maskToBitSet(mask).size
}

/**
 * Helper to compute word-wise intersection for identity cross-checks.
 *
 * @param {...Uint32Array} masks
 * @returns {Uint32Array}
 */
function intersectMasks(...masks) {
	const len = masks[0].length
	const out = new Uint32Array(len)
	for (let i = 0; i < len; i++) {
		let acc = 0xffffffff
		for (const m of masks) {
			acc = (acc & m[i]) >>> 0
		}
		out[i] = acc
	}
	return out
}

describe('unionMask32Series', () => {
	describe('basic two-mask unions', () => {
		it('computes union of disjoint alternating masks', () => {
			const a = new Uint32Array([0x55555555, 0x00ff00ff, 0x0000ffff])
			const b = new Uint32Array([0xaaaaaaaa, 0xff00ff00, 0xffff0000])
			const res = unionMask32Series(a, b)

			assert.ok(res instanceof Uint32Array)
			assert.deepEqual(res, new Uint32Array([0xffffffff, 0xffffffff, 0xffffffff]))
		})

		it('computes union of overlapping masks with unsigned 32-bit values', () => {
			const a = new Uint32Array([0x80000001, 0x12345678, 0xf0f0f0f0])
			const b = new Uint32Array([0x80000002, 0x87654321, 0x0f0f00ff])
			const res = unionMask32Series(a, b)

			assert.deepEqual(res, new Uint32Array([0x80000003, 0x97755779, 0xfffff0ff]))
		})

		it('handles high-bit sign boundary (bit 31) without sign corruption', () => {
			const a = new Uint32Array([0x80000000, 0x7fffffff, 0x80000000])
			const b = new Uint32Array([0x00000000, 0x80000000, 0x80000000])
			const res = unionMask32Series(a, b)

			assert.deepEqual(res, new Uint32Array([0x80000000, 0xffffffff, 0x80000000]))
			assert.equal(res[0], 2147483648)
			assert.equal(res[1], 4294967295)
			assert.equal(res[2], 2147483648)
		})
	})

	describe('variadic series of masks', () => {
		it('unions three or more masks accurately', () => {
			const m0 = new Uint32Array([0x000000ff, 0x80000000])
			const m1 = new Uint32Array([0x0000ff00, 0x00000001])
			const m2 = new Uint32Array([0x00ff0000, 0x00ff0000])
			const m3 = new Uint32Array([0xff000000, 0x0000ff00])

			const res = unionMask32Series(m0, m1, m2, m3)
			assert.deepEqual(res, new Uint32Array([0xffffffff, 0x80ffff01]))
		})

		it('matches sequential binary folding for multiple masks', () => {
			const m0 = new Uint32Array([0x01234567, 0x89abcdef, 0x00000000])
			const m1 = new Uint32Array([0x10000000, 0x00000000, 0xdeadbeef])
			const m2 = new Uint32Array([0x0000f000, 0x11111111, 0x00000001])
			const m3 = new Uint32Array([0x80000000, 0x00000002, 0x22222222])

			const direct = unionMask32Series(m0, m1, m2, m3)
			const folded = unionMask32Series(
				unionMask32Series(unionMask32Series(m0, m1), m2),
				m3
			)

			assert.deepEqual(direct, folded)
		})
	})

	describe('edge cases and immutability', () => {
		it('handles empty Uint32Array masks and returns a new instance', () => {
			const a = new Uint32Array(0)
			const b = new Uint32Array(0)
			const res = unionMask32Series(a, b)

			assert.ok(res instanceof Uint32Array)
			assert.equal(res.length, 0)
			assert.notEqual(res, a)
			assert.notEqual(res, b)
		})

		it('satisfies zero-mask identity and all-ones absorption', () => {
			const a = new Uint32Array([0x00000000, 0x13579bdf, 0xffffffff])
			const zero = new Uint32Array([0, 0, 0])
			const ones = new Uint32Array([0xffffffff, 0xffffffff, 0xffffffff])

			assert.deepEqual(unionMask32Series(a, zero), a)
			assert.deepEqual(unionMask32Series(zero, a), a)
			assert.deepEqual(unionMask32Series(zero, zero), zero)
			assert.deepEqual(unionMask32Series(a, ones), ones)
			assert.deepEqual(unionMask32Series(ones, a), ones)
		})

		it('does not mutate input masks and handles aliased/overlapping buffers', () => {
			const buf = new ArrayBuffer(16)
			const full = new Uint32Array(buf)
			full.set([0x11111111, 0x22222222, 0x44444444, 0x88888888])
			const viewA = full.subarray(0, 3)
			const viewB = full.subarray(1, 4)

			const snapFull = new Uint32Array(full)
			const res = unionMask32Series(viewA, viewB)

			assert.deepEqual(full, snapFull)
			assert.deepEqual(res, new Uint32Array([0x33333333, 0x66666666, 0xcccccccc]))
			assert.notEqual(res.buffer, buf)

			const selfRes = unionMask32Series(viewA, viewA)
			assert.deepEqual(selfRes, viewA)
			assert.notEqual(selfRes, viewA)
		})
	})

	describe('input validation', () => {
		it('throws TypeError when arguments are missing or not Uint32Array', () => {
			const valid = new Uint32Array([1, 2])

			assert.throws(() => unionMask32Series(), TypeError)
			assert.throws(() => unionMask32Series(valid), TypeError)
			assert.throws(() => unionMask32Series(null, valid), TypeError)
			assert.throws(() => unionMask32Series(valid, null), TypeError)
			assert.throws(() => unionMask32Series([1, 2], valid), TypeError)
			assert.throws(() => unionMask32Series(valid, [1, 2]), TypeError)
			assert.throws(() => unionMask32Series(new Int32Array([1, 2]), valid), TypeError)
			assert.throws(() => unionMask32Series(valid, new Uint16Array([1, 2])), TypeError)
			assert.throws(() => unionMask32Series(valid, new Uint8Array([1, 2])), TypeError)
			assert.throws(() => unionMask32Series(valid, valid, 'invalid'), TypeError)
			assert.throws(() => unionMask32Series(valid, valid, valid, 42), TypeError)
		})

		it('throws RangeError when mask lengths do not match', () => {
			const a = new Uint32Array([1, 2])
			const b = new Uint32Array([1, 2, 3])
			const empty = new Uint32Array(0)

			assert.throws(() => unionMask32Series(a, b), RangeError)
			assert.throws(() => unionMask32Series(a, empty), RangeError)
			assert.throws(() => unionMask32Series(a, new Uint32Array([3, 4]), b), RangeError)
		})

		it('throws TypeError before RangeError when an extra mask has invalid type', () => {
			const a = new Uint32Array([1, 2])
			const b = new Uint32Array([1, 2, 3])
			assert.throws(() => unionMask32Series(a, b, 'not-a-mask'), TypeError)
		})
	})

	describe('independent mathematical cross-checks', () => {
		it('matches explicit Set<number> union of set bit indices across random two-mask trials', () => {
			const nextU32 = makeRng(0x20261122)

			for (const wordCount of [1, 2, 5, 12]) {
				for (let trial = 0; trial < 20; trial++) {
					const a = new Uint32Array(wordCount)
					const b = new Uint32Array(wordCount)
					for (let i = 0; i < wordCount; i++) {
						a[i] = nextU32()
						b[i] = nextU32()
					}

					const res = unionMask32Series(a, b)
					const expectedSet = new Set([...maskToBitSet(a), ...maskToBitSet(b)])
					const actualSet = maskToBitSet(res)

					assert.deepEqual(actualSet, expectedSet)
				}
			}
		})

		it('matches explicit Set<number> union for variadic multi-mask trials', () => {
			const nextU32 = makeRng(0x9e3779b9)

			for (let maskCount = 2; maskCount <= 6; maskCount++) {
				const masks = []
				const expectedSet = new Set()

				for (let m = 0; m < maskCount; m++) {
					const mask = new Uint32Array(4)
					for (let i = 0; i < mask.length; i++) {
						// Mix sparse and dense patterns so unions do not saturate immediately
						mask[i] = nextU32() & nextU32()
					}
					masks.push(mask)
					for (const bit of maskToBitSet(mask)) {
						expectedSet.add(bit)
					}
				}

				const res = unionMask32Series(...masks)
				assert.deepEqual(maskToBitSet(res), expectedSet)
			}
		})

		it('agrees with De Morgan identity ~((~a) & (~b) & ...)', () => {
			const nextU32 = makeRng(0xdeadbeef)

			for (let trial = 0; trial < 25; trial++) {
				const len = 6
				const a = new Uint32Array(len)
				const b = new Uint32Array(len)
				const c = new Uint32Array(len)
				for (let i = 0; i < len; i++) {
					a[i] = nextU32()
					b[i] = nextU32()
					c[i] = nextU32()
				}

				const res2 = unionMask32Series(a, b)
				const res3 = unionMask32Series(a, b, c)

				for (let i = 0; i < len; i++) {
					const deMorgan2 = (~((~a[i]) & (~b[i]))) >>> 0
					const deMorgan3 = (~((~a[i]) & (~b[i]) & (~c[i]))) >>> 0
					assert.equal(res2[i], deMorgan2)
					assert.equal(res3[i], deMorgan3)
				}
			}
		})

		it('satisfies Boolean algebra and inclusion-exclusion cardinality laws', () => {
			const nextU32 = makeRng(0x1337c0de)
			const len = 5

			for (let trial = 0; trial < 15; trial++) {
				const a = new Uint32Array(len)
				const b = new Uint32Array(len)
				const c = new Uint32Array(len)
				for (let i = 0; i < len; i++) {
					a[i] = nextU32()
					b[i] = nextU32()
					c[i] = nextU32()
				}

				// Commutativity: a ∪ b = b ∪ a
				const ab = unionMask32Series(a, b)
				const ba = unionMask32Series(b, a)
				assert.deepEqual(ab, ba)

				// Associativity: (a ∪ b) ∪ c = a ∪ (b ∪ c) = union(a, b, c)
				const abcLeft = unionMask32Series(ab, c)
				const abcRight = unionMask32Series(a, unionMask32Series(b, c))
				const abcDirect = unionMask32Series(a, b, c)
				assert.deepEqual(abcLeft, abcRight)
				assert.deepEqual(abcLeft, abcDirect)

				// Idempotence: a ∪ a = a
				assert.deepEqual(unionMask32Series(a, a), a)

				// Absorption: (a ∪ b) ∩ a = a
				assert.deepEqual(intersectMasks(ab, a), a)

				// 2-set inclusion-exclusion: |A ∪ B| = |A| + |B| - |A ∩ B|
				assert.equal(
					popcountMask(ab),
					popcountMask(a) + popcountMask(b) - popcountMask(intersectMasks(a, b))
				)

				// 3-set inclusion-exclusion:
				// |A ∪ B ∪ C| = |A| + |B| + |C| - |A∩B| - |A∩C| - |B∩C| + |A∩B∩C|
				const ie3 =
					popcountMask(a) +
					popcountMask(b) +
					popcountMask(c) -
					popcountMask(intersectMasks(a, b)) -
					popcountMask(intersectMasks(a, c)) -
					popcountMask(intersectMasks(b, c)) +
					popcountMask(intersectMasks(a, b, c))
				assert.equal(popcountMask(abcDirect), ie3)
			}
		})
	})
})
