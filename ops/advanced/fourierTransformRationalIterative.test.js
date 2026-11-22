import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { fourierTransformRationalIterative } from './fourierTransformRationalIterative.js'

function r(num, den = 1n) {
	return { num: BigInt(num), den: BigInt(den) }
}

function c(reNum, reDen = 1n, imNum = 0n, imDen = 1n) {
	return { re: r(reNum, reDen), im: r(imNum, imDen) }
}

function gcdBigInt(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const rem = x % y
		x = y
		y = rem
	}
	return x
}

function assertLowestTerms(rat, label = 'rational') {
	assert.equal(typeof rat.num, 'bigint', `${label}.num must be BigInt`)
	assert.equal(typeof rat.den, 'bigint', `${label}.den must be BigInt`)
	assert.ok(rat.den > 0n, `${label}.den must be positive, got ${rat.den}`)
	if (rat.num === 0n) {
		assert.equal(rat.den, 1n, `${label} zero must have den === 1n`)
	} else {
		assert.equal(gcdBigInt(rat.num, rat.den), 1n, `${label} must be in lowest terms`)
	}
}

function assertSpectrumLowestTerms(spectrum) {
	for (let i = 0; i < spectrum.length; i++) {
		assertLowestTerms(spectrum[i].re, `spectrum[${i}].re`)
		assertLowestTerms(spectrum[i].im, `spectrum[${i}].im`)
	}
}

/**
 * Converts a BigInt rational to a JS Number accurately even when num/den exceed 2^1024.
 */
function ratToNumber(rat) {
	if (rat.num === 0n) return 0
	const neg = rat.num < 0n
	const absNum = neg ? -rat.num : rat.num
	const scale = 10n ** 24n
	const scaled = (absNum * scale) / rat.den
	const val = Number(scaled) / 1e24
	return neg ? -val : val
}

/**
 * Returns exact |a - b| as a rational and checks |a - b| <= tolNum / tolDen using BigInt only.
 */
function assertRatClose(actual, expected, tolNum = 1n, tolDen = 10n ** 18n, label = 'rational') {
	// |a.num/a.den - b.num/b.den| <= tolNum/tolDen
	// <=> |a.num * b.den - b.num * a.den| * tolDen <= tolNum * a.den * b.den
	const diffNum = actual.num * expected.den - expected.num * actual.den
	const absDiffNum = diffNum < 0n ? -diffNum : diffNum
	const lhs = absDiffNum * tolDen
	const rhs = tolNum * actual.den * expected.den
	assert.ok(
		lhs <= rhs,
		`${label} not within tolerance ${tolNum}/${tolDen}: actual=${ratToNumber(actual)}, expected=${ratToNumber(expected)}`,
	)
}

function ratAdd(a, b) {
	const num = a.num * b.den + b.num * a.den
	const den = a.den * b.den
	const g = gcdBigInt(num, den)
	return num === 0n ? { num: 0n, den: 1n } : { num: num / g, den: den / g }
}

function ratMul(a, b) {
	const num = a.num * b.num
	const den = a.den * b.den
	const g = gcdBigInt(num, den)
	return num === 0n ? { num: 0n, den: 1n } : { num: num / g, den: den / g }
}

function complexNormSq(z) {
	return ratAdd(ratMul(z.re, z.re), ratMul(z.im, z.im))
}

/**
 * Independent naive IEEE-754 floating-point DFT reference implementation.
 */
function naiveFloatDft(signal, inverse = false) {
	const N = signal.length
	const sign = inverse ? 1 : -1
	const out = []
	for (let k = 0; k < N; k++) {
		let re = 0
		let im = 0
		for (let n = 0; n < N; n++) {
			const xRe = 're' in signal[n] ? ratToNumber(signal[n].re) : ratToNumber(signal[n])
			const xIm = 'im' in signal[n] ? ratToNumber(signal[n].im) : 0
			const angle = (sign * 2 * Math.PI * ((k * n) % N)) / N
			const cosA = Math.cos(angle)
			const sinA = Math.sin(angle)
			re += xRe * cosA - xIm * sinA
			im += xRe * sinA + xIm * cosA
		}
		if (inverse) {
			re /= N
			im /= N
		}
		out.push({ re, im })
	}
	return out
}

describe('fourierTransformRationalIterative', () => {
	describe('exact quadrant-angle cases (N = 1, 2, 4)', () => {
		test('N = 1 real and complex signals, including unreduced and negative denominators', () => {
			const realOut = fourierTransformRationalIterative([r(6, -9)])
			assertSpectrumLowestTerms(realOut)
			assert.deepEqual(realOut, [c(-2, 3, 0, 1)])

			const complexOut = fourierTransformRationalIterative([c(10, -15, -8, -12)])
			assertSpectrumLowestTerms(complexOut)
			assert.deepEqual(complexOut, [c(-2, 3, 2, 3)])

			const invOut = fourierTransformRationalIterative(complexOut, { inverse: true })
			assert.deepEqual(invOut, [c(-2, 3, 2, 3)])
		})

		test('N = 2 constant, alternating, fractional, and complex signals', () => {
			assert.deepEqual(fourierTransformRationalIterative([r(5), r(5)]), [c(10), c(0)])
			assert.deepEqual(fourierTransformRationalIterative([r(3), r(-3)]), [c(0), c(6)])

			const frac = [r(1, 3), r(-5, 6)]
			const X = fourierTransformRationalIterative(frac)
			assertSpectrumLowestTerms(X)
			assert.deepEqual(X, [c(-1, 2), c(7, 6)])

			const roundTrip = fourierTransformRationalIterative(X, { inverse: true })
			assert.deepEqual(roundTrip, [c(1, 3), c(-5, 6)])
		})

		test('N = 4 impulse, shifted impulse, constant, alternating, and ramp signals', () => {
			// Impulse at n = 0 -> flat spectrum [1, 1, 1, 1]
			assert.deepEqual(fourierTransformRationalIterative([r(1), r(0), r(0), r(0)]), [
				c(1),
				c(1),
				c(1),
				c(1),
			])

			// Shifted impulse at n = 1 -> [1, -i, -1, +i]
			assert.deepEqual(fourierTransformRationalIterative([r(0), r(1), r(0), r(0)]), [
				c(1),
				c(0, 1, -1, 1),
				c(-1),
				c(0, 1, 1, 1),
			])

			// Constant signal [3/4, 3/4, 3/4, 3/4] -> [3, 0, 0, 0]
			assert.deepEqual(
				fourierTransformRationalIterative([r(3, 4), r(3, 4), r(3, 4), r(3, 4)]),
				[c(3), c(0), c(0), c(0)],
			)

			// Alternating signal [1, -1, 1, -1] -> [0, 0, 4, 0]
			assert.deepEqual(fourierTransformRationalIterative([r(1), r(-1), r(1), r(-1)]), [
				c(0),
				c(0),
				c(4),
				c(0),
			])

			// Ramp signal [1, 2, 3, 4] -> [10, -2 + 2i, -2, -2 - 2i]
			const ramp = [r(1), r(2), r(3), r(4)]
			const rampDft = fourierTransformRationalIterative(ramp)
			assertSpectrumLowestTerms(rampDft)
			assert.deepEqual(rampDft, [c(10), c(-2, 1, 2, 1), c(-2), c(-2, 1, -2, 1)])

			// Exact bit-for-bit inverse DFT
			const recovered = fourierTransformRationalIterative(rampDft, { inverse: true })
			assert.deepEqual(recovered, [c(1), c(2), c(3), c(4)])
		})

		test('N = 4 general complex rational signal exact round-trip and exact Parseval', () => {
			const signal = [
				c(1, 2, -1, 3),
				c(-3, 4, 2, 5),
				c(5, 6, 0, 1),
				c(-7, 8, -9, 10),
			]
			const X = fourierTransformRationalIterative(signal)
			assertSpectrumLowestTerms(X)

			// Exact inverse recovery
			const recovered = fourierTransformRationalIterative(X, { inverse: true })
			assert.deepEqual(recovered, signal)

			// Exact Parseval identity: sum |x[n]|^2 === (1/N) * sum |X[k]|^2
			let timeEnergy = r(0)
			let freqEnergy = r(0)
			for (let i = 0; i < signal.length; i++) {
				timeEnergy = ratAdd(timeEnergy, complexNormSq(signal[i]))
				freqEnergy = ratAdd(freqEnergy, complexNormSq(X[i]))
			}
			const scaledFreqEnergy = ratMul(freqEnergy, r(1, signal.length))
			assert.deepEqual(scaledFreqEnergy, timeEnergy)
		})
	})

	describe('exact Niven cancellations and symmetry properties (N = 3, 6, 5, 7, 8)', () => {
		test('N = 3 even symmetric signal yields exact rational DFT with zero imaginary parts', () => {
			const X = fourierTransformRationalIterative([r(1), r(2), r(2)])
			assertSpectrumLowestTerms(X)
			assert.deepEqual(X, [c(5), c(-1), c(-1)])
		})

		test('N = 6 even symmetric signal yields exact rational DFT with zero imaginary parts', () => {
			const X = fourierTransformRationalIterative([r(1), r(2), r(3), r(4), r(3), r(2)])
			assertSpectrumLowestTerms(X)
			assert.deepEqual(X, [c(15), c(-4), c(0), c(-1), c(0), c(-4)])
		})

		test('exact conjugate symmetry X[N - k] === conj(X[k]) for real signals of any length', () => {
			for (const len of [3, 5, 7, 8, 9, 12]) {
				const signal = []
				for (let n = 0; n < len; n++) {
					signal.push(r((n * 3 - 4) * (n % 2 === 0 ? 1 : -1), n + 2))
				}
				const X = fourierTransformRationalIterative(signal)
				assertSpectrumLowestTerms(X)
				assert.deepEqual(X[0].im, r(0))
				for (let k = 1; k < len; k++) {
					assert.deepEqual(X[len - k].re, X[k].re, `N=${len}, k=${k} real symmetry`)
					assert.deepEqual(
						X[len - k].im,
						X[k].im.num === 0n ? r(0) : { num: -X[k].im.num, den: X[k].im.den },
						`N=${len}, k=${k} imag conjugate symmetry`,
					)
				}
			}
		})

		test('odd antisymmetric real signal has exact zero real parts across all frequencies', () => {
			// x[0] = 0, x[n] = -x[N - n]
			const signal = [r(0), r(2, 3), r(-5, 7), r(5, 7), r(-2, 3)]
			const X = fourierTransformRationalIterative(signal)
			assertSpectrumLowestTerms(X)
			for (let k = 0; k < X.length; k++) {
				assert.deepEqual(X[k].re, r(0), `k=${k} real part must be exact 0/1`)
			}
		})
	})

	describe('independent cross-checks (float DFT, Parseval, round-trip, linearity, convolution)', () => {
		test('matches independent floating-point DFT across N = 3, 5, 6, 7, 8, 12 (forward and inverse)', () => {
			for (const N of [3, 5, 6, 7, 8, 12]) {
				const signal = []
				for (let n = 0; n < N; n++) {
					signal.push(c(n - 2, n + 1, (n % 3) - 1, n + 2))
				}

				for (const inverse of [false, true]) {
					const ratOut = fourierTransformRationalIterative(signal, { inverse })
					assertSpectrumLowestTerms(ratOut)
					const floatOut = naiveFloatDft(signal, inverse)

					for (let k = 0; k < N; k++) {
						assert.ok(
							Math.abs(ratToNumber(ratOut[k].re) - floatOut[k].re) < 1e-14,
							`N=${N}, inverse=${inverse}, k=${k} real mismatch`,
						)
						assert.ok(
							Math.abs(ratToNumber(ratOut[k].im) - floatOut[k].im) < 1e-14,
							`N=${N}, inverse=${inverse}, k=${k} imag mismatch`,
						)
					}
				}
			}
		})

		test('Parseval energy identity holds to < 1e-18 for non-quadrant lengths N = 5, 7, 8', () => {
			for (const N of [5, 7, 8]) {
				const signal = []
				for (let n = 0; n < N; n++) {
					signal.push(c(2 * n - 3, 5, n - 1, 3))
				}
				const X = fourierTransformRationalIterative(signal)
				assertSpectrumLowestTerms(X)

				let timeEnergy = r(0)
				let freqEnergy = r(0)
				for (let i = 0; i < N; i++) {
					timeEnergy = ratAdd(timeEnergy, complexNormSq(signal[i]))
					freqEnergy = ratAdd(freqEnergy, complexNormSq(X[i]))
				}
				const scaledFreqEnergy = ratMul(freqEnergy, r(1, N))
				assertRatClose(scaledFreqEnergy, timeEnergy, 1n, 10n ** 18n, `Parseval N=${N}`)
			}
		})

		test('IDFT(DFT(x)) round-trips to < 1e-18 and precision improves with options.terms', () => {
			const signal = [c(1, 3, -2, 5), c(4, 7, 1, 2), c(-3, 4, 5, 6), c(2, 9, -1, 4), c(7, 8, 3, 11)]

			const X10 = fourierTransformRationalIterative(signal, { terms: 10 })
			const rec10 = fourierTransformRationalIterative(X10, { inverse: true, terms: 10 })
			assertSpectrumLowestTerms(rec10)
			for (let i = 0; i < signal.length; i++) {
				assertRatClose(rec10[i].re, signal[i].re, 1n, 10n ** 18n, `rec10[${i}].re`)
				assertRatClose(rec10[i].im, signal[i].im, 1n, 10n ** 18n, `rec10[${i}].im`)
			}

			// Higher terms strictly improves accuracy over low terms
			const X3 = fourierTransformRationalIterative(signal, { terms: 3 })
			const rec3 = fourierTransformRationalIterative(X3, { inverse: true, terms: 3 })
			const err3 = Math.abs(ratToNumber(rec3[1].re) - ratToNumber(signal[1].re))
			const err10 = Math.abs(ratToNumber(rec10[1].re) - ratToNumber(signal[1].re))
			assert.ok(err3 > 1e-8, `expected measurable error at terms=3, got ${err3}`)
			assert.ok(err10 < 1e-18, `expected tiny error at terms=10, got ${err10}`)
			assert.ok(err10 < err3)
		})

		test('exact algebraic linearity DFT(a*x + b*y) === a*DFT(x) + b*DFT(y) for N = 5', () => {
			const a = r(3, 5)
			const b = r(-7, 4)
			const x = [r(1, 2), r(-2, 3), r(4, 5), r(0), r(7, 6)]
			const y = [r(-3, 7), r(5, 2), r(-1, 4), r(8, 3), r(-2, 5)]
			const combined = x.map((xi, i) => ratAdd(ratMul(a, xi), ratMul(b, y[i])))

			const dftCombined = fourierTransformRationalIterative(combined)
			const dftX = fourierTransformRationalIterative(x)
			const dftY = fourierTransformRationalIterative(y)

			for (let k = 0; k < x.length; k++) {
				const expectedRe = ratAdd(ratMul(a, dftX[k].re), ratMul(b, dftY[k].re))
				const expectedIm = ratAdd(ratMul(a, dftX[k].im), ratMul(b, dftY[k].im))
				assert.deepEqual(dftCombined[k].re, expectedRe, `linearity k=${k} re`)
				assert.deepEqual(dftCombined[k].im, expectedIm, `linearity k=${k} im`)
			}
		})

		test('circular convolution theorem DFT(x * y) = DFT(x) . DFT(y) (exact for N = 4, <1e-18 for N = 5)', () => {
			for (const [x, y, exact] of [
				[[r(1, 2), r(-1, 3), r(2, 5), r(3, 4)], [r(2, 3), r(1, 4), r(-3, 5), r(1, 2)], true],
				[
					[r(1), r(-2, 3), r(3, 5), r(-1, 2), r(4, 7)],
					[r(2, 5), r(1, 3), r(-4, 5), r(2), r(-1, 4)],
					false,
				],
			]) {
				const N = x.length
				const conv = new Array(N).fill(null).map(() => r(0))
				for (let n = 0; n < N; n++) {
					for (let m = 0; m < N; m++) {
						const idx = (n - m + N) % N
						conv[n] = ratAdd(conv[n], ratMul(x[m], y[idx]))
					}
				}

				const dftConv = fourierTransformRationalIterative(conv)
				const dftX = fourierTransformRationalIterative(x)
				const dftY = fourierTransformRationalIterative(y)

				for (let k = 0; k < N; k++) {
					const prodRe = ratAdd(
						ratMul(dftX[k].re, dftY[k].re),
						ratMul(r(-1), ratMul(dftX[k].im, dftY[k].im)),
					)
					const prodIm = ratAdd(
						ratMul(dftX[k].re, dftY[k].im),
						ratMul(dftX[k].im, dftY[k].re),
					)
					if (exact) {
						assert.deepEqual(dftConv[k].re, prodRe)
						assert.deepEqual(dftConv[k].im, prodIm)
					} else {
						assertRatClose(dftConv[k].re, prodRe, 1n, 10n ** 18n, `conv k=${k} re`)
						assertRatClose(dftConv[k].im, prodIm, 1n, 10n ** 18n, `conv k=${k} im`)
					}
				}
			}
		})

		test('does not mutate input signal objects and returns distinct rational instances', () => {
			const sample = { num: 4n, den: -6n }
			const input = [sample, { num: 0n, den: 5n }]
			const out = fourierTransformRationalIterative(input)
			assert.deepEqual(sample, { num: 4n, den: -6n })
			assert.notEqual(out[0].re, out[1].re)
			assert.notEqual(out[0].im, out[1].im)
		})
	})

	describe('input validation', () => {
		test('throws TypeError for non-array signal', () => {
			for (const bad of [null, undefined, 42, 'abc', {}, { length: 1 }]) {
				assert.throws(() => fourierTransformRationalIterative(bad), TypeError)
			}
		})

		test('throws RangeError for empty signal', () => {
			assert.throws(() => fourierTransformRationalIterative([]), RangeError)
		})

		test('throws TypeError for sparse array holes', () => {
			// eslint-disable-next-line no-sparse-arrays
			const sparse = [r(1), , r(2)]
			assert.throws(() => fourierTransformRationalIterative(sparse), TypeError)
		})

		test('throws TypeError for malformed or ambiguous samples', () => {
			const badSamples = [
				null,
				undefined,
				1,
				1n,
				'1/2',
				[1n, 2n],
				{},
				{ num: 1, den: 2n },
				{ num: 1n, den: 2 },
				{ num: NaN, den: 1n },
				{ num: Infinity, den: 1n },
				{ num: 1n },
				{ re: r(1) },
				{ im: r(1) },
				{ re: { num: 1, den: 2n }, im: r(0) },
				{ num: 1n, den: 1n, re: r(1), im: r(0) },
			]
			for (const sample of badSamples) {
				assert.throws(() => fourierTransformRationalIterative([sample]), TypeError)
			}
		})

		test('throws RangeError for zero denominators in real or complex samples', () => {
			assert.throws(() => fourierTransformRationalIterative([{ num: 1n, den: 0n }]), RangeError)
			assert.throws(() => fourierTransformRationalIterative([{ num: 0n, den: 0n }]), RangeError)
			assert.throws(
				() => fourierTransformRationalIterative([{ re: { num: 1n, den: 0n }, im: r(0) }]),
				RangeError,
			)
			assert.throws(
				() => fourierTransformRationalIterative([{ re: r(1), im: { num: 2n, den: 0n } }]),
				RangeError,
			)
		})

		test('throws TypeError or RangeError for invalid options', () => {
			for (const badOpts of [null, 1, 'opts', []]) {
				assert.throws(() => fourierTransformRationalIterative([r(1)], badOpts), TypeError)
			}
			for (const badInv of [1, 0, 'true', null, {}]) {
				assert.throws(
					() => fourierTransformRationalIterative([r(1)], { inverse: badInv }),
					TypeError,
				)
			}
			for (const badTermsType of ['10', 10n, null, {}, true]) {
				assert.throws(
					() => fourierTransformRationalIterative([r(1)], { terms: badTermsType }),
					TypeError,
				)
			}
			for (const badTermsRange of [0, -1, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
				assert.throws(
					() => fourierTransformRationalIterative([r(1)], { terms: badTermsRange }),
					RangeError,
				)
			}
		})
	})
})
