import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { gradientBigIntMemo, SCALE, STENCIL_TABLE } from './gradientBigIntMemo.js'

describe('gradientBigIntMemo', () => {
	describe('exact polynomial gradients', () => {
		it('computes 1D linear and quadratic derivatives exactly', () => {
			const linear = ([x]) => 7n * x + 13n
			assert.deepEqual(gradientBigIntMemo(linear, [0n]), [7n * SCALE])
			assert.deepEqual(gradientBigIntMemo(linear, [-42n]), [7n * SCALE])

			const quadratic = ([x]) => 3n * x * x - 5n * x + 2n
			assert.deepEqual(gradientBigIntMemo(quadratic, [4n]), [19n * SCALE])
			assert.deepEqual(gradientBigIntMemo(quadratic, [-3n]), [-23n * SCALE])
		})

		it('computes multivariable 2D and 3D gradients exactly', () => {
			// f(x, y) = 3x^2*y + 2y^3 - 5x
			// ∂f/∂x = 6xy - 5, ∂f/∂y = 3x^2 + 6y^2
			const f2 = ([x, y]) => 3n * x * x * y + 2n * y * y * y - 5n * x
			assert.deepEqual(gradientBigIntMemo(f2, [2n, -3n]), [-41n * SCALE, 66n * SCALE])

			// f(x, y, z) = x^2*y*z + y^3 - 4z^2 + 7x
			// ∇f = (2xyz + 7, x^2*z + 3y^2, x^2*y - 8z)
			const f3 = ([x, y, z]) => x * x * y * z + y * y * y - 4n * z * z + 7n * x
			assert.deepEqual(gradientBigIntMemo(f3, [3n, -2n, 5n]), [
				-53n * SCALE,
				57n * SCALE,
				-58n * SCALE,
			])
		})

		it('is exact up to degree 2m for stencil orders 2, 4, 6, and 8', () => {
			// Degree 4: f(x, y) = x^4 - 3x^2*y^2 + 2y^4
			// ∇f = (4x^3 - 6x*y^2, -6x^2*y + 8y^3)
			const deg4 = ([x, y]) => x ** 4n - 3n * x * x * y * y + 2n * y ** 4n
			assert.deepEqual(gradientBigIntMemo(deg4, [3n, -2n], { order: 4 }), [
				(4n * 27n - 6n * 3n * 4n) * SCALE,
				(-6n * 9n * -2n + 8n * -8n) * SCALE,
			])

			// Degree 6: f(x) = x^6 - 5x^4 + 2x => f'(x) = 6x^5 - 20x^3 + 2
			const deg6 = ([x]) => x ** 6n - 5n * x ** 4n + 2n * x
			const x6 = 3n
			const expected6 = (6n * x6 ** 5n - 20n * x6 ** 3n + 2n) * SCALE
			assert.deepEqual(gradientBigIntMemo(deg6, [x6], { order: 6 }), [expected6])

			// Degree 8: f(x) = x^8 - 4x^5 + 3x^2 => f'(x) = 8x^7 - 20x^4 + 6x
			const deg8 = ([x]) => x ** 8n - 4n * x ** 5n + 3n * x * x
			const x8 = -2n
			const expected8 = (8n * x8 ** 7n - 20n * x8 ** 4n + 6n * x8) * SCALE
			assert.deepEqual(gradientBigIntMemo(deg8, [x8], { order: 8 }), [expected8])
		})
	})

	describe('fixed-point scaling and non-integer derivatives', () => {
		it('scales non-integer rational slopes by 10^18 with round-half-to-even', () => {
			// Piecewise / sampled values with exact rational difference quotients
			// Using order 2 with step = 3n: (f(3) - f(-3)) / (2 * 3) = (1 - (-1)) / 6 = 1/3
			const slopeOneThird = ([x]) => (x > 0n ? 1n : x < 0n ? -1n : 0n)
			assert.deepEqual(gradientBigIntMemo(slopeOneThird, [0n], { order: 2, step: 3n }), [
				333_333_333_333_333_333n,
			])

			// (f(3) - f(-3)) / 6 = (2 - (-2)) / 6 = 2/3 -> rounds up to ...667
			const slopeTwoThirds = ([x]) => (x > 0n ? 2n : x < 0n ? -2n : 0n)
			assert.deepEqual(gradientBigIntMemo(slopeTwoThirds, [0n], { order: 2, step: 3n }), [
				666_666_666_666_666_667n,
			])

			// Negative -2/3 -> rounds symmetrically to -...667
			const slopeNegTwoThirds = ([x]) => (x > 0n ? -2n : x < 0n ? 2n : 0n)
			assert.deepEqual(gradientBigIntMemo(slopeNegTwoThirds, [0n], { order: 2, step: 3n }), [
				-666_666_666_666_666_667n,
			])
		})

		it('applies exact round-half-to-even on exact half-way ties', () => {
			// With scale = 1n, order = 2, step = 1n:
			// (f(1) - f(-1)) / 2:
			// 1/2 -> 0 (even), 3/2 -> 2 (even), -1/2 -> 0 (even), -3/2 -> -2 (even)
			const half = ([x]) => (x === 1n ? 1n : 0n)
			const threeHalves = ([x]) => (x === 1n ? 3n : 0n)
			const negHalf = ([x]) => (x === 1n ? -1n : 0n)
			const negThreeHalves = ([x]) => (x === 1n ? -3n : 0n)

			assert.deepEqual(gradientBigIntMemo(half, [0n], { order: 2, step: 1n, scale: 1n }), [0n])
			assert.deepEqual(gradientBigIntMemo(threeHalves, [0n], { order: 2, step: 1n, scale: 1n }), [2n])
			assert.deepEqual(gradientBigIntMemo(negHalf, [0n], { order: 2, step: 1n, scale: 1n }), [0n])
			assert.deepEqual(gradientBigIntMemo(negThreeHalves, [0n], { order: 2, step: 1n, scale: 1n }), [
				-2n,
			])
		})

		it('handles uniformly 10^18-scaled fixed-point scalar fields seamlessly', () => {
			// f(x, y) = x^2 + x*y represented in 10^18 fixed-point:
			// F(X, Y) = (X*X + X*Y) / 10^18
			// At (x, y) = (1.5, -0.25), ∇f = (2x + y, x) = (2.75, 1.5)
			const fixedField = ([X, Y]) => (X * X + X * Y) / SCALE
			const point = [1_500_000_000_000_000_000n, -250_000_000_000_000_000n]
			const grad = gradientBigIntMemo(fixedField, point, { step: 10n ** 12n, order: 2 })
			assert.deepEqual(grad, [2_750_000_000_000_000_000n, 1_500_000_000_000_000_000n])
		})
	})

	describe('memoization and table-driven behavior', () => {
		it('memoizes repeated gradient calls and overlapping point evaluations', () => {
			let calls = 0
			const f = ([x, y]) => {
				calls++
				return x * x + y * y
			}

			// First call at (0, 0) with order 2 evaluates 4 points: (-1,0), (1,0), (0,-1), (0,1)
			const g1 = gradientBigIntMemo(f, [0n, 0n], { order: 2 })
			assert.deepEqual(g1, [0n, 0n])
			assert.equal(calls, 4)

			// Identical call hits gradient cache -> 0 additional evaluations
			const g2 = gradientBigIntMemo(f, [0n, 0n], { order: 2 })
			assert.deepEqual(g2, [0n, 0n])
			assert.equal(calls, 4)

			// Mutating returned array does not corrupt cached result
			g2[0] = 999n
			const g3 = gradientBigIntMemo(f, [0n, 0n], { order: 2 })
			assert.deepEqual(g3, [0n, 0n])
			assert.equal(calls, 4)

			// Adjacent point (2, 0) with order 2 needs (1,0), (3,0), (2,-1), (2,1).
			// (1,0) is already cached -> only 3 new evaluations instead of 4!
			const g4 = gradientBigIntMemo(f, [2n, 0n], { order: 2 })
			assert.deepEqual(g4, [4n * SCALE, 0n])
			assert.equal(calls, 7)
		})

		it('bypasses caches when memoize is false and isolates caches across options', () => {
			let calls = 0
			const f = ([x]) => {
				calls++
				return x * x * x
			}

			// Order 2 vs Order 4 at x=2, step=1 give different results for x^3:
			// order 2: 3*4 + 1 = 13; order 4: exact 12
			const gOrder2 = gradientBigIntMemo(f, [2n], { order: 2, step: 1n })
			assert.deepEqual(gOrder2, [13n * SCALE])
			const afterOrder2 = calls

			const gOrder4 = gradientBigIntMemo(f, [2n], { order: 4, step: 1n })
			assert.deepEqual(gOrder4, [12n * SCALE])
			// Order 4 reuses f(1) and f(3) from evalCache, only evaluating f(0) and f(4)
			assert.equal(calls - afterOrder2, 2)

			// With memoize: false, re-evaluates all 4 stencil points
			const beforeUnmemo = calls
			const gUnmemo = gradientBigIntMemo(f, [2n], { order: 4, step: 1n, memoize: false })
			assert.deepEqual(gUnmemo, [12n * SCALE])
			assert.equal(calls - beforeUnmemo, 4)
		})

		it('exposes frozen stencil table for orders 2, 4, 6, and 8', () => {
			assert.equal(Object.isFrozen(STENCIL_TABLE), true)
			for (const order of [2, 4, 6, 8]) {
				const entry = STENCIL_TABLE[order]
				assert.ok(entry)
				assert.equal(Object.isFrozen(entry), true)
				// Consistency invariant: Σ offset_k * weight_k === divisor
				const firstMoment = entry.terms.reduce((acc, t) => acc + t.offset * t.weight, 0n)
				assert.equal(firstMoment, entry.divisor)
			}
		})
	})

	describe('edge cases', () => {
		it('handles constant functions, zero point, and high-dimensional spaces', () => {
			const constant = () => 42n
			assert.deepEqual(gradientBigIntMemo(constant, [0n, 0n, 0n]), [0n, 0n, 0n])

			// 10D quadratic: f(x) = Σ (i + 1) * x_i^2 => ∂f/∂x_i = 2 * (i + 1) * x_i
			const dims = 10
			const f10 = (coords) => {
				let sum = 0n
				for (let i = 0; i < coords.length; i++) {
					sum += BigInt(i + 1) * coords[i] * coords[i]
				}
				return sum
			}
			const pt = Array.from({ length: dims }, (_, i) => BigInt(i - 5))
			const expected = pt.map((val, i) => 2n * BigInt(i + 1) * val * SCALE)
			assert.deepEqual(gradientBigIntMemo(f10, pt), expected)
		})

		it('preserves exact precision for huge BigInt coordinates beyond Number.MAX_SAFE_INTEGER', () => {
			const big = 10n ** 30n + 1234567890123456789n
			const f = ([x, y]) => x * x - 3n * x * y + 5n * y
			const grad = gradientBigIntMemo(f, [big, -big])
			assert.deepEqual(grad, [(2n * big - 3n * -big) * SCALE, (-3n * big + 5n) * SCALE])
		})

		it('defends against scalar functions that mutate their input array', () => {
			const mutatingFn = (coords) => {
				const val = coords[0] * 3n + coords[1] * 5n
				coords[0] = 999_999n
				coords[1] = -999_999n
				return val
			}
			const point = [10n, 20n]
			const grad = gradientBigIntMemo(mutatingFn, point)
			assert.deepEqual(grad, [3n * SCALE, 5n * SCALE])
			assert.deepEqual(point, [10n, 20n])
		})
	})

	describe('input validation', () => {
		const validFn = ([x]) => x * x

		it('rejects invalid fn, point, options, and non-BigInt function returns', () => {
			assert.throws(() => gradientBigIntMemo(null, [1n]), TypeError)
			assert.throws(() => gradientBigIntMemo('not-a-fn', [1n]), TypeError)

			assert.throws(() => gradientBigIntMemo(validFn, null), TypeError)
			assert.throws(() => gradientBigIntMemo(validFn, 123n), TypeError)
			assert.throws(() => gradientBigIntMemo(validFn, []), RangeError)
			assert.throws(() => gradientBigIntMemo(validFn, [1, 2n]), TypeError)
			assert.throws(() => gradientBigIntMemo(validFn, [1n, '2']), TypeError)

			assert.throws(() => gradientBigIntMemo(validFn, [1n], null), TypeError)
			assert.throws(() => gradientBigIntMemo(validFn, [1n], []), TypeError)
			assert.throws(() => gradientBigIntMemo(validFn, [1n], 'bad'), TypeError)

			assert.throws(() => gradientBigIntMemo(validFn, [1n], { step: 1 }), TypeError)
			assert.throws(() => gradientBigIntMemo(validFn, [1n], { step: 0n }), RangeError)
			assert.throws(() => gradientBigIntMemo(validFn, [1n], { step: -5n }), RangeError)

			assert.throws(() => gradientBigIntMemo(validFn, [1n], { order: '4' }), TypeError)
			assert.throws(() => gradientBigIntMemo(validFn, [1n], { order: 2.5 }), TypeError)
			assert.throws(() => gradientBigIntMemo(validFn, [1n], { order: 3 }), RangeError)
			assert.throws(() => gradientBigIntMemo(validFn, [1n], { order: 10 }), RangeError)

			assert.throws(() => gradientBigIntMemo(validFn, [1n], { scale: 1000 }), TypeError)
			assert.throws(() => gradientBigIntMemo(validFn, [1n], { scale: 0n }), RangeError)
			assert.throws(() => gradientBigIntMemo(validFn, [1n], { scale: -1n }), RangeError)

			assert.throws(() => gradientBigIntMemo(validFn, [1n], { memoize: 1 }), TypeError)

			const badReturn = () => 42
			assert.throws(() => gradientBigIntMemo(badReturn, [1n]), TypeError)
		})
	})

	describe('independent cross-checks', () => {
		it('matches analytical symbolic partial derivatives and directional derivative identity', () => {
			// f(x, y, z) = 2x^4 - 3x^2*y*z + 5y^3*z - 7x*z^3 + 11y - 13
			const f = ([x, y, z]) =>
				2n * x ** 4n - 3n * x * x * y * z + 5n * y ** 3n * z - 7n * x * z ** 3n + 11n * y - 13n

			const analyticalGrad = ([x, y, z]) => [
				(8n * x ** 3n - 6n * x * y * z - 7n * z ** 3n) * SCALE,
				(-3n * x * x * z + 15n * y * y * z + 11n) * SCALE,
				(-3n * x * x * y + 5n * y ** 3n - 21n * x * z * z) * SCALE,
			]

			const testPoints = [
				[0n, 0n, 0n],
				[1n, 2n, 3n],
				[-4n, 7n, -2n],
				[1000n, -500n, 250n],
				[10n ** 12n, -2n * 10n ** 12n, 3n * 10n ** 12n],
			]

			for (const pt of testPoints) {
				const grad = gradientBigIntMemo(f, pt, { order: 4, step: 3n })
				assert.deepEqual(grad, analyticalGrad(pt))

				// Independent directional derivative cross-check:
				// D_v f(p) = ∇f(p) · v === d/dt [ f(p + t*v) ] at t = 0
				const v = [2n, -3n, 5n]
				const dotGradV = grad[0] * v[0] + grad[1] * v[1] + grad[2] * v[2]
				const directional1D = ([t]) => f([pt[0] + t * v[0], pt[1] + t * v[1], pt[2] + t * v[2]])
				const [dirDeriv] = gradientBigIntMemo(directional1D, [0n], { order: 4, step: 2n })
				assert.equal(dotGradV, dirDeriv)
			}
		})

		it('matches independent Richardson extrapolation from order-2 central differences', () => {
			// For any function f and step h, Richardson extrapolation eliminates O(h^2):
			//   D_4(h) = (4 * D_2(h) - D_2(2h)) / 3
			const f = ([x, y]) => x ** 5n - 2n * x ** 3n * y + 4n * y ** 4n
			const pt = [7n, -5n]
			const h = 2n

			const gradOrder4 = gradientBigIntMemo(f, pt, { order: 4, step: h })

			// Independently compute exact rational D_2(h) and D_2(2h) and extrapolate
			const richardson = [0, 1].map((dim) => {
				const shift = (delta) => {
					const p = pt.slice()
					p[dim] += delta
					return f(p)
				}
				// D_2(h) = (f(x+h) - f(x-h)) / (2h)
				// D_2(2h) = (f(x+2h) - f(x-2h)) / (4h)
				// (4*D_2(h) - D_2(2h)) / 3 = (8*(f(x+h)-f(x-h)) - (f(x+2h)-f(x-2h))) / (12h)
				const num = 8n * (shift(h) - shift(-h)) - (shift(2n * h) - shift(-2n * h))
				const den = 12n * h
				return (num * SCALE) / den
			})

			assert.deepEqual(gradOrder4, richardson)
		})
	})
})
