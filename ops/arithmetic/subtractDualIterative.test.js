import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { subtractDualIterative } from './subtractDualIterative.js'

describe('subtractDualIterative', () => {
	test('subtracts two dual numbers in standard cases', () => {
		assert.deepEqual(
			subtractDualIterative({ v: 10, d: 4 }, { v: 3, d: 1.5 }),
			{ v: 7, d: 2.5 },
		)
		assert.deepEqual(
			subtractDualIterative({ v: -5, d: -2 }, { v: -8, d: 3 }),
			{ v: 3, d: -5 },
		)
		assert.deepEqual(
			subtractDualIterative({ v: 0, d: 0 }, { v: 2.5, d: -7.25 }),
			{ v: -2.5, d: 7.25 },
		)
	})

	test('iteratively subtracts multiple dual numbers left-to-right', () => {
		const result = subtractDualIterative(
			{ v: 20, d: 10 },
			{ v: 5, d: 2 },
			{ v: 3, d: -1 },
			{ v: 4.5, d: 0.5 },
		)
		assert.deepEqual(result, { v: 7.5, d: 8.5 })
	})

	test('preserves algebraic properties and does not mutate inputs', () => {
		const a = { v: 6.25, d: -3.5 }
		const b = { v: 1.75, d: 2.25 }
		const aCopy = { ...a }
		const bCopy = { ...b }

		const diff = subtractDualIterative(a, b)
		assert.deepEqual(a, aCopy)
		assert.deepEqual(b, bCopy)
		assert.notEqual(diff, a)
		assert.notEqual(diff, b)

		// Anticommutativity: a - b = -(b - a)
		const rev = subtractDualIterative(b, a)
		assert.deepEqual(diff, { v: -rev.v, d: -rev.d })

		// Self-subtraction yields zero dual number
		assert.deepEqual(subtractDualIterative(a, a), { v: 0, d: 0 })

		// Subtracting zero dual number is identity
		assert.deepEqual(subtractDualIterative(a, { v: 0, d: 0 }), a)
	})

	test('handles edge cases including negative zero, subnormals, and large values', () => {
		// Normalizes -0 to +0
		const zeroRes = subtractDualIterative({ v: -0, d: -0 }, { v: 0, d: 0 })
		assert.ok(Object.is(zeroRes.v, 0))
		assert.ok(Object.is(zeroRes.d, 0))

		// Cancelling extreme finite values stays finite
		assert.deepEqual(
			subtractDualIterative(
				{ v: Number.MAX_VALUE, d: -Number.MAX_VALUE },
				{ v: Number.MAX_VALUE, d: -Number.MAX_VALUE },
			),
			{ v: 0, d: 0 },
		)

		// Subnormal numbers
		const sub = subtractDualIterative(
			{ v: Number.MIN_VALUE * 3, d: Number.MIN_VALUE * 2 },
			{ v: Number.MIN_VALUE, d: Number.MIN_VALUE },
		)
		assert.equal(sub.v, Number.MIN_VALUE * 2)
		assert.equal(sub.d, Number.MIN_VALUE)

		// Extra properties on dual-like objects are ignored cleanly
		assert.deepEqual(
			subtractDualIterative({ v: 5, d: 2, tag: 'a' }, { v: 1, d: 3, tag: 'b' }),
			{ v: 4, d: -1 },
		)
	})

	test('throws TypeError on missing or malformed inputs', () => {
		assert.throws(() => subtractDualIterative(), TypeError)
		assert.throws(() => subtractDualIterative({ v: 1, d: 1 }), TypeError)
		assert.throws(() => subtractDualIterative(null, { v: 1, d: 1 }), TypeError)
		assert.throws(() => subtractDualIterative({ v: 1, d: 1 }, null), TypeError)
		assert.throws(() => subtractDualIterative(5, { v: 1, d: 1 }), TypeError)
		assert.throws(() => subtractDualIterative([1, 2], { v: 1, d: 1 }), TypeError)
		assert.throws(() => subtractDualIterative({ v: 1 }, { v: 1, d: 1 }), TypeError)
		assert.throws(() => subtractDualIterative({ d: 1 }, { v: 1, d: 1 }), TypeError)
		assert.throws(() => subtractDualIterative({ v: '1', d: 1 }, { v: 1, d: 1 }), TypeError)
		assert.throws(() => subtractDualIterative({ v: 1, d: 1 }, { v: 1, d: '2' }), TypeError)
		assert.throws(
			() => subtractDualIterative({ v: 1, d: 1 }, { v: 1, d: 1 }, 'bad'),
			TypeError,
		)
	})

	test('throws RangeError on non-finite components and overflow', () => {
		assert.throws(() => subtractDualIterative({ v: NaN, d: 1 }, { v: 1, d: 1 }), RangeError)
		assert.throws(() => subtractDualIterative({ v: 1, d: Infinity }, { v: 1, d: 1 }), RangeError)
		assert.throws(() => subtractDualIterative({ v: 1, d: 1 }, { v: -Infinity, d: 1 }), RangeError)
		assert.throws(
			() => subtractDualIterative({ v: 1, d: 1 }, { v: 1, d: 1 }, { v: 0, d: NaN }),
			RangeError,
		)

		// Overflow in value component
		assert.throws(
			() => subtractDualIterative({ v: Number.MAX_VALUE, d: 0 }, { v: -Number.MAX_VALUE, d: 0 }),
			RangeError,
		)
		// Overflow in derivative component
		assert.throws(
			() => subtractDualIterative({ v: 0, d: -Number.MAX_VALUE }, { v: 0, d: Number.MAX_VALUE }),
			RangeError,
		)
	})

	test('matches central finite-difference derivative cross-check (binary and multi-term)', () => {
		const f = (x) => x ** 3 + 2 * x
		const df = (x) => 3 * x ** 2 + 2
		const g = (x) => Math.sin(x) + 0.5 * x ** 2
		const dg = (x) => Math.cos(x) + x
		const k = (x) => Math.exp(-0.5 * x)
		const dk = (x) => -0.5 * Math.exp(-0.5 * x)

		const eps = 1e-6
		for (const x0 of [-1.75, 0.0, 1.25, 2.5]) {
			// Binary: h(x) = f(x) - g(x)
			const h = (x) => f(x) - g(x)
			const dualBin = subtractDualIterative(
				{ v: f(x0), d: df(x0) },
				{ v: g(x0), d: dg(x0) },
			)
			const fdBin = (h(x0 + eps) - h(x0 - eps)) / (2 * eps)
			assert.ok(
				Math.abs(dualBin.v - h(x0)) < 1e-12,
				`binary value mismatch at x=${x0}: ${dualBin.v} vs ${h(x0)}`,
			)
			assert.ok(
				Math.abs(dualBin.d - fdBin) < 1e-8,
				`binary derivative mismatch at x=${x0}: ${dualBin.d} vs ${fdBin}`,
			)

			// Multi-term iterative: m(x) = f(x) - g(x) - k(x)
			const m = (x) => f(x) - g(x) - k(x)
			const dualMulti = subtractDualIterative(
				{ v: f(x0), d: df(x0) },
				{ v: g(x0), d: dg(x0) },
				{ v: k(x0), d: dk(x0) },
			)
			const fdMulti = (m(x0 + eps) - m(x0 - eps)) / (2 * eps)
			assert.ok(
				Math.abs(dualMulti.v - m(x0)) < 1e-12,
				`multi value mismatch at x=${x0}: ${dualMulti.v} vs ${m(x0)}`,
			)
			assert.ok(
				Math.abs(dualMulti.d - fdMulti) < 1e-8,
				`multi derivative mismatch at x=${x0}: ${dualMulti.d} vs ${fdMulti}`,
			)
		}
	})
})
