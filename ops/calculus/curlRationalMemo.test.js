import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { curlRationalMemo } from './curlRationalMemo.js'

/** Helper to construct a rational `{ num, den }`. */
function q(num, den = 1n) {
	return { num: BigInt(num), den: BigInt(den) }
}

/** Helper to construct a monomial `{ coeff, powers }`. */
function m(coeff, px, py, pz) {
	return { coeff, powers: [px, py, pz] }
}

/** Independent BigInt GCD for test assertions and cross-checks. */
function gcd(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const r = x % y
		x = y
		y = r
	}
	return x
}

/** Assert that a rational is in canonical lowest terms (`den > 0n`, `gcd(|num|, den) === 1n`). */
function assertCanonicalRational(r, expectedNum, expectedDen) {
	assert.equal(typeof r.num, 'bigint')
	assert.equal(typeof r.den, 'bigint')
	assert.ok(r.den > 0n, `expected positive denominator, got ${r.den}`)
	assert.equal(gcd(r.num, r.den), 1n, `expected lowest terms, got ${r.num}/${r.den}`)
	if (r.num === 0n) {
		assert.equal(r.den, 1n)
	}
	assert.equal(r.num, expectedNum)
	assert.equal(r.den, expectedDen)
}

/** Independent exact rational helpers for cross-checks. */
function rReduce(num, den) {
	if (num === 0n) return { num: 0n, den: 1n }
	let n = num
	let d = den
	if (d < 0n) {
		n = -n
		d = -d
	}
	const g = gcd(n, d)
	return { num: n / g, den: d / g }
}

function rAdd(a, b) {
	return rReduce(a.num * b.den + b.num * a.den, a.den * b.den)
}

function rSub(a, b) {
	return rReduce(a.num * b.den - b.num * a.den, a.den * b.den)
}

function rMul(a, b) {
	return rReduce(a.num * b.num, a.den * b.den)
}

function rDiv(a, b) {
	return rReduce(a.num * b.den, a.den * b.num)
}

function rPow(a, exp) {
	let res = { num: 1n, den: 1n }
	for (let i = 0; i < exp; i++) {
		res = rMul(res, a)
	}
	return res
}

/** Independent polynomial evaluator for finite-difference cross-check. */
function evalPolyIndependent(poly, pt) {
	let sum = { num: 0n, den: 1n }
	for (const term of poly) {
		const px = rPow(pt[0], term.powers[0])
		const py = rPow(pt[1], term.powers[1])
		const pz = rPow(pt[2], term.powers[2])
		sum = rAdd(sum, rMul(term.coeff, rMul(px, rMul(py, pz))))
	}
	return sum
}

/**
 * Independent 4th-order central finite-difference partial derivative over exact rationals:
 *   (-f(p + 2h e_j) + 8 f(p + h e_j) - 8 f(p - h e_j) + f(p - 2h e_j)) / (12 h)
 * Exact algebraically for any polynomial of total degree <= 4.
 */
function finiteDiffPartial(poly, pt, axis, h) {
	const shift = (mult) => {
		const shifted = [pt[0], pt[1], pt[2]]
		shifted[axis] = rAdd(pt[axis], rMul(q(mult), h))
		return evalPolyIndependent(poly, shifted)
	}
	const p2 = shift(2n)
	const p1 = shift(1n)
	const m1 = shift(-1n)
	const m2 = shift(-2n)

	let num = rMul(q(-1n), p2)
	num = rAdd(num, rMul(q(8n), p1))
	num = rSub(num, rMul(q(8n), m1))
	num = rAdd(num, m2)

	return rDiv(num, rMul(q(12n), h))
}

/** Independent 4th-order finite-difference curl evaluator. */
function finiteDiffCurl(field, pt, h) {
	const dFzdy = finiteDiffPartial(field[2], pt, 1, h)
	const dFydz = finiteDiffPartial(field[1], pt, 2, h)
	const dFxdz = finiteDiffPartial(field[0], pt, 2, h)
	const dFzdx = finiteDiffPartial(field[2], pt, 0, h)
	const dFydx = finiteDiffPartial(field[1], pt, 0, h)
	const dFxdy = finiteDiffPartial(field[0], pt, 1, h)
	return [rSub(dFzdy, dFydz), rSub(dFxdz, dFzdx), rSub(dFydx, dFxdy)]
}

/** Independently compute symbolic gradient of a 3D scalar polynomial. */
function symbolicGradient(scalarPoly) {
	const grad = [[], [], []]
	for (const term of scalarPoly) {
		for (let axis = 0; axis < 3; axis++) {
			const exp = term.powers[axis]
			if (exp === 0) continue
			const nextPowers = [...term.powers]
			nextPowers[axis] = exp - 1
			grad[axis].push({
				coeff: rMul(term.coeff, q(BigInt(exp))),
				powers: nextPowers,
			})
		}
	}
	return grad
}

describe('curlRationalMemo', () => {
	describe('normal cases', () => {
		it('computes curl of rotational field F(x, y, z) = (-y, x, 0) as (0, 0, 2)', () => {
			const field = [
				[m(q(-1n), 0, 1, 0)], // -y
				[m(q(1n), 1, 0, 0)],  // x
				[],                   // 0
			]
			const res = curlRationalMemo(field, [q(3n, 5n), q(-7n, 11n), q(13n, 17n)])
			assert.equal(res.length, 3)
			assertCanonicalRational(res[0], 0n, 1n)
			assertCanonicalRational(res[1], 0n, 1n)
			assertCanonicalRational(res[2], 2n, 1n)
		})

		it('computes curl of cyclic rotational fields around each axis', () => {
			// F = (0, -z, y) -> curl = (2, 0, 0)
			const rotX = [[], [m(q(-1n), 0, 0, 1)], [m(q(1n), 0, 1, 0)]]
			const resX = curlRationalMemo(rotX, [q(0n), q(1n, 2n), q(-3n, 4n)])
			assertCanonicalRational(resX[0], 2n, 1n)
			assertCanonicalRational(resX[1], 0n, 1n)
			assertCanonicalRational(resX[2], 0n, 1n)

			// F = (z, 0, -x) -> curl = (0, 2, 0)
			const rotY = [[m(q(1n), 0, 0, 1)], [], [m(q(-1n), 1, 0, 0)]]
			const resY = curlRationalMemo(rotY, [q(5n, 3n), q(0n), q(2n, 7n)])
			assertCanonicalRational(resY[0], 0n, 1n)
			assertCanonicalRational(resY[1], 2n, 1n)
			assertCanonicalRational(resY[2], 0n, 1n)
		})

		it('computes exact curl of a general polynomial vector field with fractional coefficients and coordinates', () => {
			// Fx = x^2 y z
			// Fy = y^2 z + 3 x z^2
			// Fz = x y z^2 - (1/2) x^3
			//
			// curl_x = dFz/dy - dFy/dz = x z^2 - (y^2 + 6 x z)
			// curl_y = dFx/dz - dFz/dx = x^2 y - (y z^2 - (3/2) x^2)
			// curl_z = dFy/dx - dFx/dy = 3 z^2 - x^2 z
			const field = [
				[m(q(1n), 2, 1, 1)],
				[m(q(1n), 0, 2, 1), m(q(3n), 1, 0, 2)],
				[m(q(1n), 1, 1, 2), m(q(-1n, 2n), 3, 0, 0)],
			]
			// Evaluate at (x, y, z) = (1/2, -2/3, 3/4)
			// curl_x = (1/2)(9/16) - (4/9) - 6(1/2)(3/4)
			//        = 9/32 - 4/9 - 9/4 = (81 - 128 - 648) / 288 = -695 / 288
			// curl_y = (1/4)(-2/3) - (-2/3)(9/16) + (3/2)(1/4)
			//        = -1/6 + 3/8 + 3/8 = -1/6 + 3/4 = 7/12
			// curl_z = 3(9/16) - (1/4)(3/4) = 27/16 - 3/16 = 24/16 = 3/2
			const res = curlRationalMemo(field, [q(1n, 2n), q(-2n, 3n), q(3n, 4n)])
			assertCanonicalRational(res[0], -695n, 288n)
			assertCanonicalRational(res[1], 7n, 12n)
			assertCanonicalRational(res[2], 3n, 2n)
		})

		it('handles large BigInt coefficients and high-degree monomials exactly', () => {
			const big = 10n ** 25n + 7n
			// F = (0, big * x^6, 0) -> curl = (0, 0, 6 * big * x^5)
			const field = [[], [m(q(big, 3n), 6, 0, 0)], []]
			const res = curlRationalMemo(field, [q(2n, 5n), q(0n), q(0n)])
			// 6 * (big/3) * (2/5)^5 = 2 * big * 32 / 3125 = (64 * big) / 3125
			// gcd(64 * (10^25 + 7), 3125) = 1 since 10^25 + 7 ≡ 2 (mod 5)
			assertCanonicalRational(res[0], 0n, 1n)
			assertCanonicalRational(res[1], 0n, 1n)
			assertCanonicalRational(res[2], 64n * big, 3125n)
		})

		it('normalizes unreduced inputs, negative denominators, duplicate monomials, and zero terms', () => {
			// Equivalent to F = (-y, x, 0)
			const field = [
				[
					m(q(2n, -4n), 0, 1, 0),  // -1/2 y
					m(q(-3n, 6n), 0, 1, 0),  // -1/2 y  -> sum = -y
					m(q(0n, 9n), 5, 4, 3),   // 0
				],
				[
					m(q(-4n, -4n), 1, 0, 0), // +x
					m(q(5n, 7n), 0, 3, 0),   // cancels out below
					m(q(-10n, 14n), 0, 3, 0),
				],
				[m(q(0n, -5n), 1, 1, 1)],
			]
			const res = curlRationalMemo(field, [q(-6n, -9n), q(4n, -8n), q(0n, -3n)])
			assertCanonicalRational(res[0], 0n, 1n)
			assertCanonicalRational(res[1], 0n, 1n)
			assertCanonicalRational(res[2], 2n, 1n)
		})
	})

	describe('edge cases', () => {
		it('returns (0, 0, 0) for a constant vector field', () => {
			const field = [
				[m(q(7n, 3n), 0, 0, 0)],
				[m(q(-11n, 5n), 0, 0, 0)],
				[m(q(42n, 1n), 0, 0, 0)],
			]
			const res = curlRationalMemo(field, [q(10n, 3n), q(-2n, 7n), q(5n, 11n)])
			assertCanonicalRational(res[0], 0n, 1n)
			assertCanonicalRational(res[1], 0n, 1n)
			assertCanonicalRational(res[2], 0n, 1n)
		})

		it('returns (0, 0, 0) for an empty (zero) vector field and at the origin', () => {
			const zeroField = [[], [], []]
			const res = curlRationalMemo(zeroField, [q(0n), q(0n), q(0n)])
			assertCanonicalRational(res[0], 0n, 1n)
			assertCanonicalRational(res[1], 0n, 1n)
			assertCanonicalRational(res[2], 0n, 1n)
		})

		it('evaluates cleanly at the origin (0, 0, 0) where 0^0 = 1 for degree-1 terms', () => {
			// F = (2z + x^2 y, 3x + y z, -5y + x y z)
			// At origin: dFz/dy = -5, dFy/dz = 0 -> curl_x = -5
			//            dFx/dz = 2,  dFz/dx = 0 -> curl_y = 2
			//            dFy/dx = 3,  dFx/dy = 0 -> curl_z = 3
			const field = [
				[m(q(2n), 0, 0, 1), m(q(1n), 2, 1, 0)],
				[m(q(3n), 1, 0, 0), m(q(1n), 0, 1, 1)],
				[m(q(-5n), 0, 1, 0), m(q(1n), 1, 1, 1)],
			]
			const res = curlRationalMemo(field, [q(0n), q(0n), q(0n)])
			assertCanonicalRational(res[0], -5n, 1n)
			assertCanonicalRational(res[1], 2n, 1n)
			assertCanonicalRational(res[2], 3n, 1n)
		})

		it('returns (0, 0, 0) for a conservative field (radial field F = (x, y, z))', () => {
			const radial = [
				[m(q(1n), 1, 0, 0)],
				[m(q(1n), 0, 1, 0)],
				[m(q(1n), 0, 0, 1)],
			]
			const res = curlRationalMemo(radial, [q(-3n, 7n), q(11n, 13n), q(17n, 19n)])
			assertCanonicalRational(res[0], 0n, 1n)
			assertCanonicalRational(res[1], 0n, 1n)
			assertCanonicalRational(res[2], 0n, 1n)
		})

		it('preserves memoization consistency across equivalent forms and resists caller mutation', () => {
			const fieldA = [
				[m(q(1n, 2n), 1, 2, 0), m(q(-3n, 4n), 0, 1, 2)],
				[m(q(2n, 3n), 2, 0, 1)],
				[m(q(5n, 6n), 1, 1, 1)],
			]
			// Reordered terms and unreduced equivalent rationals
			const fieldB = [
				[m(q(6n, -8n), 0, 1, 2), m(q(3n, 6n), 1, 2, 0)],
				[m(q(4n, 6n), 2, 0, 1)],
				[m(q(-10n, -12n), 1, 1, 1)],
			]
			const ptA = [q(2n, 3n), q(-1n, 5n), q(7n, 2n)]
			const ptB = [q(4n, 6n), q(2n, -10n), q(14n, 4n)]

			const first = curlRationalMemo(fieldA, ptA)
			const snapshot = first.map((r) => ({ num: r.num, den: r.den }))

			// Mutate returned array and rational objects aggressively
			first[0].num = 999999n
			first[0].den = 1n
			first.push(q(1n))

			// Subsequent memoized calls must remain unaffected and identical
			const second = curlRationalMemo(fieldA, ptA)
			const third = curlRationalMemo(fieldB, ptB)

			assert.equal(second.length, 3)
			assert.deepEqual(second, snapshot)
			assert.deepEqual(third, snapshot)
		})

		it('rejects wrong dimensions and invalid inputs with appropriate errors', () => {
			const validField = [[], [], []]
			const validPoint = [q(0n), q(0n), q(0n)]

			// Wrong field / point container types
			assert.throws(() => curlRationalMemo(null, validPoint), TypeError)
			assert.throws(() => curlRationalMemo({}, validPoint), TypeError)
			assert.throws(() => curlRationalMemo(validField, null), TypeError)
			assert.throws(() => curlRationalMemo(validField, '0,0,0'), TypeError)

			// Wrong dimensions
			assert.throws(() => curlRationalMemo([[], []], validPoint), RangeError)
			assert.throws(() => curlRationalMemo([[], [], [], []], validPoint), RangeError)
			assert.throws(() => curlRationalMemo(validField, [q(0n), q(0n)]), RangeError)
			assert.throws(() => curlRationalMemo(validField, [q(0n), q(0n), q(0n), q(0n)]), RangeError)

			// Invalid component / monomial shapes
			assert.throws(() => curlRationalMemo([null, [], []], validPoint), TypeError)
			assert.throws(() => curlRationalMemo([[null], [], []], validPoint), TypeError)
			assert.throws(() => curlRationalMemo([[[]], [], []], validPoint), TypeError)

			// Invalid rationals (zero denominator, Number instead of BigInt)
			assert.throws(() => curlRationalMemo(validField, [q(1n, 0n), q(0n), q(0n)]), RangeError)
			assert.throws(
				() => curlRationalMemo([[m({ num: 1, den: 2 }, 1, 0, 0)], [], []], validPoint),
				TypeError,
			)
			assert.throws(
				() => curlRationalMemo([[m({ num: 1n, den: 0n }, 1, 0, 0)], [], []], validPoint),
				RangeError,
			)
			assert.throws(() => curlRationalMemo(validField, [{ num: 1, den: 1 }, q(0n), q(0n)]), TypeError)

			// Invalid powers (wrong length, negative, float, NaN, BigInt)
			assert.throws(() => curlRationalMemo([[{ coeff: q(1n), powers: [1, 0] }], [], []], validPoint), RangeError)
			assert.throws(() => curlRationalMemo([[{ coeff: q(1n), powers: '100' }], [], []], validPoint), TypeError)
			assert.throws(() => curlRationalMemo([[m(q(1n), -1, 0, 0)], [], []], validPoint), RangeError)
			assert.throws(() => curlRationalMemo([[m(q(1n), 1.5, 0, 0)], [], []], validPoint), RangeError)
			assert.throws(() => curlRationalMemo([[m(q(1n), Number.NaN, 0, 0)], [], []], validPoint), RangeError)
			assert.throws(
				() => curlRationalMemo([[{ coeff: q(1n), powers: [1n, 0, 0] }], [], []], validPoint),
				TypeError,
			)
		})
	})

	describe('independent cross-checks', () => {
		it('satisfies vector calculus identity curl(grad(f)) == (0, 0, 0) for a nontrivial 3D scalar polynomial', () => {
			// f(x, y, z) = (3/5) x^3 y^2 z - (7/4) x y^4 z^2 + (11/3) x^2 z^3 - 2 y^3 + (1/7) x y z + 5
			const scalarPoly = [
				m(q(3n, 5n), 3, 2, 1),
				m(q(-7n, 4n), 1, 4, 2),
				m(q(11n, 3n), 2, 0, 3),
				m(q(-2n, 1n), 0, 3, 0),
				m(q(1n, 7n), 1, 1, 1),
				m(q(5n, 1n), 0, 0, 0),
			]
			const gradField = symbolicGradient(scalarPoly)

			const samplePoints = [
				[q(0n), q(0n), q(0n)],
				[q(1n, 2n), q(-3n, 5n), q(7n, 11n)],
				[q(-13n, 4n), q(19n, 6n), q(-5n, 9n)],
				[q(100n, 3n), q(-27n, 8n), q(41n, 13n)],
			]

			for (const pt of samplePoints) {
				const res = curlRationalMemo(gradField, pt)
				assertCanonicalRational(res[0], 0n, 1n)
				assertCanonicalRational(res[1], 0n, 1n)
				assertCanonicalRational(res[2], 0n, 1n)
			}
		})

		it('matches an independent exact 4th-order central finite-difference curl across multiple points', () => {
			// Degree-4 polynomial vector field (exact under 4th-order central differences)
			const field = [
				[m(q(2n, 3n), 2, 1, 1), m(q(-5n, 7n), 0, 3, 1), m(q(4n, 1n), 1, 0, 2)],
				[m(q(-3n, 5n), 1, 2, 1), m(q(7n, 2n), 3, 0, 1), m(q(-1n, 4n), 0, 1, 3)],
				[m(q(5n, 6n), 2, 2, 0), m(q(-2n, 9n), 1, 1, 2), m(q(11n, 3n), 0, 0, 4)],
			]

			const samplePoints = [
				[q(1n, 3n), q(-2n, 5n), q(4n, 7n)],
				[q(-5n, 2n), q(3n, 4n), q(-1n, 6n)],
				[q(0n), q(7n, 9n), q(-3n, 11n)],
			]

			const step = q(1n, 17n)
			for (const pt of samplePoints) {
				const actual = curlRationalMemo(field, pt)
				const expected = finiteDiffCurl(field, pt, step)
				for (let i = 0; i < 3; i++) {
					assertCanonicalRational(actual[i], expected[i].num, expected[i].den)
				}
			}
		})
	})
})
