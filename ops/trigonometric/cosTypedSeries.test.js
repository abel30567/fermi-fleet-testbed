import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { cosTypedSeries } from './cosTypedSeries.js'

const TOL = 1e-14

function assertClose(actual, expected, tol = TOL, label = '') {
	if (Number.isNaN(expected)) {
		assert.ok(Number.isNaN(actual), `${label}: expected NaN, got ${actual}`)
		return
	}
	const diff = Math.abs(actual - expected)
	assert.ok(
		diff <= tol,
		`${label}: expected ${expected}, got ${actual} (diff=${diff}, tol=${tol})`
	)
}

describe('cosTypedSeries', () => {
	test('throws TypeError on invalid inputs', () => {
		const invalid = [
			null,
			undefined,
			0,
			Math.PI,
			'0',
			{},
			[0, 1, 2],
			new Float32Array([0, 1]),
			new Int32Array([0, 1]),
			new Uint8Array([0, 1]),
		]
		for (const bad of invalid) {
			assert.throws(
				() => cosTypedSeries(bad),
				{ name: 'TypeError' },
				`Expected TypeError for ${Object.prototype.toString.call(bad)}`
			)
		}
	})

	test('handles empty Float64Array and does not mutate input', () => {
		const empty = new Float64Array(0)
		const resEmpty = cosTypedSeries(empty)
		assert.ok(resEmpty instanceof Float64Array)
		assert.equal(resEmpty.length, 0)
		assert.notEqual(resEmpty, empty)

		const input = new Float64Array([0, Math.PI / 3, Math.PI])
		const snapshot = new Float64Array(input)
		const result = cosTypedSeries(input)
		assert.ok(result instanceof Float64Array)
		assert.notEqual(result, input)
		assert.deepEqual(input, snapshot)
	})

	test('computes exact/standard trigonometric values and multiples of pi/2', () => {
		const angles = new Float64Array([
			0,
			-0,
			Math.PI / 6,
			Math.PI / 4,
			Math.PI / 3,
			Math.PI / 2,
			(2 * Math.PI) / 3,
			(3 * Math.PI) / 4,
			(5 * Math.PI) / 6,
			Math.PI,
			(3 * Math.PI) / 2,
			2 * Math.PI,
			(5 * Math.PI) / 2,
			3 * Math.PI,
		])
		const expected = [
			1,
			1,
			Math.sqrt(3) / 2,
			Math.SQRT1_2,
			0.5,
			0,
			-0.5,
			-Math.SQRT1_2,
			-Math.sqrt(3) / 2,
			-1,
			0,
			1,
			0,
			-1,
		]
		const out = cosTypedSeries(angles)
		assert.equal(out.length, angles.length)
		assert.equal(out[0], 1)
		assert.equal(out[1], 1)
		for (let i = 0; i < angles.length; i++) {
			assertClose(out[i], expected[i], 1e-14, `angle[${i}]=${angles[i]}`)
		}
	})

	test('handles negative angles and satisfies even-function identity cos(-x) === cos(x)', () => {
		const pos = new Float64Array([
			0.123456789,
			Math.PI / 6,
			Math.PI / 4,
			Math.PI / 2,
			Math.PI,
			4.71238898,
			17.5,
			12345.6789,
			1e9 + 0.5,
		])
		const neg = new Float64Array(pos.length)
		for (let i = 0; i < pos.length; i++) neg[i] = -pos[i]

		const cPos = cosTypedSeries(pos)
		const cNeg = cosTypedSeries(neg)
		for (let i = 0; i < pos.length; i++) {
			assert.equal(cNeg[i], cPos[i], `cos(-${pos[i]}) should equal cos(${pos[i]})`)
			assertClose(cNeg[i], Math.cos(neg[i]), TOL, `neg[${i}]`)
		}
	})

	test('handles very small, subnormal, and non-finite (NaN, +/-Infinity) values', () => {
		const input = new Float64Array([
			1e-8,
			1e-12,
			1e-16,
			Number.MIN_VALUE,
			-Number.MIN_VALUE,
			Number.NaN,
			Number.POSITIVE_INFINITY,
			Number.NEGATIVE_INFINITY,
		])
		const out = cosTypedSeries(input)
		assertClose(out[0], 1 - 0.5e-16, 1e-15, '1e-8')
		assert.equal(out[1], 1)
		assert.equal(out[2], 1)
		assert.equal(out[3], 1)
		assert.equal(out[4], 1)
		assert.ok(Number.isNaN(out[5]), 'cos(NaN) must be NaN')
		assert.ok(Number.isNaN(out[6]), 'cos(+Infinity) must be NaN')
		assert.ok(Number.isNaN(out[7]), 'cos(-Infinity) must be NaN')
	})

	test('handles large angles accurately across Cody-Waite and Payne-Hanek ranges', () => {
		const large = new Float64Array([
			1e3,
			1e5,
			1e6,
			9.999999e6,
			1e7,
			1e8,
			1e10,
			1e12,
			1e15,
			1e20,
			1e50,
			1e100,
			-1e12,
			-1e20,
			Math.PI * 1e6,
			Math.PI * 1e6 + Math.PI / 2,
		])
		const out = cosTypedSeries(large)
		for (let i = 0; i < large.length; i++) {
			assertClose(out[i], Math.cos(large[i]), TOL, `large[${i}]=${large[i]}`)
		}
	})

	test('works properly with Float64Array subarray views', () => {
		const backing = new Float64Array([99, 0, Math.PI / 3, Math.PI, -99])
		const view = backing.subarray(1, 4)
		const out = cosTypedSeries(view)
		assert.equal(out.length, 3)
		assertClose(out[0], 1, TOL, 'view[0]')
		assertClose(out[1], 0.5, TOL, 'view[1]')
		assertClose(out[2], -1, TOL, 'view[2]')
	})

	test('independent cross-check against Math.cos across a dense sweep', () => {
		const n = 2001
		const angles = new Float64Array(n)
		for (let i = 0; i < n; i++) {
			angles[i] = -100 + (200 * i) / (n - 1)
		}
		const out = cosTypedSeries(angles)
		let maxErr = 0
		for (let i = 0; i < n; i++) {
			const err = Math.abs(out[i] - Math.cos(angles[i]))
			if (err > maxErr) maxErr = err
		}
		assert.ok(maxErr < 1e-14, `Max error against Math.cos too large: ${maxErr}`)
	})

	test('independent cross-check via double-angle, triple-angle, periodicity, and Pythagorean identities', () => {
		const xs = new Float64Array([
			0.1,
			0.7,
			1.2345,
			2.5,
			3.9,
			-0.85,
			-5.123,
			12.345,
			-42.7,
			1000.3,
		])
		const twoXs = new Float64Array(xs.length)
		const threeXs = new Float64Array(xs.length)
		const plusTwoPi = new Float64Array(xs.length)
		const plusPi = new Float64Array(xs.length)
		const complement = new Float64Array(xs.length)

		for (let i = 0; i < xs.length; i++) {
			twoXs[i] = 2 * xs[i]
			threeXs[i] = 3 * xs[i]
			plusTwoPi[i] = xs[i] + 2 * Math.PI
			plusPi[i] = xs[i] + Math.PI
			complement[i] = Math.PI / 2 - xs[i]
		}

		const cx = cosTypedSeries(xs)
		const c2x = cosTypedSeries(twoXs)
		const c3x = cosTypedSeries(threeXs)
		const c2pi = cosTypedSeries(plusTwoPi)
		const cpi = cosTypedSeries(plusPi)
		const sx = cosTypedSeries(complement) // sin(x) = cos(pi/2 - x)

		for (let i = 0; i < xs.length; i++) {
			// Double-angle: cos(2x) = 2*cos^2(x) - 1
			assertClose(c2x[i], 2 * cx[i] * cx[i] - 1, 1e-12, `double-angle[${i}]`)
			// Triple-angle: cos(3x) = 4*cos^3(x) - 3*cos(x)
			// (3 * x in float64 incurs O(|x| * eps) input rounding error at |x| ~ 1000)
			assertClose(
				c3x[i],
				4 * cx[i] * cx[i] * cx[i] - 3 * cx[i],
				1e-12,
				`triple-angle[${i}]`
			)
			// Periodicity: cos(x + 2*pi) = cos(x) and cos(x + pi) = -cos(x)
			assertClose(c2pi[i], cx[i], 1e-12, `period-2pi[${i}]`)
			assertClose(cpi[i], -cx[i], 1e-12, `half-period-pi[${i}]`)
			// Pythagorean: cos^2(x) + sin^2(x) = 1
			assertClose(cx[i] * cx[i] + sx[i] * sx[i], 1, 1e-12, `pythagorean[${i}]`)
		}
	})
})
