import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { magnitudeRationalSeries } from './magnitudeRationalSeries.js'

const q = (num, den = 1n) => ({ num: BigInt(num), den: BigInt(den) })

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

function assertLowestTerms(r) {
	assert.equal(typeof r, 'object')
	assert.notEqual(r, null)
	assert.equal(typeof r.num, 'bigint', 'num must be BigInt')
	assert.equal(typeof r.den, 'bigint', 'den must be BigInt')
	assert.ok(r.den > 0n, `den must be > 0n, got ${r.den}`)
	assert.ok(r.num >= 0n, `magnitude num must be >= 0n, got ${r.num}`)
	if (r.num === 0n) {
		assert.equal(r.den, 1n, 'zero must be represented as { num: 0n, den: 1n }')
	} else {
		assert.equal(gcd(r.num, r.den), 1n, `result ${r.num}/${r.den} is not in lowest terms`)
	}
}

/**
 * Computes exact sum of squares S = sum(v[i]^2) as a reduced rational independently.
 */
function exactSumOfSquares(v) {
	let num = 0n
	let den = 1n
	for (const { num: a, den: b } of v) {
		const sqN = a * a
		const sqD = b * b
		num = num * sqD + sqN * den
		den = den * sqD
		const g = gcd(num, den)
		num /= g
		den /= g
	}
	return { num, den }
}

/**
 * Converts a rational { num, den } to a JS Number safely even when num/den exceed 10^308.
 */
function rationalToNumber({ num, den }) {
	if (num === 0n) return 0
	const neg = num < 0n
	const absN = neg ? -num : num
	const scaleBits = 60n
	const nBits = BigInt(absN.toString(2).length)
	const dBits = BigInt(den.toString(2).length)
	const shift = dBits - nBits + scaleBits
	let scaled
	if (shift >= 0n) {
		scaled = (absN << shift) / den
	} else {
		scaled = absN / (den << -shift)
	}
	const val = Number(scaled) * 2 ** -Number(shift)
	return neg ? -val : val
}

/**
 * Checks |r^2 - S| / S < 1 / 10^digits using exact BigInt arithmetic.
 */
function assertRelativeSquareErrorBelow(r, S, digits) {
	// |r.num^2 * S.den - S.num * r.den^2| * 10^digits < S.num * r.den^2
	const rSqN = r.num * r.num
	const rSqD = r.den * r.den
	const lhs = rSqN * S.den
	const rhs = S.num * rSqD
	const diff = lhs >= rhs ? lhs - rhs : rhs - lhs
	const factor = 10n ** BigInt(digits)
	assert.ok(
		diff * factor < rhs,
		`Expected relative error of r^2 vs S to be < 10^-${digits}`
	)
}

describe('magnitudeRationalSeries', () => {
	describe('zero and empty vectors', () => {
		it('returns 0/1 for empty vector []', () => {
			const res = magnitudeRationalSeries([])
			assertLowestTerms(res)
			assert.deepEqual(res, { num: 0n, den: 1n })
		})

		it('returns 0/1 for 1D zero vector', () => {
			const res = magnitudeRationalSeries([q(0, 1)])
			assertLowestTerms(res)
			assert.deepEqual(res, { num: 0n, den: 1n })
		})

		it('returns 0/1 for multi-dimensional zero vectors with unreduced/negative denominators', () => {
			const res = magnitudeRationalSeries([q(0, 5), q(0, -3), q(0, 100)])
			assertLowestTerms(res)
			assert.deepEqual(res, { num: 0n, den: 1n })
		})
	})

	describe('1D vectors and input normalization', () => {
		it('returns exact absolute value in lowest terms for positive and negative 1D vectors', () => {
			const cases = [
				[[q(7, 3)], q(7, 3)],
				[[q(-7, 3)], q(7, 3)],
				[[q(6, -8)], q(3, 4)],
				[[q(-18, -24)], q(3, 4)],
				[[q(1, 1)], q(1, 1)]
			]
			for (const [vec, expected] of cases) {
				const res = magnitudeRationalSeries(vec)
				assertLowestTerms(res)
				assert.deepEqual(res, expected)
			}
		})
	})

	describe('exact rational squares (Pythagorean triples and tuples)', () => {
		it('computes exact magnitudes for 2D Pythagorean triples', () => {
			const cases = [
				[[q(3), q(4)], q(5)],
				[[q(-3), q(4)], q(5)],
				[[q(3), q(-4)], q(5)],
				[[q(-3), q(-4)], q(5)],
				[[q(5), q(12)], q(13)],
				[[q(8), q(15)], q(17)],
				[[q(7), q(24)], q(25)],
				[[q(20), q(21)], q(29)]
			]
			for (const [vec, expected] of cases) {
				const res = magnitudeRationalSeries(vec)
				assertLowestTerms(res)
				assert.deepEqual(res, expected)
			}
		})

		it('computes exact magnitudes for fractional and unreduced Pythagorean triples', () => {
			const cases = [
				[[q(3, 7), q(4, 7)], q(5, 7)],
				[[q(-3, 10), q(4, 10)], q(1, 2)],
				[[q(5, 6), q(2, 1)], q(13, 6)],
				[[q(6, 2), q(-12, -3)], q(5, 1)],
				[[q(9, -6), q(-12, 6)], q(5, 2)]
			]
			for (const [vec, expected] of cases) {
				const res = magnitudeRationalSeries(vec)
				assertLowestTerms(res)
				assert.deepEqual(res, expected)
			}
		})

		it('computes exact magnitudes for 3D and 4D Pythagorean tuples', () => {
			const cases = [
				[[q(1), q(2), q(2)], q(3)],
				[[q(2), q(-3), q(6)], q(7)],
				[[q(1, 6), q(2, 6), q(-2, 6)], q(1, 2)],
				[[q(1), q(1), q(1), q(1)], q(2)],
				[[q(1, 2), q(-1, 2), q(1, 2), q(-1, 2)], q(1)]
			]
			for (const [vec, expected] of cases) {
				const res = magnitudeRationalSeries(vec)
				assertLowestTerms(res)
				assert.deepEqual(res, expected)
			}
		})

		it('handles very large BigInt Pythagorean triples without precision loss', () => {
			const scale = 10n ** 30n
			const res = magnitudeRationalSeries([
				{ num: 3n * scale, den: 1n },
				{ num: 4n * scale, den: 1n }
			])
			assertLowestTerms(res)
			assert.deepEqual(res, { num: 5n * scale, den: 1n })
		})

		it('returns exact result for perfect squares even with iterations = 1', () => {
			const res = magnitudeRationalSeries([q(3), q(4)], 1)
			assertLowestTerms(res)
			assert.deepEqual(res, q(5))
		})
	})

	describe('non-perfect squares and Heron convergence', () => {
		it('computes high-accuracy rational approximations for standard irrational norms', () => {
			const vectors = [
				[q(1), q(1)], // sqrt(2)
				[q(1), q(1), q(1)], // sqrt(3)
				[q(1), q(2)], // sqrt(5)
				[q(1, 2), q(1, 3)], // sqrt(13/36)
				[q(2, 5), q(-3, 7), q(4, 11)],
				[q(1, 1000), q(1, 1000)],
				[q(100), q(1)]
			]
			for (const vec of vectors) {
				const res = magnitudeRationalSeries(vec)
				assertLowestTerms(res)
				const S = exactSumOfSquares(vec)
				// Default iterations = 8 guarantees relative error of r^2 vs S well below 10^-150
				assertRelativeSquareErrorBelow(res, S, 150)
				// Heron iterates for k >= 1 strictly overestimate sqrt(S) by AM-GM
				assert.ok(res.num * res.num * S.den > S.num * res.den * res.den)
			}
		})

		it('matches exact Heron iterates and decreases monotonically for sqrt(2)', () => {
			const vec = [q(1), q(1)]
			const r1 = magnitudeRationalSeries(vec, 1)
			const r2 = magnitudeRationalSeries(vec, 2)
			const r3 = magnitudeRationalSeries(vec, 3)

			assertLowestTerms(r1)
			assertLowestTerms(r2)
			assertLowestTerms(r3)

			// Initial guess for S = 2/1 (bitLen diff = 1, odd) is 3/2 -> Heron iterates:
			// x1 = 17/12, x2 = 577/408, x3 = 665857/470832
			assert.deepEqual(r1, q(17, 12))
			assert.deepEqual(r2, q(577, 408))
			assert.deepEqual(r3, q(665857, 470832))

			// Monotonically decreasing: r1 > r2 > r3 > sqrt(2)
			assert.ok(r1.num * r2.den > r2.num * r1.den)
			assert.ok(r2.num * r3.den > r3.num * r2.den)
			assert.ok(r3.num * r3.num > 2n * r3.den * r3.den)
		})

		it('handles huge and tiny non-perfect squares beyond IEEE-754 float range', () => {
			const big = 10n ** 25n
			const bigVec = [{ num: big, den: 1n }, { num: big, den: 1n }]
			const bigRes = magnitudeRationalSeries(bigVec)
			assertLowestTerms(bigRes)
			assertRelativeSquareErrorBelow(bigRes, exactSumOfSquares(bigVec), 150)

			const tinyVec = [{ num: 1n, den: big }, { num: 2n, den: big }]
			const tinyRes = magnitudeRationalSeries(tinyVec)
			assertLowestTerms(tinyRes)
			assertRelativeSquareErrorBelow(tinyRes, exactSumOfSquares(tinyVec), 150)
		})
	})

	describe('cross-checks against Math.hypot and algebraic norm properties', () => {
		it('cross-checks against Math.hypot across 1D to 5D vectors', () => {
			const vectors = [
				[q(0)],
				[q(-5, 4)],
				[q(3), q(4)],
				[q(1), q(1)],
				[q(1, 3), q(-2, 5)],
				[q(7, 2), q(-1, 3), q(5, 6)],
				[q(1, 2), q(2, 3), q(3, 4), q(4, 5)],
				[q(-9, 11), q(4, 7), q(-13, 5), q(2, 3), q(1, 17)]
			]
			for (const vec of vectors) {
				const res = magnitudeRationalSeries(vec)
				assertLowestTerms(res)
				const approx = rationalToNumber(res)
				const expected = Math.hypot(...vec.map(({ num, den }) => Number(num) / Number(den)))
				if (expected === 0) {
					assert.equal(approx, 0)
				} else {
					const relErr = Math.abs(approx - expected) / expected
					assert.ok(
						relErr < 1e-14,
						`Mismatch vs Math.hypot: got ${approx}, expected ${expected}, relErr=${relErr}`
					)
				}
			}
		})

		it('satisfies sign invariance and component permutation invariance', () => {
			const v1 = [q(2, 3), q(-5, 7), q(11, 13)]
			const v2 = [q(-11, 13), q(2, 3), q(5, 7)]
			assert.deepEqual(magnitudeRationalSeries(v1), magnitudeRationalSeries(v2))
		})

		it('satisfies homogeneity ||c * v|| ≈ |c| * ||v||', () => {
			const c = q(-7, 5)
			const v = [q(1, 2), q(3, 4), q(-5, 6)]
			const cv = v.map(({ num, den }) => ({ num: num * c.num, den: den * c.den }))

			const normV = magnitudeRationalSeries(v)
			const normCV = magnitudeRationalSeries(cv)
			assertLowestTerms(normV)
			assertLowestTerms(normCV)

			// Compare (normCV)^2 and (|c| * normV)^2 to high precision
			const scaledNum = 7n * normV.num
			const scaledDen = 5n * normV.den
			const lhs = normCV.num * scaledDen
			const rhs = scaledNum * normCV.den
			const diff = lhs >= rhs ? lhs - rhs : rhs - lhs
			assert.ok(diff * 10n ** 150n < rhs)
		})

		it('satisfies the triangle inequality ||u + v|| <= ||u|| + ||v|| and Cauchy-Schwarz |u·v| <= ||u|| ||v||', () => {
			const u = [q(1, 2), q(-2, 3), q(3, 5)]
			const v = [q(4, 7), q(1, 4), q(-1, 2)]
			const uv = u.map((ui, i) => ({
				num: ui.num * v[i].den + v[i].num * ui.den,
				den: ui.den * v[i].den
			}))

			const normU = magnitudeRationalSeries(u)
			const normV = magnitudeRationalSeries(v)
			const normUV = magnitudeRationalSeries(uv)

			// ||u + v|| <= ||u|| + ||v||
			const sumNum = normU.num * normV.den + normV.num * normU.den
			const sumDen = normU.den * normV.den
			assert.ok(normUV.num * sumDen <= sumNum * normUV.den)

			// |u · v| <= ||u|| * ||v||
			let dotNum = 0n
			let dotDen = 1n
			for (let i = 0; i < u.length; i++) {
				const pN = u[i].num * v[i].num
				const pD = u[i].den * v[i].den
				dotNum = dotNum * pD + pN * dotDen
				dotDen = dotDen * pD
			}
			const absDotNum = dotNum < 0n ? -dotNum : dotNum
			const prodNum = normU.num * normV.num
			const prodDen = normU.den * normV.den
			assert.ok(absDotNum * prodDen <= prodNum * dotDen)
		})
	})

	describe('input validation', () => {
		it('throws TypeError when v is not an array', () => {
			for (const bad of [null, undefined, 42, '3,4', { num: 1n, den: 1n }, new Float64Array([3, 4])]) {
				assert.throws(() => magnitudeRationalSeries(bad), TypeError)
			}
		})

		it('throws TypeError for invalid vector elements or sparse arrays', () => {
			const badVectors = [
				[null],
				[undefined],
				[3],
				['3/1'],
				[[3n, 1n]],
				[{ num: 3, den: 1 }],
				[{ num: 3n, den: 1 }],
				[{ num: 3, den: 1n }],
				[{ num: 3n }],
				[{ den: 1n }],
				[q(3), 'bad'],
				// eslint-disable-next-line no-sparse-arrays
				[q(3), , q(4)]
			]
			for (const bad of badVectors) {
				assert.throws(() => magnitudeRationalSeries(bad), TypeError)
			}
		})

		it('throws RangeError when any element has denominator 0n', () => {
			const badVectors = [
				[{ num: 1n, den: 0n }],
				[{ num: 0n, den: 0n }],
				[q(3), { num: 4n, den: 0n }]
			]
			for (const bad of badVectors) {
				assert.throws(() => magnitudeRationalSeries(bad), RangeError)
			}
		})

		it('throws TypeError when iterations is not a number', () => {
			for (const bad of ['8', 8n, null, {}, true]) {
				assert.throws(() => magnitudeRationalSeries([q(1), q(1)], bad), TypeError)
			}
		})

		it('throws RangeError when iterations is not a safe positive integer', () => {
			for (const bad of [0, -1, -100, 1.5, 0.1, Number.NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
				assert.throws(() => magnitudeRationalSeries([q(1), q(1)], bad), RangeError)
			}
		})

		it('validates iterations even for zero vectors and perfect squares', () => {
			assert.throws(() => magnitudeRationalSeries([], 0), RangeError)
			assert.throws(() => magnitudeRationalSeries([q(3), q(4)], -2), RangeError)
			assert.throws(() => magnitudeRationalSeries([q(3), q(4)], '4'), TypeError)
		})
	})
})
