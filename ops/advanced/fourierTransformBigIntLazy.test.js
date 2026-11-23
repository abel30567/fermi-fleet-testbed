import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
	fourierTransformBigIntLazy,
	FIXED_POINT_SCALE as SCALE,
} from './fourierTransformBigIntLazy.js'

/**
 * Independent reference DFT using standard IEEE-754 Math.cos / Math.sin
 * for cross-checking against our pure-BigInt implementation.
 */
function referenceFloatDft(samples, inverse = false) {
	const N = samples.length
	const sign = inverse ? 1 : -1
	const out = []
	for (let k = 0; k < N; k++) {
		let re = 0
		let im = 0
		for (let n = 0; n < N; n++) {
			const s = typeof samples[n] === 'bigint'
				? { re: Number(samples[n]), im: 0 }
				: { re: Number(samples[n].re), im: Number(samples[n].im ?? 0n) }
			const angle = (sign * 2 * Math.PI * k * n) / N
			const c = Math.cos(angle)
			const sn = Math.sin(angle)
			re += s.re * c - s.im * sn
			im += s.re * sn + s.im * c
		}
		if (inverse) {
			re /= N
			im /= N
		}
		out.push({ re, im })
	}
	return out
}

function absBigInt(x) {
	return x < 0n ? -x : x
}

describe('fourierTransformBigIntLazy', () => {
	describe('exact analytical & normal cases', () => {
		it('computes exact DFT of a unit impulse [1n, 0n, 0n, 0n, 0n]', () => {
			const result = [...fourierTransformBigIntLazy([1n, 0n, 0n, 0n, 0n])]
			assert.equal(result.length, 5)
			for (const bin of result) {
				assert.deepEqual(bin, { re: SCALE, im: 0n })
			}
		})

		it('computes exact DFT of a constant signal', () => {
			const result = [...fourierTransformBigIntLazy([7n, 7n, 7n, 7n])]
			assert.deepEqual(result, [
				{ re: 28n * SCALE, im: 0n },
				{ re: 0n, im: 0n },
				{ re: 0n, im: 0n },
				{ re: 0n, im: 0n },
			])
		})

		it('computes exact cardinal-angle DFT for [1n, 2n, 3n, 4n]', () => {
			// X[0] = 10, X[1] = -2 + 2i, X[2] = -2, X[3] = -2 - 2i
			const result = [...fourierTransformBigIntLazy([1n, 2n, 3n, 4n])]
			assert.deepEqual(result, [
				{ re: 10n * SCALE, im: 0n },
				{ re: -2n * SCALE, im: 2n * SCALE },
				{ re: -2n * SCALE, im: 0n },
				{ re: -2n * SCALE, im: -2n * SCALE },
			])
		})

		it('achieves full 18-digit fixed-point precision for irrational angle N=3', () => {
			// x = [1n, 1n, 0n]
			// X[0] = 2
			// X[1] = 1 + exp(-2*pi*i/3) = 0.5 - i * sqrt(3)/2
			//   sqrt(3)/2 = 0.86602540378443864676372317...
			//   rounded to 10^18: 866025403784438647n
			// X[2] = 0.5 + i * sqrt(3)/2
			const result = [...fourierTransformBigIntLazy([1n, 1n, 0n])]
			assert.deepEqual(result, [
				{ re: 2n * SCALE, im: 0n },
				{ re: 500_000_000_000_000_000n, im: -866_025_403_784_438_647n },
				{ re: 500_000_000_000_000_000n, im: 866_025_403_784_438_647n },
			])
		})

		it('handles complex BigInt inputs (including omitted im defaulting to 0n)', () => {
			const input = [{ re: 1n }, { re: 0n, im: 1n }, { re: -1n, im: 0n }, { re: 0n, im: -1n }]
			// This is e^{i * pi * n / 2}, i.e., frequency bin k = 1 with amplitude 4
			const result = [...fourierTransformBigIntLazy(input)]
			assert.deepEqual(result, [
				{ re: 0n, im: 0n },
				{ re: 4n * SCALE, im: 0n },
				{ re: 0n, im: 0n },
				{ re: 0n, im: 0n },
			])
		})

		it('preserves full precision on huge BigInt inputs beyond IEEE-754 range', () => {
			const big = 10n ** 40n
			// x = [big, big, 0n]: X[1].re = 0.5 * big * 10^18, X[1].im = -(sqrt(3)/2) * big * 10^18
			const result = [...fourierTransformBigIntLazy([big, big, 0n])]
			assert.equal(result[0].re, 2n * big * SCALE)
			assert.equal(result[0].im, 0n)
			assert.equal(result[1].re, (big * SCALE) / 2n)
			// Verify (2 * X[1].im)^2 ≈ 3 * (big * SCALE)^2 to within 1 ULP of 10^-18
			const im2 = result[1].im * 2n
			const expectedSq = 3n * (big * SCALE) * (big * SCALE)
			const diff = absBigInt(im2 * im2 - expectedSq)
			// Error from rounding im by at most 1 gives |4*im^2 - 3*B^2| <= 8*|im| + 4
			assert.ok(diff <= 8n * absBigInt(result[1].im) + 4n)
		})

		it('supports custom fixed-point scale option', () => {
			const scale = 10n ** 6n
			const result = [...fourierTransformBigIntLazy([1n, 1n, 0n], { scale })]
			assert.deepEqual(result, [
				{ re: 2_000_000n, im: 0n },
				{ re: 500_000n, im: -866_025n },
				{ re: 500_000n, im: 866_025n },
			])
		})
	})

	describe('edge cases', () => {
		it('yields nothing for an empty iterable', () => {
			assert.deepEqual([...fourierTransformBigIntLazy([])], [])
		})

		it('handles a single-element sequence', () => {
			assert.deepEqual([...fourierTransformBigIntLazy([-42n])], [
				{ re: -42n * SCALE, im: 0n },
			])
		})

		it('handles all-zero sequence', () => {
			const result = [...fourierTransformBigIntLazy([0n, 0n, 0n])]
			assert.deepEqual(result, [
				{ re: 0n, im: 0n },
				{ re: 0n, im: 0n },
				{ re: 0n, im: 0n },
			])
		})

		it('handles maxLength = 0 without pulling any elements from the iterable', () => {
			let pulled = 0
			function* source() {
				pulled += 1
				yield 1n
			}
			const result = [...fourierTransformBigIntLazy(source(), { maxLength: 0 })]
			assert.deepEqual(result, [])
			assert.equal(pulled, 0)
		})

		it('handles maxLength greater than actual iterable length', () => {
			const result = [...fourierTransformBigIntLazy([1n, 2n], { maxLength: 10 })]
			assert.deepEqual(result, [
				{ re: 3n * SCALE, im: 0n },
				{ re: -1n * SCALE, im: 0n },
			])
		})

		it('accepts non-array iterables such as Set', () => {
			const result = [...fourierTransformBigIntLazy(new Set([1n, 2n, 3n, 4n]))]
			assert.deepEqual(result[0], { re: 10n * SCALE, im: 0n })
			assert.equal(result.length, 4)
		})
	})

	describe('lazy & streaming generator semantics', () => {
		it('defers consuming the input iterable until .next() is invoked', () => {
			let consumed = 0
			function* source() {
				for (const v of [1n, 2n, 3n, 4n]) {
					consumed += 1
					yield v
				}
			}

			const gen = fourierTransformBigIntLazy(source())
			assert.equal(consumed, 0, 'should not pull from input before iteration starts')

			const first = gen.next()
			assert.equal(consumed, 4)
			assert.equal(first.done, false)
			assert.deepEqual(first.value, { re: 10n * SCALE, im: 0n })
		})

		it('lazily consumes an infinite generator with maxLength and runs producer cleanup', () => {
			let pulled = 0
			let closed = false
			function* infiniteNaturalNumbers() {
				try {
					let n = 1n
					while (true) {
						pulled += 1
						yield n
						n += 1n
					}
				} finally {
					closed = true
				}
			}

			const gen = fourierTransformBigIntLazy(infiniteNaturalNumbers(), { maxLength: 4 })
			assert.equal(pulled, 0)
			assert.equal(closed, false)

			const bins = [...gen]
			assert.equal(pulled, 4, 'must pull strictly maxLength elements')
			assert.equal(closed, true, 'must close source iterator via return()')
			assert.deepEqual(bins, [
				{ re: 10n * SCALE, im: 0n },
				{ re: -2n * SCALE, im: 2n * SCALE },
				{ re: -2n * SCALE, im: 0n },
				{ re: -2n * SCALE, im: -2n * SCALE },
			])
		})

		it('computes only requested bins lazily via options.bins and closes bin iterator on break', () => {
			let binsPulled = 0
			let binsClosed = false
			function* requestedBins() {
				try {
					for (const k of [0, 2, 1, 3]) {
						binsPulled += 1
						yield k
					}
				} finally {
					binsClosed = true
				}
			}

			const collected = []
			for (const val of fourierTransformBigIntLazy([1n, 2n, 3n, 4n], { bins: requestedBins() })) {
				collected.push(val)
				if (collected.length === 2) break
			}

			assert.equal(binsPulled, 2, 'must only pull as many bin indices as consumed')
			assert.equal(binsClosed, true, 'must close bins iterator on early break')
			assert.deepEqual(collected, [
				{ re: 10n * SCALE, im: 0n }, // k = 0
				{ re: -2n * SCALE, im: 0n }, // k = 2
			])
		})

		it('supports streaming composition: piping forward generator directly into inverse generator', () => {
			const signal = [5n, -3n, 12n, 0n, -7n, 4n, 9n]
			const forwardStream = fourierTransformBigIntLazy(signal)
			const inverseStream = fourierTransformBigIntLazy(forwardStream, {
				inverse: true,
				inputScaled: true,
			})
			const recovered = [...inverseStream]

			assert.equal(recovered.length, signal.length)
			for (let n = 0; n < signal.length; n++) {
				assert.ok(
					absBigInt(recovered[n].re - signal[n] * SCALE) <= 1n,
					`re[${n}] mismatch: ${recovered[n].re} vs ${signal[n] * SCALE}`,
				)
				assert.ok(
					absBigInt(recovered[n].im) <= 1n,
					`im[${n}] should be ~0, got ${recovered[n].im}`,
				)
			}
		})
	})

	describe('independent cross-checks', () => {
		it('matches independent floating-point Math.cos/sin DFT across prime and composite lengths', () => {
			const testSignals = [
				[3n, -1n, 4n, 1n, 5n], // prime N = 5
				[2n, 0n, -5n, 8n, -3n, 1n, 7n, -4n], // power-of-two N = 8
				[
					{ re: 2n, im: -3n },
					{ re: -1n, im: 4n },
					{ re: 5n, im: 1n },
					{ re: 0n, im: -2n },
					{ re: 3n, im: 3n },
					{ re: -4n, im: 2n },
				], // complex N = 6
			]

			for (const sig of testSignals) {
				const bigIntDft = [...fourierTransformBigIntLazy(sig)]
				const floatDft = referenceFloatDft(sig, false)

				assert.equal(bigIntDft.length, floatDft.length)
				for (let k = 0; k < floatDft.length; k++) {
					const reFloat = Number(bigIntDft[k].re) / 1e18
					const imFloat = Number(bigIntDft[k].im) / 1e18
					assert.ok(
						Math.abs(reFloat - floatDft[k].re) < 1e-12,
						`re[${k}] diverged: ${reFloat} vs ${floatDft[k].re}`,
					)
					assert.ok(
						Math.abs(imFloat - floatDft[k].im) < 1e-12,
						`im[${k}] diverged: ${imFloat} vs ${floatDft[k].im}`,
					)
				}
			}
		})

		it("satisfies Parseval's energy conservation theorem in exact BigInt arithmetic", () => {
			// sum_{n=0}^{N-1} |x[n]|^2 === (1/N) * sum_{k=0}^{N-1} |X[k]|^2
			const signal = [
				{ re: 11n, im: -7n },
				{ re: -23n, im: 19n },
				{ re: 5n, im: 31n },
				{ re: -13n, im: -2n },
				{ re: 17n, im: 29n },
				{ re: 41n, im: -37n },
				{ re: -3n, im: 13n },
			]
			const N = BigInt(signal.length)
			const timeEnergy = signal.reduce((acc, s) => acc + s.re * s.re + s.im * s.im, 0n)

			const spectrum = [...fourierTransformBigIntLazy(signal)]
			const freqEnergyScaled2 = spectrum.reduce(
				(acc, b) => acc + b.re * b.re + b.im * b.im,
				0n,
			)
			// Compare timeEnergy * N * SCALE^2 with freqEnergyScaled2
			const expected = timeEnergy * N * SCALE * SCALE
			const relTolerance = 10n * N * SCALE * 1000n // tiny bound relative to ~10^40 magnitude
			assert.ok(
				absBigInt(freqEnergyScaled2 - expected) <= relTolerance,
				`Parseval energy mismatch: diff=${absBigInt(freqEnergyScaled2 - expected)}`,
			)
		})

		it('satisfies Hermitian conjugate symmetry for real inputs: X[N - k] = conj(X[k])', () => {
			const signal = [13n, -7n, 29n, 0n, -41n, 17n, 3n, -19n, 5n]
			const N = signal.length
			const spectrum = [...fourierTransformBigIntLazy(signal)]

			assert.equal(spectrum[0].im, 0n)
			for (let k = 1; k < N; k++) {
				assert.equal(spectrum[N - k].re, spectrum[k].re)
				assert.equal(spectrum[N - k].im, -spectrum[k].im)
			}
		})

		it('satisfies linearity: DFT(a*x + b*y) = a*DFT(x) + b*DFT(y)', () => {
			const x = [2n, -5n, 8n, 1n, -3n]
			const y = [-4n, 7n, 0n, -9n, 6n]
			const a = 3n
			const b = -2n
			const combined = x.map((v, i) => a * v + b * y[i])

			const X = [...fourierTransformBigIntLazy(x)]
			const Y = [...fourierTransformBigIntLazy(y)]
			const Z = [...fourierTransformBigIntLazy(combined)]

			for (let k = 0; k < x.length; k++) {
				assert.ok(absBigInt(Z[k].re - (a * X[k].re + b * Y[k].re)) <= 5n)
				assert.ok(absBigInt(Z[k].im - (a * X[k].im + b * Y[k].im)) <= 5n)
			}
		})
	})

	describe('input validation', () => {
		it('eagerly throws TypeError for non-iterable or string samples', () => {
			for (const bad of [null, undefined, 42, 42n, '1234', {}, true]) {
				assert.throws(() => fourierTransformBigIntLazy(bad), TypeError)
			}
		})

		it('eagerly throws for invalid options', () => {
			assert.throws(() => fourierTransformBigIntLazy([], null), TypeError)
			assert.throws(() => fourierTransformBigIntLazy([], []), TypeError)
			assert.throws(() => fourierTransformBigIntLazy([], { inverse: 1 }), TypeError)
			assert.throws(() => fourierTransformBigIntLazy([], { inputScaled: 'yes' }), TypeError)
			assert.throws(() => fourierTransformBigIntLazy([], { maxLength: '4' }), TypeError)
			assert.throws(() => fourierTransformBigIntLazy([], { maxLength: -1 }), RangeError)
			assert.throws(() => fourierTransformBigIntLazy([], { maxLength: 1.5 }), RangeError)
			assert.throws(() => fourierTransformBigIntLazy([], { maxLength: Infinity }), RangeError)
			assert.throws(() => fourierTransformBigIntLazy([], { scale: 1000 }), TypeError)
			assert.throws(() => fourierTransformBigIntLazy([], { scale: 0n }), RangeError)
			assert.throws(() => fourierTransformBigIntLazy([], { scale: -10n }), RangeError)
			assert.throws(() => fourierTransformBigIntLazy([], { bins: '01' }), TypeError)
			assert.throws(() => fourierTransformBigIntLazy([], { bins: 123 }), TypeError)
		})

		it('throws TypeError on invalid sample values during iteration and closes iterator', () => {
			for (const badSample of [1, NaN, null, undefined, '1', [], {}, { re: 1 }, { re: 1n, im: 2 }]) {
				let closed = false
				function* src() {
					try {
						yield 1n
						yield badSample
						yield 2n
					} finally {
						closed = true
					}
				}
				assert.throws(() => [...fourierTransformBigIntLazy(src())], TypeError)
				assert.equal(closed, true)
			}
		})

		it('throws on invalid or out-of-range bin indices in options.bins', () => {
			assert.throws(
				() => [...fourierTransformBigIntLazy([1n, 2n], { bins: [2] })],
				RangeError,
			)
			assert.throws(
				() => [...fourierTransformBigIntLazy([1n, 2n], { bins: [-1n] })],
				RangeError,
			)
			assert.throws(
				() => [...fourierTransformBigIntLazy([1n, 2n], { bins: [1.5] })],
				RangeError,
			)
			assert.throws(
				() => [...fourierTransformBigIntLazy([1n, 2n], { bins: ['0'] })],
				TypeError,
			)
			assert.throws(
				() => [...fourierTransformBigIntLazy([], { bins: [0] })],
				RangeError,
			)
		})
	})
})
