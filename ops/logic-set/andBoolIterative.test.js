import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { andBoolIterative } from './andBoolIterative.js'

describe('andBoolIterative', () => {
	it('computes binary truth table for plain booleans', () => {
		assert.equal(andBoolIterative(true, true), true)
		assert.equal(andBoolIterative(true, false), false)
		assert.equal(andBoolIterative(false, true), false)
		assert.equal(andBoolIterative(false, false), false)
	})

	it('handles single and variadic plain boolean arguments', () => {
		assert.equal(andBoolIterative(true), true)
		assert.equal(andBoolIterative(false), false)
		assert.equal(andBoolIterative(true, true, true, true), true)
		assert.equal(andBoolIterative(true, true, false, true), false)
		assert.equal(andBoolIterative(false, false, false), false)
	})

	it('handles Array inputs including empty and single-element arrays', () => {
		assert.equal(andBoolIterative([]), true)
		assert.equal(andBoolIterative([true]), true)
		assert.equal(andBoolIterative([false]), false)
		assert.equal(andBoolIterative([true, true, true]), true)
		assert.equal(andBoolIterative([true, false, true]), false)
		assert.equal(andBoolIterative([false, true, true]), false)
	})

	it('handles Set inputs including empty and populated Sets', () => {
		assert.equal(andBoolIterative(new Set()), true)
		assert.equal(andBoolIterative(new Set([true])), true)
		assert.equal(andBoolIterative(new Set([false])), false)
		assert.equal(andBoolIterative(new Set([true, false])), false)
	})

	it('handles large arrays iteratively without stack overflow', () => {
		const allTrue = Array.from({ length: 100_000 }, () => true)
		assert.equal(andBoolIterative(allTrue), true)

		const oneFalse = allTrue.slice()
		oneFalse[99_999] = false
		assert.equal(andBoolIterative(oneFalse), false)
	})

	it('rejects missing or non-boolean / invalid container inputs', () => {
		assert.throws(() => andBoolIterative(), TypeError)
		assert.throws(() => andBoolIterative(null), TypeError)
		assert.throws(() => andBoolIterative(undefined), TypeError)
		assert.throws(() => andBoolIterative(1), TypeError)
		assert.throws(() => andBoolIterative(0), TypeError)
		assert.throws(() => andBoolIterative('true'), TypeError)
		assert.throws(() => andBoolIterative({}), TypeError)
		assert.throws(() => andBoolIterative(new Boolean(true)), TypeError)
		assert.throws(() => andBoolIterative([true], [false]), TypeError)
		assert.throws(() => andBoolIterative(new Set([true]), false), TypeError)
	})

	it('validates all elements even after encountering false', () => {
		assert.throws(() => andBoolIterative(false, 1), TypeError)
		assert.throws(() => andBoolIterative(false, null), TypeError)
		assert.throws(() => andBoolIterative([false, 'nope']), TypeError)
		assert.throws(() => andBoolIterative([false, undefined]), TypeError)
		assert.throws(() => andBoolIterative(new Set([false, 0])), TypeError)
	})

	it('satisfies De Morgan law across all 2^4 boolean combinations', () => {
		for (let mask = 0; mask < 16; mask += 1) {
			const values = [
				Boolean(mask & 1),
				Boolean(mask & 2),
				Boolean(mask & 4),
				Boolean(mask & 8),
			]
			// De Morgan's law: (a ∧ b ∧ c ∧ d) === ¬(¬a ∨ ¬b ∨ ¬c ∨ ¬d)
			const deMorgan = !values.some((v) => !v)

			assert.equal(andBoolIterative(values), deMorgan)
			assert.equal(andBoolIterative(...values), deMorgan)
			assert.equal(andBoolIterative(new Set(values)), deMorgan)
		}
	})

	it('satisfies commutativity, associativity, and identity laws', () => {
		const bools = [false, true]
		for (const a of bools) {
			// Identity: a ∧ true === a, Annihilator: a ∧ false === false
			assert.equal(andBoolIterative(a, true), a)
			assert.equal(andBoolIterative(a, false), false)

			for (const b of bools) {
				// Commutativity: a ∧ b === b ∧ a
				assert.equal(andBoolIterative(a, b), andBoolIterative(b, a))

				for (const c of bools) {
					// Associativity: (a ∧ b) ∧ c === a ∧ (b ∧ c)
					assert.equal(
						andBoolIterative(andBoolIterative(a, b), c),
						andBoolIterative(a, andBoolIterative(b, c)),
					)
				}
			}
		}
	})
})
