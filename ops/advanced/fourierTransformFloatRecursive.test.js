import { describe, test } from 'node:test'
import assert from 'node:assert'
import { fourierTransformFloatRecursive } from './fourierTransformFloatRecursive.js'

const EPSILON = 1e-9

/**
 * Independent O(N^2) direct discrete Fourier transform for cross-checking.
 *
 * @param {Array<number | { re: number, im: number }>} input
 * @param {{ inverse?: boolean }} [options]
 * @returns {Array<{ re: number, im: number }>}
 */
function directDft(input, { inverse = false } = {}) {
	const n = input.length
	const sign = inverse ? 1 : -1
	const scale = inverse ? 1 / n : 1
	const out = new Array(n)

	for (let k = 0; k < n; k++) {
		let sumRe = 0
		let sumIm = 0
		for (let j = 0; j < n; j++) {
			const x = typeof input[j] === 'number' ? { re: input[j], im: 0 } : input[j]
			const angle = (sign * 2 * Math.PI * k * j) / n
			const cos = Math.cos(angle)
			const sin = Math.sin(angle)
			sumRe += x.re * cos - x.im * sin
			sumIm += x.re * sin + x.im * cos
		}
		out[k] = { re: sumRe * scale, im: sumIm * scale }
	}
	return out
}

function assertComplexClose(actual, expected, tol = EPSILON, label = '') {
	const prefix = label ? `${label}: ` : ''
	assert.ok(
		Math.abs(actual.re - expected.re) <= tol,
		`${prefix}real part mismatch: got ${actual.re}, expected ${expected.re} (diff ${Math.abs(actual.re - expected.re)})`
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= tol,
		`${prefix}imaginary part mismatch: got ${actual.im}, expected ${expected.im} (diff ${Math.abs(actual.im - expected.im)})`
	)
}

function assertComplexArrayClose(actual, expected, tol = EPSILON, label = '') {
	assert.strictEqual(actual.length, expected.length, `${label} length mismatch`)
	for (let i = 0; i < expected.length; i++) {
		assertComplexClose(actual[i], expected[i], tol, `${label}[${i}]`)
	}
}

function createPrng(seed) {
	let state = seed >>> 0
	return () => {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0
		return state / 0x100000000
	}
}

describe('fourierTransformFloatRecursive', () => {
	describe('normal signal cases', () => {
		test('unit impulse at index 0 produces constant spectrum of 1 + 0i', () => {
			const input = [1, 0, 0, 0, 0, 0, 0, 0]
			const result = fourierTransformFloatRecursive(input)
			const expected = Array.from({ length: 8 }, () => ({ re: 1, im: 0 }))
			assertComplexArrayClose(result, expected, EPSILON, 'impulse[0]')
		})

		test('shifted impulse at index 1 produces rotating unit phasors', () => {
			const input = [0, 1, 0, 0]
			const result = fourierTransformFloatRecursive(input)
			const expected = [
				{ re: 1, im: 0 },
				{ re: 0, im: -1 },
				{ re: -1, im: 0 },
				{ re: 0, im: 1 },
			]
			assertComplexArrayClose(result, expected, EPSILON, 'impulse[1]')
		})

		test('constant DC signal concentrates all energy in bin 0', () => {
			const dc = 3.5
			const n = 16
			const input = Array.from({ length: n }, () => dc)
			const result = fourierTransformFloatRecursive(input)
			const expected = Array.from({ length: n }, (_, k) => ({
				re: k === 0 ? dc * n : 0,
				im: 0,
			}))
			assertComplexArrayClose(result, expected, EPSILON, 'DC signal')
		})

		test('pure cosine wave produces real symmetric peaks at +/- frequency', () => {
			const n = 16
			const freq = 3
			const input = Array.from({ length: n }, (_, t) => Math.cos((2 * Math.PI * freq * t) / n))
			const result = fourierTransformFloatRecursive(input)
			const expected = Array.from({ length: n }, (_, k) => ({
				re: k === freq || k === n - freq ? n / 2 : 0,
				im: 0,
			}))
			assertComplexArrayClose(result, expected, EPSILON, 'cosine wave')
		})

		test('pure sine wave produces imaginary antisymmetric peaks at +/- frequency', () => {
			const n = 16
			const freq = 5
			const input = Array.from({ length: n }, (_, t) => Math.sin((2 * Math.PI * freq * t) / n))
			const result = fourierTransformFloatRecursive(input)
			const expected = Array.from({ length: n }, (_, k) => {
				if (k === freq) return { re: 0, im: -n / 2 }
				if (k === n - freq) return { re: 0, im: n / 2 }
				return { re: 0, im: 0 }
			})
			assertComplexArrayClose(result, expected, EPSILON, 'sine wave')
		})

		test('complex input and mixed real/complex input arrays', () => {
			const complexInput = [
				{ re: 1.5, im: -0.5 },
				{ re: -2.0, im: 3.25 },
				{ re: 0.75, im: 1.0 },
				{ re: 4.0, im: -2.5 },
			]
			const mixedInput = [1.5, { re: -2.0, im: 3.25 }, 0.75, { re: 4.0, im: 0 }]

			assertComplexArrayClose(
				fourierTransformFloatRecursive(complexInput),
				directDft(complexInput),
				EPSILON,
				'complex input'
			)
			assertComplexArrayClose(
				fourierTransformFloatRecursive(mixedInput),
				directDft(mixedInput),
				EPSILON,
				'mixed input'
			)
		})

		test('Float64Array input is supported and matches Array input', () => {
			const arr = [1.25, -0.5, 2.75, 0.125, -3.5, 4.0, 0.0, -1.75]
			const typed = new Float64Array(arr)
			const fromArr = fourierTransformFloatRecursive(arr)
			const fromTyped = fourierTransformFloatRecursive(typed)
			assertComplexArrayClose(fromTyped, fromArr, EPSILON, 'Float64Array')
		})

		test('inverse round-trip recovers original real and complex signals', () => {
			const rand = createPrng(42)
			for (const n of [1, 2, 4, 8, 16, 32, 3, 5, 6, 7, 12, 15]) {
				const complexSignal = Array.from({ length: n }, () => ({
					re: rand() * 20 - 10,
					im: rand() * 20 - 10,
				}))

				const freq = fourierTransformFloatRecursive(complexSignal)
				const recovered = fourierTransformFloatRecursive(freq, { inverse: true })
				assertComplexArrayClose(recovered, complexSignal, EPSILON, `round-trip N=${n}`)

				const invFirst = fourierTransformFloatRecursive(complexSignal, { inverse: true })
				const recoveredRev = fourierTransformFloatRecursive(invFirst, { inverse: false })
				assertComplexArrayClose(recoveredRev, complexSignal, EPSILON, `reverse round-trip N=${n}`)
			}
		})

		test('does not mutate input array or input complex objects', () => {
			const input = [
				{ re: 1, im: 2 },
				{ re: 3, im: 4 },
				{ re: 5, im: 6 },
				{ re: 7, im: 8 },
			]
			const snapshot = structuredClone(input)
			fourierTransformFloatRecursive(input)
			fourierTransformFloatRecursive(input, { inverse: true })
			assert.deepStrictEqual(input, snapshot)
		})
	})

	describe('edge cases and sizes', () => {
		test('length 1 real and complex (forward and inverse)', () => {
			assert.deepStrictEqual(fourierTransformFloatRecursive([7.25]), [{ re: 7.25, im: 0 }])
			assert.deepStrictEqual(fourierTransformFloatRecursive([7.25], { inverse: true }), [
				{ re: 7.25, im: 0 },
			])
			assert.deepStrictEqual(fourierTransformFloatRecursive([{ re: -3.5, im: 4.25 }]), [
				{ re: -3.5, im: 4.25 },
			])
			assert.deepStrictEqual(
				fourierTransformFloatRecursive([{ re: -3.5, im: 4.25 }], { inverse: true }),
				[{ re: -3.5, im: 4.25 }]
			)
		})

		test('length 2 real and complex (forward and inverse)', () => {
			const forward = fourierTransformFloatRecursive([3, 5])
			assertComplexArrayClose(
				forward,
				[
					{ re: 8, im: 0 },
					{ re: -2, im: 0 },
				],
				EPSILON,
				'len2 forward'
			)

			const inverse = fourierTransformFloatRecursive(forward, { inverse: true })
			assertComplexArrayClose(
				inverse,
				[
					{ re: 3, im: 0 },
					{ re: 5, im: 0 },
				],
				EPSILON,
				'len2 inverse'
			)
		})

		test('all-zero signal returns clean +0 zeros without -0', () => {
			const result = fourierTransformFloatRecursive([-0, 0, -0, 0])
			for (const bin of result) {
				assert.ok(Object.is(bin.re, 0), `expected +0 real part, got ${bin.re}`)
				assert.ok(Object.is(bin.im, 0), `expected +0 imag part, got ${bin.im}`)
			}
		})

		test('larger power-of-2 sizes (64, 256, 1024) round-trip accurately', () => {
			const rand = createPrng(9001)
			for (const n of [64, 256, 1024]) {
				const signal = Array.from({ length: n }, () => ({
					re: rand() * 2 - 1,
					im: rand() * 2 - 1,
				}))
				const spectrum = fourierTransformFloatRecursive(signal)
				const reconstructed = fourierTransformFloatRecursive(spectrum, { inverse: true })
				assertComplexArrayClose(reconstructed, signal, 1e-8, `large power-of-2 N=${n}`)
			}
		})

		test('invalid input types throw TypeError', () => {
			for (const bad of [null, undefined, 42, '1234', {}, { length: 2 }, new Int32Array([1, 2])]) {
				assert.throws(() => fourierTransformFloatRecursive(bad), TypeError)
			}

			// Invalid element types
			assert.throws(() => fourierTransformFloatRecursive([1, '2']), TypeError)
			assert.throws(() => fourierTransformFloatRecursive([1, null]), TypeError)
			assert.throws(() => fourierTransformFloatRecursive([1, undefined]), TypeError)
			assert.throws(() => fourierTransformFloatRecursive([true, false]), TypeError)
			assert.throws(() => fourierTransformFloatRecursive([[1, 2]]), TypeError)
			assert.throws(() => fourierTransformFloatRecursive([{ re: 1 }]), TypeError)
			assert.throws(() => fourierTransformFloatRecursive([{ im: 1 }]), TypeError)
			assert.throws(() => fourierTransformFloatRecursive([{ re: '1', im: 0 }]), TypeError)
			assert.throws(() => fourierTransformFloatRecursive([{ re: 1, im: null }]), TypeError)

			// Sparse array hole
			const sparse = new Array(4)
			sparse[0] = 1
			assert.throws(() => fourierTransformFloatRecursive(sparse), TypeError)

			// Invalid options
			assert.throws(() => fourierTransformFloatRecursive([1, 2], null), TypeError)
			assert.throws(() => fourierTransformFloatRecursive([1, 2], true), TypeError)
			assert.throws(() => fourierTransformFloatRecursive([1, 2], []), TypeError)
			assert.throws(() => fourierTransformFloatRecursive([1, 2], { inverse: 'yes' }), TypeError)
			assert.throws(() => fourierTransformFloatRecursive([1, 2], { inverse: 1 }), TypeError)
		})

		test('empty input and non-finite numbers throw RangeError', () => {
			assert.throws(() => fourierTransformFloatRecursive([]), RangeError)
			assert.throws(() => fourierTransformFloatRecursive(new Float64Array(0)), RangeError)
			assert.throws(() => fourierTransformFloatRecursive([NaN]), RangeError)
			assert.throws(() => fourierTransformFloatRecursive([1, Infinity]), RangeError)
			assert.throws(() => fourierTransformFloatRecursive([1, -Infinity]), RangeError)
			assert.throws(() => fourierTransformFloatRecursive([{ re: NaN, im: 0 }]), RangeError)
			assert.throws(() => fourierTransformFloatRecursive([{ re: 0, im: Infinity }]), RangeError)
			assert.throws(() => fourierTransformFloatRecursive([{ re: -Infinity, im: 1 }]), RangeError)
		})
	})

	describe('mathematical cross-checks', () => {
		test('matches independent O(N^2) direct DFT for power-of-2 and arbitrary lengths', () => {
			const rand = createPrng(1337)
			const sizes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 15, 16, 25, 32, 64]

			for (const n of sizes) {
				const realInput = Array.from({ length: n }, () => rand() * 10 - 5)
				const complexInput = Array.from({ length: n }, () => ({
					re: rand() * 10 - 5,
					im: rand() * 10 - 5,
				}))

				assertComplexArrayClose(
					fourierTransformFloatRecursive(realInput),
					directDft(realInput),
					EPSILON,
					`direct DFT forward real N=${n}`
				)
				assertComplexArrayClose(
					fourierTransformFloatRecursive(complexInput),
					directDft(complexInput),
					EPSILON,
					`direct DFT forward complex N=${n}`
				)
				assertComplexArrayClose(
					fourierTransformFloatRecursive(complexInput, { inverse: true }),
					directDft(complexInput, { inverse: true }),
					EPSILON,
					`direct DFT inverse complex N=${n}`
				)
			}
		})

		test("satisfies Parseval's theorem across power-of-2 and non-power-of-2 sizes", () => {
			const rand = createPrng(2026)
			const sizes = [1, 2, 3, 4, 5, 7, 8, 12, 16, 29, 64, 128]

			for (const n of sizes) {
				const signal = Array.from({ length: n }, () => ({
					re: rand() * 10 - 5,
					im: rand() * 10 - 5,
				}))
				const spectrum = fourierTransformFloatRecursive(signal)

				const timeEnergy = signal.reduce((acc, c) => acc + c.re * c.re + c.im * c.im, 0)
				const freqEnergy =
					spectrum.reduce((acc, c) => acc + c.re * c.re + c.im * c.im, 0) / n

				assert.ok(
					Math.abs(timeEnergy - freqEnergy) <= 1e-8 * Math.max(1, timeEnergy),
					`Parseval mismatch for N=${n}: time=${timeEnergy}, freq=${freqEnergy}`
				)
			}
		})

		test('satisfies linearity and conjugate symmetry for real inputs', () => {
			const rand = createPrng(777)
			const n = 32
			const a = 2.75
			const b = -1.5
			const x = Array.from({ length: n }, () => rand() * 6 - 3)
			const y = Array.from({ length: n }, () => rand() * 6 - 3)
			const combined = x.map((v, i) => a * v + b * y[i])

			const fx = fourierTransformFloatRecursive(x)
			const fy = fourierTransformFloatRecursive(y)
			const fCombined = fourierTransformFloatRecursive(combined)

			const expectedCombined = fx.map((c, i) => ({
				re: a * c.re + b * fy[i].re,
				im: a * c.im + b * fy[i].im,
			}))
			assertComplexArrayClose(fCombined, expectedCombined, EPSILON, 'linearity')

			// Conjugate symmetry: X[N - k] = conj(X[k]) for real input x
			for (let k = 1; k < n; k++) {
				assertComplexClose(
					fx[n - k],
					{ re: fx[k].re, im: -fx[k].im },
					EPSILON,
					`conjugate symmetry k=${k}`
				)
			}
		})
	})
})
