import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { productDualRecursive } from './productDualRecursive.js'

/**
 * Assert two numbers are close within absolute + relative tolerance.
 *
 * @param {number} actual
 * @param {number} expected
 * @param {number} [tol=1e-9]
 * @param {string} [label]
 */
function assertClose(actual, expected, tol = 1e-9, label = 'value') {
	const diff = Math.abs(actual - expected)
	const scale = Math.max(1, Math.abs(actual), Math.abs(expected))
	assert.ok(
		diff <= tol * scale,
		`${label}: expected ${actual} to be within ${tol * scale} of ${expected} (diff=${diff})`
	)
}

describe('productDualRecursive', () => {
	describe('edge cases: empty and single element', () => {
		test('empty array returns dual multiplicative identity { v: 1, d: 0 }', () => {
			assert.deepStrictEqual(productDualRecursive([]), { v: 1, d: 0 })
		})

		test('single element returns a fresh copy with identical { v, d }', () => {
			const input = [{ v: 7, d: -3 }]
			const result = productDualRecursive(input)
			assert.deepStrictEqual(result, { v: 7, d: -3 })
			assert.notStrictEqual(result, input[0])
		})

		test('single zero-valued element preserves its derivative', () => {
			assert.deepStrictEqual(productDualRecursive([{ v: 0, d: 4.5 }]), { v: 0, d: 4.5 })
		})
	})

	describe('normal cases', () => {
		test('two elements follow the dual product rule', () => {
			// (2 + 3ε)(5 + 7ε) = 10 + (3*5 + 2*7)ε = 10 + 29ε
			assert.deepStrictEqual(
				productDualRecursive([
					{ v: 2, d: 3 },
					{ v: 5, d: 7 },
				]),
				{ v: 10, d: 29 }
			)
		})

		test('three elements (odd divide-and-conquer split)', () => {
			// (2 + 1ε)(3 + 2ε)(4 + 5ε)
			// v = 24
			// d = 1*3*4 + 2*2*4 + 2*3*5 = 12 + 16 + 30 = 58
			assert.deepStrictEqual(
				productDualRecursive([
					{ v: 2, d: 1 },
					{ v: 3, d: 2 },
					{ v: 4, d: 5 },
				]),
				{ v: 24, d: 58 }
			)
		})

		test('power-of-two and non-power-of-two lengths', () => {
			// Four elements: ∏(i+1 + ε) for i=1..4 -> (2+ε)(3+ε)(4+ε)(5+ε)
			// v = 120, d = 120 * (1/2 + 1/3 + 1/4 + 1/5) = 60 + 40 + 30 + 24 = 154
			assert.deepStrictEqual(
				productDualRecursive([
					{ v: 2, d: 1 },
					{ v: 3, d: 1 },
					{ v: 4, d: 1 },
					{ v: 5, d: 1 },
				]),
				{ v: 120, d: 154 }
			)

			// Five elements: multiply above by (6 + 2ε)
			// v = 720, d = 154*6 + 120*2 = 924 + 240 = 1164
			assert.deepStrictEqual(
				productDualRecursive([
					{ v: 2, d: 1 },
					{ v: 3, d: 1 },
					{ v: 4, d: 1 },
					{ v: 5, d: 1 },
					{ v: 6, d: 2 },
				]),
				{ v: 720, d: 1164 }
			)
		})

		test('constants with zero derivatives produce zero derivative', () => {
			assert.deepStrictEqual(
				productDualRecursive([
					{ v: 2, d: 0 },
					{ v: 3, d: 0 },
					{ v: 5, d: 0 },
					{ v: 7, d: 0 },
				]),
				{ v: 210, d: 0 }
			)
		})

		test('does not mutate input array or element objects', () => {
			const elements = [
				Object.freeze({ v: 2, d: 3 }),
				Object.freeze({ v: 4, d: 5 }),
				Object.freeze({ v: 6, d: 7 }),
			]
			Object.freeze(elements)
			const result = productDualRecursive(elements)
			assert.deepStrictEqual(result, { v: 48, d: 188 })
		})
	})

	describe('zeros and negatives', () => {
		test('single zero element with nonzero derivative (0*b + d*b)', () => {
			// Zero in the middle
			const mid = productDualRecursive([
				{ v: 2, d: 3 },
				{ v: 0, d: 5 },
				{ v: 4, d: -1 },
			])
			assert.equal(mid.v, 0)
			assert.equal(mid.d, 40) // 5 * (2 * 4)

			// Zero at the start
			const first = productDualRecursive([
				{ v: 0, d: 5 },
				{ v: 2, d: 3 },
				{ v: 4, d: -1 },
			])
			assert.equal(first.v, 0)
			assert.equal(first.d, 40)

			// Zero at the end
			const last = productDualRecursive([
				{ v: 2, d: 3 },
				{ v: 4, d: -1 },
				{ v: 0, d: 5 },
			])
			assert.equal(last.v, 0)
			assert.equal(last.d, 40)
		})

		test('multiple zero elements yield both zero value and zero derivative', () => {
			const res = productDualRecursive([
				{ v: 0, d: 5 },
				{ v: 3, d: 2 },
				{ v: 0, d: 7 },
				{ v: -4, d: 9 },
			])
			assert.equal(res.v, 0)
			assert.equal(res.d, 0)
		})

		test('negative values and negative derivatives', () => {
			// (-2 + 3ε)(-3 - 4ε)(5 - 1ε)
			// v = (-2)*(-3)*5 = 30
			// d = 3*(-3)*5 + (-2)*(-4)*5 + (-2)*(-3)*(-1) = -45 + 40 - 6 = -11
			assert.deepStrictEqual(
				productDualRecursive([
					{ v: -2, d: 3 },
					{ v: -3, d: -4 },
					{ v: 5, d: -1 },
				]),
				{ v: 30, d: -11 }
			)
		})

		test('negative value paired with zero value and nonzero derivative', () => {
			const res = productDualRecursive([
				{ v: -2, d: 1 },
				{ v: 0, d: 3 },
			])
			assert.equal(res.v, 0)
			assert.equal(res.d, -6)
		})
	})

	describe('input validation', () => {
		test('rejects non-array inputs with TypeError', () => {
			const invalidInputs = [null, undefined, 42, '123', { v: 1, d: 0 }, new Set()]
			for (const bad of invalidInputs) {
				assert.throws(() => productDualRecursive(bad), TypeError)
			}
		})

		test('rejects sparse arrays and non-object elements with TypeError', () => {
			const sparse = new Array(2)
			sparse[0] = { v: 1, d: 0 }
			assert.throws(() => productDualRecursive(sparse), TypeError)

			assert.throws(() => productDualRecursive([null]), TypeError)
			assert.throws(() => productDualRecursive([undefined]), TypeError)
			assert.throws(() => productDualRecursive([42]), TypeError)
			assert.throws(() => productDualRecursive(['{v:1,d:0}']), TypeError)
		})

		test('rejects elements with missing or non-number v or d with TypeError', () => {
			assert.throws(() => productDualRecursive([{ v: 1 }]), TypeError)
			assert.throws(() => productDualRecursive([{ d: 1 }]), TypeError)
			assert.throws(() => productDualRecursive([{ v: '1', d: 0 }]), TypeError)
			assert.throws(() => productDualRecursive([{ v: 1, d: '0' }]), TypeError)
			assert.throws(() => productDualRecursive([{ v: true, d: 0 }]), TypeError)
			assert.throws(() => productDualRecursive([{ v: 1, d: null }]), TypeError)
		})

		test('rejects non-finite v or d with RangeError', () => {
			assert.throws(() => productDualRecursive([{ v: NaN, d: 0 }]), RangeError)
			assert.throws(() => productDualRecursive([{ v: 1, d: NaN }]), RangeError)
			assert.throws(() => productDualRecursive([{ v: Infinity, d: 0 }]), RangeError)
			assert.throws(() => productDualRecursive([{ v: 1, d: -Infinity }]), RangeError)
		})

		test('validates all elements even after a zero element', () => {
			assert.throws(
				() =>
					productDualRecursive([
						{ v: 0, d: 0 },
						{ v: 2, d: 1 },
						{ v: NaN, d: 3 },
					]),
				RangeError
			)
		})
	})

	describe('independent cross-checks', () => {
		test('matches logarithmic derivative P * sum(d_i / v_i) on nonzero elements', () => {
			const duals = [
				{ v: 1.5, d: -0.4 },
				{ v: -2.3, d: 1.1 },
				{ v: 0.75, d: 0.25 },
				{ v: 3.2, d: -2.0 },
				{ v: -0.9, d: -0.3 },
				{ v: 1.8, d: 0.6 },
				{ v: 2.1, d: -0.8 },
				{ v: -1.4, d: 0.5 },
				{ v: 0.65, d: 1.2 },
				{ v: 1.25, d: -0.15 },
				{ v: -0.85, d: 0.45 },
			]

			const result = productDualRecursive(duals)

			const expectedV = duals.reduce((acc, el) => acc * el.v, 1)
			const logDerivSum = duals.reduce((acc, el) => acc + el.d / el.v, 0)
			const expectedD = expectedV * logDerivSum

			assertClose(result.v, expectedV, 1e-12, 'logarithmic cross-check v')
			assertClose(result.d, expectedD, 1e-12, 'logarithmic cross-check d')

			// Permutation invariance cross-check
			const reversed = [...duals].reverse()
			const reversedResult = productDualRecursive(reversed)
			assertClose(reversedResult.v, result.v, 1e-12, 'reversed v')
			assertClose(reversedResult.d, result.d, 1e-12, 'reversed d')
		})

		test('matches central finite-difference derivative of ∏ f_i(t)', () => {
			const funcs = [
				{ f: (t) => t * t + 1, df: (t) => 2 * t },
				{ f: (t) => Math.sin(t) + 2, df: (t) => Math.cos(t) },
				{ f: (t) => Math.exp(0.3 * t), df: (t) => 0.3 * Math.exp(0.3 * t) },
				{ f: (t) => 3 * t - 4, df: () => 3 },
				{ f: (t) => Math.cos(2 * t) - 1.5, df: (t) => -2 * Math.sin(2 * t) },
				{ f: (t) => Math.log(t + 5), df: (t) => 1 / (t + 5) },
				{ f: (t) => 1 / (t + 3), df: (t) => -1 / ((t + 3) * (t + 3)) },
			]

			const prodAt = (t) => funcs.reduce((acc, { f }) => acc * f(t), 1)

			const t0 = 0.7
			const duals = funcs.map(({ f, df }) => ({ v: f(t0), d: df(t0) }))
			const result = productDualRecursive(duals)

			const h = 1e-6
			const fdDeriv = (prodAt(t0 + h) - prodAt(t0 - h)) / (2 * h)

			assertClose(result.v, prodAt(t0), 1e-12, 'finite-difference cross-check v')
			assertClose(result.d, fdDeriv, 1e-7, 'finite-difference cross-check d')
		})

		test('matches central finite-difference derivative when a factor vanishes at t0', () => {
			// f_1(0) = sin(0) = 0, f_1'(0) = 1: logarithmic derivative is undefined here,
			// but dual arithmetic and central finite difference both agree.
			const funcs = [
				{ f: (t) => Math.exp(t), df: (t) => Math.exp(t) },
				{ f: (t) => Math.sin(t), df: (t) => Math.cos(t) },
				{ f: (t) => t * t + 3, df: (t) => 2 * t },
				{ f: (t) => 2 * t - 5, df: () => 2 },
			]

			const prodAt = (t) => funcs.reduce((acc, { f }) => acc * f(t), 1)
			const t0 = 0
			const duals = funcs.map(({ f, df }) => ({ v: f(t0), d: df(t0) }))
			const result = productDualRecursive(duals)

			const h = 1e-6
			const fdDeriv = (prodAt(t0 + h) - prodAt(t0 - h)) / (2 * h)

			// Exact: v = 0, d = e^0 * cos(0) * 3 * (-5) = -15
			assert.equal(result.v, 0)
			assertClose(result.d, -15, 1e-12, 'exact zero-factor derivative')
			assertClose(result.d, fdDeriv, 1e-7, 'finite-difference zero-factor derivative')
		})
	})
})
