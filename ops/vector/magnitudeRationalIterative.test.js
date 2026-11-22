import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { magnitudeRationalIterative } from './magnitudeRationalIterative.js'

/**
 * Helper to build a rational object.
 * @param {bigint|number} num
 * @param {bigint|number} [den=1n]
 */
function r(num, den = 1n) {
	return { num: BigInt(num), den: BigInt(den) }
}

/**
 * Independent BigInt GCD for verifying reduced rational invariants.
 */
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

/**
 * Assert that a value is a canonical reduced non-negative rational { num, den }.
 */
function assertCanonicalNonNegativeRational(val) {
	assert.equal(typeof val, 'object')
	assert.notEqual(val, null)
	assert.equal(typeof val.num, 'bigint')
	assert.equal(typeof val.den, 'bigint')
	assert.ok(val.den > 0n, `expected den > 0n, got ${val.den}`)
	assert.ok(val.num >= 0n, `expected num >= 0n, got ${val.num}`)
	if (val.num === 0n) {
		assert.equal(val.den, 1n)
	} else {
		assert.equal(gcd(val.num, val.den), 1n, `expected reduced rational, got ${val.num}/${val.den}`)
	}
}

/**
 * Safely convert an arbitrarily large positive or negative rational to a JS Number
 * without overflowing Number.MAX_VALUE on huge numerators/denominators.
 */
function rationalToNumber(q) {
	if (q.num === 0n) return 0
	const sign = q.num < 0n ? -1 : 1
	const absNum = q.num < 0n ? -q.num : q.num
	// Scale so integer division keeps ~18 significant decimal digits
	const shift = absNum.toString(2).length - q.den.toString(2).length
	const precisionBits = 64
	let scaled
	if (precisionBits - shift >= 0) {
		scaled = (absNum << BigInt(precisionBits - shift)) / q.den
	} else {
		scaled = absNum / (q.den << BigInt(shift - precisionBits))
	}
	return sign * Number(scaled) * Math.pow(2, shift - precisionBits)
}

/**
 * Independent naive dot product over exact rationals for cross-checking.
 */
function independentDotProduct(a, b) {
	let num = 0n
	let den = 1n
	for (let i = 0; i < a.length; i += 1) {
		const prodNum = a[i].num * b[i].num
		const prodDen = a[i].den * b[i].den
		num = num * prodDen + prodNum * den
		den = den * prodDen
	}
	if (num === 0n) return { num: 0n, den: 1n }
	if (den < 0n) {
		num = -num
		den = -den
	}
	const g = gcd(num, den)
	return { num: num / g, den: den / g }
}

/**
 * Compute |a - b| as a reduced rational.
 */
function absDiffRational(a, b) {
	const num = a.num * b.den - b.num * a.den
	const den = a.den * b.den
	const absNum = num < 0n ? -num : num
	const g = gcd(absNum, den)
	return { num: absNum / g, den: den / g }
}

/**
 * Compare two positive rationals: returns -1, 0, or 1.
 */
function cmpRational(a, b) {
	const left = a.num * b.den
	const right = b.num * a.den
	if (left < right) return -1
	if (left > right) return 1
	return 0
}

describe('magnitudeRationalIterative', () => {
	describe('exact cases (zero, 1D, Pythagorean triples and quadruples)', () => {
		it('returns 0/1 for 1D and multi-dimensional zero vectors', () => {
			const z1 = magnitudeRationalIterative([r(0, 1)])
			assert.deepEqual(z1, { num: 0n, den: 1n })
			assertCanonicalNonNegativeRational(z1)

			const z3 = magnitudeRationalIterative([r(0, 5), r(0, -3), r(0, 100)])
			assert.deepEqual(z3, { num: 0n, den: 1n })
			assertCanonicalNonNegativeRational(z3)
		})

		it('computes exact absolute value for 1D vectors', () => {
			assert.deepEqual(magnitudeRationalIterative([r(7, 3)]), r(7, 3))
			assert.deepEqual(magnitudeRationalIterative([r(-7, 3)]), r(7, 3))
			assert.deepEqual(magnitudeRationalIterative([r(14, -6)]), r(7, 3))
			assert.deepEqual(magnitudeRationalIterative([r(-14, -6)]), r(7, 3))
		})

		it('computes exact magnitude for Pythagorean triples and rational scalings', () => {
			// (3, 4) -> 5
			assert.deepEqual(magnitudeRationalIterative([r(3), r(4)]), r(5))
			// (-3, -4) -> 5
			assert.deepEqual(magnitudeRationalIterative([r(-3), r(-4)]), r(5))
			// (5/2, 6) -> sqrt(25/4 + 36) = sqrt(169/4) = 13/2
			assert.deepEqual(magnitudeRationalIterative([r(5, 2), r(6, 1)]), r(13, 2))
			// Unreduced inputs with negative denominator: (6/2, -8/-2) -> (3, 4) -> 5
			assert.deepEqual(magnitudeRationalIterative([r(6, 2), r(-8, -2)]), r(5, 1))
			// (8/5, -15/5) -> 17/5
			assert.deepEqual(magnitudeRationalIterative([r(8, 5), r(-15, 5)]), r(17, 5))
		})

		it('computes exact magnitude for higher-dimensional exact norms', () => {
			// (2, 3, 6) -> sqrt(4 + 9 + 36) = 7
			assert.deepEqual(magnitudeRationalIterative([r(2), r(3), r(6)]), r(7))
			// (1/3, 2/3, 2/3) -> 1
			assert.deepEqual(magnitudeRationalIterative([r(1, 3), r(2, 3), r(2, 3)]), r(1))
			// (1, 1, 1, 1) -> 2
			assert.deepEqual(magnitudeRationalIterative([r(1), r(1), r(1), r(1)]), r(2))
		})

		it('returns exact result for perfect squares even when iterations is 0', () => {
			const res = magnitudeRationalIterative([r(5, 2), r(6, 1)], { iterations: 0 })
			assert.deepEqual(res, r(13, 2))
		})

		it('handles arbitrarily large BigInt components accurately', () => {
			const scale = 10n ** 35n
			const mag = magnitudeRationalIterative([
				{ num: 3n * scale, den: 7n },
				{ num: -4n * scale, den: 7n },
			])
			assert.deepEqual(mag, { num: 5n * scale, den: 7n })
			assertCanonicalNonNegativeRational(mag)
		})
	})

	describe('non-perfect-square cases and Heron iteration convergence', () => {
		it('produces exact expected Heron iterates for (1, 1) -> sqrt(2)', () => {
			const vec = [r(1), r(1)]
			// Initial guess is isqrt(2)/isqrt(1) = 1/1
			assert.deepEqual(magnitudeRationalIterative(vec, { iterations: 0 }), r(1, 1))
			assert.deepEqual(magnitudeRationalIterative(vec, { iterations: 1 }), r(3, 2))
			assert.deepEqual(magnitudeRationalIterative(vec, { iterations: 2 }), r(17, 12))
			assert.deepEqual(magnitudeRationalIterative(vec, { iterations: 3 }), r(577, 408))
			assert.deepEqual(magnitudeRationalIterative(vec, { iterations: 4 }), r(665857, 470832))
		})

		it('approximates sqrt(2) to very high precision with default options', () => {
			const mag = magnitudeRationalIterative([r(1), r(1)])
			assertCanonicalNonNegativeRational(mag)

			// Compare against Math.SQRT2
			const approxFloat = rationalToNumber(mag)
			assert.ok(Math.abs(approxFloat - Math.SQRT2) < 1e-15)

			// Exact BigInt check: |mag^2 - 2| < 10^-200
			const magSq = { num: mag.num * mag.num, den: mag.den * mag.den }
			const err = absDiffRational(magSq, r(2))
			assert.equal(cmpRational(err, { num: 1n, den: 10n ** 200n }), -1)
		})

		it('monotonically decreases from above after iteration 1 (AM-GM property)', () => {
			const vec = [r(1), r(1), r(1)] // sumSq = 3
			const iterates = [1, 2, 3, 4, 5].map((iterations) =>
				magnitudeRationalIterative(vec, { iterations }),
			)
			for (let i = 0; i < iterates.length; i += 1) {
				const itVal = iterates[i]
				assertCanonicalNonNegativeRational(itVal)
				// itVal^2 >= 3
				assert.ok(itVal.num * itVal.num >= 3n * itVal.den * itVal.den)
				if (i > 0) {
					assert.equal(cmpRational(itVal, iterates[i - 1]), -1)
				}
			}
			assert.ok(Math.abs(rationalToNumber(iterates[4]) - Math.sqrt(3)) < 1e-15)
		})

		it('handles fractional, very small, and very large irrational magnitudes', () => {
			// (1/2, 1/3) -> sqrt(13)/6
			const fracMag = magnitudeRationalIterative([r(1, 2), r(1, 3)], { iterations: 6 })
			assertCanonicalNonNegativeRational(fracMag)
			assert.ok(Math.abs(rationalToNumber(fracMag) - Math.sqrt(13) / 6) < 1e-15)

			// Very small: (1/10^12, 1/10^12) -> sqrt(2) * 10^-12
			const tinyDen = 10n ** 12n
			const tinyMag = magnitudeRationalIterative(
				[
					{ num: 1n, den: tinyDen },
					{ num: 1n, den: tinyDen },
				],
				{ iterations: 6 },
			)
			assertCanonicalNonNegativeRational(tinyMag)
			const tinySumSq = { num: 2n, den: tinyDen * tinyDen }
			const tinyMagSq = { num: tinyMag.num * tinyMag.num, den: tinyMag.den * tinyMag.den }
			const tinyErr = absDiffRational(tinyMagSq, tinySumSq)
			// Relative error on squared norm should be < 10^-25
			assert.ok(tinyErr.num * 10n ** 25n * tinySumSq.den < tinyErr.den * tinySumSq.num)

			// Very large: (10^20, 10^20) -> sqrt(2) * 10^20
			const bigNum = 10n ** 20n
			const bigMag = magnitudeRationalIterative(
				[
					{ num: bigNum, den: 1n },
					{ num: bigNum, den: 1n },
				],
				{ iterations: 6 },
			)
			assertCanonicalNonNegativeRational(bigMag)
			const bigSumSq = { num: 2n * bigNum * bigNum, den: 1n }
			const bigMagSq = { num: bigMag.num * bigMag.num, den: bigMag.den * bigMag.den }
			const bigErr = absDiffRational(bigMagSq, bigSumSq)
			assert.ok(bigErr.num * 10n ** 25n < bigErr.den * bigSumSq.num)
		})

		it('stops early when tolerance option is satisfied', () => {
			const vec = [r(1), r(1)] // sqrt(2)
			// Initial guess is 1/1; |1 - sqrt(2)| ~= 0.4142 <= 1/2, so should return 1/1 immediately
			const loose = magnitudeRationalIterative(vec, { tolerance: r(1, 2) })
			assert.deepEqual(loose, r(1, 1))

			// Tolerance 1/10: iteration 1 gives 3/2 = 1.5; |1.5 - 1.4142...| ~= 0.0858 <= 0.1
			const med = magnitudeRationalIterative(vec, { tolerance: r(1, 10) })
			assert.deepEqual(med, r(3, 2))

			// Tight tolerance 1/10^30
			const tol = { num: 1n, den: 10n ** 30n }
			const tight = magnitudeRationalIterative(vec, { tolerance: tol })
			assertCanonicalNonNegativeRational(tight)
			// Verify (tight - tol)^2 <= 2 <= tight^2
			const lowerNum = tight.num * tol.den - tol.num * tight.den
			const lowerDen = tight.den * tol.den
			assert.ok(lowerNum > 0n)
			assert.ok(lowerNum * lowerNum <= 2n * lowerDen * lowerDen)
			assert.ok(tight.num * tight.num >= 2n * tight.den * tight.den)
		})
	})

	describe('cross-checks against independent dot product and floating-point Euclidean norm', () => {
		it('cross-checks squared magnitude against independent rational dot product and Math.hypot', () => {
			const testVectors = [
				[r(3), r(4)],
				[r(-5, 2), r(6)],
				[r(1, 2), r(-1, 3), r(1, 4)],
				[r(7, 5), r(0, 1), r(-11, 7), r(2, 3)],
				[r(-9, 4), r(12, 5), r(-15, 7), r(8, 3), r(1, 11)],
			]

			for (const vec of testVectors) {
				const mag = magnitudeRationalIterative(vec, { iterations: 7 })
				assertCanonicalNonNegativeRational(mag)

				// Cross-check 1: independent exact dot product v . v
				const dotSelf = independentDotProduct(vec, vec)
				const magSq = { num: mag.num * mag.num, den: mag.den * mag.den }
				const sqDiff = absDiffRational(magSq, dotSelf)
				// |mag^2 - dot(v, v)| / dot(v, v) < 10^-40
				assert.ok(
					sqDiff.num * 10n ** 40n * dotSelf.den <= sqDiff.den * dotSelf.num,
					`squared magnitude mismatch for vector`,
				)

				// Cross-check 2: independent floating-point Math.hypot
				const floatComponents = vec.map((c) => Number(c.num) / Number(c.den))
				const expectedFloat = Math.hypot(...floatComponents)
				const actualFloat = rationalToNumber(mag)
				assert.ok(
					Math.abs(actualFloat - expectedFloat) <= 1e-14 * Math.max(1, expectedFloat),
					`float mismatch: got ${actualFloat}, expected ${expectedFloat}`,
				)
			}
		})

		it('satisfies homogeneity ||k * v|| = |k| * ||v|| for exact norms', () => {
			const v = [r(5, 2), r(-6, 1)]
			const k = r(-7, 11)
			const scaled = v.map((c) => ({ num: c.num * k.num, den: c.den * k.den }))

			const magV = magnitudeRationalIterative(v)
			const magScaled = magnitudeRationalIterative(scaled)
			const absK = { num: k.num < 0n ? -k.num : k.num, den: k.den }
			const expectedNum = absK.num * magV.num
			const expectedDen = absK.den * magV.den
			const g = gcd(expectedNum, expectedDen)

			assert.deepEqual(magScaled, { num: expectedNum / g, den: expectedDen / g })
		})

		it('does not mutate input vector or rational elements', () => {
			const v = [r(6, -4), r(-8, 4)]
			const snapshot = v.map((c) => ({ num: c.num, den: c.den }))
			magnitudeRationalIterative(v)
			assert.deepEqual(v, snapshot)
		})
	})

	describe('invalid input validation', () => {
		it('throws TypeError when vector is not an array', () => {
			for (const bad of [null, undefined, 42, '123', {}, { num: 1n, den: 1n }]) {
				assert.throws(() => magnitudeRationalIterative(bad), TypeError)
			}
		})

		it('throws RangeError when vector is empty', () => {
			assert.throws(() => magnitudeRationalIterative([]), RangeError)
		})

		it('throws TypeError for invalid vector elements or sparse arrays', () => {
			const sparse = new Array(2)
			sparse[0] = r(1)
			assert.throws(() => magnitudeRationalIterative(sparse), TypeError)

			for (const badEl of [
				null,
				undefined,
				5,
				[1n, 2n],
				{ num: 1, den: 2 },
				{ num: 1n, den: 2 },
				{ num: 1, den: 2n },
				{ num: 1n },
				{ den: 1n },
			]) {
				assert.throws(() => magnitudeRationalIterative([badEl]), TypeError)
			}
		})

		it('throws RangeError for zero denominators in vector elements', () => {
			assert.throws(() => magnitudeRationalIterative([r(1, 0)]), RangeError)
			assert.throws(() => magnitudeRationalIterative([r(0, 0)]), RangeError)
			assert.throws(() => magnitudeRationalIterative([r(3, 1), r(4, 0)]), RangeError)
		})

		it('throws TypeError or RangeError for invalid options', () => {
			const validVec = [r(1), r(1)]

			for (const badOpts of [null, [], 10, 'fast']) {
				assert.throws(() => magnitudeRationalIterative(validVec, badOpts), TypeError)
			}

			for (const badIterType of ['5', 5n, null, {}]) {
				assert.throws(
					() => magnitudeRationalIterative(validVec, { iterations: badIterType }),
					TypeError,
				)
			}

			for (const badIterRange of [-1, 1.5, NaN, Infinity, -Infinity]) {
				assert.throws(
					() => magnitudeRationalIterative(validVec, { iterations: badIterRange }),
					RangeError,
				)
			}

			for (const badTolType of [0.001, null, [], { num: 1, den: 10 }]) {
				assert.throws(
					() => magnitudeRationalIterative(validVec, { tolerance: badTolType }),
					TypeError,
				)
			}

			for (const badTolRange of [r(0, 1), r(-1, 10), r(1, -10), r(1, 0)]) {
				assert.throws(
					() => magnitudeRationalIterative(validVec, { tolerance: badTolRange }),
					RangeError,
				)
			}
		})
	})
})
