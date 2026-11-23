import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { sqrtRationalIterative } from './sqrtRationalIterative.js'

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

function assertLowestTerms(r) {
	assert.equal(typeof r.num, 'bigint')
	assert.equal(typeof r.den, 'bigint')
	assert.ok(r.den > 0n, `expected positive denominator, got ${r.den}`)
	if (r.num === 0n) {
		assert.equal(r.den, 1n)
	} else {
		assert.equal(gcd(r.num, r.den), 1n, `not in lowest terms: ${r.num}/${r.den}`)
	}
}

/**
 * Verifies |x - sqrt(r)| / sqrt(r) <= tol using exact BigInt arithmetic.
 * For non-negative x and r > 0, checks both lower and upper bounds:
 *   (1 - tol)^2 * r <= x^2 <= (1 + tol)^2 * r   (when tol < 1)
 */
function assertRelativeAccuracy(x, r, tol) {
	assertLowestTerms(x)
	// Normalize r
	let p = r.num
	let q = r.den
	if (q < 0n) {
		p = -p
		q = -q
	}
	const upperNum = tol.den + tol.num
	assert.ok(
		x.num * x.num * tol.den * tol.den * q <= x.den * x.den * upperNum * upperNum * p,
		`upper relative bound failed for ${x.num}/${x.den} vs sqrt(${p}/${q})`
	)
	if (tol.num < tol.den) {
		const lowerNum = tol.den - tol.num
		assert.ok(
			x.num * x.num * tol.den * tol.den * q >= x.den * x.den * lowerNum * lowerNum * p,
			`lower relative bound failed for ${x.num}/${x.den} vs sqrt(${p}/${q})`
		)
	}
}

/**
 * Independent floor(sqrt(n)) via binary search for cross-checking.
 */
function binarySearchIsqrt(n) {
	if (n < 2n) return n
	let lo = 1n
	let hi = n
	while (lo <= hi) {
		const mid = (lo + hi) >> 1n
		const sq = mid * mid
		if (sq === n) return mid
		if (sq < n) lo = mid + 1n
		else hi = mid - 1n
	}
	return hi
}

describe('sqrtRationalIterative', () => {
	it('computes exact square roots for zero and unity', () => {
		assert.deepEqual(sqrtRationalIterative({ num: 0n, den: 1n }), { num: 0n, den: 1n })
		assert.deepEqual(sqrtRationalIterative({ num: 0n, den: 7n }), { num: 0n, den: 1n })
		assert.deepEqual(sqrtRationalIterative({ num: 0n, den: -9n }), { num: 0n, den: 1n })
		assert.deepEqual(sqrtRationalIterative({ num: 1n, den: 1n }), { num: 1n, den: 1n })
		assert.deepEqual(sqrtRationalIterative({ num: -5n, den: -5n }), { num: 1n, den: 1n })
	})

	it('computes exact square roots for perfect rational squares in lowest terms', () => {
		assert.deepEqual(sqrtRationalIterative({ num: 4n, den: 1n }), { num: 2n, den: 1n })
		assert.deepEqual(sqrtRationalIterative({ num: 9n, den: 16n }), { num: 3n, den: 4n })
		assert.deepEqual(sqrtRationalIterative({ num: 121n, den: 144n }), { num: 11n, den: 12n })
		// Unreduced perfect squares
		assert.deepEqual(sqrtRationalIterative({ num: 18n, den: 32n }), { num: 3n, den: 4n })
		assert.deepEqual(sqrtRationalIterative({ num: 50n, den: 8n }), { num: 5n, den: 2n })
		// Double-negative rationals
		assert.deepEqual(sqrtRationalIterative({ num: -9n, den: -16n }), { num: 3n, den: 4n })
		assert.deepEqual(sqrtRationalIterative({ num: -18n, den: -32n }), { num: 3n, den: 4n })
	})

	it('computes exact square roots for large BigInt perfect squares', () => {
		const a = 10n ** 40n + 7n
		const b = 10n ** 35n + 3n
		const g = gcd(a, b)
		const expected = { num: a / g, den: b / g }
		const res = sqrtRationalIterative({ num: a * a * 13n, den: b * b * 13n })
		assert.deepEqual(res, expected)
		assertLowestTerms(res)
	})

	it('computes accurate rational approximations for non-square rationals with default tolerance', () => {
		const defaultTol = { num: 1n, den: 10n ** 18n }
		const cases = [
			{ num: 2n, den: 1n },
			{ num: 3n, den: 1n },
			{ num: 5n, den: 1n },
			{ num: 1n, den: 2n },
			{ num: 2n, den: 3n },
			{ num: 7n, den: 11n },
			{ num: 1000n, den: 3n },
			{ num: 4n, den: 2n },
			{ num: -6n, den: -3n },
		]
		for (const c of cases) {
			const res = sqrtRationalIterative(c)
			assertRelativeAccuracy(res, c, defaultTol)
		}
		// Unreduced and double-negative forms of 2/1 produce identical outputs
		assert.deepEqual(
			sqrtRationalIterative({ num: 4n, den: 2n }),
			sqrtRationalIterative({ num: 2n, den: 1n })
		)
		assert.deepEqual(
			sqrtRationalIterative({ num: -6n, den: -3n }),
			sqrtRationalIterative({ num: 2n, den: 1n })
		)
	})

	it('handles very large and very small non-square rationals accurately', () => {
		const defaultTol = { num: 1n, den: 10n ** 18n }
		const huge = { num: 2n * 10n ** 100n, den: 1n }
		const tiny = { num: 1n, den: 2n * 10n ** 100n }
		const mixed = { num: 3n * 10n ** 60n, den: 7n * 10n ** 40n }

		assertRelativeAccuracy(sqrtRationalIterative(huge), huge, defaultTol)
		assertRelativeAccuracy(sqrtRationalIterative(tiny), tiny, defaultTol)
		assertRelativeAccuracy(sqrtRationalIterative(mixed), mixed, defaultTol)
	})

	it('matches exact Heron iterates when explicit iterations are requested', () => {
		const two = { num: 2n, den: 1n }
		assert.deepEqual(sqrtRationalIterative(two, { iterations: 0 }), { num: 1n, den: 1n })
		assert.deepEqual(sqrtRationalIterative(two, { iterations: 1 }), { num: 3n, den: 2n })
		assert.deepEqual(sqrtRationalIterative(two, { iterations: 2 }), { num: 17n, den: 12n })
		assert.deepEqual(sqrtRationalIterative(two, { iterations: 3 }), { num: 577n, den: 408n })
		assert.deepEqual(
			sqrtRationalIterative(two, { iterations: 4 }),
			{ num: 665857n, den: 470832n }
		)
		// Initial estimate for 8/5 is floor(sqrt(8))/floor(sqrt(5)) = 2/2 -> 1/1 in lowest terms
		assert.deepEqual(
			sqrtRationalIterative({ num: 8n, den: 5n }, { iterations: 0 }),
			{ num: 1n, den: 1n }
		)
	})

	it('respects custom tolerance and combined tolerance + iterations options', () => {
		const tightTol = { num: 1n, den: 10n ** 40n }
		const resTight = sqrtRationalIterative({ num: 3n, den: 1n }, { tolerance: tightTol })
		assertRelativeAccuracy(resTight, { num: 3n, den: 1n }, tightTol)

		// Unreduced / double-negative tolerance is normalized properly
		const looseTol = { num: -2n, den: -200n } // 1/100
		const resLoose = sqrtRationalIterative({ num: 2n, den: 1n }, { tolerance: looseTol })
		assertRelativeAccuracy(resLoose, { num: 2n, den: 1n }, { num: 1n, den: 100n })
		assert.ok(resLoose.den < 100n, 'looser tolerance should converge in fewer steps')

		// Combined tolerance and iterations caps steps when tolerance is stricter
		const capped = sqrtRationalIterative(
			{ num: 2n, den: 1n },
			{ tolerance: { num: 1n, den: 10n ** 50n }, iterations: 2 }
		)
		assert.deepEqual(capped, { num: 17n, den: 12n })

		// Combined stops early when tolerance is reached before iteration limit
		const early = sqrtRationalIterative(
			{ num: 2n, den: 1n },
			{ tolerance: { num: 1n, den: 100n }, iterations: 10 }
		)
		assert.deepEqual(early, { num: 17n, den: 12n })
	})

	it('cross-checks against Math.sqrt across a grid of rationals', () => {
		const samples = [
			[1n, 3n],
			[2n, 5n],
			[5n, 7n],
			[13n, 4n],
			[99n, 17n],
			[123456n, 789n],
			[1n, 99991n],
		]
		for (const [num, den] of samples) {
			const res = sqrtRationalIterative({ num, den })
			const approx = Number(res.num) / Number(res.den)
			const expected = Math.sqrt(Number(num) / Number(den))
			const relErr = Math.abs(approx - expected) / expected
			assert.ok(relErr < 1e-14, `Math.sqrt mismatch for ${num}/${den}: relErr=${relErr}`)
		}
	})

	it('cross-checks high-precision digits against independent binary-search scaled integer sqrt', () => {
		const scaleDigits = 30n
		const scale = 10n ** scaleDigits
		const tol = { num: 1n, den: 10n ** 35n }

		const cases = [
			{ num: 2n, den: 1n },
			{ num: 5n, den: 3n },
			{ num: 17n, den: 29n },
			{ num: 10n ** 25n + 13n, den: 7n },
		]
		for (const r of cases) {
			const res = sqrtRationalIterative(r, { tolerance: tol })
			// Independent floor(sqrt(r) * 10^30) = floor(sqrt(floor(r * 10^60)))
			const scaledFloor = binarySearchIsqrt((r.num * scale * scale) / r.den)
			// res is an upper bound within 10^-35 relative error, so floor(res * 10^30)
			// must equal scaledFloor or scaledFloor + 1 (at a rounding boundary)
			const resScaled = (res.num * scale) / res.den
			const diff = resScaled >= scaledFloor ? resScaled - scaledFloor : scaledFloor - resScaled
			assert.ok(
				diff <= 1n,
				`30-digit cross-check failed for ${r.num}/${r.den}: diff=${diff}`
			)
		}
	})

	it('cross-checks algebraic identities sqrt(a * b) ≈ sqrt(a) * sqrt(b) and sqrt(1/r) ≈ 1/sqrt(r)', () => {
		const a = { num: 7n, den: 5n }
		const b = { num: 11n, den: 3n }
		const ab = { num: a.num * b.num, den: a.den * b.den }

		const sa = sqrtRationalIterative(a)
		const sb = sqrtRationalIterative(b)
		const sab = sqrtRationalIterative(ab)
		const prod = { num: sa.num * sb.num, den: sa.den * sb.den }

		// |sab - prod| / sab < 10^-17
		const diffNum =
			sab.num * prod.den >= prod.num * sab.den
				? sab.num * prod.den - prod.num * sab.den
				: prod.num * sab.den - sab.num * prod.den
		assert.ok(
			diffNum * 10n ** 17n <= sab.num * prod.den,
			'multiplicative identity failed'
		)

		// Reciprocal identity: sqrt(1/r) * sqrt(r) ≈ 1
		const inv = { num: a.den, den: a.num }
		const sInv = sqrtRationalIterative(inv)
		const oneNum = sa.num * sInv.num
		const oneDen = sa.den * sInv.den
		const oneDiff = oneNum >= oneDen ? oneNum - oneDen : oneDen - oneNum
		assert.ok(oneDiff * 10n ** 17n <= oneDen, 'reciprocal identity failed')
	})

	it('validates input types and ranges strictly', () => {
		// Invalid r types
		for (const bad of [null, undefined, 4, 4n, '4', [], {}, { num: 4, den: 1n }, { num: 4n, den: 1 }]) {
			assert.throws(() => sqrtRationalIterative(bad), TypeError)
		}

		// Zero denominator
		assert.throws(() => sqrtRationalIterative({ num: 0n, den: 0n }), RangeError)
		assert.throws(() => sqrtRationalIterative({ num: 1n, den: 0n }), RangeError)
		assert.throws(() => sqrtRationalIterative({ num: -1n, den: 0n }), RangeError)

		// Negative rationals
		assert.throws(() => sqrtRationalIterative({ num: -1n, den: 1n }), RangeError)
		assert.throws(() => sqrtRationalIterative({ num: 1n, den: -1n }), RangeError)
		assert.throws(() => sqrtRationalIterative({ num: -4n, den: 9n }), RangeError)
		assert.throws(() => sqrtRationalIterative({ num: 4n, den: -9n }), RangeError)

		// Invalid options object
		for (const badOpts of [null, 5, 'opts', []]) {
			assert.throws(() => sqrtRationalIterative({ num: 4n, den: 1n }, badOpts), TypeError)
		}

		// Invalid tolerance
		assert.throws(
			() => sqrtRationalIterative({ num: 2n, den: 1n }, { tolerance: 1e-9 }),
			TypeError
		)
		assert.throws(
			() => sqrtRationalIterative({ num: 2n, den: 1n }, { tolerance: { num: 1, den: 10n } }),
			TypeError
		)
		assert.throws(
			() => sqrtRationalIterative({ num: 2n, den: 1n }, { tolerance: { num: 0n, den: 1n } }),
			RangeError
		)
		assert.throws(
			() => sqrtRationalIterative({ num: 2n, den: 1n }, { tolerance: { num: -1n, den: 10n } }),
			RangeError
		)
		assert.throws(
			() => sqrtRationalIterative({ num: 2n, den: 1n }, { tolerance: { num: 1n, den: 0n } }),
			RangeError
		)

		// Invalid iterations
		assert.throws(
			() => sqrtRationalIterative({ num: 2n, den: 1n }, { iterations: '3' }),
			TypeError
		)
		assert.throws(
			() => sqrtRationalIterative({ num: 2n, den: 1n }, { iterations: 3n }),
			TypeError
		)
		for (const badIter of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
			assert.throws(
				() => sqrtRationalIterative({ num: 2n, den: 1n }, { iterations: badIter }),
				RangeError
			)
		}

		// Options are still validated when r is 0 or a perfect square
		assert.throws(
			() => sqrtRationalIterative({ num: 0n, den: 1n }, { iterations: -1 }),
			RangeError
		)
		assert.throws(
			() => sqrtRationalIterative({ num: 4n, den: 1n }, { tolerance: { num: 0n, den: 1n } }),
			RangeError
		)
	})
})
