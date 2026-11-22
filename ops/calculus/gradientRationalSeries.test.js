import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { gradientRationalSeries } from './gradientRationalSeries.js'

/**
 * Helper to create a rational object from BigInt or integer inputs.
 */
function r(num, den = 1n) {
	return { num: BigInt(num), den: BigInt(den) }
}

function absBigInt(n) {
	return n < 0n ? -n : n
}

function gcdBigInt(a, b) {
	let x = a
	let y = b
	while (y !== 0n) {
		const t = x % y
		x = y
		y = t
	}
	return x
}

function normRat(num, den) {
	if (num === 0n) return { num: 0n, den: 1n }
	let n = num
	let d = den
	if (d < 0n) {
		n = -n
		d = -d
	}
	const g = gcdBigInt(absBigInt(n), d)
	return { num: n / g, den: d / g }
}

function addRat(a, b) {
	return normRat(a.num * b.den + b.num * a.den, a.den * b.den)
}

function subRat(a, b) {
	return normRat(a.num * b.den - b.num * a.den, a.den * b.den)
}

function mulRat(a, b) {
	return normRat(a.num * b.num, a.den * b.den)
}

function divRat(a, b) {
	return normRat(a.num * b.den, a.den * b.num)
}

function powRat(base, exp) {
	if (exp === 0) return { num: 1n, den: 1n }
	if (base.num === 0n) return { num: 0n, den: 1n }
	const e = BigInt(exp)
	return normRat(base.num ** e, base.den ** e)
}

function dotRat(u, v) {
	let acc = { num: 0n, den: 1n }
	for (let i = 0; i < u.length; i++) {
		acc = addRat(acc, mulRat(u[i], v[i]))
	}
	return acc
}

function toNumber(q) {
	// Scale to avoid BigInt->Number overflow for moderately large rationals
	const scale = 10n ** 15n
	const scaled = (q.num * scale) / q.den
	return Number(scaled) / 1e15
}

/**
 * Independent exact rational evaluator for a multivariate polynomial/power series f(x).
 */
function evalSeries(terms, point) {
	let sum = { num: 0n, den: 1n }
	for (const { coeff, powers } of terms) {
		let termVal = normRat(coeff.num, coeff.den)
		for (let j = 0; j < point.length; j++) {
			termVal = mulRat(termVal, powRat(point[j], powers[j]))
		}
		sum = addRat(sum, termVal)
	}
	return sum
}

/**
 * Verifies a rational object is strictly in canonical lowest terms.
 */
function assertLowestTerms(q) {
	assert.equal(typeof q.num, 'bigint', 'num must be BigInt')
	assert.equal(typeof q.den, 'bigint', 'den must be BigInt')
	assert.ok(q.den > 0n, `den must be > 0n, got ${q.den}`)
	if (q.num === 0n) {
		assert.equal(q.den, 1n, `zero must have den === 1n, got ${q.den}`)
	} else {
		assert.equal(
			gcdBigInt(absBigInt(q.num), q.den),
			1n,
			`rational ${q.num}/${q.den} is not in lowest terms`,
		)
	}
}

function assertGradientEquals(actual, expected) {
	assert.equal(actual.length, expected.length)
	for (let i = 0; i < actual.length; i++) {
		assertLowestTerms(actual[i])
		assert.deepEqual(actual[i], expected[i])
	}
}

describe('gradientRationalSeries', () => {
	describe('1D polynomials', () => {
		it('computes exact derivative of a 1D cubic polynomial with fractional coefficients', () => {
			// f(x) = (2/3)x^3 - (5/4)x^2 + (7/6)x - 11/2
			// f'(x) = 2x^2 - (5/2)x + 7/6
			const terms = [
				{ coeff: r(2, 3), powers: [3] },
				{ coeff: r(-5, 4), powers: [2] },
				{ coeff: r(7, 6), powers: [1] },
				{ coeff: r(-11, 2), powers: [0] },
			]
			// At x = 3/2: f'(3/2) = 2*(9/4) - (5/2)*(3/2) + 7/6 = 9/2 - 15/4 + 7/6 = (54 - 45 + 14)/12 = 23/12
			const grad = gradientRationalSeries(terms, [r(3, 2)])
			assertGradientEquals(grad, [r(23, 12)])
		})

		it('handles linear 1D function at any point including zero', () => {
			// f(x) = (4/9)x + 5/3 => f'(x) = 4/9
			const terms = [
				{ coeff: r(4, 9), powers: [1] },
				{ coeff: r(5, 3), powers: [0] },
			]
			assertGradientEquals(gradientRationalSeries(terms, [r(0, 1)]), [r(4, 9)])
			assertGradientEquals(gradientRationalSeries(terms, [r(-7, 13)]), [r(4, 9)])
		})
	})

	describe('2D and 3D polynomials', () => {
		it('computes exact gradient of a 2D polynomial', () => {
			// f(x, y) = 3x^2 y + (1/2) y^3 - (2/5) x y^2 + 4x - 7
			// df/dx = 6xy - (2/5)y^2 + 4
			// df/dy = 3x^2 + (3/2)y^2 - (4/5)xy
			const terms = [
				{ coeff: r(3, 1), powers: [2, 1] },
				{ coeff: r(1, 2), powers: [0, 3] },
				{ coeff: r(-2, 5), powers: [1, 2] },
				{ coeff: r(4, 1), powers: [1, 0] },
				{ coeff: r(-7, 1), powers: [0, 0] },
			]
			// At (x, y) = (2/3, 5/2):
			// df/dx = 6*(2/3)*(5/2) - (2/5)*(25/4) + 4 = 10 - 5/2 + 4 = 23/2
			// df/dy = 3*(4/9) + (3/2)*(25/4) - (4/5)*(2/3)*(5/2) = 4/3 + 75/8 - 4/3 = 75/8
			const grad = gradientRationalSeries(terms, [r(2, 3), r(5, 2)])
			assertGradientEquals(grad, [r(23, 2), r(75, 8)])
		})

		it('computes exact gradient of a 3D polynomial', () => {
			// f(x, y, z) = (1/3) x^3 y z^2 - 2 x y^2 z + (5/6) z^4 + 9 x - (1/4) y + 10
			// df/dx = x^2 y z^2 - 2 y^2 z + 9
			// df/dy = (1/3) x^3 z^2 - 4 x y z - 1/4
			// df/dz = (2/3) x^3 y z - 2 x y^2 + (10/3) z^3
			const terms = [
				{ coeff: r(1, 3), powers: [3, 1, 2] },
				{ coeff: r(-2, 1), powers: [1, 2, 1] },
				{ coeff: r(5, 6), powers: [0, 0, 4] },
				{ coeff: r(9, 1), powers: [1, 0, 0] },
				{ coeff: r(-1, 4), powers: [0, 1, 0] },
				{ coeff: r(10, 1), powers: [0, 0, 0] },
			]
			// At (1/2, -2, 3/2):
			// df/dx = (1/4)*(-2)*(9/4) - 2*(4)*(3/2) + 9 = -9/8 - 12 + 9 = -33/8
			// df/dy = (1/3)*(1/8)*(9/4) - 4*(1/2)*(-2)*(3/2) - 1/4 = 3/32 + 6 - 1/4 = (3 + 192 - 8)/32 = 187/32
			// df/dz = (2/3)*(1/8)*(-2)*(3/2) - 2*(1/2)*(4) + (10/3)*(27/8) = -1/4 - 4 + 45/4 = 7
			const grad = gradientRationalSeries(terms, [r(1, 2), r(-2, 1), r(3, 2)])
			assertGradientEquals(grad, [r(-33, 8), r(187, 32), r(7, 1)])
		})

		it('sums duplicate monomials and handles exact cancellation to zero', () => {
			// f(x, y) = (2/3)x^2 y + (1/3)x^2 y - x^2 y + (5/4)y^2
			// Simplifies to f(x, y) = (5/4)y^2 => grad = [0, (5/2)y]
			const terms = [
				{ coeff: r(2, 3), powers: [2, 1] },
				{ coeff: r(1, 3), powers: [2, 1] },
				{ coeff: r(-1, 1), powers: [2, 1] },
				{ coeff: r(5, 4), powers: [0, 2] },
			]
			const grad = gradientRationalSeries(terms, [r(7, 11), r(4, 15)])
			assertGradientEquals(grad, [r(0, 1), r(2, 3)])
		})
	})

	describe('edge cases: constants, empty terms, zero point, negative & unreduced rationals', () => {
		it('returns zero gradient for constant polynomials', () => {
			const terms = [{ coeff: r(42, 17), powers: [0, 0, 0] }]
			const grad = gradientRationalSeries(terms, [r(3, 5), r(-2, 7), r(11, 13)])
			assertGradientEquals(grad, [r(0, 1), r(0, 1), r(0, 1)])
			// Ensure returned zero objects are distinct
			assert.notEqual(grad[0], grad[1])
			assert.notEqual(grad[1], grad[2])
		})

		it('returns zero gradient for empty terms array', () => {
			const grad = gradientRationalSeries([], [r(1, 2), r(-3, 4)])
			assertGradientEquals(grad, [r(0, 1), r(0, 1)])
			assert.notEqual(grad[0], grad[1])
		})

		it('evaluates correctly at the zero point [0, 0, 0]', () => {
			// Only purely linear terms survive at origin (0^0 = 1, 0^k = 0 for k >= 1)
			const terms = [
				{ coeff: r(7, 3), powers: [1, 0, 0] },
				{ coeff: r(-5, 6), powers: [0, 1, 0] },
				{ coeff: r(11, 4), powers: [0, 0, 1] },
				{ coeff: r(100, 1), powers: [1, 1, 0] }, // xy -> vanishes at (0,0,0)
				{ coeff: r(50, 1), powers: [2, 0, 0] },  // x^2 -> vanishes at (0,0,0)
				{ coeff: r(99, 1), powers: [0, 0, 0] },  // constant -> 0
			]
			const grad = gradientRationalSeries(terms, [r(0, 1), r(0, 1), r(0, 1)])
			assertGradientEquals(grad, [r(7, 3), r(-5, 6), r(11, 4)])
		})

		it('handles partially zero coordinates without division by zero', () => {
			// f(x, y, z) = 5 x y^2 z + 3 y z^3 at (0, 2, -1/3)
			// df/dx = 5 y^2 z = 5 * 4 * (-1/3) = -20/3
			// df/dy = 10 x y z + 3 z^3 = 0 + 3 * (-1/27) = -1/9
			// df/dz = 5 x y^2 + 9 y z^2 = 0 + 9 * 2 * (1/9) = 2
			const terms = [
				{ coeff: r(5, 1), powers: [1, 2, 1] },
				{ coeff: r(3, 1), powers: [0, 1, 3] },
			]
			const grad = gradientRationalSeries(terms, [r(0, 1), r(2, 1), r(-1, 3)])
			assertGradientEquals(grad, [r(-20, 3), r(-1, 9), r(2, 1)])
		})

		it('handles negative coordinates and odd/even powers accurately', () => {
			// f(x, y) = (-3/4) x^3 y^2 + (2/7) x^4 y^3
			// df/dx = (-9/4) x^2 y^2 + (8/7) x^3 y^3
			// df/dy = (-3/2) x^3 y + (6/7) x^4 y^2
			const terms = [
				{ coeff: r(-3, 4), powers: [3, 2] },
				{ coeff: r(2, 7), powers: [4, 3] },
			]
			// At (-2, -1/2):
			// x^2 = 4, x^3 = -8, x^4 = 16; y = -1/2, y^2 = 1/4, y^3 = -1/8
			// df/dx = (-9/4)*4*(1/4) + (8/7)*(-8)*(-1/8) = -9/4 + 8/7 = (-63 + 32)/28 = -31/28
			// df/dy = (-3/2)*(-8)*(-1/2) + (6/7)*16*(1/4) = -6 + 24/7 = -18/7
			const grad = gradientRationalSeries(terms, [r(-2, 1), r(-1, 2)])
			assertGradientEquals(grad, [r(-31, 28), r(-18, 7)])
		})

		it('accepts unreduced rationals and negative denominators, returning canonical lowest terms', () => {
			// f(x, y) = (6/-9) x^2 y + (0/-5) x^3
			// Normalized coeff = -2/3; point = (4/-6, -10/-15) = (-2/3, 2/3)
			// df/dx = (-4/3) x y = (-4/3)*(-2/3)*(2/3) = 16/27
			// df/dy = (-2/3) x^2 = (-2/3)*(4/9) = -8/27
			const terms = [
				{ coeff: { num: 6n, den: -9n }, powers: [2, 1] },
				{ coeff: { num: 0n, den: -5n }, powers: [3, 0] },
			]
			const point = [
				{ num: 4n, den: -6n },
				{ num: -10n, den: -15n },
			]
			const grad = gradientRationalSeries(terms, point)
			assertGradientEquals(grad, [r(16, 27), r(-8, 27)])
			// Verify inputs were not mutated
			assert.deepEqual(terms[0].coeff, { num: 6n, den: -9n })
			assert.deepEqual(point[0], { num: 4n, den: -6n })
		})

		it('handles large BigInt numerators and denominators without precision loss', () => {
			// f(x, y) = x^10 + y^10 at (10^12 + 1) / 10^12, ...
			const big = 10n ** 12n
			const x = { num: big + 1n, den: big }
			const y = { num: -big + 1n, den: big }
			const terms = [
				{ coeff: r(1, 1), powers: [3, 0] },
				{ coeff: r(1, 1), powers: [0, 3] },
			]
			const grad = gradientRationalSeries(terms, [x, y])
			const expectedX = normRat(3n * (big + 1n) ** 2n, big ** 2n)
			const expectedY = normRat(3n * (-big + 1n) ** 2n, big ** 2n)
			assertGradientEquals(grad, [expectedX, expectedY])
		})
	})

	describe('input validation', () => {
		it('throws TypeError for non-array terms or point', () => {
			assert.throws(() => gradientRationalSeries(null, [r(1)]), TypeError)
			assert.throws(() => gradientRationalSeries('not-array', [r(1)]), TypeError)
			assert.throws(() => gradientRationalSeries([], null), TypeError)
			assert.throws(() => gradientRationalSeries([], { num: 1n, den: 1n }), TypeError)
		})

		it('throws RangeError for empty point vector', () => {
			assert.throws(() => gradientRationalSeries([], []), RangeError)
		})

		it('throws TypeError or RangeError for invalid rationals in point', () => {
			assert.throws(() => gradientRationalSeries([], [null]), TypeError)
			assert.throws(() => gradientRationalSeries([], [{ num: 1, den: 2 }]), TypeError)
			assert.throws(() => gradientRationalSeries([], [{ num: 1n, den: 2 }]), TypeError)
			assert.throws(() => gradientRationalSeries([], [{ num: 1n }]), TypeError)
			assert.throws(() => gradientRationalSeries([], [{ num: 1n, den: 0n }]), RangeError)
		})

		it('throws TypeError or RangeError for malformed term objects and coefficients', () => {
			assert.throws(() => gradientRationalSeries([null], [r(1)]), TypeError)
			assert.throws(() => gradientRationalSeries([42], [r(1)]), TypeError)
			assert.throws(
				() => gradientRationalSeries([{ coeff: { num: 1, den: 1 }, powers: [1] }], [r(1)]),
				TypeError,
			)
			assert.throws(
				() => gradientRationalSeries([{ coeff: { num: 1n, den: 0n }, powers: [1] }], [r(1)]),
				RangeError,
			)
		})

		it('throws TypeError or RangeError for invalid powers arrays and exponents', () => {
			// powers not an array
			assert.throws(
				() => gradientRationalSeries([{ coeff: r(1), powers: '1' }], [r(1)]),
				TypeError,
			)
			// dimension mismatch
			assert.throws(
				() => gradientRationalSeries([{ coeff: r(1), powers: [1, 2] }], [r(1)]),
				RangeError,
			)
			assert.throws(
				() => gradientRationalSeries([{ coeff: r(1), powers: [1] }], [r(1), r(2)]),
				RangeError,
			)
			// non-number exponent
			assert.throws(
				() => gradientRationalSeries([{ coeff: r(1), powers: [1n] }], [r(1)]),
				TypeError,
			)
			assert.throws(
				() => gradientRationalSeries([{ coeff: r(1), powers: ['2'] }], [r(1)]),
				TypeError,
			)
			// negative, fractional, NaN, Infinity, unsafe integer exponents
			assert.throws(
				() => gradientRationalSeries([{ coeff: r(1), powers: [-1] }], [r(1)]),
				RangeError,
			)
			assert.throws(
				() => gradientRationalSeries([{ coeff: r(1), powers: [1.5] }], [r(1)]),
				RangeError,
			)
			assert.throws(
				() => gradientRationalSeries([{ coeff: r(1), powers: [Number.NaN] }], [r(1)]),
				RangeError,
			)
			assert.throws(
				() => gradientRationalSeries([{ coeff: r(1), powers: [Infinity] }], [r(1)]),
				RangeError,
			)
			assert.throws(
				() => gradientRationalSeries([{ coeff: r(1), powers: [Number.MAX_SAFE_INTEGER + 1] }], [r(1)]),
				RangeError,
			)
			// invalid powers still rejected even when coeff is 0
			assert.throws(
				() => gradientRationalSeries([{ coeff: r(0), powers: [-2] }], [r(1)]),
				RangeError,
			)
		})
	})

	describe('mathematical cross-checks', () => {
		it("satisfies Euler's homogeneous function theorem: x · grad(f)(x) = d * f(x) exactly", () => {
			// Degree 3 homogeneous polynomial in 3 variables
			const hom3D = [
				{ coeff: r(2, 5), powers: [3, 0, 0] },
				{ coeff: r(-7, 3), powers: [2, 1, 0] },
				{ coeff: r(5, 4), powers: [1, 1, 1] },
				{ coeff: r(-1, 6), powers: [0, 2, 1] },
				{ coeff: r(11, 7), powers: [0, 0, 3] },
			]
			const points3D = [
				[r(3, 2), r(-4, 5), r(7, 3)],
				[r(-1, 7), r(0, 1), r(5, 2)],
				[r(-2, 3), r(-5, 4), r(-1, 6)],
			]
			for (const pt of points3D) {
				const grad = gradientRationalSeries(hom3D, pt)
				for (const g of grad) assertLowestTerms(g)
				const lhs = dotRat(pt, grad)
				const rhs = mulRat(r(3, 1), evalSeries(hom3D, pt))
				assert.deepEqual(lhs, rhs)
			}

			// Degree 5 homogeneous polynomial in 4 variables
			const hom4D = [
				{ coeff: r(3, 8), powers: [2, 1, 1, 1] },
				{ coeff: r(-5, 11), powers: [5, 0, 0, 0] },
				{ coeff: r(7, 13), powers: [0, 3, 2, 0] },
				{ coeff: r(19, 6), powers: [1, 0, 1, 3] },
				{ coeff: r(-2, 9), powers: [0, 1, 0, 4] },
			]
			const pt4D = [r(2, 3), r(-3, 5), r(4, 7), r(-5, 9)]
			const grad4D = gradientRationalSeries(hom4D, pt4D)
			for (const g of grad4D) assertLowestTerms(g)
			const lhs4D = dotRat(pt4D, grad4D)
			const rhs4D = mulRat(r(5, 1), evalSeries(hom4D, pt4D))
			assert.deepEqual(lhs4D, rhs4D)
		})

		it('matches central finite-difference directional derivative (exact for quadratics, tight for higher degree)', () => {
			// Part A: For any quadratic polynomial, (f(x + hv) - f(x - hv)) / (2h) === grad(f)(x) · v EXACTLY
			const quadTerms = [
				{ coeff: r(3, 2), powers: [2, 0, 0] },
				{ coeff: r(-5, 3), powers: [0, 2, 0] },
				{ coeff: r(7, 4), powers: [0, 0, 2] },
				{ coeff: r(2, 5), powers: [1, 1, 0] },
				{ coeff: r(-4, 7), powers: [1, 0, 1] },
				{ coeff: r(9, 11), powers: [0, 1, 1] },
				{ coeff: r(-3, 1), powers: [1, 0, 0] },
				{ coeff: r(5, 6), powers: [0, 1, 0] },
				{ coeff: r(-1, 8), powers: [0, 0, 1] },
				{ coeff: r(13, 3), powers: [0, 0, 0] },
			]
			const x0 = [r(2, 3), r(-5, 4), r(7, 6)]
			const dir = [r(3, 5), r(-2, 7), r(11, 13)]
			const hExact = r(1, 17)
			const xPlus = x0.map((xi, i) => addRat(xi, mulRat(hExact, dir[i])))
			const xMinus = x0.map((xi, i) => subRat(xi, mulRat(hExact, dir[i])))
			const centralDiffExact = divRat(
				subRat(evalSeries(quadTerms, xPlus), evalSeries(quadTerms, xMinus)),
				mulRat(r(2, 1), hExact),
			)
			const gradQuad = gradientRationalSeries(quadTerms, x0)
			for (const g of gradQuad) assertLowestTerms(g)
			assert.deepEqual(dotRat(gradQuad, dir), centralDiffExact)

			// Part B: Higher-degree 3D polynomial — central finite difference with h = 1/10^6 matches to < 1e-11
			const quarticTerms = [
				{ coeff: r(1, 3), powers: [4, 0, 0] },
				{ coeff: r(-2, 5), powers: [2, 2, 0] },
				{ coeff: r(3, 7), powers: [1, 1, 2] },
				{ coeff: r(-1, 2), powers: [0, 3, 1] },
				{ coeff: r(5, 4), powers: [0, 0, 3] },
				{ coeff: r(-7, 6), powers: [1, 0, 1] },
			]
			const hSmall = r(1, 10n ** 6n)
			const xPlusS = x0.map((xi, i) => addRat(xi, mulRat(hSmall, dir[i])))
			const xMinusS = x0.map((xi, i) => subRat(xi, mulRat(hSmall, dir[i])))
			const centralDiffApprox = divRat(
				subRat(evalSeries(quarticTerms, xPlusS), evalSeries(quarticTerms, xMinusS)),
				mulRat(r(2, 1), hSmall),
			)
			const gradQuartic = gradientRationalSeries(quarticTerms, x0)
			for (const g of gradQuartic) assertLowestTerms(g)
			const exactDirDeriv = dotRat(gradQuartic, dir)
			const diffFloat = Math.abs(toNumber(exactDirDeriv) - toNumber(centralDiffApprox))
			assert.ok(
				diffFloat < 1e-10,
				`Expected directional derivative error < 1e-10, got ${diffFloat}`,
			)
		})

		it('satisfies exact derivative shift identity and Math.exp cross-check for truncated Taylor series of exp(x + 2y)', () => {
			// f_N(x, y) = sum_{a + b <= N} (2^b / (a! b!)) x^a y^b
			// Exact identity: df_N/dx = f_{N-1}(x, y), df_N/dy = 2 * f_{N-1}(x, y)
			function factorial(n) {
				let res = 1n
				for (let k = 2n; k <= BigInt(n); k++) res *= k
				return res
			}
			function buildExpSeries(degree) {
				const terms = []
				for (let a = 0; a <= degree; a++) {
					for (let b = 0; b <= degree - a; b++) {
						const coeff = normRat(2n ** BigInt(b), factorial(a) * factorial(b))
						terms.push({ coeff, powers: [a, b] })
					}
				}
				return terms
			}

			const N = 12
			const fN = buildExpSeries(N)
			const fNMinus1 = buildExpSeries(N - 1)
			const pt = [r(1, 5), r(-1, 10)] // x + 2y = 0.2 - 0.2 = 0 -> exp(0) = 1
			const grad0 = gradientRationalSeries(fN, pt)
			const valPrev0 = evalSeries(fNMinus1, pt)
			assertGradientEquals(grad0, [valPrev0, mulRat(r(2, 1), valPrev0)])

			// At non-trivial point (1/4, 1/8): x + 2y = 1/2
			const pt2 = [r(1, 4), r(1, 8)]
			const grad2 = gradientRationalSeries(fN, pt2)
			const valPrev2 = evalSeries(fNMinus1, pt2)
			assertGradientEquals(grad2, [valPrev2, mulRat(r(2, 1), valPrev2)])

			const expectedExp = Math.exp(0.25 + 2 * 0.125)
			assert.ok(Math.abs(toNumber(grad2[0]) - expectedExp) < 1e-10)
			assert.ok(Math.abs(toNumber(grad2[1]) - 2 * expectedExp) < 1e-10)
		})
	})
})
