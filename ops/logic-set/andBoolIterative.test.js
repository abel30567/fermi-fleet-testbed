import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { andBoolIterative } from './andBoolIterative.js'

describe('andBoolIterative', () => {
	test('2-input truth table', () => {
		assert.equal(andBoolIterative(true, true), true)
		assert.equal(andBoolIterative(true, false), false)
		assert.equal(andBoolIterative(false, true), false)
		assert.equal(andBoolIterative(false, false), false)
	})

	test('n-ary inputs: all true and false in first, middle, last positions', () => {
		assert.equal(andBoolIterative(true, true, true, true, true), true)
		assert.equal(andBoolIterative(false, true, true, true, true), false)
		assert.equal(andBoolIterative(true, true, false, true, true), false)
		assert.equal(andBoolIterative(true, true, true, true, false), false)
		assert.equal(andBoolIterative(false, false, false, false), false)

		const manyTrue = Array(1000).fill(true)
		assert.equal(andBoolIterative(...manyTrue), true)

		const manyWithOneFalse = Array(1000).fill(true)
		manyWithOneFalse[500] = false
		assert.equal(andBoolIterative(...manyWithOneFalse), false)
	})

	test('single boolean edge cases', () => {
		assert.equal(andBoolIterative(true), true)
		assert.equal(andBoolIterative(false), false)
	})

	test('empty call throws RangeError', () => {
		assert.throws(
			() => andBoolIterative(),
			{ name: 'RangeError' },
		)
	})

	test('rejects non-boolean arguments strictly', () => {
		const invalidValues = [
			0,
			1,
			-1,
			NaN,
			null,
			undefined,
			'',
			'true',
			'false',
			{},
			[],
			new Set([true]),
			new Boolean(true),
			new Boolean(false),
			1n,
			Symbol('bool'),
			() => true,
		]

		for (const invalid of invalidValues) {
			assert.throws(
				() => andBoolIterative(invalid),
				{ name: 'TypeError' },
				`Expected TypeError for single invalid value: ${String(invalid)}`,
			)
			assert.throws(
				() => andBoolIterative(true, invalid),
				{ name: 'TypeError' },
				`Expected TypeError when invalid value follows true: ${String(invalid)}`,
			)
			assert.throws(
				() => andBoolIterative(false, invalid),
				{ name: 'TypeError' },
				`Expected TypeError even after false operand: ${String(invalid)}`,
			)
		}
	})

	test('cross-check: exhaustive 3-variable truth table vs De Morgan law and Array.prototype.every', () => {
		const bits = [false, true]
		for (const a of bits) {
			for (const b of bits) {
				for (const c of bits) {
					const actual = andBoolIterative(a, b, c)
					const deMorgan = !(!a || !b || !c)
					const viaEvery = [a, b, c].every(Boolean)
					assert.equal(actual, deMorgan, `Mismatch vs De Morgan for (${a}, ${b}, ${c})`)
					assert.equal(actual, viaEvery, `Mismatch vs every() for (${a}, ${b}, ${c})`)
				}
			}
		}
	})

	test('cross-check: exhaustive 4-variable truth table vs bitmask conjunction', () => {
		for (let mask = 0; mask < 16; mask += 1) {
			const args = [
				Boolean(mask & 1),
				Boolean(mask & 2),
				Boolean(mask & 4),
				Boolean(mask & 8),
			]
			const expected = mask === 0b1111
			assert.equal(andBoolIterative(...args), expected, `Mismatch for mask ${mask}`)
		}
	})
})
