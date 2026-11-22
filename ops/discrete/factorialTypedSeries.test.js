import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { factorialTypedSeries } from './factorialTypedSeries.js'

/**
 * Independent exact BigInt factorial for cross-checking.
 *
 * @param {number} n
 * @returns {bigint}
 */
function exactBigIntFactorial(n) {
	let acc = 1n
	for (let i = 2n; i <= BigInt(n); i++) {
		acc *= i
	}
	return acc
}

/**
 * Assert two positive finite numbers agree within a relative tolerance.
 *
 * @param {number} actual
 * @param {number} expected
 * @param {number} relTol
 * @param {string} [message]
 */
function assertRelativeClose(actual, expected, relTol, message) {
	assert.ok(Number.isFinite(actual), `expected finite actual, got ${actual}`)
	assert.ok(Number.isFinite(expected), `expected finite expected, got ${expected}`)
	const relErr = Math.abs(actual - expected) / Math.abs(expected)
	assert.ok(
		relErr <= relTol,
		`${message ?? 'relative error too large'}: actual=${actual}, expected=${expected}, relErr=${relErr} > ${relTol}`
	)
}

describe('factorialTypedSeries', () => {
	it('computes exact values for small non-negative integers', () => {
		const input = new Float64Array([0, 1, 2, 3, 4, 5, 6, 10, 12, 15])
		const expected = [
			1,
			1,
			2,
			6,
			24,
			120,
			720,
			3628800,
			479001600,
			1307674368000,
		]

		const result = factorialTypedSeries(input)
		assert.ok(result instanceof Float64Array)
		assert.equal(result.length, input.length)
		assert.deepEqual(Array.from(result), expected)
	})

	it('does not mutate the input Float64Array and works on subarrays', () => {
		const backing = new Float64Array([99, 0, 4, 7, 100])
		const view = backing.subarray(1, 4)
		const snapshot = Array.from(backing)

		const result = factorialTypedSeries(view)
		assert.deepEqual(Array.from(backing), snapshot)
		assert.notEqual(result, view)
		assert.deepEqual(Array.from(result), [1, 24, 5040])
	})

	it('handles edge cases: empty array, -0, unsorted/duplicates, and overflow at n >= 171', () => {
		const empty = factorialTypedSeries(new Float64Array(0))
		assert.ok(empty instanceof Float64Array)
		assert.equal(empty.length, 0)

		const negZero = factorialTypedSeries(new Float64Array([-0]))
		assert.ok(Object.is(negZero[0], 1))

		const mixed = factorialTypedSeries(
			new Float64Array([5, 0, 5, 170, 171, 172, 1000, Number.MAX_SAFE_INTEGER])
		)
		assert.equal(mixed[0], 120)
		assert.equal(mixed[1], 1)
		assert.equal(mixed[2], 120)
		assert.ok(Number.isFinite(mixed[3]))
		assertRelativeClose(mixed[3], Number(exactBigIntFactorial(170)), 1e-14, '170!')
		assert.equal(mixed[4], Infinity)
		assert.equal(mixed[5], Infinity)
		assert.equal(mixed[6], Infinity)
		assert.equal(mixed[7], Infinity)
	})

	it('throws TypeError for non-Float64Array inputs', () => {
		const invalidInputs = [
			null,
			undefined,
			[1, 2, 3],
			new Float32Array([1, 2]),
			new Int32Array([1, 2]),
			new Uint32Array([1, 2]),
			5,
			'5',
			{},
		]

		for (const bad of invalidInputs) {
			assert.throws(() => factorialTypedSeries(bad), TypeError)
		}
	})

	it('throws RangeError for negative, fractional, NaN, or infinite elements', () => {
		const invalidElements = [
			new Float64Array([-1]),
			new Float64Array([3, -10]),
			new Float64Array([0.5]),
			new Float64Array([2, 3.14159]),
			new Float64Array([-0.25]),
			new Float64Array([NaN]),
			new Float64Array([0, NaN]),
			new Float64Array([Infinity]),
			new Float64Array([-Infinity]),
		]

		for (const bad of invalidElements) {
			assert.throws(() => factorialTypedSeries(bad), RangeError)
		}
	})

	it('cross-checks every integer n in [0, 170] against independent BigInt factorial', () => {
		const input = new Float64Array(171)
		for (let n = 0; n <= 170; n++) {
			input[n] = n
		}

		const result = factorialTypedSeries(input)

		let exact = 1n
		for (let n = 0; n <= 170; n++) {
			if (n > 1) {
				exact *= BigInt(n)
			}
			const expected = Number(exact)
			if (n <= 15) {
				assert.equal(result[n], expected, `exact mismatch at n=${n}`)
			} else {
				assertRelativeClose(result[n], expected, 1e-14, `n=${n}`)
			}
		}
	})

	it('satisfies the factorial recurrence n! / (n - 1)! = n and Pascal binomial identity', () => {
		const input = new Float64Array(171)
		for (let n = 0; n <= 170; n++) {
			input[n] = n
		}
		const fact = factorialTypedSeries(input)

		for (let n = 1; n <= 170; n++) {
			assertRelativeClose(fact[n] / fact[n - 1], n, 1e-14, `recurrence at n=${n}`)
		}

		// Independent Pascal's triangle computation for 0 <= k <= n <= 20
		const pascal = []
		for (let n = 0; n <= 20; n++) {
			pascal[n] = new Array(n + 1).fill(1)
			for (let k = 1; k < n; k++) {
				pascal[n][k] = pascal[n - 1][k - 1] + pascal[n - 1][k]
			}
		}

		for (let n = 0; n <= 20; n++) {
			for (let k = 0; k <= n; k++) {
				const fromFact = fact[n] / (fact[k] * fact[n - k])
				assertRelativeClose(fromFact, pascal[n][k], 1e-14, `C(${n},${k})`)
			}
		}
	})
})
