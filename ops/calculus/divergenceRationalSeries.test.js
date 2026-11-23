import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { divergenceRationalSeries } from './divergenceRationalSeries.js'

/** @param {bigint | number} n @param {bigint | number} [d=1n] */
const R = (n, d = 1n) => ({ num: BigInt(n), den: BigInt(d) })

/** @param {bigint} a @param {bigint} b */
function gcd(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const t = x % y
		x = y
		y = t
	}
	return x
}

/** @param {{ num: bigint, den: bigint }} q */
function assertNormalized(q) {
	assert.equal(typeof q.num, 'bigint')
	assert.equal(typeof q.den, 'bigint')
	assert.ok(q.den > 0n, `expected den > 0n, got ${q.den}`)
	assert.equal(gcd(q.num, q.den), 1n, `expected reduced fraction, got ${q.num}/${q.den}`)
	if (q.num === 0n) {
		assert.equal(q.den, 1n)
	}
}

/** @param {{ num: bigint, den: bigint }} a @param {{ num: bigint, den: bigint }} b */
function addR(a, b) {
	const num = a.num * b.den + b.num * a.den
	const den = a.den * b.den
	if (num === 0n) return { num: 0n, den: 1n }
	const s = den < 0n ? -1n : 1n
	const g = gcd(num * s, den * s)
	return { num: (num * s) / g, den: (den * s) / g }
}

/** @param {{ num: bigint, den: bigint }} a @param {{ num: bigint, den: bigint }} b */
function subR(a, b) {
	return addR(a, { num: -b.num, den: b.den })
}

/** @param {{ num: bigint, den: bigint }} a @param {{ num: bigint, den: bigint }} b */
function mulR(a, b) {
	const num = a.num * b.num
	const den = a.den * b.den
	if (num === 0n) return { num: 0n, den: 1n }
	const s = den < 0n ? -1n : 1n
	const g = gcd(num * s, den * s)
	return { num: (num * s) / g, den: (den * s) / g }
}

/**
 * Symbolically differentiates a polynomial component with respect to variable `varIdx`.
 * @param {{ coeff: { num: bigint, den: bigint }, powers: number[] }[]} terms
 * @param {number} varIdx
 */
function partialDiffPoly(terms, varIdx) {
	const out = []
	for (const term of terms) {
		const p = term.powers[varIdx]
		if (p === 0) continue
		const nextPowers = term.powers.slice()
		nextPowers[varIdx] = p - 1
		out.push({
			coeff: mulR(term.coeff, R(p)),
			powers: nextPowers,
		})
	}
	return out
}

/**
 * Negates a polynomial component.
 * @param {{ coeff: { num: bigint, den: bigint }, powers: number[] }[]} terms
 */
function negatePoly(terms) {
	return terms.map((t) => ({
		coeff: { num: -t.coeff.num, den: t.coeff.den },
		powers: t.powers.slice(),
	}))
}

/**
 * Symbolically computes curl(G) = (dGz/dy - dGy/dz, dGx/dz - dGz/dx, dGy/dx - dGx/dy)
 * for a 3D polynomial vector field G.
 * @param {{ coeff: { num: bigint, den: bigint }, powers: number[] }[][]} G
 */
function symbolicCurl3D(G) {
	const [Gx, Gy, Gz] = G
	return [
		[...partialDiffPoly(Gz, 1), ...negatePoly(partialDiffPoly(Gy, 2))],
		[...partialDiffPoly(Gx, 2), ...negatePoly(partialDiffPoly(Gz, 0))],
		[...partialDiffPoly(Gy, 0), ...negatePoly(partialDiffPoly(Gx, 1))],
	]
}

/**
 * Scales a polynomial vector field by a rational scalar.
 */
function scaleField(scalar, field) {
	return field.map((comp) =>
		comp.map((t) => ({
			coeff: mulR(scalar, t.coeff),
			powers: t.powers.slice(),
		})),
	)
}

/**
 * Adds two polynomial vector fields of the same dimension.
 */
function addFields(F, G) {
	return F.map((comp, i) => [...comp, ...G[i]])
}

/**
 * Evaluates a single polynomial component at a rational point (for independent checks).
 */
function evalPoly(terms, point) {
	let acc = R(0)
	for (const { coeff, powers } of terms) {
		let val = coeff
		for (let j = 0; j < powers.length; j++) {
			for (let k = 0; k < powers[j]; k++) {
				val = mulR(val, point[j])
			}
		}
		acc = addR(acc, val)
	}
	return acc
}

describe('divergenceRationalSeries', () => {
	test('1D polynomial derivative at exact rational point', () => {
		// F(x) = [3 x^4 - (2/5) x^2 + 7 x - 1/3]
		// div F(x) = F'(x) = 12 x^3 - (4/5) x + 7
		// At x = -1/2: 12(-1/8) - (4/5)(-1/2) + 7 = -3/2 + 2/5 + 7 = (-15 + 4 + 70)/10 = 59/10
		const field = [
			[
				{ coeff: R(3), powers: [4] },
				{ coeff: R(-2, 5), powers: [2] },
				{ coeff: R(7), powers: [1] },
				{ coeff: R(-1, 3), powers: [0] },
			],
		]
		const result = divergenceRationalSeries(field, [R(-1, 2)])
		assertNormalized(result)
		assert.deepEqual(result, R(59, 10))
	})

	test('2D mixed polynomial vector field with unreduced and negative-denominator inputs', () => {
		// F = [ (6/4) x^2 y - (2/-3) y^3, (-4/8) x y^2 + (10/-5) y ]
		//   = [ (3/2) x^2 y + (2/3) y^3, -(1/2) x y^2 - 2 y ]
		// dF0/dx = 3 x y
		// dF1/dy = -x y - 2
		// div F = 2 x y - 2
		// At (x, y) = (6/-9, -15/10) = (-2/3, -3/2):
		// div F = 2 * (-2/3) * (-3/2) - 2 = 2 - 2 = 0
		const field = [
			[
				{ coeff: R(6, 4), powers: [2, 1] },
				{ coeff: R(2, -3), powers: [0, 3] },
			],
			[
				{ coeff: R(-4, 8), powers: [1, 2] },
				{ coeff: R(10, -5), powers: [0, 1] },
			],
		]
		const atZeroDiv = divergenceRationalSeries(field, [R(6, -9), R(-15, 10)])
		assertNormalized(atZeroDiv)
		assert.deepEqual(atZeroDiv, R(0, 1))

		// At (x, y) = (5/7, -14/3): 2*(5/7)*(-14/3) - 2 = -20/3 - 2 = -26/3
		const atNonZero = divergenceRationalSeries(field, [R(5, 7), R(-14, 3)])
		assertNormalized(atNonZero)
		assert.deepEqual(atNonZero, R(-26, 3))
	})

	test('3D radial and symmetric polynomial vector fields', () => {
		// Radial field F(x, y, z) = (x, y, z) => div F = 3 everywhere
		const radial = [
			[{ coeff: R(1), powers: [1, 0, 0] }],
			[{ coeff: R(1), powers: [0, 1, 0] }],
			[{ coeff: R(1), powers: [0, 0, 1] }],
		]
		const radRes = divergenceRationalSeries(radial, [R(13, 17), R(-29, 31), R(0, 5)])
		assertNormalized(radRes)
		assert.deepEqual(radRes, R(3, 1))

		// F = (x^2 y z, x y^2 z, x y z^2) => div F = 2xyz + 2xyz + 2xyz = 6xyz
		const symField = [
			[{ coeff: R(1), powers: [2, 1, 1] }],
			[{ coeff: R(1), powers: [1, 2, 1] }],
			[{ coeff: R(1), powers: [1, 1, 2] }],
		]
		const res = divergenceRationalSeries(symField, [R(2, 3), R(-5, 4), R(7, 10)])
		// 6 * (2/3) * (-5/4) * (7/10) = 6 * (-70/120) = -7/2
		assertNormalized(res)
		assert.deepEqual(res, R(-7, 2))
	})

	test('4D vector field with large BigInt values beyond Number.MAX_SAFE_INTEGER', () => {
		const big = 10n ** 25n + 7n
		// F = [ big * x0^2, -big * x1^2, (1/big) * x2, 3 * x3^2 ]
		// div F = 2*big*x0 - 2*big*x1 + 1/big + 6*x3
		// At x0 = x1 = 1, x2 = 12345, x3 = 0 => 1/big
		const field = [
			[{ coeff: { num: big, den: 1n }, powers: [2, 0, 0, 0] }],
			[{ coeff: { num: -big, den: 1n }, powers: [0, 2, 0, 0] }],
			[{ coeff: { num: 1n, den: big }, powers: [0, 0, 1, 0] }],
			[{ coeff: R(3), powers: [0, 0, 0, 2] }],
		]
		const res = divergenceRationalSeries(field, [R(1), R(1), R(12345), R(0)])
		assertNormalized(res)
		assert.deepEqual(res, { num: 1n, den: big })
	})

	test('edge case: constant vector field and empty components have zero divergence', () => {
		const constantField = [
			[{ coeff: R(17, 3), powers: [0, 0, 0] }],
			[{ coeff: R(-99, 7), powers: [0, 0, 0] }],
			[{ coeff: R(42, 11), powers: [0, 0, 0] }],
		]
		const resConst = divergenceRationalSeries(constantField, [R(5, 2), R(-3, 4), R(7, 6)])
		assertNormalized(resConst)
		assert.deepEqual(resConst, R(0, 1))

		const zeroField = [[], [], []]
		const resZero = divergenceRationalSeries(zeroField, [R(1, 2), R(3, 4), R(5, 6)])
		assertNormalized(resZero)
		assert.deepEqual(resZero, R(0, 1))
	})

	test('edge case: solenoidal (divergence-free) fields', () => {
		// 2D rotation field F = (-y, x)
		const rot2D = [
			[{ coeff: R(-1), powers: [0, 1] }],
			[{ coeff: R(1), powers: [1, 0] }],
		]
		assert.deepEqual(divergenceRationalSeries(rot2D, [R(11, 13), R(-17, 19)]), R(0, 1))

		// 3D nonlinear solenoidal field F = (x^2 y - z^3, -x y^2 + x^4, y^5)
		// dF0/dx = 2xy, dF1/dy = -2xy, dF2/dz = 0 => div F = 0
		const sol3D = [
			[
				{ coeff: R(1), powers: [2, 1, 0] },
				{ coeff: R(-1), powers: [0, 0, 3] },
			],
			[
				{ coeff: R(-1), powers: [1, 2, 0] },
				{ coeff: R(1), powers: [4, 0, 0] },
			],
			[{ coeff: R(1), powers: [0, 5, 0] }],
		]
		const res = divergenceRationalSeries(sol3D, [R(-3, 5), R(7, 11), R(13, 17)])
		assertNormalized(res)
		assert.deepEqual(res, R(0, 1))
	})

	test('edge case: evaluation at origin uses 0^0 = 1 for linear terms and combines duplicate monomials', () => {
		// F = [ (1/2)x + (1/3)x + 5x^2, (-7/6)y + 9y^3 + 4x*y ]
		// dF0/dx = 1/2 + 1/3 + 10x = 5/6 at origin
		// dF1/dy = -7/6 + 27y^2 + 4x = -7/6 at origin
		// div F(0, 0) = 5/6 - 7/6 = -1/3
		const field = [
			[
				{ coeff: R(1, 2), powers: [1, 0] },
				{ coeff: R(1, 3), powers: [1, 0] },
				{ coeff: R(5), powers: [2, 0] },
			],
			[
				{ coeff: R(-7, 6), powers: [0, 1] },
				{ coeff: R(9), powers: [0, 3] },
				{ coeff: R(4), powers: [1, 1] },
			],
		]
		const res = divergenceRationalSeries(field, [R(0), R(0)])
		assertNormalized(res)
		assert.deepEqual(res, R(-1, 3))
	})

	test('cross-check: div(curl(G)) === 0 for a rich 3D polynomial vector field', () => {
		const G = [
			[
				{ coeff: R(3, 5), powers: [3, 1, 2] },
				{ coeff: R(-7, 2), powers: [0, 4, 1] },
				{ coeff: R(5), powers: [1, 0, 3] },
			],
			[
				{ coeff: R(-2, 7), powers: [2, 2, 2] },
				{ coeff: R(11, 3), powers: [1, 3, 0] },
				{ coeff: R(-1, 4), powers: [0, 1, 4] },
			],
			[
				{ coeff: R(13, 6), powers: [2, 1, 3] },
				{ coeff: R(-4, 9), powers: [3, 2, 0] },
				{ coeff: R(2, 11), powers: [1, 1, 1] },
			],
		]
		const curlG = symbolicCurl3D(G)
		const points = [
			[R(0), R(0), R(0)],
			[R(1), R(1), R(1)],
			[R(-2, 3), R(5, 7), R(-11, 13)],
			[R(17, 19), R(-23, 29), R(31, 37)],
		]
		for (const pt of points) {
			const res = divergenceRationalSeries(curlG, pt)
			assertNormalized(res)
			assert.deepEqual(res, R(0, 1))
		}
	})

	test('cross-check: linearity div(aF + bG) = a*div(F) + b*div(G)', () => {
		const F = [
			[
				{ coeff: R(2, 3), powers: [3, 1, 0] },
				{ coeff: R(-5, 4), powers: [1, 2, 1] },
			],
			[
				{ coeff: R(7, 2), powers: [0, 3, 2] },
				{ coeff: R(1, 6), powers: [2, 1, 1] },
			],
			[
				{ coeff: R(-3, 5), powers: [1, 1, 3] },
				{ coeff: R(4), powers: [0, 0, 1] },
			],
		]
		const G = [
			[
				{ coeff: R(-1, 7), powers: [2, 0, 2] },
				{ coeff: R(9, 5), powers: [1, 1, 1] },
			],
			[
				{ coeff: R(3, 8), powers: [1, 2, 0] },
				{ coeff: R(-2, 3), powers: [0, 4, 1] },
			],
			[
				{ coeff: R(5, 11), powers: [2, 2, 1] },
				{ coeff: R(-7, 4), powers: [0, 1, 2] },
			],
		]
		const a = R(-13, 17)
		const b = R(19, 23)
		const combined = addFields(scaleField(a, F), scaleField(b, G))

		const points = [
			[R(1, 2), R(-3, 4), R(5, 6)],
			[R(-7, 3), R(0), R(11, 5)],
			[R(2, 9), R(4, 7), R(-8, 11)],
		]
		for (const pt of points) {
			const lhs = divergenceRationalSeries(combined, pt)
			const rhs = addR(
				mulR(a, divergenceRationalSeries(F, pt)),
				mulR(b, divergenceRationalSeries(G, pt)),
			)
			assertNormalized(lhs)
			assert.deepEqual(lhs, rhs)
		}
	})

	test('cross-check: exact central difference matches divergence for quadratic vector fields', () => {
		// For any polynomial of degree <= 2 in each variable, (f(x+h) - f(x-h)) / (2h) === f'(x) identically.
		const F = [
			[
				{ coeff: R(5, 3), powers: [2, 1, 2] },
				{ coeff: R(-7, 4), powers: [1, 2, 0] },
				{ coeff: R(11, 6), powers: [0, 1, 2] },
			],
			[
				{ coeff: R(-2, 5), powers: [2, 2, 1] },
				{ coeff: R(9, 7), powers: [1, 1, 2] },
			],
			[
				{ coeff: R(3, 8), powers: [1, 2, 2] },
				{ coeff: R(-4, 9), powers: [0, 0, 1] },
			],
		]
		const pt = [R(-3, 5), R(7, 11), R(-2, 7)]
		const h = R(1, 13)
		const inv2h = R(13, 2)

		let fdDiv = R(0)
		for (let i = 0; i < 3; i++) {
			const pPlus = pt.slice()
			const pMinus = pt.slice()
			pPlus[i] = addR(pt[i], h)
			pMinus[i] = subR(pt[i], h)
			const diff = subR(evalPoly(F[i], pPlus), evalPoly(F[i], pMinus))
			fdDiv = addR(fdDiv, mulR(diff, inv2h))
		}

		const exactDiv = divergenceRationalSeries(F, pt)
		assertNormalized(exactDiv)
		assert.deepEqual(exactDiv, fdDiv)
	})

	test('invalid inputs throw descriptive TypeError or RangeError', () => {
		assert.throws(() => divergenceRationalSeries(null, [R(1)]), TypeError)
		assert.throws(() => divergenceRationalSeries([], []), RangeError)
		assert.throws(() => divergenceRationalSeries([[]], null), TypeError)
		assert.throws(() => divergenceRationalSeries([[], []], [R(1)]), RangeError)
		assert.throws(() => divergenceRationalSeries(['not-an-array'], [R(1)]), TypeError)
		assert.throws(() => divergenceRationalSeries([[null]], [R(1)]), TypeError)

		// Invalid point rational
		assert.throws(() => divergenceRationalSeries([[]], [{ num: 1, den: 1n }]), TypeError)
		assert.throws(() => divergenceRationalSeries([[]], [{ num: 1n, den: 0n }]), RangeError)
		assert.throws(() => divergenceRationalSeries([[]], [null]), TypeError)

		// Invalid coeff rational (even when power is 0, validation must still catch it)
		assert.throws(
			() => divergenceRationalSeries([[{ coeff: { num: 1n, den: 0n }, powers: [0] }]], [R(1)]),
			RangeError,
		)
		assert.throws(
			() => divergenceRationalSeries([[{ coeff: { num: 1, den: 2 }, powers: [0] }]], [R(1)]),
			TypeError,
		)

		// Invalid powers (even when coeff is 0, validation must still catch it)
		assert.throws(
			() => divergenceRationalSeries([[{ coeff: R(0), powers: 'bad' }]], [R(1)]),
			TypeError,
		)
		assert.throws(
			() => divergenceRationalSeries([[{ coeff: R(0), powers: [1, 2] }]], [R(1)]),
			RangeError,
		)
		assert.throws(
			() => divergenceRationalSeries([[{ coeff: R(0), powers: [-1] }]], [R(1)]),
			RangeError,
		)
		assert.throws(
			() => divergenceRationalSeries([[{ coeff: R(0), powers: [1.5] }]], [R(1)]),
			RangeError,
		)
		assert.throws(
			() => divergenceRationalSeries([[{ coeff: R(0), powers: [Number.NaN] }]], [R(1)]),
			RangeError,
		)
		assert.throws(
			() => divergenceRationalSeries([[{ coeff: R(0), powers: [1n] }]], [R(1)]),
			TypeError,
		)
	})
})
