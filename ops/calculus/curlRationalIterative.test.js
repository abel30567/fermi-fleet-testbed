import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { curlRationalIterative } from './curlRationalIterative.js'

/** Helper to construct a rational literal */
const r = (num, den = 1n) => ({ num: BigInt(num), den: BigInt(den) })

/** Helper to construct a 3D polynomial term */
const term = (coeff, powers) => ({ coeff, powers })

/** Helper to assert exact canonical rational representation */
function assertCanonicalRational(actual, expectedNum, expectedDen = 1n) {
	assert.equal(typeof actual.num, 'bigint')
	assert.equal(typeof actual.den, 'bigint')
	assert.ok(actual.den > 0n, `expected positive denominator, got ${actual.den}`)
	assert.equal(actual.num, expectedNum)
	assert.equal(actual.den, expectedDen)
}

function assertCanonicalVector(actual, expected) {
	assert.ok(Array.isArray(actual))
	assert.equal(actual.length, 3)
	for (let i = 0; i < 3; i++) {
		assertCanonicalRational(actual[i], expected[i].num, expected[i].den)
	}
}

/* -------------------------------------------------------------------------- */
/* Independent reference helpers for cross-checks                              */
/* -------------------------------------------------------------------------- */

function refGcd(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const t = x % y
		x = y
		y = t
	}
	return x
}

function refNorm(num, den) {
	if (num === 0n) return { num: 0n, den: 1n }
	const sign = den < 0n ? -1n : 1n
	const n = num * sign
	const d = den * sign
	const g = refGcd(n, d)
	return { num: n / g, den: d / g }
}

function refAdd(a, b) {
	return refNorm(a.num * b.den + b.num * a.den, a.den * b.den)
}

function refSub(a, b) {
	return refNorm(a.num * b.den - b.num * a.den, a.den * b.den)
}

function refMul(a, b) {
	return refNorm(a.num * b.num, a.den * b.den)
}

/**
 * Independent dual-number (val, deriv) polynomial evaluator over exact rationals.
 * Computes partial derivative by evaluating P(x + eps*e_k) via repeated multiplication
 * with no explicit power-rule differentiation.
 */
function dualMul(u, v) {
	return {
		val: refMul(u.val, v.val),
		der: refAdd(refMul(u.val, v.der), refMul(u.der, v.val)),
	}
}

function dualAdd(u, v) {
	return {
		val: refAdd(u.val, v.val),
		der: refAdd(u.der, v.der),
	}
}

function evalPolyDualPartial(terms, varIdx, point) {
	const vars = point.map((coord, idx) => ({
		val: refNorm(coord.num, coord.den),
		der: idx === varIdx ? r(1n, 1n) : r(0n, 1n),
	}))

	let acc = { val: r(0n, 1n), der: r(0n, 1n) }
	for (const { coeff, powers } of terms) {
		let prod = { val: refNorm(coeff.num, coeff.den), der: r(0n, 1n) }
		for (let axis = 0; axis < 3; axis++) {
			for (let k = 0; k < powers[axis]; k++) {
				prod = dualMul(prod, vars[axis])
			}
		}
		acc = dualAdd(acc, prod)
	}
	return acc.der
}

function curlViaDualNumbers(vectorField, point) {
	const [fx, fy, fz] = vectorField
	return [
		refSub(evalPolyDualPartial(fz, 1, point), evalPolyDualPartial(fy, 2, point)),
		refSub(evalPolyDualPartial(fx, 2, point), evalPolyDualPartial(fz, 0, point)),
		refSub(evalPolyDualPartial(fy, 0, point), evalPolyDualPartial(fx, 1, point)),
	]
}

/** Symbolic gradient grad(phi) = [dphi/dx, dphi/dy, dphi/dz] for scalar polynomial phi */
function symbolicGrad(scalarPoly) {
	const grad = [[], [], []]
	for (const { coeff, powers } of scalarPoly) {
		for (let axis = 0; axis < 3; axis++) {
			if (powers[axis] > 0) {
				const nextPowers = [...powers]
				nextPowers[axis] -= 1
				grad[axis].push({
					coeff: refNorm(coeff.num * BigInt(powers[axis]), coeff.den),
					powers: nextPowers,
				})
			}
		}
	}
	return grad
}

/* -------------------------------------------------------------------------- */
/* Tests                                                                       */
/* -------------------------------------------------------------------------- */

describe('curlRationalIterative', () => {
	test('zero and constant vector fields have zero curl', () => {
		const emptyField = [[], [], []]
		assertCanonicalVector(curlRationalIterative(emptyField, [r(0n), r(0n), r(0n)]), [
			r(0n),
			r(0n),
			r(0n),
		])

		const constField = [
			[term(r(7n, 3n), [0, 0, 0])],
			[term(r(-11n, 5n), [0, 0, 0])],
			[term(r(42n, 1n), [0, 0, 0])],
		]
		assertCanonicalVector(curlRationalIterative(constField, [r(2n, 3n), r(-5n, 7n), r(13n, 4n)]), [
			r(0n),
			r(0n),
			r(0n),
		])
	})

	test('rigid rotation (-y, x, 0) has curl (0, 0, 2) everywhere', () => {
		const rotationZ = [
			[term(r(-1n), [0, 1, 0])],
			[term(r(1n), [1, 0, 0])],
			[],
		]
		const points = [
			[r(0n), r(0n), r(0n)],
			[r(3n, 4n), r(-7n, 9n), r(11n, 2n)],
			[r(-100n, 3n), r(200n, 7n), r(-5n, 13n)],
		]
		for (const pt of points) {
			assertCanonicalVector(curlRationalIterative(rotationZ, pt), [r(0n), r(0n), r(2n)])
		}
	})

	test('rigid rotations about x, y, and general rational axis ω satisfy curl(ω × r) = 2ω', () => {
		// ω = (3/5, -7/11, 2/3)
		// ω × r = (ωy*z - ωz*y, ωz*x - ωx*z, ωx*y - ωy*x)
		const wx = r(3n, 5n)
		const wy = r(-7n, 11n)
		const wz = r(2n, 3n)

		const field = [
			[term(wy, [0, 0, 1]), term(r(-wz.num, wz.den), [0, 1, 0])],
			[term(wz, [1, 0, 0]), term(r(-wx.num, wx.den), [0, 0, 1])],
			[term(wx, [0, 1, 0]), term(r(-wy.num, wy.den), [1, 0, 0])],
		]

		const result = curlRationalIterative(field, [r(5n, 2n), r(-3n, 7n), r(1n, 19n)])
		assertCanonicalVector(result, [r(6n, 5n), r(-14n, 11n), r(4n, 3n)])
	})

	test('conservative / gradient fields have identically zero curl', () => {
		// phi(x, y, z) = (1/2)x^2 y - (3/4)y^3 z^2 + (5/6)x y z^4 - (7/11)x^3 z + 9
		const phi = [
			term(r(1n, 2n), [2, 1, 0]),
			term(r(-3n, 4n), [0, 3, 2]),
			term(r(5n, 6n), [1, 1, 4]),
			term(r(-7n, 11n), [3, 0, 1]),
			term(r(9n, 1n), [0, 0, 0]),
		]
		const gradPhi = symbolicGrad(phi)

		const testPoints = [
			[r(0n), r(0n), r(0n)],
			[r(1n), r(1n), r(1n)],
			[r(-2n, 3n), r(5n, 7n), r(-11n, 13n)],
			[r(17n, 4n), r(-3n, 8n), r(9n, 5n)],
		]
		for (const pt of testPoints) {
			assertCanonicalVector(curlRationalIterative(gradPhi, pt), [r(0n), r(0n), r(0n)])
		}
	})

	test('general nonlinear 3D polynomial field with fractions', () => {
		// F = (x^2 y z, (1/2) y^2 z, (-3/4) x z^3)
		// curl(F) = (-(1/2) y^2, x^2 y + (3/4) z^3, -x^2 z)
		const field = [
			[term(r(1n, 1n), [2, 1, 1])],
			[term(r(1n, 2n), [0, 2, 1])],
			[term(r(-3n, 4n), [1, 0, 3])],
		]

		// At (x, y, z) = (2/3, -3/5, 4/7):
		// cx = -(1/2) * (9/25) = -9/50
		// cy = (4/9)*(-3/5) + (3/4)*(64/343) = -4/15 + 48/343 = (-1372 + 720) / 5145 = -652 / 5145
		// cz = -(4/9)*(4/7) = -16/63
		const pt = [r(2n, 3n), r(-3n, 5n), r(4n, 7n)]
		assertCanonicalVector(curlRationalIterative(field, pt), [
			r(-9n, 50n),
			r(-652n, 5145n),
			r(-16n, 63n),
		])
	})

	test('handles origin evaluation (0^0 = 1), duplicate terms, zero coeffs, and unreduced/negative-den inputs', () => {
		// F = (2z + 3z + 0*y, -4x + 1/(-2)z, (6/4)y)
		// F = (5z, -4x - (1/2)z, (3/2)y)
		// curl = (3/2 - (-1/2), 5 - 0, -4 - 0) = (2, 5, -4)
		const field = [
			[
				term(r(4n, 2n), [0, 0, 1]),
				term(r(-6n, -2n), [0, 0, 1]),
				term(r(0n, -9n), [0, 1, 0]),
			],
			[
				term(r(8n, -2n), [1, 0, 0]),
				term(r(1n, -2n), [0, 0, 1]),
			],
			[term(r(6n, 4n), [0, 1, 0])],
		]

		// Unreduced / negative-denominator point representing (0, 0, 0)
		const origin = [r(0n, -3n), r(0n, 7n), r(0n, -1n)]
		assertCanonicalVector(curlRationalIterative(field, origin), [r(2n), r(5n), r(-4n)])
	})

	test('preserves exact BigInt precision with large coefficients and high degrees', () => {
		// F = (0, 10^30 * x^10, 0) => curl = (0, 0, 10 * 10^30 * x^9)
		const big = 10n ** 30n
		const field = [[], [term(r(big, 3n), [10, 0, 0])], []]
		const pt = [r(3n, 2n), r(0n), r(0n)]

		// cz = (10 * 10^30 / 3) * (3^9 / 2^9) = (10^31 * 3^8) / 2^9
		// 10^31 = 2^31 * 5^31 => dividing by 2^9 yields 2^22 * 5^31 * 3^8
		const expectedNum = (2n ** 22n) * (5n ** 31n) * (3n ** 8n)
		assertCanonicalVector(curlRationalIterative(field, pt), [r(0n), r(0n), r(expectedNum, 1n)])
	})

	test('cross-check against independent dual-number partial evaluation (no power rule)', () => {
		const field = [
			[
				term(r(3n, 7n), [3, 2, 1]),
				term(r(-5n, 4n), [0, 4, 2]),
				term(r(11n, 6n), [1, 0, 3]),
				term(r(-2n, 9n), [0, 0, 1]),
			],
			[
				term(r(-7n, 5n), [2, 1, 3]),
				term(r(4n, 3n), [4, 0, 0]),
				term(r(1n, 8n), [1, 2, 2]),
				term(r(5n, 12n), [0, 1, 0]),
			],
			[
				term(r(2n, 11n), [1, 3, 2]),
				term(r(-9n, 2n), [2, 2, 0]),
				term(r(7n, 13n), [0, 1, 4]),
				term(r(-3n, 10n), [1, 0, 0]),
			],
		]

		const points = [
			[r(0n), r(0n), r(0n)],
			[r(1n, 2n), r(-2n, 3n), r(3n, 5n)],
			[r(-7n, 4n), r(5n, 6n), r(-11n, 9n)],
			[r(3n, 1n), r(0n, 1n), r(-2n, 7n)],
		]

		for (const pt of points) {
			const actual = curlRationalIterative(field, pt)
			const expected = curlViaDualNumbers(field, pt)
			assertCanonicalVector(actual, expected)
		}
	})

	test('cross-check linearity: curl(a*F + b*G) === a*curl(F) + b*curl(G)', () => {
		const F = [
			[term(r(2n, 3n), [1, 2, 1])],
			[term(r(-1n, 4n), [2, 0, 3])],
			[term(r(5n, 6n), [1, 1, 2])],
		]
		const G = [
			[term(r(-3n, 5n), [0, 1, 2]), term(r(7n, 2n), [2, 1, 0])],
			[term(r(4n, 7n), [1, 3, 0])],
			[term(r(-2n, 9n), [0, 2, 1]), term(r(1n, 3n), [3, 0, 0])],
		]
		const a = r(5n, 7n)
		const b = r(-11n, 3n)
		const pt = [r(-3n, 4n), r(5n, 6n), r(7n, 8n)]

		const combined = [0, 1, 2].map((i) => [
			...F[i].map((t) => term(refMul(a, t.coeff), t.powers)),
			...G[i].map((t) => term(refMul(b, t.coeff), t.powers)),
		])

		const curlF = curlRationalIterative(F, pt)
		const curlG = curlRationalIterative(G, pt)
		const expected = [0, 1, 2].map((i) => refAdd(refMul(a, curlF[i]), refMul(b, curlG[i])))
		const actual = curlRationalIterative(combined, pt)

		assertCanonicalVector(actual, expected)
	})

	test('floating-point central difference sanity check', () => {
		const field = [
			[term(r(2n, 5n), [1, 2, 1]), term(r(-3n, 4n), [0, 0, 2])],
			[term(r(7n, 3n), [2, 1, 0]), term(r(1n, 6n), [0, 1, 2])],
			[term(r(-5n, 8n), [1, 2, 0]), term(r(4n, 9n), [0, 1, 1])],
		]
		const pt = [r(3n, 4n), r(-2n, 5n), r(5n, 6n)]
		const exact = curlRationalIterative(field, pt)

		const evalCompFloat = (terms, x, y, z) =>
			terms.reduce(
				(s, { coeff, powers: [px, py, pz] }) =>
					s + (Number(coeff.num) / Number(coeff.den)) * x ** px * y ** py * z ** pz,
				0,
			)

		const [x, y, z] = pt.map((c) => Number(c.num) / Number(c.den))
		const h = 1e-6
		const approx = [
			(evalCompFloat(field[2], x, y + h, z) - evalCompFloat(field[2], x, y - h, z)) / (2 * h) -
				(evalCompFloat(field[1], x, y, z + h) - evalCompFloat(field[1], x, y, z - h)) / (2 * h),
			(evalCompFloat(field[0], x, y, z + h) - evalCompFloat(field[0], x, y, z - h)) / (2 * h) -
				(evalCompFloat(field[2], x + h, y, z) - evalCompFloat(field[2], x - h, y, z)) / (2 * h),
			(evalCompFloat(field[1], x + h, y, z) - evalCompFloat(field[1], x - h, y, z)) / (2 * h) -
				(evalCompFloat(field[0], x, y + h, z) - evalCompFloat(field[0], x, y - h, z)) / (2 * h),
		]

		for (let i = 0; i < 3; i++) {
			const exactFloat = Number(exact[i].num) / Number(exact[i].den)
			assert.ok(
				Math.abs(exactFloat - approx[i]) < 1e-8,
				`component ${i}: exact=${exactFloat}, approx=${approx[i]}`,
			)
		}
	})

	test('throws TypeError and RangeError on invalid inputs', () => {
		const validField = [[], [], []]
		const validPoint = [r(0n), r(0n), r(0n)]

		// Invalid vectorField shapes
		assert.throws(() => curlRationalIterative(null, validPoint), TypeError)
		assert.throws(() => curlRationalIterative({}, validPoint), TypeError)
		assert.throws(() => curlRationalIterative([[], []], validPoint), RangeError)
		assert.throws(() => curlRationalIterative([[], [], [], []], validPoint), RangeError)
		assert.throws(() => curlRationalIterative([null, [], []], validPoint), TypeError)

		// Invalid term shapes
		assert.throws(() => curlRationalIterative([[null], [], []], validPoint), TypeError)
		assert.throws(() => curlRationalIterative([['bad'], [], []], validPoint), TypeError)
		assert.throws(() => curlRationalIterative([[[]], [], []], validPoint), TypeError)

		// Invalid coeff rationals (including in a term whose derivative is zero!)
		assert.throws(
			() => curlRationalIterative([[{ coeff: null, powers: [2, 0, 0] }], [], []], validPoint),
			TypeError,
		)
		assert.throws(
			() =>
				curlRationalIterative(
					[[{ coeff: { num: 1, den: 2n }, powers: [2, 0, 0] }], [], []],
					validPoint,
				),
			TypeError,
		)
		assert.throws(
			() =>
				curlRationalIterative(
					[[{ coeff: { num: 1n, den: 0n }, powers: [2, 0, 0] }], [], []],
					validPoint,
				),
			RangeError,
		)

		// Invalid powers
		assert.throws(
			() => curlRationalIterative([[{ coeff: r(1n), powers: null }], [], []], validPoint),
			TypeError,
		)
		assert.throws(
			() => curlRationalIterative([[{ coeff: r(1n), powers: [1, 2] }], [], []], validPoint),
			RangeError,
		)
		assert.throws(
			() =>
				curlRationalIterative([[{ coeff: r(1n), powers: [1, 2, 3, 4] }], [], []], validPoint),
			RangeError,
		)
		assert.throws(
			() => curlRationalIterative([[{ coeff: r(1n), powers: [-1, 0, 0] }], [], []], validPoint),
			RangeError,
		)
		assert.throws(
			() => curlRationalIterative([[{ coeff: r(1n), powers: [1.5, 0, 0] }], [], []], validPoint),
			RangeError,
		)
		assert.throws(
			() => curlRationalIterative([[{ coeff: r(1n), powers: [NaN, 0, 0] }], [], []], validPoint),
			RangeError,
		)
		assert.throws(
			() =>
				curlRationalIterative(
					[[{ coeff: r(1n), powers: [Infinity, 0, 0] }], [], []],
					validPoint,
				),
			RangeError,
		)
		assert.throws(
			() => curlRationalIterative([[{ coeff: r(1n), powers: [1n, 0, 0] }], [], []], validPoint),
			TypeError,
		)

		// Invalid point
		assert.throws(() => curlRationalIterative(validField, null), TypeError)
		assert.throws(() => curlRationalIterative(validField, [r(0n), r(0n)]), RangeError)
		assert.throws(
			() => curlRationalIterative(validField, [r(0n), r(0n), r(0n), r(0n)]),
			RangeError,
		)
		assert.throws(
			() => curlRationalIterative(validField, [{ num: 1, den: 1n }, r(0n), r(0n)]),
			TypeError,
		)
		assert.throws(
			() => curlRationalIterative(validField, [r(1n), { num: 2n, den: 0n }, r(0n)]),
			RangeError,
		)
	})
})
