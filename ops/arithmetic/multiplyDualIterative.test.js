import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { multiplyDualIterative } from './multiplyDualIterative.js'

/**
 * Independent central finite difference approximation of f'(x).
 *
 * @param {(x: number) => number} fn
 * @param {number} x
 * @param {number} [h=1e-6]
 * @returns {number}
 */
function centralFiniteDiff(fn, x, h = 1e-6) {
	return (fn(x + h) - fn(x - h)) / (2 * h)
}

/**
 * Independent exact generalized product rule for an array of dual numbers:
 * V = ∏ v_i, D = ∑_k d_k ∏_{j ≠ k} v_j.
 *
 * @param {Array<{ v: number, d: number }>} duals
 * @returns {{ v: number, d: number }}
 */
function exactProductRule(duals) {
	let v = 1
	for (const factor of duals) {
		v *= factor.v
	}

	let d = 0
	for (let k = 0; k < duals.length; k += 1) {
		let term = duals[k].d
		for (let j = 0; j < duals.length; j += 1) {
			if (j !== k) {
				term *= duals[j].v
			}
		}
		d += term
	}

	return { v: v === 0 ? 0 : v, d: d === 0 ? 0 : d }
}

describe('multiplyDualIterative', () => {
	describe('normal cases', () => {
		test('multiplies two dual numbers using the product rule', () => {
			// (2 + 3ε)(4 + 5ε) = 8 + (3*4 + 2*5)ε = 8 + 22ε
			const result = multiplyDualIterative({ v: 2, d: 3 }, { v: 4, d: 5 })
			assert.deepStrictEqual(result, { v: 8, d: 22 })
		})

		test('multiplies three or more dual numbers iteratively', () => {
			// (2 + 1ε)(3 + 4ε)(5 + 6ε)
			// step 1: (6 + 11ε)
			// step 2: (30 + (11*5 + 6*6)ε) = (30 + 91ε)
			const result = multiplyDualIterative(
				{ v: 2, d: 1 },
				{ v: 3, d: 4 },
				{ v: 5, d: 6 }
			)
			assert.deepStrictEqual(result, { v: 30, d: 91 })

			// 4 factors with negative values and derivatives
			const four = multiplyDualIterative(
				{ v: -2, d: 1 },
				{ v: 3, d: -2 },
				{ v: -1, d: 4 },
				{ v: 5, d: -3 }
			)
			const expected = exactProductRule([
				{ v: -2, d: 1 },
				{ v: 3, d: -2 },
				{ v: -1, d: 4 },
				{ v: 5, d: -3 },
			])
			assert.deepStrictEqual(four, expected)
		})

		test('respects multiplicative identity { v: 1, d: 0 } and constants', () => {
			const a = { v: 7.5, d: -2.25 }
			assert.deepStrictEqual(multiplyDualIterative(a, { v: 1, d: 0 }), a)
			assert.deepStrictEqual(multiplyDualIterative({ v: 1, d: 0 }, a), a)

			// Multiplying by constant c = { v: 4, d: 0 } scales both v and d
			assert.deepStrictEqual(multiplyDualIterative({ v: 4, d: 0 }, a), {
				v: 30,
				d: -9,
			})
		})

		test('satisfies nilpotent property ε² = 0', () => {
			const epsA = { v: 0, d: 3 }
			const epsB = { v: 0, d: -7 }
			assert.deepStrictEqual(multiplyDualIterative(epsA, epsB), { v: 0, d: 0 })
		})

		test('does not mutate input dual objects', () => {
			const a = Object.freeze({ v: 3, d: 2 })
			const b = Object.freeze({ v: 5, d: -1 })
			const c = Object.freeze({ v: -4, d: 7 })
			const res = multiplyDualIterative(a, b, c)
			assert.deepStrictEqual(a, { v: 3, d: 2 })
			assert.deepStrictEqual(b, { v: 5, d: -1 })
			assert.deepStrictEqual(c, { v: -4, d: 7 })
			assert.deepStrictEqual(res, { v: -60, d: 77 })
		})
	})

	describe('algebraic properties and edge cases', () => {
		test('is commutative and associative', () => {
			const a = { v: 3, d: -2 }
			const b = { v: -5, d: 4 }
			const c = { v: 7, d: 1 }

			assert.deepStrictEqual(
				multiplyDualIterative(a, b),
				multiplyDualIterative(b, a)
			)

			const leftGrouped = multiplyDualIterative(multiplyDualIterative(a, b), c)
			const rightGrouped = multiplyDualIterative(a, multiplyDualIterative(b, c))
			const flat = multiplyDualIterative(a, b, c)
			assert.deepStrictEqual(leftGrouped, flat)
			assert.deepStrictEqual(rightGrouped, flat)
		})

		test('handles zero-valued factors accurately (simple and repeated roots)', () => {
			// f(x) = x(x - 1)(x - 2) at x = 1 -> f(1) = 0, f'(1) = 3(1)^2 - 6(1) + 2 = -1
			const atSimpleRoot = multiplyDualIterative(
				{ v: 1, d: 1 },
				{ v: 0, d: 1 },
				{ v: -1, d: 1 }
			)
			assert.deepStrictEqual(atSimpleRoot, { v: 0, d: -1 })

			// g(x) = (x - 1)^2 (x + 3) at x = 1 -> g(1) = 0, g'(1) = 0
			const atDoubleRoot = multiplyDualIterative(
				{ v: 0, d: 1 },
				{ v: 0, d: 1 },
				{ v: 4, d: 1 }
			)
			assert.deepStrictEqual(atDoubleRoot, { v: 0, d: 0 })
		})

		test('normalizes -0 to +0 in output components', () => {
			const res = multiplyDualIterative({ v: -2, d: 1 }, { v: 0, d: 0 })
			assert.ok(Object.is(res.v, 0))
			assert.ok(Object.is(res.d, 0))
		})
	})

	describe('cross-checks against analytic product rule and central finite differences', () => {
		test('matches power rule d/dx (x^n) = n * x^(n-1) for repeated factors', () => {
			for (const x of [-2.5, -1, 0, 0.75, 3.25]) {
				for (let n = 2; n <= 6; n += 1) {
					const factors = Array.from({ length: n }, () => ({ v: x, d: 1 }))
					const result = multiplyDualIterative(...factors)
					const expectedV = x ** n
					const expectedD = n * x ** (n - 1)
					assert.ok(
						Math.abs(result.v - expectedV) <= 1e-12 * Math.max(1, Math.abs(expectedV)),
						`x=${x}, n=${n}: expected v=${expectedV}, got ${result.v}`
					)
					assert.ok(
						Math.abs(result.d - expectedD) <= 1e-12 * Math.max(1, Math.abs(expectedD)),
						`x=${x}, n=${n}: expected d=${expectedD}, got ${result.d}`
					)
				}
			}
		})

		test('matches exact analytic product rule on factored polynomials and transcendental products', () => {
			// Factored polynomial P(x) = (2x - 1)(x + 3)(-0.5x + 4)(3x + 2)
			for (const x of [-3, -0.5, 0.5, 2.25, 8]) {
				const factors = [
					{ v: 2 * x - 1, d: 2 },
					{ v: x + 3, d: 1 },
					{ v: -0.5 * x + 4, d: -0.5 },
					{ v: 3 * x + 2, d: 3 },
				]
				const got = multiplyDualIterative(...factors)
				const expected = exactProductRule(factors)
				assert.ok(Math.abs(got.v - expected.v) <= 1e-12 * Math.max(1, Math.abs(expected.v)))
				assert.ok(Math.abs(got.d - expected.d) <= 1e-12 * Math.max(1, Math.abs(expected.d)))
			}

			// Transcendental product: f(x) = sin(x) * cos(x) * exp(x)
			// Analytic derivative: f'(x) = exp(x) * (cos(2x) + 0.5 * sin(2x))
			for (const x of [-1.7, -0.3, 0, 0.9, 2.1]) {
				const got = multiplyDualIterative(
					{ v: Math.sin(x), d: Math.cos(x) },
					{ v: Math.cos(x), d: -Math.sin(x) },
					{ v: Math.exp(x), d: Math.exp(x) }
				)
				const exactV = Math.sin(x) * Math.cos(x) * Math.exp(x)
				const exactD = Math.exp(x) * (Math.cos(2 * x) + 0.5 * Math.sin(2 * x))
				assert.ok(Math.abs(got.v - exactV) <= 1e-12 * Math.max(1, Math.abs(exactV)))
				assert.ok(Math.abs(got.d - exactD) <= 1e-12 * Math.max(1, Math.abs(exactD)))
			}
		})

		test('matches central finite differences on polynomial and transcendental products', () => {
			// Polynomial product: f(x) = (2x - 1)(x^2 + 3)(0.5x + 4)
			const polyFn = (x) => (2 * x - 1) * (x * x + 3) * (0.5 * x + 4)
			for (const x of [-2.4, -0.5, 0.5, 1.7, 3.3]) {
				const dual = multiplyDualIterative(
					{ v: 2 * x - 1, d: 2 },
					{ v: x * x + 3, d: 2 * x },
					{ v: 0.5 * x + 4, d: 0.5 }
				)
				const fd = centralFiniteDiff(polyFn, x)
				assert.ok(
					Math.abs(dual.v - polyFn(x)) <= 1e-12 * Math.max(1, Math.abs(polyFn(x))),
					`poly value mismatch at x=${x}`
				)
				assert.ok(
					Math.abs(dual.d - fd) <= 1e-7 * Math.max(1, Math.abs(dual.d)),
					`poly derivative mismatch at x=${x}: dual=${dual.d}, fd=${fd}`
				)
			}

			// Multi-factor nonlinear product: g(x) = exp(0.3x) * sin(x) * (x^2 + 1) * cos(0.7x)
			const nonlinearFn = (x) =>
				Math.exp(0.3 * x) * Math.sin(x) * (x * x + 1) * Math.cos(0.7 * x)
			for (const x of [-1.8, -0.4, 0, 1.1, 2.5]) {
				const dual = multiplyDualIterative(
					{ v: Math.exp(0.3 * x), d: 0.3 * Math.exp(0.3 * x) },
					{ v: Math.sin(x), d: Math.cos(x) },
					{ v: x * x + 1, d: 2 * x },
					{ v: Math.cos(0.7 * x), d: -0.7 * Math.sin(0.7 * x) }
				)
				const fd = centralFiniteDiff(nonlinearFn, x)
				assert.ok(
					Math.abs(dual.v - nonlinearFn(x)) <= 1e-12 * Math.max(1, Math.abs(nonlinearFn(x)))
				)
				assert.ok(
					Math.abs(dual.d - fd) <= 1e-7 * Math.max(1, Math.abs(dual.d)),
					`nonlinear derivative mismatch at x=${x}: dual=${dual.d}, fd=${fd}`
				)
			}

			// Product evaluated directly at a simple root x = 2: r(x) = (x - 2)(x + 5)(3x - 1)
			const rootFn = (x) => (x - 2) * (x + 5) * (3 * x - 1)
			const dualAtRoot = multiplyDualIterative(
				{ v: 0, d: 1 },
				{ v: 7, d: 1 },
				{ v: 5, d: 3 }
			)
			const fdAtRoot = centralFiniteDiff(rootFn, 2)
			assert.equal(dualAtRoot.v, 0)
			assert.equal(dualAtRoot.d, 35)
			assert.ok(Math.abs(dualAtRoot.d - fdAtRoot) <= 1e-7)
		})
	})

	describe('input validation and error handling', () => {
		test('throws RangeError when fewer than 2 dual numbers are supplied', () => {
			assert.throws(() => multiplyDualIterative(), RangeError)
			assert.throws(() => multiplyDualIterative({ v: 1, d: 1 }), RangeError)
		})

		test('throws TypeError for non-object or malformed dual arguments', () => {
			const valid = { v: 1, d: 0 }
			for (const bad of [null, undefined, 42, 'dual', true, [1, 2], () => {}]) {
				assert.throws(() => multiplyDualIterative(bad, valid), TypeError)
				assert.throws(() => multiplyDualIterative(valid, bad), TypeError)
			}

			assert.throws(() => multiplyDualIterative({ v: 1 }, valid), TypeError)
			assert.throws(() => multiplyDualIterative({ d: 1 }, valid), TypeError)
			assert.throws(() => multiplyDualIterative({ v: '1', d: 0 }, valid), TypeError)
			assert.throws(() => multiplyDualIterative({ v: 1, d: null }, valid), TypeError)
			assert.throws(() => multiplyDualIterative(valid, { v: 1, d: undefined }), TypeError)
		})

		test('throws RangeError for non-finite v or d components', () => {
			const valid = { v: 2, d: 1 }
			for (const badNum of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
				assert.throws(() => multiplyDualIterative({ v: badNum, d: 1 }, valid), RangeError)
				assert.throws(() => multiplyDualIterative({ v: 1, d: badNum }, valid), RangeError)
				assert.throws(() => multiplyDualIterative(valid, { v: badNum, d: 1 }), RangeError)
				assert.throws(() => multiplyDualIterative(valid, { v: 1, d: badNum }), RangeError)
			}
		})

		test('throws RangeError on finite IEEE-754 overflow', () => {
			// Value overflow
			assert.throws(
				() => multiplyDualIterative({ v: 1e200, d: 1 }, { v: 1e200, d: 1 }),
				RangeError
			)
			// Derivative overflow even when value stays finite
			assert.throws(
				() => multiplyDualIterative({ v: 1, d: 1e308 }, { v: 2, d: 0 }),
				RangeError
			)
		})

		test('validates all arguments before computing products', () => {
			assert.throws(
				() =>
					multiplyDualIterative(
						{ v: 1e200, d: 1 },
						{ v: 1e200, d: 1 },
						null
					),
				TypeError
			)
		})
	})
})
