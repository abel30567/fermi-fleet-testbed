import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { derivativeBigIntSeries } from './derivativeBigIntSeries.js'

/**
 * Helper: multiply two polynomials represented in ascending-power BigInt form.
 */
function polyMul(a, b) {
	const out = new Array(a.length + b.length - 1).fill(0n)
	for (let i = 0; i < a.length; i++) {
		for (let j = 0; j < b.length; j++) {
			out[i + j] += a[i] * b[j]
		}
	}
	while (out.length > 1 && out[out.length - 1] === 0n) out.pop()
	return out
}

/**
 * Helper: add two polynomials represented in ascending-power BigInt form.
 */
function polyAdd(a, b) {
	const len = Math.max(a.length, b.length)
	const out = new Array(len).fill(0n)
	for (let i = 0; i < len; i++) {
		out[i] = (a[i] ?? 0n) + (b[i] ?? 0n)
	}
	while (out.length > 1 && out[out.length - 1] === 0n) out.pop()
	return out
}

/**
 * Helper: evaluate polynomial with integer BigInt coefficients at a
 * fixed-point BigInt input `xScaled = x * scale` using exact scaled arithmetic.
 * Returns P(x) * scale rounded toward zero.
 */
function evalPolyFixedPoint(coeffs, xScaled, scale) {
	let acc = 0n
	for (let i = coeffs.length - 1; i >= 0; i--) {
		acc = (acc * xScaled) / scale + coeffs[i] * scale
	}
	return acc
}

describe('derivativeBigIntSeries', () => {
	describe('normal cases', () => {
		test('linear polynomial derivative (coefficients and evaluation)', () => {
			// P(x) = 5 + 3x  =>  P'(x) = 3
			assert.deepEqual(derivativeBigIntSeries([5n, 3n]), [3n])
			assert.equal(derivativeBigIntSeries([5n, 3n], 0n), 3n)
			assert.equal(derivativeBigIntSeries([5n, 3n], 100n), 3n)
			assert.equal(derivativeBigIntSeries([5n, 3n], -42n), 3n)
		})

		test('quadratic polynomial derivative (coefficients and evaluation)', () => {
			// P(x) = 7 - 4x + 6x^2  =>  P'(x) = -4 + 12x
			assert.deepEqual(derivativeBigIntSeries([7n, -4n, 6n]), [-4n, 12n])
			assert.equal(derivativeBigIntSeries([7n, -4n, 6n], 0n), -4n)
			assert.equal(derivativeBigIntSeries([7n, -4n, 6n], 5n), 56n)
			assert.equal(derivativeBigIntSeries([7n, -4n, 6n], -3n), -40n)
		})

		test('cubic polynomial derivative (coefficients and evaluation)', () => {
			// P(x) = 1 + 2x + 3x^2 + 4x^3  =>  P'(x) = 2 + 6x + 12x^2
			assert.deepEqual(derivativeBigIntSeries([1n, 2n, 3n, 4n]), [2n, 6n, 12n])
			assert.equal(derivativeBigIntSeries([1n, 2n, 3n, 4n], 0n), 2n)
			assert.equal(derivativeBigIntSeries([1n, 2n, 3n, 4n], 2n), 62n)
			assert.equal(derivativeBigIntSeries([1n, 2n, 3n, 4n], -2n), 38n)
		})

		test('higher-order derivatives', () => {
			// P(x) = 1 + 2x + 3x^2 + 4x^3 + 5x^4
			const p = [1n, 2n, 3n, 4n, 5n]
			// P'(x)   = 2 + 6x + 12x^2 + 20x^3
			assert.deepEqual(derivativeBigIntSeries(p, undefined, 1), [2n, 6n, 12n, 20n])
			// P''(x)  = 6 + 24x + 60x^2
			assert.deepEqual(derivativeBigIntSeries(p, undefined, 2), [6n, 24n, 60n])
			// P'''(x) = 24 + 120x
			assert.deepEqual(derivativeBigIntSeries(p, undefined, 3), [24n, 120n])
			// P^(4)(x)= 120
			assert.deepEqual(derivativeBigIntSeries(p, undefined, 4), [120n])

			// Evaluated at x = 3n
			assert.equal(derivativeBigIntSeries(p, 3n, 2), 6n + 24n * 3n + 60n * 9n)
			assert.equal(derivativeBigIntSeries(p, 3n, 3), 24n + 120n * 3n)
			assert.equal(derivativeBigIntSeries(p, 3n, 4), 120n)
		})

		test('repeated first-order differentiation matches closed-form higher-order', () => {
			const p = [9n, -3n, 0n, 7n, -2n, 11n, 4n]
			let iterated = p
			for (let m = 1; m <= 7; m++) {
				iterated = derivativeBigIntSeries(iterated, undefined, 1)
				assert.deepEqual(derivativeBigIntSeries(p, undefined, m), iterated)
				assert.equal(
					derivativeBigIntSeries(p, -5n, m),
					derivativeBigIntSeries(iterated, -5n, 0),
				)
			}
		})
	})

	describe('edge cases', () => {
		test('constant polynomial returns [0n] or 0n', () => {
			assert.deepEqual(derivativeBigIntSeries([42n]), [0n])
			assert.deepEqual(derivativeBigIntSeries([-999n]), [0n])
			assert.equal(derivativeBigIntSeries([42n], 7n), 0n)
			assert.equal(derivativeBigIntSeries([42n], 0n), 0n)
		})

		test('empty and zero polynomials', () => {
			assert.deepEqual(derivativeBigIntSeries([]), [0n])
			assert.equal(derivativeBigIntSeries([], 5n), 0n)
			assert.deepEqual(derivativeBigIntSeries([], undefined, 0), [0n])
			assert.equal(derivativeBigIntSeries([], 5n, 0), 0n)

			assert.deepEqual(derivativeBigIntSeries([0n]), [0n])
			assert.deepEqual(derivativeBigIntSeries([0n, 0n, 0n]), [0n])
			assert.equal(derivativeBigIntSeries([0n, 0n, 0n], 123n), 0n)
			assert.deepEqual(derivativeBigIntSeries([0n, 0n, 0n], undefined, 0), [0n])
		})

		test('trailing zeros are normalized', () => {
			assert.deepEqual(derivativeBigIntSeries([5n, 3n, 0n, 0n]), [3n])
			assert.deepEqual(derivativeBigIntSeries([5n, 0n, 0n]), [0n])
			assert.deepEqual(derivativeBigIntSeries([5n, 3n, 0n], undefined, 0), [5n, 3n])
		})

		test('order 0 returns a fresh copy of normalized coefficients or evaluates P(x)', () => {
			const input = [2n, -3n, 5n]
			const res = derivativeBigIntSeries(input, undefined, 0)
			assert.deepEqual(res, [2n, -3n, 5n])
			assert.notEqual(res, input)
			assert.equal(derivativeBigIntSeries(input, 4n, 0), 2n - 12n + 80n)
		})

		test('order greater than degree returns [0n] or 0n immediately', () => {
			const p = [1n, 2n, 3n]
			assert.deepEqual(derivativeBigIntSeries(p, undefined, 3), [0n])
			assert.equal(derivativeBigIntSeries(p, 10n, 3), 0n)
			// Very large order should short-circuit without computing huge factorials
			assert.deepEqual(derivativeBigIntSeries(p, undefined, 1_000_000), [0n])
			assert.equal(derivativeBigIntSeries(p, 10n, 1_000_000), 0n)
		})

		test('huge BigInt coefficients and huge evaluation points remain exact', () => {
			const big = 10n ** 60n
			const coeffs = [big + 1n, big + 2n, big + 3n, big + 4n]
			const d1 = derivativeBigIntSeries(coeffs)
			assert.deepEqual(d1, [big + 2n, 2n * (big + 3n), 3n * (big + 4n)])

			const x = 10n ** 30n
			const expected =
				(big + 2n) +
				2n * (big + 3n) * x +
				3n * (big + 4n) * x * x
			assert.equal(derivativeBigIntSeries(coeffs, x), expected)

			// 3rd derivative of c3 * x^3 is 6 * c3
			assert.deepEqual(derivativeBigIntSeries(coeffs, undefined, 3), [6n * (big + 4n)])
		})
	})

	describe('invalid inputs', () => {
		test('rejects non-array coeffs', () => {
			for (const bad of [null, undefined, 123, 123n, '123', {}, { 0: 1n }]) {
				assert.throws(() => derivativeBigIntSeries(bad), TypeError)
			}
		})

		test('rejects non-BigInt elements and sparse arrays', () => {
			assert.throws(() => derivativeBigIntSeries([1, 2, 3]), TypeError)
			assert.throws(() => derivativeBigIntSeries([1n, 2, 3n]), TypeError)
			assert.throws(() => derivativeBigIntSeries([1n, '2', 3n]), TypeError)
			assert.throws(() => derivativeBigIntSeries([1n, null, 3n]), TypeError)
			assert.throws(() => derivativeBigIntSeries([1n, undefined, 3n]), TypeError)
			// eslint-disable-next-line no-sparse-arrays
			const sparse = [1n, , 3n]
			assert.throws(() => derivativeBigIntSeries(sparse), TypeError)
		})

		test('rejects invalid x values', () => {
			for (const badX of [null, 0, 1, 1.5, NaN, '1', true, {}, []]) {
				assert.throws(() => derivativeBigIntSeries([1n, 2n], badX), TypeError)
			}
		})

		test('rejects invalid order values', () => {
			for (const badType of [null, '1', 1n, true, {}, []]) {
				assert.throws(() => derivativeBigIntSeries([1n, 2n], undefined, badType), TypeError)
			}
			for (const badRange of [-1, -100, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
				assert.throws(() => derivativeBigIntSeries([1n, 2n], undefined, badRange), RangeError)
			}
		})
	})

	describe('independent mathematical cross-checks', () => {
		test('product rule: (f * g)\' = f\' * g + f * g\'', () => {
			const f = [3n, -5n, 2n, 7n, -1n]
			const g = [-4n, 6n, 0n, 9n]

			const fg = polyMul(f, g)
			const lhsCoeffs = derivativeBigIntSeries(fg)

			const df = derivativeBigIntSeries(f)
			const dg = derivativeBigIntSeries(g)
			const rhsCoeffs = polyAdd(polyMul(df, g), polyMul(f, dg))

			assert.deepEqual(lhsCoeffs, rhsCoeffs)

			for (const x of [-1000n, -7n, 0n, 1n, 13n, 10n ** 18n]) {
				const lhsVal = derivativeBigIntSeries(fg, x)
				const fVal = derivativeBigIntSeries(f, x, 0)
				const gVal = derivativeBigIntSeries(g, x, 0)
				const dfVal = derivativeBigIntSeries(f, x, 1)
				const dgVal = derivativeBigIntSeries(g, x, 1)
				assert.equal(lhsVal, dfVal * gVal + fVal * dgVal)
			}
		})

		test('general Leibniz rule for 3rd derivative of a product', () => {
			const f = [2n, -1n, 4n, 3n, -5n]
			const g = [7n, 3n, -2n, 5n]
			const fg = polyMul(f, g)

			// (f*g)''' = f'''g + 3 f''g' + 3 f'g'' + fg'''
			const binom = [1n, 3n, 3n, 1n]
			for (const x of [-9n, 0n, 4n, 25n]) {
				let leibniz = 0n
				for (let k = 0; k <= 3; k++) {
					const fk = derivativeBigIntSeries(f, x, k)
					const gmk = derivativeBigIntSeries(g, x, 3 - k)
					leibniz += binom[k] * fk * gmk
				}
				assert.equal(derivativeBigIntSeries(fg, x, 3), leibniz)
			}
		})

		test('finite-difference limit check over 10^18-scaled fixed-point BigInt', () => {
			const SCALE = 10n ** 18n

			// 1. For any quadratic, central difference (P(x+h) - P(x-h)) / (2h) is exact.
			const quad = [11n, -7n, 5n]
			const xQuad = 13n
			const hExact = 10n ** 12n // h = 10^-6 in 10^18 fixed-point
			const pPlus = evalPolyFixedPoint(quad, xQuad * SCALE + hExact, SCALE)
			const pMinus = evalPolyFixedPoint(quad, xQuad * SCALE - hExact, SCALE)
			const centralQuad = ((pPlus - pMinus) * SCALE) / (2n * hExact)
			assert.equal(centralQuad, derivativeBigIntSeries(quad, xQuad) * SCALE)

			// 2. For a degree-5 polynomial, central difference converges quadratically O(h^2)
			//    to the exact scaled derivative P'(x) * 10^18 as h shrinks.
			const poly = [3n, -2n, 5n, -4n, 2n, 1n]
			const x = 7n
			const exactScaled = derivativeBigIntSeries(poly, x) * SCALE

			// Evaluate using high internal scale (10^36) so fixed-point truncation does not
			// mask O(h^2) convergence, then convert back to 10^18 fixed-point scale.
			const HI_SCALE = 10n ** 36n
			const steps = [10n ** 33n, 10n ** 31n, 10n ** 29n] // h = 10^-3, 10^-5, 10^-7
			const errors = steps.map((h) => {
				const fp = evalPolyFixedPoint(poly, x * HI_SCALE + h, HI_SCALE)
				const fm = evalPolyFixedPoint(poly, x * HI_SCALE - h, HI_SCALE)
				const approxScaled18 = ((fp - fm) * SCALE) / (2n * h)
				const diff = approxScaled18 - exactScaled
				return diff < 0n ? -diff : diff
			})

			// Each 100x reduction in h should reduce error by ~10000x (strictly decreasing).
			assert.ok(errors[0] > errors[1] && errors[1] > errors[2])
			// At h = 10^-7, relative error should be well below 10^-10 in 10^18 scale.
			assert.ok(errors[2] < 10n ** 8n)
		})
	})
})
