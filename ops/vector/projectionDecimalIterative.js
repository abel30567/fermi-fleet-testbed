const DECIMAL_REGEX = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/

/**
 * Parse a strict decimal string into an exact normalized BigInt mantissa and base-10 exponent,
 * representing the exact value `coeff * 10^exp`.
 *
 * @param {string} value - Decimal string (optional sign, integer/fractional digits, optional exponent).
 * @param {string} label - Descriptive label for error messages.
 * @returns {{ coeff: bigint, exp: number }}
 */
function parseDecimal(value, label) {
	if (typeof value !== 'string') {
		throw new TypeError(`${label} must be a decimal string`)
	}

	const match = DECIMAL_REGEX.exec(value)
	if (!match) {
		throw new RangeError(`${label} is not a valid decimal string: "${value}"`)
	}

	const signStr = match[1]
	const intPart = match[2] || ''
	const fracPart = match[3] || match[4] || ''
	const expStr = match[5]

	let sciExp = 0
	if (expStr !== undefined) {
		sciExp = Number(expStr)
		if (!Number.isSafeInteger(sciExp)) {
			throw new RangeError(`${label} has an out-of-range exponent: "${value}"`)
		}
	}

	const rawDigits = intPart + fracPart
	let end = rawDigits.length
	while (end > 0 && rawDigits.charCodeAt(end - 1) === 48) {
		end -= 1
	}

	if (end === 0) {
		return { coeff: 0n, exp: 0 }
	}

	const trimmedDigits = rawDigits.slice(0, end)
	const trailingZeros = rawDigits.length - end
	const exp = sciExp - fracPart.length + trailingZeros

	if (!Number.isSafeInteger(exp)) {
		throw new RangeError(`${label} exponent overflow: "${value}"`)
	}

	let coeff = BigInt(trimmedDigits)
	if (signStr === '-') {
		coeff = -coeff
	}

	return { coeff, exp }
}

/**
 * Validate and parse a non-empty array of decimal strings into exact scaled BigInt terms.
 *
 * @param {unknown} vec - Input vector to validate.
 * @param {string} name - Parameter name for error reporting.
 * @returns {Array<{ coeff: bigint, exp: number }>}
 */
function parseVector(vec, name) {
	if (!Array.isArray(vec)) {
		throw new TypeError(`Vector ${name} must be an array of decimal strings`)
	}
	if (vec.length === 0) {
		throw new RangeError(`Vector ${name} must not be empty`)
	}

	const parsed = new Array(vec.length)
	for (let i = 0; i < vec.length; i += 1) {
		parsed[i] = parseDecimal(vec[i], `${name}[${i}]`)
	}
	return parsed
}

/**
 * Compute an exact dot product of two parsed vectors as `{ coeff, exp }` representing `coeff * 10^exp`.
 *
 * @param {Array<{ coeff: bigint, exp: number }>} u
 * @param {Array<{ coeff: bigint, exp: number }>} v
 * @returns {{ coeff: bigint, exp: number }}
 */
function exactDotProduct(u, v) {
	let minExp = Infinity
	const products = new Array(u.length)

	for (let i = 0; i < u.length; i += 1) {
		const coeff = u[i].coeff * v[i].coeff
		if (coeff === 0n) {
			products[i] = null
			continue
		}
		const exp = u[i].exp + v[i].exp
		products[i] = { coeff, exp }
		if (exp < minExp) {
			minExp = exp
		}
	}

	if (minExp === Infinity) {
		return { coeff: 0n, exp: 0 }
	}

	let sum = 0n
	for (let i = 0; i < products.length; i += 1) {
		const term = products[i]
		if (term === null) {
			continue
		}
		const shift = term.exp - minExp
		sum += shift === 0 ? term.coeff : term.coeff * (10n ** BigInt(shift))
	}

	if (sum === 0n) {
		return { coeff: 0n, exp: 0 }
	}

	return { coeff: sum, exp: minExp }
}

/**
 * Format a rational value `(num / den) * 10^exp` (with `den > 0n`) rounded half-away-from-zero
 * to `precision` fractional digits, returning a normalized decimal string (no `-0`, no trailing
 * fractional zeros).
 *
 * @param {bigint} num - Signed numerator.
 * @param {bigint} den - Strictly positive denominator.
 * @param {number} exp - Base-10 exponent multiplier.
 * @param {number} precision - Non-negative integer number of decimal places.
 * @returns {string}
 */
function formatRoundedRational(num, den, exp, precision) {
	if (num === 0n) {
		return '0'
	}

	const isNegative = num < 0n
	const absNum = isNegative ? -num : num
	const scaleShift = exp + precision

	let scaledNum = absNum
	let scaledDen = den
	if (scaleShift > 0) {
		scaledNum = absNum * (10n ** BigInt(scaleShift))
	} else if (scaleShift < 0) {
		scaledDen = den * (10n ** BigInt(-scaleShift))
	}

	let quotient = scaledNum / scaledDen
	const remainder = scaledNum % scaledDen

	// Round half away from zero
	if (remainder * 2n >= scaledDen) {
		quotient += 1n
	}

	if (quotient === 0n) {
		return '0'
	}

	const sign = isNegative ? '-' : ''
	const digits = quotient.toString()

	if (precision === 0) {
		return sign + digits
	}

	const padded = digits.length <= precision ? digits.padStart(precision + 1, '0') : digits
	const splitIndex = padded.length - precision
	const intPart = padded.slice(0, splitIndex)
	let fracPart = padded.slice(splitIndex)

	// Strip trailing zeros for clean normalized decimal output
	let fracEnd = fracPart.length
	while (fracEnd > 0 && fracPart.charCodeAt(fracEnd - 1) === 48) {
		fracEnd -= 1
	}

	if (fracEnd === 0) {
		return sign + intPart
	}

	fracPart = fracPart.slice(0, fracEnd)
	return `${sign}${intPart}.${fracPart}`
}

/**
 * Compute the orthogonal projection of vector `a` onto vector `b` over arbitrary-precision
 * decimal strings:
 *
 *   proj_b(a) = ((a · b) / (b · b)) * b
 *
 * Uses exact BigInt arithmetic for the dot products `a · b` and `b · b` and performs a single
 * high-precision BigInt division per output component, rounded half-away-from-zero to
 * `precision` fractional digits. Output components are normalized decimal strings with no
 * trailing fractional zeros and no `-0`.
 *
 * @param {string[]} a - Non-empty array of decimal strings representing the vector to project.
 * @param {string[]} b - Non-empty array of decimal strings representing the non-zero target vector.
 * @param {number} [precision=20] - Non-negative integer number of decimal places for rounding.
 * @returns {string[]} Projected vector as an array of normalized decimal strings.
 * @throws {TypeError} If `a` or `b` is not an array, contains non-string elements, or `precision` is not a number.
 * @throws {RangeError} If `a` or `b` is empty, lengths differ, elements are invalid decimal strings,
 *   `b` is the zero vector, or `precision` is not a non-negative safe integer.
 */
export function projectionDecimalIterative(a, b, precision = 20) {
	if (typeof precision !== 'number') {
		throw new TypeError('Precision must be a non-negative integer')
	}
	if (!Number.isSafeInteger(precision) || precision < 0) {
		throw new RangeError('Precision must be a non-negative safe integer')
	}

	const parsedA = parseVector(a, 'a')
	const parsedB = parseVector(b, 'b')

	if (parsedA.length !== parsedB.length) {
		throw new RangeError(
			`Vectors a and b must have equal length (got ${parsedA.length} and ${parsedB.length})`,
		)
	}

	const dotBB = exactDotProduct(parsedB, parsedB)
	if (dotBB.coeff === 0n) {
		throw new RangeError('Target vector b must not be the zero vector')
	}

	const dotAB = exactDotProduct(parsedA, parsedB)
	const result = new Array(parsedA.length)

	if (dotAB.coeff === 0n) {
		for (let i = 0; i < parsedA.length; i += 1) {
			result[i] = '0'
		}
		return result
	}

	const baseExp = dotAB.exp - dotBB.exp

	for (let i = 0; i < parsedB.length; i += 1) {
		const bi = parsedB[i]
		if (bi.coeff === 0n) {
			result[i] = '0'
			continue
		}
		const num = dotAB.coeff * bi.coeff
		const exp = baseExp + bi.exp
		result[i] = formatRoundedRational(num, dotBB.coeff, exp, precision)
	}

	return result
}
