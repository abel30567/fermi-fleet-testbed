/**
 * Arbitrary-precision decimal nth root using BigInt and a recursive /
 * divide-and-conquer algorithm (recursive precision-doubling Newton-Raphson
 * combined with recursive exponentiation by squaring).
 *
 * @module ops/powers-roots/nthRootDecimalRecursive
 */

const DECIMAL_RE = /^([+-])?(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/

/**
 * Computes the bit length of a non-negative BigInt.
 *
 * @param {bigint} value - Non-negative integer.
 * @returns {number} Number of bits required to represent `value` (0 for 0n).
 */
function bitLength(value) {
	if (value === 0n) return 0
	const hex = value.toString(16)
	const leadingBits = 32 - Math.clz32(parseInt(hex[0], 16))
	return (hex.length - 1) * 4 + leadingBits
}

/**
 * Computes `base ** exp` for BigInt values using recursive exponentiation by
 * squaring.
 *
 * @param {bigint} base - Base integer.
 * @param {bigint} exp - Non-negative integer exponent.
 * @returns {bigint} Exact power `base ** exp`.
 */
function powBigInt(base, exp) {
	if (exp === 0n) return 1n
	if (exp === 1n) return base
	const half = powBigInt(base, exp >> 1n)
	const squared = half * half
	return (exp & 1n) === 1n ? squared * base : squared
}

/**
 * Recursive binary search for the exact integer floor of `target ** (1 / n)`
 * within the inclusive interval `[lo, hi]`.
 *
 * @param {bigint} target - Positive radicand.
 * @param {bigint} n - Positive integer root degree (`n >= 2n`).
 * @param {bigint} lo - Lower bound satisfying `lo ** n <= target`.
 * @param {bigint} hi - Upper bound satisfying `(hi + 1n) ** n > target`.
 * @returns {bigint} Exact `floor(target ** (1 / n))`.
 */
function binarySearchRoot(target, n, lo, hi) {
	if (lo === hi) return lo
	const mid = (lo + hi + 1n) >> 1n
	if (powBigInt(mid, n) <= target) {
		return binarySearchRoot(target, n, mid, hi)
	}
	return binarySearchRoot(target, n, lo, mid - 1n)
}

/**
 * Recursively refines an integer upper-bound estimate `x >= floor(target ** (1 / n))`
 * using integer Newton-Raphson iterations until exact convergence to
 * `floor(target ** (1 / n))`.
 *
 * @param {bigint} target - Positive radicand.
 * @param {bigint} n - Positive integer root degree (`n >= 2n`).
 * @param {bigint} x - Current upper-bound estimate.
 * @returns {bigint} Exact `floor(target ** (1 / n))`.
 */
function newtonRefine(target, n, x) {
	const xNext = ((n - 1n) * x + target / powBigInt(x, n - 1n)) / n
	if (xNext >= x) return x
	return newtonRefine(target, n, xNext)
}

/**
 * Computes the exact integer floor `floor(target ** (1 / n))` using recursive
 * precision-doubling Newton-Raphson (divide-and-conquer over root bit length).
 *
 * @param {bigint} target - Non-negative integer radicand.
 * @param {bigint} n - Positive integer root degree.
 * @returns {bigint} Exact `floor(target ** (1 / n))`.
 */
function integerNthRootRecursive(target, n) {
	if (target === 0n) return 0n
	if (n === 1n) return target

	const bits = bitLength(target)
	if (BigInt(bits) <= n) return 1n

	const nNum = Number(n)
	const rootBits = Math.ceil(bits / nNum)
	const baseBits = Math.max(26, 3 * bitLength(n) + 4)

	if (rootBits <= baseBits) {
		const lo = 1n << BigInt(rootBits - 1)
		const hi = (1n << BigInt(rootBits)) - 1n
		return binarySearchRoot(target, n, lo, hi)
	}

	const halfBits = rootBits >> 1
	const shift = BigInt(halfBits) * n
	const highRoot = integerNthRootRecursive(target >> shift, n)
	const initialUpper = (highRoot + 1n) << BigInt(halfBits)

	return newtonRefine(target, n, initialUpper)
}

/**
 * Parses and validates a decimal input into `{ negative, mantissa, exponent }`
 * such that `value = (negative ? -1 : 1) * mantissa * 10 ** exponent`.
 *
 * @param {string | number | bigint} value - Decimal string, finite number, or BigInt.
 * @returns {{ negative: boolean, mantissa: bigint, exponent: bigint }} Normalized decimal parts.
 */
function parseDecimal(value) {
	let raw
	if (typeof value === 'string') {
		raw = value.trim()
	} else if (typeof value === 'bigint') {
		raw = value.toString()
	} else if (typeof value === 'number') {
		if (!Number.isFinite(value)) {
			throw new RangeError('value must be a finite decimal number or string')
		}
		raw = String(value)
	} else {
		throw new TypeError('value must be a decimal string, finite number, or BigInt')
	}

	const match = DECIMAL_RE.exec(raw)
	if (!match) {
		throw new RangeError(`Invalid decimal value: "${value}"`)
	}

	const [, signStr, intPart, fracPartA, fracPartB, expStr] = match
	const fracPart = fracPartA ?? fracPartB ?? ''
	const digits = `${intPart ?? ''}${fracPart}`.replace(/^0+/, '')

	if (digits.length === 0) {
		return { negative: false, mantissa: 0n, exponent: 0n }
	}

	const trimmedDigits = digits.replace(/0+$/, '')
	const trailingZeros = BigInt(digits.length - trimmedDigits.length)
	const baseExp = expStr ? BigInt(expStr) : 0n
	const exponent = baseExp - BigInt(fracPart.length) + trailingZeros

	return {
		negative: signStr === '-',
		mantissa: BigInt(trimmedDigits),
		exponent,
	}
}

/**
 * Validates and normalizes the root degree `n`.
 *
 * @param {number | bigint} n - Root degree (must be a positive integer).
 * @returns {bigint} Validated root degree as a BigInt.
 */
function validateDegree(n) {
	if (typeof n === 'bigint') {
		if (n < 1n) {
			throw new RangeError('Root degree n must be a positive integer')
		}
		return n
	}
	if (typeof n === 'number') {
		if (!Number.isSafeInteger(n) || n < 1) {
			throw new RangeError('Root degree n must be a positive integer')
		}
		return BigInt(n)
	}
	throw new TypeError('Root degree n must be a positive integer')
}

/**
 * Validates the fractional decimal precision argument.
 *
 * @param {number} precision - Non-negative integer number of decimal places.
 * @returns {number} Validated precision.
 */
function validatePrecision(precision) {
	if (typeof precision !== 'number') {
		throw new TypeError('precision must be a non-negative integer')
	}
	if (!Number.isSafeInteger(precision) || precision < 0) {
		throw new RangeError('precision must be a non-negative integer')
	}
	return precision
}

/**
 * Formats a scaled non-negative BigInt with `precision` fractional digits,
 * trimming trailing fractional zeros and avoiding "-0".
 *
 * @param {bigint} scaled - Non-negative integer equal to `round(|root| * 10 ** precision)`.
 * @param {number} precision - Number of fractional decimal places.
 * @param {boolean} negative - Whether the root is negative.
 * @returns {string} Canonical decimal string representation.
 */
function formatDecimal(scaled, precision, negative) {
	if (scaled === 0n) return '0'
	const prefix = negative ? '-' : ''
	if (precision === 0) return `${prefix}${scaled.toString()}`

	const digits = scaled.toString().padStart(precision + 1, '0')
	const splitIndex = digits.length - precision
	const intPart = digits.slice(0, splitIndex)
	const fracPart = digits.slice(splitIndex).replace(/0+$/, '')

	return fracPart.length > 0 ? `${prefix}${intPart}.${fracPart}` : `${prefix}${intPart}`
}

/**
 * Computes the real `n`-th root of an arbitrary-precision decimal value to
 * `precision` fractional decimal places (rounded half-up) using BigInt
 * arithmetic, recursive precision-doubling Newton-Raphson, and recursive
 * exponentiation by squaring.
 *
 * - Odd roots of negative numbers are supported and return a negative decimal string.
 * - Even roots of negative numbers throw a `RangeError`.
 * - Trailing fractional zeros are stripped from the returned decimal string.
 *
 * @param {string | number | bigint} value - Radicand as a decimal string (or finite number / BigInt).
 * @param {number | bigint} n - Positive integer root degree (`n >= 1`).
 * @param {number} [precision=20] - Non-negative integer number of fractional decimal places.
 * @returns {string} Decimal string representation of `value ** (1 / n)` rounded to `precision` decimal places.
 * @throws {TypeError} If `value`, `n`, or `precision` has an invalid type.
 * @throws {RangeError} If `value` is not a valid finite decimal, `n` is not a positive integer, `precision` is negative or non-integer, or `n` is even while `value < 0`.
 */
export function nthRootDecimalRecursive(value, n, precision = 20) {
	const degree = validateDegree(n)
	const scale = validatePrecision(precision)
	const { negative, mantissa, exponent } = parseDecimal(value)

	if (mantissa === 0n) {
		return '0'
	}

	if (negative && (degree & 1n) === 0n) {
		throw new RangeError('Cannot compute an even root of a negative number')
	}

	const mantissaDigits = BigInt(mantissa.toString().length)
	if (mantissaDigits + exponent <= -degree * BigInt(scale + 1)) {
		return '0'
	}

	const shift = exponent + degree * BigInt(scale)
	const twoPowN = 1n << degree

	let rounded
	if (shift >= 0n) {
		const scaledRadicand = mantissa * powBigInt(10n, shift)
		const floorRoot = integerNthRootRecursive(scaledRadicand, degree)
		const halfBound = powBigInt(2n * floorRoot + 1n, degree)
		rounded = scaledRadicand * twoPowN >= halfBound ? floorRoot + 1n : floorRoot
	} else {
		const denominator = powBigInt(10n, -shift)
		const floorRadicand = mantissa / denominator
		const floorRoot = integerNthRootRecursive(floorRadicand, degree)
		const halfBound = denominator * powBigInt(2n * floorRoot + 1n, degree)
		rounded = mantissa * twoPowN >= halfBound ? floorRoot + 1n : floorRoot
	}

	return formatDecimal(rounded, scale, negative)
}
