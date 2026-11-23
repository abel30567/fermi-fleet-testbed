import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { nthRootRationalMemo } from './nthRootRationalMemo.js'

/**
 * Independent helper: GCD for BigInts.
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
 * Independent reference oracle: exact integer nth root via binary search.
 */
function binarySearchExactNthRoot(x, n) {
	if (x === 0n || x === 1n || n === 1n) return x
	let lo = 1n
	let hi = 1n
	while (hi ** n < x) {
		lo = hi
		hi <<= 1n
	}
	if (hi ** n === x) return hi
	while (lo <= hi) {
		const mid = (lo + hi) >> 1n
		const p = mid ** n
		if (p === x) return mid
		if (p < x) lo = mid + 1n
		else hi = mid - 1n
	}
	return null
}

/**
 * Independent reference oracle for exact rational nth root.
 */
function referenceNthRootRational(num, den, n) {
	if (num === 0n) return { num: 0n, den: 1n }
	if (den < 0n) {
		num = -num
		den = -den
	}
	const g = gcd(num, den)
	num /= g
	den /= g
	if (num < 0n && n % 2n === 0n) return null
	const rNum = binarySearchExactNthRoot(num < 0n ? -num : num, n)
	if (rNum === null) return null
	const rDen = binarySearchExactNthRoot(den, n)
	if (rDen === null) return null
	return { num: num < 0n ? -rNum : rNum, den: rDen }
}

describe('nthRootRationalMemo', () => {
	it('computes exact square, cube, and higher roots for reduced positive rationals', () => {
		assert.deepEqual(nthRootRationalMemo({ num: 9n, den: 16n }, 2), { num: 3n, den: 4n })
		assert.deepEqual(nthRootRationalMemo({ num: 8n, den: 27n }, 3), { num: 2n, den: 3n })
		assert.deepEqual(nthRootRationalMemo({ num: 81n, den: 256n }, 4), { num: 3n, den: 4n })
		assert.deepEqual(nthRootRationalMemo({ num: 32n, den: 243n }, 5), { num: 2n, den: 3n })
		assert.deepEqual(nthRootRationalMemo({ num: 1n, den: 64n }, 6), { num: 1n, den: 2n })
		assert.deepEqual(nthRootRationalMemo({ num: 128n, den: 2187n }, 7n), { num: 2n, den: 3n })
	})

	it('reduces non-lowest-terms inputs before computing roots', () => {
		// 18/32 reduces to 9/16; neither 18 nor 32 is a square on its own
		assert.deepEqual(nthRootRationalMemo({ num: 18n, den: 32n }, 2), { num: 3n, den: 4n })
		// 24/81 reduces to 8/27
		assert.deepEqual(nthRootRationalMemo({ num: 24n, den: 81n }, 3), { num: 2n, den: 3n })
		// Negative denominator normalization
		assert.deepEqual(nthRootRationalMemo({ num: -18n, den: -32n }, 2), { num: 3n, den: 4n })
		assert.deepEqual(nthRootRationalMemo({ num: 24n, den: -81n }, 3), { num: -2n, den: 3n })
	})

	it('handles zero, one, negative odd roots, and degree 1', () => {
		assert.deepEqual(nthRootRationalMemo({ num: 0n, den: 1n }, 2), { num: 0n, den: 1n })
		assert.deepEqual(nthRootRationalMemo({ num: 0n, den: 17n }, 5), { num: 0n, den: 1n })
		assert.deepEqual(nthRootRationalMemo({ num: 0n, den: -9n }, 4), { num: 0n, den: 1n })

		assert.deepEqual(nthRootRationalMemo({ num: 1n, den: 1n }, 100), { num: 1n, den: 1n })
		assert.deepEqual(nthRootRationalMemo({ num: 13n, den: 13n }, 7), { num: 1n, den: 1n })
		assert.deepEqual(nthRootRationalMemo({ num: -1n, den: 1n }, 999n), { num: -1n, den: 1n })

		assert.deepEqual(nthRootRationalMemo({ num: -27n, den: 64n }, 3), { num: -3n, den: 4n })
		assert.deepEqual(nthRootRationalMemo({ num: -32n, den: 243n }, 5), { num: -2n, den: 3n })

		assert.deepEqual(nthRootRationalMemo({ num: -6n, den: 9n }, 1), { num: -2n, den: 3n })
		assert.deepEqual(nthRootRationalMemo({ num: 4n, den: -6n }, 1n), { num: -2n, den: 3n })
	})

	it('handles large BigInt rationals beyond precomputed tables and degrees > 16', () => {
		const a = 10n ** 20n + 7n
		const b = 10n ** 18n + 3n
		assert.equal(gcd(a, b), 1n)

		for (const deg of [2n, 3n, 5n, 11n, 17n, 23n]) {
			const res = nthRootRationalMemo({ num: a ** deg, den: b ** deg }, deg)
			assert.deepEqual(res, { num: a, den: b })
		}

		// Negative large odd root with degree > 16
		const oddDeg = 19n
		assert.deepEqual(
			nthRootRationalMemo({ num: -(a ** oddDeg), den: b ** oddDeg }, oddDeg),
			{ num: -a, den: b }
		)
	})

	it('rejects non-exact rationals (including huge degrees and near-misses)', () => {
		assert.throws(() => nthRootRationalMemo({ num: 2n, den: 1n }, 2), RangeError)
		assert.throws(() => nthRootRationalMemo({ num: 4n, den: 3n }, 2), RangeError)
		assert.throws(() => nthRootRationalMemo({ num: 8n, den: 9n }, 3), RangeError)
		assert.throws(() => nthRootRationalMemo({ num: 16n, den: 25n }, 4), RangeError)
		assert.throws(() => nthRootRationalMemo({ num: -9n, den: 16n }, 2), RangeError)
		assert.throws(() => nthRootRationalMemo({ num: 9n, den: -16n }, 2), RangeError)

		// Near-misses above precomputed tables (exercises residue filters and Newton verification)
		const base = 1000003n
		assert.throws(() => nthRootRationalMemo({ num: base ** 2n + 1n, den: 1n }, 2), RangeError)
		assert.throws(() => nthRootRationalMemo({ num: base ** 2n - 1n, den: 1n }, 2), RangeError)
		// Near-miss designed to pass all residue filters (64*63*65*11 = 2882880)
		const residueLcm = 64n * 63n * 65n * 11n
		assert.throws(
			() => nthRootRationalMemo({ num: base ** 2n + residueLcm, den: 1n }, 2),
			RangeError
		)

		// Very large degree should reject quickly via bit-length bound
		assert.throws(() => nthRootRationalMemo({ num: 2n, den: 1n }, 10n ** 9n), RangeError)
		assert.throws(() => nthRootRationalMemo({ num: 1024n, den: 1n }, 11n), RangeError)
	})

	it('validates input types and ranges strictly', () => {
		assert.throws(() => nthRootRationalMemo(null, 2), TypeError)
		assert.throws(() => nthRootRationalMemo(undefined, 2), TypeError)
		assert.throws(() => nthRootRationalMemo([4n, 9n], 2), TypeError)
		assert.throws(() => nthRootRationalMemo({ num: 4, den: 9n }, 2), TypeError)
		assert.throws(() => nthRootRationalMemo({ num: 4n, den: 9 }, 2), TypeError)
		assert.throws(() => nthRootRationalMemo({ num: 4n }, 2), TypeError)

		assert.throws(() => nthRootRationalMemo({ num: 4n, den: 0n }, 2), RangeError)
		assert.throws(() => nthRootRationalMemo({ num: 0n, den: 0n }, 2), RangeError)

		assert.throws(() => nthRootRationalMemo({ num: 4n, den: 9n }, 0), RangeError)
		assert.throws(() => nthRootRationalMemo({ num: 4n, den: 9n }, 0n), RangeError)
		assert.throws(() => nthRootRationalMemo({ num: 4n, den: 9n }, -2), RangeError)
		assert.throws(() => nthRootRationalMemo({ num: 4n, den: 9n }, -3n), RangeError)
		assert.throws(() => nthRootRationalMemo({ num: 4n, den: 9n }, 1.5), TypeError)
		assert.throws(() => nthRootRationalMemo({ num: 4n, den: 9n }, Number.NaN), TypeError)
		assert.throws(() => nthRootRationalMemo({ num: 4n, den: 9n }, Number.POSITIVE_INFINITY), TypeError)
		assert.throws(() => nthRootRationalMemo({ num: 4n, den: 9n }, '2'), TypeError)
		assert.throws(() => nthRootRationalMemo({ num: 4n, den: 9n }, Number.MAX_SAFE_INTEGER + 1), RangeError)
	})

	it('memoizes results safely without leaking mutable cache entries', () => {
		const first = nthRootRationalMemo({ num: 1234567n ** 3n, den: 7654321n ** 3n }, 3)
		assert.deepEqual(first, { num: 1234567n, den: 7654321n })

		// Mutate returned object; subsequent memoized call must remain uncorrupted
		first.num = 999n
		first.den = 1n

		const second = nthRootRationalMemo({ num: 1234567n ** 3n, den: 7654321n ** 3n }, 3)
		assert.deepEqual(second, { num: 1234567n, den: 7654321n })
		assert.notEqual(first, second)

		// Equivalent unreduced input hits the same normalized cache entry
		const scaled = nthRootRationalMemo(
			{ num: (1234567n ** 3n) * 19n, den: (7654321n ** 3n) * 19n },
			3n
		)
		assert.deepEqual(scaled, { num: 1234567n, den: 7654321n })

		// Repeated non-exact query consistently throws (cached negative result)
		const bad = { num: 1234567n ** 3n + 1n, den: 7654321n ** 3n }
		assert.throws(() => nthRootRationalMemo(bad, 3), RangeError)
		assert.throws(() => nthRootRationalMemo(bad, 3), RangeError)
	})

	it('cross-checks against an independent binary-search oracle and floating-point Math.pow', () => {
		// 1. Exhaustive sweep over small rationals (exact and non-exact) for degrees 1..6
		for (let n = 1; n <= 6; n++) {
			const bigN = BigInt(n)
			for (let num = -12n; num <= 12n; num++) {
				for (let den = 1n; den <= 12n; den++) {
					const expected = referenceNthRootRational(num, den, bigN)
					if (expected === null) {
						assert.throws(() => nthRootRationalMemo({ num, den }, n), RangeError)
					} else {
						const actual = nthRootRationalMemo({ num, den }, n)
						assert.deepEqual(actual, expected)
						assert.equal(gcd(actual.num, actual.den), 1n)
						assert.ok(actual.den > 0n)
						// Algebraic identity check: (actual.num / actual.den)^n == num / den
						assert.equal((actual.num ** bigN) * den, num * (actual.den ** bigN))
					}
				}
			}
		}

		// 2. Round-trip + floating-point cross-check on exact powers across degrees 2..18
		const bases = [
			[3n, 5n],
			[-7n, 11n],
			[29n, 31n],
			[257n, 101n],
			[1021n, 509n],
		]
		for (const [a, b] of bases) {
			for (let n = 2; n <= 18; n++) {
				if (a < 0n && n % 2 === 0) continue
				const bigN = BigInt(n)
				const scale = 6n
				const input = { num: (a ** bigN) * scale, den: (b ** bigN) * scale }
				const actual = nthRootRationalMemo(input, n)
				const ref = referenceNthRootRational(input.num, input.den, bigN)
				assert.deepEqual(actual, ref)
				assert.deepEqual(actual, { num: a, den: b })

				// Floating-point cross-check where values fit in finite IEEE-754 double
				const fVal = Number(a ** bigN) / Number(b ** bigN)
				if (Number.isFinite(fVal) && fVal !== 0) {
					const fRoot = Math.sign(fVal) * Math.pow(Math.abs(fVal), 1 / n)
					const exactFloat = Number(actual.num) / Number(actual.den)
					assert.ok(
						Math.abs(fRoot - exactFloat) <= 1e-9 * Math.max(1, Math.abs(exactFloat)),
						`float mismatch for (${a}/${b})^(1/${n}): ${fRoot} vs ${exactFloat}`
					)
				}
			}
		}
	})
})
