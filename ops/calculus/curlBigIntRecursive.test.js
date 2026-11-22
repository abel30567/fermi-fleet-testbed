import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { curlBigIntRecursive, CURL_SCALE } from './curlBigIntRecursive.js'

const S = CURL_SCALE // 10n ** 18n

describe('curlBigIntRecursive', () => {
	describe('normal rotational and constant fields', () => {
		test('constant vector field has zero curl', () => {
			const field = () => [42n, -17n, 999n]
			assert.deepEqual(curlBigIntRecursive(field, [1n, 2n, 3n]), [0n, 0n, 0n])
		})

		test('2D solid-body rotation F(x, y, z) = (-y, x, 0) has curl (0, 0, 2)', () => {
			const field = (x, y, _z) => [-y, x, 0n]
			assert.deepEqual(curlBigIntRecursive(field, [5n, -3n, 10n]), [
				0n,
				0n,
				2n * S,
			])
		})

		test('3D rigid-body rotation F(r) = omega x r has curl 2 * omega', () => {
			const omega = [3n, -5n, 7n]
			const field = (x, y, z) => [
				omega[1] * z - omega[2] * y,
				omega[2] * x - omega[0] * z,
				omega[0] * y - omega[1] * x,
			]
			assert.deepEqual(curlBigIntRecursive(field, [11n, -13n, 17n]), [
				6n * S,
				-10n * S,
				14n * S,
			])
		})

		test('general linear field F = M * r gives exact curl from skew-symmetric part', () => {
			// Fx = 2x + 3y - 5z
			// Fy = 7x - 11y + 13z
			// Fz = -17x + 19y + 23z
			// curl = (dFz/dy - dFy/dz, dFx/dz - dFz/dx, dFy/dx - dFx/dy)
			//      = (19 - 13, -5 - (-17), 7 - 3) = (6, 12, 4)
			const field = (x, y, z) => [
				2n * x + 3n * y - 5n * z,
				7n * x - 11n * y + 13n * z,
				-17n * x + 19n * y + 23n * z,
			]
			assert.deepEqual(curlBigIntRecursive(field, [0n, 0n, 0n]), [
				6n * S,
				12n * S,
				4n * S,
			])
		})
	})

	describe('irrotational / conservative fields (curl === 0)', () => {
		test('radial field F(x, y, z) = (x, y, z) is irrotational', () => {
			const field = (x, y, z) => [x, y, z]
			assert.deepEqual(curlBigIntRecursive(field, [-8n, 15n, -22n]), [
				0n,
				0n,
				0n,
			])
		})

		test('high-degree gradient field F = grad(phi) has identically zero curl', () => {
			// phi(x, y, z) = x^3 y^2 z - 5 x y z^3 + 2 x^2 - 7 y^4 + 3 z^2
			// Fx = 3 x^2 y^2 z - 5 y z^3 + 4 x
			// Fy = 2 x^3 y z - 5 x z^3 - 28 y^3
			// Fz = x^3 y^2 - 15 x y z^2 + 6 z
			const gradPhi = (x, y, z) => [
				3n * x * x * y * y * z - 5n * y * z * z * z + 4n * x,
				2n * x * x * x * y * z - 5n * x * z * z * z - 28n * y * y * y,
				x * x * x * y * y - 15n * x * y * z * z + 6n * z,
			]

			const testPoints = [
				[0n, 0n, 0n],
				[2n, 3n, 4n],
				[-7n, 5n, -9n],
				[100n, -200n, 300n],
			]
			for (const pt of testPoints) {
				assert.deepEqual(curlBigIntRecursive(gradPhi, pt), [0n, 0n, 0n])
			}
		})
	})

	describe('analytical cross-checks and non-integer fixed-point results', () => {
		test('cross-check degree-4 polynomial field against independent analytical curl', () => {
			// F(x, y, z) = (
			//   2 x^2 y z - 3 y^3 + 5 z^4,
			//  -4 x y^2 z + 7 x^3 z - 2 z^2,
			//   3 x y z^2 + x^4 - 6 y^2 z
			// )
			const field = (x, y, z) => [
				2n * x * x * y * z - 3n * y ** 3n + 5n * z ** 4n,
				-4n * x * y * y * z + 7n * x ** 3n * z - 2n * z * z,
				3n * x * y * z * z + x ** 4n - 6n * y * y * z,
			]

			// Independent analytical curl:
			// curlX = dFz/dy - dFy/dz = (3 x z^2 - 12 y z) - (-4 x y^2 + 7 x^3 - 4 z)
			// curlY = dFx/dz - dFz/dx = (2 x^2 y + 20 z^3) - (3 y z^2 + 4 x^3)
			// curlZ = dFy/dx - dFx/dy = (-4 y^2 z + 21 x^2 z) - (2 x^2 z - 9 y^2)
			const analyticalCurl = (x, y, z) => [
				(3n * x * z * z - 12n * y * z + 4n * x * y * y - 7n * x ** 3n + 4n * z) * S,
				(2n * x * x * y + 20n * z ** 3n - 3n * y * z * z - 4n * x ** 3n) * S,
				(-4n * y * y * z + 19n * x * x * z + 9n * y * y) * S,
			]

			const points = [
				[0n, 0n, 0n],
				[2n, -3n, 5n],
				[-11n, -7n, -13n],
				[25n, 14n, -9n],
			]

			for (const pt of points) {
				assert.deepEqual(
					curlBigIntRecursive(field, pt),
					analyticalCurl(pt[0], pt[1], pt[2])
				)
			}
		})

		test('degree-6 polynomial is exact with default Richardson order = 2 and step = 1n', () => {
			// F(x, y, z) = (z^6, x^6, y^6)
			// analytical curl = (6 y^5, 6 z^5, 6 x^5)
			const field = (x, y, z) => [z ** 6n, x ** 6n, y ** 6n]
			const [x, y, z] = [-3n, 4n, -5n]
			assert.deepEqual(curlBigIntRecursive(field, [x, y, z]), [
				6n * y ** 5n * S,
				6n * z ** 5n * S,
				6n * x ** 5n * S,
			])
		})

		test('non-integer fractional derivatives are accurately scaled by 10^18 with round-half-to-even', () => {
			// Using step = 105n (divisible by 3, 5, 7) on exact rational-slope field:
			// Fx = z / 3, Fy = (2x) / 3, Fz = (2y) / 5
			// dFz/dy = 2/5 = 0.4 -> 400000000000000000n
			// dFx/dz = 1/3 = 0.333333333333333333... -> 333333333333333333n
			// dFy/dx = 2/3 = 0.666666666666666666... -> 666666666666666667n (rounded up)
			const field = (x, y, z) => [z / 3n, (2n * x) / 3n, (2n * y) / 5n]
			assert.deepEqual(
				curlBigIntRecursive(field, [0n, 0n, 0n], { step: 105n, order: 0 }),
				[400000000000000000n, 333333333333333333n, 666666666666666667n]
			)
		})

		test('non-polynomial fixed-point rational field cross-checked against analytical derivative', () => {
			// Fixed-point field scaled by S = 10^18:
			// F(x, y, z) = (0, 1 / (1 + x^2), 0)
			// Analytical curl = (0, 0, -2x / (1 + x^2)^2)
			const field = (x, _y, _z) => {
				const x2 = (x * x) / S
				const fy = (S * S) / (S + x2)
				return [0n, fy, 0n]
			}

			// At x = 2.0 (2n * S): analytical curlZ = -4 / 25 = -0.16 -> -160000000000000000n
			const [cx, cy, cz] = curlBigIntRecursive(field, [2n * S, 0n, 0n], {
				step: 10n ** 14n,
				order: 2,
			})
			assert.equal(cx, 0n)
			assert.equal(cy, 0n)
			const expected = -160000000000000000n
			const diff = cz > expected ? cz - expected : expected - cz
			assert.ok(
				diff < 10n ** 6n,
				`Expected curlZ within 10^6 of ${expected}, got ${cz} (diff=${diff})`
			)
		})

		test('vector calculus identity: linearity curl(a*F + b*G) = a*curl(F) + b*curl(G)', () => {
			const F = (x, y, z) => [y * z, x * z * z, x * y]
			const G = (x, y, z) => [z * z, -x * y, y * y * x]
			const a = 7n
			const b = -3n
			const combined = (x, y, z) => {
				const fv = F(x, y, z)
				const gv = G(x, y, z)
				return [
					a * fv[0] + b * gv[0],
					a * fv[1] + b * gv[1],
					a * fv[2] + b * gv[2],
				]
			}
			const pt = [-4n, 6n, -2n]
			const curlF = curlBigIntRecursive(F, pt)
			const curlG = curlBigIntRecursive(G, pt)
			const curlComb = curlBigIntRecursive(combined, pt)

			assert.deepEqual(curlComb, [
				a * curlF[0] + b * curlG[0],
				a * curlF[1] + b * curlG[1],
				a * curlF[2] + b * curlG[2],
			])
		})
	})

	describe('negative coordinates, large BigInts, and custom options', () => {
		test('handles negative coordinates accurately', () => {
			// F(x, y, z) = (y^2, z^2, x^2) => curl = (-2z, -2x, -2y)
			const field = (x, y, z) => [y * y, z * z, x * x]
			assert.deepEqual(curlBigIntRecursive(field, [-10n, -20n, -30n]), [
				60n * S,
				20n * S,
				40n * S,
			])
		})

		test('handles huge BigInt coordinates far beyond Number.MAX_SAFE_INTEGER without precision loss', () => {
			const big = 10n ** 30n
			const x = big + 7n
			const y = -big + 13n
			const z = 2n * big - 19n

			// F(x, y, z) = (y^2 * z, z^2 * x, x^2 * y)
			// curlX = dFz/dy - dFy/dz = x^2 - 2 z x
			// curlY = dFx/dz - dFz/dx = y^2 - 2 x y
			// curlZ = dFy/dx - dFx/dy = z^2 - 2 y z
			const field = (a, b, c) => [b * b * c, c * c * a, a * a * b]
			const expected = [
				(x * x - 2n * z * x) * S,
				(y * y - 2n * x * y) * S,
				(z * z - 2n * y * z) * S,
			]

			assert.deepEqual(curlBigIntRecursive(field, [x, y, z]), expected)
		})

		test('supports custom scale, step, and order options', () => {
			// F(x, y, z) = (0, x / 2, 0) with step = 2n, scale = 100n -> curlZ = 50n
			const field = (x, _y, _z) => [0n, x / 2n, 0n]
			assert.deepEqual(
				curlBigIntRecursive(field, [0n, 0n, 0n], {
					step: 2n,
					order: 0,
					scale: 100n,
				}),
				[0n, 0n, 50n]
			)
		})
	})

	describe('input validation', () => {
		const validField = (x, y, z) => [-y, x, z]
		const validPoint = [0n, 0n, 0n]

		test('rejects non-function field', () => {
			assert.throws(() => curlBigIntRecursive(null, validPoint), TypeError)
			assert.throws(() => curlBigIntRecursive('not-a-fn', validPoint), TypeError)
		})

		test('rejects invalid point argument', () => {
			assert.throws(() => curlBigIntRecursive(validField, null), TypeError)
			assert.throws(() => curlBigIntRecursive(validField, [1n, 2n]), RangeError)
			assert.throws(
				() => curlBigIntRecursive(validField, [1n, 2n, 3n, 4n]),
				RangeError
			)
			assert.throws(() => curlBigIntRecursive(validField, [1, 2n, 3n]), TypeError)
			assert.throws(
				() => curlBigIntRecursive(validField, [1n, '2', 3n]),
				TypeError
			)
		})

		test('rejects invalid options object and option values', () => {
			assert.throws(
				() => curlBigIntRecursive(validField, validPoint, null),
				TypeError
			)
			assert.throws(
				() => curlBigIntRecursive(validField, validPoint, []),
				TypeError
			)
			assert.throws(
				() => curlBigIntRecursive(validField, validPoint, { step: 1 }),
				TypeError
			)
			assert.throws(
				() => curlBigIntRecursive(validField, validPoint, { step: 0n }),
				RangeError
			)
			assert.throws(
				() => curlBigIntRecursive(validField, validPoint, { step: -5n }),
				RangeError
			)
			assert.throws(
				() => curlBigIntRecursive(validField, validPoint, { order: 1.5 }),
				TypeError
			)
			assert.throws(
				() => curlBigIntRecursive(validField, validPoint, { order: -1 }),
				RangeError
			)
			assert.throws(
				() => curlBigIntRecursive(validField, validPoint, { order: 17 }),
				RangeError
			)
			assert.throws(
				() => curlBigIntRecursive(validField, validPoint, { scale: 100 }),
				TypeError
			)
			assert.throws(
				() => curlBigIntRecursive(validField, validPoint, { scale: 0n }),
				RangeError
			)
			assert.throws(
				() => curlBigIntRecursive(validField, validPoint, { scale: -10n }),
				RangeError
			)
		})

		test('rejects invalid vector returned by field', () => {
			assert.throws(
				() => curlBigIntRecursive(() => 'bad', validPoint),
				TypeError
			)
			assert.throws(
				() => curlBigIntRecursive(() => [1n, 2n], validPoint),
				RangeError
			)
			assert.throws(
				() => curlBigIntRecursive(() => [1n, 2, 3n], validPoint),
				TypeError
			)
		})
	})
})
