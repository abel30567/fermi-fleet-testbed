import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { fourierTransformComplexSeries } from './fourierTransformComplexSeries.js'

const EPS = 1e-10

/**
 * Independent direct O(N^2) DFT / IDFT reference implementation using Euler's
 * formula directly from the mathematical definition.
 */
function directDFT(series, { inverse = false, normalization = 'standard' } = {}) {
	const n = series.length
	if (n === 0) return []
	const sign = inverse ? 1 : -1
	let scale = 1
	if (normalization === 'standard') {
		scale = inverse ? 1 / n : 1
	} else if (normalization === 'unitary') {
		scale = 1 / Math.sqrt(n)
	}

	const out = new Array(n)
	for (let k = 0; k < n; k++) {
		let sumRe = 0
		let sumIm = 0
		for (let m = 0; m < n; m++) {
			const angle = (sign * 2 * Math.PI * k * m) / n
			const c = Math.cos(angle)
			const s = Math.sin(angle)
			sumRe += series[m].re * c - series[m].im * s
			sumIm += series[m].re * s + series[m].im * c
		}
		out[k] = { re: sumRe * scale, im: sumIm * scale }
	}
	return out
}

/** Deterministic PRNG (Mulberry32) for reproducible test signals. */
function mulberry32(seed) {
	let a = seed >>> 0
	return () => {
		a |= 0
		a = (a + 0x6d2b79f5) | 0
		let t = Math.imul(a ^ (a >>> 15), 1 | a)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

function makeComplexSignal(n, seed) {
	const rng = mulberry32(seed)
	return Array.from({ length: n }, () => ({
		re: rng() * 20 - 10,
		im: rng() * 20 - 10,
	}))
}

function assertComplexNear(actual, expected, tol = EPS, label = '') {
	assert.equal(typeof actual.re, 'number', `${label} re should be a number`)
	assert.equal(typeof actual.im, 'number', `${label} im should be a number`)
	assert.ok(
		Math.abs(actual.re - expected.re) <= tol,
		`${label} re mismatch: got ${actual.re}, expected ${expected.re} (diff ${Math.abs(actual.re - expected.re)})`,
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= tol,
		`${label} im mismatch: got ${actual.im}, expected ${expected.im} (diff ${Math.abs(actual.im - expected.im)})`,
	)
}

function assertSeriesNear(actual, expected, tol = EPS, label = 'series') {
	assert.equal(actual.length, expected.length, `${label} length mismatch`)
	for (let i = 0; i < expected.length; i++) {
		assertComplexNear(actual[i], expected[i], tol, `${label}[${i}]`)
	}
}

function energy(series) {
	return series.reduce((acc, z) => acc + z.re * z.re + z.im * z.im, 0)
}

describe('fourierTransformComplexSeries', () => {
	describe('edge cases and closed-form analytical transforms', () => {
		test('empty series returns empty array', () => {
			assert.deepStrictEqual(fourierTransformComplexSeries([]), [])
			assert.deepStrictEqual(fourierTransformComplexSeries([], { inverse: true }), [])
			assert.deepStrictEqual(
				fourierTransformComplexSeries([], { normalization: 'unitary' }),
				[],
			)
		})

		test('single-element series returns identical complex value without aliasing', () => {
			const input = [{ re: 3.5, im: -2.25 }]
			const out = fourierTransformComplexSeries(input)
			assert.deepStrictEqual(out, [{ re: 3.5, im: -2.25 }])
			assert.notStrictEqual(out, input)
			assert.notStrictEqual(out[0], input[0])

			const inv = fourierTransformComplexSeries(input, { inverse: true })
			assert.deepStrictEqual(inv, [{ re: 3.5, im: -2.25 }])
		})

		test('classic 4-point DFT [1, 2, 3, 4]', () => {
			const input = [
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
			assertSeriesNear(fourierTransformComplexSeries(input), expected)
		})

		test('unit impulse transforms to constant 1 for power-of-2 and prime lengths', () => {
			for (const n of [4, 7, 8, 13, 16]) {
				const impulse = Array.from({ length: n }, (_, i) => ({
					re: i === 0 ? 1 : 0,
					im: 0,
				}))
				const expected = Array.from({ length: n }, () => ({ re: 1, im: 0 }))
				assertSeriesNear(fourierTransformComplexSeries(impulse), expected, EPS, `impulse N=${n}`)
			}
		})

		test('shifted impulse delta[n - n0] transforms to exp(-i * 2*pi*k*n0 / N)', () => {
			for (const [n, n0] of [
				[8, 3],
				[7, 4],
				[11, 5],
			]) {
				const signal = Array.from({ length: n }, (_, i) => ({
					re: i === n0 ? 1 : 0,
					im: 0,
				}))
				const expected = Array.from({ length: n }, (_, k) => ({
					re: Math.cos((-2 * Math.PI * k * n0) / n),
					im: Math.sin((-2 * Math.PI * k * n0) / n),
				}))
				assertSeriesNear(fourierTransformComplexSeries(signal), expected, EPS, `shift N=${n}`)
			}
		})

		test('pure complex exponential produces single spectral peak of height N', () => {
			for (const [n, k0] of [
				[8, 3],
				[9, 4],
				[13, 7],
			]) {
				const signal = Array.from({ length: n }, (_, m) => ({
					re: Math.cos((2 * Math.PI * k0 * m) / n),
					im: Math.sin((2 * Math.PI * k0 * m) / n),
				}))
				const expected = Array.from({ length: n }, (_, k) => ({
					re: k === k0 ? n : 0,
					im: 0,
				}))
				assertSeriesNear(fourierTransformComplexSeries(signal), expected, EPS, `exp N=${n}`)
			}
		})

		test('real cosine signal produces symmetric peaks of N/2 at k0 and N-k0', () => {
			const n = 12
			const k0 = 5
			const signal = Array.from({ length: n }, (_, m) => ({
				re: Math.cos((2 * Math.PI * k0 * m) / n),
				im: 0,
			}))
			const expected = Array.from({ length: n }, (_, k) => ({
				re: k === k0 || k === n - k0 ? n / 2 : 0,
				im: 0,
			}))
			assertSeriesNear(fourierTransformComplexSeries(signal), expected)
		})

		test('normalizes negative zero to positive zero in output', () => {
			const out = fourierTransformComplexSeries([{ re: -0, im: -0 }])
			assert.ok(Object.is(out[0].re, 0))
			assert.ok(Object.is(out[0].im, 0))
		})
	})

	describe('cross-checks against independent direct O(N^2) DFT', () => {
		const lengths = [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 15, 16, 17, 24, 31, 32, 37, 64]

		test('forward DFT matches direct Euler summation across power-of-2, composite, and prime lengths', () => {
			for (const n of lengths) {
				const signal = makeComplexSignal(n, 1000 + n)
				const actual = fourierTransformComplexSeries(signal)
				const expected = directDFT(signal)
				assertSeriesNear(actual, expected, 1e-9, `forward N=${n}`)
			}
		})

		test('inverse DFT matches direct Euler summation across all tested lengths', () => {
			for (const n of lengths) {
				const signal = makeComplexSignal(n, 2000 + n)
				const actual = fourierTransformComplexSeries(signal, { inverse: true })
				const expected = directDFT(signal, { inverse: true })
				assertSeriesNear(actual, expected, 1e-9, `inverse N=${n}`)
			}
		})

		test('unitary and unnormalized modes match direct DFT reference', () => {
			for (const n of [5, 8, 13, 16]) {
				const signal = makeComplexSignal(n, 3000 + n)
				for (const normalization of ['unitary', 'none']) {
					for (const inverse of [false, true]) {
						const opts = { inverse, normalization }
						const actual = fourierTransformComplexSeries(signal, opts)
						const expected = directDFT(signal, opts)
						assertSeriesNear(actual, expected, 1e-9, `N=${n} ${normalization} inv=${inverse}`)
					}
				}
			}
		})
	})

	describe('fundamental Fourier identities', () => {
		test('round-trip identity: IDFT(DFT(x)) === x and DFT(IDFT(X)) === X', () => {
			for (const n of [2, 3, 7, 8, 12, 19, 32, 53]) {
				const signal = makeComplexSignal(n, 4000 + n)

				// Standard normalization
				const freq = fourierTransformComplexSeries(signal)
				const recovered = fourierTransformComplexSeries(freq, { inverse: true })
				assertSeriesNear(recovered, signal, 1e-9, `standard round-trip N=${n}`)

				const back = fourierTransformComplexSeries(recovered)
				assertSeriesNear(back, freq, 1e-9, `standard reverse round-trip N=${n}`)

				// Unitary normalization
				const uFreq = fourierTransformComplexSeries(signal, { normalization: 'unitary' })
				const uRec = fourierTransformComplexSeries(uFreq, {
					inverse: true,
					normalization: 'unitary',
				})
				assertSeriesNear(uRec, signal, 1e-9, `unitary round-trip N=${n}`)
			}
		})

		test("Parseval's theorem holds for standard and unitary normalizations", () => {
			for (const n of [3, 6, 8, 11, 16, 29]) {
				const signal = makeComplexSignal(n, 5000 + n)
				const timeEnergy = energy(signal)

				const stdSpec = fourierTransformComplexSeries(signal)
				const stdFreqEnergy = energy(stdSpec) / n
				assert.ok(
					Math.abs(timeEnergy - stdFreqEnergy) <= 1e-8 * Math.max(1, timeEnergy),
					`Standard Parseval failed for N=${n}: time=${timeEnergy}, freq/N=${stdFreqEnergy}`,
				)

				const unitSpec = fourierTransformComplexSeries(signal, { normalization: 'unitary' })
				const unitFreqEnergy = energy(unitSpec)
				assert.ok(
					Math.abs(timeEnergy - unitFreqEnergy) <= 1e-8 * Math.max(1, timeEnergy),
					`Unitary Parseval failed for N=${n}: time=${timeEnergy}, freq=${unitFreqEnergy}`,
				)
			}
		})

		test('linearity: F(a*x + b*y) === a*F(x) + b*F(y) for complex scalars', () => {
			const alpha = { re: 2.5, im: -1.75 }
			const beta = { re: -0.6, im: 3.2 }
			const mul = (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re })
			const add = (a, b) => ({ re: a.re + b.re, im: a.im + b.im })

			for (const n of [5, 8, 13, 16]) {
				const x = makeComplexSignal(n, 6000 + n)
				const y = makeComplexSignal(n, 7000 + n)
				const combined = x.map((xi, i) => add(mul(alpha, xi), mul(beta, y[i])))

				const lhs = fourierTransformComplexSeries(combined)
				const fx = fourierTransformComplexSeries(x)
				const fy = fourierTransformComplexSeries(y)
				const rhs = fx.map((fxi, i) => add(mul(alpha, fxi), mul(beta, fy[i])))

				assertSeriesNear(lhs, rhs, 1e-9, `linearity N=${n}`)
			}
		})

		test('circular convolution theorem: DFT(x (*) y) === DFT(x) * DFT(y)', () => {
			for (const n of [5, 8, 11, 16]) {
				const x = makeComplexSignal(n, 8000 + n)
				const y = makeComplexSignal(n, 9000 + n)

				// Direct O(N^2) circular convolution
				const conv = Array.from({ length: n }, (_, k) => {
					let re = 0
					let im = 0
					for (let m = 0; m < n; m++) {
						const idx = (k - m + n) % n
						re += x[m].re * y[idx].re - x[m].im * y[idx].im
						im += x[m].re * y[idx].im + x[m].im * y[idx].re
					}
					return { re, im }
				})

				const fx = fourierTransformComplexSeries(x)
				const fy = fourierTransformComplexSeries(y)
				const prod = fx.map((a, i) => ({
					re: a.re * fy[i].re - a.im * fy[i].im,
					im: a.re * fy[i].im + a.im * fy[i].re,
				}))
				const convViaFFT = fourierTransformComplexSeries(prod, { inverse: true })

				assertSeriesNear(convViaFFT, conv, 1e-8, `circular convolution N=${n}`)
			}
		})

		test('conjugate symmetry for purely real signals: X[N - k] === conj(X[k])', () => {
			for (const n of [7, 8, 14, 16]) {
				const rng = mulberry32(10000 + n)
				const realSignal = Array.from({ length: n }, () => ({
					re: rng() * 10 - 5,
					im: 0,
				}))
				const spec = fourierTransformComplexSeries(realSignal)
				for (let k = 1; k < n; k++) {
					assertComplexNear(
						spec[n - k],
						{ re: spec[k].re, im: -spec[k].im },
						1e-9,
						`conjugate symmetry N=${n} k=${k}`,
					)
				}
			}
		})

		test('four-fold DFT periodicity: F^4(x) === N^2 * x', () => {
			for (const n of [5, 8, 13]) {
				const x = makeComplexSignal(n, 11000 + n)
				let cur = x
				for (let i = 0; i < 4; i++) {
					cur = fourierTransformComplexSeries(cur)
				}
				const expected = x.map((z) => ({ re: z.re * n * n, im: z.im * n * n }))
				assertSeriesNear(cur, expected, 1e-7, `F^4 N=${n}`)
			}
		})

		test('does not mutate input array or element objects', () => {
			const original = makeComplexSignal(9, 12345)
			const snapshot = original.map((z) => ({ re: z.re, im: z.im }))
			fourierTransformComplexSeries(original)
			fourierTransformComplexSeries(original, { inverse: true })
			assert.deepStrictEqual(original, snapshot)
		})
	})

	describe('input validation', () => {
		test('throws TypeError when series is not an Array', () => {
			for (const invalid of [null, undefined, 42, 'abc', {}, new Float64Array([1, 2])]) {
				assert.throws(() => fourierTransformComplexSeries(invalid), TypeError)
			}
		})

		test('throws TypeError when any element is not a valid { re, im } object', () => {
			for (const badElem of [
				null,
				undefined,
				1,
				'1+2i',
				[1, 2],
				{},
				{ re: 1 },
				{ im: 2 },
				{ re: '1', im: 0 },
				{ re: 0, im: null },
			]) {
				assert.throws(
					() => fourierTransformComplexSeries([{ re: 1, im: 0 }, badElem]),
					TypeError,
				)
			}
		})

		test('throws RangeError when any re or im is NaN or infinite', () => {
			for (const badElem of [
				{ re: Number.NaN, im: 0 },
				{ re: 0, im: Number.NaN },
				{ re: Number.POSITIVE_INFINITY, im: 0 },
				{ re: 0, im: Number.NEGATIVE_INFINITY },
			]) {
				assert.throws(() => fourierTransformComplexSeries([badElem]), RangeError)
			}
		})

		test('throws TypeError for invalid options container or option types', () => {
			const valid = [{ re: 1, im: 0 }]
			for (const badOpts of [null, 123, 'inverse', []]) {
				assert.throws(() => fourierTransformComplexSeries(valid, badOpts), TypeError)
			}
			assert.throws(() => fourierTransformComplexSeries(valid, { inverse: 'true' }), TypeError)
			assert.throws(() => fourierTransformComplexSeries(valid, { inverse: 1 }), TypeError)
			assert.throws(() => fourierTransformComplexSeries(valid, { normalization: 1 }), TypeError)
		})

		test('throws RangeError for unrecognized normalization mode', () => {
			const valid = [{ re: 1, im: 0 }]
			assert.throws(
				() => fourierTransformComplexSeries(valid, { normalization: 'ortho' }),
				RangeError,
			)
		})
	})
})
