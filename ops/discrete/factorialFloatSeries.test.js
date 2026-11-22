import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { factorialFloatSeries } from './factorialFloatSeries.js'

/**
 * Independent exact BigInt factorial for cross-checking IEEE-754 float64 rounding.
 */
function exactBigIntFactorial(n) {
	let acc = 1n
	for (let i = 2n; i <= BigInt(n); i++) {
		acc *= i
	}
	return acc
}

describe('factorialFloatSeries', () => {
	it('computes exact values for 0, -0, and small non-negative integers up to 22', () => {
		assert.equal(factorialFloatSeries(0), 1)
		assert.equal(Object.is(factorialFloatSeries(-0), 1), true)
		assert.equal(factorialFloatSeries(1), 1)
		assert.equal(factorialFloatSeries(2), 2)
		assert.equal(factorialFloatSeries(3), 6)
		assert.equal(factorialFloatSeries(4), 24)
		assert.equal(factorialFloatSeries(5), 120)
		assert.equal(factorialFloatSeries(10), 3628800)
		assert.equal(factorialFloatSeries(12), 479001600)
		assert.equal(factorialFloatSeries(20), 2432902008176640000)
		assert.equal(factorialFloatSeries(21), 51090942171709440000)
		assert.equal(factorialFloatSeries(22), 1124000727777607680000)
	})

	it('handles the transition across n = 22..23 and large finite integers up to 170', () => {
		assert.equal(factorialFloatSeries(23), Number(exactBigIntFactorial(23)))
		assert.equal(factorialFloatSeries(50), Number(exactBigIntFactorial(50)))
		assert.equal(factorialFloatSeries(100), Number(exactBigIntFactorial(100)))
		assert.equal(factorialFloatSeries(170), Number(exactBigIntFactorial(170)))
		assert.equal(Number.isFinite(factorialFloatSeries(170)), true)
	})

	it('returns Infinity for integer inputs exceeding the float64 overflow boundary (n > 170)', () => {
		assert.equal(factorialFloatSeries(171), Infinity)
		assert.equal(factorialFloatSeries(172), Infinity)
		assert.equal(factorialFloatSeries(1000), Infinity)
		assert.equal(factorialFloatSeries(Number.MAX_SAFE_INTEGER), Infinity)
		assert.equal(factorialFloatSeries(1e300), Infinity)
	})

	it('throws TypeError for non-number inputs', () => {
		const invalidTypes = [
			undefined,
			null,
			'5',
			'0',
			true,
			false,
			5n,
			0n,
			{},
			[5],
			Symbol('5'),
			() => 5,
		]
		for (const input of invalidTypes) {
			assert.throws(
				() => factorialFloatSeries(input),
				{ name: 'TypeError' },
				`Expected TypeError for input ${String(input)}`,
			)
		}
	})

	it('throws RangeError for NaN, infinities, negative numbers, and non-integers', () => {
		const invalidValues = [
			NaN,
			Infinity,
			-Infinity,
			-1,
			-5,
			-171,
			-Number.MAX_SAFE_INTEGER,
			0.5,
			1.5,
			-0.5,
			Math.PI,
			Number.EPSILON,
			170.1,
		]
		for (const input of invalidValues) {
			assert.throws(
				() => factorialFloatSeries(input),
				{ name: 'RangeError' },
				`Expected RangeError for input ${input}`,
			)
		}
	})

	it('matches exact BigInt factorials converted to IEEE-754 float64 for every n in 0..170', () => {
		let exact = 1n
		for (let n = 0; n <= 170; n++) {
			if (n >= 2) exact *= BigInt(n)
			const expected = Number(exact)
			const actual = factorialFloatSeries(n)
			assert.equal(
				actual,
				expected,
				`Mismatch at n=${n}: got ${actual}, expected ${expected}`,
			)
		}
	})

	it('satisfies the recurrence identity n! / (n - 1)! = n and strict monotonicity for 2..170', () => {
		for (let n = 1; n <= 170; n++) {
			const curr = factorialFloatSeries(n)
			const prev = factorialFloatSeries(n - 1)
			const ratio = curr / prev
			const relErr = Math.abs(ratio - n) / n
			assert.ok(
				relErr <= 2 * Number.EPSILON,
				`Recurrence failed at n=${n}: ratio=${ratio}, relErr=${relErr}`,
			)
			if (n >= 2) {
				assert.ok(curr > prev, `Expected ${n}! > ${n - 1}!`)
			}
		}
	})

	it('cross-checks against independent Stirling log-series using Math.log for n = 10..170', () => {
		const halfLn2Pi = 0.5 * Math.log(2 * Math.PI)
		for (let n = 10; n <= 170; n++) {
			const invN = 1 / n
			const invN2 = invN * invN
			// Independent 4-term Stirling log-series evaluated via JS Math.log
			const stirlingLog =
				(n + 0.5) * Math.log(n) -
				n +
				halfLn2Pi +
				invN * (1 / 12 - invN2 * (1 / 360 - invN2 * (1 / 1260 - invN2 / 1680)))
			const actualLog = Math.log(factorialFloatSeries(n))
			const relErr = Math.abs(actualLog - stirlingLog) / stirlingLog
			assert.ok(
				relErr < 1e-13,
				`Stirling cross-check failed at n=${n}: relErr=${relErr}`,
			)
		}
	})

	it('satisfies the double-factorial identity (2k)! = 2^k * k! * (2k - 1)!! for k = 1..85', () => {
		let oddDoubleFact = 1
		for (let k = 1; k <= 85; k++) {
			oddDoubleFact *= 2 * k - 1
			const lhs = factorialFloatSeries(2 * k)
			const rhs = (2 ** k) * factorialFloatSeries(k) * oddDoubleFact
			const relErr = Math.abs(lhs - rhs) / lhs
			assert.ok(
				relErr < 1e-13,
				`Double-factorial identity failed at k=${k}: relErr=${relErr}`,
			)
		}
	})
})
