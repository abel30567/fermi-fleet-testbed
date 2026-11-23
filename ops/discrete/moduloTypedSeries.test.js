import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { moduloTypedSeries } from './moduloTypedSeries.js'

/**
 * Independent reference implementation via iterative subtraction/addition
 * for bounded inputs, avoiding both `%` and `Math.floor`.
 */
function iterativeModuloRef(a, b) {
	let r = a
	if (b > 0) {
		while (r >= b) r -= b
		while (r < 0) r += b
	} else {
		while (r <= b) r -= b
		while (r > 0) r += b
	}
	return r === 0 ? 0 : r
}

describe('moduloTypedSeries', () => {
	test('positive integers and exact multiples', () => {
		const a = new Float64Array([0, 1, 5, 7, 12, 100])
		const b = new Float64Array([3, 3, 3, 3, 4, 7])
		const res = moduloTypedSeries(a, b)

		assert.ok(res instanceof Float64Array)
		assert.deepEqual(res, new Float64Array([0, 1, 2, 1, 0, 2]))
	})

	test('negative dividends and negative divisors follow Knuth floored modulo', () => {
		const a = new Float64Array([-7, 7, -7, -6, 6, -1, 1])
		const b = new Float64Array([3, -3, -3, 3, -3, 5, -5])
		const res = moduloTypedSeries(a, b)

		// -7 = 3*(-3) + 2
		//  7 = (-3)*(-3) + (-2)
		// -7 = (-3)*(2) + (-1)
		// -6 = 3*(-2) + 0
		//  6 = (-3)*(-2) + 0
		// -1 = 5*(-1) + 4
		//  1 = (-5)*(-1) + (-4)
		assert.deepEqual(res, new Float64Array([2, -2, -1, 0, 0, 4, -4]))
		assert.ok(Object.is(res[3], 0))
		assert.ok(Object.is(res[4], 0))
	})

	test('fractional finite float64 values', () => {
		const a = new Float64Array([5.5, -5.5, 5.5, -5.5, 2.25])
		const b = new Float64Array([2.0, 2.0, -2.0, -2.0, 0.75])
		const res = moduloTypedSeries(a, b)

		assert.deepEqual(res, new Float64Array([1.5, 0.5, -0.5, -1.5, 0]))
	})

	test('edge cases: empty arrays, -0 dividend, sub-ulp negative values, and non-mutation', () => {
		const emptyRes = moduloTypedSeries(new Float64Array(0), new Float64Array(0))
		assert.ok(emptyRes instanceof Float64Array)
		assert.equal(emptyRes.length, 0)

		const a = new Float64Array([-0, -1e-17, 1e-17, 1e16, -1e16, 1e300])
		const b = new Float64Array([5, 1, -1, 3, 3, 1e-20])
		const aSnapshot = new Float64Array(a)
		const bSnapshot = new Float64Array(b)

		const res = moduloTypedSeries(a, b)

		// Inputs are not mutated
		assert.deepEqual(a, aSnapshot)
		assert.deepEqual(b, bSnapshot)
		assert.notEqual(res, a)
		assert.notEqual(res, b)

		// -0 normalized to +0
		assert.ok(Object.is(res[0], 0))
		// Rounding boundary: (-1e-17) + 1 === 1 normalized to 0 to keep 0 <= r < b
		assert.ok(Object.is(res[1], 0))
		assert.ok(Object.is(res[2], 0))
		// Large integers above MAX_SAFE_INTEGER stay exact (1e16 = 3 * 3333333333333333 + 1)
		assert.equal(res[3], 1)
		assert.equal(res[4], 2)
		// Extreme ratio where a / b would overflow Infinity still yields a valid finite remainder
		assert.ok(Number.isFinite(res[5]))
		assert.ok(res[5] >= 0 && res[5] < b[5])
	})

	test('cross-check against closed-form a - b * Math.floor(a / b) and iterative reference', () => {
		const aVals = []
		const bVals = []
		for (let x = -25; x <= 25; x++) {
			for (const m of [-7, -4, -1, 1, 4, 7]) {
				aVals.push(x)
				bVals.push(m)
			}
		}

		const a = new Float64Array(aVals)
		const b = new Float64Array(bVals)
		const actual = moduloTypedSeries(a, b)

		for (let i = 0; i < a.length; i++) {
			const expectedClosedForm = a[i] - b[i] * Math.floor(a[i] / b[i])
			const expectedIter = iterativeModuloRef(a[i], b[i])

			assert.equal(actual[i], expectedClosedForm === 0 ? 0 : expectedClosedForm)
			assert.equal(actual[i], expectedIter)

			// Division algorithm identity: a === b * floor(a / b) + r
			assert.equal(b[i] * Math.floor(a[i] / b[i]) + actual[i], a[i])

			// Strict range invariant
			if (b[i] > 0) {
				assert.ok(actual[i] >= 0 && actual[i] < b[i])
			} else {
				assert.ok(actual[i] <= 0 && actual[i] > b[i])
			}
		}
	})

	test('algebraic congruence identities: periodicity, idempotence, and ring homomorphisms', () => {
		const a = new Float64Array([-43, -12, 0, 19, 87])
		const c = new Float64Array([11, -29, 7, 34, -55])
		const b = new Float64Array([7, 13, 5, 11, 17])

		// Periodicity: mod(a + k*b, b) === mod(a, b)
		const shifted = new Float64Array(a.map((v, i) => v + 5 * b[i]))
		const modA = moduloTypedSeries(a, b)
		assert.deepEqual(moduloTypedSeries(shifted, b), modA)

		// Idempotence: mod(mod(a, b), b) === mod(a, b)
		assert.deepEqual(moduloTypedSeries(modA, b), modA)

		// Additive homomorphism: mod(a + c, b) === mod(mod(a, b) + mod(c, b), b)
		const modC = moduloTypedSeries(c, b)
		const sumAC = new Float64Array(a.map((v, i) => v + c[i]))
		const sumMod = new Float64Array(modA.map((v, i) => v + modC[i]))
		assert.deepEqual(moduloTypedSeries(sumAC, b), moduloTypedSeries(sumMod, b))

		// Multiplicative homomorphism: mod(a * c, b) === mod(mod(a, b) * mod(c, b), b)
		const prodAC = new Float64Array(a.map((v, i) => v * c[i]))
		const prodMod = new Float64Array(modA.map((v, i) => v * modC[i]))
		assert.deepEqual(moduloTypedSeries(prodAC, b), moduloTypedSeries(prodMod, b))
	})

	test('input validation rejects invalid types, mismatched lengths, zero modulus, and non-finite values', () => {
		const valid = new Float64Array([1, 2])

		assert.throws(() => moduloTypedSeries([1, 2], valid), TypeError)
		assert.throws(() => moduloTypedSeries(valid, [1, 2]), TypeError)
		assert.throws(() => moduloTypedSeries(new Float32Array([1, 2]), valid), TypeError)
		assert.throws(() => moduloTypedSeries(valid, new Int32Array([1, 2])), TypeError)
		assert.throws(() => moduloTypedSeries(null, valid), TypeError)

		assert.throws(
			() => moduloTypedSeries(new Float64Array([1, 2, 3]), valid),
			RangeError
		)
		assert.throws(
			() => moduloTypedSeries(valid, new Float64Array([1, 0])),
			RangeError
		)
		assert.throws(
			() => moduloTypedSeries(valid, new Float64Array([1, -0])),
			RangeError
		)
		assert.throws(
			() => moduloTypedSeries(new Float64Array([NaN, 2]), valid),
			RangeError
		)
		assert.throws(
			() => moduloTypedSeries(new Float64Array([Infinity, 2]), valid),
			RangeError
		)
		assert.throws(
			() => moduloTypedSeries(valid, new Float64Array([1, -Infinity])),
			RangeError
		)
	})
})
