import { describe, test } from 'node:test'
import assert from 'node:assert'
import { fourierTransformComplexIterative } from './fourierTransformComplexIterative.js'

const EPS = 1e-10

function assertComplexClose(actual, expected, eps = EPS, label = '') {
	const prefix = label ? `${label}: ` : ''
	assert.ok(
		Math.abs(actual.re - expected.re) <= eps,
		`${prefix}real part mismatch: got ${actual.re}, expected ${expected.re}`
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= eps,
		`${prefix}imag part mismatch: got ${actual.im}, expected ${expected.im}`
	)
}

function assertSequenceClose(actual, expected, eps = EPS) {
	assert.strictEqual(actual.length, expected.length)
	for (let i = 0; i < expected.length; i++) {
		assertComplexClose(actual[i], expected[i], eps, `index ${i}`)
	}
}

function complexMul(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	}
}

function complexConj(z) {
	return { re: z.re, im: -z.im }
}

describe('fourierTransformComplexIterative', () => {
	describe('edge cases', () => {
		test('empty signal returns empty array', () => {
			assert.deepStrictEqual(fourierTransformComplexIterative([]), [])
			assert.deepStrictEqual(fourierTransformComplexIterative([], { inverse: true }), [])
		})

		test('single element signal is identity and returns a new object', () => {
			const input = [{ re: 3.5, im: -2.25 }]
			const out = fourierTransformComplexIterative(input)
			assert.deepStrictEqual(out, [{ re: 3.5, im: -2.25 }])
			assert.notStrictEqual(out, input)
			assert.notStrictEqual(out[0], input[0])

			const inv = fourierTransformComplexIterative(out, { inverse: true })
			assert.deepStrictEqual(inv, [{ re: 3.5, im: -2.25 }])
		})

		test('all-zero signal produces all-zero spectrum without negative zero', () => {
			const zeros = [
				{ re: 0, im: 0 },
				{ re: -0, im: 0 },
				{ re: 0, im: -0 },
			]
			const out = fourierTransformComplexIterative(zeros)
			for (const z of out) {
				assert.ok(Object.is(z.re, 0))
				assert.ok(Object.is(z.im, 0))
			}
		})

		test('does not mutate input signal or its elements', () => {
			const input = [
				{ re: 1, im: 2 },
				{ re: -3, im: 4 },
				{ re: 5, im: -6 },
			]
			const snapshot = structuredClone(input)
			fourierTransformComplexIterative(input)
			assert.deepStrictEqual(input, snapshot)
		})
	})

	describe('known analytical transforms', () => {
		test('unit impulse delta[0] produces constant spectrum of ones', () => {
			const signal = [
				{ re: 1, im: 0 },
				{ re: 0, im: 0 },
				{ re: 0, im: 0 },
				{ re: 0, im: 0 },
				{ re: 0, im: 0 },
			]
			const expected = Array.from({ length: 5 }, () => ({ re: 1, im: 0 }))
			assertSequenceClose(fourierTransformComplexIterative(signal), expected)
		})

		test('constant complex signal concentrates all energy at DC bin (k = 0)', () => {
			const c = { re: 2.5, im: -1.5 }
			const n = 6
			const signal = Array.from({ length: n }, () => ({ ...c }))
			const expected = [
				{ re: n * c.re, im: n * c.im },
				...Array.from({ length: n - 1 }, () => ({ re: 0, im: 0 })),
			]
			assertSequenceClose(fourierTransformComplexIterative(signal), expected)
		})

		test('known 4-point real sequence [1, 2, 3, 4]', () => {
			const signal = [
				{ re: 1, im: 0 },
				{ re: 2, im: 0 },
				{ re: 3, im: 0 },
				{ re: 4, im: 0 },
			]
			const expected = [
				{ re: 10, im: 0 },
				{ re: -2, im: 2 },
				{ re: -2, im: 0 },
				{ re: -2, im: -2 },
			]
			assertSequenceClose(fourierTransformComplexIterative(signal), expected)
		})

		test('known 4-point complex sequence', () => {
			const signal = [
				{ re: 1, im: 1 },
				{ re: 0, im: -1 },
				{ re: 2, im: 0 },
				{ re: -1, im: 2 },
			]
			// X[0] = (1+i) + (-i) + 2 + (-1+2i) = 2 + 2i
			// X[1] = (1+i) + (-i)(-i) + 2(-1) + (-1+2i)(i) = (1+i) - 1 - 2 + (-2-i) = -4 + 0i
			// X[2] = (1+i) - (-i) + 2 - (-1+2i) = 1+i + i + 2 + 1 - 2i = 4 + 0i
			// X[3] = (1+i) + (-i)(i) + 2(-1) + (-1+2i)(-i) = (1+i) + 1 - 2 + (2+i) = 2 + 2i
			const expected = [
				{ re: 2, im: 2 },
				{ re: -4, im: 0 },
				{ re: 4, im: 0 },
				{ re: 2, im: 2 },
			]
			assertSequenceClose(fourierTransformComplexIterative(signal), expected)
		})

		test('pure complex exponential e^(i * 2*pi * m * n / N) peaks at bin m', () => {
			const n = 7 // prime length
			const m = 3
			const signal = Array.from({ length: n }, (_, j) => ({
				re: Math.cos((2 * Math.PI * m * j) / n),
				im: Math.sin((2 * Math.PI * m * j) / n),
			}))
			const expected = Array.from({ length: n }, (_, k) => ({
				re: k === m ? n : 0,
				im: 0,
			}))
			assertSequenceClose(fourierTransformComplexIterative(signal), expected)
		})
	})

	describe('independent mathematical cross-checks', () => {
		test('Parseval theorem: time-domain energy equals (1/N) * frequency-domain energy', () => {
			const signal = [
				{ re: 1.5, im: -0.75 },
				{ re: -2.25, im: 3.1 },
				{ re: 0.4, im: 1.8 },
				{ re: 4.2, im: -2.6 },
				{ re: -1.1, im: -0.9 },
				{ re: 2.7, im: 0.5 },
				{ re: -3.3, im: 2.2 },
			]
			const spectrum = fourierTransformComplexIterative(signal)
			const timeEnergy = signal.reduce((acc, z) => acc + z.re * z.re + z.im * z.im, 0)
			const freqEnergy =
				spectrum.reduce((acc, z) => acc + z.re * z.re + z.im * z.im, 0) / signal.length

			assert.ok(
				Math.abs(timeEnergy - freqEnergy) <= EPS,
				`Parseval mismatch: time=${timeEnergy}, freq=${freqEnergy}`
			)
		})

		test('inverse DFT round-trip recovers original complex signal (power-of-2 and prime lengths)', () => {
			const lengths = [2, 3, 5, 8, 11]
			for (const n of lengths) {
				const signal = Array.from({ length: n }, (_, i) => ({
					re: Math.sin(i * 1.7 + 0.3) * 5,
					im: Math.cos(i * 2.3 - 0.8) * 4,
				}))
				const spectrum = fourierTransformComplexIterative(signal)
				const reconstructed = fourierTransformComplexIterative(spectrum, { inverse: true })
				assertSequenceClose(reconstructed, signal)
			}
		})

		test('conjugate identity cross-check: IDFT(X) == (1/N) * conj(DFT(conj(X)))', () => {
			const signal = [
				{ re: 2.1, im: -1.4 },
				{ re: -0.5, im: 3.7 },
				{ re: 4.0, im: 0.2 },
				{ re: -2.8, im: -1.9 },
				{ re: 1.3, im: 2.5 },
			]
			const spectrum = fourierTransformComplexIterative(signal)
			const conjSpectrum = spectrum.map(complexConj)
			const dftOfConj = fourierTransformComplexIterative(conjSpectrum)
			const recovered = dftOfConj.map((z) => ({
				re: z.re / signal.length,
				im: -z.im / signal.length,
			}))
			assertSequenceClose(recovered, signal)
		})

		test('linearity: DFT(a*x + b*y) == a*DFT(x) + b*DFT(y)', () => {
			const a = { re: 2.5, im: -1.2 }
			const b = { re: -0.8, im: 3.1 }
			const x = [
				{ re: 1, im: -2 },
				{ re: 3, im: 0.5 },
				{ re: -1.5, im: 4 },
				{ re: 0, im: -1 },
				{ re: 2.2, im: 1.7 },
			]
			const y = [
				{ re: -2, im: 1 },
				{ re: 0.5, im: -3 },
				{ re: 4, im: 2 },
				{ re: -1.1, im: 0.4 },
				{ re: 1.8, im: -2.6 },
			]

			const combined = x.map((xi, i) => {
				const axi = complexMul(a, xi)
				const byi = complexMul(b, y[i])
				return { re: axi.re + byi.re, im: axi.im + byi.im }
			})

			const lhs = fourierTransformComplexIterative(combined)
			const X = fourierTransformComplexIterative(x)
			const Y = fourierTransformComplexIterative(y)
			const rhs = X.map((Xk, k) => {
				const aXk = complexMul(a, Xk)
				const bYk = complexMul(b, Y[k])
				return { re: aXk.re + bYk.re, im: aXk.im + bYk.im }
			})

			assertSequenceClose(lhs, rhs)
		})

		test('circular convolution theorem: DFT(x (*) y) == DFT(x) * DFT(y)', () => {
			const x = [
				{ re: 1, im: 0.5 },
				{ re: -2, im: 1 },
				{ re: 0.5, im: -1.5 },
				{ re: 3, im: 2 },
				{ re: -1, im: 0 },
			]
			const y = [
				{ re: 2, im: -1 },
				{ re: 0, im: 1.5 },
				{ re: -1.5, im: 0.5 },
				{ re: 1, im: -2 },
				{ re: 2.5, im: 1 },
			]
			const n = x.length

			const conv = Array.from({ length: n }, (_, k) => {
				let sumRe = 0
				let sumIm = 0
				for (let j = 0; j < n; j++) {
					const prod = complexMul(x[j], y[(k - j + n) % n])
					sumRe += prod.re
					sumIm += prod.im
				}
				return { re: sumRe, im: sumIm }
			})

			const dftConv = fourierTransformComplexIterative(conv)
			const X = fourierTransformComplexIterative(x)
			const Y = fourierTransformComplexIterative(y)
			const pointwise = X.map((Xk, k) => complexMul(Xk, Y[k]))

			assertSequenceClose(dftConv, pointwise)
		})

		test('Hermitian symmetry holds for purely real signals', () => {
			const signal = [
				{ re: 3.2, im: 0 },
				{ re: -1.5, im: 0 },
				{ re: 0.7, im: 0 },
				{ re: 4.8, im: 0 },
				{ re: -2.1, im: 0 },
				{ re: 1.9, im: 0 },
			]
			const X = fourierTransformComplexIterative(signal)
			const n = signal.length
			for (let k = 1; k < n; k++) {
				assertComplexClose(X[n - k], complexConj(X[k]), EPS, `symmetry k=${k}`)
			}
		})
	})

	describe('input validation', () => {
		test('throws TypeError when signal is not an array', () => {
			for (const bad of [null, undefined, 42, 'abc', { re: 1, im: 0 }, new Float64Array([1, 2])]) {
				assert.throws(() => fourierTransformComplexIterative(bad), TypeError)
			}
		})

		test('throws TypeError for invalid options', () => {
			const valid = [{ re: 1, im: 0 }]
			for (const badOpts of [null, true, 123, 'inverse', [], { inverse: 'yes' }, { inverse: 1 }]) {
				assert.throws(() => fourierTransformComplexIterative(valid, badOpts), TypeError)
			}
		})

		test('throws TypeError when an element is missing, null, primitive, or missing re/im', () => {
			const sparse = new Array(2)
			sparse[0] = { re: 1, im: 0 }

			const invalidSignals = [
				sparse,
				[null],
				[undefined],
				[1],
				['1+2i'],
				[{ re: 1 }],
				[{ im: 2 }],
				[{ re: '1', im: 0 }],
				[{ re: 1, im: null }],
			]

			for (const badSignal of invalidSignals) {
				assert.throws(() => fourierTransformComplexIterative(badSignal), TypeError)
			}
		})

		test('throws RangeError when re or im is NaN or Infinity', () => {
			const nonFiniteSignals = [
				[{ re: Number.NaN, im: 0 }],
				[{ re: 0, im: Number.NaN }],
				[{ re: Number.POSITIVE_INFINITY, im: 0 }],
				[{ re: 0, im: Number.NEGATIVE_INFINITY }],
			]

			for (const badSignal of nonFiniteSignals) {
				assert.throws(() => fourierTransformComplexIterative(badSignal), RangeError)
			}
		})
	})
})
