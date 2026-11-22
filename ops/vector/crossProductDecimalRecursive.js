/**
 * Arbitrary-precision 3D vector cross product over decimal strings using a
 * recursive / divide-and-conquer implementation (divide-and-conquer component
 * evaluation, recursive Karatsuba BigInt multiplication, and recursive
 * exponentiation by squaring for powers of ten).
 *
 * @module ops/vector/crossProductDecimalRecursive
 */

const DECIMAL_PATTERN = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/
const KARATSUBA_BIT_THRESHOLD = 32

/**
 * Compute the exact bit length of a non-negative BigInt.
 *
 * @param {bigint} value - Non-negative BigInt value.
 * @returns {number} Bit length (0 for 0n).
 */
function bitLength(value) {
	if (value === 0n) return 0
	const hex = value.toString(16)
	const leadingBits = 32 - Math.clz32(parseInt(hex[0], 16))
	return (hex.length - 1) * 4 + leadingBits
}

/**
 * Multiply two non-negative BigInts using recursive Karatsuba divide-and-conquer.
 *
 * @param {bigint} x - Non-negative multiplicand.
 * @param {bigint} y - Non-negative multiplier.
 * @returns {bigint} Exact product x * y.
 */
function karatsubaMultiply(x, y) {
	if (x === 0n || y === 0n) return 0n

	const maxBits = Math.max(bitLength(x), bitLength(y))
	if (maxBits <= KARATSUBA_BIT_THRESHOLD) {
		return x * y
	}

	const half = BigInt(maxBits >> 1)
	const mask = (1n << half) - 1n

	const xHigh = x >> half
	const xLow = x & mask
	const yHigh = y >> half
	const yLow = y & mask

	const z0 = karatsubaMultiply(xLow, yLow)
	const z2 = karatsubaMultiply(xHigh, yHigh)
	const z1 = karatsubaMultiply(xLow + xHigh, yLow + yHigh) - z2 - z0

	return (z2 << (half << 1n)) + (z1 << half) + z0
}

/**
 * Signed wrapper around recursive Karatsuba BigInt multiplication.
 *
 * @param {bigint} a - First signed BigInt operand.
 * @param {bigint} b - Second signed BigInt operand.
 * @returns {bigint} Exact signed product a * b.
 */
function multiplyBigIntRecursive(a, b) {
	if (a === 0n || b === 0n) return 0n
	const negative = (a < 0n) !== (b < 0n)
	const absA = a < 0n ? -a : a
	const absB = b < 0n ? -b : b
	const product = karatsubaMultiply(absA, absB)
	return negative ? -product : product
}

/**
 * Compute 10^exponent as a BigInt via recursive exponentiation by squaring.
 *
 * @param {number} exponent - Non-negative integer exponent.
 * @returns {bigint} Exact value of 10^exponent.
 */
function pow10Recursive(exponent) {
	if (exponent === 0) return 1n
	if (exponent === 1) return 10n
	const half = pow10Recursive(exponent >> 1)
	const squared = karatsubaMultiply(half, half)
	return (exponent & 1) === 1 ? karatsubaMultiply(squared, 10n) : squared
}

/**
 * Parse and validate a single decimal string into a scaled BigInt.
 *
 * @param {unknown} raw - Value to parse.
 * @param {string} label - Descriptive label for error messages.
 * @returns {{ unscaled: bigint, scale: number }} Scaled decimal representation.
 */
function parseDecimal(raw, label) {
	if (typeof raw !== 'string') {
		throw new TypeError(`${label} must be a decimal string`)
	}
	if (!DECIMAL_PATTERN.test(raw)) {
		throw new RangeError(`${label} is not a valid decimal string: "${raw}"`)
	}

	let negative = false
	let body = raw
	if (body[0] === '-') {
		negative = true
		body = body.slice(1)
	} else if (body[0] === '+') {
		body = body.slice(1)
	}

	const dotIndex = body.indexOf('.')
	let digits
	let scale
	if (dotIndex === -1) {
		digits = body
		scale = 0
	} else {
		const intPart = body.slice(0, dotIndex)
		const fracPart = body.slice(dotIndex + 1)
		digits = intPart + fracPart
		scale = fracPart.length
	}

	const magnitude = BigInt(digits)
	if (magnitude === 0n) {
		return { unscaled: 0n, scale: 0 }
	}
	return {
		unscaled: negative ? -magnitude : magnitude,
		scale,
	}
}

/**
 * Validate and parse a 3D vector of decimal strings recursively.
 *
 * @param {unknown} vec - Input vector.
 * @param {string} name - Parameter name for error messages.
 * @returns {Array<{ unscaled: bigint, scale: number }>} Parsed 3-element vector.
 */
function parseVector(vec, name) {
	if (!Array.isArray(vec)) {
		throw new TypeError(`${name} must be an array of 3 decimal strings`)
	}
	if (vec.length !== 3) {
		throw new RangeError(`${name} must have length 3, received length ${vec.length}`)
	}

	function parseRange(start, end) {
		if (end - start === 1) {
			return [parseDecimal(vec[start], `${name}[${start}]`)]
		}
		const mid = (start + end) >> 1
		return [...parseRange(start, mid), ...parseRange(mid, end)]
	}

	return parseRange(0, 3)
}

/**
 * Multiply two scaled decimals using recursive Karatsuba multiplication.
 *
 * @param {{ unscaled: bigint, scale: number }} a - First decimal.
 * @param {{ unscaled: bigint, scale: number }} b - Second decimal.
 * @returns {{ unscaled: bigint, scale: number }} Exact product.
 */
function multiplyDecimals(a, b) {
	const unscaled = multiplyBigIntRecursive(a.unscaled, b.unscaled)
	if (unscaled === 0n) {
		return { unscaled: 0n, scale: 0 }
	}
	return { unscaled, scale: a.scale + b.scale }
}

/**
 * Subtract two scaled decimals (a - b) using recursive power-of-ten scaling.
 *
 * @param {{ unscaled: bigint, scale: number }} a - Minuend.
 * @param {{ unscaled: bigint, scale: number }} b - Subtrahend.
 * @returns {{ unscaled: bigint, scale: number }} Exact difference.
 */
function subtractDecimals(a, b) {
	if (a.scale === b.scale) {
		const diff = a.unscaled - b.unscaled
		return diff === 0n ? { unscaled: 0n, scale: 0 } : { unscaled: diff, scale: a.scale }
	}
	if (a.scale > b.scale) {
		const factor = pow10Recursive(a.scale - b.scale)
		const diff = a.unscaled - multiplyBigIntRecursive(b.unscaled, factor)
		return diff === 0n ? { unscaled: 0n, scale: 0 } : { unscaled: diff, scale: a.scale }
	}
	const factor = pow10Recursive(b.scale - a.scale)
	const diff = multiplyBigIntRecursive(a.unscaled, factor) - b.unscaled
	return diff === 0n ? { unscaled: 0n, scale: 0 } : { unscaled: diff, scale: b.scale }
}

/**
 * Round (half away from zero) and format a scaled decimal to at most
 * `precision` fractional digits, stripping trailing fractional zeros and
 * normalizing negative zero to "0".
 *
 * @param {{ unscaled: bigint, scale: number }} decimal - Scaled decimal value.
 * @param {number} precision - Maximum fractional decimal places (>= 0).
 * @returns {string} Canonical decimal string.
 */
function formatDecimal(decimal, precision) {
	if (decimal.unscaled === 0n) return '0'

	const negative = decimal.unscaled < 0n
	let absVal = negative ? -decimal.unscaled : decimal.unscaled
	let targetScale = decimal.scale

	if (targetScale > precision) {
		const divisor = pow10Recursive(targetScale - precision)
		let quotient = absVal / divisor
		const remainder = absVal % divisor
		if ((remainder << 1n) >= divisor) {
			quotient += 1n
		}
		absVal = quotient
		targetScale = precision
	}

	if (absVal === 0n) return '0'

	const digits = absVal.toString()
	const sign = negative ? '-' : ''

	if (targetScale === 0) {
		return sign + digits
	}

	let intPart
	let fracPart
	if (digits.length <= targetScale) {
		intPart = '0'
		fracPart = '0'.repeat(targetScale - digits.length) + digits
	} else {
		const splitAt = digits.length - targetScale
		intPart = digits.slice(0, splitAt)
		fracPart = digits.slice(splitAt)
	}

	fracPart = fracPart.replace(/0+$/, '')
	if (fracPart.length === 0) {
		return sign + intPart
	}
	return `${sign}${intPart}.${fracPart}`
}

/**
 * Recursively compute cross product components over index range [start, end).
 *
 * @param {Array<{ unscaled: bigint, scale: number }>} a - Parsed vector A.
 * @param {Array<{ unscaled: bigint, scale: number }>} b - Parsed vector B.
 * @param {number} start - Inclusive start component index.
 * @param {number} end - Exclusive end component index.
 * @param {number} precision - Maximum fractional decimal places.
 * @returns {string[]} Formatted cross product components for [start, end).
 */
function computeComponentsRecursive(a, b, start, end, precision) {
	if (end - start === 1) {
		const i = start
		const j = (i + 1) % 3
		const k = (i + 2) % 3
		const term1 = multiplyDecimals(a[j], b[k])
		const term2 = multiplyDecimals(a[k], b[j])
		const component = subtractDecimals(term1, term2)
		return [formatDecimal(component, precision)]
	}

	const mid = (start + end) >> 1
	return [
		...computeComponentsRecursive(a, b, start, mid, precision),
		...computeComponentsRecursive(a, b, mid, end, precision),
	]
}

/**
 * Compute the 3D vector cross product of two arbitrary-precision decimal string
 * vectors using a recursive / divide-and-conquer implementation.
 *
 * Each component is computed as:
 *   c[0] = vecA[1] * vecB[2] - vecA[2] * vecB[1]
 *   c[1] = vecA[2] * vecB[0] - vecA[0] * vecB[2]
 *   c[2] = vecA[0] * vecB[1] - vecA[1] * vecB[0]
 *
 * Results are rounded half-away-from-zero to at most `precision` fractional
 * decimal places with trailing fractional zeros removed.
 *
 * @param {string[]} vecA - Length-3 array of valid decimal strings.
 * @param {string[]} vecB - Length-3 array of valid decimal strings.
 * @param {number} [precision=20] - Maximum number of fractional decimal places (non-negative integer).
 * @returns {string[]} Length-3 array of decimal strings representing vecA x vecB.
 * @throws {TypeError} If vecA or vecB is not an array, any element is not a string, or precision is not a number.
 * @throws {RangeError} If vecA or vecB does not have length 3, any element is not a valid decimal string, or precision is negative or not an integer.
 */
export function crossProductDecimalRecursive(vecA, vecB, precision = 20) {
	if (typeof precision !== 'number') {
		throw new TypeError('precision must be a non-negative integer')
	}
	if (!Number.isInteger(precision) || precision < 0) {
		throw new RangeError(`precision must be a non-negative integer, received ${precision}`)
	}

	const parsedA = parseVector(vecA, 'vecA')
	const parsedB = parseVector(vecB, 'vecB')

	return computeComponentsRecursive(parsedA, parsedB, 0, 3, precision)
}
