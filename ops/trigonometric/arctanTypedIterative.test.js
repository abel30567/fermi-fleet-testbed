import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { arctanTypedIterative } from './arctanTypedIterative.js'

/**
 * Independent arctan approximation via composite Simpson's rule on
 * integral_0^x 1 / (1 + t^2) dt.
 */
function simpsonArctan(x, steps = 1000) {
	const h = x / steps
	let sum = 1 + 1 / (1 + x * x)
	for (let i = 1; i < steps; i++) {
		const t = i * h
		sum += (i % 2 === 0 ? 2 : 4) / (1 + t * t)
	}
	return (h / 3) * sum
}

/**
 * Independent arctan series for |x| <= 0.5:
 * sum_{k=0}^{terms-1} (-1)^k * x^(2k+1) / (2k+1).
 */
function taylorArctan(x, terms = 40) {
	let sum = 0
	let power = x
	const x2 = x * x
	for (let k = 0; k < terms; k++) {
		const term = power / (2 * k + 1)
		sum += k % 2 === 0 ? term : -term
		power *= x2
	}
	return sum
}

describe('arctanTypedIterative', () => {
	it('computes known exact trigonometric values and returns a new Float64Array', () => {
		const input = new Float64Array([
			-Math.sqrt(3),
			-1,
			-1 / Math.sqrt(3),
			0,
			1 / Math.sqrt(3),
			1,
			Math.sqrt(3),
		])
		const expected = [
			-Math.PI / 3,
			-Math.PI / 4,
			-Math.PI / 6,
			0,
			Math.PI / 6,
			Math.PI / 4,
			Math.PI / 3,
		]

		const result = arctanTypedIterative(input)

		assert.ok(result instanceof Float64Array)
		assert.notEqual(result, input)
		assert.equal(result.length, input.length)
		for (let i = 0; i < expected.length; i++) {
			assert.ok(
				Math.abs(result[i] - expected[i]) < 1e-15,
				`index ${i}: got ${result[i]}, expected ${expected[i]}`,
			)
		}
	})

	it('does not mutate the input Float64Array', () => {
		const input = new Float64Array([-2.5, 0.5, 3.75])
		const snapshot = new Float64Array(input)

		arctanTypedIterative(input)

		assert.deepEqual(input, snapshot)
	})

	it('handles empty Float64Array', () => {
		const result = arctanTypedIterative(new Float64Array(0))

		assert.ok(result instanceof Float64Array)
		assert.equal(result.length, 0)
	})

	it('handles IEEE-754 special values (-0, +0, ±Infinity, NaN, subnormals, extreme magnitudes)', () => {
		const input = new Float64Array([
			0,
			-0,
			Infinity,
			-Infinity,
			NaN,
			Number.MIN_VALUE,
			-Number.MIN_VALUE,
			Number.MAX_VALUE,
			-Number.MAX_VALUE,
		])

		const result = arctanTypedIterative(input)

		assert.ok(Object.is(result[0], 0))
		assert.ok(Object.is(result[1], -0))
		assert.equal(result[2], Math.PI / 2)
		assert.equal(result[3], -Math.PI / 2)
		assert.ok(Number.isNaN(result[4]))
		assert.equal(result[5], Number.MIN_VALUE)
		assert.equal(result[6], -Number.MIN_VALUE)
		assert.equal(result[7], Math.PI / 2)
		assert.equal(result[8], -Math.PI / 2)
	})

	it('handles Float64Array subarray views with non-zero byteOffset', () => {
		const backing = new Float64Array([100, -1, 0, 1, 200])
		const view = backing.subarray(1, 4)

		const result = arctanTypedIterative(view)

		assert.equal(result.length, 3)
		assert.ok(Math.abs(result[0] - -Math.PI / 4) < 1e-15)
		assert.equal(result[1], 0)
		assert.ok(Math.abs(result[2] - Math.PI / 4) < 1e-15)
	})

	it('validates input and throws TypeError for non-Float64Array inputs', () => {
		const invalidInputs = [
			null,
			undefined,
			0,
			1,
			'1',
			{},
			[0, 1],
			new Float32Array([0, 1]),
			new Int32Array([0, 1]),
			new Uint8Array([0, 1]),
		]

		for (const bad of invalidInputs) {
			assert.throws(() => arctanTypedIterative(bad), TypeError)
		}
	})

	it('cross-checks against Maclaurin power series for |x| <= 0.5', () => {
		const input = new Float64Array([-0.5, -0.37, -0.2, -0.05, 0.05, 0.2, 0.37, 0.5])
		const result = arctanTypedIterative(input)

		for (let i = 0; i < input.length; i++) {
			const reference = taylorArctan(input[i])
			assert.ok(
				Math.abs(result[i] - reference) < 1e-15,
				`x=${input[i]}: got ${result[i]}, taylor=${reference}`,
			)
		}
	})

	it('cross-checks against numerical integration (Simpson rule) of 1/(1+t^2)', () => {
		const input = new Float64Array([-5, -2.25, -0.75, 0.75, 2.25, 5])
		const result = arctanTypedIterative(input)

		for (let i = 0; i < input.length; i++) {
			const integrated = simpsonArctan(input[i])
			assert.ok(
				Math.abs(result[i] - integrated) < 1e-10,
				`x=${input[i]}: got ${result[i]}, simpson=${integrated}`,
			)
		}
	})

	it('satisfies algebraic identities: odd symmetry, reciprocal complement, inverse tan, and Machin formula', () => {
		const positives = new Float64Array([0.1, 0.5, 1, 2.5, 10, 50])
		const negatives = new Float64Array(positives.map((x) => -x))
		const reciprocals = new Float64Array(positives.map((x) => 1 / x))

		const posRes = arctanTypedIterative(positives)
		const negRes = arctanTypedIterative(negatives)
		const recRes = arctanTypedIterative(reciprocals)

		for (let i = 0; i < positives.length; i++) {
			// Odd symmetry: arctan(-x) = -arctan(x)
			assert.equal(negRes[i], -posRes[i])
			// Reciprocal complement: arctan(x) + arctan(1/x) = pi/2 for x > 0
			assert.ok(Math.abs(posRes[i] + recRes[i] - Math.PI / 2) < 1e-15)
			// Inverse tan: tan(arctan(x)) = x
			assert.ok(
				Math.abs(Math.tan(posRes[i]) - positives[i]) <
					1e-12 * (1 + Math.abs(positives[i])),
			)
		}

		// Machin's formula: 4 * arctan(1/5) - arctan(1/239) = pi/4
		const machin = arctanTypedIterative(new Float64Array([1 / 5, 1 / 239]))
		assert.ok(Math.abs(4 * machin[0] - machin[1] - Math.PI / 4) < 1e-15)
	})
})
