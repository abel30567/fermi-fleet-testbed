import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { sinTypedSeries } from './sinTypedSeries.js'

const TOL = 1e-14

function assertClose(actual, expected, tol = TOL, label = '') {
	const diff = Math.abs(actual - expected)
	assert.ok(
		diff <= tol,
		`${label ? label + ': ' : ''}expected ${actual} to be within ${tol} of ${expected} (diff=${diff})`
	)
}

describe('sinTypedSeries', () => {
	test('computes standard angles accurately', () => {
		const input = new Float64Array([
			0,
			Math.PI / 6,
			Math.PI / 4,
			Math.PI / 3,
			Math.PI / 2,
			(2 * Math.PI) / 3,
			Math.PI,
			(3 * Math.PI) / 2,
			2 * Math.PI,
			-Math.PI / 6,
			-Math.PI / 4,
			-Math.PI / 2,
			-Math.PI,
		])
		const expected = [
			0,
			0.5,
			Math.SQRT1_2,
			Math.sqrt(3) / 2,
			1,
			Math.sqrt(3) / 2,
			0,
			-1,
			0,
			-0.5,
			-Math.SQRT1_2,
			-1,
			0,
		]

		const result = sinTypedSeries(input)
		assert.ok(result instanceof Float64Array)
		assert.equal(result.length, input.length)
		for (let i = 0; i < input.length; i++) {
			assertClose(result[i], expected[i], TOL, `angle index ${i}`)
		}
	})

	test('handles empty Float64Array and does not mutate input', () => {
		const empty = new Float64Array(0)
		const emptyOut = sinTypedSeries(empty)
		assert.ok(emptyOut instanceof Float64Array)
		assert.equal(emptyOut.length, 0)
		assert.notEqual(emptyOut, empty)

		const input = new Float64Array([0.5, -1.25, 3.75])
		const snapshot = new Float64Array(input)
		const out = sinTypedSeries(input)
		assert.notEqual(out, input)
		assert.deepEqual(input, snapshot)
	})

	test('preserves signed zeros (+0 and -0)', () => {
		const input = new Float64Array([0, -0])
		const result = sinTypedSeries(input)
		assert.ok(Object.is(result[0], 0))
		assert.ok(Object.is(result[1], -0))
	})

	test('handles NaN, Infinity, and -Infinity', () => {
		const input = new Float64Array([
			Number.NaN,
			Number.POSITIVE_INFINITY,
			Number.NEGATIVE_INFINITY,
		])
		const result = sinTypedSeries(input)
		assert.ok(Number.isNaN(result[0]))
		assert.ok(Number.isNaN(result[1]))
		assert.ok(Number.isNaN(result[2]))
	})

	test('handles tiny and subnormal inputs accurately', () => {
		const input = new Float64Array([1e-12, -1e-12, 1e-300, -1e-300, Number.MIN_VALUE, -Number.MIN_VALUE])
		const result = sinTypedSeries(input)
		for (let i = 0; i < input.length; i++) {
			assert.equal(result[i], Math.sin(input[i]))
		}
	})

	test('handles multiples of pi/2 across positive and negative quadrants', () => {
		const ks = [-10, -7, -4, -3, -2, -1, 0, 1, 2, 3, 4, 7, 10, 101]
		const input = new Float64Array(ks.map((k) => k * (Math.PI / 2)))
		const result = sinTypedSeries(input)
		for (let i = 0; i < ks.length; i++) {
			assertClose(result[i], Math.sin(input[i]), 1e-13, `k=${ks[i]}`)
		}
	})

	test('handles large angles accurately (Cody-Waite and Payne-Hanek paths)', () => {
		const input = new Float64Array([
			1e3,
			-1e3,
			1e6,
			-1e6,
			1e7,
			-1e7,
			1e12,
			-1e12,
			1e20,
			-1e20,
			1e100,
		])
		const result = sinTypedSeries(input)
		for (let i = 0; i < input.length; i++) {
			assertClose(result[i], Math.sin(input[i]), 1e-14, `x=${input[i]}`)
		}
	})

	test('cross-checks against Math.sin across dense sweep', () => {
		const n = 500
		const input = new Float64Array(n)
		for (let i = 0; i < n; i++) {
			input[i] = -20 + (40 * i) / (n - 1)
		}
		const result = sinTypedSeries(input)
		for (let i = 0; i < n; i++) {
			assertClose(result[i], Math.sin(input[i]), 1e-14, `sweep i=${i}, x=${input[i]}`)
		}
	})

	test('satisfies trigonometric identities: odd symmetry, double-angle, and Pythagorean', () => {
		const xs = new Float64Array([0.1, 0.4, 0.9, 1.5, 2.3, 4.7, 11.2, -3.4, 1e8])
		const negXs = new Float64Array(xs.map((x) => -x))
		const twoXs = new Float64Array(xs.map((x) => 2 * x))

		const sinX = sinTypedSeries(xs)
		const sinNegX = sinTypedSeries(negXs)
		const sin2X = sinTypedSeries(twoXs)

		for (let i = 0; i < xs.length; i++) {
			// Odd symmetry: sin(-x) === -sin(x)
			assertClose(sinNegX[i], -sinX[i], 1e-15, `odd symmetry x=${xs[i]}`)

			// Double-angle identity: sin(2x) === 2 * sin(x) * cos(x)
			assertClose(sin2X[i], 2 * sinX[i] * Math.cos(xs[i]), 1e-13, `double-angle x=${xs[i]}`)

			// Pythagorean identity: sin^2(x) + cos^2(x) === 1
			assertClose(sinX[i] ** 2 + Math.cos(xs[i]) ** 2, 1, 1e-13, `Pythagorean x=${xs[i]}`)
		}

		// Self-consistent phase-shift identity: sin^2(x) + sin^2(x + pi/2) === 1
		// on moderate angles where x + pi/2 does not lose low-order bits of pi/2.
		const moderate = new Float64Array([0.1, 0.7, 1.8, -2.5, 5.2])
		const shifted = new Float64Array(moderate.map((x) => x + Math.PI / 2))
		const sinMod = sinTypedSeries(moderate)
		const sinShifted = sinTypedSeries(shifted)
		for (let i = 0; i < moderate.length; i++) {
			assertClose(sinMod[i] ** 2 + sinShifted[i] ** 2, 1, 1e-13, `phase-shift x=${moderate[i]}`)
		}
	})

	test('throws TypeError for non-Float64Array inputs', () => {
		const invalidInputs = [
			null,
			undefined,
			42,
			'1.0',
			[0, 1, 2],
			new Float32Array([0, 1]),
			new Int32Array([0, 1]),
			new Uint8Array([0, 1]),
			{ length: 1, 0: 0 },
		]
		for (const bad of invalidInputs) {
			assert.throws(() => sinTypedSeries(bad), TypeError)
		}
	})
})
