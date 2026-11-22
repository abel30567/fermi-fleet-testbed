import { describe, test } from 'node:test'
import assert from 'node:assert'
import { xorBoolIterative } from './xorBoolIterative.js'

describe('xorBoolIterative', () => {
	test('2-input truth table', () => {
		assert.strictEqual(xorBoolIterative(false, false), false)
		assert.strictEqual(xorBoolIterative(false, true), true)
		assert.strictEqual(xorBoolIterative(true, false), true)
		assert.strictEqual(xorBoolIterative(true, true), false)
	})

	test('n-ary odd and even parity', () => {
		assert.strictEqual(xorBoolIterative(true, false, false), true)
		assert.strictEqual(xorBoolIterative(true, true, false), false)
		assert.strictEqual(xorBoolIterative(true, true, true), true)
		assert.strictEqual(xorBoolIterative(false, true, false, true, false), false)
		assert.strictEqual(xorBoolIterative(false, true, true, true, false), true)
		assert.strictEqual(xorBoolIterative(true, false, true, false, true, false), true)
		assert.strictEqual(xorBoolIterative(true, false, true, false, true, true), false)
	})

	test('edge cases: single boolean, all false, all true (odd vs even count)', () => {
		assert.strictEqual(xorBoolIterative(false), false)
		assert.strictEqual(xorBoolIterative(true), true)

		for (const count of [1, 2, 3, 4, 10]) {
			assert.strictEqual(xorBoolIterative(...Array(count).fill(false)), false)
		}

		for (const oddCount of [1, 3, 5, 7, 15]) {
			assert.strictEqual(xorBoolIterative(...Array(oddCount).fill(true)), true)
		}

		for (const evenCount of [2, 4, 6, 8, 16]) {
			assert.strictEqual(xorBoolIterative(...Array(evenCount).fill(true)), false)
		}
	})

	test('edge cases: large variadic input', () => {
		const evenTrues = Array.from({ length: 1000 }, (_, i) => i % 2 === 0)
		// 500 true values -> even -> false
		assert.strictEqual(xorBoolIterative(...evenTrues), false)

		const oddTrues = [...evenTrues, true]
		// 501 true values -> odd -> true
		assert.strictEqual(xorBoolIterative(...oddTrues), true)
	})

	test('rejects empty call with TypeError', () => {
		assert.throws(() => xorBoolIterative(), {
			name: 'TypeError',
			message: /at least one boolean/i,
		})
	})

	test('rejects non-boolean arguments in any position', () => {
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
			new Boolean(true),
			new Boolean(false),
			1n,
			Symbol('bool'),
			() => true,
		]

		for (const bad of invalidValues) {
			assert.throws(() => xorBoolIterative(bad), TypeError)
			assert.throws(() => xorBoolIterative(true, bad), TypeError)
			assert.throws(() => xorBoolIterative(false, true, bad), TypeError)
			assert.throws(() => xorBoolIterative(bad, true, false), TypeError)
		}
	})

	test('cross-check: 2-variable truth table vs (a || b) && !(a && b)', () => {
		const domain = [false, true]
		for (const a of domain) {
			for (const b of domain) {
				const expected = (a || b) && !(a && b)
				assert.strictEqual(xorBoolIterative(a, b), expected)
			}
		}
	})

	test('cross-check: exhaustive 4-variable truth table vs (trueCount % 2) === 1', () => {
		for (let mask = 0; mask < 16; mask += 1) {
			const a = Boolean(mask & 1)
			const b = Boolean(mask & 2)
			const c = Boolean(mask & 4)
			const d = Boolean(mask & 8)
			const args = [a, b, c, d]

			const trueCount = args.reduce((acc, v) => acc + (v ? 1 : 0), 0)
			const expectedParity = trueCount % 2 === 1
			const binaryXor = (x, y) => (x || y) && !(x && y)
			const expectedChained = binaryXor(binaryXor(binaryXor(a, b), c), d)

			assert.strictEqual(xorBoolIterative(...args), expectedParity)
			assert.strictEqual(xorBoolIterative(...args), expectedChained)
		}
	})

	test('cross-check: exhaustive 5-variable truth table vs popcount parity', () => {
		for (let mask = 0; mask < 32; mask += 1) {
			const args = Array.from({ length: 5 }, (_, bit) => Boolean((mask >> bit) & 1))
			const expected = args.filter(Boolean).length % 2 === 1
			assert.strictEqual(xorBoolIterative(...args), expected)
		}
	})
})
