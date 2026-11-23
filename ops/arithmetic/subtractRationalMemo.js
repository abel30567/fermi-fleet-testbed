/**
 * @typedef {object} Rational
 * @property {bigint} num - Numerator of the exact rational number.
 * @property {bigint} den - Non-zero denominator of the exact rational number (positive in lowest terms).
 */

/** Maximum operand size covered by the precomputed GCD lookup table. */
const SMALL_GCD_LIMIT = 64
const SMALL_GCD_STRIDE = SMALL_GCD_LIMIT + 1

/**
 * Precomputed flat GCD table for non-negative integers in [0, SMALL_GCD_LIMIT].
 * Entry at `a * SMALL_GCD_STRIDE + b` holds `gcd(a, b)`.
 */
const SMALL_GCD_TABLE = new Uint8Array(SMALL_GCD_STRIDE * SMALL_GCD_STRIDE)

for (let i = 0; i <= SMALL_GCD_LIMIT; i++) {
	for (let j = 0; j <= SMALL_GCD_LIMIT; j++) {
		let x = i
		let y = j
		while (y !== 0) {
			const t = x % y
			x = y
			y = t
		}
		SMALL_GCD_TABLE[i * SMALL_GCD_STRIDE + j] = x
	}
}

/** Maximum number of entries retained in the memoization table. */
const MAX_MEMO_ENTRIES = 4096

/**
 * Memoization table mapping canonical pair keys `"na/da-nb/db"` to frozen
 * lowest-terms rational results `{ num: bigint, den: bigint }`.
 * Pre-populated at module load with all pairs of small canonical rationals.
 * @type {Map<string, Readonly<Rational>>}
 */
const SUBTRACT_MEMO = new Map()

/**
 * Return the absolute value of a BigInt.
 * @param {bigint} n
 * @returns {bigint}
 */
function absBigInt(n) {
	return n < 0n ? -n : n
}

/**
 * Compute the greatest common divisor of two non-negative BigInts,
 * using the precomputed table whenever both operands fit within SMALL_GCD_LIMIT.
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcdBigInt(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	const limit = BigInt(SMALL_GCD_LIMIT)
	while (y !== 0n) {
		if (x <= limit && y <= limit) {
			return BigInt(SMALL_GCD_TABLE[Number(x) * SMALL_GCD_STRIDE + Number(y)])
		}
		const t = x % y
		x = y
		y = t
	}
	return x
}

/**
 * Validate and normalize an input rational into canonical lowest terms
 * with a strictly positive denominator and `{ num: 0n, den: 1n }` for zero.
 * @param {Rational} value
 * @param {string} label
 * @returns {Rational}
 */
function validateAndNormalize(value, label) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(`${label} must be a rational object { num: bigint, den: bigint }`)
	}
	const { num, den } = value
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`${label}.num and ${label}.den must both be BigInt values`)
	}
	if (den === 0n) {
		throw new RangeError(`${label}.den must not be zero`)
	}
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	const signedNum = den < 0n ? -num : num
	const positiveDen = den < 0n ? -den : den
	const g = gcdBigInt(absBigInt(signedNum), positiveDen)
	return {
		num: signedNum / g,
		den: positiveDen / g,
	}
}

/**
 * Compute the exact lowest-terms difference of two already-normalized rationals.
 * @param {bigint} na
 * @param {bigint} da
 * @param {bigint} nb
 * @param {bigint} db
 * @returns {Readonly<Rational>}
 */
function computeNormalizedDifference(na, da, nb, db) {
	const g = gcdBigInt(da, db)
	const scaledDa = da / g
	const scaledDb = db / g
	const rawNum = na * scaledDb - nb * scaledDa
	if (rawNum === 0n) {
		return Object.freeze({ num: 0n, den: 1n })
	}
	const rawDen = scaledDa * db
	const h = gcdBigInt(absBigInt(rawNum), rawDen)
	return Object.freeze({
		num: rawNum / h,
		den: rawDen / h,
	})
}

/**
 * Build the canonical memoization key for two normalized rationals.
 * @param {bigint} na
 * @param {bigint} da
 * @param {bigint} nb
 * @param {bigint} db
 * @returns {string}
 */
function makeMemoKey(na, da, nb, db) {
	return `${na}/${da}-${nb}/${db}`
}

// Precompute table of small canonical rationals (|num| <= 4, 1 <= den <= 4)
// and populate SUBTRACT_MEMO with all pairwise differences.
;(function precomputeSmallTable() {
	/** @type {Rational[]} */
	const smallRationals = []
	for (let den = 1; den <= 4; den++) {
		for (let num = -4; num <= 4; num++) {
			if (num === 0 && den !== 1) continue
			if (num !== 0 && SMALL_GCD_TABLE[Math.abs(num) * SMALL_GCD_STRIDE + den] !== 1) continue
			smallRationals.push({ num: BigInt(num), den: BigInt(den) })
		}
	}
	for (let i = 0; i < smallRationals.length; i++) {
		const a = smallRationals[i]
		for (let j = 0; j < smallRationals.length; j++) {
			const b = smallRationals[j]
			const key = makeMemoKey(a.num, a.den, b.num, b.den)
			SUBTRACT_MEMO.set(key, computeNormalizedDifference(a.num, a.den, b.num, b.den))
		}
	}
})()

/**
 * Subtract two exact rational numbers `a - b` and return the result in lowest terms.
 *
 * Uses a precomputed small-integer GCD lookup table, a precomputed table of small
 * rational differences, and a bounded LRU memoization cache keyed by canonical
 * normalized operands.
 *
 * Both operands must be objects of the form `{ num: bigint, den: bigint }` with
 * `den !== 0n`. Unnormalized inputs (e.g. negative denominators or reducible
 * fractions) are accepted and normalized before lookup and subtraction.
 *
 * @param {Rational} a - Minuend rational `{ num: bigint, den: bigint }`.
 * @param {Rational} b - Subtrahend rational `{ num: bigint, den: bigint }`.
 * @returns {Rational} Exact difference `a - b` in lowest terms with `den > 0n`
 *   (and `{ num: 0n, den: 1n }` when the difference is zero).
 * @throws {TypeError} If `a` or `b` is not an object with `BigInt` `num` and `den` fields.
 * @throws {RangeError} If `a.den === 0n` or `b.den === 0n`.
 */
export function subtractRationalMemo(a, b) {
	const na = validateAndNormalize(a, 'a')
	const nb = validateAndNormalize(b, 'b')
	const key = makeMemoKey(na.num, na.den, nb.num, nb.den)

	const cached = SUBTRACT_MEMO.get(key)
	if (cached !== undefined) {
		// Refresh recency for LRU eviction policy
		SUBTRACT_MEMO.delete(key)
		SUBTRACT_MEMO.set(key, cached)
		return { num: cached.num, den: cached.den }
	}

	const result = computeNormalizedDifference(na.num, na.den, nb.num, nb.den)
	if (SUBTRACT_MEMO.size >= MAX_MEMO_ENTRIES) {
		const oldestKey = SUBTRACT_MEMO.keys().next().value
		SUBTRACT_MEMO.delete(oldestKey)
	}
	SUBTRACT_MEMO.set(key, result)
	return { num: result.num, den: result.den }
}
