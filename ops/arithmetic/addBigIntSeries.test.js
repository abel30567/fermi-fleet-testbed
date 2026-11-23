import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { addBigIntSeries } from './addBigIntSeries.js'

describe('addBigIntSeries', () => {
	test('adds positive BigInts', () => {
		assert.equal(addBigIntSeries(2n, 3n), 5n)
		assert.equal(addBigIntSeries(123456789n, 987654321n), 1111111110n)
	})

	test('adds negative BigInts', () => {
		assert.equal(addBigIntSeries(-2n, -3n), -5n)
		assert.equal(addBigIntSeries(-1000000000000000000n, -2500000000000000000n), -3500000000000000000n)
	})

	test('adds mixed-sign BigInts in all magnitude orderings', () => {
		assert.equal(addBigIntSeries(10n, -3n), 7n)
		assert.equal(addBigIntSeries(3n, -10n), -7n)
		assert.equal(addBigIntSeries(-10n, 3n), -7n)
		assert.equal(addBigIntSeries(-3n, 10n), 7n)
	})

	test('handles zero and additive inverses', () => {
		assert.equal(addBigIntSeries(0n, 0n), 0n)
		assert.equal(addBigIntSeries(0n, 42n), 42n)
		assert.equal(addBigIntSeries(42n, 0n), 42n)
		assert.equal(addBigIntSeries(0n, -42n), -42n)
		assert.equal(addBigIntSeries(-42n, 0n), -42n)
		assert.equal(addBigIntSeries(999999999999999999999n, -999999999999999999999n), 0n)
		assert.equal(addBigIntSeries(-999999999999999999999n, 999999999999999999999n), 0n)
	})

	test('handles long binary carry and borrow chains at high bit widths', () => {
		const pow128 = 1n << 128n
		const pow512 = 1n << 512n
		assert.equal(addBigIntSeries(pow128 - 1n, 1n), pow128)
		assert.equal(addBigIntSeries(pow128, -1n), pow128 - 1n)
		assert.equal(addBigIntSeries(-(pow128 - 1n), -1n), -pow128)
		assert.equal(addBigIntSeries(-pow128, 1n), -(pow128 - 1n))
		assert.equal(addBigIntSeries(pow512 - 1n, pow512 - 1n), (pow512 << 1n) - 2n)
		assert.equal(addBigIntSeries(pow512, -(pow512 - 1n)), 1n)
		assert.equal(addBigIntSeries(pow512 - 1n, -pow512), -1n)
	})

	test('handles 10^18 fixed-point scaled exact BigInt values', () => {
		const SCALE = 10n ** 18n
		const oneHalf = 5n * 10n ** 17n
		const oneThirdApprox = SCALE / 3n
		const twoThirdsApprox = (2n * SCALE) / 3n
		assert.equal(addBigIntSeries(oneHalf, oneHalf), SCALE)
		assert.equal(addBigIntSeries(oneThirdApprox, twoThirdsApprox), SCALE - 1n)
		assert.equal(addBigIntSeries(3n * SCALE + oneHalf, -(1n * SCALE + oneHalf)), 2n * SCALE)
	})

	test('rejects non-BigInt inputs with TypeError', () => {
		const invalidValues = [0, 1, -1, 1.5, NaN, Infinity, '1', null, undefined, true, {}, []]
		for (const bad of invalidValues) {
			assert.throws(() => addBigIntSeries(bad, 1n), TypeError)
			assert.throws(() => addBigIntSeries(1n, bad), TypeError)
		}
		assert.throws(() => addBigIntSeries(), TypeError)
		assert.throws(() => addBigIntSeries(1n), TypeError)
	})

	test('independent cross-check: algebraic laws and native BigInt addition over deterministic corpus', () => {
		let state = 0x9e3779b97f4a7c15n
		const mask = (1n << 256n) - 1n
		const nextSigned256 = () => {
			state = (state * 6364136223846793005n + 1442695040888963407n) & mask
			return state >= 1n << 255n ? state - (1n << 256n) : state
		}

		for (let i = 0; i < 200; i++) {
			const a = nextSigned256()
			const b = nextSigned256()
			const c = nextSigned256()

			// Cross-check against native operator
			const sumAB = addBigIntSeries(a, b)
			assert.equal(sumAB, a + b)

			// Commutativity
			assert.equal(sumAB, addBigIntSeries(b, a))

			// Associativity
			assert.equal(addBigIntSeries(sumAB, c), addBigIntSeries(a, addBigIntSeries(b, c)))

			// Additive inverse
			assert.equal(addBigIntSeries(a, -a), 0n)
		}
	})

	test('independent cross-check: Gauss arithmetic series closed form sum_{k=1}^n k = n(n+1)/2', () => {
		const n = 250n
		let acc = 0n
		for (let k = 1n; k <= n; k++) {
			acc = addBigIntSeries(acc, k)
		}
		const closedForm = (n * (n + 1n)) / 2n
		assert.equal(acc, closedForm)

		// Telescoping signed series: sum_{k=1}^n (k - k) === 0n
		let signedAcc = 0n
		for (let k = 1n; k <= n; k++) {
			const term = k * 10n ** 18n
			signedAcc = addBigIntSeries(signedAcc, term)
			signedAcc = addBigIntSeries(signedAcc, -term)
		}
		assert.equal(signedAcc, 0n)
	})
})
