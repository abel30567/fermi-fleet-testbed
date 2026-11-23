import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { divergenceRationalStable } from './divergenceRationalStable.js'

// Test-only exact rational helpers for constructing test fields and analytic cross-checks
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

function rat(num, den = 1n) {
	const n = BigInt(num)
	const d = BigInt(den)
	if (d === 0n) throw new RangeError('Zero denominator')
	if (n === 0n) return { num: 0n, den: 1n }
	const sign = d < 0n ? -1n : 1n
	const nn = n * sign
	const dd = d * sign
	const g = gcd(nn, dd)
	return { num: nn / g, den: dd / g }
}

function add(a, b) {
	return rat(a.num * b.den + b.num * a.den, a.den * b.den)
}

function sub(a, b) {
	return rat(a.num * b.den - b.num * a.den, a.den * b.den)
}

function mul(a, b) {
	return rat(a.num * b.num, a.den * b.den)
}

function div(a, b) {
	return rat(a.num * b.den, a.den * b.num)
}

function pow(a, k) {
	let res = rat(1n)
	for (let i = 0; i < k; i++) res = mul(res, a)
	return res
}

function abs(a) {
	return { num: a.num < 0n ? -a.num : a.num, den: a.den }
}

function assertLowestTerms(r) {
	assert.equal(typeof r.num, 'bigint')
	assert.equal(typeof r.den, 'bigint')
	assert.ok(r.den > 0n, `expected den > 0n, got ${r.den}`)
	assert.equal(gcd(r.num, r.den), 1n, `expected lowest terms for ${r.num}/${r.den}`)
	if (r.num === 0n) {
		assert.equal(r.den, 1n)
	}
}

describe('divergenceRationalStable', () => {
	describe('normal cases', () => {
		it('computes 1D divergence (ordinary derivative) exactly for a quadratic', () => {
			// F(x) = [3x^2 - 2x + 5] => div(F) = 6x - 2
			const field = ([x]) => [
				add(sub(mul(rat(3), pow(x, 2)), mul(rat(2), x)), rat(5)),
			]
			const pt = [rat(7, 4)]
			const got = divergenceRationalStable(field, pt)
			const expected = sub(mul(rat(6), pt[0]), rat(2)) // 42/4 - 2 = 17/2
			assertLowestTerms(got)
			assert.deepEqual(got, expected)
		})

		it('computes 2D polynomial divergence exactly', () => {
			// F(x, y) = [x^2 y + 3x, x y^2 - 5y] => div(F) = (2xy + 3) + (2xy - 5) = 4xy - 2
			const field = ([x, y]) => [
				add(mul(pow(x, 2), y), mul(rat(3), x)),
				sub(mul(x, pow(y, 2)), mul(rat(5), y)),
			]
			const pt = [rat(-3, 5), rat(7, 11)]
			const got = divergenceRationalStable(field, pt)
			const expected = sub(mul(rat(4), mul(pt[0], pt[1])), rat(2))
			assertLowestTerms(got)
			assert.deepEqual(got, expected)
		})

		it('computes 3D mixed polynomial divergence exactly', () => {
			// F(x, y, z) = [x^2 y z, x y^2 z, x y z^2] => div(F) = 6xyz
			const field = ([x, y, z]) => [
				mul(mul(pow(x, 2), y), z),
				mul(mul(x, pow(y, 2)), z),
				mul(mul(x, y), pow(z, 2)),
			]
			const pt = [rat(2, 3), rat(-5, 7), rat(11, 13)]
			const got = divergenceRationalStable(field, pt)
			const expected = mul(rat(6), mul(mul(pt[0], pt[1]), pt[2]))
			assertLowestTerms(got)
			assert.deepEqual(got, expected)
		})

		it('handles high-dimensional fields with varied prime denominators via pairwise summation', () => {
			const primes = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n, 43n, 47n, 53n]
			// F_i(x) = (1 / p_i) * x_i^2 => div(F) = sum_i (2 * x_i / p_i)
			const field = (xs) =>
				xs.map((xi, i) => mul(rat(1n, primes[i]), pow(xi, 2)))
			const pt = primes.map((p, i) => rat(BigInt(i + 1) * (i % 2 === 0 ? 1n : -1n), p + 1n))

			let expected = rat(0)
			for (let i = 0; i < primes.length; i++) {
				expected = add(expected, mul(rat(2n, primes[i]), pt[i]))
			}

			const got = divergenceRationalStable(field, pt)
			assertLowestTerms(got)
			assert.deepEqual(got, expected)
		})

		it('supports direct rational step argument and options object', () => {
			const field = ([x, y]) => [pow(x, 3), pow(y, 3)]
			const pt = [rat(2, 3), rat(-1, 5)]
			const expected = add(mul(rat(3), pow(pt[0], 2)), mul(rat(3), pow(pt[1], 2)))

			const gotDirectStep = divergenceRationalStable(field, pt, rat(1, 32))
			assertLowestTerms(gotDirectStep)
			assert.deepEqual(gotDirectStep, expected)

			const gotOptions = divergenceRationalStable(field, pt, {
				step: rat(1, 16),
				richardsonLevels: 1,
			})
			assertLowestTerms(gotOptions)
			assert.deepEqual(gotOptions, expected)
		})

		it('normalizes unreduced/negative-denominator inputs and does not mutate point', () => {
			const field = ([x, y]) => [
				{ num: 4n * x.num, den: 2n * x.den }, // 2x (unreduced)
				{ num: -6n * y.num, den: -2n * y.den }, // 3y (negative den)
			]
			const pt = [
				{ num: 6n, den: -9n },
				{ num: 10n, den: 15n },
			]
			const snapshot = pt.map((r) => ({ ...r }))
			const got = divergenceRationalStable(field, pt)
			assertLowestTerms(got)
			assert.deepEqual(got, rat(5))
			assert.deepEqual(pt, snapshot)
		})
	})

	describe('edge cases', () => {
		it('returns exact 0/1 for solenoidal (divergence-free) fields', () => {
			// 2D rigid rotation: F(x, y) = [-y, x] => div(F) = 0
			const rot2d = ([x, y]) => [rat(-y.num, y.den), x]
			const got2d = divergenceRationalStable(rot2d, [rat(13, 7), rat(-29, 11)])
			assertLowestTerms(got2d)
			assert.deepEqual(got2d, { num: 0n, den: 1n })

			// 3D nonlinear solenoidal field: F(x, y, z) = [y*z^2, -x*z^2, x^2 - y^2]
			const sol3d = ([x, y, z]) => [
				mul(y, pow(z, 2)),
				mul(rat(-1), mul(x, pow(z, 2))),
				sub(pow(x, 2), pow(y, 2)),
			]
			const got3d = divergenceRationalStable(sol3d, [rat(3, 4), rat(-5, 6), rat(7, 8)])
			assertLowestTerms(got3d)
			assert.deepEqual(got3d, { num: 0n, den: 1n })
		})

		it('returns exact n/1 for radial field F(x) = x across dimensions and scales', () => {
			const radial = (xs) => xs.slice()

			for (const n of [1, 2, 3, 5, 10]) {
				const origin = Array.from({ length: n }, () => rat(0))
				const gotOrigin = divergenceRationalStable(radial, origin)
				assertLowestTerms(gotOrigin)
				assert.deepEqual(gotOrigin, { num: BigInt(n), den: 1n })

				const extreme = Array.from({ length: n }, (_, i) =>
					i % 2 === 0 ? rat(10n ** 18n + BigInt(i), 3n) : rat(-1n, 10n ** 12n + BigInt(i)),
				)
				const gotExtreme = divergenceRationalStable(radial, extreme)
				assertLowestTerms(gotExtreme)
				assert.deepEqual(gotExtreme, { num: BigInt(n), den: 1n })
			}
		})

		it('is exact for cubic and higher-degree (up to degree 6) polynomial vector fields', () => {
			// Cubic vector field with fractional rational coefficients:
			// F(x, y, z) = [(2/3)x^3 + x y^2, -(5/7)y^3 + x^2 y, (11/13)z^3 + x y z]
			// div(F) = 2x^2 + y^2 - (15/7)y^2 + x^2 + (33/13)z^2 + xy
			//        = 3x^2 - (8/7)y^2 + (33/13)z^2 + xy
			const cubicField = ([x, y, z]) => [
				add(mul(rat(2, 3), pow(x, 3)), mul(x, pow(y, 2))),
				add(mul(rat(-5, 7), pow(y, 3)), mul(pow(x, 2), y)),
				add(mul(rat(11, 13), pow(z, 3)), mul(mul(x, y), z)),
			]
			const pt = [rat(5, 6), rat(-4, 9), rat(7, 10)]
			const [x, y, z] = pt
			const expectedCubic = add(
				add(mul(rat(3), pow(x, 2)), mul(rat(-8, 7), pow(y, 2))),
				add(mul(rat(33, 13), pow(z, 2)), mul(x, y)),
			)
			const gotCubic = divergenceRationalStable(cubicField, pt)
			assertLowestTerms(gotCubic)
			assert.deepEqual(gotCubic, expectedCubic)

			// Degree-6 polynomial field (exact with default 2 Richardson levels, O(h^6)):
			// F(x, y) = [x^6 - 2x^5 + x^3, y^6 + 3y^4 - y]
			// div(F) = 6x^5 - 10x^4 + 3x^2 + 6y^5 + 12y^3 - 1
			const deg6Field = ([u, v]) => [
				add(sub(pow(u, 6), mul(rat(2), pow(u, 5))), pow(u, 3)),
				sub(add(pow(v, 6), mul(rat(3), pow(v, 4))), v),
			]
			const p2 = [rat(-3, 4), rat(5, 3)]
			const [u, v] = p2
			const expectedDeg6 = add(
				add(sub(mul(rat(6), pow(u, 5)), mul(rat(10), pow(u, 4))), mul(rat(3), pow(u, 2))),
				sub(add(mul(rat(6), pow(v, 5)), mul(rat(12), pow(v, 3))), rat(1)),
			)
			const gotDeg6 = divergenceRationalStable(deg6Field, p2)
			assertLowestTerms(gotDeg6)
			assert.deepEqual(gotDeg6, expectedDeg6)
		})

		it('handles tiny coordinates near a pole at zero without crossing the singularity', () => {
			// F(x) = [1 / x] => div(F) = -1 / x^2
			const field = ([x]) => [div(rat(1), x)]
			const x = rat(1, 100000)
			const exact = div(rat(-1), pow(x, 2)) // -10^10
			const got = divergenceRationalStable(field, [x])
			assertLowestTerms(got)

			// Relative error |got - exact| / |exact| should be < 1e-8
			const relErr = div(abs(sub(got, exact)), abs(exact))
			assert.ok(
				relErr.num * 100000000n < relErr.den,
				`expected relative error < 1e-8, got ${relErr.num}/${relErr.den}`,
			)
		})

		it('throws RangeError on mismatched vector field dimension', () => {
			const tooShort = ([x, y]) => [add(x, y)]
			const tooLong = ([x, y]) => [x, y, add(x, y)]

			assert.throws(
				() => divergenceRationalStable(tooShort, [rat(1), rat(2)]),
				RangeError,
			)
			assert.throws(
				() => divergenceRationalStable(tooLong, [rat(1), rat(2)]),
				RangeError,
			)
		})

		it('throws on invalid inputs and invalid options', () => {
			const validField = (xs) => xs
			const validPt = [rat(1), rat(2)]

			// Invalid field
			assert.throws(() => divergenceRationalStable(null, validPt), TypeError)
			assert.throws(() => divergenceRationalStable(42, validPt), TypeError)

			// Invalid point
			assert.throws(() => divergenceRationalStable(validField, null), TypeError)
			assert.throws(() => divergenceRationalStable(validField, 'not-array'), TypeError)
			assert.throws(() => divergenceRationalStable(validField, []), RangeError)
			assert.throws(() => divergenceRationalStable(validField, [{ num: 1, den: 1n }]), TypeError)
			assert.throws(() => divergenceRationalStable(validField, [{ num: 1n, den: 0n }]), RangeError)
			assert.throws(() => divergenceRationalStable(validField, [null]), TypeError)

			// Malformed field output
			assert.throws(() => divergenceRationalStable(() => 123, validPt), TypeError)
			assert.throws(
				() => divergenceRationalStable(() => [rat(1), { num: 1n, den: 0n }], validPt),
				RangeError,
			)
			assert.throws(
				() => divergenceRationalStable(() => [rat(1), { num: 1, den: 2n }], validPt),
				TypeError,
			)

			// Invalid options
			assert.throws(() => divergenceRationalStable(validField, validPt, null), TypeError)
			assert.throws(() => divergenceRationalStable(validField, validPt, []), TypeError)
			assert.throws(() => divergenceRationalStable(validField, validPt, rat(0)), RangeError)
			assert.throws(() => divergenceRationalStable(validField, validPt, rat(-1, 2)), RangeError)
			assert.throws(
				() => divergenceRationalStable(validField, validPt, { step: rat(0) }),
				RangeError,
			)
			assert.throws(
				() => divergenceRationalStable(validField, validPt, { richardsonLevels: -1 }),
				RangeError,
			)
			assert.throws(
				() => divergenceRationalStable(validField, validPt, { richardsonLevels: 1.5 }),
				RangeError,
			)
			assert.throws(
				() => divergenceRationalStable(validField, validPt, { richardsonLevels: '2' }),
				TypeError,
			)
			assert.throws(
				() => divergenceRationalStable(validField, validPt, { richardsonLevels: 99 }),
				RangeError,
			)
			assert.throws(
				() => divergenceRationalStable(validField, validPt, { tolerance: rat(-1, 10) }),
				RangeError,
			)
			assert.throws(
				() =>
					divergenceRationalStable(validField, validPt, {
						richardsonLevels: 3,
						maxLevels: 2,
					}),
				RangeError,
			)
			assert.throws(
				() => divergenceRationalStable(validField, validPt, { maxLevels: '4' }),
				TypeError,
			)
		})
	})

	describe('independent cross-checks', () => {
		it('satisfies vector calculus identity div(curl(A)) = 0 for a 3D polynomial field', () => {
			// Vector potential A(x, y, z) = [x^2 y z + y^3, x z^3 - y^2 z, x^3 y - z^2 x]
			// Analytic curl(A) = (∂A_z/∂y - ∂A_y/∂z, ∂A_x/∂z - ∂A_z/∂x, ∂A_y/∂x - ∂A_x/∂y):
			//   curl_x = x^3 - (3 x z^2 - y^2) = x^3 - 3 x z^2 + y^2
			//   curl_y = x^2 y - (3 x^2 y - z^2) = -2 x^2 y + z^2
			//   curl_z = z^3 - (x^2 z + 3 y^2) = z^3 - x^2 z - 3 y^2
			const curlA = ([x, y, z]) => [
				add(sub(pow(x, 3), mul(rat(3), mul(x, pow(z, 2)))), pow(y, 2)),
				add(mul(rat(-2), mul(pow(x, 2), y)), pow(z, 2)),
				sub(sub(pow(z, 3), mul(pow(x, 2), z)), mul(rat(3), pow(y, 2))),
			]

			const testPoints = [
				[rat(0), rat(0), rat(0)],
				[rat(1), rat(2), rat(3)],
				[rat(-5, 7), rat(11, 13), rat(-17, 19)],
				[rat(101, 3), rat(-203, 5), rat(307, 7)],
			]

			for (const pt of testPoints) {
				const got = divergenceRationalStable(curlA, pt)
				assertLowestTerms(got)
				assert.deepEqual(got, { num: 0n, den: 1n })
			}
		})

		it('matches analytic divergence of a non-polynomial rational vector field to high precision', () => {
			// F(x, y) = [1 / (1 + x^2), y / (1 + y^2)]
			// Analytic divergence:
			//   ∂F_x/∂x = -2x / (1 + x^2)^2
			//   ∂F_y/∂y = (1 - y^2) / (1 + y^2)^2
			const field = ([x, y]) => [
				div(rat(1), add(rat(1), pow(x, 2))),
				div(y, add(rat(1), pow(y, 2))),
			]
			const analyticDiv = ([x, y]) =>
				add(
					div(mul(rat(-2), x), pow(add(rat(1), pow(x, 2)), 2)),
					div(sub(rat(1), pow(y, 2)), pow(add(rat(1), pow(y, 2)), 2)),
				)

			const pt = [rat(3, 5), rat(-2, 7)]
			const expected = analyticDiv(pt)

			// Default settings (6th-order Richardson at h = 1/1024)
			const gotDefault = divergenceRationalStable(field, pt)
			assertLowestTerms(gotDefault)
			const errDefault = abs(sub(gotDefault, expected))
			assert.ok(
				errDefault.num * 10n ** 15n < errDefault.den,
				`expected error < 1e-15, got ${errDefault.num}/${errDefault.den}`,
			)

			// Adaptive tolerance refinement to 1e-24
			const tol = rat(1n, 10n ** 24n)
			const gotTight = divergenceRationalStable(field, pt, {
				step: rat(1, 32),
				tolerance: tol,
				maxLevels: 10,
			})
			assertLowestTerms(gotTight)
			const errTight = abs(sub(gotTight, expected))
			assert.ok(
				errTight.num * 10n ** 22n < errTight.den,
				`expected adaptive error < 1e-22, got ${errTight.num}/${errTight.den}`,
			)
		})

		it('satisfies product rule div(f * F) = grad(f)·F + f * div(F) and linearity', () => {
			// Scalar field f(x, y, z) = 2xy - z^2 + 1
			// grad(f) = [2y, 2x, -2z]
			const f = ([x, y, z]) => add(sub(mul(rat(2), mul(x, y)), pow(z, 2)), rat(1))
			const gradF = ([x, y, z]) => [mul(rat(2), y), mul(rat(2), x), mul(rat(-2), z)]

			// Vector field F(x, y, z) = [x^2 + z, y^2 - x, z^2 + y]
			const F = ([x, y, z]) => [
				add(pow(x, 2), z),
				sub(pow(y, 2), x),
				add(pow(z, 2), y),
			]
			// Vector field G(x, y, z) = [x y, y z, z x]
			const G = ([x, y, z]) => [mul(x, y), mul(y, z), mul(z, x)]

			const pt = [rat(4, 3), rat(-5, 2), rat(7, 6)]

			// Product rule check
			const fTimesF = (p) => {
				const s = f(p)
				return F(p).map((c) => mul(s, c))
			}
			const lhsProduct = divergenceRationalStable(fTimesF, pt)
			const gf = gradF(pt)
			const fp = F(pt)
			const dot = add(add(mul(gf[0], fp[0]), mul(gf[1], fp[1])), mul(gf[2], fp[2]))
			const rhsProduct = add(dot, mul(f(pt), divergenceRationalStable(F, pt)))
			assertLowestTerms(lhsProduct)
			assert.deepEqual(lhsProduct, rhsProduct)

			// Linearity check: div(a*F + b*G) = a*div(F) + b*div(G)
			const a = rat(5, 7)
			const b = rat(-11, 13)
			const combo = (p) => {
				const fv = F(p)
				const gv = G(p)
				return fv.map((c, i) => add(mul(a, c), mul(b, gv[i])))
			}
			const lhsLin = divergenceRationalStable(combo, pt)
			const rhsLin = add(
				mul(a, divergenceRationalStable(F, pt)),
				mul(b, divergenceRationalStable(G, pt)),
			)
			assertLowestTerms(lhsLin)
			assert.deepEqual(lhsLin, rhsLin)
		})
	})
})
