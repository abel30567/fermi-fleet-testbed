import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { convolutionComplexMemo } from './convolutionComplexMemo.js'

const EPS = 1e-9

function assertComplexClose(actual, expected, eps = EPS) {
	assert.equal(actual.length, expected.length, `length mismatch: ${actual.length} !== ${expected.length}`)
	for (let i = 0; i < expected.length; i++) {
		assert.ok(
			Math.abs(actual[i].re - expected[i].re) <= eps,
			`re mismatch at index ${i}: got ${actual[i].re}, expected ${expected[i].re}`,
		)
		assert.ok(
			Math.abs(actual[i].im - expected[i].im) <= eps,
			`im mismatch at index ${i}: got ${actual[i].im}, expected ${expected[i].im}`,
		)
	}
}

/**
 * Independent naive complex convolution reference (no FFT, no caching).
 */
function naiveComplexConvolve(a, b) {
	if (a.length === 0 || b.length === 0) return []
	const out = Array.from({ length: a.length + b.length - 1 }, () => ({ re: 0, im: 0 }))
	for (let i = 0; i < a.length; i++) {
		for (let j = 0; j < b.length; j++) {
			out[i + j].re += a[i].re * b[j].re - a[i].im * b[j].im
			out[i + j].im += a[i].re * b[j].im + a[i].im * b[j].re
		}
	}
	return out
}

/**
 * Independent naive DFT-based polynomial evaluation cross-check:
 * Evaluate P(z) = sum_k c_k z^k at arbitrary complex point z and verify
 * (A * B)(z) === A(z) * B(z).
 */
function evalComplexPoly(coeffs, z) {
	let accRe = 0
	let accIm = 0
	let powRe = 1
	let powIm = 0
	for (const c of coeffs) {
		accRe += c.re * powRe - c.im * powIm
		accIm += c.re * powIm + c.im * powRe
		const nextPowRe = powRe * z.re - powIm * z.im
		const nextPowIm = powRe * z.im + powIm * z.re
		powRe = nextPowRe
		powIm = nextPowIm
	}
	return { re: accRe, im: accIm }
}

describe('convolutionComplexMemo', () => {
	beforeEach(() => {
		convolutionComplexMemo.clearCache(true)
	})

	describe('normal cases', () => {
		it('computes full complex convolution of small sequences accurately', () => {
			const a = [
				{ re: 1, im: 2 },
				{ re: 3, im: -1 },
			]
			const b = [
				{ re: 2, im: 1 },
				{ re: -1, im: 4 },
			]
			// k=0: (1+2i)(2+i) = (2-2) + (1+4)i = 0 + 5i
			// k=1: (1+2i)(-1+4i) + (3-i)(2+i) = (-9+2i) + (7+i) = -2 + 3i
			// k=2: (3-i)(-1+4i) = (-3+4) + (12+1)i = 1 + 13i
			const res = convolutionComplexMemo(a, b)
			assert.deepEqual(res, [
				{ re: 0, im: 5 },
				{ re: -2, im: 3 },
				{ re: 1, im: 13 },
			])
		})

		it('handles purely real and purely imaginary sequences', () => {
			const realA = [{ re: 1, im: 0 }, { re: 2, im: 0 }, { re: 3, im: 0 }]
			const realB = [{ re: 4, im: 0 }, { re: 5, im: 0 }]
			assert.deepEqual(convolutionComplexMemo(realA, realB), [
				{ re: 4, im: 0 },
				{ re: 13, im: 0 },
				{ re: 22, im: 0 },
				{ re: 15, im: 0 },
			])

			const imagA = [{ re: 0, im: 2 }, { re: 0, im: 3 }]
			const imagB = [{ re: 0, im: 5 }]
			assert.deepEqual(convolutionComplexMemo(imagA, imagB), [
				{ re: -10, im: 0 },
				{ re: -15, im: 0 },
			])
		})

		it('supports same, valid, and circular convolution modes', () => {
			const a = [
				{ re: 1, im: 1 },
				{ re: 2, im: 0 },
				{ re: 0, im: -1 },
				{ re: 3, im: 2 },
			]
			const b = [
				{ re: 1, im: -1 },
				{ re: 0, im: 2 },
				{ re: -1, im: 0 },
			]
			const full = convolutionComplexMemo(a, b, { mode: 'full' })
			assert.equal(full.length, 6)

			const same = convolutionComplexMemo(a, b, { mode: 'same' })
			assert.equal(same.length, a.length)
			assert.deepEqual(same, full.slice(1, 5))

			const valid = convolutionComplexMemo(a, b, { mode: 'valid' })
			assert.equal(valid.length, 2)
			assert.deepEqual(valid, full.slice(2, 4))

			const circular = convolutionComplexMemo(a, b, { mode: 'circular' })
			assert.equal(circular.length, 4)
			const expectedCircular = [
				{ re: full[0].re + full[4].re, im: full[0].im + full[4].im },
				{ re: full[1].re + full[5].re, im: full[1].im + full[5].im },
				{ re: full[2].re, im: full[2].im },
				{ re: full[3].re, im: full[3].im },
			]
			assertComplexClose(circular, expectedCircular)
		})

		it('satisfies commutativity and linearity', () => {
			const a = [
				{ re: 1.5, im: -0.5 },
				{ re: -2, im: 3.25 },
				{ re: 0.75, im: 1.25 },
			]
			const b = [
				{ re: -1, im: 2 },
				{ re: 4.5, im: -1.5 },
			]
			const ab = convolutionComplexMemo(a, b)
			const ba = convolutionComplexMemo(b, a)
			assertComplexClose(ab, ba)
		})
	})

	describe('edge cases', () => {
		it('returns empty array when either input is empty', () => {
			assert.deepEqual(convolutionComplexMemo([], [{ re: 1, im: 2 }]), [])
			assert.deepEqual(convolutionComplexMemo([{ re: 1, im: 2 }], []), [])
			assert.deepEqual(convolutionComplexMemo([], []), [])
		})

		it('handles single-element sequences and impulse identity', () => {
			const impulse = [{ re: 1, im: 0 }]
			const seq = [
				{ re: -3.5, im: 2.5 },
				{ re: 0, im: 0 },
				{ re: 7, im: -1 },
			]
			assert.deepEqual(convolutionComplexMemo(seq, impulse), seq)
			assert.deepEqual(convolutionComplexMemo(impulse, seq), seq)
			assert.deepEqual(
				convolutionComplexMemo([{ re: 3, im: 4 }], [{ re: 3, im: -4 }]),
				[{ re: 25, im: 0 }],
			)
		})

		it('normalizes negative zero outputs to positive zero', () => {
			const res = convolutionComplexMemo([{ re: -0, im: 0 }], [{ re: 1, im: -0 }])
			assert.equal(Object.is(res[0].re, 0), true)
			assert.equal(Object.is(res[0].im, 0), true)
		})

		it('handles valid mode when first sequence is shorter than second', () => {
			const a = [{ re: 1, im: 1 }, { re: 2, im: -1 }]
			const b = [
				{ re: 1, im: 0 },
				{ re: 0, im: 1 },
				{ re: -1, im: 0 },
				{ re: 0, im: -1 },
			]
			const full = convolutionComplexMemo(a, b, { mode: 'full' })
			const valid = convolutionComplexMemo(a, b, { mode: 'valid' })
			assert.equal(valid.length, 3)
			assert.deepEqual(valid, full.slice(1, 4))
		})
	})

	describe('invalid inputs', () => {
		it('rejects non-array inputs with TypeError', () => {
			assert.throws(() => convolutionComplexMemo(null, []), TypeError)
			assert.throws(() => convolutionComplexMemo([], undefined), TypeError)
			assert.throws(() => convolutionComplexMemo('123', [{ re: 1, im: 0 }]), TypeError)
			assert.throws(() => convolutionComplexMemo({ re: 1, im: 0 }, []), TypeError)
		})

		it('rejects malformed complex elements with TypeError or RangeError', () => {
			assert.throws(() => convolutionComplexMemo([null], [{ re: 1, im: 0 }]), TypeError)
			assert.throws(() => convolutionComplexMemo([[1, 2]], [{ re: 1, im: 0 }]), TypeError)
			assert.throws(() => convolutionComplexMemo([{ re: '1', im: 0 }], [{ re: 1, im: 0 }]), TypeError)
			assert.throws(() => convolutionComplexMemo([{ re: 1 }], [{ re: 1, im: 0 }]), TypeError)
			assert.throws(() => convolutionComplexMemo([{ re: NaN, im: 0 }], [{ re: 1, im: 0 }]), RangeError)
			assert.throws(() => convolutionComplexMemo([{ re: 1, im: Infinity }], [{ re: 1, im: 0 }]), RangeError)
			assert.throws(() => convolutionComplexMemo([{ re: 1, im: 0 }], [{ re: -Infinity, im: 0 }]), RangeError)
		})

		it('rejects invalid options with TypeError or RangeError', () => {
			const seq = [{ re: 1, im: 0 }]
			assert.throws(() => convolutionComplexMemo(seq, seq, null), TypeError)
			assert.throws(() => convolutionComplexMemo(seq, seq, []), TypeError)
			assert.throws(() => convolutionComplexMemo(seq, seq, { mode: 123 }), TypeError)
			assert.throws(() => convolutionComplexMemo(seq, seq, { mode: 'invalid' }), RangeError)
			assert.throws(() => convolutionComplexMemo(seq, seq, { algorithm: 42 }), TypeError)
			assert.throws(() => convolutionComplexMemo(seq, seq, { algorithm: 'karatsuba' }), RangeError)
			assert.throws(() => convolutionComplexMemo(seq, seq, { useCache: 'yes' }), TypeError)
			assert.throws(() => convolutionComplexMemo(seq, seq, { maxCacheSize: '10' }), TypeError)
			assert.throws(() => convolutionComplexMemo(seq, seq, { maxCacheSize: -1 }), RangeError)
			assert.throws(() => convolutionComplexMemo(seq, seq, { maxCacheSize: 1.5 }), RangeError)
		})
	})

	describe('memoization and precomputed table behavior', () => {
		it('pre-seeds small power-of-2 FFT tables and lazily caches larger sizes', () => {
			const initial = convolutionComplexMemo.getCacheStats()
			assert.deepEqual(initial.tableSizes, [1, 2, 4, 8, 16, 32, 64])

			// Convolving two 40-element sequences yields length 79 -> next power of 2 is 128
			const a = Array.from({ length: 40 }, (_, i) => ({ re: Math.sin(i), im: Math.cos(i) }))
			const b = Array.from({ length: 40 }, (_, i) => ({ re: i * 0.1, im: -i * 0.05 }))
			convolutionComplexMemo(a, b)

			const after = convolutionComplexMemo.getCacheStats()
			assert.ok(after.tableSizes.includes(128))
		})

		it('records cache misses and hits and protects cached data from caller mutation', () => {
			const a = [{ re: 2, im: -3 }, { re: 4, im: 1 }]
			const b = [{ re: -1, im: 5 }, { re: 3, im: 2 }]

			const first = convolutionComplexMemo(a, b)
			assert.deepEqual(convolutionComplexMemo.getCacheStats(), {
				hits: 0,
				misses: 1,
				size: 1,
				tableSizes: [1, 2, 4, 8, 16, 32, 64],
			})

			// Mutate returned array and element
			const originalFirst0 = { ...first[0] }
			first[0].re = 999999
			first.push({ re: 123, im: 456 })

			const second = convolutionComplexMemo(a, b)
			assert.equal(convolutionComplexMemo.getCacheStats().hits, 1)
			assert.equal(convolutionComplexMemo.getCacheStats().misses, 1)
			assert.equal(second.length, 3)
			assert.deepEqual(second[0], originalFirst0)
		})

		it('respects useCache: false and bounded LRU maxCacheSize eviction', () => {
			const a1 = [{ re: 1, im: 0 }]
			const a2 = [{ re: 2, im: 0 }]
			const a3 = [{ re: 3, im: 0 }]
			const b = [{ re: 1, im: 1 }]

			convolutionComplexMemo(a1, b, { useCache: false })
			assert.equal(convolutionComplexMemo.getCacheStats().size, 0)
			assert.equal(convolutionComplexMemo.getCacheStats().misses, 0)

			convolutionComplexMemo(a1, b, { maxCacheSize: 2 })
			convolutionComplexMemo(a2, b, { maxCacheSize: 2 })
			// Touch a1 to make a2 the least recently used
			convolutionComplexMemo(a1, b, { maxCacheSize: 2 })
			assert.equal(convolutionComplexMemo.getCacheStats().hits, 1)

			// Inserting a3 evicts a2, keeping a1 and a3
			convolutionComplexMemo(a3, b, { maxCacheSize: 2 })
			assert.equal(convolutionComplexMemo.getCacheStats().size, 2)

			// a1 should still be a cache hit
			const hitsBeforeA1 = convolutionComplexMemo.getCacheStats().hits
			convolutionComplexMemo(a1, b, { maxCacheSize: 2 })
			assert.equal(convolutionComplexMemo.getCacheStats().hits, hitsBeforeA1 + 1)

			// a2 should have been evicted (miss)
			const missesBeforeA2 = convolutionComplexMemo.getCacheStats().misses
			convolutionComplexMemo(a2, b, { maxCacheSize: 2 })
			assert.equal(convolutionComplexMemo.getCacheStats().misses, missesBeforeA2 + 1)
		})
	})

	describe('independent cross-checks', () => {
		it('matches independent naive O(M*N) convolution across auto, direct, and FFT paths', () => {
			// Deterministic pseudo-random complex sequences large enough to trigger FFT (> 64 products)
			const a = Array.from({ length: 37 }, (_, i) => ({
				re: Math.sin(i * 1.37) * 5,
				im: Math.cos(i * 0.83) * 5,
			}))
			const b = Array.from({ length: 29 }, (_, j) => ({
				re: Math.cos(j * 1.11) * 4,
				im: Math.sin(j * 0.67) * 4,
			}))

			const expected = naiveComplexConvolve(a, b)
			const viaAuto = convolutionComplexMemo(a, b)
			const viaDirect = convolutionComplexMemo(a, b, { algorithm: 'direct' })
			const viaFft = convolutionComplexMemo(a, b, { algorithm: 'fft' })

			assertComplexClose(viaAuto, expected, 1e-9)
			assertComplexClose(viaDirect, expected, 1e-12)
			assertComplexClose(viaFft, expected, 1e-9)
		})

		it('satisfies polynomial multiplication identity (A*B)(z) === A(z) * B(z) at complex points', () => {
			const a = Array.from({ length: 19 }, (_, i) => ({
				re: ((i * 7) % 11) - 5,
				im: ((i * 3) % 9) - 4,
			}))
			const b = Array.from({ length: 15 }, (_, j) => ({
				re: ((j * 5) % 7) - 3,
				im: ((j * 2) % 11) - 5,
			}))

			const conv = convolutionComplexMemo(a, b, { algorithm: 'fft' })

			// Test at points on and near the unit circle
			const testPoints = [
				{ re: 1, im: 0 },
				{ re: 0, im: 1 },
				{ re: Math.SQRT1_2, im: -Math.SQRT1_2 },
				{ re: 0.6, im: 0.8 },
			]

			for (const z of testPoints) {
				const az = evalComplexPoly(a, z)
				const bz = evalComplexPoly(b, z)
				const prod = {
					re: az.re * bz.re - az.im * bz.im,
					im: az.re * bz.im + az.im * bz.re,
				}
				const convZ = evalComplexPoly(conv, z)
				assertComplexClose([convZ], [prod], 1e-8)
			}
		})
	})
})
