import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { vectorAddDualSeries } from './vectorAddDualSeries.js'

function assertDualVectorClose(actual, expected, tol = 1e-12) {
	assert.equal(actual.length, expected.length)
	for (let i = 0; i < actual.length; i++) {
		assert.ok(
			Math.abs(actual[i].v - expected[i].v) <= tol,
			`index ${i} primal mismatch: ${actual[i].v} vs ${expected[i].v}`,
		)
		assert.ok(
			Math.abs(actual[i].d - expected[i].d) <= tol,
			`index ${i} dual mismatch: ${actual[i].d} vs ${expected[i].d}`,
		)
	}
}

describe('vectorAddDualSeries', () => {
	test('adds dual-number vectors componentwise (normal cases)', () => {
		const a = [
			{ v: 1, d: 2 },
			{ v: -3.5, d: 0.25 },
			{ v: 4.2, d: -1.8 },
		]
		const b = [
			{ v: 5, d: -1 },
			{ v: 1.5, d: 0.75 },
			{ v: -2.2, d: 3.8 },
		]

		const sum = vectorAddDualSeries(a, b)
		assertDualVectorClose(sum, [
			{ v: 6, d: 1 },
			{ v: -2, d: 1 },
			{ v: 2, d: 2 },
		])
	})

	test('does not mutate inputs and returns fresh dual objects', () => {
		const a = [{ v: 3, d: 4 }]
		const b = [{ v: 5, d: 6 }]
		const sum = vectorAddDualSeries(a, b)

		assert.deepEqual(a, [{ v: 3, d: 4 }])
		assert.deepEqual(b, [{ v: 5, d: 6 }])
		assert.notEqual(sum, a)
		assert.notEqual(sum, b)
		assert.notEqual(sum[0], a[0])
		assert.notEqual(sum[0], b[0])
	})

	test('handles edge cases: empty, 1D, zero, opposite, constant, and purely dual vectors', () => {
		assert.deepEqual(vectorAddDualSeries([], []), [])

		assert.deepEqual(vectorAddDualSeries([{ v: 7, d: -3 }], [{ v: -7, d: 3 }]), [
			{ v: 0, d: 0 },
		])

		// Constant vectors (d = 0) + purely dual vectors (v = 0)
		const constant = [
			{ v: 2.5, d: 0 },
			{ v: -1.5, d: 0 },
		]
		const purelyDual = [
			{ v: 0, d: 9.25 },
			{ v: 0, d: -4.75 },
		]
		assert.deepEqual(vectorAddDualSeries(constant, purelyDual), [
			{ v: 2.5, d: 9.25 },
			{ v: -1.5, d: -4.75 },
		])
	})

	test('validates input types, lengths, and finiteness', () => {
		assert.throws(() => vectorAddDualSeries(null, []), TypeError)
		assert.throws(() => vectorAddDualSeries([], undefined), TypeError)
		assert.throws(() => vectorAddDualSeries('vec', []), TypeError)
		assert.throws(() => vectorAddDualSeries([], { v: 1, d: 1 }), TypeError)

		assert.throws(
			() => vectorAddDualSeries([{ v: 1, d: 0 }], [{ v: 1, d: 0 }, { v: 2, d: 0 }]),
			RangeError,
		)

		assert.throws(() => vectorAddDualSeries([null], [{ v: 1, d: 1 }]), TypeError)
		assert.throws(() => vectorAddDualSeries([[1, 2]], [{ v: 1, d: 1 }]), TypeError)
		assert.throws(() => vectorAddDualSeries([{ v: 1 }], [{ v: 1, d: 1 }]), TypeError)
		assert.throws(() => vectorAddDualSeries([{ v: '1', d: 0 }], [{ v: 1, d: 1 }]), TypeError)

		assert.throws(() => vectorAddDualSeries([{ v: Number.NaN, d: 0 }], [{ v: 1, d: 1 }]), RangeError)
		assert.throws(() => vectorAddDualSeries([{ v: 1, d: Number.POSITIVE_INFINITY }], [{ v: 1, d: 1 }]), RangeError)
		assert.throws(() => vectorAddDualSeries([{ v: 1, d: 0 }], [{ v: Number.NEGATIVE_INFINITY, d: 1 }]), RangeError)
	})

	test('independent cross-check: central finite-difference derivative of vector sum', () => {
		// Nonlinear vector-valued functions f(t) and g(t)
		const f = (t) => [Math.sin(t), Math.exp(0.5 * t), t ** 3 - 2 * t]
		const fPrime = (t) => [Math.cos(t), 0.5 * Math.exp(0.5 * t), 3 * t ** 2 - 2]

		const g = (t) => [Math.cos(2 * t), Math.log(t + 2), Math.sqrt(t + 3)]
		const gPrime = (t) => [-2 * Math.sin(2 * t), 1 / (t + 2), 0.5 / Math.sqrt(t + 3)]

		const t = 1.25
		const h = 1e-6

		const fVal = f(t)
		const fDer = fPrime(t)
		const gVal = g(t)
		const gDer = gPrime(t)

		const aDual = fVal.map((v, i) => ({ v, d: fDer[i] }))
		const bDual = gVal.map((v, i) => ({ v, d: gDer[i] }))
		const sumDual = vectorAddDualSeries(aDual, bDual)

		const sumPlus = f(t + h).map((v, i) => v + g(t + h)[i])
		const sumMinus = f(t - h).map((v, i) => v + g(t - h)[i])
		const sumExact = fVal.map((v, i) => v + gVal[i])

		for (let i = 0; i < sumDual.length; i++) {
			const fdDerivative = (sumPlus[i] - sumMinus[i]) / (2 * h)
			assert.ok(
				Math.abs(sumDual[i].v - sumExact[i]) < 1e-12,
				`primal component ${i} mismatch`,
			)
			assert.ok(
				Math.abs(sumDual[i].d - fdDerivative) < 1e-8,
				`dual derivative ${sumDual[i].d} disagrees with finite diff ${fdDerivative} at index ${i}`,
			)
		}
	})

	test('independent cross-check: algebraic identities (commutativity, associativity, identity, dual linearity)', () => {
		const a = [
			{ v: 1.2, d: -0.7 },
			{ v: -4.5, d: 2.3 },
			{ v: 0.8, d: 1.1 },
		]
		const b = [
			{ v: -3.1, d: 4.4 },
			{ v: 2.7, d: -1.9 },
			{ v: 5.5, d: -0.6 },
		]
		const c = [
			{ v: 0.4, d: 0.9 },
			{ v: 1.8, d: 3.2 },
			{ v: -2.9, d: 0.5 },
		]
		const zero = a.map(() => ({ v: 0, d: 0 }))
		const negA = a.map(({ v, d }) => ({ v: -v, d: -d }))

		// Commutativity: a + b = b + a
		assertDualVectorClose(vectorAddDualSeries(a, b), vectorAddDualSeries(b, a))

		// Associativity: (a + b) + c = a + (b + c)
		assertDualVectorClose(
			vectorAddDualSeries(vectorAddDualSeries(a, b), c),
			vectorAddDualSeries(a, vectorAddDualSeries(b, c)),
		)

		// Additive identity and inverse
		assertDualVectorClose(vectorAddDualSeries(a, zero), a)
		assertDualVectorClose(vectorAddDualSeries(a, negA), zero)

		// Distributivity over dual scalar multiplication: s * (a + b) = s * a + s * b
		const s = { v: 2.5, d: -1.25 }
		const scaleDual = (scalar, vec) =>
			vec.map(({ v, d }) => ({
				v: scalar.v * v,
				d: scalar.v * d + scalar.d * v,
			}))

		const lhs = scaleDual(s, vectorAddDualSeries(a, b))
		const rhs = vectorAddDualSeries(scaleDual(s, a), scaleDual(s, b))
		assertDualVectorClose(lhs, rhs)
	})
})
