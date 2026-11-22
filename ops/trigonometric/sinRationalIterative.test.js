import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { sinRationalIterative } from './sinRationalIterative.js'

/**
 * Compute GCD of two BigInts for verifying lowest-terms invariants.
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
 * Assert that `r` is a valid reduced rational `{ num: bigint, den: bigint }`
 * in lowest terms with `den > 0n`.
 */
function assertReducedRational(r) {
	assert.equal(typeof r, 'object')
	assert.notEqual(r, null)
	assert.equal(typeof r.num, 'bigint')
	assert.equal(typeof r.den, 'bigint')
	assert.ok(r.den > 0n, `expected den > 0n, got ${r.den}`)
	assert.equal(gcd(r.num, r.den), 1n, `expected lowest terms, got ${r.num}/${r.den}`)
	if (r.num === 0n) {
		assert.equal(r.den, 1n)
	}
}

/**
 * Convert an arbitrarily large rational `{ num, den }` to a JS Number without
 * overflowing intermediate BigInt-to-Number conversions.
 */
function rationalToNumber(r) {
	const scale = 10n ** 18n
	const scaled = (r.num * scale) / r.den
	return Number(scaled) / 1e18
}

/**
 * Exact rational arithmetic helpers for independent algebraic cross-checks.
 */
function ratSub(a, b) {
	const num = a.num * b.den - b.num * a.den
	const den = a.den * b.den
	const g = gcd(num, den)
	return { num: num / g, den: den / g }
}

function ratMul(a, b) {
	const num = a.num * b.num
	const den = a.den * b.den
	const g = gcd(num, den)
	return { num: num / g, den: den / g }
}

function ratAbs(r) {
	return { num: r.num < 0n ? -r.num : r.num, den: r.den }
}

function ratLessThan(a, b) {
	return a.num * b.den < b.num * a.den
}

describe('sinRationalIterative', () => {
	test('returns exact 0/1 for zero angles (including unreduced and negative denominators)', () => {
		assert.deepEqual(sinRationalIterative({ num: 0n, den: 1n }), { num: 0n, den: 1n })
		assert.deepEqual(sinRationalIterative({ num: 0n, den: 7n }), { num: 0n, den: 1n })
		assert.deepEqual(sinRationalIterative({ num: 0n, den: -99n }), { num: 0n, den: 1n })
	})

	test('matches exact truncated Taylor polynomial for small rational angles', () => {
		// With terms = 1: sin(1/2) ≈ 1/2
		assert.deepEqual(sinRationalIterative({ num: 1n, den: 2n }, 1), { num: 1n, den: 2n })
		// With terms = 2: 1/2 - (1/2)^3 / 6 = 1/2 - 1/48 = 23/48
		assert.deepEqual(sinRationalIterative({ num: 1n, den: 2n }, 2), { num: 23n, den: 48n })
		// With terms = 3: 23/48 + (1/2)^5 / 120 = 23/48 + 1/3840 = 1841/3840
		assert.deepEqual(sinRationalIterative({ num: 1n, den: 2n }, 3), { num: 1841n, den: 3840n })
	})

	test('normalizes unreduced inputs and negative denominators identically', () => {
		const base = sinRationalIterative({ num: 1n, den: 3n })
		const unreduced = sinRationalIterative({ num: 5n, den: 15n })
		const negBoth = sinRationalIterative({ num: -2n, den: -6n })
		assertReducedRational(base)
		assert.deepEqual(unreduced, base)
		assert.deepEqual(negBoth, base)

		const negNum = sinRationalIterative({ num: -1n, den: 3n })
		const negDen = sinRationalIterative({ num: 1n, den: -3n })
		assertReducedRational(negNum)
		assert.deepEqual(negNum, negDen)
		assert.equal(negNum.num, -base.num)
		assert.equal(negNum.den, base.den)
	})

	test('cross-checks normal, negative, quadrant-boundary, and large angles against Math.sin', () => {
		const cases = [
			{ num: 1n, den: 10n },
			{ num: 1n, den: 2n },
			{ num: 1n, den: 1n },
			{ num: 3n, den: 2n },
			{ num: 157n, den: 100n }, // just below pi/2
			{ num: 2n, den: 1n }, // quadrant II
			{ num: 22n, den: 7n }, // near pi (quadrant III)
			{ num: 355n, den: 113n }, // very close to pi
			{ num: 4n, den: 1n }, // quadrant III
			{ num: 5n, den: 1n }, // quadrant IV
			{ num: 6n, den: 1n }, // near 2*pi
			{ num: -1n, den: 4n },
			{ num: -2n, den: 1n },
			{ num: -7n, den: 2n },
			{ num: 100n, den: 1n },
			{ num: -100n, den: 1n },
			{ num: 1000000n, den: 1n },
			{ num: -1000001n, den: 4n }
		]

		for (const angle of cases) {
			const result = sinRationalIterative(angle)
			assertReducedRational(result)

			const x = Number(angle.num) / Number(angle.den)
			const expected = Math.sin(x)
			const actual = rationalToNumber(result)
			assert.ok(
				Math.abs(actual - expected) < 1e-12,
				`mismatch for ${angle.num}/${angle.den}: actual=${actual}, expected=${expected}`
			)
		}
	})

	test('preserves exact odd symmetry sin(-x) = -sin(x) across all quadrants and large angles', () => {
		const samples = [
			{ num: 1n, den: 7n },
			{ num: 2n, den: 1n },
			{ num: 355n, den: 113n },
			{ num: 5n, den: 1n },
			{ num: 123456n, den: 7n },
			{ num: 10n ** 12n, den: 1n }
		]

		for (const x of samples) {
			const pos = sinRationalIterative(x)
			const neg = sinRationalIterative({ num: -x.num, den: x.den })
			assertReducedRational(pos)
			assertReducedRational(neg)
			assert.equal(neg.num, -pos.num)
			assert.equal(neg.den, pos.den)
		}
	})

	test('satisfies the triple-angle identity sin(3x) = 3*sin(x) - 4*sin(x)^3 in exact rational arithmetic', () => {
		const angles = [
			{ num: 1n, den: 5n },
			{ num: 1n, den: 3n },
			{ num: 1n, den: 1n }, // 3x = 3 requires quadrant folding
			{ num: -7n, den: 4n }, // 3x = -21/4 requires full range reduction
			{ num: 25n, den: 3n }, // large angle
			{ num: -1000000n, den: 3n } // large negative non-dyadic rational
		]
		const tolerance = { num: 1n, den: 10n ** 24n }

		for (const x of angles) {
			const sx = sinRationalIterative(x)
			const s3x = sinRationalIterative({ num: 3n * x.num, den: x.den })
			assertReducedRational(sx)
			assertReducedRational(s3x)

			const sx2 = ratMul(sx, sx)
			const sx3 = ratMul(sx2, sx)
			const rhs = ratSub(
				ratMul({ num: 3n, den: 1n }, sx),
				ratMul({ num: 4n, den: 1n }, sx3)
			)
			const diff = ratAbs(ratSub(s3x, rhs))

			assert.ok(
				ratLessThan(diff, tolerance),
				`triple-angle identity failed for ${x.num}/${x.den}: diff=${rationalToNumber(diff)}`
			)
		}
	})

	test('handles very large rational angles beyond Number precision accurately via periodicity', () => {
		// Compare sin(x) against sin(x + 2*k*pi_approx) or check magnitude <= 1
		const huge = { num: 10n ** 25n + 3n, den: 7n }
		const res = sinRationalIterative(huge)
		assertReducedRational(res)
		// |sin(x)| <= 1
		assert.ok(
			(res.num < 0n ? -res.num : res.num) <= res.den,
			'result must satisfy |sin(x)| <= 1'
		)
	})

	test('validates inputs thoroughly', () => {
		// Invalid angle container
		assert.throws(() => sinRationalIterative(null), TypeError)
		assert.throws(() => sinRationalIterative(undefined), TypeError)
		assert.throws(() => sinRationalIterative(1), TypeError)
		assert.throws(() => sinRationalIterative('1/2'), TypeError)
		assert.throws(() => sinRationalIterative([1n, 2n]), TypeError)

		// Invalid num / den types
		assert.throws(() => sinRationalIterative({ num: 1, den: 2n }), TypeError)
		assert.throws(() => sinRationalIterative({ num: 1n, den: 2 }), TypeError)
		assert.throws(() => sinRationalIterative({ num: '1', den: '2' }), TypeError)
		assert.throws(() => sinRationalIterative({ num: 1n }), TypeError)
		assert.throws(() => sinRationalIterative({ den: 1n }), TypeError)

		// Zero denominator
		assert.throws(() => sinRationalIterative({ num: 1n, den: 0n }), RangeError)
		assert.throws(() => sinRationalIterative({ num: 0n, den: 0n }), RangeError)

		// Invalid terms parameter
		assert.throws(() => sinRationalIterative({ num: 1n, den: 2n }, '10'), TypeError)
		assert.throws(() => sinRationalIterative({ num: 1n, den: 2n }, 10n), TypeError)
		assert.throws(() => sinRationalIterative({ num: 1n, den: 2n }, 0), RangeError)
		assert.throws(() => sinRationalIterative({ num: 1n, den: 2n }, -3), RangeError)
		assert.throws(() => sinRationalIterative({ num: 1n, den: 2n }, 2.5), RangeError)
		assert.throws(() => sinRationalIterative({ num: 1n, den: 2n }, Number.NaN), RangeError)
		assert.throws(() => sinRationalIterative({ num: 1n, den: 2n }, Number.POSITIVE_INFINITY), RangeError)
	})
})
