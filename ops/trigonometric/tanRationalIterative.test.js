import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { tanRationalIterative } from './tanRationalIterative.js'

function gcdBigInt(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const r = x % y
		x = y
		y = r
	}
	return x
}

/**
 * Safely converts an arbitrarily large BigInt rational to a JS number without overflow.
 */
function ratToNumber({ num, den }) {
	const scale = 10n ** 18n
	const scaled = (num * scale) / den
	return Number(scaled) / 1e18
}

/**
 * Asserts that a rational result is well-formed, reduced to lowest terms, and has den > 0n.
 */
function assertReducedRational(res) {
	assert.equal(typeof res.num, 'bigint')
	assert.equal(typeof res.den, 'bigint')
	assert.ok(res.den > 0n, `Expected positive denominator, got ${res.den}`)
	assert.equal(
		gcdBigInt(res.num, res.den),
		1n,
		`Expected lowest terms for ${res.num}/${res.den}`,
	)
}

/**
 * Asserts |a - b| < 10^(-digits) in exact rational arithmetic.
 */
function assertRationalClose(a, b, digits = 20) {
	const diffNum = a.num * b.den - b.num * a.den
	const absDiffNum = diffNum < 0n ? -diffNum : diffNum
	const commonDen = a.den * b.den
	const toleranceDen = 10n ** BigInt(digits)
	assert.ok(
		absDiffNum * toleranceDen < commonDen,
		`Expected rationals to agree to ${digits} digits: ${ratToNumber(a)} vs ${ratToNumber(b)}`,
	)
}

describe('tanRationalIterative', () => {
	test('returns exact 0/1 for zero angles', () => {
		assert.deepEqual(tanRationalIterative({ num: 0n, den: 1n }), { num: 0n, den: 1n })
		assert.deepEqual(tanRationalIterative({ num: 0n, den: 42n }), { num: 0n, den: 1n })
		assert.deepEqual(tanRationalIterative({ num: 0n, den: -7n }), { num: 0n, den: 1n })
	})

	test('matches Math.tan for normal positive and negative angles', () => {
		const samples = [
			{ num: 1n, den: 10n },
			{ num: 1n, den: 4n },
			{ num: 1n, den: 2n },
			{ num: 3n, den: 4n },
			{ num: 1n, den: 1n },
			{ num: 5n, den: 4n },
			{ num: -1n, den: 3n },
			{ num: -7n, den: 6n },
		]

		for (const angle of samples) {
			const result = tanRationalIterative(angle)
			assertReducedRational(result)
			const expected = Math.tan(Number(angle.num) / Number(angle.den))
			const actual = ratToNumber(result)
			assert.ok(
				Math.abs(actual - expected) < 1e-14,
				`tan(${angle.num}/${angle.den}): got ${actual}, expected ${expected}`,
			)
		}
	})

	test('normalizes unreduced inputs and negative denominators identically', () => {
		const base = tanRationalIterative({ num: 1n, den: 3n })
		assertReducedRational(base)
		assert.deepEqual(tanRationalIterative({ num: 5n, den: 15n }), base)
		assert.deepEqual(tanRationalIterative({ num: -2n, den: -6n }), base)

		const negBase = tanRationalIterative({ num: -1n, den: 3n })
		assertReducedRational(negBase)
		assert.deepEqual(tanRationalIterative({ num: 1n, den: -3n }), negBase)
		assert.deepEqual(tanRationalIterative({ num: 4n, den: -12n }), negBase)
	})

	test('handles very small angles and angles near pi/4 and pi/2', () => {
		// Small angle: tan(x) ≈ x
		const small = tanRationalIterative({ num: 1n, den: 1000000n })
		assertReducedRational(small)
		assert.ok(Math.abs(ratToNumber(small) - Math.tan(1e-6)) < 1e-15)

		// Near pi/4: tan(pi/4) = 1
		const nearPiOver4 = { num: 7853981633974483n, den: 10000000000000000n }
		const resPiOver4 = tanRationalIterative(nearPiOver4)
		assertReducedRational(resPiOver4)
		assert.ok(Math.abs(ratToNumber(resPiOver4) - 1) < 1e-15)

		// Near pi/2 (dyadic rational just past pi/2, exact in float64, triggers range reduction)
		const nearPiOver2 = { num: 1609n, den: 1024n }
		const resPiOver2 = tanRationalIterative(nearPiOver2)
		assertReducedRational(resPiOver2)
		const expectedNearPole = Math.tan(1609 / 1024)
		const relErr = Math.abs(ratToNumber(resPiOver2) - expectedNearPole) / Math.abs(expectedNearPole)
		assert.ok(relErr < 1e-12, `Relative error near pole too large: ${relErr}`)

		// Very close to pi/2 (355/226 ≈ pi/2 + 1.33e-7); verify sign, magnitude, and agreement within float64 input rounding
		const veryNearPiOver2 = { num: 355n, den: 226n }
		const resVeryNear = tanRationalIterative(veryNearPiOver2)
		assertReducedRational(resVeryNear)
		const expectedVeryNear = Math.tan(355 / 226)
		const relErrVeryNear =
			Math.abs(ratToNumber(resVeryNear) - expectedVeryNear) / Math.abs(expectedVeryNear)
		assert.ok(relErrVeryNear < 1e-8, `Relative error very near pole too large: ${relErrVeryNear}`)
	})

	test('handles large positive and negative angles via iterative range reduction', () => {
		const largeAngles = [
			{ num: 10n, den: 1n },
			{ num: -10n, den: 1n },
			{ num: 100n, den: 3n },
			{ num: 1000n, den: 1n },
			{ num: -123456n, den: 7n },
			{ num: 1000000n, den: 1n },
		]

		for (const angle of largeAngles) {
			const res = tanRationalIterative(angle)
			assertReducedRational(res)
			const expected = Math.tan(Number(angle.num) / Number(angle.den))
			const actual = ratToNumber(res)
			const tol = 1e-9 * Math.max(1, Math.abs(expected))
			assert.ok(
				Math.abs(actual - expected) < tol,
				`tan(${angle.num}/${angle.den}): got ${actual}, expected ${expected}`,
			)
		}

		// Very large BigInt angle (beyond safe integer range) still produces a valid reduced rational
		const huge = { num: 10n ** 18n, den: 3n }
		const hugeRes = tanRationalIterative(huge)
		assertReducedRational(hugeRes)
	})

	test('cross-check: exact odd symmetry tan(-x) === -tan(x)', () => {
		const angles = [
			{ num: 1n, den: 7n },
			{ num: 11n, den: 8n },
			{ num: 22n, den: 7n },
			{ num: 1000n, den: 3n },
		]

		for (const x of angles) {
			const pos = tanRationalIterative(x)
			const neg = tanRationalIterative({ num: -x.num, den: x.den })
			assertReducedRational(pos)
			assertReducedRational(neg)
			assert.equal(neg.num, -pos.num)
			assert.equal(neg.den, pos.den)
		}
	})

	test('cross-check: double-angle identity tan(2x) = 2*tan(x) / (1 - tan^2(x))', () => {
		const angles = [
			{ num: 1n, den: 5n },
			{ num: 2n, den: 3n },
			{ num: -3n, den: 7n },
			{ num: 5n, den: 1n },
		]

		for (const x of angles) {
			const tanX = tanRationalIterative(x)
			const tan2X = tanRationalIterative({ num: 2n * x.num, den: x.den })

			// Compute 2*tan(x) / (1 - tan^2(x)) in exact BigInt rational arithmetic
			// = (2 * n / d) / ((d^2 - n^2) / d^2) = (2 * n * d) / (d^2 - n^2)
			const rhsNum = 2n * tanX.num * tanX.den
			const rhsDen = tanX.den * tanX.den - tanX.num * tanX.num
			const rhs = rhsDen < 0n
				? { num: -rhsNum, den: -rhsDen }
				: { num: rhsNum, den: rhsDen }

			assertRationalClose(tan2X, rhs, 22)
		}
	})

	test('supports explicit terms parameter and improves accuracy with more terms', () => {
		const x = { num: 1n, den: 2n }
		// For terms = 1, sin(x) = x and cos(x) = 1, so tan(x) = x exactly.
		assert.deepEqual(tanRationalIterative(x, 1), { num: 1n, den: 2n })

		const low = tanRationalIterative(x, 3)
		const high = tanRationalIterative(x, 15)
		const ref = Math.tan(0.5)
		assert.ok(Math.abs(ratToNumber(high) - ref) < Math.abs(ratToNumber(low) - ref))
	})

	test('validates inputs and throws appropriate errors', () => {
		assert.throws(() => tanRationalIterative(null), TypeError)
		assert.throws(() => tanRationalIterative(undefined), TypeError)
		assert.throws(() => tanRationalIterative(0.5), TypeError)
		assert.throws(() => tanRationalIterative('1/2'), TypeError)
		assert.throws(() => tanRationalIterative({}), TypeError)
		assert.throws(() => tanRationalIterative({ num: 1, den: 2n }), TypeError)
		assert.throws(() => tanRationalIterative({ num: 1n, den: 2 }), TypeError)
		assert.throws(() => tanRationalIterative({ num: 1n, den: 0n }), RangeError)
		assert.throws(() => tanRationalIterative({ num: 0n, den: 0n }), RangeError)
		assert.throws(() => tanRationalIterative({ num: 1n, den: 2n }, 0), RangeError)
		assert.throws(() => tanRationalIterative({ num: 1n, den: 2n }, -3), RangeError)
		assert.throws(() => tanRationalIterative({ num: 1n, den: 2n }, 2.5), TypeError)
		assert.throws(() => tanRationalIterative({ num: 1n, den: 2n }, '10'), TypeError)
	})
})
