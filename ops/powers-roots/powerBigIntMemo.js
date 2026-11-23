/**
 * Fixed-point scale factor (10^18) used when a power evaluates to a
 * non-integer value (i.e. negative exponent with |base| >= 2n).
 *
 * @type {bigint}
 */
export const SCALE = 10n ** 18n

const TWO_SCALE = 2n * SCALE
const MAX_TABLE_BASE = 16
const MAX_TABLE_EXP = 64
const MAX_NONZERO_NEG_EXP = 60n // 2^61 > 2 * 10^18, so |base| >= 2 rounds to 0n for exp <= -61n
const MAX_CACHE_ENTRIES = 4096
const MAX_MEMO_BITS = 65536

/**
 * Rounds `SCALE / absDenom` to the nearest BigInt (half away from zero).
 *
 * @param {bigint} absDenom Positive denominator.
 * @returns {bigint}
 */
function roundScaledReciprocal(absDenom) {
	if (absDenom > TWO_SCALE) return 0n
	const quotient = SCALE / absDenom
	const remainder = SCALE % absDenom
	return remainder * 2n >= absDenom ? quotient + 1n : quotient
}

/**
 * Precomputed exact power table for bases 2..16 and exponents 0..64.
 * Entry `SMALL_POWER_TABLE[b][e]` equals `BigInt(b) ** BigInt(e)`.
 *
 * @type {Array<bigint[] | undefined>}
 */
const SMALL_POWER_TABLE = new Array(MAX_TABLE_BASE + 1)

/**
 * Precomputed fixed-point reciprocal power table for bases 2..16.
 * Entry `RECIPROCAL_POWER_TABLE[b][k]` equals `round(10^18 / b^k)` for `k >= 1`
 * up to the last non-zero entry; any larger `k` evaluates to `0n`.
 *
 * @type {Array<bigint[] | undefined>}
 */
const RECIPROCAL_POWER_TABLE = new Array(MAX_TABLE_BASE + 1)

for (let b = 2; b <= MAX_TABLE_BASE; b++) {
	const bigB = BigInt(b)
	const powers = new Array(MAX_TABLE_EXP + 1)
	powers[0] = 1n
	for (let e = 1; e <= MAX_TABLE_EXP; e++) {
		powers[e] = powers[e - 1] * bigB
	}
	SMALL_POWER_TABLE[b] = powers

	const reciprocals = [SCALE]
	for (let k = 1; k <= MAX_TABLE_EXP; k++) {
		const scaled = roundScaledReciprocal(powers[k])
		if (scaled === 0n) break
		reciprocals.push(scaled)
	}
	RECIPROCAL_POWER_TABLE[b] = reciprocals
}

/**
 * Bounded LRU memoization cache keyed by `"<absBase>:<exponent>"`.
 *
 * @type {Map<string, bigint>}
 */
const memoCache = new Map()

/**
 * Looks up a key in the LRU memo cache and refreshes its recency on hit.
 *
 * @param {string} key
 * @returns {bigint | undefined}
 */
function cacheGet(key) {
	const value = memoCache.get(key)
	if (value !== undefined) {
		memoCache.delete(key)
		memoCache.set(key, value)
	}
	return value
}

/**
 * Inserts a key/value pair into the bounded LRU memo cache.
 *
 * @param {string} key
 * @param {bigint} value
 */
function cacheSet(key, value) {
	if (memoCache.has(key)) {
		memoCache.delete(key)
	} else if (memoCache.size >= MAX_CACHE_ENTRIES) {
		const oldestKey = memoCache.keys().next().value
		memoCache.delete(oldestKey)
	}
	memoCache.set(key, value)
}

/**
 * Computes an upper bound on the bit length of a positive BigInt.
 *
 * @param {bigint} n Positive BigInt.
 * @returns {number}
 */
function approxBitLength(n) {
	return n.toString(16).length * 4
}

/**
 * Iterative exponentiation by squaring for large results that exceed the
 * per-entry memoization size cap.
 *
 * @param {bigint} absBase Base >= 2n.
 * @param {bigint} exp Exponent >= 0n.
 * @returns {bigint}
 */
function iterativePower(absBase, exp) {
	let result = 1n
	let base = absBase
	let e = exp
	while (e > 0n) {
		if ((e & 1n) === 1n) result *= base
		e >>= 1n
		if (e > 0n) base *= base
	}
	return result
}

/**
 * Table-driven + memoized recursive divide-and-conquer exponentiation
 * for positive integer bases (`>= 2n`) and non-negative integer exponents.
 *
 * @param {bigint} absBase Base >= 2n.
 * @param {bigint} exp Exponent >= 0n.
 * @returns {bigint}
 */
function computePositivePower(absBase, exp) {
	if (exp === 0n) return 1n
	if (exp === 1n) return absBase

	if (absBase <= BigInt(MAX_TABLE_BASE) && exp <= BigInt(MAX_TABLE_EXP)) {
		return SMALL_POWER_TABLE[Number(absBase)][Number(exp)]
	}

	const key = `${absBase}:${exp}`
	const cached = cacheGet(key)
	if (cached !== undefined) return cached

	const estBits = Number(exp) * approxBitLength(absBase)
	if (!Number.isFinite(estBits) || estBits > MAX_MEMO_BITS) {
		return iterativePower(absBase, exp)
	}

	const half = computePositivePower(absBase, exp >> 1n)
	let result = half * half
	if ((exp & 1n) === 1n) {
		result *= absBase
	}

	cacheSet(key, result)
	return result
}

/**
 * Computes `base` raised to `exponent` over exact BigInt integers using
 * precomputed small-base tables and bounded LRU memoization.
 *
 * - Whenever the mathematical result is an integer (`exponent >= 0n`, or
 *   `base === 1n`, or `base === -1n`), returns the exact unscaled `BigInt`.
 * - Whenever the mathematical result is non-integer (`exponent < 0n` and
 *   `|base| >= 2n`), returns a fixed-point `BigInt` scaled by `10^18`
 *   (`SCALE`), rounded to the nearest integer (half away from zero).
 *
 * @param {bigint} base Exact BigInt integer base.
 * @param {bigint} exponent Exact BigInt integer exponent.
 * @returns {bigint} Exact BigInt integer result, or fixed-point BigInt scaled by `10^18` for non-integer results.
 * @throws {TypeError} If `base` or `exponent` is not a `bigint`.
 * @throws {RangeError} If `base === 0n` and `exponent < 0n`.
 */
export function powerBigIntMemo(base, exponent) {
	if (typeof base !== 'bigint') {
		throw new TypeError(`Expected base to be a bigint, received ${typeof base}`)
	}
	if (typeof exponent !== 'bigint') {
		throw new TypeError(`Expected exponent to be a bigint, received ${typeof exponent}`)
	}

	if (exponent === 0n) return 1n

	if (base === 0n) {
		if (exponent < 0n) {
			throw new RangeError('Cannot raise 0n to a negative exponent')
		}
		return 0n
	}

	if (base === 1n) return 1n
	if (base === -1n) return (exponent & 1n) === 0n ? 1n : -1n
	if (exponent === 1n) return base

	const isNegBase = base < 0n
	const absBase = isNegBase ? -base : base
	const negateResult = isNegBase && (exponent & 1n) === 1n

	if (exponent > 0n) {
		const magnitude = computePositivePower(absBase, exponent)
		return negateResult ? -magnitude : magnitude
	}

	// Negative exponent with |base| >= 2n -> non-integer result, scaled by 10^18.
	const absExp = -exponent
	if (absExp > MAX_NONZERO_NEG_EXP || absBase > TWO_SCALE) {
		return 0n
	}

	if (absBase <= BigInt(MAX_TABLE_BASE)) {
		const row = RECIPROCAL_POWER_TABLE[Number(absBase)]
		const idx = Number(absExp)
		const magnitude = idx < row.length ? row[idx] : 0n
		return negateResult && magnitude !== 0n ? -magnitude : magnitude
	}

	const key = `${absBase}:-${absExp}`
	let magnitude = cacheGet(key)
	if (magnitude === undefined) {
		const denom = computePositivePower(absBase, absExp)
		magnitude = roundScaledReciprocal(denom)
		cacheSet(key, magnitude)
	}

	return negateResult && magnitude !== 0n ? -magnitude : magnitude
}
