import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { factorialFloatLazy } from './factorialFloatLazy.js'

/**
 * Independent BigInt iterative factorial for cross-checking float64 results.
 * @param {number} n
 * @returns {bigint}
 */
function bigIntFactorial(n) {
	let result = 1n
	for (let i = 2n; i <= BigInt(n); i += 1n) {
		result *= i
	}
	return result
}

describe('factorialFloatLazy', () => {
	test('computes factorials for single non-negative integers', () => {
		assert.equal(factorialFloatLazy(0), 1)
		assert.equal(factorialFloatLazy(-0), 1)
		assert.equal(factorialFloatLazy(1), 1)
		assert.equal(factorialFloatLazy(2), 2)
		assert.equal(factorialFloatLazy(5), 120)
		assert.equal(factorialFloatLazy(10), 3628800)
		assert.equal(factorialFloatLazy(20), 2432902008176640000)
	})

	test('handles float64 overflow boundary cleanly (170 finite, >170 Infinity)', () => {
		const f170 = factorialFloatLazy(170)
		assert.equal(Number.isFinite(f170), true)
		assert.equal(f170 > 7.25e306 && f170 < 7.26e306, true)

		assert.equal(factorialFloatLazy(171), Infinity)
		assert.equal(factorialFloatLazy(200), Infinity)
		assert.equal(factorialFloatLazy(100000), Infinity)
		assert.equal(factorialFloatLazy(Number.MAX_SAFE_INTEGER), Infinity)
	})

	test('lazily consumes iterables without materializing infinite sequences', () => {
		let produced = 0
		let cleanedUp = false

		function* naturals() {
			try {
				let n = 0
				while (true) {
					produced += 1
					yield n
					n += 1
				}
			} finally {
				cleanedUp = true
			}
		}

		const stream = factorialFloatLazy(naturals())
		assert.equal(produced, 0, 'must not pull from source before .next() is called')

		const firstFive = []
		for (const value of stream) {
			firstFive.push(value)
			if (firstFive.length === 5) {
				break
			}
		}

		assert.deepEqual(firstFive, [1, 1, 2, 6, 24])
		assert.equal(produced, 5, 'must pull only as many items as consumed')
		assert.equal(cleanedUp, true, 'must close source iterator on early termination')
	})

	test('handles finite iterables including arrays, sets, and empty iterables', () => {
		assert.deepEqual([...factorialFloatLazy([])], [])
		assert.deepEqual([...factorialFloatLazy(new Set())], [])
		assert.deepEqual([...factorialFloatLazy([0, 3, 6, 171])], [1, 6, 720, Infinity])
		assert.deepEqual([...factorialFloatLazy(new Set([4, 1, 0]))], [24, 1, 1])
	})

	test('throws TypeError eagerly for invalid top-level input types', () => {
		for (const bad of [null, undefined, '5', '123', true, false, {}, 5n, Symbol('x')]) {
			assert.throws(() => factorialFloatLazy(bad), TypeError)
		}
	})

	test('throws RangeError for negative, non-integer, NaN, and non-finite numbers', () => {
		for (const bad of [-1, -100, 0.5, 3.14, -2.5, Number.NaN, Infinity, -Infinity]) {
			assert.throws(() => factorialFloatLazy(bad), RangeError)
		}
	})

	test('validates iterable elements lazily and throws appropriate errors when reached', () => {
		const stream = factorialFloatLazy([0, 3, -1, 5])
		assert.deepEqual(stream.next(), { value: 1, done: false })
		assert.deepEqual(stream.next(), { value: 6, done: false })
		assert.throws(() => stream.next(), RangeError)

		const badTypeStream = factorialFloatLazy([2, '3'])
		assert.deepEqual(badTypeStream.next(), { value: 2, done: false })
		assert.throws(() => badTypeStream.next(), TypeError)
	})

	test('cross-checks against independent BigInt factorial across 0..171', () => {
		const inputs = Array.from({ length: 172 }, (_, i) => i)
		const actuals = [...factorialFloatLazy(inputs)]

		for (let n = 0; n <= 171; n += 1) {
			const expected = Number(bigIntFactorial(n))
			const actual = actuals[n]

			if (n <= 22) {
				// Exact representation in IEEE-754 float64 for n <= 22
				assert.equal(actual, expected, `exact mismatch at n=${n}`)
			} else if (n <= 170) {
				const relErr = Math.abs(actual - expected) / expected
				assert.equal(
					relErr < 1e-13,
					true,
					`relative error too large at n=${n}: actual=${actual}, expected=${expected}, relErr=${relErr}`
				)
			} else {
				assert.equal(actual, Infinity)
				assert.equal(expected, Infinity)
			}
		}
	})

	test('cross-checks large finite factorials against Stirling approximation', () => {
		// Stirling's formula: ln(n!) ≈ n*ln(n) - n + 0.5*ln(2*pi*n) + 1/(12*n)
		for (const n of [50, 100, 150, 170]) {
			const logActual = Math.log(factorialFloatLazy(n))
			const logStirling =
				n * Math.log(n) - n + 0.5 * Math.log(2 * Math.PI * n) + 1 / (12 * n)
			const relErr = Math.abs(logActual - logStirling) / logActual
			assert.equal(
				relErr < 1e-9,
				true,
				`Stirling cross-check failed at n=${n}: relErr=${relErr}`
			)
		}
	})
})
