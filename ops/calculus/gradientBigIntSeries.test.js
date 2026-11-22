import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { gradientBigIntSeries } from './gradientBigIntSeries.js'

/**
 * Independent polynomial evaluator f(point) for cross-check tests.
 *
 * @param {Array<{ coeff: bigint, powers: Array<bigint | number> }>} terms
 * @param {bigint[]} point
 * @returns {bigint}
 */
function evalPolynomial(terms, point) {
	let sum = 0n
	for (const { coeff, powers } of terms) {
		let prod = coeff
		for (let i = 0; i < point.length; i++) {
			const p = BigInt(powers[i])
			prod *= p === 0n ? 1n : point[i] ** p
		}
		sum += prod
	}
	return sum
}

/**
 * Dot product of two BigInt vectors.
 *
 * @param {bigint[]} a
 * @param {bigint[]} b
 * @returns {bigint}
 */
function dotBigInt(a, b) {
	let acc = 0n
	for (let i = 0; i < a.length; i++) {
		acc += a[i] * b[i]
	}
	return acc
}

describe('gradientBigIntSeries', () => {
	describe('normal cases', () => {
		test('1D polynomial gradient', () => {
			// f(x) = 4x^3 - 2x^2 + 7x - 9 => f'(x) = 12x^2 - 4x + 7
			const terms = [
				{ coeff: 4n, powers: [3] },
				{ coeff: -2n, powers: [2] },
				{ coeff: 7n, powers: [1] },
				{ coeff: -9n, powers: [0] },
			]
			assert.deepEqual(gradientBigIntSeries(terms, [0n]), [7n])
			assert.deepEqual(gradientBigIntSeries(terms, [3n]), [103n])
			assert.deepEqual(gradientBigIntSeries(terms, [-5n]), [327n])
		})

		test('2D polynomial with mixed terms', () => {
			// f(x, y) = x^2*y + 3*x*y^2 - 5*y + 11
			// ∂f/∂x = 2*x*y + 3*y^2
			// ∂f/∂y = x^2 + 6*x*y - 5
			const terms = [
				{ coeff: 1n, powers: [2, 1] },
				{ coeff: 3n, powers: [1, 2] },
				{ coeff: -5n, powers: [0, 1] },
				{ coeff: 11n, powers: [0, 0] },
			]
			assert.deepEqual(gradientBigIntSeries(terms, [2n, 4n]), [64n, 47n])
			assert.deepEqual(gradientBigIntSeries(terms, [-3n, 5n]), [45n, -86n])
		})

		test('3D polynomial with mixed terms (x^2*y + 3*y*z^2 - 4*x*z + 2*x*y*z)', () => {
			// ∂f/∂x = 2*x*y - 4*z + 2*y*z
			// ∂f/∂y = x^2 + 3*z^2 + 2*x*z
			// ∂f/∂z = 6*y*z - 4*x + 2*x*y
			const terms = [
				{ coeff: 1n, powers: [2, 1, 0] },
				{ coeff: 3n, powers: [0, 1, 2] },
				{ coeff: -4n, powers: [1, 0, 1] },
				{ coeff: 2n, powers: [1, 1, 1] },
			]
			// At (2, -3, 5):
			// ∂f/∂x = 2(2)(-3) - 4(5) + 2(-3)(5) = -12 - 20 - 30 = -62
			// ∂f/∂y = 4 + 75 + 20 = 99
			// ∂f/∂z = 6(-3)(5) - 8 + 2(2)(-3) = -90 - 8 - 12 = -110
			assert.deepEqual(gradientBigIntSeries(terms, [2n, -3n, 5n]), [-62n, 99n, -110n])
		})

		test('accepts BigInt[] powers and produces identical results to number[] powers', () => {
			const termsNum = [
				{ coeff: 5n, powers: [3, 2, 1] },
				{ coeff: -7n, powers: [0, 4, 2] },
			]
			const termsBig = [
				{ coeff: 5n, powers: [3n, 2n, 1n] },
				{ coeff: -7n, powers: [0n, 4n, 2n] },
			]
			const point = [3n, -2n, 4n]
			const expected = gradientBigIntSeries(termsNum, point)
			assert.deepEqual(gradientBigIntSeries(termsBig, point), expected)
			// Verify analytic values at (3, -2, 4):
			// ∂f/∂x = 15 * 3^2 * (-2)^2 * 4 = 15 * 9 * 4 * 4 = 2160
			// ∂f/∂y = 10 * 3^3 * (-2) * 4 - 28 * (-2)^3 * 4^2 = -2160 + 3584 = 1424
			// ∂f/∂z = 5 * 3^3 * (-2)^2 - 14 * (-2)^4 * 4 = 540 - 896 = -356
			assert.deepEqual(expected, [2160n, 1424n, -356n])
		})

		test('combines duplicate monomial terms linearly', () => {
			const split = [
				{ coeff: 2n, powers: [2, 1] },
				{ coeff: 5n, powers: [2, 1] },
				{ coeff: -3n, powers: [2, 1] },
			]
			const merged = [{ coeff: 4n, powers: [2, 1] }]
			assert.deepEqual(
				gradientBigIntSeries(split, [7n, -11n]),
				gradientBigIntSeries(merged, [7n, -11n]),
			)
		})
	})

	describe('edge cases', () => {
		test('constant scalar field returns zero vector', () => {
			const terms = [
				{ coeff: 42n, powers: [0, 0, 0] },
				{ coeff: -1000n, powers: [0n, 0n, 0n] },
			]
			assert.deepEqual(gradientBigIntSeries(terms, [10n, -20n, 30n]), [0n, 0n, 0n])
		})

		test('empty terms array returns zero vector matching point dimension', () => {
			assert.deepEqual(gradientBigIntSeries([], [5n]), [0n])
			assert.deepEqual(gradientBigIntSeries([], [1n, 2n, 3n, 4n]), [0n, 0n, 0n, 0n])
		})

		test('zero-coefficient terms contribute zero', () => {
			const terms = [
				{ coeff: 0n, powers: [5, 4] },
				{ coeff: 3n, powers: [1, 0] },
			]
			assert.deepEqual(gradientBigIntSeries(terms, [9n, 8n]), [3n, 0n])
		})

		test('evaluation at origin preserves linear terms and zeros higher-order terms', () => {
			// f(x, y, z) = 7x - 3y + 11z + 5x^2 + 9xy + 2xyz + 100
			const terms = [
				{ coeff: 7n, powers: [1, 0, 0] },
				{ coeff: -3n, powers: [0, 1, 0] },
				{ coeff: 11n, powers: [0, 0, 1] },
				{ coeff: 5n, powers: [2, 0, 0] },
				{ coeff: 9n, powers: [1, 1, 0] },
				{ coeff: 2n, powers: [1, 1, 1] },
				{ coeff: 100n, powers: [0, 0, 0] },
			]
			assert.deepEqual(gradientBigIntSeries(terms, [0n, 0n, 0n]), [7n, -3n, 11n])
		})

		test('partial zero coordinates handle x_i^0 = 1 without division by zero', () => {
			// f(x, y, z) = 6 * x * y^2 * z^3
			// At (0, 2, 3): ∂f/∂x = 6 * 1 * 4 * 27 = 648, ∂f/∂y = 0, ∂f/∂z = 0
			const terms = [{ coeff: 6n, powers: [1, 2, 3] }]
			assert.deepEqual(gradientBigIntSeries(terms, [0n, 2n, 3n]), [648n, 0n, 0n])
		})

		test('huge BigInts preserve full arbitrary precision', () => {
			const bigX = 10n ** 30n + 7n
			const bigY = -(10n ** 25n) + 13n
			const bigC = 10n ** 40n + 99n
			// f(x, y) = bigC * x^2 * y
			// ∂f/∂x = 2 * bigC * x * y, ∂f/∂y = bigC * x^2
			const terms = [{ coeff: bigC, powers: [2n, 1n] }]
			assert.deepEqual(gradientBigIntSeries(terms, [bigX, bigY]), [
				2n * bigC * bigX * bigY,
				bigC * bigX * bigX,
			])
		})

		test('huge BigInt exponents on -1n, 0n, 1n coordinates run in O(1)', () => {
			const hugeOdd = 10n ** 20n + 1n
			const hugeEven = 10n ** 20n
			// f(x, y) = 3 * x^hugeOdd * y^hugeEven
			// At (1n, -1n):
			// ∂f/∂x = 3 * hugeOdd * 1^(hugeOdd-1) * (-1)^hugeEven = 3 * hugeOdd
			// ∂f/∂y = 3 * hugeEven * 1^hugeOdd * (-1)^(hugeEven-1) = -3 * hugeEven
			const terms = [{ coeff: 3n, powers: [hugeOdd, hugeEven] }]
			assert.deepEqual(gradientBigIntSeries(terms, [1n, -1n]), [
				3n * hugeOdd,
				-3n * hugeEven,
			])
		})
	})

	describe('independent cross-checks', () => {
		test("Euler's homogeneous function theorem: x · ∇f(x) = d * f(x)", () => {
			// Degree-4 homogeneous polynomial in 3 variables
			const degree = 4n
			const homogeneousTerms = [
				{ coeff: 5n, powers: [4, 0, 0] },
				{ coeff: -3n, powers: [2, 1, 1] },
				{ coeff: 7n, powers: [1, 3, 0] },
				{ coeff: 11n, powers: [0, 2, 2] },
				{ coeff: -13n, powers: [1, 0, 3] },
				{ coeff: 2n, powers: [0, 0, 4] },
			]

			const points = [
				[2n, -3n, 5n],
				[0n, 7n, -11n],
				[10n ** 12n + 3n, -(10n ** 12n) + 17n, 9876543210123n],
			]

			for (const point of points) {
				const grad = gradientBigIntSeries(homogeneousTerms, point)
				const lhs = dotBigInt(point, grad)
				const rhs = degree * evalPolynomial(homogeneousTerms, point)
				assert.equal(lhs, rhs)
			}
		})

		test('exact central finite-difference cross-check for quadratic fields', () => {
			// For degree <= 2, (f(x + h e_i) - f(x - h e_i)) / (2h) is exact for all h != 0
			const quadraticTerms = [
				{ coeff: 9n, powers: [2, 0, 0] },
				{ coeff: -4n, powers: [1, 1, 0] },
				{ coeff: 6n, powers: [0, 2, 0] },
				{ coeff: 13n, powers: [1, 0, 1] },
				{ coeff: -7n, powers: [0, 1, 1] },
				{ coeff: 5n, powers: [0, 0, 2] },
				{ coeff: -11n, powers: [1, 0, 0] },
				{ coeff: 3n, powers: [0, 1, 0] },
				{ coeff: 8n, powers: [0, 0, 1] },
				{ coeff: -42n, powers: [0, 0, 0] },
			]

			const point = [17n, -29n, 43n]
			const grad = gradientBigIntSeries(quadraticTerms, point)

			for (const h of [1n, 1000n]) {
				for (let i = 0; i < point.length; i++) {
					const plus = [...point]
					const minus = [...point]
					plus[i] += h
					minus[i] -= h
					const num = evalPolynomial(quadraticTerms, plus) - evalPolynomial(quadraticTerms, minus)
					const den = 2n * h
					assert.equal(num % den, 0n)
					assert.equal(num / den, grad[i])
				}
			}
		})

		test('exact 5-point central finite-difference stencil cross-check for degree-4 polynomial', () => {
			// (-f(x+2h) + 8f(x+h) - 8f(x-h) + f(x-2h)) / (12h) is exact for all polynomials of degree <= 4
			const quarticTerms = [
				{ coeff: 3n, powers: [4, 0, 0] },
				{ coeff: -5n, powers: [2, 2, 0] },
				{ coeff: 7n, powers: [1, 2, 1] },
				{ coeff: 2n, powers: [0, 1, 3] },
				{ coeff: -11n, powers: [1, 0, 2] },
				{ coeff: 19n, powers: [0, 1, 0] },
				{ coeff: -23n, powers: [0, 0, 0] },
			]

			const point = [-7n, 13n, -19n]
			const h = 5n
			const grad = gradientBigIntSeries(quarticTerms, point)

			for (let i = 0; i < point.length; i++) {
				const shift = (delta) => {
					const p = [...point]
					p[i] += delta
					return evalPolynomial(quarticTerms, p)
				}
				const num = -shift(2n * h) + 8n * shift(h) - 8n * shift(-h) + shift(-2n * h)
				const den = 12n * h
				assert.equal(num % den, 0n)
				assert.equal(num / den, grad[i])
			}
		})

		test('linearity: ∇(αf + βg) = α∇f + β∇g', () => {
			const f = [
				{ coeff: 2n, powers: [3, 1] },
				{ coeff: -5n, powers: [0, 2] },
			]
			const g = [
				{ coeff: 7n, powers: [1, 4] },
				{ coeff: 3n, powers: [2, 0] },
			]
			const alpha = 11n
			const beta = -13n
			const combined = [
				...f.map((t) => ({ coeff: alpha * t.coeff, powers: t.powers })),
				...g.map((t) => ({ coeff: beta * t.coeff, powers: t.powers })),
			]
			const point = [4n, -6n]
			const gradF = gradientBigIntSeries(f, point)
			const gradG = gradientBigIntSeries(g, point)
			const gradCombined = gradientBigIntSeries(combined, point)
			assert.deepEqual(gradCombined, [
				alpha * gradF[0] + beta * gradG[0],
				alpha * gradF[1] + beta * gradG[1],
			])
		})
	})

	describe('invalid inputs', () => {
		test('rejects non-array terms or point', () => {
			assert.throws(() => gradientBigIntSeries(null, [1n]), TypeError)
			assert.throws(() => gradientBigIntSeries({}, [1n]), TypeError)
			assert.throws(() => gradientBigIntSeries([], null), TypeError)
			assert.throws(() => gradientBigIntSeries([], 1n), TypeError)
		})

		test('rejects empty point vector', () => {
			assert.throws(() => gradientBigIntSeries([], []), RangeError)
		})

		test('rejects non-BigInt coordinates in point', () => {
			assert.throws(() => gradientBigIntSeries([], [1, 2n]), TypeError)
			assert.throws(() => gradientBigIntSeries([], ['1']), TypeError)
			assert.throws(() => gradientBigIntSeries([], [NaN]), TypeError)
		})

		test('rejects malformed term objects or non-BigInt coeff', () => {
			assert.throws(() => gradientBigIntSeries([null], [1n]), TypeError)
			assert.throws(() => gradientBigIntSeries([[]], [1n]), TypeError)
			assert.throws(() => gradientBigIntSeries([{ coeff: 2, powers: [1] }], [1n]), TypeError)
			assert.throws(() => gradientBigIntSeries([{ powers: [1] }], [1n]), TypeError)
			assert.throws(() => gradientBigIntSeries([{ coeff: 2n, powers: '1' }], [1n]), TypeError)
		})

		test('rejects powers length mismatch with point dimension', () => {
			assert.throws(
				() => gradientBigIntSeries([{ coeff: 1n, powers: [1] }], [1n, 2n]),
				RangeError,
			)
			assert.throws(
				() => gradientBigIntSeries([{ coeff: 1n, powers: [1, 2, 3] }], [1n, 2n]),
				RangeError,
			)
		})

		test('rejects negative, fractional, non-finite, unsafe, or non-numeric powers', () => {
			assert.throws(() => gradientBigIntSeries([{ coeff: 1n, powers: [-1] }], [2n]), RangeError)
			assert.throws(() => gradientBigIntSeries([{ coeff: 1n, powers: [-1n] }], [2n]), RangeError)
			assert.throws(() => gradientBigIntSeries([{ coeff: 1n, powers: [1.5] }], [2n]), RangeError)
			assert.throws(() => gradientBigIntSeries([{ coeff: 1n, powers: [NaN] }], [2n]), RangeError)
			assert.throws(
				() => gradientBigIntSeries([{ coeff: 1n, powers: [Infinity] }], [2n]),
				RangeError,
			)
			assert.throws(
				() =>
					gradientBigIntSeries([{ coeff: 1n, powers: [Number.MAX_SAFE_INTEGER + 1] }], [2n]),
				RangeError,
			)
			assert.throws(() => gradientBigIntSeries([{ coeff: 1n, powers: ['2'] }], [2n]), TypeError)
		})

		test('validates terms even when coeff is 0n', () => {
			assert.throws(() => gradientBigIntSeries([{ coeff: 0n, powers: [-1] }], [2n]), RangeError)
			assert.throws(
				() => gradientBigIntSeries([{ coeff: 0n, powers: [1, 2] }], [2n]),
				RangeError,
			)
		})
	})
})
