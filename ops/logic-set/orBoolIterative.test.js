import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { orBoolIterative } from './orBoolIterative.js'

describe('orBoolIterative', () => {
	test('full 2-input truth table', () => {
		assert.strictEqual(orBoolIterative(false, false), false)
		assert.strictEqual(orBoolIterative(false, true), true)
		assert.strictEqual(orBoolIterative(true, false), true)
		assert.strictEqual(orBoolIterative(true, true), true)
	})

	test('n-ary inputs', () => {
		assert.strictEqual(orBoolIterative(false, false, false), false)
		assert.strictEqual(orBoolIterative(false, true, false), true)
		assert.strictEqual(orBoolIterative(true, true, true), true)
		assert.strictEqual(orBoolIterative(false, false, false, false, true), true)
		assert.strictEqual(orBoolIterative(false, false, false, false, false), false)
	})

	test('edge cases: single boolean, all false, first/middle/last true, and large input', () => {
		assert.strictEqual(orBoolIterative(false), false)
		assert.strictEqual(orBoolIterative(true), true)

		assert.strictEqual(orBoolIterative(false, false, false, false), false)
		assert.strictEqual(orBoolIterative(true, false, false, false), true)
		assert.strictEqual(orBoolIterative(false, false, true, false, false), true)
		assert.strictEqual(orBoolIterative(false, false, false, true), true)

		const allFalse = new Array(1000).fill(false)
		assert.strictEqual(orBoolIterative(...allFalse), false)

		const lastTrue = new Array(1000).fill(false)
		lastTrue[999] = true
		assert.strictEqual(orBoolIterative(...lastTrue), true)
	})

	test('rejects empty call', () => {
		assert.throws(() => orBoolIterative(), {
			name: 'RangeError',
			message: /at least one boolean argument/,
		})
	})

	test('rejects non-boolean arguments', () => {
		const invalidValues = [
			0,
			1,
			NaN,
			null,
			undefined,
			'',
			'true',
			'false',
			{},
			[],
			new Set([true]),
			// eslint-disable-next-line no-new-wrappers
			new Boolean(true),
			// eslint-disable-next-line no-new-wrappers
			new Boolean(false),
			Symbol('bool'),
			1n,
		]

		for (const bad of invalidValues) {
			assert.throws(() => orBoolIterative(bad), TypeError)
			assert.throws(() => orBoolIterative(false, bad), TypeError)
			assert.throws(() => orBoolIterative(true, bad), TypeError)
			assert.throws(() => orBoolIterative(bad, true), TypeError)
		}
	})

	test('cross-check: exhaustive 3-variable truth table vs De Morgan law and Array.prototype.some', () => {
		const domain = [false, true]
		for (const a of domain) {
			for (const b of domain) {
				for (const c of domain) {
					const actual = orBoolIterative(a, b, c)
					const viaDeMorgan = !(!a && !b && !c)
					const viaSome = [a, b, c].some((v) => v)
					assert.strictEqual(actual, viaDeMorgan)
					assert.strictEqual(actual, viaSome)
				}
			}
		}
	})

	test('cross-check: exhaustive 4-variable truth table and boolean algebra identities', () => {
		const domain = [false, true]
		for (const a of domain) {
			for (const b of domain) {
				// Commutativity and idempotence
				assert.strictEqual(orBoolIterative(a, b), orBoolIterative(b, a))
				assert.strictEqual(orBoolIterative(a, a), a)
				// Identity (false) and absorbing element (true)
				assert.strictEqual(orBoolIterative(a, false), a)
				assert.strictEqual(orBoolIterative(a, true), true)

				for (const c of domain) {
					// Associativity
					assert.strictEqual(
						orBoolIterative(orBoolIterative(a, b), c),
						orBoolIterative(a, orBoolIterative(b, c)),
					)

					for (const d of domain) {
						const tuple = [a, b, c, d]
						const expectedDeMorgan = !tuple.every((v) => !v)
						const expectedSome = tuple.some((v) => v)
						assert.strictEqual(orBoolIterative(...tuple), expectedDeMorgan)
						assert.strictEqual(orBoolIterative(...tuple), expectedSome)
					}
				}
			}
		}
	})
})
