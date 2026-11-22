import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { fourierTransformFloatSeries } from './fourierTransformFloatSeries.js'

const EPS = 1e-11

function assertComplexClose(actual, expected, eps = EPS, message = '') {
	assert.equal(typeof actual.re, 'number', `${message} re must be number`)
	assert.equal(typeof actual.im, 'number', `${message} im must be number`)
	assert.ok(
		Math.abs(actual.re - expected.re) <= eps,
		`${message} expected re ≈ ${expected.re}, got ${actual.re} (diff ${Math.abs(actual.re - expected.re)})`
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= eps,
		`${message} expected im ≈ ${expected.im}, got ${actual.im} (diff ${Math.abs(actual.im - expected.im)})`
	)
}

function assertComplexArrayClose(actual, expected, eps = EPS) {
	assert.equal(actual.length, expected.length)
	for (let i = 0; i < expected.length; i++) {
		assertComplexClose(actual[i], expected[i], eps, `index ${i}:`)
	}
}

function energy(seq) {
	return seq.reduce((sum, x) => {
		if (typeof x === 'number') return sum + x * x
		return sum + x.re * x.re + x.im * x.im
	}, 0)
}

function circularConvolve(x, y) {
	const N = x.length
	const out = new Array(N)
	for (let n = 0; n < N; n++) {
		let re = 0
		let im = 0
		for (let m = 0; m < N; m++) {
			const a = typeof x[m] === 'number' ? { re: x[m], im: 0 } : x[m]
			const idx = (n - m + N) % N
			const b = typeof y[idx] === 'number' ? { re: y[idx], im: 0 } : y[idx]
			re += a.re * b.re - a.im * b.im
			im += a.re * b.im + a.im * b.re
		}
		out[n] = { re, im }
	}
	return out
}

describe('fourierTransformFloatSeries', () => {
	describe('analytic / normal cases', () => {
		test('unit impulse δ[n] transforms to constant 1 across all bins', () => {
			const out = fourierTransformFloatSeries([1, 0, 0, 0])
			assertComplexArrayClose(out, [
				{ re: 1, im: 0 },
				{ re: 1, im: 0 },
				{ re: 1, im: 0 },
				{ re: 1, im: 0 }
			])
		})

		test('shifted impulse δ[n - 1] produces rotating unit phasors', () => {
			const out = fourierTransformFloatSeries([0, 1, 0, 0])
			assertComplexArrayClose(out, [
				{ re: 1, im: 0 },
				{ re: 0, im: -1 },
				{ re: -1, im: 0 },
				{ re: 0, im: 1 }
			])
		})

		test('constant (DC) signal concentrates all energy in bin 0', () => {
			const c = 3.25
			const N = 6
			const input = Array(N).fill(c)
			const out = fourierTransformFloatSeries(input)
			const expected = Array.from({ length: N }, (_, k) => ({
				re: k === 0 ? c * N : 0,
				im: 0
			}))
			assertComplexArrayClose(out, expected)
		})

		test('pure cosine cos(2π·f0·n/N) yields N/2 peaks at bins f0 and N-f0', () => {
			const N = 16
			const f0 = 3
			const input = Array.from({ length: N }, (_, n) =>
				Math.cos((2 * Math.PI * f0 * n) / N)
			)
			const out = fourierTransformFloatSeries(input)
			const expected = Array.from({ length: N }, (_, k) => ({
				re: k === f0 || k === N - f0 ? N / 2 : 0,
				im: 0
			}))
			assertComplexArrayClose(out, expected)
		})

		test('pure sine sin(2π·f0·n/N) yields ±i·N/2 imaginary peaks at bins f0 and N-f0', () => {
			const N = 16
			const f0 = 5
			const input = Array.from({ length: N }, (_, n) =>
				Math.sin((2 * Math.PI * f0 * n) / N)
			)
			const out = fourierTransformFloatSeries(input)
			const expected = Array.from({ length: N }, (_, k) => ({
				re: 0,
				im: k === f0 ? -N / 2 : k === N - f0 ? N / 2 : 0
			}))
			assertComplexArrayClose(out, expected)
		})

		test('complex exponential e^{i·2π·m·n/N} transforms to single bin N at k = m', () => {
			const N = 11 // prime length
			const m = 4
			const input = Array.from({ length: N }, (_, n) => ({
				re: Math.cos((2 * Math.PI * m * n) / N),
				im: Math.sin((2 * Math.PI * m * n) / N)
			}))
			const out = fourierTransformFloatSeries(input)
			const expected = Array.from({ length: N }, (_, k) => ({
				re: k === m ? N : 0,
				im: 0
			}))
			assertComplexArrayClose(out, expected)
		})

		test('accepts mixed real numbers and { re, im } complex entries', () => {
			const mixed = [1, { re: 0, im: 2 }, -1, { re: 0, im: -2 }]
			const pureComplex = [
				{ re: 1, im: 0 },
				{ re: 0, im: 2 },
				{ re: -1, im: 0 },
				{ re: 0, im: -2 }
			]
			assertComplexArrayClose(
				fourierTransformFloatSeries(mixed),
				fourierTransformFloatSeries(pureComplex)
			)
		})

		test('inverse option reconstructs known time-domain cosine from spectrum', () => {
			const N = 8
			const spectrum = [
				{ re: 0, im: 0 },
				{ re: 4, im: 0 },
				{ re: 0, im: 0 },
				{ re: 0, im: 0 },
				{ re: 0, im: 0 },
				{ re: 0, im: 0 },
				{ re: 0, im: 0 },
				{ re: 4, im: 0 }
			]
			const out = fourierTransformFloatSeries(spectrum, { inverse: true })
			const expected = Array.from({ length: N }, (_, n) => ({
				re: Math.cos((2 * Math.PI * n) / N),
				im: 0
			}))
			assertComplexArrayClose(out, expected)
		})
	})

	describe('edge cases', () => {
		test('empty array returns empty array for forward and inverse transforms', () => {
			assert.deepEqual(fourierTransformFloatSeries([]), [])
			assert.deepEqual(fourierTransformFloatSeries([], { inverse: true }), [])
		})

		test('single-element real and complex arrays are preserved', () => {
			assert.deepEqual(fourierTransformFloatSeries([42.5]), [{ re: 42.5, im: 0 }])
			assert.deepEqual(fourierTransformFloatSeries([42.5], { inverse: true }), [
				{ re: 42.5, im: 0 }
			])
			assert.deepEqual(
				fourierTransformFloatSeries([{ re: -3.5, im: 7.25 }]),
				[{ re: -3.5, im: 7.25 }]
			)
			assert.deepEqual(
				fourierTransformFloatSeries([{ re: -3.5, im: 7.25 }], { inverse: true }),
				[{ re: -3.5, im: 7.25 }]
			)
		})

		test('all-zero input yields positive zeros (no -0)', () => {
			const out = fourierTransformFloatSeries([0, -0, 0, -0])
			for (const bin of out) {
				assert.ok(Object.is(bin.re, 0), `expected +0 for re, got ${bin.re}`)
				assert.ok(Object.is(bin.im, 0), `expected +0 for im, got ${bin.im}`)
			}
		})

		test('handles very small and large finite float64 scales accurately', () => {
			const small = [1e-100, -1e-100, 1e-100, -1e-100]
			const smallOut = fourierTransformFloatSeries(small)
			assertComplexArrayClose(
				smallOut,
				[
					{ re: 0, im: 0 },
					{ re: 0, im: 0 },
					{ re: 4e-100, im: 0 },
					{ re: 0, im: 0 }
				],
				1e-112
			)

			const large = [1e100, 1e100, 1e100, 1e100]
			const largeOut = fourierTransformFloatSeries(large)
			assertComplexArrayClose(
				largeOut,
				[
					{ re: 4e100, im: 0 },
					{ re: 0, im: 0 },
					{ re: 0, im: 0 },
					{ re: 0, im: 0 }
				],
				1e88
			)
		})

		test('throws RangeError when accumulation overflows float64', () => {
			assert.throws(
				() => fourierTransformFloatSeries([1e308, 1e308]),
				RangeError
			)
		})
	})

	describe('input validation', () => {
		test('throws TypeError when samples is not an Array', () => {
			for (const bad of [
				null,
				undefined,
				123,
				'123',
				{},
				new Float64Array([1, 2])
			]) {
				assert.throws(() => fourierTransformFloatSeries(bad), TypeError)
			}
		})

		test('throws TypeError for sparse arrays', () => {
			// eslint-disable-next-line no-sparse-arrays
			const sparse = [1, , 3]
			assert.throws(() => fourierTransformFloatSeries(sparse), TypeError)
			assert.throws(() => fourierTransformFloatSeries(new Array(4)), TypeError)
		})

		test('throws RangeError for non-finite numeric entries', () => {
			for (const bad of [NaN, Infinity, -Infinity]) {
				assert.throws(() => fourierTransformFloatSeries([1, bad, 2]), RangeError)
			}
		})

		test('throws TypeError for invalid element types', () => {
			for (const bad of ['1', null, undefined, true, [], 1n, Symbol('x')]) {
				assert.throws(() => fourierTransformFloatSeries([1, bad]), TypeError)
			}
		})

		test('throws TypeError for malformed complex objects', () => {
			for (const bad of [
				{},
				{ re: 1 },
				{ im: 2 },
				{ re: '1', im: 0 },
				{ re: 1, im: null },
				{ re: undefined, im: 0 }
			]) {
				assert.throws(() => fourierTransformFloatSeries([bad]), TypeError)
			}
		})

		test('throws RangeError for complex objects with non-finite components', () => {
			for (const bad of [
				{ re: NaN, im: 0 },
				{ re: 0, im: NaN },
				{ re: Infinity, im: 1 },
				{ re: 1, im: -Infinity }
			]) {
				assert.throws(() => fourierTransformFloatSeries([bad]), RangeError)
			}
		})

		test('throws TypeError for invalid options or options.inverse', () => {
			for (const badOpts of [null, [], 'inverse', 1, true]) {
				assert.throws(() => fourierTransformFloatSeries([1, 2], badOpts), TypeError)
			}
			for (const badInverse of [1, 0, 'true', null, {}]) {
				assert.throws(
					() => fourierTransformFloatSeries([1, 2], { inverse: badInverse }),
					TypeError
				)
			}
		})
	})

	describe('mathematical identity cross-checks', () => {
		test("Parseval's theorem holds for real and complex signals of various lengths", () => {
			const signals = [
				[1.5, -2.25, 0.75, 4.0, -1.125, 3.5, -0.5], // odd prime N = 7
				[
					{ re: 1.2, im: -0.7 },
					{ re: -3.4, im: 2.1 },
					{ re: 0.5, im: 4.8 },
					{ re: -2.2, im: -1.9 },
					{ re: 5.1, im: 0.3 }
				], // complex N = 5
				Array.from({ length: 12 }, (_, n) =>
					Math.sin(0.7 * n) + 0.5 * Math.cos(1.9 * n)
				)
			]

			for (const x of signals) {
				const X = fourierTransformFloatSeries(x)
				const timeEnergy = energy(x)
				const freqEnergy = energy(X) / x.length
				assert.ok(
					Math.abs(timeEnergy - freqEnergy) <= 1e-11 * Math.max(1, timeEnergy),
					`Parseval mismatch: time=${timeEnergy}, freq=${freqEnergy}`
				)
			}
		})

		test('IDFT(DFT(x)) === x and DFT(IDFT(X)) === X round-trip identity', () => {
			const realSig = [2.5, -1.25, 0.75, 4.125, -3.5, 1.0, 2.25, -0.5, 6.0]
			const realRoundTrip = fourierTransformFloatSeries(
				fourierTransformFloatSeries(realSig),
				{ inverse: true }
			)
			assertComplexArrayClose(
				realRoundTrip,
				realSig.map((re) => ({ re, im: 0 }))
			)

			const complexSig = [
				{ re: 1.1, im: -2.3 },
				{ re: 3.7, im: 0.9 },
				{ re: -4.2, im: 1.8 },
				{ re: 0.4, im: -3.1 },
				{ re: 2.6, im: 2.2 },
				{ re: -1.5, im: -0.6 },
				{ re: 0.8, im: 4.4 }
			]
			const forwardThenInverse = fourierTransformFloatSeries(
				fourierTransformFloatSeries(complexSig),
				{ inverse: true }
			)
			assertComplexArrayClose(forwardThenInverse, complexSig)

			const inverseThenForward = fourierTransformFloatSeries(
				fourierTransformFloatSeries(complexSig, { inverse: true })
			)
			assertComplexArrayClose(inverseThenForward, complexSig)
		})

		test('conjugate symmetry X[N - k] = conj(X[k]) holds for real inputs', () => {
			const x = [0.5, -1.2, 3.3, 2.7, -4.1, 1.9, 0.8, -2.5, 1.4]
			const N = x.length
			const X = fourierTransformFloatSeries(x)
			assert.ok(Math.abs(X[0].im) <= EPS)
			for (let k = 1; k < N; k++) {
				assertComplexClose(X[N - k], { re: X[k].re, im: -X[k].im })
			}
		})

		test('linearity DFT(a·x + b·y) === a·DFT(x) + b·DFT(y)', () => {
			const a = 2.5
			const b = -1.75
			const x = [1, -2, 3.5, 0.5, -1.5, 4]
			const y = [-0.5, 2.25, 1, -3, 0.75, 2]
			const combined = x.map((v, i) => a * v + b * y[i])

			const X = fourierTransformFloatSeries(x)
			const Y = fourierTransformFloatSeries(y)
			const Z = fourierTransformFloatSeries(combined)

			const expected = X.map((xk, k) => ({
				re: a * xk.re + b * Y[k].re,
				im: a * xk.im + b * Y[k].im
			}))
			assertComplexArrayClose(Z, expected)
		})

		test('circular convolution theorem: DFT(x ⊛ y) === DFT(x) · DFT(y)', () => {
			const x = [
				{ re: 1.2, im: 0.5 },
				{ re: -0.8, im: 1.4 },
				{ re: 2.1, im: -1.1 },
				{ re: 0.3, im: 0.7 },
				{ re: -1.5, im: -0.4 },
				{ re: 0.9, im: 1.2 }
			]
			const y = [
				{ re: -0.6, im: 1.1 },
				{ re: 1.7, im: -0.3 },
				{ re: 0.4, im: 0.9 },
				{ re: -2.0, im: -0.8 },
				{ re: 1.3, im: 0.2 },
				{ re: -0.5, im: 1.6 }
			]

			const convTime = circularConvolve(x, y)
			const lhs = fourierTransformFloatSeries(convTime)

			const X = fourierTransformFloatSeries(x)
			const Y = fourierTransformFloatSeries(y)
			const rhs = X.map((xk, k) => ({
				re: xk.re * Y[k].re - xk.im * Y[k].im,
				im: xk.re * Y[k].im + xk.im * Y[k].re
			}))

			assertComplexArrayClose(lhs, rhs)
		})
	})
})
