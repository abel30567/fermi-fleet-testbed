import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { gradientRationalIterative } from './gradientRationalIterative.js'

/** Helper to construct a BigInt rational. */
const q = (num, den = 1n) => ({ num: BigInt(num), den: BigInt(den) })

/** Independent rational arithmetic helpers for test verification. */
function testGcd(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const t = x % y
		x = y
		y = t
	}
	return x
}

function testReduce(num, den) {
	if (num === 0n) return { num: 0n, den: 1n }
	let n = num
	let d = den
	if (d < 0n) {
		n = -n
		d = -d
	}
	const g = testGcd(n, d)
	return { num: n / g, den: d / g }
}

function testAdd(a, b) {
	return testReduce(a.num * b.den + b.num * a.den, a.den * b.den)
}

function testSub(a, b) {
	return testReduce(a.num * b.den - b.num * a.den, a.den * b.den)
}

function testMul(a, b) {
	return testReduce(a.num * b.num, a.den * b.den)
}

function testDiv(a, b) {
	return testReduce(a.num * b.den, a.den * b.num)
}

function testPow(a, e) {
	const exp = BigInt(e)
	if (exp === 0n) return { num: 1n, den: 1n }
	return testReduce(a.num ** exp, a.den ** exp)
}

/** Independent multivariate polynomial evaluator f(point). */
function evalPoly(terms, point) {
	let total = q(0n)
	for (const { coeff, powers } of terms) {
		let termVal = testReduce(coeff.num, coeff.den)
		for (let k = 0; k < point.length; k++) {
			termVal = testMul(termVal, testPow(point[k], powers[k]))
		}
		total = testAdd(total, termVal)
	}
	return total
}

/** Independent dot product of two rational vectors. */
function dot(u, v) {
	let sum = q(0n)
	for (let i = 0; i < u.length; i++) {
		sum = testAdd(sum, testMul(u[i], v[i]))
	}
	return sum
}

/** Assert every entry in a rational vector is strictly normalized (lowest terms, den > 0n). */
function assertCanonicalRationals(vec) {
	for (const r of vec) {
		assert.equal(typeof r.num, 'bigint')
		assert.equal(typeof r.den, 'bigint')
		assert.ok(r.den > 0n, `expected den > 0n, got ${r.den}`)
		if (r.num === 0n) {
			assert.equal(r.den, 1n)
		} else {
			assert.equal(testGcd(r.num, r.den), 1n)
		}
	}
}

describe('gradientRationalIterative', () => {
	describe('1D, 2D, and 3D polynomials', () => {
		it('computes exact derivative of a 1D cubic polynomial at a fractional point', () => {
			// f(x) = (1/3)x^3 - (5/2)x^2 + 7x - 4
			// f'(x) = x^2 - 5x + 7
			// At x = 3/2: 9/4 - 15/2 + 7 = (9 - 30 + 28)/4 = 7/4
			const terms = [
				{ coeff: q(1, 3), powers: [3] },
				{ coeff: q(-5, 2), powers: [2] },
				{ coeff: q(7, 1), powers: [1] },
				{ coeff: q(-4, 1), powers: [0] },
			]
			const grad = gradientRationalIterative(terms, [q(3, 2)])
			assertCanonicalRationals(grad)
			assert.deepEqual(grad, [q(7, 4)])
		})

		it('computes exact gradient of a 2D multi-term mixed-power polynomial at a fractional point', () => {
			// f(x, y) = (3/2)x^2*y - (4/5)x*y^3 + (1/7)y^2 - 9
			// df/dx = 3xy - (4/5)y^3
			// df/dy = (3/2)x^2 - (12/5)xy^2 + (2/7)y
			// At (x, y) = (-2/3, 5/4):
			// df/dx = 3*(-2/3)*(5/4) - (4/5)*(125/64) = -5/2 - 25/16 = -65/16
			// df/dy = (3/2)*(4/9) - (12/5)*(-2/3)*(25/16) + (2/7)*(5/4)
			//       = 2/3 + 5/2 + 5/14 = (28 + 105 + 15)/42 = 148/42 = 74/21
			const terms = [
				{ coeff: q(3, 2), powers: [2, 1] },
				{ coeff: q(-4, 5), powers: [1, 3] },
				{ coeff: q(1, 7), powers: [0, 2] },
				{ coeff: q(-9, 1), powers: [0, 0] },
			]
			const grad = gradientRationalIterative(terms, [q(-2, 3), q(5, 4)])
			assertCanonicalRationals(grad)
			assert.deepEqual(grad, [q(-65, 16), q(74, 21)])
		})

		it('computes exact gradient of a 3D multi-term polynomial with mixed number/bigint exponents', () => {
			// f(x, y, z) = (2/3)x^2*y*z^3 - (1/4)x*z^2 + 5y^2 - (3/7)x*y*z + 11/13
			// At (x, y, z) = (1/2, -3/5, 2/3):
			// df/dx = (4/3)x*y*z^3 - (1/4)z^2 - (3/7)y*z
			//       = (4/3)*(1/2)*(-3/5)*(8/27) - (1/4)*(4/9) - (3/7)*(-3/5)*(2/3)
			//       = -16/135 - 1/9 + 6/35
			//       = (-16*7 - 105 + 6*27) / 945 = (-112 - 105 + 162)/945 = -55/945 = -11/189
			// df/dy = (2/3)x^2*z^3 + 10y - (3/7)x*z
			//       = (2/3)*(1/4)*(8/27) + 10*(-3/5) - (3/7)*(1/2)*(2/3)
			//       = 4/81 - 6 - 1/7
			//       = (28 - 3402 - 81)/567 = -3455/567
			// df/dz = 2x^2*y*z^2 - (1/2)x*z - (3/7)x*y
			//       = 2*(1/4)*(-3/5)*(4/9) - (1/2)*(1/2)*(2/3) - (3/7)*(1/2)*(-3/5)
			//       = -2/15 - 1/6 + 9/70
			//       = (-28 - 35 + 27)/210 = -36/210 = -6/35
			const terms = [
				{ coeff: q(2, 3), powers: [2, 1n, 3n] },
				{ coeff: q(-1, 4), powers: [1n, 0, 2] },
				{ coeff: q(5, 1), powers: [0n, 2, 0n] },
				{ coeff: q(-3, 7), powers: [1, 1, 1] },
				{ coeff: q(11, 13), powers: [0, 0, 0] },
			]
			const grad = gradientRationalIterative(terms, [q(1, 2), q(-3, 5), q(2, 3)])
			assertCanonicalRationals(grad)
			assert.deepEqual(grad, [q(-11, 189), q(-3455, 567), q(-6, 35)])
		})
	})

	describe('edge cases', () => {
		it('returns zero gradient for constant polynomials and empty terms', () => {
			const constantTerms = [{ coeff: q(42, 5), powers: [0, 0, 0] }]
			const pt = [q(3, 7), q(-11, 2), q(0, 1)]

			const gradConst = gradientRationalIterative(constantTerms, pt)
			assertCanonicalRationals(gradConst)
			assert.deepEqual(gradConst, [q(0, 1), q(0, 1), q(0, 1)])

			const gradEmpty = gradientRationalIterative([], pt)
			assertCanonicalRationals(gradEmpty)
			assert.deepEqual(gradEmpty, [q(0, 1), q(0, 1), q(0, 1)])
			// Ensure returned zero objects are distinct instances
			assert.notEqual(gradEmpty[0], gradEmpty[1])
		})

		it('handles zero coordinates accurately using polynomial 0^0 = 1 convention', () => {
			// f(x, y) = (5/7)x + (3/4)x^2 + (2/9)x*y + (11/13)y
			// At (0, 0): grad = [5/7, 11/13]
			// At (0, 3/2): df/dx = 5/7 + 0 + (2/9)*(3/2) = 5/7 + 1/3 = 22/21
			//              df/dy = 0 + 11/13 = 11/13
			const terms = [
				{ coeff: q(5, 7), powers: [1, 0] },
				{ coeff: q(3, 4), powers: [2, 0] },
				{ coeff: q(2, 9), powers: [1, 1] },
				{ coeff: q(11, 13), powers: [0, 1] },
			]
			assert.deepEqual(gradientRationalIterative(terms, [q(0), q(0)]), [
				q(5, 7),
				q(11, 13),
			])
			assert.deepEqual(gradientRationalIterative(terms, [q(0), q(3, 2)]), [
				q(22, 21),
				q(11, 13),
			])
		})

		it('normalizes unreduced inputs and negative denominators to canonical lowest terms', () => {
			// f(x, y) = (-4/-6)x^2 + (0/-5)y^3 + (6/-9)x*y
			//         = (2/3)x^2 - (2/3)x*y
			// At (x, y) = (10/-4, -9/-3) = (-5/2, 3):
			// df/dx = (4/3)(-5/2) - (2/3)(3) = -10/3 - 2 = -16/3
			// df/dy = -(2/3)(-5/2) = 5/3
			const terms = [
				{ coeff: { num: -4n, den: -6n }, powers: [2, 0] },
				{ coeff: { num: 0n, den: -5n }, powers: [0, 3] },
				{ coeff: { num: 6n, den: -9n }, powers: [1, 1] },
			]
			const grad = gradientRationalIterative(terms, [
				{ num: 10n, den: -4n },
				{ num: -9n, den: -3n },
			])
			assertCanonicalRationals(grad)
			assert.deepEqual(grad, [q(-16, 3), q(5, 3)])
		})

		it('sums duplicate monomials and cancels terms to canonical zero { 0n, 1n }', () => {
			const terms = [
				{ coeff: q(1, 3), powers: [2, 1] },
				{ coeff: q(-1, 3), powers: [2, 1] },
				{ coeff: q(2, 5), powers: [0, 2] },
				{ coeff: q(3, 5), powers: [0, 2] },
			]
			// Effectively f(x, y) = y^2 => grad = [0, 2y]
			const grad = gradientRationalIterative(terms, [q(7, 11), q(-3, 8)])
			assertCanonicalRationals(grad)
			assert.deepEqual(grad, [q(0, 1), q(-3, 4)])
		})

		it('preserves exactness for large BigInt coefficients and high powers', () => {
			// f(x) = (1 / 10^20) * x^12 at x = 10^2
			// f'(x) = (12 / 10^20) * x^11 = 12 * 10^22 / 10^20 = 1200
			const bigDen = 10n ** 20n
			const terms = [{ coeff: { num: 1n, den: bigDen }, powers: [12n] }]
			const grad = gradientRationalIterative(terms, [{ num: 100n, den: 1n }])
			assertCanonicalRationals(grad)
			assert.deepEqual(grad, [{ num: 1200n, den: 1n }])
		})
	})

	describe('input validation', () => {
		it('throws TypeError for non-array terms or point', () => {
			assert.throws(() => gradientRationalIterative(null, [q(1)]), TypeError)
			assert.throws(() => gradientRationalIterative({}, [q(1)]), TypeError)
			assert.throws(() => gradientRationalIterative([], null), TypeError)
			assert.throws(() => gradientRationalIterative([], 'not-an-array'), TypeError)
		})

		it('throws RangeError for empty point vector', () => {
			assert.throws(() => gradientRationalIterative([], []), RangeError)
		})

		it('throws TypeError/RangeError for invalid rational values in point or term.coeff', () => {
			assert.throws(() => gradientRationalIterative([], [null]), TypeError)
			assert.throws(() => gradientRationalIterative([], [[1n, 2n]]), TypeError)
			assert.throws(() => gradientRationalIterative([], [{ num: 1, den: 2n }]), TypeError)
			assert.throws(() => gradientRationalIterative([], [{ num: 1n, den: 2 }]), TypeError)
			assert.throws(() => gradientRationalIterative([], [{ num: 1n, den: 0n }]), RangeError)

			assert.throws(
				() => gradientRationalIterative([null], [q(1)]),
				TypeError
			)
			assert.throws(
				() => gradientRationalIterative([[q(1), [1]]], [q(1)]),
				TypeError
			)
			assert.throws(
				() => gradientRationalIterative([{ coeff: { num: 1, den: 1n }, powers: [1] }], [q(1)]),
				TypeError
			)
			assert.throws(
				() => gradientRationalIterative([{ coeff: { num: 1n, den: 0n }, powers: [1] }], [q(1)]),
				RangeError
			)
		})

		it('throws TypeError/RangeError for invalid powers arrays, dimension mismatches, or invalid exponents', () => {
			assert.throws(
				() => gradientRationalIterative([{ coeff: q(1), powers: '1' }], [q(1)]),
				TypeError
			)
			assert.throws(
				() => gradientRationalIterative([{ coeff: q(1), powers: [1, 2] }], [q(1)]),
				RangeError
			)
			assert.throws(
				() => gradientRationalIterative([{ coeff: q(1), powers: ['2'] }], [q(1)]),
				TypeError
			)
			assert.throws(
				() => gradientRationalIterative([{ coeff: q(1), powers: [-1] }], [q(1)]),
				RangeError
			)
			assert.throws(
				() => gradientRationalIterative([{ coeff: q(1), powers: [-2n] }], [q(1)]),
				RangeError
			)
			assert.throws(
				() => gradientRationalIterative([{ coeff: q(1), powers: [1.5] }], [q(1)]),
				RangeError
			)
			assert.throws(
				() => gradientRationalIterative([{ coeff: q(1), powers: [Number.NaN] }], [q(1)]),
				RangeError
			)
			assert.throws(
				() => gradientRationalIterative([{ coeff: q(1), powers: [Number.POSITIVE_INFINITY] }], [q(1)]),
				RangeError
			)
			assert.throws(
				() => gradientRationalIterative([{ coeff: q(1), powers: [Number.MAX_SAFE_INTEGER + 1] }], [q(1)]),
				RangeError
			)
			// Invalid power must still throw even when term coeff is zero
			assert.throws(
				() => gradientRationalIterative([{ coeff: q(0, 1), powers: [-1] }], [q(1)]),
				RangeError
			)
		})
	})

	describe('mathematical cross-checks', () => {
		it('matches exact central and directional finite differences for quadratic polynomials', () => {
			// For any quadratic f(x), (f(x + h*v) - f(x - h*v)) / (2h) === v · grad(f)(x)
			// identically for every rational step h != 0 and direction v.
			const quad3D = [
				{ coeff: q(5, 3), powers: [2, 0, 0] },
				{ coeff: q(-7, 4), powers: [0, 2, 0] },
				{ coeff: q(11, 6), powers: [0, 0, 2] },
				{ coeff: q(3, 5), powers: [1, 1, 0] },
				{ coeff: q(-2, 7), powers: [1, 0, 1] },
				{ coeff: q(13, 8), powers: [0, 1, 1] },
				{ coeff: q(-4, 9), powers: [1, 0, 0] },
				{ coeff: q(1, 2), powers: [0, 1, 0] },
				{ coeff: q(-5, 11), powers: [0, 0, 1] },
				{ coeff: q(19, 13), powers: [0, 0, 0] },
			]

			const points = [
				[q(2, 3), q(-5, 7), q(4, 9)],
				[q(0, 1), q(3, 11), q(-1, 2)],
				[q(-17, 5), q(13, 6), q(-8, 3)],
			]
			const steps = [q(1, 7), q(3, 11), q(1, 1000)]

			for (const pt of points) {
				const grad = gradientRationalIterative(quad3D, pt)
				assertCanonicalRationals(grad)

				// Coordinate-axis central differences
				for (const h of steps) {
					const twoH = testMul(q(2), h)
					for (let j = 0; j < pt.length; j++) {
						const ptPlus = pt.map((c, k) => (k === j ? testAdd(c, h) : c))
						const ptMinus = pt.map((c, k) => (k === j ? testSub(c, h) : c))
						const diff = testDiv(
							testSub(evalPoly(quad3D, ptPlus), evalPoly(quad3D, ptMinus)),
							twoH
						)
						assert.deepEqual(grad[j], diff)
					}

					// Arbitrary directional central difference
					const dir = [q(-3, 5), q(7, 4), q(2, 9)]
					const ptPlusDir = pt.map((c, k) => testAdd(c, testMul(h, dir[k])))
					const ptMinusDir = pt.map((c, k) => testSub(c, testMul(h, dir[k])))
					const dirDiff = testDiv(
						testSub(evalPoly(quad3D, ptPlusDir), evalPoly(quad3D, ptMinusDir)),
						twoH
					)
					assert.deepEqual(dot(dir, grad), dirDiff)
				}
			}
		})

		it("satisfies Euler's homogeneous function theorem: x · grad(f)(x) = k * f(x)", () => {
			const homogeneousCases = [
				{
					degree: 1n,
					terms: [
						{ coeff: q(3, 5), powers: [1, 0, 0] },
						{ coeff: q(-7, 2), powers: [0, 1, 0] },
						{ coeff: q(11, 13), powers: [0, 0, 1] },
					],
					point: [q(-4, 7), q(9, 11), q(5, 3)],
				},
				{
					degree: 3n,
					terms: [
						{ coeff: q(2, 3), powers: [3, 0, 0] },
						{ coeff: q(-5, 4), powers: [2, 1, 0] },
						{ coeff: q(7, 6), powers: [1, 1, 1] },
						{ coeff: q(-1, 5), powers: [0, 2, 1] },
						{ coeff: q(13, 9), powers: [0, 0, 3] },
					],
					point: [q(3, 4), q(-2, 5), q(7, 6)],
				},
				{
					degree: 4n,
					terms: [
						{ coeff: q(5, 7), powers: [4, 0] },
						{ coeff: q(-3, 2), powers: [3, 1] },
						{ coeff: q(11, 8), powers: [2, 2] },
						{ coeff: q(-4, 9), powers: [1, 3] },
						{ coeff: q(1, 6), powers: [0, 4] },
					],
					point: [q(-5, 3), q(4, 9)],
				},
				{
					degree: 5n,
					terms: [
						{ coeff: q(1, 2), powers: [2, 1, 1, 1] },
						{ coeff: q(-3, 7), powers: [0, 3, 2, 0] },
						{ coeff: q(4, 5), powers: [1, 0, 1, 3] },
						{ coeff: q(-9, 11), powers: [5, 0, 0, 0] },
					],
					point: [q(2, 3), q(-1, 4), q(3, 5), q(-7, 2)],
				},
			]

			for (const { degree, terms, point } of homogeneousCases) {
				const grad = gradientRationalIterative(terms, point)
				assertCanonicalRationals(grad)
				const lhs = dot(point, grad)
				const rhs = testMul(q(degree), evalPoly(terms, point))
				assert.deepEqual(lhs, rhs)
			}
		})

		it('satisfies linearity: grad(a*f + b*g) = a*grad(f) + b*grad(g)', () => {
			const f = [
				{ coeff: q(2, 3), powers: [2, 1] },
				{ coeff: q(-5, 7), powers: [0, 3] },
			]
			const g = [
				{ coeff: q(4, 9), powers: [1, 2] },
				{ coeff: q(3, 11), powers: [3, 0] },
				{ coeff: q(-1, 2), powers: [1, 0] },
			]
			const alpha = q(7, 5)
			const beta = q(-3, 4)
			const pt = [q(-2, 5), q(5, 6)]

			const combined = [
				...f.map((t) => ({ coeff: testMul(alpha, t.coeff), powers: t.powers })),
				...g.map((t) => ({ coeff: testMul(beta, t.coeff), powers: t.powers })),
			]

			const gradCombined = gradientRationalIterative(combined, pt)
			const gradF = gradientRationalIterative(f, pt)
			const gradG = gradientRationalIterative(g, pt)
			const expected = gradF.map((val, j) =>
				testAdd(testMul(alpha, val), testMul(beta, gradG[j]))
			)

			assert.deepEqual(gradCombined, expected)
		})
	})
})
