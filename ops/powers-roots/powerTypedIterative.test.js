import { describe, test } from 'node:test'
import assert from 'node:assert'
import { powerTypedIterative } from './powerTypedIterative.js'

/**
 * Asserts two finite numbers are equal within a relative/absolute tolerance.
 *
 * @param {number} actual
 * @param {number} expected
 * @param {number} [tol=1e-12]
 */
function assertClose(actual, expected, tol = 1e-12) {
	const scale = Math.max(1, Math.abs(expected))
	assert.ok(
		Math.abs(actual - expected) <= tol * scale,
		`Expected ${actual} to be within ${tol * scale} of ${expected}`
	)
}

describe('powerTypedIterative', () => {
	test('computes normal element-wise powers without mutating inputs', () => {
		const bases = new Float64Array([2, 3, 4, 9, -2, -3, 10])
		const exponents = new Float64Array([3, 2, 0.5, 0.5, 3, 2, -2])
		const basesSnapshot = new Float64Array(bases)
		const exponentsSnapshot = new Float64Array(exponents)

		const out = powerTypedIterative(bases, exponents)

		assert.ok(out instanceof Float64Array)
		assert.notStrictEqual(out, bases)
		assert.notStrictEqual(out, exponents)
		assert.deepStrictEqual(bases, basesSnapshot)
		assert.deepStrictEqual(exponents, exponentsSnapshot)
		assert.deepStrictEqual(out, new Float64Array([8, 9, 2, 3, -8, 9, 0.01]))
	})

	test('handles fractional roots and negative fractional exponents', () => {
		const bases = new Float64Array([16, 27, 81, 0.25, 8])
		const exponents = new Float64Array([0.25, 1 / 3, 0.75, -0.5, -1 / 3])

		const out = powerTypedIterative(bases, exponents)
		const expected = [2, 3, 27, 2, 0.5]

		assert.strictEqual(out.length, expected.length)
		for (let i = 0; i < expected.length; i += 1) {
			assertClose(out[i], expected[i])
		}
	})

	test('handles empty and single-element Float64Arrays', () => {
		const emptyOut = powerTypedIterative(new Float64Array(0), new Float64Array(0))
		assert.ok(emptyOut instanceof Float64Array)
		assert.strictEqual(emptyOut.length, 0)

		const singleOut = powerTypedIterative(new Float64Array([5]), new Float64Array([4]))
		assert.deepStrictEqual(singleOut, new Float64Array([625]))
	})

	test('handles subarray views with non-zero byte offsets', () => {
		const backingBases = new Float64Array([99, 2, 3, 5, 77])
		const backingExps = new Float64Array([88, 4, 3, 2, 66])
		const baseView = backingBases.subarray(1, 4)
		const expView = backingExps.subarray(1, 4)

		const out = powerTypedIterative(baseView, expView)
		assert.deepStrictEqual(out, new Float64Array([16, 27, 25]))
	})

	test('handles IEEE 754 edge cases (zeros, signed zeros, infinities, NaN, overflow/underflow)', () => {
		const bases = new Float64Array([
			0,
			0,
			0,
			-0,
			-0,
			NaN,
			2,
			-2,
			1,
			2,
			2,
			1e200,
			1e-200,
		])
		const exponents = new Float64Array([
			0,
			5,
			-1,
			-1,
			-2,
			0,
			NaN,
			0.5,
			Infinity,
			Infinity,
			-Infinity,
			2,
			2,
		])

		const out = powerTypedIterative(bases, exponents)

		assert.strictEqual(out[0], 1) // 0^0 === 1
		assert.strictEqual(out[1], 0) // 0^5 === 0
		assert.strictEqual(out[2], Infinity) // 0^-1 === Infinity
		assert.strictEqual(out[3], -Infinity) // (-0)^-1 === -Infinity
		assert.strictEqual(out[4], Infinity) // (-0)^-2 === Infinity
		assert.strictEqual(out[5], 1) // NaN^0 === 1
		assert.ok(Number.isNaN(out[6])) // 2^NaN -> NaN
		assert.ok(Number.isNaN(out[7])) // (-2)^0.5 -> NaN
		assert.ok(Number.isNaN(out[8])) // 1^Infinity -> NaN
		assert.strictEqual(out[9], Infinity) // 2^Infinity === Infinity
		assert.strictEqual(out[10], 0) // 2^-Infinity === 0
		assert.strictEqual(out[11], Infinity) // overflow
		assert.strictEqual(out[12], 0) // underflow
	})

	test('scales iteratively over large Float64Arrays', () => {
		const n = 20_000
		const bases = new Float64Array(n)
		const exponents = new Float64Array(n)
		for (let i = 0; i < n; i += 1) {
			bases[i] = 1 + (i % 7) * 0.5
			exponents[i] = (i % 5) - 2
		}

		const out = powerTypedIterative(bases, exponents)
		assert.strictEqual(out.length, n)
		assertClose(out[0], 1) // 1^-2
		assertClose(out[1], 1 / 1.5) // 1.5^-1
		assertClose(out[2], 1) // 2^0
		assertClose(out[3], 2.5) // 2.5^1
		assertClose(out[4], 9) // 3^2
	})

	test('validates input types and lengths', () => {
		const valid = new Float64Array([1, 2])
		const invalidInputs = [
			[1, 2],
			new Float32Array([1, 2]),
			new Int32Array([1, 2]),
			null,
			undefined,
			42,
			'12',
			{ length: 2, 0: 1, 1: 2 },
		]

		for (const bad of invalidInputs) {
			assert.throws(() => powerTypedIterative(bad, valid), TypeError)
			assert.throws(() => powerTypedIterative(valid, bad), TypeError)
		}

		assert.throws(
			() => powerTypedIterative(new Float64Array([1, 2, 3]), new Float64Array([1, 2])),
			RangeError
		)
		assert.throws(
			() => powerTypedIterative(new Float64Array(0), new Float64Array([1])),
			RangeError
		)
	})

	test('independent cross-check: matches exp(e * ln(b)) for positive bases', () => {
		const bases = new Float64Array([0.1, 0.5, 1.0, 1.5, Math.E, 3.14159, 7.25, 12.5, 100])
		const exponents = new Float64Array([-2.5, -1.2, 0, 0.33, 1.0, 1.75, -0.5, 2.4, 0.25])

		const out = powerTypedIterative(bases, exponents)

		for (let i = 0; i < bases.length; i += 1) {
			const independent = Math.exp(exponents[i] * Math.log(bases[i]))
			assertClose(out[i], independent, 1e-12)
		}
	})

	test('independent cross-check: matches repeated multiplication for integer exponents', () => {
		const bases = new Float64Array([2, -2, 3, -3, 0.5, -0.5, 1.25, 7])
		const exponents = new Float64Array([0, 1, 2, 3, 4, -3, 5, -2])

		const out = powerTypedIterative(bases, exponents)

		for (let i = 0; i < bases.length; i += 1) {
			const b = bases[i]
			const e = exponents[i]
			let expected = 1
			const steps = Math.abs(e)
			for (let k = 0; k < steps; k += 1) {
				expected *= b
			}
			if (e < 0) {
				expected = 1 / expected
			}
			assertClose(out[i], expected, 1e-12)
		}
	})

	test('independent cross-check: satisfies exponent and inverse-root identities', () => {
		const bases = new Float64Array([0.75, 1.5, 2.5, 4.2, 9.8])
		const e1 = new Float64Array([1.3, -0.7, 2.1, 0.5, -1.1])
		const e2 = new Float64Array([-0.4, 1.9, -0.6, 1.5, 2.3])
		const eSum = new Float64Array(bases.length)
		const eProd = new Float64Array(bases.length)
		const invE = new Float64Array(bases.length)
		const posE = new Float64Array([2, 3, 4, 5, 7])

		for (let i = 0; i < bases.length; i += 1) {
			eSum[i] = e1[i] + e2[i]
			eProd[i] = e1[i] * e2[i]
			invE[i] = 1 / posE[i]
		}

		const p1 = powerTypedIterative(bases, e1)
		const p2 = powerTypedIterative(bases, e2)
		const pSum = powerTypedIterative(bases, eSum)
		const pNested = powerTypedIterative(p1, e2)
		const pProd = powerTypedIterative(bases, eProd)
		const roundTrip = powerTypedIterative(powerTypedIterative(bases, posE), invE)

		for (let i = 0; i < bases.length; i += 1) {
			// b^e1 * b^e2 === b^(e1 + e2)
			assertClose(p1[i] * p2[i], pSum[i], 1e-12)
			// (b^e1)^e2 === b^(e1 * e2)
			assertClose(pNested[i], pProd[i], 1e-12)
			// (b^n)^(1/n) === b
			assertClose(roundTrip[i], bases[i], 1e-12)
		}
	})
})
