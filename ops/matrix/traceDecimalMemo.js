/**
 * @fileoverview Arbitrary-precision matrix trace over decimal strings using a
 * table-driven DFA parser, precomputed/memoized powers-of-10 table, and
 * bounded LRU memoization caches.
 */

const DEFAULT_PRECISION = 20
const PRECOMPUTED_POW10_LIMIT = 128
const MAX_EXPONENT = 100_000
const MAX_PARSE_CACHE_SIZE = 4096
const MAX_TRACE_CACHE_SIZE = 2048

// Character classes for the table-driven decimal parser DFA.
const CC_INVALID = 0
const CC_SIGN = 1
const CC_DIGIT = 2
const CC_DOT = 3
const CC_EXP = 4
const NUM_CHAR_CLASSES = 5

/** @type {Uint8Array} Precomputed ASCII character class lookup table. */
const CHAR_CLASS = new Uint8Array(128)
CHAR_CLASS[43] = CC_SIGN // '+'
CHAR_CLASS[45] = CC_SIGN // '-'
CHAR_CLASS[46] = CC_DOT // '.'
CHAR_CLASS[69] = CC_EXP // 'E'
CHAR_CLASS[101] = CC_EXP // 'e'
for (let code = 48; code <= 57; code++) {
	CHAR_CLASS[code] = CC_DIGIT // '0'..'9'
}

// DFA states for decimal string syntax:
// 0: START, 1: AFTER_SIGN, 2: INT_DIGITS, 3: DOT_NO_INT,
// 4: FRAC_DIGITS, 5: EXP_START, 6: EXP_SIGN, 7: EXP_DIGITS
const STATE_ERR = -1
const TRANSITION_TABLE = new Int8Array([
	// INVALID, SIGN, DIGIT, DOT, EXP
	STATE_ERR, 1, 2, 3, STATE_ERR, // 0: START
	STATE_ERR, STATE_ERR, 2, 3, STATE_ERR, // 1: AFTER_SIGN
	STATE_ERR, STATE_ERR, 2, 4, 5, // 2: INT_DIGITS
	STATE_ERR, STATE_ERR, 4, STATE_ERR, STATE_ERR, // 3: DOT_NO_INT
	STATE_ERR, STATE_ERR, 4, STATE_ERR, 5, // 4: FRAC_DIGITS
	STATE_ERR, 6, 7, STATE_ERR, STATE_ERR, // 5: EXP_START
	STATE_ERR, STATE_ERR, 7, STATE_ERR, STATE_ERR, // 6: EXP_SIGN
	STATE_ERR, STATE_ERR, 7, STATE_ERR, STATE_ERR, // 7: EXP_DIGITS
])

/** @type {Uint8Array} Lookup table of accepting DFA states. */
const ACCEPTING_STATES = new Uint8Array([0, 0, 1, 0, 1, 0, 0, 1])

/**
 * Precomputed powers-of-10 table (`10n ** BigInt(k)` for k = 0..128),
 * complemented by a memo map for larger exponents.
 * @type {bigint[]}
 */
const POW10_TABLE = new Array(PRECOMPUTED_POW10_LIMIT + 1)
POW10_TABLE[0] = 1n
for (let i = 1; i <= PRECOMPUTED_POW10_LIMIT; i++) {
	POW10_TABLE[i] = POW10_TABLE[i - 1] * 10n
}

/** @type {Map<number, bigint>} Memoized cache for powers of 10 above PRECOMPUTED_POW10_LIMIT. */
const POW10_MEMO = new Map()

/** @type {Map<string, { unscaled: bigint, scale: number }>} Bounded LRU cache of parsed decimal strings. */
const PARSE_CACHE = new Map()

/** @type {Map<string, string>} Bounded LRU cache of computed trace results keyed by precision and diagonal values. */
const TRACE_CACHE = new Map()

/**
 * Retrieves an entry from a bounded LRU Map, refreshing its recency.
 *
 * @template K, V
 * @param {Map<K, V>} cache
 * @param {K} key
 * @returns {V | undefined}
 */
function lruGet(cache, key) {
	if (!cache.has(key)) return undefined
	const value = cache.get(key)
	cache.delete(key)
	cache.set(key, value)
	return value
}

/**
 * Stores an entry in a bounded LRU Map, evicting the oldest key if over capacity.
 *
 * @template K, V
 * @param {Map<K, V>} cache
 * @param {K} key
 * @param {V} value
 * @param {number} maxSize
 */
function lruSet(cache, key, value, maxSize) {
	if (cache.has(key)) {
		cache.delete(key)
	} else if (cache.size >= maxSize) {
		const oldestKey = cache.keys().next().value
		cache.delete(oldestKey)
	}
	cache.set(key, value)
}

/**
 * Returns `10n ** BigInt(exp)` using the precomputed table and memoized binary exponentiation.
 *
 * @param {number} exp Non-negative integer exponent.
 * @returns {bigint}
 */
function pow10(exp) {
	if (exp <= PRECOMPUTED_POW10_LIMIT) {
		return POW10_TABLE[exp]
	}
	const cached = POW10_MEMO.get(exp)
	if (cached !== undefined) return cached

	const half = exp >> 1
	const halfVal = pow10(half)
	const result = (exp & 1) === 1 ? halfVal * halfVal * 10n : halfVal * halfVal
	if (POW10_MEMO.size < MAX_PARSE_CACHE_SIZE) {
		POW10_MEMO.set(exp, result)
	}
	return result
}

/**
 * Parses and validates an arbitrary-precision decimal string into canonical
 * `{ unscaled, scale }` form representing `unscaled * 10^(-scale)` with `scale >= 0`.
 * Uses a table-driven DFA and LRU memoization.
 *
 * @param {unknown} value
 * @returns {{ unscaled: bigint, scale: number }}
 */
function parseDecimal(value) {
	if (typeof value !== 'string') {
		throw new TypeError(`Expected a decimal string, received ${typeof value}`)
	}

	const cached = lruGet(PARSE_CACHE, value)
	if (cached !== undefined) return cached

	const len = value.length
	if (len === 0) {
		throw new SyntaxError('Invalid decimal string: empty string')
	}

	let state = 0
	let dotIdx = -1
	let expIdx = -1

	for (let i = 0; i < len; i++) {
		const code = value.charCodeAt(i)
		const cc = code < 128 ? CHAR_CLASS[code] : CC_INVALID
		state = TRANSITION_TABLE[state * NUM_CHAR_CLASSES + cc]
		if (state === STATE_ERR) {
			throw new SyntaxError(`Invalid decimal string: "${value}"`)
		}
		if (cc === CC_DOT) dotIdx = i
		else if (cc === CC_EXP) expIdx = i
	}

	if (ACCEPTING_STATES[state] !== 1) {
		throw new SyntaxError(`Invalid decimal string: "${value}"`)
	}

	const firstCode = value.charCodeAt(0)
	const isNegative = firstCode === 45 // '-'
	const startIdx = firstCode === 43 || firstCode === 45 ? 1 : 0
	const mantissaEnd = expIdx === -1 ? len : expIdx

	let intPart
	let fracPart
	if (dotIdx === -1) {
		intPart = value.slice(startIdx, mantissaEnd)
		fracPart = ''
	} else {
		intPart = value.slice(startIdx, dotIdx)
		fracPart = value.slice(dotIdx + 1, mantissaEnd)
	}

	let exp = 0
	if (expIdx !== -1) {
		exp = Number(value.slice(expIdx + 1))
		if (!Number.isSafeInteger(exp) || Math.abs(exp) > MAX_EXPONENT) {
			throw new RangeError(`Exponent out of supported range in "${value}"`)
		}
	}

	const rawDigits = intPart + fracPart
	let firstNonZero = 0
	while (firstNonZero < rawDigits.length && rawDigits.charCodeAt(firstNonZero) === 48) {
		firstNonZero++
	}

	if (firstNonZero === rawDigits.length) {
		const zero = { unscaled: 0n, scale: 0 }
		lruSet(PARSE_CACHE, value, zero, MAX_PARSE_CACHE_SIZE)
		return zero
	}

	let lastNonZero = rawDigits.length - 1
	while (lastNonZero > firstNonZero && rawDigits.charCodeAt(lastNonZero) === 48) {
		lastNonZero--
	}

	const trailingZeros = rawDigits.length - 1 - lastNonZero
	const compactDigits = rawDigits.slice(firstNonZero, lastNonZero + 1)
	let scale = fracPart.length - exp - trailingZeros

	if (Math.abs(scale) > MAX_EXPONENT) {
		throw new RangeError(`Effective decimal scale out of supported range in "${value}"`)
	}

	let unscaled = BigInt(compactDigits)
	if (isNegative) unscaled = -unscaled

	if (scale < 0) {
		unscaled *= pow10(-scale)
		scale = 0
	}

	const parsed = { unscaled, scale }
	lruSet(PARSE_CACHE, value, parsed, MAX_PARSE_CACHE_SIZE)
	return parsed
}

/**
 * Formats an exact scaled BigInt value (`sum * 10^(-scale)`), rounding half away
 * from zero to at most `precision` fractional digits and trimming trailing fractional zeros.
 *
 * @param {bigint} sum
 * @param {number} scale
 * @param {number} precision
 * @returns {string}
 */
function formatScaledDecimal(sum, scale, precision) {
	if (sum === 0n) return '0'

	let adjustedSum = sum
	let adjustedScale = scale

	if (adjustedScale > precision) {
		const shift = adjustedScale - precision
		const divisor = pow10(shift)
		const isNeg = adjustedSum < 0n
		const absSum = isNeg ? -adjustedSum : adjustedSum
		let quotient = absSum / divisor
		const remainder = absSum % divisor
		if (remainder * 2n >= divisor) {
			quotient += 1n
		}
		adjustedSum = isNeg ? -quotient : quotient
		adjustedScale = precision
		if (adjustedSum === 0n) return '0'
	}

	const signStr = adjustedSum < 0n ? '-' : ''
	const digits = (adjustedSum < 0n ? -adjustedSum : adjustedSum).toString()

	if (adjustedScale === 0) {
		return signStr + digits
	}

	let intPart
	let fracPart
	if (digits.length <= adjustedScale) {
		intPart = '0'
		fracPart = '0'.repeat(adjustedScale - digits.length) + digits
	} else {
		const splitIdx = digits.length - adjustedScale
		intPart = digits.slice(0, splitIdx)
		fracPart = digits.slice(splitIdx)
	}

	let end = fracPart.length
	while (end > 0 && fracPart.charCodeAt(end - 1) === 48) {
		end--
	}
	fracPart = fracPart.slice(0, end)

	return fracPart.length === 0 ? signStr + intPart : `${signStr}${intPart}.${fracPart}`
}

/**
 * Computes the matrix trace (sum of main diagonal entries) over a non-empty square
 * 2D array of arbitrary-precision decimal strings using BigInt arithmetic.
 *
 * Uses a table-driven DFA decimal parser, a precomputed/memoized powers-of-10 table,
 * and bounded LRU memoization caches for parsed decimals and computed trace results.
 * Rounds half away from zero to at most `precision` fractional digits and trims
 * unnecessary trailing fractional zeros.
 *
 * @param {string[][]} matrix Non-empty square 2D array of valid decimal strings.
 * @param {number} [precision=20] Non-negative integer specifying maximum fractional decimal digits.
 * @returns {string} The trace formatted as a canonical decimal string.
 * @throws {TypeError} If `matrix` is not a 2D array, contains non-string entries, or `precision` is not a number.
 * @throws {RangeError} If `matrix` is empty, non-square/ragged, `precision` is invalid, or an exponent is out of range.
 * @throws {SyntaxError} If any matrix entry is not a valid decimal string.
 */
export function traceDecimalMemo(matrix, precision = DEFAULT_PRECISION) {
	if (typeof precision !== 'number') {
		throw new TypeError(`precision must be a non-negative integer, received ${typeof precision}`)
	}
	if (!Number.isInteger(precision) || precision < 0) {
		throw new RangeError(`precision must be a non-negative integer, received ${precision}`)
	}
	if (!Array.isArray(matrix)) {
		throw new TypeError('matrix must be a non-empty 2D array')
	}

	const n = matrix.length
	if (n === 0) {
		throw new RangeError('matrix must be non-empty')
	}

	/** @type {Array<{ unscaled: bigint, scale: number }>} */
	const diagonal = new Array(n)
	/** @type {string[]} */
	const diagKeyParts = new Array(n)

	for (let i = 0; i < n; i++) {
		const row = matrix[i]
		if (!Array.isArray(row)) {
			throw new TypeError(`matrix row ${i} must be an array`)
		}
		if (row.length !== n) {
			throw new RangeError(
				`matrix must be square (${n}x${n}), but row ${i} has length ${row.length}`,
			)
		}
		for (let j = 0; j < n; j++) {
			const parsed = parseDecimal(row[j])
			if (i === j) {
				diagonal[i] = parsed
				diagKeyParts[i] = row[j]
			}
		}
	}

	// Valid decimal strings never contain '|' or ',', making this key collision-free.
	const cacheKey = `${precision}|${diagKeyParts.join(',')}`
	const cachedTrace = lruGet(TRACE_CACHE, cacheKey)
	if (cachedTrace !== undefined) {
		return cachedTrace
	}

	let maxScale = 0
	for (let i = 0; i < n; i++) {
		if (diagonal[i].scale > maxScale) {
			maxScale = diagonal[i].scale
		}
	}

	let sum = 0n
	for (let i = 0; i < n; i++) {
		const entry = diagonal[i]
		if (entry.unscaled !== 0n) {
			sum += entry.unscaled * pow10(maxScale - entry.scale)
		}
	}

	const result = formatScaledDecimal(sum, maxScale, precision)
	lruSet(TRACE_CACHE, cacheKey, result, MAX_TRACE_CACHE_SIZE)
	return result
}
