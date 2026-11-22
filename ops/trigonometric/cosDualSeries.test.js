import { describe, test } from 'node:test'
import assert from 'node:assert'
import { cosDualSeries } from './cosDualSeries.js'

const EPS = 1e-12

/**
 * Asserts two finite numbers are within `tol`.
 *
 * @param {number} actual
 * @param {number} expected
 * @param {number} [tol=EPS]
 */
function assertClose(actual, expected, tol = EPS) {
	assert.ok(
		Math.abs(actual - expected) <= tol,
		`expected ${actual} to be within ${tol} of ${expected} (diff=${Math.abs(actual - expected)})`,
	)
}

/**
 * Multiplies two dual numbers: (a.v + a.d·ε)(b.v + b.d·ε).
 *
 * @param {{ v: number, d: number }} a
 * @param {{ v: number, d: number }} b
 * @returns {{ v: number, d: number }}
 */
function dualMul(a, b) {
	return {
		v: a.v * b.v,
		d: a.v * b.d + a.d * b.v,
	}
}

/**
 * Adds two dual numbers.
 *
 * @param {{ v: number, d: number }} a
 * @param {{ v: number, d: number }} b
 * @returns {{ v: number, d: number }}
 */
function dualAdd(a, b) {
	return {
		v: a.v + b.v,
		d: a.d + b.d,
	}
}

describe('cosDualSeries', () => {
	describe('normal cases', () => {
		test('standard angles with unit tangent', () => {
			const cases = [
				{ v: Math.PI / 6, expectedV: Math.sqrt(3) / 2, expectedD: -0.5 },
				{ v: Math.PI / 4, expectedV: Math.SQRT1_2, expectedD: -Math.SQRT1_2 },
				{ v: Math.PI / 3, expectedV: 0.5, expectedD: -Math.sqrt(3) / 2 },
				{ v: (2 * Math.PI) / 3, expectedV: -0.5, expectedD: -Math.sqrt(3) / 2 },
				{ v: -Math.PI / 3, expectedV: 0.5, expectedD: Math.sqrt(3) / 2 },
			]

			for (const { v, expectedV, expectedD } of cases) {
				const res = cosDualSeries({ v, d: 1 })
				assertClose(res.v, expectedV)
				assertClose(res.d, expectedD)
			}
		})

		test('scales derivative linearly with input tangent d (chain rule)', () => {
			const res = cosDualSeries({ v: 0.7, d: 2.5 })
			assertClose(res.v, Math.cos(0.7))
			assertClose(res.d, -2.5 * Math.sin(0.7))

			const neg = cosDualSeries({ v: -1.2, d: -3.4 })
			assertClose(neg.v, Math.cos(-1.2))
			assertClose(neg.d, 3.4 * Math.sin(-1.2))
		})

		test('supports composition cos(cos(x)) via forward-mode chain rule', () => {
			const x = 0.85
			const inner = cosDualSeries({ v: x, d: 1 })
			const outer = cosDualSeries(inner)

			// d/dx cos(cos(x)) = -sin(cos(x)) * (-sin(x)) = sin(cos(x)) * sin(x)
			assertClose(outer.v, Math.cos(Math.cos(x)))
			assertClose(outer.d, Math.sin(Math.cos(x)) * Math.sin(x))
		})

		test('does not mutate input dual object', () => {
			const input = Object.freeze({ v: 1.1, d: -0.5 })
			const res = cosDualSeries(input)
			assertClose(res.v, Math.cos(1.1))
			assertClose(res.d, 0.5 * Math.sin(1.1))
		})
	})

	describe('edge cases', () => {
		test('v = 0 gives value 1 and exact +0 derivative', () => {
			for (const d of [0, 1, -5, 1e6]) {
				const res = cosDualSeries({ v: 0, d })
				assert.strictEqual(res.v, 1)
				assert.strictEqual(res.d, 0)
				assert.ok(Object.is(res.d, 0), 'derivative should normalize -0 to +0')
			}
		})

		test('v = ±π/2 gives near-zero value and ±d derivative', () => {
			const pos = cosDualSeries({ v: Math.PI / 2, d: 3 })
			assertClose(pos.v, 0)
			assertClose(pos.d, -3)

			const neg = cosDualSeries({ v: -Math.PI / 2, d: 3 })
			assertClose(neg.v, 0)
			assertClose(neg.d, 3)
		})

		test('v = ±π gives value -1 and near-zero derivative', () => {
			for (const v of [Math.PI, -Math.PI]) {
				const res = cosDualSeries({ v, d: 2 })
				assertClose(res.v, -1)
				assertClose(res.d, 0)
			}
		})

		test('d = 0 (constant dual) yields exact +0 derivative for any angle', () => {
			for (const v of [-10, -Math.PI / 2, 0, 1.2345, Math.PI / 2, 1e6]) {
				const res = cosDualSeries({ v, d: 0 })
				assert.strictEqual(res.v, Math.cos(v))
				assert.strictEqual(res.d, 0)
				assert.ok(Object.is(res.d, 0))
			}
		})

		test('handles large positive and negative angles', () => {
			for (const v of [1e6, -1e6, 1e9, -1e12]) {
				const d = 1.75
				const res = cosDualSeries({ v, d })
				assert.strictEqual(res.v, Math.cos(v))
				assert.strictEqual(res.d, -d * Math.sin(v))
				assert.ok(Number.isFinite(res.v) && Number.isFinite(res.d))
			}
		})

		test('handles very small angles without catastrophic loss', () => {
			const v = 1e-12
			const res = cosDualSeries({ v, d: 1 })
			assert.strictEqual(res.v, 1)
			assertClose(res.d, -1e-12, 1e-24)
		})
	})

	describe('input validation', () => {
		test('rejects non-object and array inputs with TypeError', () => {
			for (const bad of [undefined, null, 0, 1.5, '0', true, [0, 1], () => ({ v: 0, d: 1 })]) {
				assert.throws(() => cosDualSeries(bad), TypeError)
			}
		})

		test('rejects missing or non-numeric v or d with TypeError', () => {
			const badDuals = [
				{},
				{ v: 0 },
				{ d: 1 },
				{ v: '0', d: 1 },
				{ v: 0, d: '1' },
				{ v: null, d: 1 },
				{ v: 0, d: undefined },
				{ v: 1n, d: 0 },
			]
			for (const bad of badDuals) {
				assert.throws(() => cosDualSeries(bad), TypeError)
			}
		})

		test('rejects non-finite v or d with RangeError', () => {
			const nonFiniteDuals = [
				{ v: Number.NaN, d: 1 },
				{ v: 0, d: Number.NaN },
				{ v: Number.POSITIVE_INFINITY, d: 1 },
				{ v: Number.NEGATIVE_INFINITY, d: 1 },
				{ v: 0, d: Number.POSITIVE_INFINITY },
				{ v: 0, d: Number.NEGATIVE_INFINITY },
			]
			for (const bad of nonFiniteDuals) {
				assert.throws(() => cosDualSeries(bad), RangeError)
			}
		})
	})

	describe('independent cross-checks', () => {
		test('matches central finite-difference directional derivative', () => {
			const h = 1e-6
			const samples = [
				{ v: -2.3, d: 1 },
				{ v: -0.5, d: -2.2 },
				{ v: 0, d: 3.5 },
				{ v: 0.42, d: 1.5 },
				{ v: 1.57, d: 0.8 },
				{ v: 2.75, d: -1.3 },
				{ v: 10.4, d: 4.1 },
			]

			for (const sample of samples) {
				const res = cosDualSeries(sample)
				const fd = (Math.cos(sample.v + h * sample.d) - Math.cos(sample.v - h * sample.d)) / (2 * h)
				assertClose(res.d, fd, 1e-8)
			}
		})

		test('satisfies dual Pythagorean identity sin²(x) + cos²(x) = { v: 1, d: 0 }', () => {
			const samples = [
				{ v: 0, d: 1 },
				{ v: 0.6, d: 2.3 },
				{ v: -1.9, d: -0.7 },
				{ v: Math.PI / 2, d: 5 },
				{ v: 123.456, d: -11.2 },
			]

			for (const x of samples) {
				const cosX = cosDualSeries(x)
				const sinX = { v: Math.sin(x.v), d: x.d * Math.cos(x.v) }
				const sumSq = dualAdd(dualMul(sinX, sinX), dualMul(cosX, cosX))

				assertClose(sumSq.v, 1, 1e-14)
				assertClose(sumSq.d, 0, 1e-13)
			}
		})

		test('satisfies dual double-angle identity cos(2x) = 2·cos²(x) - 1', () => {
			const samples = [
				{ v: 0.35, d: 1.2 },
				{ v: -1.1, d: 0.75 },
				{ v: 2.4, d: -3.1 },
			]

			for (const x of samples) {
				const lhs = cosDualSeries({ v: 2 * x.v, d: 2 * x.d })
				const cosX = cosDualSeries(x)
				const cosSq = dualMul(cosX, cosX)
				const rhs = { v: 2 * cosSq.v - 1, d: 2 * cosSq.d }

				assertClose(lhs.v, rhs.v, 1e-13)
				assertClose(lhs.d, rhs.d, 1e-13)
			}
		})

		test('matches independent Maclaurin series expansion for moderate angles', () => {
			/**
			 * Independent power-series evaluation of cos(v) and -sin(v).
			 *
			 * @param {number} v
			 * @returns {{ cosV: number, negSinV: number }}
			 */
			function maclaurinCosAndNegSin(v) {
				let cosSum = 1
				let cosTerm = 1
				let sinSum = v
				let sinTerm = v
				for (let k = 1; k <= 20; k++) {
					cosTerm *= (-v * v) / ((2 * k - 1) * (2 * k))
					cosSum += cosTerm
					sinTerm *= (-v * v) / ((2 * k) * (2 * k + 1))
					sinSum += sinTerm
				}
				return { cosV: cosSum, negSinV: -sinSum }
			}

			for (const { v, d } of [
				{ v: -1.5, d: 2.1 },
				{ v: -0.25, d: -0.9 },
				{ v: 0.8, d: 1.4 },
				{ v: 1.9, d: -3.2 },
			]) {
				const { cosV, negSinV } = maclaurinCosAndNegSin(v)
				const res = cosDualSeries({ v, d })
				assertClose(res.v, cosV, 1e-14)
				assertClose(res.d, d * negSinV, 1e-14)
			}
		})
	})
})
