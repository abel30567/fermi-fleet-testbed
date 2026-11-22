import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { fourierTransformTypedIterative } from './fourierTransformTypedIterative.js'

const EPS = 1e-10

function assertClose(actual, expected, eps = EPS, label = '') {
	assert.ok(
		Math.abs(actual - expected) <= eps,
		`${label ? label + ': ' : ''}expected ${actual} to be within ${eps} of ${expected}`
	)
}

function assertComplexArrayClose(actual, expectedReal, expectedImag, eps = EPS) {
	assert.ok(actual.real instanceof Float64Array, 'output.real should be a Float64Array')
	assert.ok(actual.imag instanceof Float64Array, 'output.imag should be a Float64Array')
	assert.equal(actual.real.length, expectedReal.length)
	assert.equal(actual.imag.length, expectedImag.length)
	for (let i = 0; i < expectedReal.length; i++) {
		assertClose(actual.real[i], expectedReal[i], eps, `real[${i}]`)
		assertClose(actual.imag[i], expectedImag[i], eps, `imag[${i}]`)
	}
}

describe('fourierTransformTypedIterative', () => {
	describe('normal cases', () => {
		test('unit impulse at n=0 yields flat spectrum of 1 + 0i', () => {
			const input = new Float64Array([1, 0, 0, 0])
			const result = fourierTransformTypedIterative(input)
			assertComplexArrayClose(result, [1, 1, 1, 1], [0, 0, 0, 0])
		})

		test('shifted impulse at n=1 yields phase ramp [1, -i, -1, i]', () => {
			const input = new Float64Array([0, 1, 0, 0])
			const result = fourierTransformTypedIterative(input)
			assertComplexArrayClose(result, [1, 0, -1, 0], [0, -1, 0, 1])
		})

		test('constant (DC) signal concentrates all energy in bin 0', () => {
			const input = new Float64Array([2.5, 2.5, 2.5, 2.5])
			const result = fourierTransformTypedIterative(input)
			assertComplexArrayClose(result, [10, 0, 0, 0], [0, 0, 0, 0])
		})

		test('pure cosine wave produces symmetric real peaks at k and N-k', () => {
			const n = 16
			const freq = 3
			const input = new Float64Array(n)
			for (let t = 0; t < n; t++) {
				input[t] = Math.cos((2 * Math.PI * freq * t) / n)
			}
			const result = fourierTransformTypedIterative(input)
			const expectedReal = new Array(n).fill(0)
			const expectedImag = new Array(n).fill(0)
			expectedReal[freq] = n / 2
			expectedReal[n - freq] = n / 2
			assertComplexArrayClose(result, expectedReal, expectedImag)
		})

		test('pure sine wave produces antisymmetric imaginary peaks at k and N-k', () => {
			const n = 16
			const freq = 5
			const input = new Float64Array(n)
			for (let t = 0; t < n; t++) {
				input[t] = Math.sin((2 * Math.PI * freq * t) / n)
			}
			const result = fourierTransformTypedIterative(input)
			const expectedReal = new Array(n).fill(0)
			const expectedImag = new Array(n).fill(0)
			expectedImag[freq] = -n / 2
			expectedImag[n - freq] = n / 2
			assertComplexArrayClose(result, expectedReal, expectedImag)
		})

		test('general complex signal with non-power-of-two length', () => {
			const real = new Float64Array([1, -2, 3, 0, -1])
			const imag = new Float64Array([0.5, 1, -1.5, 2, 0])
			const result = fourierTransformTypedIterative(real, imag)

			// Independent direct computation of k=0 (sum of all elements)
			assertClose(result.real[0], 1 - 2 + 3 + 0 - 1)
			assertClose(result.imag[0], 0.5 + 1 - 1.5 + 2 + 0)
			assert.equal(result.real.length, 5)
			assert.equal(result.imag.length, 5)
		})

		test('does not mutate input Float64Arrays', () => {
			const real = new Float64Array([1, 2, 3, 4])
			const imag = new Float64Array([-1, -2, -3, -4])
			const realSnapshot = new Float64Array(real)
			const imagSnapshot = new Float64Array(imag)

			fourierTransformTypedIterative(real, imag)
			fourierTransformTypedIterative(real, imag, { inverse: true })

			assert.deepEqual(real, realSnapshot)
			assert.deepEqual(imag, imagSnapshot)
		})
	})

	describe('edge cases', () => {
		test('empty Float64Array returns empty Float64Arrays (forward and inverse)', () => {
			const empty = new Float64Array(0)
			const fwd = fourierTransformTypedIterative(empty)
			assert.ok(fwd.real instanceof Float64Array)
			assert.ok(fwd.imag instanceof Float64Array)
			assert.equal(fwd.real.length, 0)
			assert.equal(fwd.imag.length, 0)

			const inv = fourierTransformTypedIterative(empty, new Float64Array(0), { inverse: true })
			assert.equal(inv.real.length, 0)
			assert.equal(inv.imag.length, 0)
		})

		test('length 1 real and complex signals are invariant under forward and inverse DFT', () => {
			const fwdReal = fourierTransformTypedIterative(new Float64Array([7.25]))
			assertComplexArrayClose(fwdReal, [7.25], [0])

			const fwdComplex = fourierTransformTypedIterative(
				new Float64Array([-3.5]),
				new Float64Array([4.25])
			)
			assertComplexArrayClose(fwdComplex, [-3.5], [4.25])

			const invComplex = fourierTransformTypedIterative(
				new Float64Array([-3.5]),
				new Float64Array([4.25]),
				{ inverse: true }
			)
			assertComplexArrayClose(invComplex, [-3.5], [4.25])
		})
	})

	describe('input validation', () => {
		test('throws TypeError when real is not a Float64Array', () => {
			for (const bad of [[1, 2, 3], new Float32Array([1, 2]), new Int32Array([1, 2]), null, undefined, 42, '123', {}]) {
				assert.throws(() => fourierTransformTypedIterative(bad), TypeError)
			}
		})

		test('throws TypeError when imag is provided and not a Float64Array', () => {
			const real = new Float64Array([1, 2])
			for (const bad of [[0, 0], new Float32Array([0, 0]), 0, '0', {}]) {
				assert.throws(() => fourierTransformTypedIterative(real, bad), TypeError)
			}
		})

		test('throws RangeError when real and imag lengths differ', () => {
			assert.throws(
				() => fourierTransformTypedIterative(new Float64Array([1, 2, 3]), new Float64Array([1, 2])),
				RangeError
			)
		})

		test('throws RangeError for NaN, Infinity, and -Infinity in real or imag', () => {
			for (const badVal of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
				assert.throws(
					() => fourierTransformTypedIterative(new Float64Array([1, badVal, 3])),
					RangeError
				)
				assert.throws(
					() =>
						fourierTransformTypedIterative(
							new Float64Array([1, 2, 3]),
							new Float64Array([0, badVal, 0])
						),
					RangeError
				)
			}
		})

		test('throws TypeError for invalid options or options.inverse', () => {
			const real = new Float64Array([1, 2])
			assert.throws(() => fourierTransformTypedIterative(real, null, null), TypeError)
			assert.throws(() => fourierTransformTypedIterative(real, null, true), TypeError)
			assert.throws(() => fourierTransformTypedIterative(real, null, []), TypeError)
			assert.throws(() => fourierTransformTypedIterative(real, null, { inverse: 1 }), TypeError)
		})
	})

	describe('independent mathematical cross-checks', () => {
		test("Parseval's theorem: sum |x[n]|^2 == (1/N) sum |X[k]|^2", () => {
			const signals = [
				{
					real: new Float64Array([1.5, -2.3, 0.7, 4.1, -0.9, 3.2, -1.8]),
					imag: null,
				},
				{
					real: new Float64Array([0.2, -1.4, 3.3, 2.1, -0.5, 1.9, -2.7, 0.8, 1.1, -3.0, 2.4, -0.6, 1.7]),
					imag: new Float64Array([-0.8, 2.2, -1.1, 0.4, 3.5, -2.0, 1.3, -1.9, 0.7, 2.6, -0.3, 1.5, -2.4]),
				},
			]

			for (const { real, imag } of signals) {
				const n = real.length
				let timeEnergy = 0
				for (let t = 0; t < n; t++) {
					const im = imag ? imag[t] : 0
					timeEnergy += real[t] * real[t] + im * im
				}

				const freq = fourierTransformTypedIterative(real, imag)
				let freqEnergy = 0
				for (let k = 0; k < n; k++) {
					freqEnergy += freq.real[k] * freq.real[k] + freq.imag[k] * freq.imag[k]
				}

				assertClose(freqEnergy / n, timeEnergy, 1e-9, `Parseval N=${n}`)
			}
		})

		test('DFT -> IDFT and IDFT -> DFT round-trip recovers original signal', () => {
			const real = new Float64Array([3.14, -2.71, 1.41, 0, -0.57, 4.66, -1.61, 2.23, -3.33])
			const imag = new Float64Array([-1.2, 0.8, 2.5, -3.1, 1.7, 0.0, -2.2, 1.9, 0.4])

			const spectrum = fourierTransformTypedIterative(real, imag)
			const reconstructed = fourierTransformTypedIterative(spectrum.real, spectrum.imag, {
				inverse: true,
			})
			assertComplexArrayClose(reconstructed, real, imag, 1e-10)

			const invFirst = fourierTransformTypedIterative(real, imag, { inverse: true })
			const backToFreq = fourierTransformTypedIterative(invFirst.real, invFirst.imag)
			assertComplexArrayClose(backToFreq, real, imag, 1e-10)
		})

		test('linearity: DFT(a*x + b*y) == a*DFT(x) + b*DFT(y)', () => {
			const n = 8
			const a = 2.3
			const b = -1.7
			const x = new Float64Array([1, -3, 2, 0.5, -1.5, 4, 0, 2.5])
			const y = new Float64Array([-2, 1.5, 0, -4, 3, -0.5, 2, -1])
			const combined = new Float64Array(n)
			for (let i = 0; i < n; i++) {
				combined[i] = a * x[i] + b * y[i]
			}

			const X = fourierTransformTypedIterative(x)
			const Y = fourierTransformTypedIterative(y)
			const Z = fourierTransformTypedIterative(combined)

			const expectedReal = new Float64Array(n)
			const expectedImag = new Float64Array(n)
			for (let k = 0; k < n; k++) {
				expectedReal[k] = a * X.real[k] + b * Y.real[k]
				expectedImag[k] = a * X.imag[k] + b * Y.imag[k]
			}
			assertComplexArrayClose(Z, expectedReal, expectedImag, 1e-10)
		})

		test('conjugate symmetry for real-valued signals: X[N - k] == conj(X[k])', () => {
			const real = new Float64Array([0.4, -1.2, 3.7, 2.1, -0.8, 1.5, -2.9, 0.3, 4.2, -1.1, 0.9])
			const n = real.length
			const X = fourierTransformTypedIterative(real)

			for (let k = 1; k < n; k++) {
				assertClose(X.real[n - k], X.real[k], 1e-10, `conjugate symmetry real k=${k}`)
				assertClose(X.imag[n - k], -X.imag[k], 1e-10, `conjugate symmetry imag k=${k}`)
			}
		})

		test('matches independent DFT matrix multiplication reference', () => {
			const real = new Float64Array([1.2, -0.5, 2.8, -1.7, 0.9, 3.1])
			const imag = new Float64Array([0.3, 1.4, -0.6, 2.2, -1.1, 0.7])
			const n = real.length

			// Build explicit DFT Vandermonde matrix W[k][t] = exp(-i * 2*pi*k*t / N)
			const refReal = new Array(n).fill(0)
			const refImag = new Array(n).fill(0)
			for (let k = 0; k < n; k++) {
				for (let t = 0; t < n; t++) {
					const theta = (2 * Math.PI * k * t) / n
					const wr = Math.cos(theta)
					const wi = -Math.sin(theta)
					// (real[t] + i*imag[t]) * (wr + i*wi)
					refReal[k] += real[t] * wr - imag[t] * wi
					refImag[k] += real[t] * wi + imag[t] * wr
				}
			}

			const actual = fourierTransformTypedIterative(real, imag)
			assertComplexArrayClose(actual, refReal, refImag, 1e-10)
		})
	})
})
