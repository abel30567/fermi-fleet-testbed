const DECIMAL_PATTERN = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/
const MAX_EXPONENT = 1_000_000
const DEFAULT_PRECISION = 20

/**
 * Parses a decimal string (supporting optional sign, fractional part, and scientific notation)
 * into an exact BigInt representation `{ value, scale }` meaning `value * 10^(-scale)` with `scale >= 0`.
 *
 * @param {unknown} input - Candidate decimal string.
 * @param {string} label - Parameter label for descriptive error messages.
 * @returns {{ value: bigint, scale: number }} Exact scaled BigInt decimal.
 */
function parseDecimal(input, label) {
	if (typeof input !== 'string') {
		throw new TypeError(`${label} must be a decimal string`)
	}

	const match = DECIMAL_PATTERN.exec(input)
	if (!match) {
		throw new RangeError(`${label} is not a valid decimal string: "${input}"`)
	}

	const [, sign, intPart, fracAfterInt, fracOnly, expStr] = match
	const digits = (intPart ?? '') + (fracAfterInt ?? fracOnly ?? '')
	let scale = (fracAfterInt ?? fracOnly ?? '').length

	let exponent = 0
	if (expStr !== undefined) {
		exponent = Number(expStr)
		if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > MAX_EXPONENT) {
			throw new RangeError(`${label} exponent out of supported range: "${input}"`)
		}
	}

	let value = BigInt(digits)
	if (value === 0n) {
		return { value: 0n, scale: 0 }
	}

	if (sign === '-') {
		value = -value
	}

	const adjustedScale = scale - exponent
	if (adjustedScale < 0) {
		value *= 10n ** BigInt(-adjustedScale)
		scale = 0
	} else {
		scale = adjustedScale
	}

	return { value, scale }
}

/**
 * Multiplies two exact scaled BigInt decimals.
 *
 * @param {{ value: bigint, scale: number }} x
 * @param {{ value: bigint, scale: number }} y
 * @returns {{ value: bigint, scale: number }}
 */
function mulDecimal(x, y) {
	if (x.value === 0n || y.value === 0n) {
		return { value: 0n, scale: 0 }
	}
	return {
		value: x.value * y.value,
		scale: x.scale + y.scale,
	}
}

/**
 * Subtracts two exact scaled BigInt decimals (`x - y`).
 *
 * @param {{ value: bigint, scale: number }} x
 * @param {{ value: bigint, scale: number }} y
 * @returns {{ value: bigint, scale: number }}
 */
function subDecimal(x, y) {
	if (x.scale === y.scale) {
		const value = x.value - y.value
		return value === 0n ? { value: 0n, scale: 0 } : { value, scale: x.scale }
	}
	if (x.scale > y.scale) {
		const diff = x.scale - y.scale
		const value = x.value - y.value * (10n ** BigInt(diff))
		return value === 0n ? { value: 0n, scale: 0 } : { value, scale: x.scale }
	}
	const diff = y.scale - x.scale
	const value = x.value * (10n ** BigInt(diff)) - y.value
	return value === 0n ? { value: 0n, scale: 0 } : { value, scale: y.scale }
}

/**
 * Rounds an exact scaled BigInt decimal to at most `precision` fractional digits
 * using round-half-away-from-zero.
 *
 * @param {{ value: bigint, scale: number }} decimal
 * @param {number} precision - Non-negative integer number of fractional decimal places.
 * @returns {{ value: bigint, scale: number }}
 */
function roundDecimal(decimal, precision) {
	if (decimal.value === 0n || decimal.scale <= precision) {
		return decimal
	}

	const dropDigits = decimal.scale - precision
	const divisor = 10n ** BigInt(dropDigits)
	const negative = decimal.value < 0n
	const absVal = negative ? -decimal.value : decimal.value

	let quotient = absVal / divisor
	const remainder = absVal % divisor
	if (remainder * 2n >= divisor) {
		quotient += 1n
	}

	if (quotient === 0n) {
		return { value: 0n, scale: 0 }
	}

	return {
		value: negative ? -quotient : quotient,
		scale: precision,
	}
}

/**
 * Formats a scaled BigInt decimal into a canonical decimal string
 * (no trailing fractional zeros, no trailing decimal point, and no "-0").
 *
 * @param {{ value: bigint, scale: number }} decimal
 * @returns {string}
 */
function formatDecimal(decimal) {
	if (decimal.value === 0n) {
		return '0'
	}

	const negative = decimal.value < 0n
	const absDigits = (negative ? -decimal.value : decimal.value).toString()
	const prefix = negative ? '-' : ''

	if (decimal.scale === 0) {
		return prefix + absDigits
	}

	const padded = absDigits.padStart(decimal.scale + 1, '0')
	const splitIndex = padded.length - decimal.scale
	const intPart = padded.slice(0, splitIndex)
	const fracPart = padded.slice(splitIndex).replace(/0+$/, '')

	if (fracPart.length === 0) {
		return prefix + intPart
	}

	return `${prefix}${intPart}.${fracPart}`
}

/**
 * Validates that a vector argument is a 3-element array and parses each element
 * into an exact BigInt decimal representation.
 *
 * @param {unknown} vector
 * @param {string} name
 * @returns {Array<{ value: bigint, scale: number }>}
 */
function parseVector3(vector, name) {
	if (!Array.isArray(vector)) {
		throw new TypeError(`${name} must be an array of 3 decimal strings`)
	}
	if (vector.length !== 3) {
		throw new RangeError(`${name} must have length 3 (received length ${vector.length})`)
	}

	const parsed = new Array(3)
	for (let i = 0; i < 3; i++) {
		parsed[i] = parseDecimal(vector[i], `${name}[${i}]`)
	}
	return parsed
}

/**
 * Computes the 3D cross product `a × b` of two 3-element vectors of arbitrary-precision
 * decimal strings using exact BigInt-based decimal arithmetic and a straightforward
 * iterative loop over the 3 output components.
 *
 * Each component `c[i] = a[(i + 1) % 3] * b[(i + 2) % 3] - a[(i + 2) % 3] * b[(i + 1) % 3]`
 * is evaluated exactly before rounding to at most `precision` fractional decimal places
 * (round-half-away-from-zero) and normalizing trailing fractional zeros.
 *
 * @param {readonly [string, string, string]} a - First 3D vector of decimal strings.
 * @param {readonly [string, string, string]} b - Second 3D vector of decimal strings.
 * @param {number} [precision=20] - Maximum fractional decimal places in the output (non-negative safe integer).
 * @returns {[string, string, string]} The resulting 3D cross product as canonical decimal strings.
 * @throws {TypeError} If `a` or `b` is not an array, any component is not a string, or `precision` is not a number.
 * @throws {RangeError} If `a` or `b` does not have length 3, any component is not a valid decimal string, or `precision` is not a non-negative safe integer.
 */
export function crossProductDecimalIterative(a, b, precision = DEFAULT_PRECISION) {
	if (typeof precision !== 'number') {
		throw new TypeError('precision must be a non-negative safe integer')
	}
	if (!Number.isSafeInteger(precision) || precision < 0) {
		throw new RangeError(`precision must be a non-negative safe integer (received ${precision})`)
	}

	const vecA = parseVector3(a, 'a')
	const vecB = parseVector3(b, 'b')

	const result = new Array(3)
	for (let i = 0; i < 3; i++) {
		const j = (i + 1) % 3
		const k = (i + 2) % 3
		const term1 = mulDecimal(vecA[j], vecB[k])
		const term2 = mulDecimal(vecA[k], vecB[j])
		const component = subDecimal(term1, term2)
		const rounded = roundDecimal(component, precision)
		result[i] = formatDecimal(rounded)
	}

	return result
}
