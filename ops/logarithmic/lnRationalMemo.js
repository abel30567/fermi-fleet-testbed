/**
 * Table-driven, memoized natural logarithm over exact rational numbers.
 *
 * Rationals are represented as `{ num: BigInt, den: BigInt }` in lowest terms
 * with a strictly positive denominator (`den > 0n`, `gcd(|num|, den) === 1n`,
 * and zero represented as `{ num: 0n, den: 1n }`).
 *
 * Algorithm overview:
 * 1. Normalize the input rational to lowest terms and canonical sign; exploit
 *    exact reciprocal symmetry `ln(p/q) = -ln(q/p)` so only arguments `>= 1`
 *    are computed and cached.
 * 2. Reduce `r = p/q >= 1` to `r = 2^k * m` with `m in [1, 2)` via exact
 *    BigInt bit-length shifts.
 * 3. Use a precomputed lookup table of `ln((N + i) / N)` for `i = 0..N`
 *    (`N = 64`) to choose the nearest anchor `t_i = (N + i) / N`, leaving a
 *    tiny residual `u = m / t_i` with `|u - 1| <= 1 / 128`.
 * 4. Evaluate `ln(u) = 2 * artanh((u - 1) / (u + 1))` in fixed-point BigInt
 *    arithmetic; since `|(u - 1) / (u + 1)| <= 1 / 255`, the series gains
 *    nearly 5 decimal digits per term.
 * 5. Round to `precision` decimal digits, reduce to lowest terms, and memoize.
 *
 * @module ops/logarithmic/lnRationalMemo
 */

const TABLE_SIZE = 64
const TABLE_SIZE_BIG = BigInt(TABLE_SIZE)
const DEFAULT_PRECISION = 18
const GUARD_DIGITS = 12
const TABLE_EXTRA_GUARD = 6
const DEFAULT_TABLE_DIGITS = 40
const TABLE_DIGITS_STEP = 16
const MAX_MEMO_ENTRIES = 4096

/**
 * Memoized lookup tables keyed by working decimal digit count.
 * @type {Map<number, { digits: number, scale: bigint, entries: bigint[], ln2: bigint }>}
 */
const logTables = new Map()

/**
 * Memoization cache for reduced `{ num, den }` results keyed by `"p/q@precision"`
 * where `p > q >= 1` and `gcd(p, q) === 1n`.
 * @type {Map<string, { num: bigint, den: bigint }>}
 */
const resultCache = new Map()

/**
 * Computes the greatest common divisor of two BigInts (always non-negative).
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
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
 * Reduces a fraction `num / den` (with `den > 0n`) to lowest terms.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {{ num: bigint, den: bigint }}
 */
function reduceRational(num, den) {
	if (num === 0n) return { num: 0n, den: 1n }
	const g = gcd(num, den)
	return { num: num / g, den: den / g }
}

/**
 * Returns the bit length of a non-negative BigInt (`0` for `0n`).
 *
 * @param {bigint} n
 * @returns {number}
 */
function bitLength(n) {
	if (n === 0n) return 0
	const hex = n.toString(16)
	const firstNibble = parseInt(hex[0], 16)
	return (hex.length - 1) * 4 + (32 - Math.clz32(firstNibble))
}

/**
 * Divides `numerator` by positive `divisor`, rounding half away from zero.
 *
 * @param {bigint} numerator
 * @param {bigint} divisor
 * @returns {bigint}
 */
function roundDiv(numerator, divisor) {
	const half = divisor / 2n
	if (numerator >= 0n) {
		return (numerator + half) / divisor
	}
	return -((-numerator + half) / divisor)
}

/**
 * Evaluates `2 * artanh(numZ / denZ)` scaled by `scale` using BigInt arithmetic.
 * Requires `|numZ| < denZ` and `denZ > 0n`.
 *
 * @param {bigint} numZ
 * @param {bigint} denZ
 * @param {bigint} scale
 * @returns {bigint}
 */
function artanh2Scaled(numZ, denZ, scale) {
	if (numZ === 0n) return 0n
	const n2 = numZ * numZ
	const d2 = denZ * denZ
	let power = (2n * scale * numZ) / denZ
	let sum = power
	for (let k = 3n; ; k += 2n) {
		power = (power * n2) / d2
		const term = power / k
		if (term === 0n) break
		sum += term
	}
	return sum
}

/**
 * Builds and returns a precomputed table of `ln((N + i) / N)` for `i = 0..N`
 * scaled by `10^digits`.
 *
 * Each step `ln((N + i) / (N + i - 1)) = 2 * artanh(1 / (2N + 2i - 1))` is
 * computed with extra guard digits so cumulative rounding error across all
 * `N` entries stays far below `0.5 ulp` at `10^digits`.
 *
 * @param {number} digits
 * @returns {{ digits: number, scale: bigint, entries: bigint[], ln2: bigint }}
 */
function buildLogTable(digits) {
	const internalScale = 10n ** BigInt(digits + TABLE_EXTRA_GUARD)
	const dropFactor = 10n ** BigInt(TABLE_EXTRA_GUARD)
	const entries = new Array(TABLE_SIZE + 1)
	entries[0] = 0n
	let acc = 0n

	for (let i = 1; i <= TABLE_SIZE; i++) {
		const d = BigInt(2 * TABLE_SIZE + 2 * i - 1)
		const d2 = d * d
		let power = (2n * internalScale) / d
		let step = power
		for (let k = 3n; ; k += 2n) {
			power /= d2
			const term = power / k
			if (term === 0n) break
			step += term
		}
		acc += step
		entries[i] = roundDiv(acc, dropFactor)
	}

	return {
		digits,
		scale: 10n ** BigInt(digits),
		entries,
		ln2: entries[TABLE_SIZE],
	}
}

/**
 * Returns a cached lookup table with at least `minDigits` decimal digits.
 *
 * @param {number} minDigits
 * @returns {{ digits: number, scale: bigint, entries: bigint[], ln2: bigint }}
 */
function getLogTable(minDigits) {
	const targetDigits =
		minDigits <= DEFAULT_TABLE_DIGITS
			? DEFAULT_TABLE_DIGITS
			: Math.ceil(minDigits / TABLE_DIGITS_STEP) * TABLE_DIGITS_STEP

	let table = logTables.get(targetDigits)
	if (!table) {
		table = buildLogTable(targetDigits)
		logTables.set(targetDigits, table)
	}
	return table
}

// Precompute the default lookup table at module load time.
getLogTable(DEFAULT_TABLE_DIGITS)

/**
 * Computes `ln(p / q)` for `p > q >= 1` (`gcd(p, q) === 1n`) to `precision`
 * decimal digits, using the precomputed table and memoization cache.
 *
 * @param {bigint} p
 * @param {bigint} q
 * @param {number} precision
 * @returns {{ num: bigint, den: bigint }}
 */
function lnGreaterThanOne(p, q, precision) {
	const key = `${p}/${q}@${precision}`
	const cached = resultCache.get(key)
	if (cached) {
		return { num: cached.num, den: cached.den }
	}

	// Range reduction: p / q = 2^k * (pPrime / qPrime) with 1 <= pPrime / qPrime < 2.
	let k = bitLength(p) - bitLength(q)
	let pPrime = p
	let qPrime = k > 0 ? q << BigInt(k) : q
	if (pPrime < qPrime) {
		pPrime <<= 1n
		k -= 1
	} else if (pPrime >= qPrime << 1n) {
		qPrime <<= 1n
		k += 1
	}

	// Account for amplification of ln(2) rounding error when k is large.
	const kDigits = k === 0 ? 0 : String(k).length
	const requiredDigits = precision + GUARD_DIGITS + kDigits
	const table = getLogTable(requiredDigits)

	// Select nearest table anchor t_i = (N + i) / N for i in [0, N].
	const idxBig = (2n * TABLE_SIZE_BIG * (pPrime - qPrime) + qPrime) / (2n * qPrime)
	const idx = Number(idxBig)

	// Residual u = (pPrime / qPrime) / ((N + idx) / N) = A / B.
	const A = pPrime * TABLE_SIZE_BIG
	const B = qPrime * (TABLE_SIZE_BIG + idxBig)
	const lnResidual = artanh2Scaled(A - B, A + B, table.scale)

	const totalScaled = BigInt(k) * table.ln2 + table.entries[idx] + lnResidual
	const dropFactor = 10n ** BigInt(table.digits - precision)
	const rounded = roundDiv(totalScaled, dropFactor)
	const result = reduceRational(rounded, 10n ** BigInt(precision))

	if (resultCache.size >= MAX_MEMO_ENTRIES) {
		const oldestKey = resultCache.keys().next().value
		resultCache.delete(oldestKey)
	}
	resultCache.set(key, result)

	return { num: result.num, den: result.den }
}

/**
 * Computes the natural logarithm `ln(x)` of a positive exact rational number
 * `x = { num: BigInt, den: BigInt }`, returning an exact rational approximation
 * `{ num: BigInt, den: BigInt }` reduced to lowest terms (`den > 0n`,
 * `gcd(|num|, den) === 1n`).
 *
 * Uses a precomputed logarithm lookup table for range reduction and memoizes
 * canonical rational inputs so repeated or equivalent queries (including
 * unreduced fractions and reciprocals) reuse cached results.
 *
 * @param {{ num: bigint, den: bigint }} x - Positive rational number as `{ num, den }`.
 * @param {number} [precision=18] - Number of decimal digits of precision (positive integer).
 * @returns {{ num: bigint, den: bigint }} Rational approximation of `ln(x)` in lowest terms.
 * @throws {TypeError} If `x` is not an object with `bigint` `num` and `den`, or `precision` is not a number.
 * @throws {RangeError} If `x.den === 0n`, `x <= 0`, or `precision` is not a positive integer.
 */
export function lnRationalMemo(x, precision = DEFAULT_PRECISION) {
	if (x === null || typeof x !== 'object' || Array.isArray(x)) {
		throw new TypeError('Input rational x must be a non-null object with bigint num and den')
	}
	if (typeof x.num !== 'bigint' || typeof x.den !== 'bigint') {
		throw new TypeError('Rational num and den must both be BigInt values')
	}
	if (typeof precision !== 'number') {
		throw new TypeError('Precision must be a number')
	}
	if (!Number.isInteger(precision) || precision < 1) {
		throw new RangeError('Precision must be a positive integer')
	}
	if (x.den === 0n) {
		throw new RangeError('Rational denominator must not be zero')
	}

	let num = x.num
	let den = x.den
	if (den < 0n) {
		num = -num
		den = -den
	}
	if (num <= 0n) {
		throw new RangeError('Natural logarithm is only defined for strictly positive rationals')
	}

	const g = gcd(num, den)
	const p = num / g
	const q = den / g

	if (p === q) {
		return { num: 0n, den: 1n }
	}
	if (p > q) {
		return lnGreaterThanOne(p, q, precision)
	}
	const pos = lnGreaterThanOne(q, p, precision)
	return { num: -pos.num, den: pos.den }
}
