import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { gradientBigIntRecursive } from './gradientBigIntRecursive.js'

const SCALE = 10n ** 18n

/**
 * Independent iterative central-difference reference implementation.
 */
function referenceGradientIterative(fn, point, step = 1n) {
	const out = []
	const denom = 2n * step
	const half = step
	for (let i = 0; i < point.length; i++) {
		const pPlus = point.slice()
		const pMinus = point.slice()
		pPlus[i] += step
		pMinus[i] -= step
		const num = (fn(pPlus) - fn(pMinus)) * SCALE
		out.push(num >= 0n ? (num + half) / denom : (num - half) / denom)
	}
	return out
}

describe('gradientBigIntRecursive', () => {
	it('returns zero vector for constant functions', () => {
		const f = () => 42n
		assert.deepStrictEqual(gradientBigIntRecursive(f, [0n, 5n, -10n]), [0n, 0n, 0n])
	})

	it('computes exact scaled gradient for linear functions', () => {
		const f = ([x, y, z]) => 3n * x - 7n * y + 11n * z + 19n
		assert.deepStrictEqual(gradientBigIntRecursive(f, [2n, -4n, 9n]), [
			3n * SCALE,
			-7n * SCALE,
			11n * SCALE,
		])
	})

	it('computes exact scaled gradient for multivariable quadratic functions at any step', () => {
		// f(x, y, z) = 2x^2 + 3xy - y^2 + 4z^2 - 5xz
		// grad f = (4x + 3y - 5z, 3x - 2y, 8z - 5x)
		const f = ([x, y, z]) => 2n * x * x + 3n * x * y - y * y + 4n * z * z - 5n * x * z
		const pt = [4n, -3n, 7n]
		const expected = [
			(4n * 4n + 3n * -3n - 5n * 7n) * SCALE,
			(3n * 4n - 2n * -3n) * SCALE,
			(8n * 7n - 5n * 4n) * SCALE,
		]

		assert.deepStrictEqual(gradientBigIntRecursive(f, pt, 1n), expected)
		assert.deepStrictEqual(gradientBigIntRecursive(f, pt, 5n), expected)
		assert.deepStrictEqual(gradientBigIntRecursive(f, pt, 1000n), expected)
	})

	it('handles non-integer partial derivatives with exact 10^18 fixed-point scaling and symmetric rounding', () => {
		// Step function: f(1) - f(-1) = 1 -> 1 / 2 = 0.5
		const halfStep = ([x, y]) => (x > 0n ? 1n : 0n) + (y > 0n ? 3n : 0n)
		assert.deepStrictEqual(gradientBigIntRecursive(halfStep, [0n, 0n], 1n), [
			500000000000000000n,
			1500000000000000000n,
		])

		// Repeating fraction: 1 / 6 = 0.166666666666666666... -> rounds to ...667
		const sixthPos = ([x]) => (x > 0n ? 1n : 0n)
		const sixthNeg = ([x]) => (x > 0n ? -1n : 0n)
		assert.deepStrictEqual(gradientBigIntRecursive(sixthPos, [0n], 3n), [166666666666666667n])
		assert.deepStrictEqual(gradientBigIntRecursive(sixthNeg, [0n], 3n), [-166666666666666667n])
	})

	it('works with 10^18 fixed-point scaled inputs and functions for higher-order polynomials', () => {
		// f(x, y) = x^3 + x*y in 10^18 fixed-point arithmetic
		// Analytical grad at (2, 3): (3*4 + 3, 2) = (15, 2)
		const f = ([x, y]) => (x * x * x) / (SCALE * SCALE) + (x * y) / SCALE
		const pt = [2n * SCALE, 3n * SCALE]
		const step = 10n ** 12n // 1e-6 in fixed-point
		const grad = gradientBigIntRecursive(f, pt, step)

		const diffX = grad[0] >= 15n * SCALE ? grad[0] - 15n * SCALE : 15n * SCALE - grad[0]
		const diffY = grad[1] >= 2n * SCALE ? grad[1] - 2n * SCALE : 2n * SCALE - grad[1]
		// O(h^2) truncation error is ~10^-12 => <= 10^7 ulps in 10^18 fixed-point
		assert.ok(diffX <= 10n ** 7n, `expected diffX <= 1e7, got ${diffX}`)
		assert.equal(diffY, 0n)
	})

	it('handles 1D functions and odd high-dimensional vectors cleanly', () => {
		const f1d = ([x]) => x * x - 4n * x + 1n
		assert.deepStrictEqual(gradientBigIntRecursive(f1d, [5n]), [6n * SCALE])

		// 65 dimensions (non-power-of-two) to exercise recursive divide-and-conquer splitting
		const n = 65
		const fHigh = (coords) => {
			let sum = 0n
			for (let i = 0; i < coords.length; i++) {
				const k = BigInt(i + 1)
				sum += k * coords[i] * coords[i]
			}
			return sum
		}
		const pt = Array.from({ length: n }, (_, i) => BigInt(i - 32))
		const expected = Array.from({ length: n }, (_, i) => 2n * BigInt(i + 1) * BigInt(i - 32) * SCALE)
		assert.deepStrictEqual(gradientBigIntRecursive(fHigh, pt), expected)
	})

	it('preserves exact precision for arbitrarily large BigInts beyond Number.MAX_SAFE_INTEGER', () => {
		const big = 10n ** 30n
		// f(x, y) = x^2 + 3*y
		const f = ([x, y]) => x * x + 3n * y
		const grad = gradientBigIntRecursive(f, [big, -big], 1n)
		assert.deepStrictEqual(grad, [2n * big * SCALE, 3n * SCALE])
	})

	it('does not mutate caller point and is resilient to fn mutating its argument', () => {
		const pt = [3n, 4n]
		const mutatingFn = (coords) => {
			const val = coords[0] * coords[0] + coords[1] * coords[1]
			coords[0] = 999999n
			coords[1] = -999999n
			return val
		}
		const grad = gradientBigIntRecursive(mutatingFn, pt)
		assert.deepStrictEqual(grad, [6n * SCALE, 8n * SCALE])
		assert.deepStrictEqual(pt, [3n, 4n])
	})

	it('throws TypeError or RangeError on invalid inputs', () => {
		const validFn = ([x]) => x

		assert.throws(() => gradientBigIntRecursive(null, [1n]), TypeError)
		assert.throws(() => gradientBigIntRecursive('not-a-fn', [1n]), TypeError)
		assert.throws(() => gradientBigIntRecursive(validFn, null), TypeError)
		assert.throws(() => gradientBigIntRecursive(validFn, 1n), TypeError)
		assert.throws(() => gradientBigIntRecursive(validFn, []), RangeError)
		assert.throws(() => gradientBigIntRecursive(validFn, [1n, 2]), TypeError)
		assert.throws(() => gradientBigIntRecursive(validFn, [1n, '2']), TypeError)
		assert.throws(() => gradientBigIntRecursive(validFn, new Array(2)), TypeError)
		assert.throws(() => gradientBigIntRecursive(validFn, [1n], 1), TypeError)
		assert.throws(() => gradientBigIntRecursive(validFn, [1n], '1'), TypeError)
		assert.throws(() => gradientBigIntRecursive(validFn, [1n], 0n), RangeError)
		assert.throws(() => gradientBigIntRecursive(validFn, [1n], -3n), RangeError)
		assert.throws(() => gradientBigIntRecursive(() => 42, [1n]), TypeError)
		assert.throws(() => gradientBigIntRecursive(() => undefined, [1n]), TypeError)
	})

	it('cross-checks against independent iterative reference and directional derivative identity', () => {
		const f = ([a, b, c, d, e]) =>
			a * a - 3n * a * b + 2n * b * c + 5n * c * c - 4n * d * e + 7n * e * e + a - 2n * d
		const pt = [7n, -5n, 3n, 11n, -2n]

		// Cross-check 1: exact match against independent iterative implementation
		for (const step of [1n, 2n, 7n]) {
			assert.deepStrictEqual(
				gradientBigIntRecursive(f, pt, step),
				referenceGradientIterative(f, pt, step),
			)
		}

		// Cross-check 2: directional derivative identity grad(f)(x) . v = (f(x + v) - f(x - v)) / 2
		// Exact for quadratic forms
		const v = [2n, -3n, 5n, -1n, 4n]
		const grad = gradientBigIntRecursive(f, pt, 1n)
		const dotScaled = grad.reduce((acc, g, i) => acc + g * v[i], 0n)
		const fPlus = f(pt.map((x, i) => x + v[i]))
		const fMinus = f(pt.map((x, i) => x - v[i]))
		const directionalScaled = ((fPlus - fMinus) * SCALE) / 2n
		assert.equal(dotScaled, directionalScaled)

		// Cross-check 3: agrees with floating-point analytical gradient on moderate values
		const expectedFloat = [
			2 * 7 - 3 * -5 + 1,
			-3 * 7 + 2 * 3,
			2 * -5 + 10 * 3,
			-4 * -2 - 2,
			-4 * 11 + 14 * -2,
		]
		for (let i = 0; i < grad.length; i++) {
			assert.equal(Number(grad[i]) / 1e18, expectedFloat[i])
		}
	})
})
