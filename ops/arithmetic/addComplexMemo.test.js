import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { addComplexMemo } from './addComplexMemo.js'

describe('addComplexMemo', () => {
	beforeEach(() => {
		addComplexMemo.clearCache()
	})

	describe('normal cases', () => {
		it('adds small integer complex numbers via the precomputed table', () => {
			assert.deepStrictEqual(addComplexMemo({ re: 1, im: 2 }, { re: 3, im: 4 }), { re: 4, im: 6 })
			assert.deepStrictEqual(addComplexMemo({ re: -5, im: 7 }, { re: 2, im: -10 }), { re: -3, im: -3 })
			const stats = addComplexMemo.getStats()
			assert.equal(stats.tableLookups, 4)
		})

		it('adds larger integer complex numbers outside the precomputed table', () => {
			assert.deepStrictEqual(addComplexMemo({ re: 1000, im: -250 }, { re: -400, im: 750 }), {
				re: 600,
				im: 500,
			})
			assert.equal(addComplexMemo.getStats().tableLookups, 0)
		})

		it('adds floating-point complex numbers accurately', () => {
			assert.deepStrictEqual(addComplexMemo({ re: 1.5, im: 2.25 }, { re: -0.5, im: 0.75 }), {
				re: 1,
				im: 3,
			})
		})

		it('handles mixed in-table and out-of-table components', () => {
			assert.deepStrictEqual(addComplexMemo({ re: 5, im: 100.5 }, { re: -3, im: -0.5 }), {
				re: 2,
				im: 100,
			})
			assert.equal(addComplexMemo.getStats().tableLookups, 1)
		})
	})

	describe('edge cases', () => {
		it('satisfies additive identity with zero', () => {
			const zero = { re: 0, im: 0 }
			const z = { re: -42.5, im: 17.25 }
			assert.deepStrictEqual(addComplexMemo(z, zero), z)
			assert.deepStrictEqual(addComplexMemo(zero, z), z)
			assert.deepStrictEqual(addComplexMemo(zero, zero), zero)
		})

		it('satisfies additive inverse', () => {
			const z = { re: 13.75, im: -9.125 }
			const negZ = { re: -13.75, im: 9.125 }
			assert.deepStrictEqual(addComplexMemo(z, negZ), { re: 0, im: 0 })
		})

		it('normalizes negative zero to positive zero', () => {
			const res = addComplexMemo({ re: -0, im: -0 }, { re: -0, im: 0 })
			assert.ok(Object.is(res.re, 0), 'real part should be +0')
			assert.ok(Object.is(res.im, 0), 'imaginary part should be +0')
		})

		it('handles precomputed table boundary values (-16, 16, -17, 17)', () => {
			assert.deepStrictEqual(addComplexMemo({ re: 16, im: -16 }, { re: 16, im: -16 }), {
				re: 32,
				im: -32,
			})
			assert.equal(addComplexMemo.getStats().tableLookups, 2)

			assert.deepStrictEqual(addComplexMemo({ re: 17, im: -17 }, { re: 17, im: -17 }), {
				re: 34,
				im: -34,
			})
			assert.equal(addComplexMemo.getStats().tableLookups, 2)
		})

		it('handles purely real and purely imaginary numbers', () => {
			assert.deepStrictEqual(addComplexMemo({ re: 7, im: 0 }, { re: 0, im: -11 }), {
				re: 7,
				im: -11,
			})
		})

		it('handles extreme finite values without overflow', () => {
			assert.deepStrictEqual(
				addComplexMemo({ re: Number.MAX_VALUE, im: -Number.MAX_VALUE }, { re: -Number.MAX_VALUE, im: Number.MAX_VALUE }),
				{ re: 0, im: 0 }
			)
			const tiny = addComplexMemo({ re: Number.MIN_VALUE, im: 0 }, { re: Number.MIN_VALUE, im: 0 })
			assert.equal(tiny.re, Number.MIN_VALUE * 2)
			assert.equal(tiny.im, 0)
		})

		it('ignores extra properties on input objects and returns a plain { re, im } object', () => {
			const result = addComplexMemo({ re: 2, im: 3, tag: 'first' }, { re: 4, im: 5, extra: true })
			assert.deepStrictEqual(result, { re: 6, im: 8 })
			assert.deepStrictEqual(Object.keys(result).sort(), ['im', 're'])
		})
	})

	describe('memoization and cache behavior', () => {
		it('reuses cached result for identical and commuted arguments', () => {
			const a = { re: 12.5, im: -3.25 }
			const b = { re: 4.5, im: 8.75 }

			const first = addComplexMemo(a, b)
			const second = addComplexMemo(a, b)
			const commuted = addComplexMemo(b, a)

			assert.deepStrictEqual(first, { re: 17, im: 5.5 })
			assert.deepStrictEqual(second, first)
			assert.deepStrictEqual(commuted, first)

			const stats = addComplexMemo.getStats()
			assert.equal(stats.misses, 1)
			assert.equal(stats.hits, 2)
			assert.equal(stats.size, 1)
		})

		it('protects internal cache against caller mutation of returned objects', () => {
			const a = { re: 3, im: 4 }
			const b = { re: 5, im: 6 }

			const first = addComplexMemo(a, b)
			first.re = 9999
			first.im = -9999

			const second = addComplexMemo(a, b)
			assert.deepStrictEqual(second, { re: 8, im: 10 })
			assert.notStrictEqual(first, second)
		})

		it('bounds cache size with LRU eviction', () => {
			const { maxSize } = addComplexMemo.getStats()
			for (let i = 0; i < maxSize + 25; i++) {
				const res = addComplexMemo({ re: i, im: 1 }, { re: 1, im: i })
				assert.deepStrictEqual(res, { re: i + 1, im: i + 1 })
			}
			const stats = addComplexMemo.getStats()
			assert.equal(stats.size, maxSize)
			assert.equal(stats.misses, maxSize + 25)
		})
	})

	describe('input validation', () => {
		it('throws TypeError for non-object or missing arguments', () => {
			assert.throws(() => addComplexMemo(), TypeError)
			assert.throws(() => addComplexMemo({ re: 1, im: 2 }), TypeError)
			assert.throws(() => addComplexMemo(null, { re: 1, im: 2 }), TypeError)
			assert.throws(() => addComplexMemo({ re: 1, im: 2 }, null), TypeError)
			assert.throws(() => addComplexMemo(1, 2), TypeError)
			assert.throws(() => addComplexMemo('1+2i', { re: 1, im: 2 }), TypeError)
			assert.throws(() => addComplexMemo([1, 2], { re: 3, im: 4 }), TypeError)
			assert.throws(() => addComplexMemo({ re: 1, im: 2 }, [3, 4]), TypeError)
		})

		it('throws TypeError for missing or non-numeric re/im fields', () => {
			assert.throws(() => addComplexMemo({}, { re: 1, im: 2 }), TypeError)
			assert.throws(() => addComplexMemo({ re: 1 }, { re: 1, im: 2 }), TypeError)
			assert.throws(() => addComplexMemo({ im: 2 }, { re: 1, im: 2 }), TypeError)
			assert.throws(() => addComplexMemo({ re: '1', im: 2 }, { re: 1, im: 2 }), TypeError)
			assert.throws(() => addComplexMemo({ re: 1, im: '2' }, { re: 1, im: 2 }), TypeError)
			assert.throws(() => addComplexMemo({ re: 1, im: 2 }, { re: true, im: 0 }), TypeError)
			assert.throws(() => addComplexMemo({ re: 1, im: 2 }, { re: 0, im: 1n }), TypeError)
		})

		it('throws RangeError for non-finite inputs and overflowed sums', () => {
			assert.throws(() => addComplexMemo({ re: NaN, im: 0 }, { re: 1, im: 1 }), RangeError)
			assert.throws(() => addComplexMemo({ re: 0, im: NaN }, { re: 1, im: 1 }), RangeError)
			assert.throws(() => addComplexMemo({ re: Infinity, im: 0 }, { re: 1, im: 1 }), RangeError)
			assert.throws(() => addComplexMemo({ re: 0, im: -Infinity }, { re: 1, im: 1 }), RangeError)
			assert.throws(
				() => addComplexMemo({ re: Number.MAX_VALUE, im: 0 }, { re: Number.MAX_VALUE, im: 0 }),
				RangeError
			)
			assert.throws(
				() => addComplexMemo({ re: 0, im: -Number.MAX_VALUE }, { re: 0, im: -Number.MAX_VALUE }),
				RangeError
			)
		})
	})

	describe('independent cross-checks', () => {
		it('matches independent polar/Cartesian vector addition and parallelogram law across seeded samples', () => {
			// Deterministic LCG PRNG for reproducible tests
			let seed = 0x5f3759df
			const nextInt = (min, max) => {
				seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
				return min + (seed % (max - min + 1))
			}

			// Independent complex addition via 2x2 real matrix representation:
			// z = a + bi <-> [[a, -b], [b, a]]
			const toMatrix = (z) => [
				[z.re, -z.im],
				[z.im, z.re],
			]
			const addMatrices = (m1, m2) => [
				[m1[0][0] + m2[0][0], m1[0][1] + m2[0][1]],
				[m1[1][0] + m2[1][0], m1[1][1] + m2[1][1]],
			]
			const normSq = (z) => z.re * z.re + z.im * z.im

			for (let i = 0; i < 100; i++) {
				// Use dyadic fractions (integers / 4) so float arithmetic is exact
				const a = { re: nextInt(-100, 100) / 4, im: nextInt(-100, 100) / 4 }
				const b = { re: nextInt(-100, 100) / 4, im: nextInt(-100, 100) / 4 }
				const c = { re: nextInt(-100, 100) / 4, im: nextInt(-100, 100) / 4 }

				const sum = addComplexMemo(a, b)

				// Cross-check 1: 2x2 real matrix representation of complex numbers
				const matSum = addMatrices(toMatrix(a), toMatrix(b))
				assert.equal(sum.re, matSum[0][0])
				assert.equal(sum.im, matSum[1][0])
				assert.equal(-sum.im, matSum[0][1])
				assert.equal(sum.re, matSum[1][1])

				// Cross-check 2: commutativity
				assert.deepStrictEqual(addComplexMemo(b, a), sum)

				// Cross-check 3: associativity
				assert.deepStrictEqual(
					addComplexMemo(addComplexMemo(a, b), c),
					addComplexMemo(a, addComplexMemo(b, c))
				)

				// Cross-check 4: parallelogram law |a + b|^2 + |a - b|^2 == 2(|a|^2 + |b|^2)
				const diff = addComplexMemo(a, { re: -b.re, im: -b.im })
				assert.equal(normSq(sum) + normSq(diff), 2 * (normSq(a) + normSq(b)))
			}
		})
	})
})
