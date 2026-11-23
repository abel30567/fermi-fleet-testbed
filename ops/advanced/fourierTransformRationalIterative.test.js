import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { fourierTransformRationalIterative } from './fourierTransformRationalIterative.js'

function r(num, den = 1n) {
	return { num: BigInt(num), den: BigInt(den) }
}

function c(reNum, reDen, imNum = 0n, imDen = 1n) {
	return { re: r(reNum, reDen), im: r(imNum, imDen) }
}

function gcdBigInt(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const t = x % y
		x = y
		y = t
	}
	return x
}

function assertLowestTerms(rat, label = 'rational') {
	assert.equal(typeof rat.num, 'bigint', `${label}.num must be bigint`)
	assert.equal(typeof rat.den, 'bigint', `${label}.den must be bigint`)
	assert.ok(rat.den > 0n, `${label}.den must be positive`)
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

function rationalToNumber(rat) {
	const scale = 10n ** 18n
	const scaled = (rat.num * scale) / rat.den
	return Number(scaled) / 1e18
}

function addRat(a, b) {
	const num = a.num * b.den + b.num * a.den
	const den = a.den * b.den
	if (num === 0n) return { num: 0n, den: 1n }
	const g = gcdBigInt(num, den)
	return { num: num / g, den: den / g }
}

function mulRat(a, b) {
	const num = a.num * b.num
	const den = a.den * b.den
	if (num === 0n) return { num: 0n, den: 1n }
	const g = gcdBigInt(num, den)
	return { num: num / g, den: den / g }
}

function referenceFloatDft(signal, inverse = false) {
	const n = signal.length
	const sign = inverse ? 1 : -1
	const out = new Array(n)
	for (let k = 0; k < n; k++) {
		let sumRe = 0
		let sumIm = 0
		for (let idx = 0; idx < n; idx++) {
			const theta = (2 * Math.PI * k * idx) / n
			const wRe = Math.cos(theta)
			const wIm = sign * Math.sin(theta)
			const sRe = rationalToNumber(signal[idx].re)
			const sIm = rationalToNumber(signal[idx].im)
			sumRe += sRe * wRe - sIm * wIm
			sumIm += sRe * wIm + sIm * wRe
		}
		if (inverse) {
			sumRe /= n
			sumIm /= n
		}
		out[k] = { re: sumRe, im: sumIm }
	}
	return out
}

describe('fourierTransformRationalIterative', () => {
	describe('exact small transforms (N = 1, 2, 4)', () => {
		test('N = 1 real and complex inputs', () => {
			const realOut = fourierTransformRationalIterative([r(7, 3)])
			assert.deepEqual(realOut, [c(7, 3, 0, 1)])
			assertSpectrumLowestTerms(realOut)

			const complexOut = fourierTransformRationalIterative([c(-5, 6, 9, 4)])
			assert.deepEqual(complexOut, [c(-5, 6, 9, 4)])
			assertSpectrumLowestTerms(complexOut)

			const invOut = fourierTransformRationalIterative(complexOut, { inverse: true })
			assert.deepEqual(invOut, [c(-5, 6, 9, 4)])
		})

		test('N = 2 exact forward and inverse', () => {
			const input = [r(3, 4), r(5, 6)]
			const out = fourierTransformRationalIterative(input)
			// X[0] = 3/4 + 5/6 = 19/12, X[1] = 3/4 - 5/6 = -1/12
			assert.deepEqual(out, [c(19, 12, 0, 1), c(-1, 12, 0, 1)])
			assertSpectrumLowestTerms(out)

			const roundTrip = fourierTransformRationalIterative(out, { inverse: true })
			assert.deepEqual(roundTrip, [c(3, 4, 0, 1), c(5, 6, 0, 1)])
		})

		test('N = 4 integer and fractional real inputs', () => {
			const intInput = [r(1), r(2), r(3), r(4)]
			const intOut = fourierTransformRationalIterative(intInput)
			assert.deepEqual(intOut, [
				c(10, 1, 0, 1),
				c(-2, 1, 2, 1),
				c(-2, 1, 0, 1),
				c(-2, 1, -2, 1),
			])
			assertSpectrumLowestTerms(intOut)

			const intInv = fourierTransformRationalIterative(intOut, { inverse: true })
			assert.deepEqual(intInv, [c(1, 1), c(2, 1), c(3, 1), c(4, 1)])

			const fracInput = [r(1, 3), r(-1, 2), r(2, 5), r(7, 6)]
			const fracOut = fourierTransformRationalIterative(fracInput)
			assert.deepEqual(fracOut, [
				c(7, 5, 0, 1),
				c(-1, 15, 5, 3),
				c(1, 15, 0, 1),
				c(-1, 15, -5, 3),
			])
			assertSpectrumLowestTerms(fracOut)

			const fracInv = fourierTransformRationalIterative(fracOut, { inverse: true })
			assert.deepEqual(fracInv, [
				c(1, 3, 0, 1),
				c(-1, 2, 0, 1),
				c(2, 5, 0, 1),
				c(7, 6, 0, 1),
			])
		})

		test('N = 4 complex rational input exact round-trip', () => {
			const input = [
				c(1, 2, -1, 3),
				c(3, 4, 2, 5),
				c(-7, 6, 1, 7),
				c(0, 1, -5, 8),
			]
			const forward = fourierTransformRationalIterative(input)
			assertSpectrumLowestTerms(forward)

			const recovered = fourierTransformRationalIterative(forward, { inverse: true })
			assert.deepEqual(recovered, input)
			assertSpectrumLowestTerms(recovered)
		})
	})

	describe('edge cases and normalization', () => {
		test('empty array returns empty array', () => {
			assert.deepEqual(fourierTransformRationalIterative([]), [])
			assert.deepEqual(fourierTransformRationalIterative([], { inverse: true }), [])
		})

		test('all-zero signal returns all-zero spectrum', () => {
			const zeros = [r(0), r(0), r(0), r(0), r(0)]
			const out = fourierTransformRationalIterative(zeros)
			assert.deepEqual(out, Array.from({ length: 5 }, () => c(0, 1, 0, 1)))
			assertSpectrumLowestTerms(out)
		})

		test('unit impulse returns exact 1 + 0i at every bin for arbitrary N', () => {
			for (const n of [1, 3, 5, 7, 11]) {
				const impulse = Array.from({ length: n }, (_, i) => (i === 0 ? r(1) : r(0)))
				const out = fourierTransformRationalIterative(impulse)
				assert.deepEqual(out, Array.from({ length: n }, () => c(1, 1, 0, 1)))
				assertSpectrumLowestTerms(out)
			}
		})

		test('normalizes unreduced and negative-denominator inputs', () => {
			const input = [
				{ num: 6n, den: 8n },      // 3/4
				{ num: 10n, den: -12n },   // -5/6
				{ num: 0n, den: -99n },    // 0/1
				{ num: -4n, den: -6n },    // 2/3
			]
			const out = fourierTransformRationalIterative(input)
			const normalizedInput = [r(3, 4), r(-5, 6), r(0, 1), r(2, 3)]
			assert.deepEqual(out, fourierTransformRationalIterative(normalizedInput))
			assertSpectrumLowestTerms(out)
		})

		test('exact DC, Nyquist, and quarter-rate bins for composite N = 12', () => {
			const input = [
				r(1, 2), r(1, 3), r(-1, 4), r(1, 5),
				r(1, 6), r(-1, 7), r(1, 8), r(1, 9),
				r(-1, 10), r(1, 11), r(1, 12), r(-1, 13),
			]
			const out = fourierTransformRationalIterative(input)
			assertSpectrumLowestTerms(out)

			// k = 0 (DC): exact sum of all inputs
			let expectedDc = r(0)
			// k = 6 (Nyquist): exact alternating sum
			let expectedNyquist = r(0)
			for (let i = 0; i < input.length; i++) {
				expectedDc = addRat(expectedDc, input[i])
				expectedNyquist = addRat(expectedNyquist, i % 2 === 0 ? input[i] : r(-input[i].num, input[i].den))
			}
			assert.deepEqual(out[0], { re: expectedDc, im: r(0) })
			assert.deepEqual(out[6], { re: expectedNyquist, im: r(0) })
		})

		test('handles huge BigInts beyond IEEE-754 float64 precision exactly for N = 4', () => {
			const big = 10n ** 60n
			const input = [
				r(big + 1n, 3n),
				r(big + 2n, 5n),
				r(big + 3n, 7n),
				r(big + 4n, 11n),
			]
			const forward = fourierTransformRationalIterative(input)
			assertSpectrumLowestTerms(forward)

			const recovered = fourierTransformRationalIterative(forward, { inverse: true })
			assert.deepEqual(recovered, input.map((re) => ({ re, im: r(0) })))
		})

		test('precision option improves approximation accuracy for irrational twiddles', () => {
			const input = [r(1), r(2), r(3), r(4), r(5)]
			const lowPrec = fourierTransformRationalIterative(input, { precision: 16 })
			const highPrec = fourierTransformRationalIterative(input, { precision: 128 })

			const lowRoundTrip = fourierTransformRationalIterative(lowPrec, { inverse: true, precision: 16 })
			const highRoundTrip = fourierTransformRationalIterative(highPrec, { inverse: true, precision: 128 })

			const maxErr = (recovered) => {
				let best = 0
				for (let i = 0; i < input.length; i++) {
					const errRe = Math.abs(rationalToNumber(recovered[i].re) - rationalToNumber(input[i]))
					const errIm = Math.abs(rationalToNumber(recovered[i].im))
					best = Math.max(best, errRe, errIm)
				}
				return best
			}

			const errLow = maxErr(lowRoundTrip)
			const errHigh = maxErr(highRoundTrip)
			assert.ok(errLow < 1e-3, `low precision error too large: ${errLow}`)
			assert.ok(errHigh < 1e-17, `high precision error too large: ${errHigh}`)
			assert.ok(errHigh < errLow, `expected high precision (${errHigh}) < low precision (${errLow})`)
		})
	})

	describe('independent cross-checks and mathematical invariants', () => {
		test('cross-check against independent float64 DFT for N = 3, 5, 6, 7, 8, 12', () => {
			for (const n of [3, 5, 6, 7, 8, 12]) {
				const complexInput = Array.from({ length: n }, (_, i) =>
					c(BigInt((i * 7 - 3) % 11), BigInt(i + 2), BigInt((i * 5 - 4) % 9), BigInt(i + 3))
				)

				const actualFwd = fourierTransformRationalIterative(complexInput)
				const refFwd = referenceFloatDft(complexInput, false)
				assertSpectrumLowestTerms(actualFwd)

				for (let k = 0; k < n; k++) {
					const diffRe = Math.abs(rationalToNumber(actualFwd[k].re) - refFwd[k].re)
					const diffIm = Math.abs(rationalToNumber(actualFwd[k].im) - refFwd[k].im)
					assert.ok(diffRe < 1e-12, `N=${n} k=${k} forward re diff=${diffRe}`)
					assert.ok(diffIm < 1e-12, `N=${n} k=${k} forward im diff=${diffIm}`)
				}

				const actualInv = fourierTransformRationalIterative(actualFwd, { inverse: true })
				assertSpectrumLowestTerms(actualInv)
				for (let i = 0; i < n; i++) {
					const diffRe = Math.abs(rationalToNumber(actualInv[i].re) - rationalToNumber(complexInput[i].re))
					const diffIm = Math.abs(rationalToNumber(actualInv[i].im) - rationalToNumber(complexInput[i].im))
					assert.ok(diffRe < 1e-14, `N=${n} i=${i} round-trip re diff=${diffRe}`)
					assert.ok(diffIm < 1e-14, `N=${n} i=${i} round-trip im diff=${diffIm}`)
				}
			}
		})

		test('Parseval theorem holds exactly for N = 4 and within tolerance for N = 5, 6, 8', () => {
			// Exact BigInt Parseval for N = 4
			const x4 = [c(1, 3, 1, 2), c(-2, 5, 3, 7), c(4, 9, -1, 4), c(5, 6, 2, 3)]
			const X4 = fourierTransformRationalIterative(x4)
			let timeEnergy = r(0)
			let freqEnergy = r(0)
			for (let i = 0; i < 4; i++) {
				timeEnergy = addRat(timeEnergy, addRat(mulRat(x4[i].re, x4[i].re), mulRat(x4[i].im, x4[i].im)))
				freqEnergy = addRat(freqEnergy, addRat(mulRat(X4[i].re, X4[i].re), mulRat(X4[i].im, X4[i].im)))
			}
			const scaledFreqEnergy = mulRat(freqEnergy, r(1, 4))
			assert.deepEqual(timeEnergy, scaledFreqEnergy)

			// High-precision Parseval for N = 5, 6, 8
			for (const n of [5, 6, 8]) {
				const signal = Array.from({ length: n }, (_, i) => r(BigInt(i * 3 - 4), BigInt(i + 1)))
				const spec = fourierTransformRationalIterative(signal)
				let tE = 0
				let fE = 0
				for (let i = 0; i < n; i++) {
					const v = rationalToNumber(signal[i])
					tE += v * v
					const re = rationalToNumber(spec[i].re)
					const im = rationalToNumber(spec[i].im)
					fE += re * re + im * im
				}
				assert.ok(Math.abs(tE - fE / n) < 1e-14, `Parseval mismatch for N=${n}`)
			}
		})

		test('exact linearity DFT(a*x + b*y) === a*DFT(x) + b*DFT(y) for arbitrary N', () => {
			const a = r(3, 5)
			const b = r(-7, 4)
			const x = [r(1, 2), r(-3, 7), r(5, 3), r(2, 9), r(-1, 4), r(4, 5)]
			const y = [r(-2, 3), r(4, 5), r(-1, 6), r(7, 8), r(3, 2), r(-5, 9)]
			const combined = x.map((xi, i) => addRat(mulRat(a, xi), mulRat(b, y[i])))

			const dftCombined = fourierTransformRationalIterative(combined)
			const dftX = fourierTransformRationalIterative(x)
			const dftY = fourierTransformRationalIterative(y)

			for (let k = 0; k < x.length; k++) {
				const expectedRe = addRat(mulRat(a, dftX[k].re), mulRat(b, dftY[k].re))
				const expectedIm = addRat(mulRat(a, dftX[k].im), mulRat(b, dftY[k].im))
				assert.deepEqual(dftCombined[k].re, expectedRe)
				assert.deepEqual(dftCombined[k].im, expectedIm)
			}
		})

		test('exact conjugate symmetry X[N - k] === conj(X[k]) for real signals of any N', () => {
			for (const n of [3, 5, 6, 7, 8, 9]) {
				const signal = Array.from({ length: n }, (_, i) => r(BigInt(i * 4 - 5), BigInt(i + 2)))
				const spec = fourierTransformRationalIterative(signal)
				assert.deepEqual(spec[0].im, r(0))
				for (let k = 1; k < n; k++) {
					const conjIdx = n - k
					assert.deepEqual(spec[conjIdx].re, spec[k].re)
					assert.deepEqual(spec[conjIdx].im, r(-spec[k].im.num, spec[k].im.den))
				}
			}
		})

		test('circular convolution theorem holds exactly for N = 4', () => {
			const x = [r(1, 2), r(-1, 3), r(2, 5), r(3, 4)]
			const y = [r(2, 3), r(1, 4), r(-3, 5), r(1, 6)]

			// Direct circular convolution
			const expectedConv = Array.from({ length: 4 }, (_, n) => {
				let sum = r(0)
				for (let m = 0; m < 4; m++) {
					const idx = (n - m + 4) % 4
					sum = addRat(sum, mulRat(x[m], y[idx]))
				}
				return { re: sum, im: r(0) }
			})

			const X = fourierTransformRationalIterative(x)
			const Y = fourierTransformRationalIterative(y)
			const prod = X.map((xk, k) => {
				const yk = Y[k]
				const re = addRat(mulRat(xk.re, yk.re), r(-mulRat(xk.im, yk.im).num, mulRat(xk.im, yk.im).den))
				const im = addRat(mulRat(xk.re, yk.im), mulRat(xk.im, yk.re))
				return { re, im }
			})

			const actualConv = fourierTransformRationalIterative(prod, { inverse: true })
			assert.deepEqual(actualConv, expectedConv)
		})
	})

	describe('invalid inputs', () => {
		test('rejects non-array input', () => {
			for (const bad of [null, undefined, 42, '123', {}, { num: 1n, den: 1n }]) {
				assert.throws(() => fourierTransformRationalIterative(bad), TypeError)
			}
		})

		test('rejects invalid elements', () => {
			assert.throws(() => fourierTransformRationalIterative([null]), TypeError)
			assert.throws(() => fourierTransformRationalIterative([1]), TypeError)
			assert.throws(() => fourierTransformRationalIterative([[]]), TypeError)
			assert.throws(() => fourierTransformRationalIterative([{}]), TypeError)
			assert.throws(() => fourierTransformRationalIterative([{ num: 1, den: 2 }]), TypeError)
			assert.throws(() => fourierTransformRationalIterative([{ num: 1n, den: 2 }]), TypeError)
			assert.throws(() => fourierTransformRationalIterative([{ num: 1n }]), TypeError)
			assert.throws(() => fourierTransformRationalIterative([{ re: r(1) }]), TypeError)
			assert.throws(() => fourierTransformRationalIterative([{ re: r(1), im: 0 }]), TypeError)
			assert.throws(
				() => fourierTransformRationalIterative([{ num: 1n, den: 1n, re: r(1), im: r(0) }]),
				TypeError
			)
		})

		test('rejects zero denominators', () => {
			assert.throws(() => fourierTransformRationalIterative([{ num: 1n, den: 0n }]), RangeError)
			assert.throws(() => fourierTransformRationalIterative([{ num: 0n, den: 0n }]), RangeError)
			assert.throws(
				() => fourierTransformRationalIterative([{ re: r(1), im: { num: 2n, den: 0n } }]),
				RangeError
			)
		})

		test('rejects invalid options', () => {
			assert.throws(() => fourierTransformRationalIterative([], null), TypeError)
			assert.throws(() => fourierTransformRationalIterative([], []), TypeError)
			assert.throws(() => fourierTransformRationalIterative([], 'fast'), TypeError)
			assert.throws(() => fourierTransformRationalIterative([], { inverse: 1 }), TypeError)
			assert.throws(() => fourierTransformRationalIterative([], { precision: '64' }), TypeError)
			assert.throws(() => fourierTransformRationalIterative([], { precision: 32.5 }), TypeError)
			assert.throws(() => fourierTransformRationalIterative([], { precision: NaN }), TypeError)
			assert.throws(() => fourierTransformRationalIterative([], { precision: 0 }), RangeError)
			assert.throws(() => fourierTransformRationalIterative([], { precision: -8 }), RangeError)
			assert.throws(() => fourierTransformRationalIterative([], { precision: 10000 }), RangeError)
		})
	})
})
