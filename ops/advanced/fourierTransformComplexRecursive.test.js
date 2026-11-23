import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { fourierTransformComplexRecursive } from './fourierTransformComplexRecursive.js'

const EPSILON = 1e-9

function assertComplexClose(actual, expected, eps = EPSILON, message = '') {
	assert.equal(typeof actual.re, 'number', `${message} re should be a number`)
	assert.equal(typeof actual.im, 'number', `${message} im should be a number`)
	assert.ok(
		Math.abs(actual.re - expected.re) <= eps,
		`${message} re mismatch: got ${actual.re}, expected ${expected.re}`
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= eps,
		`${message} im mismatch: got ${actual.im}, expected ${expected.im}`
	)
}

function assertComplexArrayClose(actual, expected, eps = EPSILON) {
	assert.equal(actual.length, expected.length, 'Array lengths should match')
	for (let i = 0; i < actual.length; i++) {
		assertComplexClose(actual[i], expected[i], eps, `index ${i}:`)
	}
}

/**
 * Independent O(N^2) reference DFT/IDFT for cross-checking.
 */
function naiveDft(input, inverse = false) {
	const n = input.length
	const sign = inverse ? 1 : -1
	const scale = inverse ? 1 / n : 1
	const out = []

	for (let k = 0; k < n; k++) {
		let re = 0
		let im = 0
		for (let j = 0; j < n; j++) {
			const angle = (sign * 2 * Math.PI * k * j) / n
			const c = Math.cos(angle)
			const s = Math.sin(angle)
			re += input[j].re * c - input[j].im * s
			im += input[j].re * s + input[j].im * c
		}
		out.push({ re: re * scale, im: im * scale })
	}
	return out
}

/**
 * Deterministic PRNG for reproducible test signals.
 */
function makeSignal(length, seed = 42) {
	let state = seed >>> 0
	const next = () => {
		state = (1664525 * state + 1013904223) >>> 0
		return (state / 0xffffffff) * 20 - 10
	}
	return Array.from({ length }, () => ({ re: next(), im: next() }))
}

describe('fourierTransformComplexRecursive', () => {
	describe('normal cases', () => {
		it('transforms a unit impulse into a flat spectrum', () => {
			const input = [
				{ re: 1, im: 0 },
				{ re: 0, im: 0 },
				{ re: 0, im: 0 },
				{ re: 0, im: 0 },
			]
			const result = fourierTransformComplexRecursive(input)
			assertComplexArrayClose(result, [
				{ re: 1, im: 0 },
				{ re: 1, im: 0 },
				{ re: 1, im: 0 },
				{ re: 1, im: 0 },
			])
		})

		it('transforms a constant complex DC signal into a single spike at index 0', () => {
			const input = Array.from({ length: 8 }, () => ({ re: 2.5, im: -1.5 }))
			const result = fourierTransformComplexRecursive(input)
			const expected = [
				{ re: 20, im: -12 },
				...Array.from({ length: 7 }, () => ({ re: 0, im: 0 })),
			]
			assertComplexArrayClose(result, expected)
		})

		it('matches analytical DFT of [1, 2, 3, 4]', () => {
			const input = [
				{ re: 1, im: 0 },
				{ re: 2, im: 0 },
				{ re: 3, im: 0 },
				{ re: 4, im: 0 },
			]
			const result = fourierTransformComplexRecursive(input)
			assertComplexArrayClose(result, [
				{ re: 10, im: 0 },
				{ re: -2, im: 2 },
				{ re: -2, im: 0 },
				{ re: -2, im: -2 },
			])
		})

		it('isolates a single complex exponential tone at the exact bin', () => {
			const n = 16
			const targetBin = 5
			const input = Array.from({ length: n }, (_, j) => {
				const angle = (2 * Math.PI * targetBin * j) / n
				return { re: Math.cos(angle), im: Math.sin(angle) }
			})
			const result = fourierTransformComplexRecursive(input)
			const expected = Array.from({ length: n }, (_, k) =>
				k === targetBin ? { re: n, im: 0 } : { re: 0, im: 0 }
			)
			assertComplexArrayClose(result, expected)
		})

		it('round-trips forward and inverse transforms for power-of-2, composite, and prime lengths', () => {
			for (const length of [2, 3, 4, 5, 6, 7, 8, 9, 12, 13, 15, 16, 32]) {
				const signal = makeSignal(length, 100 + length)
				const spectrum = fourierTransformComplexRecursive(signal)
				const recovered = fourierTransformComplexRecursive(spectrum, { inverse: true })
				assertComplexArrayClose(recovered, signal, 1e-8)

				const invFirst = fourierTransformComplexRecursive(signal, { inverse: true })
				const roundTripped = fourierTransformComplexRecursive(invFirst)
				assertComplexArrayClose(roundTripped, signal, 1e-8)
			}
		})
	})

	describe('edge cases', () => {
		it('handles empty array for both forward and inverse transforms', () => {
			assert.deepStrictEqual(fourierTransformComplexRecursive([]), [])
			assert.deepStrictEqual(fourierTransformComplexRecursive([], { inverse: true }), [])
		})

		it('handles single-element array without aliasing the input object', () => {
			const el = { re: 3.5, im: -2.25 }
			const input = [el]
			const fwd = fourierTransformComplexRecursive(input)
			const inv = fourierTransformComplexRecursive(input, { inverse: true })

			assert.deepStrictEqual(fwd, [{ re: 3.5, im: -2.25 }])
			assert.deepStrictEqual(inv, [{ re: 3.5, im: -2.25 }])
			assert.notEqual(fwd[0], el)
			assert.notEqual(inv[0], el)
		})

		it('handles length-2 transform exactly', () => {
			const input = [
				{ re: 3, im: 4 },
				{ re: -1, im: 2 },
			]
			const result = fourierTransformComplexRecursive(input)
			assertComplexArrayClose(result, [
				{ re: 2, im: 6 },
				{ re: 4, im: 2 },
			])
		})

		it('handles all-zero signal cleanly without -0 or NaN', () => {
			const input = Array.from({ length: 6 }, () => ({ re: 0, im: 0 }))
			const result = fourierTransformComplexRecursive(input)
			for (const { re, im } of result) {
				assert.ok(Object.is(re, 0), `expected +0, got ${re}`)
				assert.ok(Object.is(im, 0), `expected +0, got ${im}`)
			}
		})

		it('does not mutate the input array or its elements', () => {
			const input = [
				{ re: 1, im: -2 },
				{ re: 3, im: 4 },
				{ re: -5, im: 6 },
				{ re: 7, im: -8 },
			]
			const snapshot = structuredClone(input)
			fourierTransformComplexRecursive(input)
			fourierTransformComplexRecursive(input, { inverse: true })
			assert.deepStrictEqual(input, snapshot)
		})
	})

	describe('invalid input errors', () => {
		it('throws TypeError when input is not an array', () => {
			for (const bad of [null, undefined, 42, '123', { re: 1, im: 0 }, new Float64Array(4)]) {
				assert.throws(() => fourierTransformComplexRecursive(bad), TypeError)
			}
		})

		it('throws TypeError when an element is not a valid { re, im } object', () => {
			const badInputs = [
				[null],
				[undefined],
				[1],
				[[1, 2]],
				[{ re: 1 }],
				[{ im: 2 }],
				[{ re: '1', im: 0 }],
				[{ re: 1, im: null }],
			]
			for (const bad of badInputs) {
				assert.throws(() => fourierTransformComplexRecursive(bad), TypeError)
			}
		})

		it('throws RangeError when re or im is NaN or Infinity', () => {
			const nonFiniteInputs = [
				[{ re: Number.NaN, im: 0 }],
				[{ re: 0, im: Number.NaN }],
				[{ re: Number.POSITIVE_INFINITY, im: 0 }],
				[{ re: 0, im: Number.NEGATIVE_INFINITY }],
			]
			for (const bad of nonFiniteInputs) {
				assert.throws(() => fourierTransformComplexRecursive(bad), RangeError)
			}
		})

		it('throws TypeError when options or options.inverse is invalid', () => {
			const valid = [{ re: 1, im: 0 }]
			assert.throws(() => fourierTransformComplexRecursive(valid, null), TypeError)
			assert.throws(() => fourierTransformComplexRecursive(valid, true), TypeError)
			assert.throws(() => fourierTransformComplexRecursive(valid, []), TypeError)
			assert.throws(() => fourierTransformComplexRecursive(valid, { inverse: 'yes' }), TypeError)
			assert.throws(() => fourierTransformComplexRecursive(valid, { inverse: 1 }), TypeError)
		})
	})

	describe('independent cross-checks', () => {
		it('matches independent O(N^2) naive DFT across power-of-2, composite, and prime lengths', () => {
			const sizes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 15, 16, 25, 32, 64]
			for (const n of sizes) {
				const signal = makeSignal(n, 500 + n)

				const actualFwd = fourierTransformComplexRecursive(signal)
				const expectedFwd = naiveDft(signal, false)
				assertComplexArrayClose(actualFwd, expectedFwd, 1e-8)

				const actualInv = fourierTransformComplexRecursive(signal, { inverse: true })
				const expectedInv = naiveDft(signal, true)
				assertComplexArrayClose(actualInv, expectedInv, 1e-8)
			}
		})

		it("satisfies Parseval's energy conservation theorem", () => {
			for (const n of [7, 12, 16, 27]) {
				const signal = makeSignal(n, 900 + n)
				const spectrum = fourierTransformComplexRecursive(signal)

				const timeEnergy = signal.reduce((acc, { re, im }) => acc + re * re + im * im, 0)
				const freqEnergy =
					spectrum.reduce((acc, { re, im }) => acc + re * re + im * im, 0) / n

				assert.ok(
					Math.abs(timeEnergy - freqEnergy) <= 1e-7,
					`Parseval mismatch for n=${n}: time=${timeEnergy}, freq=${freqEnergy}`
				)
			}
		})

		it('satisfies linearity for complex scalar combinations', () => {
			const n = 12
			const x = makeSignal(n, 10)
			const y = makeSignal(n, 20)
			const alpha = { re: 1.5, im: -0.75 }
			const beta = { re: -2.25, im: 0.5 }

			const combined = x.map((xi, i) => {
				const yi = y[i]
				return {
					re: alpha.re * xi.re - alpha.im * xi.im + beta.re * yi.re - beta.im * yi.im,
					im: alpha.re * xi.im + alpha.im * xi.re + beta.re * yi.im + beta.im * yi.re,
				}
			})

			const fftX = fourierTransformComplexRecursive(x)
			const fftY = fourierTransformComplexRecursive(y)
			const expected = fftX.map((fx, i) => {
				const fy = fftY[i]
				return {
					re: alpha.re * fx.re - alpha.im * fx.im + beta.re * fy.re - beta.im * fy.im,
					im: alpha.re * fx.im + alpha.im * fx.re + beta.re * fy.im + beta.im * fy.re,
				}
			})

			const actual = fourierTransformComplexRecursive(combined)
			assertComplexArrayClose(actual, expected, 1e-8)
		})

		it('satisfies the circular convolution theorem', () => {
			const n = 15
			const a = makeSignal(n, 31)
			const b = makeSignal(n, 37)

			const directConv = Array.from({ length: n }, (_, k) => {
				let re = 0
				let im = 0
				for (let j = 0; j < n; j++) {
					const idx = (k - j + n) % n
					re += a[j].re * b[idx].re - a[j].im * b[idx].im
					im += a[j].re * b[idx].im + a[j].im * b[idx].re
				}
				return { re, im }
			})

			const fa = fourierTransformComplexRecursive(a)
			const fb = fourierTransformComplexRecursive(b)
			const pointwise = fa.map((x, i) => ({
				re: x.re * fb[i].re - x.im * fb[i].im,
				im: x.re * fb[i].im + x.im * fb[i].re,
			}))
			const fftConv = fourierTransformComplexRecursive(pointwise, { inverse: true })

			assertComplexArrayClose(fftConv, directConv, 1e-7)
		})
	})
})
