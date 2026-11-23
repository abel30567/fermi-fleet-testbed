/**
 * Table-driven, memoized arbitrary-precision decimal string multiplication.
 *
 * Precomputes base-100 multiplication, quotient, remainder, and 2-digit string
 * lookup tables at module initialization so multi-limb products execute via
 * table lookups without BigInt conversion or floating-point rounding error.
 * Normalized exact products and precision-formatted results are memoized in
 * bounded LRU caches with commutative canonicalization.
 */

const BASE = 100
const TABLE_SIZE = BASE * BASE
const MAX_CACHE_SIZE = 1024
const MAX_MEMO_DIGITS = 4096

/** Precomputed base-100 product table: MUL_TABLE[a * 100 + b] = a * b. */
const MUL_TABLE = new Uint16Array(TABLE_SIZE)

/** Precomputed base-100 quotient table for sums in [0, 9999]. */
const DIV100_TABLE = new Uint8Array(TABLE_SIZE)

/** Precomputed base-100 remainder table for sums in [0, 9999]. */
const MOD100_TABLE = new Uint8Array(TABLE_SIZE)

/** Precomputed zero-padded 2-digit decimal strings for limbs in [0, 99]. */
const PAD2_TABLE = new Array(BASE)

for (let i = 0; i < BASE; i++) {
	PAD2_TABLE[i] = i < 10 ? `0${i}` : String(i)
	const rowOffset = i * BASE
	for (let j = 0; j < BASE; j++) {
		MUL_TABLE[rowOffset + j] = i * j
	}
}

for (let s = 0; s < TABLE_SIZE; s++) {
	DIV100_TABLE[s] = (s / BASE) | 0
	MOD100_TABLE[s] = s - DIV100_TABLE[s] * BASE
}

const DECIMAL_RE = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/

/** Bounded LRU cache for exact unsigned integer-string products. */
const productCache = new Map()

/** Bounded LRU cache for full formatted multiplication results. */
const resultCache = new Map()

function cacheGet(cache, key) {
	if (!cache.has(key)) return undefined
	const value = cache.get(key)
	cache.delete(key)
	cache.set(key, value)
	return value
}

function cacheSet(cache, key, value) {
	if (cache.has(key)) {
		cache.delete(key)
	} else if (cache.size >= MAX_CACHE_SIZE) {
		const oldestKey = cache.keys().next().value
		cache.delete(oldestKey)
	}
	cache.set(key, value)
}

/**
 * Parse and validate an arbitrary-precision decimal string into canonical form:
 * value = (negative ? -1 : 1) * BigInt(digits) * 10^(-scale),
 * where `digits` has no leading or trailing zeros (unless value is zero).
 *
 * @param {string} value
 * @param {string} name
 * @returns {{ isZero: boolean, negative: boolean, digits: string, scale: number }}
 */
function parseDecimal(value, name) {
	if (typeof value !== 'string') {
		throw new TypeError(`${name} must be a decimal string`)
	}

	const trimmed = value.trim()
	const match = DECIMAL_RE.exec(trimmed)
	if (!match) {
		throw new RangeError(`${name} is not a valid decimal string: "${value}"`)
	}

	const sign = match[1]
	const intPart = match[2] ?? ''
	const fracPart = match[3] ?? match[4] ?? ''
	const expStr = match[5]

	const expNum = expStr !== undefined ? Number(expStr) : 0
	if (!Number.isSafeInteger(expNum)) {
		throw new RangeError(`${name} exponent is out of safe integer range`)
	}

	const rawDigits = intPart + fracPart
	let start = 0
	while (start < rawDigits.length && rawDigits.charCodeAt(start) === 48) {
		start++
	}

	if (start === rawDigits.length) {
		return { isZero: true, negative: false, digits: '0', scale: 0 }
	}

	let end = rawDigits.length
	while (end > start && rawDigits.charCodeAt(end - 1) === 48) {
		end--
	}

	const trailingZeros = rawDigits.length - end
	const scale = fracPart.length - expNum - trailingZeros
	if (!Number.isSafeInteger(scale)) {
		throw new RangeError(`${name} scale is out of safe integer range`)
	}

	return {
		isZero: false,
		negative: sign === '-',
		digits: rawDigits.slice(start, end),
		scale,
	}
}

/**
 * Convert a positive decimal digit string into little-endian base-100 limbs.
 *
 * @param {string} digits
 * @returns {Uint8Array}
 */
function toBase100Limbs(digits) {
	const len = digits.length
	const limbCount = (len + 1) >> 1
	const limbs = new Uint8Array(limbCount)
	let limbIndex = 0

	for (let i = len; i > 0; i -= 2) {
		if (i === 1) {
			limbs[limbIndex++] = digits.charCodeAt(0) - 48
		} else {
			limbs[limbIndex++] =
				(digits.charCodeAt(i - 2) - 48) * 10 + (digits.charCodeAt(i - 1) - 48)
		}
	}

	return limbs
}

/**
 * Multiply two positive decimal digit strings using the precomputed base-100
 * lookup tables, with commutative memoization.
 *
 * @param {string} digitsA
 * @param {string} digitsB
 * @returns {string}
 */
function multiplyDigitStrings(digitsA, digitsB) {
	if (digitsA === '1') return digitsB
	if (digitsB === '1') return digitsA

	const canMemo = digitsA.length + digitsB.length <= MAX_MEMO_DIGITS
	let cacheKey = ''
	if (canMemo) {
		cacheKey =
			digitsA <= digitsB ? `${digitsA}*${digitsB}` : `${digitsB}*${digitsA}`
		const cached = cacheGet(productCache, cacheKey)
		if (cached !== undefined) return cached
	}

	const limbsA = toBase100Limbs(digitsA)
	const limbsB = toBase100Limbs(digitsB)
	const lenA = limbsA.length
	const lenB = limbsB.length
	const result = new Uint8Array(lenA + lenB)

	for (let i = 0; i < lenA; i++) {
		const digitA = limbsA[i]
		if (digitA === 0) continue
		const rowOffset = digitA * BASE
		let carry = 0

		for (let j = 0; j < lenB; j++) {
			// Max sum = 99 + 9801 + 99 = 9999, strictly within TABLE_SIZE (10000).
			const sum = result[i + j] + MUL_TABLE[rowOffset + limbsB[j]] + carry
			carry = DIV100_TABLE[sum]
			result[i + j] = MOD100_TABLE[sum]
		}

		let k = i + lenB
		while (carry > 0) {
			const sum = result[k] + carry
			carry = DIV100_TABLE[sum]
			result[k] = MOD100_TABLE[sum]
			k++
		}
	}

	let top = result.length - 1
	while (top > 0 && result[top] === 0) {
		top--
	}

	const parts = new Array(top + 1)
	parts[0] = String(result[top])
	for (let idx = top - 1, out = 1; idx >= 0; idx--, out++) {
		parts[out] = PAD2_TABLE[result[idx]]
	}

	const product = parts.join('')
	if (canMemo) {
		cacheSet(productCache, cacheKey, product)
	}
	return product
}

/**
 * Increment a non-negative integer digit string by 1.
 *
 * @param {string} digits
 * @returns {string}
 */
function incrementDigitString(digits) {
	let i = digits.length - 1
	while (i >= 0 && digits.charCodeAt(i) === 57) {
		i--
	}
	if (i < 0) {
		return '1' + '0'.repeat(digits.length)
	}
	const nextChar = String.fromCharCode(digits.charCodeAt(i) + 1)
	return digits.slice(0, i) + nextChar + '0'.repeat(digits.length - 1 - i)
}

/**
 * Format an unsigned digit string at a non-negative fractional scale.
 *
 * @param {string} digits
 * @param {number} scale
 * @param {boolean} negative
 * @returns {string}
 */
function formatFixedScale(digits, scale, negative) {
	const prefix = negative ? '-' : ''
	if (scale === 0) {
		return prefix + digits
	}
	if (digits.length > scale) {
		const split = digits.length - scale
		return `${prefix}${digits.slice(0, split)}.${digits.slice(split)}`
	}
	return `${prefix}0.${'0'.repeat(scale - digits.length)}${digits}`
}

/**
 * Format a zero value with optional fixed decimal precision.
 *
 * @param {number | undefined} precision
 * @returns {string}
 */
function formatZero(precision) {
	if (precision === undefined || precision === 0) {
		return '0'
	}
	return `0.${'0'.repeat(precision)}`
}

/**
 * Format a non-zero product (digits * 10^-scale) with optional precision
 * (number of fractional decimal places, rounded half away from zero).
 *
 * @param {string} rawDigits
 * @param {number} rawScale
 * @param {boolean} negative
 * @param {number | undefined} precision
 * @returns {string}
 */
function formatProduct(rawDigits, rawScale, negative, precision) {
	let end = rawDigits.length
	while (end > 1 && rawDigits.charCodeAt(end - 1) === 48) {
		end--
	}
	const trailingZeros = rawDigits.length - end
	const digits = trailingZeros > 0 ? rawDigits.slice(0, end) : rawDigits
	const scale = rawScale - trailingZeros

	if (precision === undefined) {
		if (scale <= 0) {
			const intStr = scale === 0 ? digits : digits + '0'.repeat(-scale)
			return (negative ? '-' : '') + intStr
		}
		return formatFixedScale(digits, scale, negative)
	}

	if (scale <= precision) {
		const padded = digits + '0'.repeat(precision - scale)
		return formatFixedScale(padded, precision, negative)
	}

	// scale > precision: round half away from zero by dropping (scale - precision) digits.
	const drop = scale - precision
	if (drop > digits.length) {
		return formatZero(precision)
	}

	if (drop === digits.length) {
		if (digits.charCodeAt(0) >= 53) {
			return formatFixedScale('1', precision, negative)
		}
		return formatZero(precision)
	}

	const keepLen = digits.length - drop
	let kept = digits.slice(0, keepLen)
	if (digits.charCodeAt(keepLen) >= 53) {
		kept = incrementDigitString(kept)
	}
	return formatFixedScale(kept, precision, negative)
}

/**
 * Multiply two arbitrary-precision decimal strings with an optional
 * configurable precision (number of fractional decimal places), using a
 * precomputed base-100 lookup table and bounded LRU memoization.
 *
 * - When `precision` is omitted (`undefined`), returns the exact normalized
 *   decimal string with no unnecessary leading or trailing zeros.
 * - When `precision` is a non-negative integer, returns the product formatted
 *   to exactly `precision` fractional decimal places, rounded half away from
 *   zero (and never returning `"-0"` or `"-0.00"`).
 * - Supports optional leading `+`/`-` signs, whitespace, and scientific
 *   notation (`e`/`E`).
 *
 * @param {string} a - First arbitrary-precision decimal string.
 * @param {string} b - Second arbitrary-precision decimal string.
 * @param {number} [precision] - Optional non-negative integer number of fractional decimal places.
 * @returns {string} Product formatted as a decimal string.
 * @throws {TypeError} If `a` or `b` is not a string, or `precision` is defined and not a number.
 * @throws {RangeError} If `a` or `b` is not a valid decimal string, or `precision` is negative or non-integer.
 */
export function multiplyDecimalMemo(a, b, precision) {
	const parsedA = parseDecimal(a, 'a')
	const parsedB = parseDecimal(b, 'b')

	if (precision !== undefined) {
		if (typeof precision !== 'number') {
			throw new TypeError('precision must be a non-negative integer')
		}
		if (!Number.isInteger(precision) || precision < 0) {
			throw new RangeError('precision must be a non-negative integer')
		}
	}

	if (parsedA.isZero || parsedB.isZero) {
		return formatZero(precision)
	}

	const negative = parsedA.negative !== parsedB.negative
	const totalScale = parsedA.scale + parsedB.scale
	if (!Number.isSafeInteger(totalScale)) {
		throw new RangeError('product scale is out of safe integer range')
	}

	const canMemo =
		parsedA.digits.length + parsedB.digits.length <= MAX_MEMO_DIGITS
	let resultKey = ''
	if (canMemo) {
		const [first, second] =
			parsedA.digits <= parsedB.digits
				? [parsedA.digits, parsedB.digits]
				: [parsedB.digits, parsedA.digits]
		const precTag = precision === undefined ? 'exact' : String(precision)
		resultKey = `${negative ? '-' : '+'}${first}*${second}@${totalScale}:${precTag}`
		const cached = cacheGet(resultCache, resultKey)
		if (cached !== undefined) return cached
	}

	const productDigits = multiplyDigitStrings(parsedA.digits, parsedB.digits)
	const formatted = formatProduct(productDigits, totalScale, negative, precision)

	if (canMemo) {
		cacheSet(resultCache, resultKey, formatted)
	}

	return formatted
}
