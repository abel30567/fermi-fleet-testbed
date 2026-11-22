import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { andBoolRecursive } from './andBoolRecursive.js'

describe('andBoolRecursive', () => {
	describe('binary truth table', () => {
		it('matches the 2-input logical AND truth table', () => {
			assert.equal(andBoolRecursive(true, true), true)
			assert.equal(andBoolRecursive(true, false), false)
			assert.equal(andBoolRecursive(false, true), false)
			assert.equal(andBoolRecursive(false, false), false)
		})

		it('matches the 2-input truth table with array input', () => {
			assert.equal(andBoolRecursive([true, true]), true)
			assert.equal(andBoolRecursive([true, false]), false)
			assert.equal(andBoolRecursive([false, true]), false)
			assert.equal(andBoolRecursive([false, false]), false)
		})
	})

	describe('multi-argument and array edge cases', () => {
		it('handles a single boolean (variadic and array)', () => {
			assert.equal(andBoolRecursive(true), true)
			assert.equal(andBoolRecursive(false), false)
			assert.equal(andBoolRecursive([true]), true)
			assert.equal(andBoolRecursive([false]), false)
		})

		it('returns true when all inputs are true (odd and even lengths)', () => {
			assert.equal(andBoolRecursive(true, true, true), true)
			assert.equal(andBoolRecursive(true, true, true, true), true)
			assert.equal(andBoolRecursive(true, true, true, true, true), true)
			assert.equal(andBoolRecursive(new Array(1000).fill(true)), true)
		})

		it('returns false when first, middle, or last input is false', () => {
			assert.equal(andBoolRecursive(false, true, true, true, true), false)
			assert.equal(andBoolRecursive(true, true, false, true, true), false)
			assert.equal(andBoolRecursive(true, true, true, true, false), false)

			const large = new Array(1024).fill(true)
			large[0] = false
			assert.equal(andBoolRecursive(large), false)

			const largeMid = new Array(1025).fill(true)
			largeMid[512] = false
			assert.equal(andBoolRecursive(largeMid), false)

			const largeLast = new Array(1024).fill(true)
			largeLast[1023] = false
			assert.equal(andBoolRecursive(largeLast), false)
		})
	})

	describe('strict input validation', () => {
		it('throws TypeError when called with no arguments or an empty array', () => {
			assert.throws(() => andBoolRecursive(), TypeError)
			assert.throws(() => andBoolRecursive([]), TypeError)
		})

		it('throws TypeError for non-boolean values', () => {
			const invalidValues = [
				0,
				1,
				NaN,
				'',
				'true',
				'false',
				null,
				undefined,
				{},
				Symbol('bool'),
				1n,
				new Boolean(true),
				new Boolean(false),
				() => true,
			]

			for (const bad of invalidValues) {
				assert.throws(() => andBoolRecursive(bad), TypeError)
				assert.throws(() => andBoolRecursive(true, bad), TypeError)
				assert.throws(() => andBoolRecursive([true, bad]), TypeError)
			}
		})

		it('rejects non-booleans even when an earlier element is false (no validation bypass)', () => {
			assert.throws(() => andBoolRecursive(false, 'not-a-boolean'), TypeError)
			assert.throws(() => andBoolRecursive(false, null), TypeError)
			assert.throws(() => andBoolRecursive([false, 1]), TypeError)
			assert.throws(() => andBoolRecursive(false, true, undefined), TypeError)
		})

		it('rejects nested arrays and sparse arrays', () => {
			assert.throws(() => andBoolRecursive([true], true), TypeError)
			assert.throws(() => andBoolRecursive([[true, true]]), TypeError)
			// eslint-disable-next-line no-sparse-arrays
			assert.throws(() => andBoolRecursive([true, , true]), TypeError)
			assert.throws(() => andBoolRecursive(new Array(3)), TypeError)
		})
	})

	describe('exhaustive truth-table cross-check', () => {
		it('matches Array.prototype.every and bitwise AND across all truth tables for arities 1..10', () => {
			for (let arity = 1; arity <= 10; arity++) {
				const totalCombinations = 1 << arity
				const allOnesMask = totalCombinations - 1

				for (let mask = 0; mask < totalCombinations; mask++) {
					const inputs = new Array(arity)
					let bitwiseExpected = 1

					for (let bit = 0; bit < arity; bit++) {
						const val = Boolean((mask >> bit) & 1)
						inputs[bit] = val
						bitwiseExpected &= val ? 1 : 0
					}

					const everyExpected = inputs.every(Boolean)
					const maskExpected = mask === allOnesMask

					assert.equal(everyExpected, Boolean(bitwiseExpected))
					assert.equal(everyExpected, maskExpected)

					assert.equal(andBoolRecursive(...inputs), everyExpected)
					assert.equal(andBoolRecursive(inputs), everyExpected)
				}
			}
		})
	})
})
