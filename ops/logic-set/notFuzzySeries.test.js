import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { notFuzzySeries } from './notFuzzySeries.js'

/**
 * Independent computation #1: convergent geometric-series identity.
 * For mu in [0, 1], let u = mu / 2 in [0, 0.5].
 * Then S(u) = sum_{k=0}^{inf} u^k = 1 / (1 - u), so 2 / S(u) - 1 = 1 - mu.
 */
function notViaGeometricSeries(mu, terms = 64) {
	const u = mu / 2
	let sum = 0
	let term = 1
	for (let k = 0; k < terms; k++) {
		sum += term
		term *= u
	}
	return 2 / sum - 1
}

/**
 * Independent computation #2: trigonometric Pythagorean identity.
 * For mu in [0, 1], cos^2(asin(sqrt(mu))) = 1 - sin^2(asin(sqrt(mu))) = 1 - mu.
 */
function notViaTrigIdentity(mu) {
	const c = Math.cos(Math.asin(Math.sqrt(mu)))
	return c * c
}

describe('notFuzzySeries', () => {
	describe('normal cases', () => {
		it('negates scalar fuzzy membership values in [0, 1]', () => {
			assert.equal(notFuzzySeries(0), 1)
			assert.equal(notFuzzySeries(1), 0)
			assert.equal(notFuzzySeries(0.5), 0.5)
			assert.equal(notFuzzySeries(0.25), 0.75)
			assert.equal(notFuzzySeries(0.75), 0.25)
			assert.ok(Math.abs(notFuzzySeries(0.3) - 0.7) < 1e-15)
		})

		it('negates fuzzy sets represented as Arrays without mutating input', () => {
			const input = [0, 0.25, 0.5, 0.75, 1]
			const snapshot = [...input]
			const result = notFuzzySeries(input)

			assert.deepEqual(result, [1, 0.75, 0.5, 0.25, 0])
			assert.deepEqual(input, snapshot)
			assert.notEqual(result, input)
		})

		it('negates fuzzy sets represented as plain Objects without mutating input', () => {
			const input = { cold: 0.25, warm: 0.5, hot: 1 }
			const result = notFuzzySeries(input)

			assert.deepEqual(result, { cold: 0.75, warm: 0.5, hot: 0 })
			assert.deepEqual(input, { cold: 0.25, warm: 0.5, hot: 1 })
			assert.notEqual(result, input)
		})

		it('negates fuzzy sets represented as Maps without mutating input', () => {
			const keyObj = { id: 1 }
			const input = new Map([
				['a', 0],
				['b', 0.25],
				[keyObj, 1],
			])
			const result = notFuzzySeries(input)

			assert.ok(result instanceof Map)
			assert.notEqual(result, input)
			assert.equal(result.get('a'), 1)
			assert.equal(result.get('b'), 0.75)
			assert.equal(result.get(keyObj), 0)
			assert.equal(input.get('a'), 0)
		})
	})

	describe('edge cases', () => {
		it('handles -0 and avoids returning -0', () => {
			assert.equal(Object.is(notFuzzySeries(-0), 1), true)
			assert.equal(Object.is(notFuzzySeries(1), 0), true)
		})

		it('handles very small positive numbers and values near 1', () => {
			assert.equal(notFuzzySeries(Number.MIN_VALUE), 1)
			const nearOne = 1 - Number.EPSILON / 2
			assert.equal(notFuzzySeries(nearOne), Number.EPSILON / 2)
		})

		it('handles empty containers', () => {
			assert.deepEqual(notFuzzySeries([]), [])
			assert.deepEqual(notFuzzySeries({}), {})
			const emptyMap = notFuzzySeries(new Map())
			assert.ok(emptyMap instanceof Map)
			assert.equal(emptyMap.size, 0)
		})

		it('handles null-prototype objects and __proto__ own key safely', () => {
			const nullProto = Object.create(null)
			nullProto.x = 0.25
			Object.defineProperty(nullProto, '__proto__', {
				value: 0.75,
				writable: true,
				enumerable: true,
				configurable: true,
			})

			const result = notFuzzySeries(nullProto)
			assert.equal(Object.getPrototypeOf(result), null)
			assert.equal(result.x, 0.75)
			assert.equal(result['__proto__'], 0.25)
		})
	})

	describe('Zadeh algebraic properties and independent cross-checks', () => {
		const samples = [0, 0.01, 0.1, 0.2, 0.25, 1 / 3, 0.5, 2 / 3, 0.75, 0.87, 0.99, 1]

		it('matches independent geometric-series identity across [0, 1]', () => {
			for (const mu of samples) {
				const actual = notFuzzySeries(mu)
				const expected = notViaGeometricSeries(mu)
				assert.ok(
					Math.abs(actual - expected) <= 1e-15,
					`Mismatch at mu=${mu}: actual=${actual}, expected=${expected}`
				)
			}
		})

		it('matches independent trigonometric Pythagorean identity across [0, 1]', () => {
			for (const mu of samples) {
				const actual = notFuzzySeries(mu)
				const expected = notViaTrigIdentity(mu)
				assert.ok(
					Math.abs(actual - expected) <= 1e-14,
					`Trig mismatch at mu=${mu}: actual=${actual}, expected=${expected}`
				)
			}
		})

		it('satisfies involution N(N(mu)) = mu and antitonicity', () => {
			for (const mu of samples) {
				const doubleNeg = notFuzzySeries(notFuzzySeries(mu))
				assert.ok(
					Math.abs(doubleNeg - mu) <= 1e-15,
					`Involution failed at mu=${mu}: got ${doubleNeg}`
				)
			}

			for (let i = 0; i < samples.length - 1; i++) {
				assert.ok(notFuzzySeries(samples[i]) >= notFuzzySeries(samples[i + 1]))
			}
		})

		it('satisfies Zadeh De Morgan laws with min/max operators', () => {
			for (const a of samples) {
				for (const b of samples) {
					const notAnd = notFuzzySeries(Math.min(a, b))
					const orNot = Math.max(notFuzzySeries(a), notFuzzySeries(b))
					assert.ok(Math.abs(notAnd - orNot) <= 1e-15)

					const notOr = notFuzzySeries(Math.max(a, b))
					const andNot = Math.min(notFuzzySeries(a), notFuzzySeries(b))
					assert.ok(Math.abs(notOr - andNot) <= 1e-15)
				}
			}
		})
	})

	describe('invalid inputs', () => {
		it('throws RangeError for numbers outside [0, 1] or non-finite numbers', () => {
			for (const bad of [-0.0001, -1, 1.0001, 2, NaN, Infinity, -Infinity]) {
				assert.throws(() => notFuzzySeries(bad), RangeError)
			}
		})

		it('throws TypeError for unsupported input types', () => {
			for (const bad of [
				undefined,
				null,
				true,
				false,
				'0.5',
				1n,
				Symbol('mu'),
				() => 0.5,
				new Date(),
				new Set([0.5]),
				/0.5/,
			]) {
				assert.throws(() => notFuzzySeries(bad), TypeError)
			}
		})

		it('rejects sparse arrays and invalid elements inside containers', () => {
			// eslint-disable-next-line no-sparse-arrays
			const sparse = [0.5, , 0.25]
			assert.throws(() => notFuzzySeries(sparse), TypeError)
			assert.throws(() => notFuzzySeries([0.5, '0.2']), TypeError)
			assert.throws(() => notFuzzySeries([0.5, 1.2]), RangeError)
			assert.throws(() => notFuzzySeries([0.5, NaN]), RangeError)

			assert.throws(() => notFuzzySeries({ a: 0.5, b: null }), TypeError)
			assert.throws(() => notFuzzySeries({ a: 0.5, b: -0.1 }), RangeError)

			assert.throws(() => notFuzzySeries(new Map([['a', '0.5']])), TypeError)
			assert.throws(() => notFuzzySeries(new Map([['a', Infinity]])), RangeError)
		})
	})
})
