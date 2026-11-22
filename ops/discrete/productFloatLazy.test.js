import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { productFloatLazy } from './productFloatLazy.js'

describe('productFloatLazy', () => {
	test('yields running partial products for finite arrays and returns final product', () => {
		const gen = productFloatLazy([2, 3, 4, 0.5])
		assert.deepEqual(gen.next(), { value: 2, done: false })
		assert.deepEqual(gen.next(), { value: 6, done: false })
		assert.deepEqual(gen.next(), { value: 24, done: false })
		assert.deepEqual(gen.next(), { value: 12, done: false })
		assert.deepEqual(gen.next(), { value: 12, done: true })
	})

	test('supports custom initial factor and non-array iterables', () => {
		const factors = new Set([2, 5, 1.5])
		const partials = Array.from(productFloatLazy(factors, 10))
		assert.deepEqual(partials, [20, 100, 150])
	})

	test('consumes upstream generator strictly lazily and runs upstream cleanup on early exit', () => {
		let produced = 0
		let cleanedUp = false

		function* trackedSequence() {
			try {
				let n = 1
				while (true) {
					produced += 1
					yield n
					n += 1
				}
			} finally {
				cleanedUp = true
			}
		}

		const gen = productFloatLazy(trackedSequence())
		assert.equal(produced, 0, 'must not pull from upstream before first next()')

		const firstFive = []
		for (const p of gen) {
			firstFive.push(p)
			assert.equal(produced, firstFive.length, 'must pull exactly one element per yield')
			if (firstFive.length === 5) {
				break
			}
		}

		assert.deepEqual(firstFive, [1, 2, 6, 24, 120])
		assert.equal(produced, 5)
		assert.equal(cleanedUp, true, 'breaking out of consumer loop should close upstream iterator')
	})

	test('handles partial consumption of infinite constant and geometric sequences', () => {
		function* infiniteTwos() {
			while (true) {
				yield 2
			}
		}

		const gen = productFloatLazy(infiniteTwos())
		const powers = []
		for (let i = 0; i < 8; i += 1) {
			powers.push(gen.next().value)
		}
		assert.deepEqual(powers, [2, 4, 8, 16, 32, 64, 128, 256])
		gen.return()
	})

	test('edge case: empty iterable yields nothing and returns multiplicative identity', () => {
		const defaultGen = productFloatLazy([])
		assert.deepEqual(defaultGen.next(), { value: 1, done: true })
		assert.deepEqual(Array.from(productFloatLazy([])), [])

		const customGen = productFloatLazy([], 7.5)
		assert.deepEqual(customGen.next(), { value: 7.5, done: true })
	})

	test('edge case: zero factor and IEEE-754 signed zero behavior', () => {
		assert.deepEqual(Array.from(productFloatLazy([5, 0, 10, 3])), [5, 0, 0, 0])

		const signedZeroPartials = Array.from(productFloatLazy([-2, 0]))
		assert.equal(signedZeroPartials[0], -2)
		assert.equal(Object.is(signedZeroPartials[1], -0), true)
	})

	test('edge case: negative values and alternating signs', () => {
		assert.deepEqual(Array.from(productFloatLazy([-2, -3, -4, 0.5])), [-2, 6, -24, -12])
	})

	test('edge case: IEEE-754 float64 overflow and underflow', () => {
		assert.deepEqual(Array.from(productFloatLazy([1e200, 1e200])), [1e200, Infinity])
		assert.deepEqual(Array.from(productFloatLazy([1e-200, 1e-200])), [1e-200, 0])
	})

	test('validates iterable and initial eagerly', () => {
		for (const badIterable of [null, undefined, 42, true, {}, '123']) {
			assert.throws(() => productFloatLazy(badIterable), TypeError)
		}

		for (const badInitialType of ['1', null, {}, 1n]) {
			assert.throws(() => productFloatLazy([1, 2], badInitialType), TypeError)
		}

		for (const nonFiniteInitial of [NaN, Infinity, -Infinity]) {
			assert.throws(() => productFloatLazy([1, 2], nonFiniteInitial), RangeError)
		}
	})

	test('validates elements lazily as they are consumed', () => {
		const badTypeGen = productFloatLazy([3, '4', 5])
		assert.deepEqual(badTypeGen.next(), { value: 3, done: false })
		assert.throws(() => badTypeGen.next(), TypeError)

		const badBigIntGen = productFloatLazy([2, 3n])
		assert.deepEqual(badBigIntGen.next(), { value: 2, done: false })
		assert.throws(() => badBigIntGen.next(), TypeError)

		for (const nonFinite of [NaN, Infinity, -Infinity]) {
			const gen = productFloatLazy([2, nonFinite, 4])
			assert.deepEqual(gen.next(), { value: 2, done: false })
			assert.throws(() => gen.next(), RangeError)
		}
	})

	test('cross-check: matches exp(sum(ln(x_i))) for positive float64 sequences', () => {
		const values = [1.25, 0.8, 3.5, 2.2, 0.625, 4.1, 0.37, 1.9]
		const partials = Array.from(productFloatLazy(values))

		let runningLogSum = 0
		for (let i = 0; i < values.length; i += 1) {
			runningLogSum += Math.log(values[i])
			const expected = Math.exp(runningLogSum)
			const relError = Math.abs(partials[i] - expected) / Math.abs(expected)
			assert.ok(
				relError < 1e-12,
				`index ${i}: got ${partials[i]}, expected ~${expected} (relError=${relError})`,
			)
		}
	})

	test('cross-check: matches factorial and power identities on infinite generators', () => {
		function* naturals() {
			let n = 1
			while (true) {
				yield n
				n += 1
			}
		}

		const factGen = productFloatLazy(naturals())
		let independentFact = 1
		for (let n = 1; n <= 15; n += 1) {
			independentFact *= n
			assert.equal(factGen.next().value, independentFact)
		}
		factGen.return()

		const base = 1.5
		function* constantBase() {
			while (true) {
				yield base
			}
		}

		const powGen = productFloatLazy(constantBase())
		for (let k = 1; k <= 12; k += 1) {
			assert.equal(powGen.next().value, base ** k)
		}
		powGen.return()
	})
})
