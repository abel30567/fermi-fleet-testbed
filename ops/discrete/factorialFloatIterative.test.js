import { describe, test } from 'node:test'
import assert from 'node:assert'
import { factorialFloatIterative } from './factorialFloatIterative.js'

/**
 * Independent exact factorial using BigInt for cross-checking.
 * @param {number} n
 * @returns {bigint}
 */
function exactBigIntFactorial(n) {
	let acc = 1n
	for (let i = 2n; i <= BigInt(n); i += 1n) {
		acc *= i
	}
	return acc
}

/**
 * Independent log-factorial via Stirling's asymptotic series:
 * ln(n!) ≈ n*ln(n) - n + 0.5*ln(2*pi*n) + 1/(12*n) - 1/(360*n^3) + 1/(1260*n^5) - 1/(1680*n^7)
 * @param {number} n
 * @returns {number}
 */
function stirlingLogFactorial(n) {
	const invN = 1 / n
	const invN2 = invN * invN
	const invN3 = invN * invN2
	const invN5 = invN3 * invN2
	const invN7 = invN5 * invN2
	return (
		n * Math.log(n) -
		n +
		0.5 * Math.log(2 * Math.PI * n) +
		invN / 12 -
		invN3 / 360 +
		invN5 / 1260 -
		invN7 / 1680
	)
}

describe('factorialFloatIterative', () => {
	test('base and small integer cases', () => {
		assert.strictEqual(factorialFloatIterative(0), 1)
		assert.strictEqual(factorialFloatIterative(-0), 1)
		assert.strictEqual(factorialFloatIterative(1), 1)
		assert.strictEqual(factorialFloatIterative(2), 2)
		assert.strictEqual(factorialFloatIterative(3), 6)
		assert.strictEqual(factorialFloatIterative(4), 24)
		assert.strictEqual(factorialFloatIterative(5), 120)
		assert.strictEqual(factorialFloatIterative(10), 3628800)
		assert.strictEqual(factorialFloatIterative(12), 479001600)
		assert.strictEqual(factorialFloatIterative(18), 6402373705728000)
	})

	test('float64 overflow boundary (170! finite, 171! and larger Infinity)', () => {
		const f170 = factorialFloatIterative(170)
		assert.ok(Number.isFinite(f170), '170! should be finite in float64')
		assert.ok(
			Math.abs(f170 - 7.257415615307999e306) / 7.257415615307999e306 < 1e-13,
			`Unexpected 170! value: ${f170}`,
		)

		assert.strictEqual(factorialFloatIterative(171), Infinity)
		assert.strictEqual(factorialFloatIterative(172), Infinity)
		assert.strictEqual(factorialFloatIterative(1000), Infinity)
		assert.strictEqual(
			factorialFloatIterative(Number.MAX_SAFE_INTEGER),
			Infinity,
		)
	})

	test('rejects invalid inputs', () => {
		// Negative integers
		for (const bad of [-1, -5, -170, -1000]) {
			assert.throws(
				() => factorialFloatIterative(bad),
				RangeError,
				`Expected RangeError for ${bad}`,
			)
		}

		// Non-integer finite numbers
		for (const bad of [0.5, 1.5, 3.14, -0.5, 170.1]) {
			assert.throws(
				() => factorialFloatIterative(bad),
				RangeError,
				`Expected RangeError for ${bad}`,
			)
		}

		// NaN and non-finite numbers
		for (const bad of [NaN, Infinity, -Infinity]) {
			assert.throws(
				() => factorialFloatIterative(bad),
				RangeError,
				`Expected RangeError for ${bad}`,
			)
		}

		// Non-number types
		for (const bad of ['5', '0', '', null, undefined, true, false, 5n, {}, []]) {
			assert.throws(
				() => factorialFloatIterative(bad),
				TypeError,
				`Expected TypeError for ${String(bad)}`,
			)
		}
	})

	test('cross-check against exact BigInt factorial for 0 <= n <= 170', () => {
		for (let n = 0; n <= 170; n += 1) {
			const actual = factorialFloatIterative(n)
			const expected = Number(exactBigIntFactorial(n))

			if (n <= 22) {
				assert.strictEqual(
					actual,
					expected,
					`Expected exact float64 match for ${n}!`,
				)
			} else {
				assert.ok(Number.isFinite(actual), `${n}! should be finite`)
				const relErr = Math.abs(actual - expected) / expected
				assert.ok(
					relErr < 1e-13,
					`Relative error too large for ${n}!: actual=${actual}, expected=${expected}, relErr=${relErr}`,
				)
			}
		}
	})

	test('cross-check against Stirling asymptotic series', () => {
		for (const n of [10, 20, 50, 100, 150, 170]) {
			const actualLog = Math.log(factorialFloatIterative(n))
			const stirlingLog = stirlingLogFactorial(n)
			const relErr = Math.abs(actualLog - stirlingLog) / stirlingLog
			assert.ok(
				relErr < 1e-12,
				`Stirling mismatch for n=${n}: actualLog=${actualLog}, stirlingLog=${stirlingLog}, relErr=${relErr}`,
			)
		}
	})

	test('recurrence relation n! / (n - 1)! ≈ n for 1 <= n <= 170', () => {
		for (let n = 1; n <= 170; n += 1) {
			const ratio =
				factorialFloatIterative(n) / factorialFloatIterative(n - 1)
			const relErr = Math.abs(ratio - n) / n
			assert.ok(
				relErr <= 2 * Number.EPSILON,
				`Recurrence mismatch at n=${n}: ratio=${ratio}, relErr=${relErr}`,
			)
		}
	})
})
