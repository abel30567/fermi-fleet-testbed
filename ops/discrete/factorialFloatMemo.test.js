import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { factorialFloatMemo } from './factorialFloatMemo.js'

/**
 * Independent BigInt reference implementation of factorial.
 *
 * @param {number} n
 * @returns {bigint}
 */
function referenceBigIntFactorial(n) {
	let acc = 1n
	for (let i = 2; i <= n; i += 1) {
		acc *= BigInt(i)
	}
	return acc
}

/**
 * Independent Stirling asymptotic series approximation for `ln(n!)`.
 *
 * @param {number} n
 * @returns {number}
 */
function stirlingLogFactorial(n) {
	const invN = 1 / n
	const invN2 = invN * invN
	return (
		n * Math.log(n) -
		n +
		0.5 * Math.log(2 * Math.PI * n) +
		invN * (1 / 12 - invN2 * (1 / 360 - invN2 / 1260))
	)
}

describe('factorialFloatMemo', () => {
	it('computes known small and exact float64 factorials', () => {
		const expected = [
			[0, 1],
			[1, 1],
			[2, 2],
			[3, 6],
			[4, 24],
			[5, 120],
			[6, 720],
			[7, 5040],
			[10, 3628800],
			[12, 479001600],
			[18, 6402373705728000],
			[20, 2432902008176640000],
			[22, 1124000727777607680000],
		]

		for (const [n, want] of expected) {
			assert.strictEqual(factorialFloatMemo(n), want, `mismatch at n=${n}`)
		}
	})

	it('handles negative zero identically to zero', () => {
		const result = factorialFloatMemo(-0)
		assert.strictEqual(result, 1)
		assert.ok(Object.is(result, 1))
	})

	it('handles the float64 overflow boundary at n=170 and n>=171', () => {
		const f170 = factorialFloatMemo(170)
		assert.ok(Number.isFinite(f170), '170! must be finite in float64')
		assert.strictEqual(f170, Number(referenceBigIntFactorial(170)))

		assert.strictEqual(factorialFloatMemo(171), Infinity)
		assert.strictEqual(factorialFloatMemo(172), Infinity)
		assert.strictEqual(factorialFloatMemo(1000), Infinity)
		assert.strictEqual(factorialFloatMemo(Number.MAX_SAFE_INTEGER), Infinity)
		assert.strictEqual(factorialFloatMemo(1e20), Infinity)
	})

	it('matches exact BigInt-rounded float64 for every integer 0 <= n <= 170', () => {
		for (let n = 0; n <= 170; n += 1) {
			const expected = Number(referenceBigIntFactorial(n))
			const actual = factorialFloatMemo(n)
			assert.strictEqual(actual, expected, `ULP mismatch at n=${n}`)
		}
	})

	it('satisfies the recurrence n! / (n - 1)! == n within float64 precision', () => {
		for (let n = 1; n <= 22; n += 1) {
			assert.strictEqual(
				factorialFloatMemo(n) / factorialFloatMemo(n - 1),
				n,
				`exact recurrence failed at n=${n}`,
			)
		}

		for (let n = 23; n <= 170; n += 1) {
			const ratio = factorialFloatMemo(n) / factorialFloatMemo(n - 1)
			const relErr = Math.abs(ratio - n) / n
			assert.ok(
				relErr <= 2 * Number.EPSILON,
				`recurrence error too large at n=${n}: relErr=${relErr}`,
			)
		}
	})

	it('agrees with Stirling asymptotic series for ln(n!)', () => {
		for (const n of [10, 20, 50, 100, 150, 170]) {
			const logActual = Math.log(factorialFloatMemo(n))
			const logStirling = stirlingLogFactorial(n)
			const relErr = Math.abs(logActual - logStirling) / logStirling
			assert.ok(
				relErr < 1e-11,
				`Stirling cross-check failed at n=${n}: relErr=${relErr}`,
			)
		}
	})

	it('returns consistent memoized results across repeated and out-of-order calls', () => {
		const order = [100, 5, 170, 0, 42, 100, 170, 5, 22, 42, 0]
		const firstPass = order.map((n) => factorialFloatMemo(n))
		const secondPass = order.map((n) => factorialFloatMemo(n))
		assert.deepStrictEqual(firstPass, secondPass)
	})

	it('throws TypeError for non-number inputs', () => {
		const invalidTypes = [
			undefined,
			null,
			'5',
			'0',
			5n,
			true,
			false,
			{},
			[5],
			Symbol('n'),
		]

		for (const input of invalidTypes) {
			assert.throws(() => factorialFloatMemo(input), TypeError)
		}
	})

	it('throws RangeError for negative, fractional, NaN, and infinite inputs', () => {
		const invalidValues = [
			-1,
			-5,
			-170,
			-Number.MAX_SAFE_INTEGER,
			0.5,
			1.5,
			-0.5,
			Math.PI,
			170.1,
			Number.EPSILON,
			NaN,
			Infinity,
			-Infinity,
		]

		for (const input of invalidValues) {
			assert.throws(() => factorialFloatMemo(input), RangeError)
		}
	})
})
