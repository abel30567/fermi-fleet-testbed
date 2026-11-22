import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { fourierTransformFloatIterative } from './fourierTransformFloatIterative.js'

const EPS = 1e-10

function assertClose(actual, expected, tol = EPS, label = '') {
	assert.ok(
		Math.abs(actual - expected) <= tol,
		`${label ? label + ': ' : ''}expected ${expected}, got ${actual} (diff ${Math.abs(actual - expected)} > ${tol})`
	)
}

function assertComplexClose(actual, expected, tol = EPS, label = '') {
	assert.equal(typeof actual, 'object')
	assert.notEqual(actual, null)
	assertClose(actual.re, expected.re, tol, `${label} re`)
	assertClose(actual.im, expected.im, tol, `${label} im`)
}

function assertComplexArrayClose(actual, expected, tol = EPS) {
	assert.equal(actual.length, expected.length)
	for (let i = 0; i < expected.length; i++) {
		assertComplexClose(actual[i], expected[i], tol, `index ${i}`)
	}
}

function complexMul(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	}
}

function complexAdd(a, b) {
	return { re: a.re + b.re, im: a.im + b.im }
}

function energy(seq) {
	let sum = 0
	for (const x of seq) {
		if (typeof x === 'number') {
			sum += x * x
		} else {
			sum += x.re * x.re + x.im * x.im
		}
	}
	return sum
}

describe('fourierTransformFloatIterative', () => {
	describe('edge cases and fundamental signals', () => {
		it('handles length-1 real and complex signals', () => {
			assertComplexArrayClose(fourierTransformFloatIterative([7.5]), [
				{ re: 7.5, im: 0 },
			])
			assertComplexArrayClose(fourierTransformFloatIterative([7.5], true), [
				{ re: 7.5, im: 0 },
			])
			assertComplexArrayClose(
				fourierTransformFloatIterative([{ re: -2.25, im: 3.75 }]),
				[{ re: -2.25, im: 3.75 }]
			)
			assertComplexArrayClose(
				fourierTransformFloatIterative([{ re: -2.25, im: 3.75 }], true),
				[{ re: -2.25, im: 3.75 }]
			)
		})

		it('computes the DFT of a constant (DC) signal', () => {
			const c = 3.5
			const n = 8
			const input = Array(n).fill(c)
			const output = fourierTransformFloatIterative(input)

			const expected = Array.from({ length: n }, (_, k) => ({
				re: k === 0 ? c * n : 0,
				im: 0,
			}))
			assertComplexArrayClose(output, expected)
		})

		it('computes the DFT of the unit impulse delta[0]', () => {
			const n = 6
			const impulse = [1, 0, 0, 0, 0, 0]
			const output = fourierTransformFloatIterative(impulse)

			const expected = Array.from({ length: n }, () => ({ re: 1, im: 0 }))
			assertComplexArrayClose(output, expected)
		})

		it('computes the DFT of a shifted impulse delta[m]', () => {
			const n = 5
			const m = 2
			const shifted = [0, 0, 1, 0, 0]
			const output = fourierTransformFloatIterative(shifted)

			const expected = Array.from({ length: n }, (_, k) => {
				const angle = (-2 * Math.PI * k * m) / n
				return { re: Math.cos(angle), im: Math.sin(angle) }
			})
			assertComplexArrayClose(output, expected)
		})

		it('computes the DFT of an all-zero signal without -0', () => {
			const output = fourierTransformFloatIterative([0, 0, 0, 0])
			for (const bin of output) {
				assert.ok(Object.is(bin.re, 0))
				assert.ok(Object.is(bin.im, 0))
			}
		})

		it('computes the DFT of a pure cosine wave', () => {
			const n = 16
			const freq = 3
			const signal = Array.from({ length: n }, (_, t) =>
				Math.cos((2 * Math.PI * freq * t) / n)
			)
			const output = fourierTransformFloatIterative(signal)

			const expected = Array.from({ length: n }, (_, k) => ({
				re: k === freq || k === n - freq ? n / 2 : 0,
				im: 0,
			}))
			assertComplexArrayClose(output, expected)
		})

		it('computes the DFT of a pure sine wave', () => {
			const n = 16
			const freq = 5
			const signal = Array.from({ length: n }, (_, t) =>
				Math.sin((2 * Math.PI * freq * t) / n)
			)
			const output = fourierTransformFloatIterative(signal)

			const expected = Array.from({ length: n }, (_, k) => {
				if (k === freq) return { re: 0, im: -n / 2 }
				if (k === n - freq) return { re: 0, im: n / 2 }
				return { re: 0, im: 0 }
			})
			assertComplexArrayClose(output, expected)
		})

		it('computes the DFT of a Nyquist alternating signal (-1)^n', () => {
			const n = 8
			const signal = Array.from({ length: n }, (_, t) => (t % 2 === 0 ? 1 : -1))
			const output = fourierTransformFloatIterative(signal)

			const expected = Array.from({ length: n }, (_, k) => ({
				re: k === n / 2 ? n : 0,
				im: 0,
			}))
			assertComplexArrayClose(output, expected)
		})
	})

	describe('complex and mixed inputs', () => {
		it('computes exact known 4-point DFT of [1, 2, 3, 4]', () => {
			const output = fourierTransformFloatIterative([1, 2, 3, 4])
			assertComplexArrayClose(output, [
				{ re: 10, im: 0 },
				{ re: -2, im: 2 },
				{ re: -2, im: 0 },
				{ re: -2, im: -2 },
			])
		})

		it('computes the DFT of a complex exponential exp(i * 2*pi*f*n/N)', () => {
			const n = 12
			const freq = 4
			const signal = Array.from({ length: n }, (_, t) => {
				const angle = (2 * Math.PI * freq * t) / n
				return { re: Math.cos(angle), im: Math.sin(angle) }
			})
			const output = fourierTransformFloatIterative(signal)

			const expected = Array.from({ length: n }, (_, k) => ({
				re: k === freq ? n : 0,
				im: 0,
			}))
			assertComplexArrayClose(output, expected)
		})

		it('accepts mixed real numbers and { re, im } complex objects', () => {
			const mixed = [1, { re: 0, im: -1 }, -1, { re: 0, im: 1 }]
			const pureComplex = [
				{ re: 1, im: 0 },
				{ re: 0, im: -1 },
				{ re: -1, im: 0 },
				{ re: 0, im: 1 },
			]
			assertComplexArrayClose(
				fourierTransformFloatIterative(mixed),
				fourierTransformFloatIterative(pureComplex)
			)
		})

		it('does not mutate the input array or its element objects', () => {
			const sample0 = { re: 1.5, im: -0.5 }
			const sample1 = { re: -2.0, im: 4.0 }
			const input = [sample0, 3.25, sample1]
			const snapshot = structuredClone(input)

			fourierTransformFloatIterative(input)
			fourierTransformFloatIterative(input, true)

			assert.deepEqual(input, snapshot)
			assert.deepEqual(sample0, { re: 1.5, im: -0.5 })
			assert.deepEqual(sample1, { re: -2.0, im: 4.0 })
		})
	})

	describe('mathematical identities cross-checks', () => {
		it("satisfies Parseval's theorem: sum |x[n]|^2 === (1/N) sum |X[k]|^2", () => {
			const signals = [
				[1.5, -2.3, 4.1, 0.7, -3.9, 2.2, 5.8],
				[
					{ re: 1.2, im: -0.8 },
					{ re: -3.4, im: 2.1 },
					{ re: 0.5, im: 4.7 },
					{ re: -1.9, im: -2.6 },
					{ re: 6.3, im: 0.4 },
				],
				Array.from({ length: 13 }, (_, n) => ({
					re: Math.sin(0.7 * n + 0.3),
					im: Math.cos(1.1 * n - 0.5),
				})),
			]

			for (const x of signals) {
				const X = fourierTransformFloatIterative(x)
				const timeEnergy = energy(x)
				const freqEnergy = energy(X) / x.length
				assertClose(freqEnergy, timeEnergy, 1e-10, 'Parseval energy')
			}
		})

		it('satisfies linearity: DFT(a*x + b*y) === a*DFT(x) + b*DFT(y)', () => {
			const x = [
				{ re: 1.0, im: 2.0 },
				{ re: -0.5, im: 1.5 },
				{ re: 3.2, im: -1.1 },
				{ re: 0.4, im: 0.8 },
				{ re: -2.1, im: -0.3 },
				{ re: 1.7, im: 2.9 },
				{ re: -0.9, im: 0.6 },
			]
			const y = [
				{ re: -1.3, im: 0.7 },
				{ re: 2.4, im: -1.8 },
				{ re: 0.1, im: 3.3 },
				{ re: -2.5, im: 1.2 },
				{ re: 0.9, im: -2.2 },
				{ re: 1.1, im: 0.5 },
				{ re: 3.0, im: -1.4 },
			]
			const alpha = { re: 2.5, im: -1.25 }
			const beta = { re: -0.75, im: 3.1 }

			const combined = x.map((xi, i) =>
				complexAdd(complexMul(alpha, xi), complexMul(beta, y[i]))
			)

			const dftCombined = fourierTransformFloatIterative(combined)
			const dftX = fourierTransformFloatIterative(x)
			const dftY = fourierTransformFloatIterative(y)
			const expected = dftX.map((Xi, k) =>
				complexAdd(complexMul(alpha, Xi), complexMul(beta, dftY[k]))
			)

			assertComplexArrayClose(dftCombined, expected)
		})

		it('round-trips via inverse DFT: IDFT(DFT(x)) === x and DFT(IDFT(X)) === X', () => {
			const realSignal = [0.25, -1.5, 3.75, 2.0, -4.125, 0.5, 1.875]
			const spectrum = fourierTransformFloatIterative(realSignal)
			const recoveredReal = fourierTransformFloatIterative(spectrum, true)
			assertComplexArrayClose(
				recoveredReal,
				realSignal.map((re) => ({ re, im: 0 }))
			)

			const complexSignal = [
				{ re: 2.1, im: -3.4 },
				{ re: -0.8, im: 1.9 },
				{ re: 4.5, im: 0.2 },
				{ re: -1.7, im: -2.6 },
				{ re: 0.3, im: 5.1 },
				{ re: 3.3, im: -1.1 },
				{ re: -2.9, im: 0.7 },
				{ re: 1.4, im: 2.8 },
				{ re: -0.6, im: -4.2 },
			]
			const forwardThenInverse = fourierTransformFloatIterative(
				fourierTransformFloatIterative(complexSignal),
				true
			)
			assertComplexArrayClose(forwardThenInverse, complexSignal)

			const inverseThenForward = fourierTransformFloatIterative(
				fourierTransformFloatIterative(complexSignal, true),
				false
			)
			assertComplexArrayClose(inverseThenForward, complexSignal)
		})

		it('satisfies Hermitian symmetry for real-valued signals: X[N-k] === conj(X[k])', () => {
			const signal = [1.2, -3.4, 5.6, -7.8, 2.3, 0.9, -4.1, 6.7, -1.5]
			const X = fourierTransformFloatIterative(signal)
			const n = signal.length

			assertClose(X[0].im, 0)
			for (let k = 1; k < n; k++) {
				assertComplexClose(
					X[n - k],
					{ re: X[k].re, im: -X[k].im },
					EPS,
					`Hermitian k=${k}`
				)
			}
		})

		it('satisfies the circular convolution theorem: DFT(x (*) y) === DFT(x) * DFT(y)', () => {
			const x = [1.5, -0.5, 2.0, 0.75, -1.25]
			const y = [-0.25, 3.0, -1.5, 2.25, 0.5]
			const n = x.length

			const conv = Array.from({ length: n }, (_, k) => {
				let s = 0
				for (let m = 0; m < n; m++) {
					s += x[m] * y[(k - m + n) % n]
				}
				return s
			})

			const dftConv = fourierTransformFloatIterative(conv)
			const dftX = fourierTransformFloatIterative(x)
			const dftY = fourierTransformFloatIterative(y)
			const pointwise = dftX.map((Xi, k) => complexMul(Xi, dftY[k]))

			assertComplexArrayClose(dftConv, pointwise)
		})
	})

	describe('input validation', () => {
		it('throws TypeError for non-array signals', () => {
			for (const bad of [
				null,
				undefined,
				42,
				'123',
				{ length: 1, 0: 1 },
				new Float64Array([1, 2]),
			]) {
				assert.throws(() => fourierTransformFloatIterative(bad), TypeError)
			}
		})

		it('throws RangeError for empty array', () => {
			assert.throws(() => fourierTransformFloatIterative([]), RangeError)
		})

		it('throws TypeError for non-boolean inverse flag', () => {
			for (const bad of [1, 0, 'true', null, {}]) {
				assert.throws(
					() => fourierTransformFloatIterative([1, 2], bad),
					TypeError
				)
			}
		})

		it('throws RangeError for non-finite numeric values', () => {
			const nonFiniteInputs = [
				[NaN],
				[1, Infinity],
				[-Infinity, 0],
				[{ re: NaN, im: 0 }],
				[{ re: 0, im: Infinity }],
				[{ re: -Infinity, im: 1 }],
			]
			for (const bad of nonFiniteInputs) {
				assert.throws(() => fourierTransformFloatIterative(bad), RangeError)
			}
		})

		it('throws TypeError for malformed elements or sparse arrays', () => {
			const sparse = new Array(3)
			sparse[0] = 1
			sparse[2] = 3

			const invalidInputs = [
				sparse,
				[null],
				[undefined],
				['1'],
				[true],
				[[1, 0]],
				[{}],
				[{ re: 1 }],
				[{ im: 2 }],
				[{ re: '1', im: 0 }],
				[{ re: 1, im: null }],
			]
			for (const bad of invalidInputs) {
				assert.throws(() => fourierTransformFloatIterative(bad), TypeError)
			}
		})
	})
})
