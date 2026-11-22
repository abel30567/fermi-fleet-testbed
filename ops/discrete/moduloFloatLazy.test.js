import { describe, test } from 'node:test'
import assert from 'node:assert'
import { moduloFloatLazy } from './moduloFloatLazy.js'

/**
 * Independent reference computation via floored division: a - m * floor(a / m).
 * Normalizes -0 to 0.
 *
 * @param {number} a
 * @param {number} m
 * @returns {number}
 */
function referenceModulo(a, m) {
	const r = a - m * Math.floor(a / m)
	return r === 0 ? 0 : r
}

describe('moduloFloatLazy', () => {
	test('computes modulo lazily over iterable with scalar divisor', () => {
		const gen = moduloFloatLazy([7, 10, 14, 0, 5.5], 4)
		assert.strictEqual(typeof gen.next, 'function')
		assert.strictEqual(typeof gen[Symbol.iterator], 'function')
		assert.deepStrictEqual([...gen], [3, 2, 2, 0, 1.5])
	})

	test('computes modulo lazily over zipped iterables and stops at shorter sequence', () => {
		const dividends = [10, 7.5, -3, 100]
		const divisors = [3, 2.5, 4]
		assert.deepStrictEqual([...moduloFloatLazy(dividends, divisors)], [1, 0, 1])
	})

	test('computes modulo lazily over iterable of [dividend, divisor] pairs', () => {
		const pairs = [
			[10, 3],
			[-1, 5],
			[7.25, 2.5],
			new Float64Array([-7, 3]),
		]
		assert.deepStrictEqual([...moduloFloatLazy(pairs)], [1, 4, 2.25, 2])
	})

	test('consumes infinite generator lazily without eager evaluation and cleans up on break', () => {
		let produced = 0
		let cleanedUp = false

		function* naturals() {
			try {
				let n = 0
				while (true) {
					produced++
					yield n++
				}
			} finally {
				cleanedUp = true
			}
		}

		const stream = moduloFloatLazy(naturals(), 3)
		assert.strictEqual(produced, 0, 'generator must not pull before first .next()')

		const firstFive = []
		for (const val of stream) {
			firstFive.push(val)
			if (firstFive.length === 5) break
		}

		assert.deepStrictEqual(firstFive, [0, 1, 2, 0, 1])
		assert.strictEqual(produced, 5, 'should pull only the requested number of elements')
		assert.strictEqual(cleanedUp, true, 'should close upstream generator on early break')
	})

	test('cleans up both zipped infinite generators on early consumer break', () => {
		let divProduced = 0
		let modProduced = 0
		let divCleaned = false
		let modCleaned = false

		function* endlessDividends() {
			try {
				let i = -5
				while (true) {
					divProduced++
					yield i++
				}
			} finally {
				divCleaned = true
			}
		}

		function* endlessDivisors() {
			try {
				let m = 2
				while (true) {
					modProduced++
					yield m++
				}
			} finally {
				modCleaned = true
			}
		}

		const results = []
		for (const v of moduloFloatLazy(endlessDividends(), endlessDivisors())) {
			results.push(v)
			if (results.length === 3) break
		}

		// (-5 mod 2 = 1), (-4 mod 3 = 2), (-3 mod 4 = 1)
		assert.deepStrictEqual(results, [1, 2, 1])
		assert.strictEqual(divProduced, 3)
		assert.strictEqual(modProduced, 3)
		assert.strictEqual(divCleaned, true)
		assert.strictEqual(modCleaned, true)
	})

	test('handles negative dividends, negative divisors, and normalizes -0 to +0', () => {
		assert.deepStrictEqual([...moduloFloatLazy([-1, -5, -6, -0, 0], 5)], [4, 0, 4, 0, 0])

		for (const val of moduloFloatLazy([-5, -0, 0, -10], 5)) {
			assert.strictEqual(Object.is(val, 0), true, 'zero result must be +0, never -0')
		}

		// Negative divisors follow floored modulo ((a % m) + m) % m
		const negDivResults = [...moduloFloatLazy([7, -7, -6, 0], -3)]
		assert.deepStrictEqual(negDivResults, [-2, -1, 0, 0])
		assert.strictEqual(Object.is(negDivResults[2], 0), true)
		assert.strictEqual(Object.is(negDivResults[3], 0), true)

		// Tiny negative dividend near zero stays strictly in [0, m) rather than rounding to m
		const [tiny] = moduloFloatLazy([-1e-17], 1)
		assert.strictEqual(Object.is(tiny, 0), true)
	})

	test('handles empty iterables across all modes', () => {
		assert.deepStrictEqual([...moduloFloatLazy([], 5)], [])
		assert.deepStrictEqual([...moduloFloatLazy([], [1, 2, 3])], [])
		assert.deepStrictEqual([...moduloFloatLazy([1, 2, 3], [])], [])
		assert.deepStrictEqual([...moduloFloatLazy([])], [])
	})

	test('validates zero divisor, NaN, Infinity, and invalid types', () => {
		// Eager validation on scalar divisor
		assert.throws(() => moduloFloatLazy([1, 2], 0), RangeError)
		assert.throws(() => moduloFloatLazy([1, 2], -0), RangeError)
		assert.throws(() => moduloFloatLazy([], 0), RangeError)
		assert.throws(() => moduloFloatLazy([1, 2], Number.NaN), RangeError)
		assert.throws(() => moduloFloatLazy([1, 2], Number.POSITIVE_INFINITY), RangeError)
		assert.throws(() => moduloFloatLazy([1, 2], Number.NEGATIVE_INFINITY), RangeError)

		// Eager validation on top-level inputs
		assert.throws(() => moduloFloatLazy(null, 3), TypeError)
		assert.throws(() => moduloFloatLazy(42, 3), TypeError)
		assert.throws(() => moduloFloatLazy('123', 3), TypeError)
		assert.throws(() => moduloFloatLazy([1, 2], '3'), TypeError)
		assert.throws(() => moduloFloatLazy([1, 2], {}), TypeError)

		// Lazy per-element validation on dividends
		const badDivGen = moduloFloatLazy([4, Number.NaN, 8], 3)
		assert.strictEqual(badDivGen.next().value, 1)
		assert.throws(() => badDivGen.next(), RangeError)

		assert.throws(() => [...moduloFloatLazy([Number.POSITIVE_INFINITY], 2)], RangeError)
		assert.throws(() => [...moduloFloatLazy([Number.NEGATIVE_INFINITY], 2)], RangeError)
		assert.throws(() => [...moduloFloatLazy(['5'], 2)], TypeError)
		assert.throws(() => [...moduloFloatLazy([5n], 2)], TypeError)

		// Lazy per-element validation on zipped divisors
		assert.throws(() => [...moduloFloatLazy([1, 2], [3, 0])], RangeError)
		assert.throws(() => [...moduloFloatLazy([1, 2], [3, Number.NaN])], RangeError)
		assert.throws(() => [...moduloFloatLazy([1, 2], [3, Number.POSITIVE_INFINITY])], RangeError)
		assert.throws(() => [...moduloFloatLazy([1, 2], [3, null])], TypeError)

		// Lazy validation on pairs
		assert.throws(() => [...moduloFloatLazy([[1]])], RangeError)
		assert.throws(() => [...moduloFloatLazy([[1, 2, 3]])], RangeError)
		assert.throws(() => [...moduloFloatLazy([123])], TypeError)
		assert.throws(() => [...moduloFloatLazy([[1, 0]])], RangeError)
		assert.throws(() => [...moduloFloatLazy([[Number.NaN, 2]])], RangeError)
	})

	test('cross-checks against independent floored-division computation a - m * Math.floor(a / m)', () => {
		const samples = [
			[0, 1],
			[17, 5],
			[-17, 5],
			[17, -5],
			[-17, -5],
			[12.75, 2.5],
			[-12.75, 2.5],
			[12.75, -2.5],
			[-12.75, -2.5],
			[100.125, 7.25],
			[-100.125, 7.25],
			[0.3, 0.1],
			[-0.3, 0.1],
			[1e9 + 0.5, 3.5],
			[-(1e9 + 0.5), 3.5],
			[Math.PI, 1],
			[-Math.PI, 1],
			[Math.E * 100, Math.SQRT2],
			[-Math.E * 100, Math.SQRT2],
		]

		const actual = [...moduloFloatLazy(samples)]
		for (let i = 0; i < samples.length; i++) {
			const [a, m] = samples[i]
			const expected = referenceModulo(a, m)
			const tol = 1e-11 * Math.max(1, Math.abs(a), Math.abs(m))
			assert.ok(
				Math.abs(actual[i] - expected) <= tol,
				`Mismatch for (${a}, ${m}): got ${actual[i]}, expected ${expected}`
			)
			if (m > 0) {
				assert.ok(actual[i] >= 0 && actual[i] < m, `Result ${actual[i]} out of [0, ${m})`)
			} else {
				assert.ok(actual[i] <= 0 && actual[i] > m, `Result ${actual[i]} out of (${m}, 0]`)
			}
		}
	})
})
