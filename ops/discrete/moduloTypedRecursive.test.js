import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { moduloTypedRecursive } from './moduloTypedRecursive.js'

/**
 * Independent iterative reference implementation using floored division
 * identity `a - b * Math.floor(a / b)` (with exact divisibility / `-0` guard).
 *
 * @param {Float64Array} a
 * @param {Float64Array} b
 * @returns {Float64Array}
 */
function iterativeReferenceModulo(a, b) {
	const out = new Float64Array(a.length)
	for (let i = 0; i < a.length; i++) {
		const x = a[i]
		const y = b[i]
		let r = x - y * Math.floor(x / y)
		if (r === y || r === 0) {
			r = 0
		}
		out[i] = r
	}
	return out
}

describe('moduloTypedRecursive', () => {
	it('computes element-wise modulo for normal positive integer inputs', () => {
		const a = new Float64Array([10, 7, 15, 0, 23])
		const b = new Float64Array([3, 7, 4, 5, 6])
		const res = moduloTypedRecursive(a, b)

		assert.ok(res instanceof Float64Array)
		assert.deepStrictEqual(res, new Float64Array([1, 0, 3, 0, 5]))
		// Verify inputs are not mutated
		assert.deepStrictEqual(a, new Float64Array([10, 7, 15, 0, 23]))
		assert.deepStrictEqual(b, new Float64Array([3, 7, 4, 5, 6]))
	})

	it('computes element-wise modulo for single-element and fractional inputs', () => {
		const single = moduloTypedRecursive(
			new Float64Array([17]),
			new Float64Array([5])
		)
		assert.deepStrictEqual(single, new Float64Array([2]))

		const a = new Float64Array([5.5, 7.25, 0.75, 2.5])
		const b = new Float64Array([2, 0.5, 0.25, 1.25])
		const res = moduloTypedRecursive(a, b)
		assert.deepStrictEqual(res, new Float64Array([1.5, 0.25, 0, 0]))
	})

	it('handles negative dividends and negative divisors with floored modulo semantics', () => {
		const a = new Float64Array([-10, 10, -10, -6, 6, -5.5, 0])
		const b = new Float64Array([3, -3, -3, 3, -3, 2, -4])
		const res = moduloTypedRecursive(a, b)

		assert.deepStrictEqual(res, new Float64Array([2, -2, -1, 0, 0, 0.5, 0]))
		// Ensure no -0 values are produced
		for (let i = 0; i < res.length; i++) {
			assert.equal(Object.is(res[i], -0), false, `index ${i} should not be -0`)
		}
	})

	it('handles empty Float64Array inputs', () => {
		const a = new Float64Array(0)
		const b = new Float64Array(0)
		const res = moduloTypedRecursive(a, b)

		assert.ok(res instanceof Float64Array)
		assert.equal(res.length, 0)
		assert.notEqual(res, a)
		assert.notEqual(res, b)
	})

	it('throws RangeError on zero or negative-zero divisor', () => {
		assert.throws(
			() =>
				moduloTypedRecursive(
					new Float64Array([10, 20, 30]),
					new Float64Array([3, 0, 5])
				),
			{
				name: 'RangeError',
				message: /Division by zero at index 1/
			}
		)

		assert.throws(
			() =>
				moduloTypedRecursive(
					new Float64Array([10, 20]),
					new Float64Array([3, -0])
				),
			{
				name: 'RangeError',
				message: /Division by zero at index 1/
			}
		)
	})

	it('throws RangeError on length mismatch', () => {
		assert.throws(
			() =>
				moduloTypedRecursive(
					new Float64Array([1, 2, 3]),
					new Float64Array([1, 2])
				),
			{
				name: 'RangeError',
				message: /same length/
			}
		)

		assert.throws(
			() =>
				moduloTypedRecursive(new Float64Array([]), new Float64Array([1])),
			{
				name: 'RangeError',
				message: /same length/
			}
		)
	})

	it('throws TypeError on invalid input types', () => {
		const valid = new Float64Array([1, 2])

		for (const bad of [
			null,
			undefined,
			[1, 2],
			new Float32Array([1, 2]),
			new Int32Array([1, 2]),
			'12',
			42,
			{}
		]) {
			assert.throws(() => moduloTypedRecursive(bad, valid), {
				name: 'TypeError'
			})
			assert.throws(() => moduloTypedRecursive(valid, bad), {
				name: 'TypeError'
			})
		}
	})

	it('throws RangeError on non-finite element values (NaN, Infinity, -Infinity)', () => {
		assert.throws(
			() =>
				moduloTypedRecursive(
					new Float64Array([1, Number.NaN]),
					new Float64Array([2, 3])
				),
			{
				name: 'RangeError',
				message: /Invalid dividend at index 1/
			}
		)

		assert.throws(
			() =>
				moduloTypedRecursive(
					new Float64Array([Number.POSITIVE_INFINITY]),
					new Float64Array([2])
				),
			{
				name: 'RangeError',
				message: /Invalid dividend at index 0/
			}
		)

		assert.throws(
			() =>
				moduloTypedRecursive(
					new Float64Array([1, 2]),
					new Float64Array([3, Number.NEGATIVE_INFINITY])
				),
			{
				name: 'RangeError',
				message: /Invalid divisor at index 1/
			}
		)

		assert.throws(
			() =>
				moduloTypedRecursive(
					new Float64Array([1]),
					new Float64Array([Number.NaN])
				),
			{
				name: 'RangeError',
				message: /Invalid divisor at index 0/
			}
		)
	})

	it('cross-checks against an independent iterative computation over large mixed inputs', () => {
		const n = 2049 // non-power-of-two size to exercise uneven divide-and-conquer splits
		const a = new Float64Array(n)
		const b = new Float64Array(n)

		// Deterministic LCG for reproducible test vectors
		let seed = 0x12345678
		const nextInt = (min, max) => {
			seed = (Math.imul(1664525, seed) + 1013904223) >>> 0
			return min + (seed % (max - min + 1))
		}

		for (let i = 0; i < n; i++) {
			a[i] = nextInt(-10000, 10000) / 4
			let divisor = nextInt(-500, 500)
			if (divisor === 0) divisor = 7
			b[i] = divisor / 2
		}

		const actual = moduloTypedRecursive(a, b)
		const expected = iterativeReferenceModulo(a, b)

		assert.equal(actual.length, expected.length)
		for (let i = 0; i < n; i++) {
			assert.ok(
				Math.abs(actual[i] - expected[i]) < 1e-12,
				`mismatch at index ${i}: actual=${actual[i]}, expected=${expected[i]} (a=${a[i]}, b=${b[i]})`
			)
			assert.equal(Object.is(actual[i], -0), false)
		}
	})
})
