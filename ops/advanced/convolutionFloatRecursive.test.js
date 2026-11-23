import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { convolutionFloatRecursive } from './convolutionFloatRecursive.js'

/**
 * Independent iterative O(n * m) reference implementation of 1D discrete linear convolution.
 */
function referenceConvolution(a, b) {
	if (a.length === 0 || b.length === 0) return []
	const out = new Array(a.length + b.length - 1).fill(0)
	for (let i = 0; i < a.length; i++) {
		for (let j = 0; j < b.length; j++) {
			out[i + j] += a[i] * b[j]
		}
	}
	return out.map((v) => (v === 0 ? 0 : v))
}

/**
 * Independent Discrete Fourier Transform (direct O(N^2) definition) for Convolution Theorem cross-check.
 */
function dft(signal, n) {
	const re = new Array(n).fill(0)
	const im = new Array(n).fill(0)
	const twoPiOverN = (2 * Math.PI) / n
	for (let k = 0; k < n; k++) {
		let sumRe = 0
		let sumIm = 0
		for (let t = 0; t < signal.length; t++) {
			const angle = -twoPiOverN * k * t
			sumRe += signal[t] * Math.cos(angle)
			sumIm += signal[t] * Math.sin(angle)
		}
		re[k] = sumRe
		im[k] = sumIm
	}
	return { re, im }
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible fuzz / cross-check tests.
 */
function createRng(seed) {
	let state = seed >>> 0
	return () => {
		state = (state + 0x6d2b79f5) >>> 0
		let t = Math.imul(state ^ (state >>> 15), 1 | state)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

function assertArrayClose(actual, expected, relTol = 1e-12, absTol = 1e-12) {
	assert.strictEqual(actual.length, expected.length, `Length mismatch: ${actual.length} vs ${expected.length}`)
	for (let i = 0; i < expected.length; i++) {
		const diff = Math.abs(actual[i] - expected[i])
		const limit = Math.max(absTol, relTol * Math.max(Math.abs(actual[i]), Math.abs(expected[i])))
		assert.ok(
			diff <= limit,
			`Mismatch at index ${i}: actual=${actual[i]}, expected=${expected[i]}, diff=${diff}, limit=${limit}`
		)
	}
}

describe('convolutionFloatRecursive', () => {
	describe('normal cases', () => {
		it('convolves small integer-valued float64 arrays exactly', () => {
			assert.deepStrictEqual(convolutionFloatRecursive([1, 2, 3], [4, 5]), [4, 13, 22, 15])
			assert.deepStrictEqual(convolutionFloatRecursive([1, 1], [1, 1]), [1, 2, 1])
			assert.deepStrictEqual(convolutionFloatRecursive([1, 2, 1], [1, 2, 1]), [1, 4, 6, 4, 1])
		})

		it('convolves fractional and negative float64 numbers accurately', () => {
			const a = [0.5, -1.25, 2.5]
			const b = [0.25, 4.0, -0.5]
			const expected = [0.125, 1.6875, -4.625, 10.625, -1.25]
			assertArrayClose(convolutionFloatRecursive(a, b), expected, 1e-15, 1e-15)
		})

		it('handles asymmetric lengths in both orders identically', () => {
			const shortSeq = [1.5, -2.0, 0.75]
			const longSeq = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]
			const ab = convolutionFloatRecursive(shortSeq, longSeq)
			const ba = convolutionFloatRecursive(longSeq, shortSeq)
			assert.strictEqual(ab.length, shortSeq.length + longSeq.length - 1)
			assertArrayClose(ab, ba, 1e-14, 1e-14)
		})

		it('acts as identity for unit impulse and shifts for delayed impulse', () => {
			const signal = [3.14, -2.71, 0, 1.618, 42.5]
			assert.deepStrictEqual(convolutionFloatRecursive(signal, [1]), signal)
			assert.deepStrictEqual(convolutionFloatRecursive([1], signal), signal)
			assert.deepStrictEqual(convolutionFloatRecursive(signal, [0, 0, 1]), [0, 0, ...signal])
		})

		it('computes smoothing kernel convolution correctly', () => {
			const signal = [0, 0, 4, 4, 4, 0, 0]
			const kernel = [0.25, 0.5, 0.25]
			assert.deepStrictEqual(convolutionFloatRecursive(signal, kernel), [0, 0, 1, 3, 4, 3, 1, 0, 0])
		})
	})

	describe('edge cases', () => {
		it('returns empty array when either or both inputs are empty', () => {
			assert.deepStrictEqual(convolutionFloatRecursive([], []), [])
			assert.deepStrictEqual(convolutionFloatRecursive([], [1, 2, 3]), [])
			assert.deepStrictEqual(convolutionFloatRecursive([1, 2, 3], []), [])
		})

		it('handles single-element arrays', () => {
			assert.deepStrictEqual(convolutionFloatRecursive([3.5], [2.0]), [7.0])
			assert.deepStrictEqual(convolutionFloatRecursive([-0.5], [0.25]), [-0.125])
		})

		it('normalizes negative zero to +0', () => {
			const res1 = convolutionFloatRecursive([-0], [1, -2])
			for (const v of res1) {
				assert.ok(Object.is(v, 0), `Expected +0, got ${Object.is(v, -0) ? '-0' : v}`)
			}
			const res2 = convolutionFloatRecursive([-1, 0], [0, -1])
			assert.ok(Object.is(res2[0], 0))
			assert.strictEqual(res2[1], 1)
			assert.ok(Object.is(res2[2], 0))
		})

		it('avoids catastrophic cancellation on extreme dynamic ranges', () => {
			const res = convolutionFloatRecursive([1e16, 1], [1e16, 1])
			assert.deepStrictEqual(res, [1e32, 2e16, 1])
		})

		it('handles very small float64 values without spurious errors', () => {
			const res = convolutionFloatRecursive([1e-150, 2e-150], [3e-150, 4e-150])
			assertArrayClose(res, [3e-300, 1e-299, 8e-300], 1e-12, 0)
		})

		it('does not mutate input arrays', () => {
			const a = [1.5, 2.5, 3.5, 4.5]
			const b = [-1, 0.5, 2]
			const aCopy = [...a]
			const bCopy = [...b]
			convolutionFloatRecursive(a, b)
			assert.deepStrictEqual(a, aCopy)
			assert.deepStrictEqual(b, bCopy)
		})

		it('handles odd, even, and power-of-two lengths consistently', () => {
			for (const lenA of [1, 2, 3, 4, 5, 7, 8, 9, 15, 16, 17]) {
				const a = Array.from({ length: lenA }, (_, i) => i + 1)
				const b = Array.from({ length: lenA + 1 }, (_, i) => (i % 2 === 0 ? 1 : -1))
				assert.deepStrictEqual(convolutionFloatRecursive(a, b), referenceConvolution(a, b))
			}
		})
	})

	describe('invalid inputs', () => {
		it('throws TypeError when arguments are not Arrays', () => {
			for (const bad of [null, undefined, 42, '123', {}, true, new Float64Array([1, 2])]) {
				assert.throws(() => convolutionFloatRecursive(bad, [1]), TypeError)
				assert.throws(() => convolutionFloatRecursive([1], bad), TypeError)
			}
		})

		it('throws TypeError when elements are not numbers', () => {
			for (const badElem of ['1', null, undefined, true, {}, [], 1n, Symbol('x')]) {
				assert.throws(() => convolutionFloatRecursive([1, badElem], [1]), TypeError)
				assert.throws(() => convolutionFloatRecursive([1], [badElem, 2]), TypeError)
			}
		})

		it('throws TypeError for sparse arrays', () => {
			// eslint-disable-next-line no-sparse-arrays
			const sparse = [1, , 3]
			assert.throws(() => convolutionFloatRecursive(sparse, [1, 2]), TypeError)
			assert.throws(() => convolutionFloatRecursive([1, 2], sparse), TypeError)
		})

		it('throws RangeError for non-finite numbers (NaN, Infinity, -Infinity)', () => {
			for (const badNum of [NaN, Infinity, -Infinity]) {
				assert.throws(() => convolutionFloatRecursive([1, badNum], [1, 2]), RangeError)
				assert.throws(() => convolutionFloatRecursive([1, 2], [badNum]), RangeError)
			}
		})

		it('still validates both arguments even when one array is empty', () => {
			assert.throws(() => convolutionFloatRecursive([], [NaN]), RangeError)
			assert.throws(() => convolutionFloatRecursive([Infinity], []), RangeError)
			assert.throws(() => convolutionFloatRecursive([], 'not-an-array'), TypeError)
			assert.throws(() => convolutionFloatRecursive(null, []), TypeError)
		})
	})

	describe('independent cross-checks', () => {
		it('matches independent O(n*m) reference across randomized float64 signals', () => {
			const rng = createRng(0x5eed1234)
			const pairs = [
				[5, 5],
				[13, 29],
				[32, 32],
				[64, 17],
				[19, 63],
				[100, 75]
			]
			for (const [n, m] of pairs) {
				const a = Array.from({ length: n }, () => (rng() - 0.5) * 200)
				const b = Array.from({ length: m }, () => (rng() - 0.5) * 200)
				const actual = convolutionFloatRecursive(a, b)
				const expected = referenceConvolution(a, b)
				assertArrayClose(actual, expected, 1e-12, 1e-11)
			}
		})

		it('satisfies the Discrete Convolution Theorem against an independent DFT', () => {
			const rng = createRng(0xabcdef01)
			const a = Array.from({ length: 23 }, () => (rng() - 0.5) * 20)
			const b = Array.from({ length: 19 }, () => (rng() - 0.5) * 20)
			const conv = convolutionFloatRecursive(a, b)
			const n = conv.length

			const dftA = dft(a, n)
			const dftB = dft(b, n)
			const dftConv = dft(conv, n)

			for (let k = 0; k < n; k++) {
				// Complex product: DFT(a)[k] * DFT(b)[k]
				const prodRe = dftA.re[k] * dftB.re[k] - dftA.im[k] * dftB.im[k]
				const prodIm = dftA.re[k] * dftB.im[k] + dftA.im[k] * dftB.re[k]
				assert.ok(
					Math.abs(dftConv.re[k] - prodRe) < 1e-9,
					`DFT real mismatch at bin ${k}: ${dftConv.re[k]} vs ${prodRe}`
				)
				assert.ok(
					Math.abs(dftConv.im[k] - prodIm) < 1e-9,
					`DFT imag mismatch at bin ${k}: ${dftConv.im[k]} vs ${prodIm}`
				)
			}
		})

		it('satisfies algebraic laws: associativity, distributivity, and polynomial evaluation', () => {
			const rng = createRng(0x13579bdf)
			const a = Array.from({ length: 11 }, () => (rng() - 0.5) * 10)
			const b = Array.from({ length: 13 }, () => (rng() - 0.5) * 10)
			const c = Array.from({ length: 13 }, () => (rng() - 0.5) * 10)

			// Associativity: (a * b) * c === a * (b * c)
			const lhsAssoc = convolutionFloatRecursive(convolutionFloatRecursive(a, b), c)
			const rhsAssoc = convolutionFloatRecursive(a, convolutionFloatRecursive(b, c))
			assertArrayClose(lhsAssoc, rhsAssoc, 1e-12, 1e-11)

			// Distributivity: a * (b + c) === (a * b) + (a * c)
			const bPlusC = b.map((v, i) => v + c[i])
			const lhsDist = convolutionFloatRecursive(a, bPlusC)
			const ab = convolutionFloatRecursive(a, b)
			const ac = convolutionFloatRecursive(a, c)
			const rhsDist = ab.map((v, i) => v + ac[i])
			assertArrayClose(lhsDist, rhsDist, 1e-12, 1e-11)

			// Polynomial evaluation: P_{a*b}(x) === P_a(x) * P_b(x)
			const evalPoly = (coeffs, x) => {
				let acc = 0
				for (let i = coeffs.length - 1; i >= 0; i--) {
					acc = acc * x + coeffs[i]
				}
				return acc
			}
			for (const x of [-1, -0.5, 0, 0.5, 1, 1.25]) {
				const lhsVal = evalPoly(ab, x)
				const rhsVal = evalPoly(a, x) * evalPoly(b, x)
				const tol = Math.max(1e-11, 1e-12 * Math.abs(rhsVal))
				assert.ok(Math.abs(lhsVal - rhsVal) <= tol, `Poly eval mismatch at x=${x}: ${lhsVal} vs ${rhsVal}`)
			}
		})
	})
})
