import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { fourierTransformDualIterative } from './fourierTransformDualIterative.js'

const EPS = 1e-11

function assertClose(actual, expected, tol = EPS, label = '') {
	const diff = Math.abs(actual - expected)
	assert.ok(
		diff <= tol,
		`${label ? `${label}: ` : ''}expected ${actual} to be within ${tol} of ${expected} (diff=${diff})`,
	)
}

function assertComplexDualClose(actual, expected, tol = EPS, label = '') {
	assertClose(actual.re.v, expected.re.v, tol, `${label}.re.v`)
	assertClose(actual.re.d, expected.re.d, tol, `${label}.re.d`)
	assertClose(actual.im.v, expected.im.v, tol, `${label}.im.v`)
	assertClose(actual.im.d, expected.im.d, tol, `${label}.im.d`)
}

describe('fourierTransformDualIterative', () => {
	describe('edge cases', () => {
		test('returns an empty array for empty input', () => {
			assert.deepStrictEqual(fourierTransformDualIterative([]), [])
			assert.deepStrictEqual(
				fourierTransformDualIterative([], { inverse: true }),
				[],
			)
		})

		test('handles single-element real dual signal', () => {
			const input = [{ v: 3.5, d: -1.25 }]
			const out = fourierTransformDualIterative(input)
			assert.equal(out.length, 1)
			assert.deepStrictEqual(out[0], {
				re: { v: 3.5, d: -1.25 },
				im: { v: 0, d: 0 },
			})
		})

		test('handles single-element complex dual signal', () => {
			const input = [{ re: { v: 2, d: 5 }, im: { v: -3, d: 7 } }]
			const out = fourierTransformDualIterative(input)
			assert.deepStrictEqual(out, input)
		})

		test('handles all-zero signal without -0 artifacts', () => {
			const input = [
				{ v: 0, d: 0 },
				{ v: 0, d: 0 },
				{ v: 0, d: 0 },
				{ v: 0, d: 0 },
			]
			const out = fourierTransformDualIterative(input)
			for (const bin of out) {
				assert.ok(Object.is(bin.re.v, 0))
				assert.ok(Object.is(bin.re.d, 0))
				assert.ok(Object.is(bin.im.v, 0))
				assert.ok(Object.is(bin.im.d, 0))
			}
		})

		test('does not mutate input array or element objects', () => {
			const input = [
				{ v: 1, d: 2 },
				{ v: -3, d: 4 },
				{ v: 5, d: -6 },
			]
			const snapshot = structuredClone(input)
			fourierTransformDualIterative(input)
			assert.deepStrictEqual(input, snapshot)
		})
	})

	describe('normal cases', () => {
		test('computes exact DFT of a constant dual signal', () => {
			const n = 5
			const c = { v: 2.5, d: -0.75 }
			const input = Array.from({ length: n }, () => ({ ...c }))
			const out = fourierTransformDualIterative(input)

			assertComplexDualClose(out[0], {
				re: { v: n * c.v, d: n * c.d },
				im: { v: 0, d: 0 },
			})
			for (let k = 1; k < n; k++) {
				assertComplexDualClose(out[k], {
					re: { v: 0, d: 0 },
					im: { v: 0, d: 0 },
				})
			}
		})

		test('computes exact DFT of a unit impulse at n = 0', () => {
			const input = [
				{ v: 1, d: 3 },
				{ v: 0, d: 0 },
				{ v: 0, d: 0 },
				{ v: 0, d: 0 },
			]
			const out = fourierTransformDualIterative(input)
			for (let k = 0; k < 4; k++) {
				assertComplexDualClose(out[k], {
					re: { v: 1, d: 3 },
					im: { v: 0, d: 0 },
				})
			}
		})

		test('computes exact 4-point DFT for known real dual sequence', () => {
			// x = [1 + 10ε, 2 + 20ε, 3 + 30ε, 4 + 40ε]
			// X[0] = 10 + 100ε
			// X[1] = (1 - 3) + i(4 - 2) = -2 + 2i  (derivative: -20 + 20i)
			// X[2] = (1 - 2 + 3 - 4) = -2          (derivative: -20)
			// X[3] = -2 - 2i                       (derivative: -20 - 20i)
			const input = [
				{ v: 1, d: 10 },
				{ v: 2, d: 20 },
				{ v: 3, d: 30 },
				{ v: 4, d: 40 },
			]
			const out = fourierTransformDualIterative(input)
			const expected = [
				{ re: { v: 10, d: 100 }, im: { v: 0, d: 0 } },
				{ re: { v: -2, d: -20 }, im: { v: 2, d: 20 } },
				{ re: { v: -2, d: -20 }, im: { v: 0, d: 0 } },
				{ re: { v: -2, d: -20 }, im: { v: -2, d: -20 } },
			]
			for (let k = 0; k < 4; k++) {
				assertComplexDualClose(out[k], expected[k], EPS, `X[${k}]`)
			}
		})

		test('detects pure cosine tone and propagates amplitude derivative', () => {
			// x[n](t) = A(t) * cos(2π * m * n / N), with A = 3, A' = 1.5
			const n = 8
			const m = 2
			const A = 3
			const dA = 1.5
			const input = Array.from({ length: n }, (_, j) => {
				const c = Math.cos((2 * Math.PI * m * j) / n)
				return { v: A * c, d: dA * c }
			})
			const out = fourierTransformDualIterative(input)

			for (let k = 0; k < n; k++) {
				if (k === m || k === n - m) {
					assertComplexDualClose(
						out[k],
						{
							re: { v: (A * n) / 2, d: (dA * n) / 2 },
							im: { v: 0, d: 0 },
						},
						EPS,
						`X[${k}]`,
					)
				} else {
					assertComplexDualClose(
						out[k],
						{ re: { v: 0, d: 0 }, im: { v: 0, d: 0 } },
						EPS,
						`X[${k}]`,
					)
				}
			}
		})

		test('supports unitary and none normalization modes', () => {
			const input = [
				{ v: 1, d: 0.5 },
				{ v: -2, d: 1.5 },
				{ v: 3, d: -0.25 },
				{ v: 0.5, d: 2 },
			]
			const std = fourierTransformDualIterative(input, {
				normalization: 'standard',
			})
			const unitary = fourierTransformDualIterative(input, {
				normalization: 'unitary',
			})
			const noneInv = fourierTransformDualIterative(std, {
				inverse: true,
				normalization: 'none',
			})
			const invFactor = 1 / Math.sqrt(input.length)

			for (let k = 0; k < input.length; k++) {
				assertComplexDualClose(unitary[k], {
					re: { v: std[k].re.v * invFactor, d: std[k].re.d * invFactor },
					im: { v: std[k].im.v * invFactor, d: std[k].im.d * invFactor },
				})
				assertComplexDualClose(noneInv[k], {
					re: { v: input[k].v * input.length, d: input[k].d * input.length },
					im: { v: 0, d: 0 },
				})
			}
		})

		test('handles prime-length complex dual signals accurately', () => {
			const input = [
				{ re: { v: 1.2, d: -0.3 }, im: { v: 0.5, d: 1.1 } },
				{ re: { v: -0.8, d: 2.0 }, im: { v: 1.7, d: -0.4 } },
				{ re: { v: 3.1, d: 0.6 }, im: { v: -2.2, d: 0.9 } },
				{ re: { v: 0.4, d: -1.5 }, im: { v: 0.8, d: 0.2 } },
				{ re: { v: -1.9, d: 0.7 }, im: { v: 1.3, d: -1.8 } },
				{ re: { v: 2.5, d: -0.9 }, im: { v: -0.6, d: 1.4 } },
				{ re: { v: -0.3, d: 1.2 }, im: { v: 2.1, d: -0.5 } },
			]
			const freq = fourierTransformDualIterative(input)
			const recovered = fourierTransformDualIterative(freq, { inverse: true })

			assert.equal(recovered.length, input.length)
			for (let i = 0; i < input.length; i++) {
				assertComplexDualClose(recovered[i], input[i], EPS, `recovered[${i}]`)
			}
		})
	})

	describe('independent cross-checks', () => {
		test("Parseval's theorem holds for both primal energy and dual derivative of energy", () => {
			// For dual energy E = Σ |x[n]|² = Σ (re² + im²):
			//   E.v = Σ (re.v² + im.v²)
			//   E.d = Σ 2 * (re.v * re.d + im.v * im.d)
			// Parseval's theorem guarantees E_time === (1 / N) * E_freq in BOTH v and d.
			const signals = [
				// Real dual signal (even length)
				[
					{ v: 1.5, d: -0.4 },
					{ v: -2.3, d: 1.1 },
					{ v: 0.7, d: 2.5 },
					{ v: 4.1, d: -1.8 },
					{ v: -0.9, d: 0.6 },
					{ v: 3.2, d: -0.7 },
				],
				// Complex dual signal (prime length)
				[
					{ re: { v: 2.1, d: 0.8 }, im: { v: -1.4, d: 0.3 } },
					{ re: { v: -0.5, d: -1.2 }, im: { v: 3.0, d: 1.7 } },
					{ re: { v: 1.8, d: 0.4 }, im: { v: 0.9, d: -2.1 } },
					{ re: { v: -2.7, d: 1.5 }, im: { v: -0.6, d: 0.9 } },
					{ re: { v: 0.3, d: -0.7 }, im: { v: 2.2, d: -0.5 } },
				],
			]

			function dualEnergy(seq) {
				let v = 0
				let d = 0
				for (const item of seq) {
					const re = 're' in item ? item.re : item
					const im = 'im' in item ? item.im : { v: 0, d: 0 }
					v += re.v * re.v + im.v * im.v
					d += 2 * (re.v * re.d + im.v * im.d)
				}
				return { v, d }
			}

			for (const sig of signals) {
				const spectrum = fourierTransformDualIterative(sig)
				const timeE = dualEnergy(sig)
				const freqE = dualEnergy(spectrum)
				assertClose(timeE.v, freqE.v / sig.length, EPS, 'Parseval primal energy')
				assertClose(
					timeE.d,
					freqE.d / sig.length,
					EPS,
					'Parseval dual energy derivative',
				)

				// Unitary DFT preserves dual energy with factor 1
				const unitarySpectrum = fourierTransformDualIterative(sig, {
					normalization: 'unitary',
				})
				const unitaryE = dualEnergy(unitarySpectrum)
				assertClose(timeE.v, unitaryE.v, EPS, 'Unitary Parseval primal energy')
				assertClose(
					timeE.d,
					unitaryE.d,
					EPS,
					'Unitary Parseval dual energy derivative',
				)
			}
		})

		test('matches central finite-difference derivatives for nonlinear parameterized signals', () => {
			// Signal parameterized by t:
			//   re_n(t) = exp(0.2 * n * t) * cos((n + 1) * t)
			//   im_n(t) = sin((n + 0.5) * t^2) + t / (n + 1)
			const n = 9
			const t0 = 0.73
			const h = 1e-6

			function makeSignal(t) {
				return Array.from({ length: n }, (_, j) => {
					const a = 0.2 * j
					const w = j + 1
					const expPart = Math.exp(a * t)
					const cosPart = Math.cos(w * t)
					const sinPart = Math.sin(w * t)

					const reV = expPart * cosPart
					const reD = expPart * (a * cosPart - w * sinPart)

					const p = j + 0.5
					const imV = Math.sin(p * t * t) + t / (j + 1)
					const imD = Math.cos(p * t * t) * (2 * p * t) + 1 / (j + 1)

					return {
						re: { v: reV, d: reD },
						im: { v: imV, d: imD },
					}
				})
			}

			const atT0 = fourierTransformDualIterative(makeSignal(t0))
			const atPlus = fourierTransformDualIterative(makeSignal(t0 + h))
			const atMinus = fourierTransformDualIterative(makeSignal(t0 - h))

			for (let k = 0; k < n; k++) {
				const fdRe = (atPlus[k].re.v - atMinus[k].re.v) / (2 * h)
				const fdIm = (atPlus[k].im.v - atMinus[k].im.v) / (2 * h)
				assertClose(atT0[k].re.d, fdRe, 1e-7, `FD check X[${k}].re.d`)
				assertClose(atT0[k].im.d, fdIm, 1e-7, `FD check X[${k}].im.d`)
			}
		})

		test('satisfies Hermitian conjugate symmetry for real dual inputs', () => {
			const input = [
				{ v: 1.2, d: 0.5 },
				{ v: -3.4, d: 1.7 },
				{ v: 2.8, d: -0.9 },
				{ v: 0.1, d: 2.3 },
				{ v: -1.6, d: -1.1 },
				{ v: 4.0, d: 0.2 },
			]
			const out = fourierTransformDualIterative(input)
			const n = input.length

			// DC bin is purely real in both primal and dual parts
			assertClose(out[0].im.v, 0, EPS)
			assertClose(out[0].im.d, 0, EPS)

			for (let k = 1; k < n; k++) {
				const conj = out[n - k]
				assertClose(out[k].re.v, conj.re.v, EPS, `sym re.v k=${k}`)
				assertClose(out[k].re.d, conj.re.d, EPS, `sym re.d k=${k}`)
				assertClose(out[k].im.v, -conj.im.v, EPS, `sym im.v k=${k}`)
				assertClose(out[k].im.d, -conj.im.d, EPS, `sym im.d k=${k}`)
			}
		})

		test('satisfies circular convolution theorem over dual numbers', () => {
			const x = [
				{ v: 1, d: 0.5 },
				{ v: 2, d: -1 },
				{ v: -1, d: 0.25 },
				{ v: 3, d: 2 },
				{ v: 0.5, d: -0.75 },
			]
			const y = [
				{ v: -2, d: 1 },
				{ v: 0.5, d: 0.5 },
				{ v: 1.5, d: -0.25 },
				{ v: -0.5, d: 1.5 },
				{ v: 2, d: -0.5 },
			]
			const n = x.length

			// Direct dual circular convolution: (x * y)[m] = Σ_j x[j] * y[(m - j + n) % n]
			const conv = Array.from({ length: n }, (_, m) => {
				let v = 0
				let d = 0
				for (let j = 0; j < n; j++) {
					const a = x[j]
					const b = y[(m - j + n) % n]
					v += a.v * b.v
					d += a.v * b.d + a.d * b.v
				}
				return { v, d }
			})

			const X = fourierTransformDualIterative(x)
			const Y = fourierTransformDualIterative(y)

			// Pointwise complex dual multiplication X[k] * Y[k]
			const prod = X.map((xk, k) => {
				const yk = Y[k]
				const mulD = (a, b) => ({ v: a.v * b.v, d: a.v * b.d + a.d * b.v })
				const addD = (a, b) => ({ v: a.v + b.v, d: a.d + b.d })
				const subD = (a, b) => ({ v: a.v - b.v, d: a.d - b.d })
				return {
					re: subD(mulD(xk.re, yk.re), mulD(xk.im, yk.im)),
					im: addD(mulD(xk.re, yk.im), mulD(xk.im, yk.re)),
				}
			})

			const convFromFreq = fourierTransformDualIterative(prod, {
				inverse: true,
			})
			for (let m = 0; m < n; m++) {
				assertComplexDualClose(
					convFromFreq[m],
					{ re: conv[m], im: { v: 0, d: 0 } },
					EPS,
					`conv[${m}]`,
				)
			}
		})
	})

	describe('invalid input errors', () => {
		test('throws TypeError when signal is not an array', () => {
			for (const bad of [null, undefined, 42, 'abc', {}, new Set()]) {
				assert.throws(() => fourierTransformDualIterative(bad), TypeError)
			}
		})

		test('throws TypeError for sparse arrays', () => {
			// eslint-disable-next-line no-sparse-arrays
			const sparse = [{ v: 1, d: 0 }, , { v: 2, d: 0 }]
			assert.throws(() => fourierTransformDualIterative(sparse), TypeError)
		})

		test('throws TypeError for malformed dual elements', () => {
			const badSignals = [
				[null],
				[undefined],
				[42],
				[[1, 2]],
				[{ v: 1 }],
				[{ d: 1 }],
				[{ v: '1', d: 0 }],
				[{ v: 1, d: null }],
				[{ re: { v: 1, d: 0 } }],
				[{ im: { v: 1, d: 0 } }],
				[{ re: { v: 1, d: 0 }, im: null }],
				[{ re: { v: 1, d: 0 }, im: { v: 0, d: 0 }, v: 1, d: 0 }],
			]
			for (const bad of badSignals) {
				assert.throws(() => fourierTransformDualIterative(bad), TypeError)
			}
		})

		test('throws RangeError for non-finite dual values or derivatives', () => {
			const nonFiniteSignals = [
				[{ v: NaN, d: 0 }],
				[{ v: 0, d: NaN }],
				[{ v: Infinity, d: 0 }],
				[{ v: 0, d: -Infinity }],
				[{ re: { v: 1, d: 0 }, im: { v: 0, d: Infinity } }],
				[{ re: { v: -Infinity, d: 0 }, im: { v: 0, d: 0 } }],
			]
			for (const bad of nonFiniteSignals) {
				assert.throws(() => fourierTransformDualIterative(bad), RangeError)
			}
		})

		test('throws TypeError or RangeError for invalid options', () => {
			const valid = [{ v: 1, d: 0 }]
			assert.throws(() => fourierTransformDualIterative(valid, null), TypeError)
			assert.throws(() => fourierTransformDualIterative(valid, []), TypeError)
			assert.throws(
				() => fourierTransformDualIterative(valid, { inverse: 'yes' }),
				TypeError,
			)
			assert.throws(
				() => fourierTransformDualIterative(valid, { normalization: 123 }),
				TypeError,
			)
			assert.throws(
				() => fourierTransformDualIterative(valid, { normalization: 'ortho' }),
				RangeError,
			)
		})
	})
})
