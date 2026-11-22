import { describe, test } from 'node:test'
import assert from 'node:assert'
import { convolutionTypedIterative } from './convolutionTypedIterative.js'

function assertFloat64ArrayClose(actual, expected, tolerance = 1e-12) {
	assert.ok(actual instanceof Float64Array, 'expected result to be a Float64Array')
	assert.strictEqual(
		actual.length,
		expected.length,
		`length mismatch: actual ${actual.length} !== expected ${expected.length}`
	)
	for (let i = 0; i < expected.length; i++) {
		const diff = Math.abs(actual[i] - expected[i])
		assert.ok(
			diff <= tolerance,
			`index ${i}: actual ${actual[i]} differs from expected ${expected[i]} by ${diff} (> ${tolerance})`
		)
	}
}

/**
 * Independent direct Toeplitz matrix-vector product for full linear convolution.
 */
function toeplitzConvolveFull(signal, kernel) {
	const n = signal.length
	const m = kernel.length
	const rows = n + m - 1
	const result = new Float64Array(rows)

	for (let r = 0; r < rows; r++) {
		let acc = 0
		for (let c = 0; c < n; c++) {
			const kIdx = r - c
			if (kIdx >= 0 && kIdx < m) {
				acc += kernel[kIdx] * signal[c]
			}
		}
		result[r] = acc
	}

	return result
}

/**
 * Independent DFT-based linear convolution via the convolution theorem.
 */
function dftConvolveFull(signal, kernel) {
	const n = signal.length
	const m = kernel.length
	const L = n + m - 1

	const dft = (arr) => {
		const re = new Float64Array(L)
		const im = new Float64Array(L)
		for (let k = 0; k < L; k++) {
			let sumRe = 0
			let sumIm = 0
			for (let t = 0; t < arr.length; t++) {
				const angle = (-2 * Math.PI * k * t) / L
				sumRe += arr[t] * Math.cos(angle)
				sumIm += arr[t] * Math.sin(angle)
			}
			re[k] = sumRe
			im[k] = sumIm
		}
		return { re, im }
	}

	const S = dft(signal)
	const K = dft(kernel)

	const prodRe = new Float64Array(L)
	const prodIm = new Float64Array(L)
	for (let k = 0; k < L; k++) {
		prodRe[k] = S.re[k] * K.re[k] - S.im[k] * K.im[k]
		prodIm[k] = S.re[k] * K.im[k] + S.im[k] * K.re[k]
	}

	const outRe = new Float64Array(L)
	const outIm = new Float64Array(L)
	for (let t = 0; t < L; t++) {
		let sumRe = 0
		let sumIm = 0
		for (let k = 0; k < L; k++) {
			const angle = (2 * Math.PI * k * t) / L
			const cos = Math.cos(angle)
			const sin = Math.sin(angle)
			sumRe += prodRe[k] * cos - prodIm[k] * sin
			sumIm += prodRe[k] * sin + prodIm[k] * cos
		}
		outRe[t] = sumRe / L
		outIm[t] = sumIm / L
	}

	return { re: outRe, im: outIm }
}

describe('convolutionTypedIterative', () => {
	describe('normal cases', () => {
		test('full mode (default and explicit) on basic sequences', () => {
			const signal = new Float64Array([1, 2, 3])
			const kernel = new Float64Array([4, 5])
			const expected = new Float64Array([4, 13, 22, 15])

			const defaultResult = convolutionTypedIterative(signal, kernel)
			const explicitResult = convolutionTypedIterative(signal, kernel, 'full')

			assertFloat64ArrayClose(defaultResult, expected)
			assertFloat64ArrayClose(explicitResult, expected)
		})

		test('handles negative and fractional floating-point values', () => {
			const signal = new Float64Array([1.5, -2.0, 0.5, 4.0])
			const kernel = new Float64Array([-0.5, 2.0, -1.0])
			const expected = new Float64Array([-0.75, 4.0, -5.75, 1.0, 7.5, -4.0])

			const result = convolutionTypedIterative(signal, kernel, 'full')
			assertFloat64ArrayClose(result, expected)
		})

		test('same mode with odd-length and even-length kernels', () => {
			const signal = new Float64Array([1, 2, 3, 4])

			const oddKernel = new Float64Array([0.25, 0.5, 0.25])
			assertFloat64ArrayClose(
				convolutionTypedIterative(signal, oddKernel, 'same'),
				new Float64Array([1, 2, 3, 2.75])
			)

			const evenKernel = new Float64Array([1, 2])
			assertFloat64ArrayClose(
				convolutionTypedIterative(signal, evenKernel, 'same'),
				new Float64Array([1, 4, 7, 10])
			)

			const fourKernel = new Float64Array([1, 2, 3, 4])
			// Full is [1, 4, 10, 20, 25, 24, 16], offset = floor((4-1)/2) = 1 -> [4, 10, 20, 25]
			assertFloat64ArrayClose(
				convolutionTypedIterative(signal, fourKernel, 'same'),
				new Float64Array([4, 10, 20, 25])
			)
		})

		test('same mode when signal is shorter than kernel returns signal.length samples', () => {
			const signal = new Float64Array([2, 3])
			const kernel = new Float64Array([1, 10, 100, 1000, 10000])
			// Full is [2, 23, 230, 2300, 23000, 30000], offset = floor(4/2) = 2 -> [230, 2300]
			const result = convolutionTypedIterative(signal, kernel, 'same')
			assertFloat64ArrayClose(result, new Float64Array([230, 2300]))
		})

		test('valid mode when signal >= kernel and when signal < kernel', () => {
			const signal = new Float64Array([1, 2, 3, 4, 5])
			const kernel = new Float64Array([1, 0, -1])
			// Full: [1, 2, 2, 2, 2, -4, -5], valid starts at offset 2 with len 3 -> [2, 2, 2]
			assertFloat64ArrayClose(
				convolutionTypedIterative(signal, kernel, 'valid'),
				new Float64Array([2, 2, 2])
			)

			// Equal length: single dot product with reversed kernel
			const equalA = new Float64Array([2, 3, 4])
			const equalB = new Float64Array([5, 6, 7])
			// 2*7 + 3*6 + 4*5 = 14 + 18 + 20 = 52
			assertFloat64ArrayClose(
				convolutionTypedIterative(equalA, equalB, 'valid'),
				new Float64Array([52])
			)

			// Shorter signal than kernel produces empty Float64Array
			const shortSignal = new Float64Array([1, 2])
			const longKernel = new Float64Array([1, 2, 3])
			const emptyValid = convolutionTypedIterative(shortSignal, longKernel, 'valid')
			assert.ok(emptyValid instanceof Float64Array)
			assert.strictEqual(emptyValid.length, 0)
		})

		test('does not mutate inputs and returns a fresh Float64Array', () => {
			const signal = new Float64Array([1, 2, 3])
			const kernel = new Float64Array([1])
			const signalCopy = new Float64Array(signal)
			const kernelCopy = new Float64Array(kernel)

			const result = convolutionTypedIterative(signal, kernel, 'same')
			assert.notStrictEqual(result, signal)
			assert.notStrictEqual(result, kernel)
			assert.deepStrictEqual(signal, signalCopy)
			assert.deepStrictEqual(kernel, kernelCopy)
		})
	})

	describe('edge cases', () => {
		test('empty arrays return empty Float64Array across all modes', () => {
			const empty = new Float64Array(0)
			const nonEmpty = new Float64Array([1, 2, 3])

			for (const mode of ['full', 'same', 'valid']) {
				for (const [s, k] of [
					[empty, nonEmpty],
					[nonEmpty, empty],
					[empty, empty]
				]) {
					const res = convolutionTypedIterative(s, k, mode)
					assert.ok(res instanceof Float64Array)
					assert.strictEqual(res.length, 0)
				}
			}
		})

		test('length-1 inputs behave as scalar multiplication', () => {
			assertFloat64ArrayClose(
				convolutionTypedIterative(new Float64Array([3.5]), new Float64Array([-2]), 'full'),
				new Float64Array([-7])
			)
			assertFloat64ArrayClose(
				convolutionTypedIterative(new Float64Array([3.5]), new Float64Array([-2]), 'same'),
				new Float64Array([-7])
			)
			assertFloat64ArrayClose(
				convolutionTypedIterative(new Float64Array([3.5]), new Float64Array([-2]), 'valid'),
				new Float64Array([-7])
			)
			assertFloat64ArrayClose(
				convolutionTypedIterative(new Float64Array([5]), new Float64Array([2, 3, 4]), 'full'),
				new Float64Array([10, 15, 20])
			)
			assertFloat64ArrayClose(
				convolutionTypedIterative(new Float64Array([2, 3, 4]), new Float64Array([5]), 'full'),
				new Float64Array([10, 15, 20])
			)
		})

		test('delta impulse kernels preserve or shift the signal', () => {
			const signal = new Float64Array([-3.5, 0, 7.25, 1.5, -2])
			const unitDelta = new Float64Array([1])

			for (const mode of ['full', 'same', 'valid']) {
				assertFloat64ArrayClose(convolutionTypedIterative(signal, unitDelta, mode), signal)
			}

			// Centered odd-length delta preserves signal in 'same' mode
			const centeredDelta = new Float64Array([0, 0, 1, 0, 0])
			assertFloat64ArrayClose(convolutionTypedIterative(signal, centeredDelta, 'same'), signal)

			// Delayed impulse shifts signal right by delay samples in 'full' mode
			const delayedDelta = new Float64Array([0, 0, 1, 0])
			assertFloat64ArrayClose(
				convolutionTypedIterative(signal, delayedDelta, 'full'),
				new Float64Array([0, 0, -3.5, 0, 7.25, 1.5, -2, 0])
			)
		})

		test('zero arrays produce all-zero Float64Arrays of expected length', () => {
			const zeros = new Float64Array([0, 0, 0])
			const seq = new Float64Array([4, -5, 6, -7])

			assertFloat64ArrayClose(
				convolutionTypedIterative(seq, zeros, 'full'),
				new Float64Array(6)
			)
			assertFloat64ArrayClose(
				convolutionTypedIterative(zeros, seq, 'same'),
				new Float64Array(3)
			)
		})

		test('works correctly on Float64Array subarray views with non-zero byteOffset', () => {
			const buffer = new Float64Array([99, 1, 2, 3, 88, 4, 5, 77])
			const signal = buffer.subarray(1, 4)
			const kernel = buffer.subarray(5, 7)

			assertFloat64ArrayClose(
				convolutionTypedIterative(signal, kernel, 'full'),
				new Float64Array([4, 13, 22, 15])
			)
		})
	})

	describe('input validation', () => {
		test('rejects non-Float64Array inputs with TypeError', () => {
			const valid = new Float64Array([1, 2, 3])
			const invalidInputs = [
				[1, 2, 3],
				new Float32Array([1, 2, 3]),
				new Int32Array([1, 2, 3]),
				null,
				undefined,
				42,
				'123',
				{ length: 2, 0: 1, 1: 2 }
			]

			for (const bad of invalidInputs) {
				assert.throws(() => convolutionTypedIterative(bad, valid), TypeError)
				assert.throws(() => convolutionTypedIterative(valid, bad), TypeError)
			}
		})

		test('rejects invalid modes with TypeError (non-string) or RangeError (unknown string)', () => {
			const a = new Float64Array([1, 2])
			const b = new Float64Array([3, 4])

			for (const nonString of [null, 123, true, {}, []]) {
				assert.throws(() => convolutionTypedIterative(a, b, nonString), TypeError)
			}

			for (const badMode of ['', 'FULL', 'circular', 'exact', ' full']) {
				assert.throws(() => convolutionTypedIterative(a, b, badMode), RangeError)
			}
		})

		test('rejects non-finite numbers (NaN, Infinity, -Infinity) with RangeError', () => {
			const valid = new Float64Array([1, 2, 3])
			const empty = new Float64Array(0)

			for (const nonFinite of [NaN, Infinity, -Infinity]) {
				const badArr = new Float64Array([1, nonFinite, 3])
				assert.throws(() => convolutionTypedIterative(badArr, valid), RangeError)
				assert.throws(() => convolutionTypedIterative(valid, badArr), RangeError)
				// Must still validate even when the other operand is empty
				assert.throws(() => convolutionTypedIterative(badArr, empty), RangeError)
				assert.throws(() => convolutionTypedIterative(empty, badArr), RangeError)
			}
		})
	})

	describe('independent cross-checks and algebraic identities', () => {
		test('polynomial multiplication identity: sum(conv(a, b)) === sum(a) * sum(b) and P_c(x) === P_a(x) * P_b(x)', () => {
			const a = new Float64Array([1.25, -3.5, 2.0, 0.75, -1.5, 4.25])
			const b = new Float64Array([-0.5, 2.5, -1.25, 3.0])
			const c = convolutionTypedIterative(a, b, 'full')

			const sum = (arr) => arr.reduce((acc, v) => acc + v, 0)
			assert.ok(Math.abs(sum(c) - sum(a) * sum(b)) < 1e-12)

			const evalPoly = (coeffs, x) => {
				let acc = 0
				let pow = 1
				for (let i = 0; i < coeffs.length; i++) {
					acc += coeffs[i] * pow
					pow *= x
				}
				return acc
			}

			for (const x of [-2, -0.5, 0, 0.75, 1, 2.5]) {
				const lhs = evalPoly(c, x)
				const rhs = evalPoly(a, x) * evalPoly(b, x)
				assert.ok(
					Math.abs(lhs - rhs) < 1e-9,
					`polynomial identity failed at x=${x}: ${lhs} !== ${rhs}`
				)
			}
		})

		test('commutativity, associativity, and distributivity in full mode', () => {
			const a = new Float64Array([1.5, -2.25, 0.75, 3.0])
			const b = new Float64Array([-1.0, 0.5, 2.5])
			const c = new Float64Array([2.0, -0.5, 1.25])

			// Commutativity: a * b == b * a
			assertFloat64ArrayClose(
				convolutionTypedIterative(a, b, 'full'),
				convolutionTypedIterative(b, a, 'full')
			)

			// Associativity: (a * b) * c == a * (b * c)
			assertFloat64ArrayClose(
				convolutionTypedIterative(convolutionTypedIterative(a, b, 'full'), c, 'full'),
				convolutionTypedIterative(a, convolutionTypedIterative(b, c, 'full'), 'full')
			)

			// Distributivity: a * (b + c) == (a * b) + (a * c)
			const bPlusC = new Float64Array(b.length)
			for (let i = 0; i < b.length; i++) bPlusC[i] = b[i] + c[i]
			const ab = convolutionTypedIterative(a, b, 'full')
			const ac = convolutionTypedIterative(a, c, 'full')
			const abPlusAc = new Float64Array(ab.length)
			for (let i = 0; i < ab.length; i++) abPlusAc[i] = ab[i] + ac[i]

			assertFloat64ArrayClose(convolutionTypedIterative(a, bPlusC, 'full'), abPlusAc)
		})

		test('matches independent Toeplitz matrix-vector product across all modes', () => {
			const signal = new Float64Array([0.5, -1.2, 3.4, 2.1, -0.8, 4.5, -2.3, 1.1])
			const kernel = new Float64Array([-0.7, 1.3, -2.4, 0.9, 1.6])

			const fullRef = toeplitzConvolveFull(signal, kernel)
			const sameStart = Math.floor((kernel.length - 1) / 2)
			const sameRef = fullRef.subarray(sameStart, sameStart + signal.length)
			const validRef = fullRef.subarray(kernel.length - 1, signal.length)

			assertFloat64ArrayClose(convolutionTypedIterative(signal, kernel, 'full'), fullRef)
			assertFloat64ArrayClose(convolutionTypedIterative(signal, kernel, 'same'), sameRef)
			assertFloat64ArrayClose(convolutionTypedIterative(signal, kernel, 'valid'), validRef)
		})

		test('matches convolution theorem via independent DFT / IDFT', () => {
			const signal = new Float64Array([1.1, -2.3, 0.7, 4.2, -1.5, 2.8, -0.4, 3.6, -2.1])
			const kernel = new Float64Array([0.25, -0.8, 1.5, -0.35, 0.9, -1.2])

			const actual = convolutionTypedIterative(signal, kernel, 'full')
			const { re, im } = dftConvolveFull(signal, kernel)

			assertFloat64ArrayClose(actual, re, 1e-10)
			for (let i = 0; i < im.length; i++) {
				assert.ok(
					Math.abs(im[i]) < 1e-10,
					`expected negligible imaginary component at ${i}, got ${im[i]}`
				)
			}
		})
	})
})
