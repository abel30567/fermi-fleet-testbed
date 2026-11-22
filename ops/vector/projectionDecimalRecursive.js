/**
 * Arbitrary-precision vector projection over decimal strings using a recursive
 * divide-and-conquer implementation backed by BigInt.
 *
 * Computes the orthogonal projection of `vecA` onto `vecB`:
 *
 *   proj_B(A) = ((vecA · vecB) / (vecB · vecB)) * vecB
 *
 * Both dot products (`vecA · vecB` and `vecB · vecB`), vector parsing/alignment,
 * and final vector scaling are evaluated via recursive divide-and-conquer
 * splitting of index ranges `[start, end)`.
 *
 * @module ops/vector/projectionDecimalRecursive
 */

const DECIMAL_PATTERN = /^([+-])?(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/

/**
 * Computes `10n ** BigInt(exp)` via recursive exponentiation by squaring.
 *
 * @param {number} exp - Non-negative integer exponent.
 * @returns {bigint} `10n` raised to `exp`.
 */
function pow10Recursive(exp) {
	if (exp === 0) return 1n
	if (exp === 1) return 10n
	const half = pow10Recursive(Math.floor(exp / 2))
	const squared = half * half
	return exp % 2 === 1 ? squared * 10n : squared
}

/**
 * Parses a decimal string into a canonical scaled BigInt `{ unscaled, scale }`
 * representing `unscaled * 10^(-scale)` with `scale >= 0`.
 *
 * @param {string} value - Decimal string (supports optional sign, decimal point, and scientific notation).
 * @param {string} label - Element label used in error messages.
 * @returns {{ unscaled: bigint, scale: number }}
 */
function parseDecimalString(value, label) {
	if (typeof value !== 'string') {
		throw new TypeError(`${label} must be a decimal string`)
	}
	const trimmed = value.trim()
	const match = DECIMAL_PATTERN.exec(trimmed)
	if (!match) {
		throw new RangeError(`${label} is not a valid decimal string: "${value}"`)
	}

	const negative = match[1] === '-'
	const intPart = match[2] ?? ''
	const fracPart = match[3] ?? match[4] ?? ''
	const exp = match[5] !== undefined ? Number(match[5]) : 0

	if (!Number.isSafeInteger(exp)) {
		throw new RangeError(`${label} has an out-of-range exponent: "${value}"`)
	}

	const rawDigits = intPart + fracPart
	let end = rawDigits.length
	while (end > 0 && rawDigits.charCodeAt(end - 1) === 48) {
		end--
	}

	if (end === 0) {
		return { unscaled: 0n, scale: 0 }
	}

	const trailingZeros = rawDigits.length - end
	const compactDigits = rawDigits.slice(0, end)
	const adjustedScale = fracPart.length - exp - trailingZeros

	let unscaled = BigInt(compactDigits)
	let scale = adjustedScale

	if (adjustedScale < 0) {
		unscaled *= pow10Recursive(-adjustedScale)
		scale = 0
	}

	if (negative) {
		unscaled = -unscaled
	}

	return { unscaled, scale }
}

/**
 * Recursively parses elements of a vector in `[start, end)` using divide-and-conquer
 * and returns the maximum scale observed in the range.
 *
 * @param {string[]} vec - Input array of decimal strings.
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 * @param {Array<{ unscaled: bigint, scale: number }>} parsedOut - Destination array.
 * @param {string} name - Vector name for error messages.
 * @returns {number} Maximum decimal scale in `[start, end)`.
 */
function parseVectorRecursive(vec, start, end, parsedOut, name) {
	if (end - start === 1) {
		const parsed = parseDecimalString(vec[start], `${name}[${start}]`)
		parsedOut[start] = parsed
		return parsed.scale
	}
	const mid = start + Math.floor((end - start) / 2)
	const leftMax = parseVectorRecursive(vec, start, mid, parsedOut, name)
	const rightMax = parseVectorRecursive(vec, mid, end, parsedOut, name)
	return leftMax >= rightMax ? leftMax : rightMax
}

/**
 * Recursively aligns parsed scaled BigInts in `[start, end)` to a common `targetScale`.
 *
 * @param {Array<{ unscaled: bigint, scale: number }>} parsed - Parsed vector entries.
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 * @param {number} targetScale - Target common decimal scale.
 * @param {bigint[]} alignedOut - Destination array of aligned BigInts.
 */
function alignVectorRecursive(parsed, start, end, targetScale, alignedOut) {
	if (end - start === 1) {
		const entry = parsed[start]
		const diff = targetScale - entry.scale
		alignedOut[start] = diff === 0 ? entry.unscaled : entry.unscaled * pow10Recursive(diff)
		return
	}
	const mid = start + Math.floor((end - start) / 2)
	alignVectorRecursive(parsed, start, mid, targetScale, alignedOut)
	alignVectorRecursive(parsed, mid, end, targetScale, alignedOut)
}

/**
 * Computes the dot product of two aligned BigInt slices over `[start, end)`
 * using recursive divide-and-conquer summation.
 *
 * @param {bigint[]} a - First aligned vector.
 * @param {bigint[]} b - Second aligned vector.
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 * @returns {bigint} Sum of `a[i] * b[i]` for `i` in `[start, end)`.
 */
function dotProductRecursive(a, b, start, end) {
	if (end - start === 1) {
		return a[start] * b[start]
	}
	const mid = start + Math.floor((end - start) / 2)
	return dotProductRecursive(a, b, start, mid) + dotProductRecursive(a, b, mid, end)
}

/**
 * Divides `numerator` by strictly positive `denominator` using round-half-away-from-zero.
 *
 * @param {bigint} numerator - Signed numerator.
 * @param {bigint} denominator - Strictly positive denominator.
 * @returns {bigint} Rounded integer quotient.
 */
function divRoundHalfAwayFromZero(numerator, denominator) {
	if (numerator === 0n) return 0n
	const negative = numerator < 0n
	const absNum = negative ? -numerator : numerator
	let quotient = absNum / denominator
	const remainder = absNum % denominator
	if (remainder * 2n >= denominator) {
		quotient += 1n
	}
	return negative ? -quotient : quotient
}

/**
 * Formats a scaled BigInt representing `value * 10^(-precision)` as a canonical
 * decimal string with insignificant trailing fractional zeros removed.
 *
 * @param {bigint} value - Scaled integer value.
 * @param {number} precision - Number of fractional decimal places represented by `value`.
 * @returns {string} Canonical decimal string (never `"-0"`).
 */
function formatScaledBigInt(value, precision) {
	if (value === 0n) return '0'
	const negative = value < 0n
	const digits = (negative ? -value : value).toString()

	if (precision === 0) {
		return negative ? `-${digits}` : digits
	}

	let intPart
	let fracPart
	if (digits.length <= precision) {
		intPart = '0'
		fracPart = digits.padStart(precision, '0')
	} else {
		const split = digits.length - precision
		intPart = digits.slice(0, split)
		fracPart = digits.slice(split)
	}

	let end = fracPart.length
	while (end > 0 && fracPart.charCodeAt(end - 1) === 48) {
		end--
	}
	const trimmedFrac = fracPart.slice(0, end)
	const formatted = trimmedFrac.length > 0 ? `${intPart}.${trimmedFrac}` : intPart
	return negative ? `-${formatted}` : formatted
}

/**
 * Recursively scales `alignedB[start..end)` by the exact rational factor
 * `scalarNumerator / denScaled` and formats each resulting component to
 * `precision` fractional decimal places.
 *
 * @param {bigint[]} alignedB - Aligned BigInt components of `vecB`.
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 * @param {bigint} scalarNumerator - Pre-scaled scalar numerator (`dotAB * 10^max(0, precision - scaleA)`).
 * @param {bigint} denScaled - Pre-scaled denominator (`dotBB * 10^max(0, scaleA - precision)`).
 * @param {number} precision - Maximum fractional digits in formatted output.
 * @param {string[]} resultOut - Destination array of formatted decimal strings.
 */
function scaleVectorRecursive(alignedB, start, end, scalarNumerator, denScaled, precision, resultOut) {
	if (end - start === 1) {
		const rounded = divRoundHalfAwayFromZero(scalarNumerator * alignedB[start], denScaled)
		resultOut[start] = formatScaledBigInt(rounded, precision)
		return
	}
	const mid = start + Math.floor((end - start) / 2)
	scaleVectorRecursive(alignedB, start, mid, scalarNumerator, denScaled, precision, resultOut)
	scaleVectorRecursive(alignedB, mid, end, scalarNumerator, denScaled, precision, resultOut)
}

/**
 * Projects `vecA` onto `vecB` over arbitrary-precision decimal strings using a
 * recursive divide-and-conquer strategy backed by `BigInt`.
 *
 * Computes `((vecA · vecB) / (vecB · vecB)) * vecB` in exact rational BigInt
 * arithmetic and performs a single round-half-away-from-zero step per output
 * component to `precision` fractional decimal digits (with trailing fractional
 * zeros trimmed).
 *
 * @param {string[]} vecA - Non-empty array of decimal strings representing the vector to project.
 * @param {string[]} vecB - Non-empty array of decimal strings of equal length representing the target direction (must not be the zero vector).
 * @param {number} [precision=20] - Non-negative integer specifying maximum fractional decimal digits in each output component.
 * @returns {string[]} Projected vector as an array of canonical decimal strings.
 * @throws {TypeError} If `vecA` or `vecB` is not an array, contains non-string elements, or `precision` is not a number.
 * @throws {RangeError} If vectors are empty, differ in length, contain invalid decimal strings, `precision` is not a non-negative safe integer, or `vecB` is the zero vector.
 */
export function projectionDecimalRecursive(vecA, vecB, precision = 20) {
	if (!Array.isArray(vecA) || !Array.isArray(vecB)) {
		throw new TypeError('vecA and vecB must be arrays of decimal strings')
	}
	if (vecA.length === 0 || vecB.length === 0) {
		throw new RangeError('vecA and vecB must be non-empty arrays')
	}
	if (vecA.length !== vecB.length) {
		throw new RangeError(`vecA and vecB must have equal length (got ${vecA.length} and ${vecB.length})`)
	}
	if (typeof precision !== 'number') {
		throw new TypeError('precision must be a non-negative safe integer')
	}
	if (!Number.isSafeInteger(precision) || precision < 0) {
		throw new RangeError('precision must be a non-negative safe integer')
	}

	const n = vecA.length
	const parsedA = new Array(n)
	const parsedB = new Array(n)

	const scaleA = parseVectorRecursive(vecA, 0, n, parsedA, 'vecA')
	const scaleB = parseVectorRecursive(vecB, 0, n, parsedB, 'vecB')

	const alignedA = new Array(n)
	const alignedB = new Array(n)
	alignVectorRecursive(parsedA, 0, n, scaleA, alignedA)
	alignVectorRecursive(parsedB, 0, n, scaleB, alignedB)

	const dotBB = dotProductRecursive(alignedB, alignedB, 0, n)
	if (dotBB === 0n) {
		throw new RangeError('vecB must not be the zero vector')
	}

	const dotAB = dotProductRecursive(alignedA, alignedB, 0, n)

	// Exact component formula:
	//   A_i = a_i * 10^scaleA,  B_i = b_i * 10^scaleB
	//   dotAB = (vecA · vecB) * 10^(scaleA + scaleB)
	//   dotBB = (vecB · vecB) * 10^(2 * scaleB)
	//   proj_i * 10^precision = (dotAB * B_i * 10^precision) / (dotBB * 10^scaleA)
	let scalarNumerator
	let denScaled
	if (precision >= scaleA) {
		scalarNumerator = dotAB * pow10Recursive(precision - scaleA)
		denScaled = dotBB
	} else {
		scalarNumerator = dotAB
		denScaled = dotBB * pow10Recursive(scaleA - precision)
	}

	const result = new Array(n)
	scaleVectorRecursive(alignedB, 0, n, scalarNumerator, denScaled, precision, result)
	return result
}
