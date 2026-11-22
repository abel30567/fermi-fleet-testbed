const DECIMAL_RE = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/

/**
 * Returns the number of significant bits in a positive BigInt.
 *
 * @param {bigint} n - Positive BigInt value.
 * @returns {number} Bit length of `n`.
 */
function bitLength(n) {
	const hex = n.toString(16)
	const leadingBits = 32 - Math.clz32(parseInt(hex[0], 16))
	return (hex.length - 1) * 4 + leadingBits
}

/**
 * Computes `10n ** BigInt(exp)` for a non-negative integer exponent.
 *
 * @param {number} exp - Non-negative integer exponent.
 * @returns {bigint} Power of ten as a BigInt.
 */
function pow10(exp) {
	return 10n ** BigInt(exp)
}

/**
 * Computes the exact integer square root `floor(sqrt(n))` using a recursive
 * precision-doubling Newton-Raphson algorithm.
 *
 * Given an `m`-bit target root, recursively solves the upper half-precision
 * subproblem on `n >> (2 * k)` (`k = floor(m / 2)`), scales the result up by
 * `2^k`, and performs a single Newton refinement step. Because the initial
 * error is strictly less than `2^k`, one Newton step yields either the exact
 * floor root or `floor(sqrt(n)) + 1`, resolved by a single square comparison.
 *
 * @param {bigint} n - Non-negative BigInt radicand.
 * @returns {bigint} Exact integer square root `floor(sqrt(n))`.
 */
function isqrtRecursive(n) {
	if (n === 0n) return 0n
	if (n < 4n) return 1n

	const bits = bitLength(n)
	const rootBits = (bits + 1) >>> 1
	const shift = rootBits >>> 1

	const highRoot = isqrtRecursive(n >> BigInt(shift * 2))
	const x0 = highRoot << BigInt(shift)
	const x1 = (x0 + n / x0) >> 1n

	return x1 * x1 > n ? x1 - 1n : x1
}

/**
 * Parses and validates a decimal string into a normalized `{ mantissa, exp }`
 * representation representing `mantissa * 10^exp`.
 *
 * @param {unknown} value - Candidate vector element.
 * @param {number} index - Element index for error reporting.
 * @returns {{ mantissa: bigint, exp: number }} Normalized decimal representation.
 */
function parseDecimal(value, index) {
	if (typeof value !== 'string') {
		throw new TypeError(`Vector element at index ${index} must be a decimal string`)
	}
	if (!DECIMAL_RE.test(value)) {
		throw new RangeError(`Vector element at index ${index} is not a valid decimal string: "${value}"`)
	}

	let expPart = 0
	let coeff = value
	const eIdx = value.search(/[eE]/)
	if (eIdx !== -1) {
		coeff = value.slice(0, eIdx)
		const parsedExp = Number(value.slice(eIdx + 1))
		if (!Number.isSafeInteger(parsedExp)) {
			throw new RangeError(`Exponent out of safe integer range at index ${index}: "${value}"`)
		}
		expPart = parsedExp
	}

	let sign = ''
	if (coeff[0] === '+' || coeff[0] === '-') {
		sign = coeff[0] === '-' ? '-' : ''
		coeff = coeff.slice(1)
	}

	let digits
	let fracLen = 0
	const dotIdx = coeff.indexOf('.')
	if (dotIdx !== -1) {
		const intPart = coeff.slice(0, dotIdx)
		const fracPart = coeff.slice(dotIdx + 1)
		digits = intPart + fracPart
		fracLen = fracPart.length
	} else {
		digits = coeff
	}

	const rawMantissa = BigInt(sign + digits)
	if (rawMantissa === 0n) {
		return { mantissa: 0n, exp: 0 }
	}

	const trimmed = digits.replace(/0+$/, '')
	const trailingZeros = digits.length - trimmed.length
	const exp = expPart - fracLen + trailingZeros

	if (!Number.isSafeInteger(exp)) {
		throw new RangeError(`Normalized exponent out of safe integer range at index ${index}: "${value}"`)
	}

	return {
		mantissa: BigInt(sign + trimmed),
		exp,
	}
}

/**
 * Recursively computes the exact sum of squares of `items[lo..hi)` using
 * divide-and-conquer splitting across vector halves.
 *
 * @param {Array<{ mantissa: bigint, exp: number }>} items - Parsed decimal elements.
 * @param {number} lo - Inclusive start index.
 * @param {number} hi - Exclusive end index.
 * @returns {{ mantissa: bigint, exp: number }} Exact sum of squares as `mantissa * 10^exp`.
 */
function sumSquaresRecursive(items, lo, hi) {
	if (hi - lo === 1) {
		const { mantissa, exp } = items[lo]
		if (mantissa === 0n) {
			return { mantissa: 0n, exp: 0 }
		}
		const sqExp = exp * 2
		if (!Number.isSafeInteger(sqExp)) {
			throw new RangeError('Squared exponent exceeds safe integer range')
		}
		return { mantissa: mantissa * mantissa, exp: sqExp }
	}

	const mid = (lo + hi) >>> 1
	const left = sumSquaresRecursive(items, lo, mid)
	const right = sumSquaresRecursive(items, mid, hi)

	if (left.mantissa === 0n) return right
	if (right.mantissa === 0n) return left
	if (left.exp === right.exp) {
		return { mantissa: left.mantissa + right.mantissa, exp: left.exp }
	}
	if (left.exp > right.exp) {
		return {
			mantissa: left.mantissa * pow10(left.exp - right.exp) + right.mantissa,
			exp: right.exp,
		}
	}
	return {
		mantissa: left.mantissa + right.mantissa * pow10(right.exp - left.exp),
		exp: left.exp,
	}
}

/**
 * Formats a non-negative scaled integer `q * 10^(-precision)` as a canonical
 * decimal string without unnecessary trailing fractional zeros.
 *
 * @param {bigint} q - Non-negative scaled BigInt value.
 * @param {number} precision - Number of decimal places represented by `q`.
 * @returns {string} Canonical decimal string.
 */
function formatScaledDecimal(q, precision) {
	if (q === 0n) return '0'
	const str = q.toString()
	if (precision === 0) return str

	let intPart
	let fracPart
	if (str.length <= precision) {
		intPart = '0'
		fracPart = '0'.repeat(precision - str.length) + str
	} else {
		const splitAt = str.length - precision
		intPart = str.slice(0, splitAt)
		fracPart = str.slice(splitAt)
	}

	const trimmedFrac = fracPart.replace(/0+$/, '')
	return trimmedFrac.length > 0 ? `${intPart}.${trimmedFrac}` : intPart
}

/**
 * Computes the arbitrary-precision Euclidean norm (magnitude) of a vector of
 * decimal strings using BigInt arithmetic with a recursive divide-and-conquer
 * strategy:
 *
 * 1. Recursively splits the vector in half to accumulate the exact sum of
 *    squares `sum(x_i^2)` in base-10 scientific BigInt representation.
 * 2. Computes the square root via a recursive precision-doubling Newton
 *    integer square root (`isqrtRecursive`), followed by exact half-up
 *    rounding to `precision` decimal places.
 *
 * Trailing fractional zeros are stripped from the returned decimal string.
 *
 * @param {string[]} vec - Non-empty array of decimal strings (standard or scientific notation).
 * @param {number} [precision=20] - Non-negative integer number of decimal places to round to.
 * @returns {string} Canonical arbitrary-precision decimal string of `||vec||_2`.
 * @throws {TypeError} If `vec` is not an array, any element is not a string, or `precision` is not a number.
 * @throws {RangeError} If `vec` is empty, any element is not a valid decimal string, or `precision` is not a non-negative safe integer.
 */
export function magnitudeDecimalRecursive(vec, precision = 20) {
	if (!Array.isArray(vec)) {
		throw new TypeError('Vector must be an array of decimal strings')
	}
	if (vec.length === 0) {
		throw new RangeError('Vector must not be empty')
	}
	if (typeof precision !== 'number') {
		throw new TypeError('Precision must be a non-negative integer')
	}
	if (!Number.isInteger(precision) || precision < 0 || !Number.isSafeInteger(precision)) {
		throw new RangeError('Precision must be a non-negative safe integer')
	}

	const parsed = new Array(vec.length)
	for (let i = 0; i < vec.length; i++) {
		parsed[i] = parseDecimal(vec[i], i)
	}

	const sumSq = sumSquaresRecursive(parsed, 0, parsed.length)
	if (sumSq.mantissa === 0n) {
		return '0'
	}

	// We need round(sqrt(sumSq.mantissa * 10^sumSq.exp) * 10^precision)
	// = round(sqrt(sumSq.mantissa * 10^(sumSq.exp + 2 * precision))).
	const scaleExp = sumSq.exp + 2 * precision
	if (!Number.isSafeInteger(scaleExp)) {
		throw new RangeError('Scaled exponent exceeds safe integer range')
	}

	if (scaleExp >= 0) {
		const scaled = sumSq.mantissa * pow10(scaleExp)
		let q = isqrtRecursive(scaled)
		// For integer scaled, sqrt(scaled) > q + 0.5 iff scaled - q^2 > q.
		if (scaled - q * q > q) {
			q += 1n
		}
		return formatScaledDecimal(q, precision)
	}

	const denom = pow10(-scaleExp)
	const truncated = sumSq.mantissa / denom
	let q = isqrtRecursive(truncated)
	// Exact half-up check: sqrt(M / D) >= q + 0.5 iff 4 * M >= D * (2q + 1)^2.
	const twoQPlus1 = (q << 1n) + 1n
	if ((sumSq.mantissa << 2n) >= denom * twoQPlus1 * twoQPlus1) {
		q += 1n
	}
	return formatScaledDecimal(q, precision)
}
