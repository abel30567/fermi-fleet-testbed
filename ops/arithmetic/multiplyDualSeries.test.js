import { describe, test } from 'node:test'
import assert from 'node:assert'
import { multiplyDualSeries } from './multiplyDualSeries.js'

/**
 * Helper to assert two dual numbers are approximately equal within epsilon.
 */
function assertDualClose(actual, expected, eps = 1e-12) {
	assert.ok(
		Math.abs(actual.v - expected.v) <= eps,
		`expected v ≈ ${expected.v} (±${eps}), got ${actual.v}`,
	)
	assert.ok(
		Math.abs(actual.d - expected.d) <= eps,
		`expected d ≈ ${expected.d} (±${eps}), got ${actual.d}`,
	)
}

describe('multiplyDualSeries', () => {
	test('multiplies standard dual numbers', () => {
		assert.deepStrictEqual(
			multiplyDualSeries({ v: 2, d: 3 }, { v: 4, d: 5 }),
			{ v: 8, d: 22 },
		)
		assertDualClose(
			multiplyDualSeries({ v: 1.5, d: 0.5 }, { v: 2.5, d: 4 }),
			{ v: 3.75, d: 7.25 },
		)
	})

	test('handles scalar lift, multiplicative identity, and pure infinitesimal ε', () => {
		// Identity element 1 + 0ε
		assert.deepStrictEqual(
			multiplyDualSeries({ v: 7.25, d: -3.5 }, { v: 1, d: 0 }),
			{ v: 7.25, d: -3.5 },
		)
		assert.deepStrictEqual(
			multiplyDualSeries({ v: 1, d: 0 }, { v: 7.25, d: -3.5 }),
			{ v: 7.25, d: -3.5 },
		)

		// Scalar multiplication (c + 0ε) * (v + dε) = c*v + c*dε
		assert.deepStrictEqual(
			multiplyDualSeries({ v: 3, d: 0 }, { v: 4, d: -2 }),
			{ v: 12, d: -6 },
		)

		// Nilpotency: ε * ε = 0
		assert.deepStrictEqual(
			multiplyDualSeries({ v: 0, d: 1 }, { v: 0, d: 1 }),
			{ v: 0, d: 0 },
		)
		assert.deepStrictEqual(
			multiplyDualSeries({ v: 0, d: 5 }, { v: 0, d: -9 }),
			{ v: 0, d: 0 },
		)

		// (a.v + a.d*ε) * ε = 0 + a.v*ε
		assert.deepStrictEqual(
			multiplyDualSeries({ v: 6, d: 11 }, { v: 0, d: 1 }),
			{ v: 0, d: 6 },
		)
	})

	test('handles zeros, negatives, signed zeros, and immutability', () => {
		// Zero annihilator
		assert.deepStrictEqual(
			multiplyDualSeries({ v: 0, d: 0 }, { v: -5, d: 12 }),
			{ v: 0, d: 0 },
		)
		assert.deepStrictEqual(
			multiplyDualSeries({ v: -5, d: 12 }, { v: 0, d: 0 }),
			{ v: 0, d: 0 },
		)

		// Negative and mixed-sign operands
		assert.deepStrictEqual(
			multiplyDualSeries({ v: -3, d: 2 }, { v: 4, d: -5 }),
			{ v: -12, d: 23 },
		)
		assert.deepStrictEqual(
			multiplyDualSeries({ v: -2, d: -3 }, { v: -4, d: -5 }),
			{ v: 8, d: 22 },
		)

		// Signed zero normalization (no -0 in output)
		const zeroRes = multiplyDualSeries({ v: -0, d: -0 }, { v: 3, d: -4 })
		assert.ok(Object.is(zeroRes.v, 0))
		assert.ok(Object.is(zeroRes.d, 0))

		// Inputs are not mutated
		const a = Object.freeze({ v: 3, d: 4 })
		const b = Object.freeze({ v: -2, d: 5 })
		assert.deepStrictEqual(multiplyDualSeries(a, b), { v: -6, d: 7 })
	})

	test('validates inputs and rejects malformed or non-finite operands', () => {
		const valid = { v: 1, d: 2 }

		for (const bad of [null, undefined, 42, 'dual', true, [1, 2]]) {
			assert.throws(() => multiplyDualSeries(bad, valid), TypeError)
			assert.throws(() => multiplyDualSeries(valid, bad), TypeError)
		}

		for (const missingOrWrongType of [
			{},
			{ v: 1 },
			{ d: 1 },
			{ v: '1', d: 2 },
			{ v: 1, d: '2' },
			{ v: null, d: 2 },
			{ v: 1, d: undefined },
		]) {
			assert.throws(() => multiplyDualSeries(missingOrWrongType, valid), TypeError)
			assert.throws(() => multiplyDualSeries(valid, missingOrWrongType), TypeError)
		}

		for (const nonFinite of [
			{ v: Number.NaN, d: 1 },
			{ v: 1, d: Number.NaN },
			{ v: Number.POSITIVE_INFINITY, d: 1 },
			{ v: 1, d: Number.NEGATIVE_INFINITY },
		]) {
			assert.throws(() => multiplyDualSeries(nonFinite, valid), RangeError)
			assert.throws(() => multiplyDualSeries(valid, nonFinite), RangeError)
		}
	})

	test('cross-checks derivative against central finite differences', () => {
		// f(x) = x^2 + 3x - 1, f'(x) = 2x + 3
		// g(x) = sin(x) + 2,   g'(x) = cos(x)
		// h(x) = f(x) * g(x)
		const f = (x) => x * x + 3 * x - 1
		const df = (x) => 2 * x + 3
		const g = (x) => Math.sin(x) + 2
		const dg = (x) => Math.cos(x)
		const h = (x) => f(x) * g(x)

		const step = 1e-6
		for (const x of [-2.5, -0.7, 0, 1.25, 3.8]) {
			const res = multiplyDualSeries(
				{ v: f(x), d: df(x) },
				{ v: g(x), d: dg(x) },
			)
			const numericDerivative = (h(x + step) - h(x - step)) / (2 * step)

			assertDualClose(res, { v: h(x), d: numericDerivative }, 1e-8)
		}
	})

	test('cross-checks against 2x2 upper-triangular matrix representation and ring identities', () => {
		// Dual number (v, d) is isomorphic to [[v, d], [0, v]] under matrix multiplication.
		const mulMatrix = (a, b) => {
			const A = [
				[a.v, a.d],
				[0, a.v],
			]
			const B = [
				[b.v, b.d],
				[0, b.v],
			]
			return {
				v: A[0][0] * B[0][0] + A[0][1] * B[1][0],
				d: A[0][0] * B[0][1] + A[0][1] * B[1][1],
			}
		}

		const addDual = (x, y) => ({ v: x.v + y.v, d: x.d + y.d })

		const a = { v: 1.7, d: -2.3 }
		const b = { v: -0.9, d: 4.1 }
		const c = { v: 3.2, d: 0.8 }

		// Matrix isomorphism
		assertDualClose(multiplyDualSeries(a, b), mulMatrix(a, b))
		assertDualClose(multiplyDualSeries(b, c), mulMatrix(b, c))

		// Commutativity: a * b = b * a
		assertDualClose(multiplyDualSeries(a, b), multiplyDualSeries(b, a))

		// Associativity: (a * b) * c = a * (b * c)
		assertDualClose(
			multiplyDualSeries(multiplyDualSeries(a, b), c),
			multiplyDualSeries(a, multiplyDualSeries(b, c)),
		)

		// Distributivity: a * (b + c) = a * b + a * c
		assertDualClose(
			multiplyDualSeries(a, addDual(b, c)),
			addDual(multiplyDualSeries(a, b), multiplyDualSeries(a, c)),
		)

		// Multiplicative inverse for units (v !== 0): (v, d)^-1 = (1/v, -d/v^2)
		const aInv = { v: 1 / a.v, d: -a.d / (a.v * a.v) }
		assertDualClose(multiplyDualSeries(a, aInv), { v: 1, d: 0 })
	})
})
