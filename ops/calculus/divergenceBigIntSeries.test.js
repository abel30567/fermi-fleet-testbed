import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { divergenceBigIntSeries } from './divergenceBigIntSeries.js'

/**
 * Evaluates an n-dimensional polynomial scalar component at an exact BigInt point.
 */
function evalPoly(terms, point) {
	let sum = 0n
	for (const { coeff, powers } of terms) {
		let v = coeff
		for (let j = 0; j < point.length; j++) {
			const p = BigInt(powers[j])
			if (p === 0n) continue
			v *= point[j] ** p
		}
		sum += v
	}
	return sum
}

/**
 * Symbolically differentiates a polynomial component with respect to axis `axis`.
 */
function partialPoly(terms, axis) {
	const out = []
	for (const { coeff, powers } of terms) {
		const p = BigInt(powers[axis])
		if (p === 0n || coeff === 0n) continue
		const nextPowers = powers.map((val, idx) =>
			idx === axis ? p - 1n : BigInt(val),
		)
		out.push({ coeff: coeff * p, powers: nextPowers })
	}
	return out
}

/**
 * Symbolically negates a polynomial component.
 */
function negatePoly(terms) {
	return terms.map(({ coeff, powers }) => ({ coeff: -coeff, powers }))
}

/**
 * Symbolically computes the 3D curl of a 3D polynomial vector field G:
 *   curl(G) = (∂G_z/∂y - ∂G_y/∂z, ∂G_x/∂z - ∂G_z/∂x, ∂G_y/∂x - ∂G_x/∂y)
 */
function symbolicCurl3D(G) {
	const [Gx, Gy, Gz] = G
	return [
		[...partialPoly(Gz, 1), ...negatePoly(partialPoly(Gy, 2))],
		[...partialPoly(Gx, 2), ...negatePoly(partialPoly(Gz, 0))],
		[...partialPoly(Gy, 0), ...negatePoly(partialPoly(Gx, 1))],
	]
}

describe('divergenceBigIntSeries', () => {
	describe('normal cases', () => {
		test('1D polynomial vector field', () => {
			// F(x) = [3x^4 - 2x^2 + 5x - 7]
			// ∇·F(x) = 12x^3 - 4x + 5
			const field = [
				[
					{ coeff: 3n, powers: [4] },
					{ coeff: -2n, powers: [2] },
					{ coeff: 5n, powers: [1] },
					{ coeff: -7n, powers: [0] },
				],
			]
			assert.equal(divergenceBigIntSeries(field, [0n]), 5n)
			assert.equal(divergenceBigIntSeries(field, [2n]), 12n * 8n - 8n + 5n)
			assert.equal(divergenceBigIntSeries(field, [-3n]), 12n * -27n + 12n + 5n)
		})

		test('2D polynomial vector field', () => {
			// F(x, y) = [x^2*y + 3x, 2x*y^3 - y^2]
			// ∇·F(x, y) = (2xy + 3) + (6xy^2 - 2y)
			const field = [
				[
					{ coeff: 1n, powers: [2, 1] },
					{ coeff: 3n, powers: [1, 0] },
				],
				[
					{ coeff: 2n, powers: [1, 3] },
					{ coeff: -1n, powers: [0, 2] },
				],
			]
			// At (2, -3): (2*2*(-3) + 3) + (6*2*9 - 2*(-3)) = -9 + 114 = 105
			assert.equal(divergenceBigIntSeries(field, [2n, -3n]), 105n)
			// At (0, 0): 3 + 0 = 3
			assert.equal(divergenceBigIntSeries(field, [0n, 0n]), 3n)
		})

		test('3D polynomial vector field with mixed number and BigInt powers', () => {
			// F(x, y, z) = [x^3*y*z, -2*x*y^2*z^3, 5*x*y*z^4 + z]
			// ∂Fx/∂x = 3*x^2*y*z
			// ∂Fy/∂y = -4*x*y*z^3
			// ∂Fz/∂z = 20*x*y*z^3 + 1
			const field = [
				[{ coeff: 1n, powers: [3n, 1, 1n] }],
				[{ coeff: -2n, powers: [1, 2n, 3] }],
				[
					{ coeff: 5n, powers: [1n, 1n, 4n] },
					{ coeff: 1n, powers: [0, 0, 1] },
				],
			]
			const x = 2n
			const y = 3n
			const z = -4n
			const expected =
				3n * x ** 2n * y * z - 4n * x * y * z ** 3n + 20n * x * y * z ** 3n + 1n
			assert.equal(divergenceBigIntSeries(field, [x, y, z]), expected)
		})

		test('4D polynomial vector field and unmerged duplicate monomials', () => {
			// F(w, x, y, z) = [w^2 + 2w^2, -x*y, y^3*z, w*x*y*z^2]
			// ∇·F = 6w - y + 3y^2*z + 2w*x*y*z
			const field = [
				[
					{ coeff: 1n, powers: [2, 0, 0, 0] },
					{ coeff: 2n, powers: [2, 0, 0, 0] },
				],
				[{ coeff: -1n, powers: [0, 1, 1, 0] }],
				[{ coeff: 1n, powers: [0, 0, 3, 1] }],
				[{ coeff: 1n, powers: [1, 1, 1, 2] }],
			]
			const [w, x, y, z] = [5n, -2n, 3n, 4n]
			const expected = 6n * w - y + 3n * y ** 2n * z + 2n * w * x * y * z
			assert.equal(divergenceBigIntSeries(field, [w, x, y, z]), expected)
		})
	})

	describe('edge cases', () => {
		test('constant field has divergence 0n', () => {
			const field = [
				[{ coeff: 7n, powers: [0, 0, 0] }],
				[{ coeff: -42n, powers: [0, 0, 0] }],
				[],
			]
			assert.equal(divergenceBigIntSeries(field, [10n, -20n, 30n]), 0n)
			assert.equal(divergenceBigIntSeries(field, [0n, 0n, 0n]), 0n)
		})

		test('all-empty zero field has divergence 0n', () => {
			assert.equal(divergenceBigIntSeries([[], [], []], [1n, 2n, 3n]), 0n)
		})

		test('solenoidal / divergence-free field (-y, x, 0) has divergence 0n', () => {
			const rotationField = [
				[{ coeff: -1n, powers: [0, 1, 0] }],
				[{ coeff: 1n, powers: [1, 0, 0] }],
				[],
			]
			assert.equal(divergenceBigIntSeries(rotationField, [0n, 0n, 0n]), 0n)
			assert.equal(divergenceBigIntSeries(rotationField, [13n, -29n, 7n]), 0n)
			assert.equal(
				divergenceBigIntSeries(rotationField, [10n ** 40n, -(10n ** 35n), 99n]),
				0n,
			)
		})

		test('nonlinear divergence-free field (x^2*y, -x*y^2, x*y) has divergence 0n', () => {
			// ∂/∂x(x^2*y) + ∂/∂y(-x*y^2) + ∂/∂z(x*y) = 2xy - 2xy + 0 = 0
			const field = [
				[{ coeff: 1n, powers: [2, 1, 0] }],
				[{ coeff: -1n, powers: [1, 2, 0] }],
				[{ coeff: 1n, powers: [1, 1, 0] }],
			]
			assert.equal(divergenceBigIntSeries(field, [17n, -23n, 41n]), 0n)
		})

		test('radial field (x, y, z) has divergence 3n everywhere including origin', () => {
			const radial3D = [
				[{ coeff: 1n, powers: [1, 0, 0] }],
				[{ coeff: 1n, powers: [0, 1, 0] }],
				[{ coeff: 1n, powers: [0, 0, 1] }],
			]
			assert.equal(divergenceBigIntSeries(radial3D, [0n, 0n, 0n]), 3n)
			assert.equal(divergenceBigIntSeries(radial3D, [100n, -200n, 300n]), 3n)
			assert.equal(
				divergenceBigIntSeries(radial3D, [10n ** 60n, -(10n ** 60n), 1n]),
				3n,
			)
		})

		test('zero-coefficient terms contribute nothing', () => {
			const field = [
				[
					{ coeff: 0n, powers: [5, 3] },
					{ coeff: 4n, powers: [1, 0] },
				],
				[{ coeff: 0n, powers: [2, 7] }],
			]
			assert.equal(divergenceBigIntSeries(field, [123n, 456n]), 4n)
		})

		test('huge BigInts preserve exact arbitrary precision', () => {
			const bigA = 10n ** 50n + 12345678901234567890123456789n
			const bigB = -(10n ** 45n + 98765432109876543210987654321n)
			const bigC = 2n ** 200n + 7n
			// F(x, y, z) = [bigA * x^2 * y, bigB * y^3, bigC * x * z^2]
			// ∇·F(x, y, z) = 2*bigA*x*y + 3*bigB*y^2 + 2*bigC*x*z
			const field = [
				[{ coeff: bigA, powers: [2, 1, 0] }],
				[{ coeff: bigB, powers: [0, 3, 0] }],
				[{ coeff: bigC, powers: [1, 0, 2] }],
			]
			const x = 10n ** 30n + 11n
			const y = -(10n ** 25n + 13n)
			const z = 10n ** 20n + 17n
			const expected =
				2n * bigA * x * y + 3n * bigB * y ** 2n + 2n * bigC * x * z
			assert.equal(divergenceBigIntSeries(field, [x, y, z]), expected)
		})

		test('huge BigInt exponent with trivial bases 0n, 1n, -1n', () => {
			const hugeExp = 10n ** 30n
			// F(x) = [x^(hugeExp + 1)] -> dF/dx = (hugeExp + 1) * x^hugeExp
			const field = [[{ coeff: 1n, powers: [hugeExp + 1n] }]]
			assert.equal(divergenceBigIntSeries(field, [0n]), 0n)
			assert.equal(divergenceBigIntSeries(field, [1n]), hugeExp + 1n)
			// hugeExp is even, so (-1)^hugeExp = 1
			assert.equal(divergenceBigIntSeries(field, [-1n]), hugeExp + 1n)
		})
	})

	describe('independent cross-checks', () => {
		test('vector calculus identity: div(curl(G)) === 0n for a rich 3D polynomial field G', () => {
			// G(x, y, z) = (
			//   x^3*y^2*z - 4*y*z^3 + 9*x,
			//   2*x^2*y*z^2 + 5*x^4 - 6*z,
			//   -3*x*y^3*z^2 + 7*x*y*z + 11*y^2
			// )
			const G = [
				[
					{ coeff: 1n, powers: [3, 2, 1] },
					{ coeff: -4n, powers: [0, 1, 3] },
					{ coeff: 9n, powers: [1, 0, 0] },
				],
				[
					{ coeff: 2n, powers: [2, 1, 2] },
					{ coeff: 5n, powers: [4, 0, 0] },
					{ coeff: -6n, powers: [0, 0, 1] },
				],
				[
					{ coeff: -3n, powers: [1, 3, 2] },
					{ coeff: 7n, powers: [1, 1, 1] },
					{ coeff: 11n, powers: [0, 2, 0] },
				],
			]
			const curlG = symbolicCurl3D(G)
			const testPoints = [
				[0n, 0n, 0n],
				[1n, 2n, 3n],
				[-7n, 11n, -13n],
				[10n ** 18n + 3n, -(10n ** 15n) + 7n, 10n ** 12n + 5n],
			]
			for (const pt of testPoints) {
				assert.equal(divergenceBigIntSeries(curlG, pt), 0n)
			}
		})

		test('exact 4-point central finite-difference cross-check for degree <= 4 field', () => {
			// For any polynomial of degree <= 4 in x_i, the 4-point central difference:
			//   (-F_i(x + 2h e_i) + 8 F_i(x + h e_i) - 8 F_i(x - h e_i) + F_i(x - 2h e_i)) / (12h)
			// is algebraically EXACT over Z (zero truncation error).
			const field = [
				[
					{ coeff: 2n, powers: [4, 1, 0] },
					{ coeff: -5n, powers: [3, 2, 1] },
					{ coeff: 7n, powers: [1, 0, 3] },
					{ coeff: -11n, powers: [0, 2, 2] },
				],
				[
					{ coeff: -3n, powers: [2, 4, 1] },
					{ coeff: 4n, powers: [0, 3, 2] },
					{ coeff: 6n, powers: [1, 1, 1] },
				],
				[
					{ coeff: 5n, powers: [1, 2, 4] },
					{ coeff: -8n, powers: [2, 0, 2] },
					{ coeff: 9n, powers: [0, 0, 1] },
				],
			]

			const points = [
				[0n, 0n, 0n],
				[3n, -5n, 7n],
				[-19n, 23n, -29n],
				[10n ** 9n + 1n, -(10n ** 8n) + 3n, 10n ** 7n + 5n],
			]
			const h = 10n

			for (const pt of points) {
				let fdDiv = 0n
				for (let i = 0; i < 3; i++) {
					const shift = (delta) =>
						pt.map((coord, idx) => (idx === i ? coord + delta : coord))
					const num =
						-evalPoly(field[i], shift(2n * h)) +
						8n * evalPoly(field[i], shift(h)) -
						8n * evalPoly(field[i], shift(-h)) +
						evalPoly(field[i], shift(-2n * h))
					const denom = 12n * h
					assert.equal(num % denom, 0n)
					fdDiv += num / denom
				}
				assert.equal(divergenceBigIntSeries(field, pt), fdDiv)
			}
		})
	})

	describe('invalid inputs', () => {
		test('rejects non-array or empty field', () => {
			assert.throws(() => divergenceBigIntSeries(null, [1n]), TypeError)
			assert.throws(() => divergenceBigIntSeries(undefined, [1n]), TypeError)
			assert.throws(() => divergenceBigIntSeries({}, [1n]), TypeError)
			assert.throws(() => divergenceBigIntSeries('field', [1n]), TypeError)
			assert.throws(() => divergenceBigIntSeries([], []), RangeError)
		})

		test('rejects invalid point argument or dimension mismatch', () => {
			const field2D = [[], []]
			assert.throws(() => divergenceBigIntSeries(field2D, null), TypeError)
			assert.throws(() => divergenceBigIntSeries(field2D, '12'), TypeError)
			assert.throws(() => divergenceBigIntSeries(field2D, [1n]), RangeError)
			assert.throws(
				() => divergenceBigIntSeries(field2D, [1n, 2n, 3n]),
				RangeError,
			)
			assert.throws(() => divergenceBigIntSeries(field2D, [1, 2n]), TypeError)
			assert.throws(
				() => divergenceBigIntSeries(field2D, [1n, '2']),
				TypeError,
			)
		})

		test('rejects invalid component or monomial term shapes', () => {
			assert.throws(() => divergenceBigIntSeries([null], [1n]), TypeError)
			assert.throws(() => divergenceBigIntSeries([{}], [1n]), TypeError)
			assert.throws(() => divergenceBigIntSeries([[null]], [1n]), TypeError)
			assert.throws(() => divergenceBigIntSeries([[[]]], [1n]), TypeError)
			assert.throws(() => divergenceBigIntSeries([[42]], [1n]), TypeError)
		})

		test('rejects invalid coeff or powers', () => {
			assert.throws(
				() => divergenceBigIntSeries([[{ coeff: 1, powers: [1] }]], [1n]),
				TypeError,
			)
			assert.throws(
				() => divergenceBigIntSeries([[{ coeff: '1', powers: [1] }]], [1n]),
				TypeError,
			)
			assert.throws(
				() => divergenceBigIntSeries([[{ coeff: 1n, powers: null }]], [1n]),
				TypeError,
			)
			assert.throws(
				() => divergenceBigIntSeries([[{ coeff: 1n, powers: [1, 2] }]], [1n]),
				RangeError,
			)
			assert.throws(
				() => divergenceBigIntSeries([[{ coeff: 1n, powers: [-1] }]], [1n]),
				RangeError,
			)
			assert.throws(
				() => divergenceBigIntSeries([[{ coeff: 1n, powers: [-1n] }]], [1n]),
				RangeError,
			)
			assert.throws(
				() => divergenceBigIntSeries([[{ coeff: 1n, powers: [1.5] }]], [1n]),
				RangeError,
			)
			assert.throws(
				() =>
					divergenceBigIntSeries([[{ coeff: 1n, powers: [Number.NaN] }]], [1n]),
				RangeError,
			)
			assert.throws(
				() =>
					divergenceBigIntSeries(
						[[{ coeff: 1n, powers: [Number.POSITIVE_INFINITY] }]],
						[1n],
					),
				RangeError,
			)
			assert.throws(
				() =>
					divergenceBigIntSeries(
						[[{ coeff: 1n, powers: [Number.MAX_SAFE_INTEGER + 1] }]],
						[1n],
					),
				RangeError,
			)
			assert.throws(
				() => divergenceBigIntSeries([[{ coeff: 1n, powers: ['1'] }]], [1n]),
				TypeError,
			)
		})

		test('validates malformed powers even when coeff is 0n or axis power is 0', () => {
			assert.throws(
				() =>
					divergenceBigIntSeries(
						[[{ coeff: 0n, powers: [0, -2] }], []],
						[1n, 2n],
					),
				RangeError,
			)
			assert.throws(
				() =>
					divergenceBigIntSeries(
						[[{ coeff: 5n, powers: [0, 1.25] }], []],
						[1n, 2n],
					),
				RangeError,
			)
		})
	})
})
