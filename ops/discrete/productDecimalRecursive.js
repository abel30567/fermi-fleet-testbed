const DECIMAL_PATTERN = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))$/

/**
 * Zero sentinel in internal decimal representation.
 * @type {{ digits: bigint, scale: number }}
 */
const ZERO = Object.freeze({ digits: 0n, scale: 0 })

/**
 * Parses and validates a decimal string into an exact `{ digits, scale }`
 * representation denoting `digits * 10^(-scale)`.
 *
 * @param {string} value - Decimal string to parse.
 * @param {number} index - Element index in the input array (for error reporting).
 * @returns {{ digits: bigint, scale: number }} Parsed exact decimal.
 */
function parseDecimal(value, index) {
	if (typeof value !== 'string') {
		throw new TypeError(`values[${index}] must be a string, received ${typeof value}`)
	}

	const match = DECIMAL_PATTERN.exec(value)
	if (!match) {
		throw new RangeError(`values[${index}] is not a valid decimal string: "${value}"`)
	}

	const isNegative = match[1] === '-'
	const intPart = match[2] ?? ''
	const fracPart = (match[3] ?? match[4] ?? '').replace(/0+$/, '')
	const scale = fracPart.length
	const rawDigits = intPart + fracPart
	const magnitude = BigInt(rawDigits)

	if (magnitude === 0n) {
		return ZERO
	}

	return {
		digits: isNegative ? -magnitude : magnitude,
		scale,
	}
}

/**
 * Multiplies two exact arbitrary-precision decimals.
 *
 * @param {{ digits: bigint, scale: number }} a
 * @param {{ digits: bigint, scale: number }} b
 * @returns {{ digits: bigint, scale: number }}
 */
function multiplyDecimals(a, b) {
	if (a.digits === 0n || b.digits === 0n) {
		return ZERO
	}

	return {
		digits: a.digits * b.digits,
		scale: a.scale + b.scale,
	}
}

/**
 * Recursively computes the exact product of `items[lo..hi]` using a balanced
 * divide-and-conquer binary product tree.
 *
 * @param {Array<{ digits: bigint, scale: number }>} items - Validated parsed decimals.
 * @param {number} lo - Inclusive start index.
 * @param {number} hi - Inclusive end index.
 * @returns {{ digits: bigint, scale: number }}
 */
function productRange(items, lo, hi) {
	if (lo === hi) {
		return items[lo]
	}

	const mid = lo + Math.floor((hi - lo) / 2)
	const left = productRange(items, lo, mid)
	if (left.digits === 0n) {
		return ZERO
	}

	const right = productRange(items, mid + 1, hi)
	return multiplyDecimals(left, right)
}

/**
 * Rounds an exact decimal to at most `precision` fractional digits (round half
 * away from zero) and formats it as a canonical decimal string with no
 * unnecessary trailing fractional zeros and no negative zero.
 *
 * @param {{ digits: bigint, scale: number }} decimal - Exact decimal value.
 * @param {number} precision - Maximum number of fractional digits (>= 0).
 * @returns {string} Canonical decimal string.
 */
function formatDecimal(decimal, precision) {
	if (decimal.digits === 0n) {
		return '0'
	}

	const isNegative = decimal.digits < 0n
	let absDigits = isNegative ? -decimal.digits : decimal.digits
	let effectiveScale = decimal.scale

	if (effectiveScale > precision) {
		const divisor = 10n ** BigInt(effectiveScale - precision)
		let quotient = absDigits / divisor
		const remainder = absDigits % divisor
		if (remainder * 2n >= divisor) {
			quotient += 1n
		}
		absDigits = quotient
		effectiveScale = precision
	}

	if (absDigits === 0n) {
		return '0'
	}

	const sign = isNegative ? '-' : ''
	if (effectiveScale === 0) {
		return `${sign}${absDigits.toString()}`
	}

	const padded = absDigits.toString().padStart(effectiveScale + 1, '0')
	const splitIndex = padded.length - effectiveScale
	const intPart = padded.slice(0, splitIndex)
	const fracPart = padded.slice(splitIndex).replace(/0+$/, '')

	if (fracPart.length === 0) {
		return `${sign}${intPart}`
	}

	return `${sign}${intPart}.${fracPart}`
}

/**
 * Computes the discrete product of an array of arbitrary-precision decimal
 * strings using a recursive divide-and-conquer binary product tree over native
 * `BigInt` scaled integers, rounding the final result to `precision` fractional
 * digits (round half away from zero).
 *
 * - Empty input (`[]`) returns the multiplicative identity `"1"`.
 * - Trailing fractional zeros are stripped from the returned canonical string.
 * - Intermediate products are kept exact so rounding occurs only once at the end.
 *
 * @param {string[]} values - Array of valid base-10 decimal strings (optional leading `+`/`-`, integer and/or fractional digits).
 * @param {number} [precision=20] - Non-negative integer maximum number of fractional digits in the output.
 * @returns {string} The product formatted as a canonical arbitrary-precision decimal string.
 * @throws {TypeError} If `values` is not an array, any element is not a string, or `precision` is not a number.
 * @throws {RangeError} If any element is not a valid decimal string or `precision` is not a non-negative integer.
 */
export function productDecimalRecursive(values, precision = 20) {
	if (!Array.isArray(values)) {
		throw new TypeError('values must be an array of decimal strings')
	}

	if (typeof precision !== 'number') {
		throw new TypeError('precision must be a non-negative integer')
	}

	if (!Number.isInteger(precision) || precision < 0) {
		throw new RangeError('precision must be a non-negative integer')
	}

	const parsed = new Array(values.length)
	for (let i = 0; i < values.length; i += 1) {
		parsed[i] = parseDecimal(values[i], i)
	}

	if (parsed.length === 0) {
		return '1'
	}

	const exactProduct = productRange(parsed, 0, parsed.length - 1)
	return formatDecimal(exactProduct, precision)
}
