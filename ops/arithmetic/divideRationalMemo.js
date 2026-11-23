/**
 * Exact rational arithmetic division using precomputed lookup tables and bounded memoization.
 *
 * Rationals are represented as `{ num: bigint, den: bigint }` and results are always
 * returned in canonical lowest terms (`den > 0n`, `gcd(|num|, den) === 1n`, and
 * `{ num: 0n, den: 1n }` when zero).
 *
 * @module ops/arithmetic/divideRationalMemo
 */

/**
 * Maximum operand magnitude served directly by the precomputed GCD table.
 * @type {number}
 */
const SMALL_GCD_LIMIT = 64

/**
 * Side length of the square GCD lookup table (`0..SMALL_GCD_LIMIT` inclusive).
 * @type {number}
 */
const SMALL_GCD_STRIDE = SMALL_GCD_LIMIT + 1

/**
 * Precomputed `BigInt` version of `SMALL_GCD_LIMIT` for fast range checks.
 * @type {bigint}
 */
const SMALL_GCD_LIMIT_BIGINT = BigInt(SMALL_GCD_LIMIT)

/**
 * Precomputed flat GCD lookup table for all pairs `(x, y)` with `0 <= x, y <= SMALL_GCD_LIMIT`.
 * Entry `GCD_TABLE[x * SMALL_GCD_STRIDE + y]` equals `gcd(x, y)`.
 * @type {Uint8Array}
 */
const GCD_TABLE = (() => {
	const table = new Uint8Array(SMALL_GCD_STRIDE * SMALL_GCD_STRIDE)
	for (let x = 0; x <= SMALL_GCD_LIMIT; x++) {
		table[x * SMALL_GCD_STRIDE] = x
		table[x] = x
	}
	for (let x = 1; x <= SMALL_GCD_LIMIT; x++) {
		for (let y = 1; y <= SMALL_GCD_LIMIT; y++) {
			table[x * SMALL_GCD_STRIDE + y] =
				x >= y
					? table[(x - y) * SMALL_GCD_STRIDE + y]
					: table[x * SMALL_GCD_STRIDE + (y - x)]
		}
	}
	return table
})()

/**
 * Precomputed `BigInt` lookup table mapping small integers `0..SMALL_GCD_LIMIT`
 * to their `BigInt` values, avoiding repeated `BigInt()` conversions on table hits.
 * @type {readonly bigint[]}
 */
const SMALL_BIGINTS = Object.freeze(
	Array.from({ length: SMALL_GCD_STRIDE }, (_, i) => BigInt(i)),
)

/**
 * Precomputed sign lookup table indexed by sign parity bit (`0` -> positive, `1` -> negative).
 * @type {readonly [bigint, bigint]}
 */
const SIGN_TABLE = Object.freeze([1n, -1n])

/**
 * Maximum number of entries retained in the LRU memoization cache.
 * @type {number}
 */
const MAX_MEMO_ENTRIES = 4096

/**
 * Bounded LRU memoization cache mapping division keys to canonical `{ num, den }` pairs.
 * @type {Map<string, { readonly num: bigint, readonly den: bigint }>}
 */
const divisionMemo = new Map()

/**
 * Compute the non-negative greatest common divisor of two non-negative BigInts,
 * using the precomputed `GCD_TABLE` whenever both operands fall within `[0, SMALL_GCD_LIMIT]`.
 *
 * @param {bigint} x - Non-negative integer.
 * @param {bigint} y - Non-negative integer.
 * @returns {bigint} Greatest common divisor of `x` and `y`.
 */
function gcdBigInt(x, y) {
	while (x > SMALL_GCD_LIMIT_BIGINT || y > SMALL_GCD_LIMIT_BIGINT) {
		if (y === 0n) {
			return x
		}
		const r = x % y
		x = y
		y = r
	}
	return SMALL_BIGINTS[GCD_TABLE[Number(x) * SMALL_GCD_STRIDE + Number(y)]]
}

/**
 * Validate a rational operand `{ num: bigint, den: bigint }`.
 *
 * @param {unknown} value - Candidate rational object.
 * @param {string} name - Parameter name for error messages.
 * @returns {void}
 * @throws {TypeError} If `value` is not an object with `bigint` `num` and `den` properties.
 * @throws {RangeError} If `value.den === 0n`.
 */
function validateRational(value, name) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(`${name} must be a non-null rational object { num: bigint, den: bigint }`)
	}
	if (typeof value.num !== 'bigint') {
		throw new TypeError(`${name}.num must be a bigint`)
	}
	if (typeof value.den !== 'bigint') {
		throw new TypeError(`${name}.den must be a bigint`)
	}
	if (value.den === 0n) {
		throw new RangeError(`${name}.den must not be 0n`)
	}
}

/**
 * Store a canonical result in the bounded LRU memoization cache.
 *
 * @param {string} key - Cache key.
 * @param {{ readonly num: bigint, readonly den: bigint }} entry - Frozen canonical rational.
 * @returns {void}
 */
function memoSet(key, entry) {
	if (divisionMemo.has(key)) {
		divisionMemo.delete(key)
	} else if (divisionMemo.size >= MAX_MEMO_ENTRIES) {
		const oldestKey = divisionMemo.keys().next().value
		divisionMemo.delete(oldestKey)
	}
	divisionMemo.set(key, entry)
}

/**
 * Look up a key in the LRU memoization cache, refreshing its recency on hit.
 *
 * @param {string} key - Cache key.
 * @returns {{ num: bigint, den: bigint } | undefined} Fresh copy of cached rational, or `undefined`.
 */
function memoGet(key) {
	const hit = divisionMemo.get(key)
	if (hit === undefined) {
		return undefined
	}
	divisionMemo.delete(key)
	divisionMemo.set(key, hit)
	return { num: hit.num, den: hit.den }
}

/**
 * Divide two exact rational numbers `a / b`, returning the quotient in canonical
 * lowest terms `{ num: bigint, den: bigint }`.
 *
 * Uses a precomputed GCD lookup table for small magnitudes, a precomputed sign table,
 * cross-cancellation prior to multiplication, and a bounded LRU memoization cache
 * (both on raw and canonical reduced operand keys).
 *
 * @param {{ num: bigint, den: bigint }} a - Dividend rational (`a.den !== 0n`).
 * @param {{ num: bigint, den: bigint }} b - Divisor rational (`b.num !== 0n`, `b.den !== 0n`).
 * @returns {{ num: bigint, den: bigint }} Exact quotient `a / b` in lowest terms with `den > 0n`.
 * @throws {TypeError} If `a` or `b` is not a valid `{ num: bigint, den: bigint }` object.
 * @throws {RangeError} If `a.den === 0n`, `b.den === 0n`, or `b.num === 0n` (division by zero).
 */
export function divideRationalMemo(a, b) {
	validateRational(a, 'a')
	validateRational(b, 'b')

	if (b.num === 0n) {
		throw new RangeError('Division by zero rational (b.num must not be 0n)')
	}

	if (a.num === 0n) {
		return { num: 0n, den: 1n }
	}

	const rawKey = `${a.num}/${a.den}:${b.num}/${b.den}`
	const rawHit = memoGet(rawKey)
	if (rawHit !== undefined) {
		return rawHit
	}

	const signBit =
		(a.num < 0n ? 1 : 0) ^
		(a.den < 0n ? 1 : 0) ^
		(b.num < 0n ? 1 : 0) ^
		(b.den < 0n ? 1 : 0)
	const sign = SIGN_TABLE[signBit]

	let an = a.num < 0n ? -a.num : a.num
	let ad = a.den < 0n ? -a.den : a.den
	let bn = b.num < 0n ? -b.num : b.num
	let bd = b.den < 0n ? -b.den : b.den

	// Reduce each operand to lowest terms first using table-accelerated GCD
	const gA = gcdBigInt(an, ad)
	if (gA > 1n) {
		an /= gA
		ad /= gA
	}
	const gB = gcdBigInt(bn, bd)
	if (gB > 1n) {
		bn /= gB
		bd /= gB
	}

	const canonicalKey = `${sign < 0n ? '-' : ''}${an}/${ad}:${bn}/${bd}`
	if (canonicalKey !== rawKey) {
		const canonicalHit = memoGet(canonicalKey)
		if (canonicalHit !== undefined) {
			memoSet(rawKey, Object.freeze({ num: canonicalHit.num, den: canonicalHit.den }))
			return canonicalHit
		}
	}

	// Cross-cancel (an, bn) and (ad, bd) so final product is already in lowest terms
	const gNum = gcdBigInt(an, bn)
	if (gNum > 1n) {
		an /= gNum
		bn /= gNum
	}
	const gDen = gcdBigInt(ad, bd)
	if (gDen > 1n) {
		ad /= gDen
		bd /= gDen
	}

	const resultNum = sign * (an * bd)
	const resultDen = ad * bn

	const frozen = Object.freeze({ num: resultNum, den: resultDen })
	memoSet(canonicalKey, frozen)
	if (rawKey !== canonicalKey) {
		memoSet(rawKey, frozen)
	}

	return { num: resultNum, den: resultDen }
}
