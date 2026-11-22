import { describe, test } from 'node:test'
import assert from 'node:assert'
import { orBoolLazy, orBoolSteps } from './orBoolLazy.js'

describe('orBoolLazy', () => {
	test('handles normal boolean arrays', () => {
		assert.strictEqual(orBoolLazy([false, false]), false)
		assert.strictEqual(orBoolLazy([false, true]), true)
		assert.strictEqual(orBoolLazy([true, false]), true)
		assert.strictEqual(orBoolLazy([true, true]), true)
		assert.strictEqual(orBoolLazy([false, false, false, true]), true)
		assert.strictEqual(orBoolLazy([false, false, false, false]), false)
	})

	test('handles JS Set objects of booleans', () => {
		assert.strictEqual(orBoolLazy(new Set()), false)
		assert.strictEqual(orBoolLazy(new Set([false])), false)
		assert.strictEqual(orBoolLazy(new Set([true])), true)
		assert.strictEqual(orBoolLazy(new Set([false, true])), true)
		assert.strictEqual(orBoolLazy(new Set([true, false])), true)
	})

	test('handles edge cases: empty iterable and single element', () => {
		assert.strictEqual(orBoolLazy([]), false)
		assert.strictEqual(orBoolLazy((function* () {})()), false)
		assert.strictEqual(orBoolLazy([false]), false)
		assert.strictEqual(orBoolLazy([true]), true)

		const customIterable = {
			*[Symbol.iterator]() {
				yield false
				yield true
			}
		}
		assert.strictEqual(orBoolLazy(customIterable), true)
	})

	test('short-circuits lazily on an infinite generator and closes iterator', () => {
		let pulled = 0
		let closed = false

		function* infiniteBools() {
			try {
				pulled += 1
				yield false
				pulled += 1
				yield false
				pulled += 1
				yield true
				while (true) {
					pulled += 1
					yield false
				}
			} finally {
				closed = true
			}
		}

		assert.strictEqual(orBoolLazy(infiniteBools()), true)
		assert.strictEqual(pulled, 3)
		assert.strictEqual(closed, true)
	})

	test('short-circuits immediately when first element is true without pulling subsequent elements', () => {
		let pulled = 0

		function* poisonedAfterFirst() {
			pulled += 1
			yield true
			pulled += 1
			throw new Error('Should never be reached due to lazy short-circuiting')
		}

		assert.strictEqual(orBoolLazy(poisonedAfterFirst()), true)
		assert.strictEqual(pulled, 1)
	})

	test('orBoolSteps streams cumulative OR values lazily and stops on true', () => {
		let pulled = 0
		function* infiniteSource() {
			const prefix = [false, false, true]
			for (const b of prefix) {
				pulled += 1
				yield b
			}
			while (true) {
				pulled += 1
				yield false
			}
		}

		const steps = [...orBoolSteps(infiniteSource())]
		assert.deepStrictEqual(steps, [false, false, true])
		assert.strictEqual(pulled, 3)
		assert.deepStrictEqual([...orBoolSteps([])], [])
		assert.deepStrictEqual([...orBoolSteps([false, false])], [false, false])
	})

	test('throws TypeError for non-iterable or string inputs', () => {
		const invalidContainers = [null, undefined, 0, 1, true, false, '', 'true', {}, () => {}]
		for (const input of invalidContainers) {
			assert.throws(
				() => orBoolLazy(input),
				TypeError,
				`Expected TypeError for container ${String(input)}`
			)
		}
	})

	test('throws TypeError for non-boolean elements', () => {
		const invalidElements = [0, 1, 'true', 'false', '', null, undefined, {}, [], new Boolean(true)]
		for (const bad of invalidElements) {
			assert.throws(
				() => orBoolLazy([false, bad]),
				TypeError,
				`Expected TypeError for element ${String(bad)}`
			)
			assert.throws(
				() => orBoolLazy(new Set([false, bad])),
				TypeError,
				`Expected TypeError for Set element ${String(bad)}`
			)
		}
	})

	test('cross-checks against De Morgan law and Array.prototype.some for all bit combinations up to length 5', () => {
		for (let len = 0; len <= 5; len += 1) {
			const total = 1 << len
			for (let mask = 0; mask < total; mask += 1) {
				const bits = []
				for (let i = 0; i < len; i += 1) {
					bits.push(Boolean((mask >> i) & 1))
				}

				const actual = orBoolLazy(bits)
				const viaSome = bits.some((b) => b)
				const viaDeMorgan = !bits.every((b) => !b)

				assert.strictEqual(actual, viaSome)
				assert.strictEqual(actual, viaDeMorgan)
				// Also verify generator input matches array input
				assert.strictEqual(orBoolLazy(bits.values()), viaDeMorgan)
			}
		}
	})
})
