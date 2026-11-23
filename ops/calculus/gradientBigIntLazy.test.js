import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
	gradientBigIntLazy,
	SCALE,
	DEFAULT_STEP,
} from './gradientBigIntLazy.js'

/** Helper: convert integer or decimal numerator/denominator to fixed-point BigInt (10^18). */
const fp = (num, den = 1n) => (BigInt(num) * SCALE) / BigInt(den)

/** Helper: fixed-point multiplication (a * b) / SCALE. */
const mul = (a, b) => (a * b) / SCALE

/** Helper: absolute value for BigInt. */
const absBigInt = (x) => (x < 0n ? -x : x)

/** Helper: assert two BigInt values are within a given tolerance. */
function assertApproxEqual(actual, expected, tolerance, message) {
	const diff = absBigInt(actual - expected)
	assert.ok(
		diff <= tolerance,
		`${message ? `${message}: ` : ''}expected ${actual} to be within ${tolerance} of ${expected} (diff=${diff})`,
	)
}

describe('gradientBigIntLazy', () => {
	describe('normal cases: 1D, 2D, and 3D scalar fields', () => {
		test('1D linear function f(x) = 5x + 7', () => {
			const f = ([x]) => 5n * x + fp(7)
			const grad = [...gradientBigIntLazy(f, [fp(3)])]
			assert.deepEqual(grad, [fp(5)])
		})

		test('1D quadratic function f(x) = 3x^2 - 4x + 1', () => {
			const f = ([x]) => 3n * mul(x, x) - 4n * x + fp(1)
			const x0 = fp(7, 2) // 3.5
			// f'(x) = 6x - 4 => 6*(3.5) - 4 = 17
			const grad = [...gradientBigIntLazy(f, [x0])]
			assert.equal(grad.length, 1)
			assertApproxEqual(grad[0], fp(17), 10n ** 6n, '1D quadratic derivative')
		})

		test('1D non-integer derivative f(x) = (1/3)x and f(x) = (2/3)x', () => {
			// Exact integer scaling with custom step h = 3n -> exact rational derivative
			const fOneThird = ([x]) => x / 3n
			const [g1] = [...gradientBigIntLazy(fOneThird, [9n], 3n)]
			// (4 - 2) * 10^18 / 6 = 1/3 * 10^18 -> rounds to 333333333333333333n
			assert.equal(g1, 333_333_333_333_333_333n)

			const fTwoThirds = ([x]) => (2n * x) / 3n
			const [g2] = [...gradientBigIntLazy(fTwoThirds, [9n], 3n)]
			// (8 - 4) * 10^18 / 6 = 2/3 * 10^18 -> round-half-to-even gives 666666666666666667n
			assert.equal(g2, 666_666_666_666_666_667n)
		})

		test('2D quadratic scalar field f(x, y) = x^2 + 2xy + 3y^2', () => {
			const f = ([x, y]) => mul(x, x) + 2n * mul(x, y) + 3n * mul(y, y)
			const point = [fp(2), fp(5)]
			// Analytical: df/dx = 2x + 2y = 14, df/dy = 2x + 6y = 34
			const grad = [...gradientBigIntLazy(f, point)]
			assert.equal(grad.length, 2)
			assertApproxEqual(grad[0], fp(14), 10n ** 6n, 'df/dx')
			assertApproxEqual(grad[1], fp(34), 10n ** 6n, 'df/dy')
		})

		test('3D cubic polynomial field f(x, y, z) = x^3 - 2x*y^2 + 3y*z + z^2', () => {
			const f = ([x, y, z]) =>
				mul(mul(x, x), x) -
				2n * mul(x, mul(y, y)) +
				3n * mul(y, z) +
				mul(z, z)

			// Point: (1.5, 2.0, 0.5)
			const x = fp(3, 2)
			const y = fp(2)
			const z = fp(1, 2)

			// Analytical:
			// df/dx = 3x^2 - 2y^2 = 3*(2.25) - 2*(4) = 6.75 - 8 = -1.25
			// df/dy = -4xy + 3z   = -4*(1.5)*(2) + 3*(0.5) = -12 + 1.5 = -10.5
			// df/dz = 3y + 2z     = 3*(2) + 2*(0.5) = 6 + 1 = 7
			const expected = [fp(-5, 4), fp(-21, 2), fp(7)]
			const grad = [...gradientBigIntLazy(f, [x, y, z])]

			assert.equal(grad.length, 3)
			for (let i = 0; i < 3; i++) {
				assertApproxEqual(
					grad[i],
					expected[i],
					10n ** 7n,
					`3D cubic partial index ${i}`,
				)
			}
		})

		test('supports arbitrary-precision BigInt coordinates beyond Number.MAX_SAFE_INTEGER', () => {
			// Linear field with huge coordinates (~10^25 in real units, 10^43 in fixed-point)
			const bigCoord = 10n ** 25n * SCALE
			const f = ([x, y]) => 7n * x - 11n * y + 12345678901234567890123456789n
			const grad = [...gradientBigIntLazy(f, [bigCoord, -bigCoord])]
			assert.deepEqual(grad, [fp(7), fp(-11)])
		})
	})

	describe('edge cases', () => {
		test('constant function yields 0n for every coordinate', () => {
			const f = () => fp(42)
			const grad = [...gradientBigIntLazy(f, [fp(1), fp(-2), fp(100), 0n])]
			assert.deepEqual(grad, [0n, 0n, 0n, 0n])
		})

		test('negative coordinates yield exact signs and values', () => {
			// f(x, y, z) = x^2 - 3xy + y^2 - 4z
			// df/dx = 2x - 3y, df/dy = -3x + 2y, df/dz = -4
			const f = ([x, y, z]) =>
				mul(x, x) - 3n * mul(x, y) + mul(y, y) - 4n * z
			const point = [fp(-3), fp(-5), fp(-7)]
			// df/dx = -6 - (-15) = 9
			// df/dy = 9 + (-10) = -1
			// df/dz = -4
			const grad = [...gradientBigIntLazy(f, point)]
			assert.equal(grad.length, 3)
			assertApproxEqual(grad[0], fp(9), 10n ** 6n, 'df/dx at negative coords')
			assertApproxEqual(grad[1], fp(-1), 10n ** 6n, 'df/dy at negative coords')
			assert.equal(grad[2], fp(-4))
		})

		test('custom step size h works and respects banker rounding on ties', () => {
			// f(x) = x, h = 2n -> (f(x+2) - f(x-2)) * 10^18 / 4 = 10^18
			const [g] = [...gradientBigIntLazy(([x]) => x, [10n], 2n)]
			assert.equal(g, SCALE)

			// Tie case: (f(x+h) - f(x-h)) = 1n, h = 10n ** 18n => numerator = 10^18, 2h = 2*10^18 => 0.5 -> rounds to 0n (even)
			const [gTieEven] = [
				...gradientBigIntLazy(([x]) => (x > 0n ? 1n : 0n), [0n], SCALE),
			]
			assert.equal(gTieEven, 0n)

			// Tie case: 3/2 = 1.5 -> rounds to 2n (even)
			const [gTieOdd] = [
				...gradientBigIntLazy(([x]) => (x > 0n ? 3n : 0n), [0n], SCALE),
			]
			assert.equal(gTieOdd, 2n)
		})

		test('accepts non-array iterables (generator, Set, BigInt64Array)', () => {
			const f = ([x, y, z]) => 2n * x + 3n * y + 5n * z

			function* pointGen() {
				yield fp(1)
				yield fp(2)
				yield fp(3)
			}
			assert.deepEqual([...gradientBigIntLazy(f, pointGen())], [
				fp(2),
				fp(3),
				fp(5),
			])

			const pointSet = new Set([fp(1), fp(2), fp(3)])
			assert.deepEqual([...gradientBigIntLazy(f, pointSet)], [
				fp(2),
				fp(3),
				fp(5),
			])

			const typed = new BigInt64Array([10n, 20n, 30n])
			assert.deepEqual([...gradientBigIntLazy(f, typed, 1n)], [
				fp(2),
				fp(3),
				fp(5),
			])
		})

		test('mutating input array inside f does not corrupt subsequent partials', () => {
			const f = (coords) => {
				const val = 2n * coords[0] + 5n * coords[1] + 9n * coords[2]
				// Adversarially mutate the array received by f
				coords[0] = 999999999n
				coords[1] = -999999999n
				coords[2] = 0n
				return val
			}
			const grad = [...gradientBigIntLazy(f, [fp(1), fp(2), fp(3)])]
			assert.deepEqual(grad, [fp(2), fp(5), fp(9)])
		})

		test('lazy generator consumption: defers iterable consumption and computes partials on demand', () => {
			let pointYielded = 0
			let fCalls = 0

			function* lazyPoint() {
				for (let i = 1n; i <= 10n; i++) {
					pointYielded++
					yield i * SCALE
				}
			}

			// f(x_0, ..., x_9) = sum((i + 1) * x_i) => partial i = (i + 1) * SCALE
			const f = (coords) => {
				fCalls++
				let sum = 0n
				for (let i = 0; i < coords.length; i++) {
					sum += BigInt(i + 1) * coords[i]
				}
				return sum
			}

			const gen = gradientBigIntLazy(f, lazyPoint())

			// Nothing consumed or evaluated before first .next()
			assert.equal(pointYielded, 0)
			assert.equal(fCalls, 0)

			// First pull computes only partial 0 (2 calls to f)
			const r0 = gen.next()
			assert.equal(r0.done, false)
			assert.equal(r0.value, fp(1))
			assert.equal(pointYielded, 10)
			assert.equal(fCalls, 2)

			// Second pull computes only partial 1 (2 more calls to f)
			const r1 = gen.next()
			assert.equal(r1.done, false)
			assert.equal(r1.value, fp(2))
			assert.equal(fCalls, 4)

			// Third pull computes only partial 2 (2 more calls to f)
			const r2 = gen.next()
			assert.equal(r2.done, false)
			assert.equal(r2.value, fp(3))
			assert.equal(fCalls, 6)

			// Early termination via return(): remaining 7 partials are never evaluated
			const closed = gen.return()
			assert.equal(closed.done, true)
			assert.equal(fCalls, 6)
		})

		test('invalid inputs throw descriptive errors', () => {
			const dummy = ([x]) => x

			// Invalid f
			assert.throws(() => gradientBigIntLazy(null, [1n]), TypeError)
			assert.throws(() => gradientBigIntLazy(123, [1n]), TypeError)
			assert.throws(() => gradientBigIntLazy('not a fn', [1n]), TypeError)

			// Invalid point (non-iterable, null, undefined, string)
			assert.throws(() => gradientBigIntLazy(dummy, null), TypeError)
			assert.throws(() => gradientBigIntLazy(dummy, undefined), TypeError)
			assert.throws(() => gradientBigIntLazy(dummy, 42n), TypeError)
			assert.throws(() => gradientBigIntLazy(dummy, '123'), TypeError)
			assert.throws(() => gradientBigIntLazy(dummy, {}), TypeError)

			// Empty point throws (both Array and lazy empty generator)
			assert.throws(() => gradientBigIntLazy(dummy, []), RangeError)
			assert.throws(
				() => [...gradientBigIntLazy(dummy, (function* () {})())],
				RangeError,
			)

			// Non-BigInt coordinates in Array and in generator
			assert.throws(() => gradientBigIntLazy(dummy, [1, 2]), TypeError)
			assert.throws(() => gradientBigIntLazy(dummy, [1n, '2']), TypeError)
			assert.throws(
				() =>
					[
						...gradientBigIntLazy(
							dummy,
							(function* () {
								yield 1n
								yield 2
							})(),
						),
					],
				TypeError,
			)

			// Invalid step h
			assert.throws(() => gradientBigIntLazy(dummy, [1n], 0n), RangeError)
			assert.throws(() => gradientBigIntLazy(dummy, [1n], -5n), RangeError)
			assert.throws(() => gradientBigIntLazy(dummy, [1n], 1), TypeError)
			assert.throws(() => gradientBigIntLazy(dummy, [1n], '1'), TypeError)
			assert.throws(() => gradientBigIntLazy(dummy, [1n], null), TypeError)

			// f returning non-BigInt throws during iteration
			assert.throws(() => [...gradientBigIntLazy(() => 42, [1n])], TypeError)
			assert.throws(
				() => [...gradientBigIntLazy(() => undefined, [1n])],
				TypeError,
			)
		})
	})

	describe('independent cross-checks', () => {
		test('directional derivative identity: ∇f(x) · v ≈ (f(x + hv) - f(x - hv)) / (2h) and matches analytical gradient', () => {
			// Non-trivial 3D polynomial:
			// f(x, y, z) = 2x^3 - 3x*y^2 + x*y*z - 4y^3 + 5z^2 - 7x + 11
			const f = ([x, y, z]) =>
				2n * mul(mul(x, x), x) -
				3n * mul(x, mul(y, y)) +
				mul(mul(x, y), z) -
				4n * mul(mul(y, y), y) +
				5n * mul(z, z) -
				7n * x +
				fp(11)

			// Analytical gradient:
			// df/dx = 6x^2 - 3y^2 + yz - 7
			// df/dy = -6xy + xz - 12y^2
			// df/dz = xy + 10z
			const analyticalGrad = ([x, y, z]) => [
				6n * mul(x, x) - 3n * mul(y, y) + mul(y, z) - fp(7),
				-6n * mul(x, y) + mul(x, z) - 12n * mul(y, y),
				mul(x, y) + 10n * z,
			]

			const point = [fp(3, 2), fp(-5, 4), fp(7, 3)] // (1.5, -1.25, 2.3333...)
			const h = DEFAULT_STEP

			const grad = [...gradientBigIntLazy(f, point, h)]
			const expectedGrad = analyticalGrad(point)

			// 1. Cross-check against analytical gradient
			for (let i = 0; i < 3; i++) {
				assertApproxEqual(
					grad[i],
					expectedGrad[i],
					10n ** 8n,
					`analytical gradient component ${i}`,
				)
			}

			// 2. Cross-check directional derivative along multiple direction vectors v
			const directions = [
				[fp(1), fp(0), fp(0)],
				[fp(1, 2), fp(-3, 2), fp(2)],
				[fp(-7, 5), fp(11, 4), fp(-3, 7)],
			]

			for (const v of directions) {
				// ∇f(x) · v
				const dotFromGrad =
					(grad[0] * v[0] + grad[1] * v[1] + grad[2] * v[2]) / SCALE

				// Independent central difference along direction v: (f(x + h*v) - f(x - h*v)) / (2h)
				const xPlusHV = point.map((xi, i) => xi + (h * v[i]) / SCALE)
				const xMinusHV = point.map((xi, i) => xi - (h * v[i]) / SCALE)
				const dirDeriv = ((f(xPlusHV) - f(xMinusHV)) * SCALE) / (2n * h)

				// Analytical directional derivative
				const analyticalDirDeriv =
					(expectedGrad[0] * v[0] +
						expectedGrad[1] * v[1] +
						expectedGrad[2] * v[2]) /
					SCALE

				assertApproxEqual(
					dotFromGrad,
					dirDeriv,
					10n ** 9n,
					'∇f · v vs directional central difference',
				)
				assertApproxEqual(
					dotFromGrad,
					analyticalDirDeriv,
					10n ** 9n,
					'∇f · v vs analytical directional derivative',
				)
			}
		})

		test('linearity of gradient: ∇(a·f + b·g) = a·∇f + b·∇g', () => {
			const f = ([x, y]) => mul(x, x) + 3n * mul(x, y)
			const g = ([x, y]) => 2n * mul(y, y) - 5n * x + y
			const a = 4n
			const b = -3n
			const combined = (p) => a * f(p) + b * g(p)

			const point = [fp(-7, 2), fp(9, 4)]
			const gradF = [...gradientBigIntLazy(f, point)]
			const gradG = [...gradientBigIntLazy(g, point)]
			const gradCombined = [...gradientBigIntLazy(combined, point)]

			for (let i = 0; i < 2; i++) {
				assertApproxEqual(
					gradCombined[i],
					a * gradF[i] + b * gradG[i],
					10n ** 6n,
					`linearity at component ${i}`,
				)
			}
		})
	})
})
