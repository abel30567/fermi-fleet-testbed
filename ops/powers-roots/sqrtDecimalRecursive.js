/**
 * Compute the bit length of a non-negative BigInt.
 *
 * @param {bigint} n - Non-negative BigInt.
 * @returns {number} Number of bits required to represent `n` (0 for `0n`).
 */
function bitLength(n) {
	if (n === 0n) return 0
	const hex = n.toString(16)
	const firstNibble = parseInt(hex[0], 16)
	const leadingBits = 32 - Math.clz32(firstNibble)
	return (hex.length - 1) * 4 + leadingBits
}

/**
 * Recursive Karatsuba square root (Paul Zimmermann, INRIA RR-3805).
 *
 * Given a non-negative BigInt `n`, recursively splits `n` into four limbs of
 * `k` bits (where `k = floor((bitLength(n) + 1) / 4)`), solves the upper half
 * recursively, and combines the quotient and remainder in divide-and-conquer
 * fashion.
 *
 * @param {bigint} n - Non-negative integer.
 * @returns {[bigint, bigint]} Tuple `[s, r]` where `s = floor(sqrt(n))` and
 *   `r = n - s * s` with `0n <= r <= 2n * s`.
 */
function karatsubaSqrtRem(n) {
	if (n === 0n) return [0n, 0n]
	if (n < 4n) return [1n, n - 1n]

	const bits = bitLength(n)
	const k = (bits + 1) >> 2
	const shift = BigInt(k)
	const twoShift = shift << 1n
	const mask = (1n << shift) - 1n

	const hi = n >> twoShift
	const a1 = (n >> shift) & mask
	const a0 = n & mask

	const [sPrime, rPrime] = karatsubaSqrtRem(hi)

	const num = (rPrime << shift) + a1
	const den = sPrime << 1n
	const q = num / den
	const u = num % den

	let s = (sPrime << shift) + q
	let r = (u << shift) + a0 - q * q

	if (r < 0n) {
		r += (s << 1n) - 1n
		s -= 1n
	}

	return [s, r]
}

const DECIMAL_PATTERN = /^([+-])?(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/

/**
 * Parse and validate an input value into normalized non-negative decimal parts.
 *
 * @param {string | number | bigint} value - Input value to parse.
 * @returns {{ mantissa: bigint, digitCount: number, exp: bigint }}
 */
function parseDecimalInput(value) {
	let raw
	if (typeof value === 'string') {
		raw = value.trim()
	} else if (typeof value === 'bigint') {
		if (value < 0n) {
			throw new RangeError('Cannot compute square root of a negative number')
		}
		raw = value.toString()
	} else if (typeof value === 'number') {
		if (!Number.isFinite(value)) {
			throw new RangeError('Input number must be finite')
		}
		if (value < 0) {
			throw new RangeError('Cannot compute square root of a negative number')
		}
		raw = value === 0 ? '0' : String(value)
	} else {
		throw new TypeError('Input value must be a decimal string, finite number, or BigInt')
	}

	if (raw.length === 0) {
		throw new SyntaxError('Input decimal string cannot be empty')
	}

	const match = DECIMAL_PATTERN.exec(raw)
	if (!match) {
		throw new SyntaxError(`Invalid decimal format: "${value}"`)
	}

	const sign = match[1]
	const intPart = match[2] ?? ''
	const fracPart = match[3] ?? match[4] ?? ''
	const expPart = match[5]

	const digits = (intPart + fracPart).replace(/^0+/, '')
	if (digits.length === 0) {
		return { mantissa: 0n, digitCount: 0, exp: 0n }
	}

	if (sign === '-') {
		throw new RangeError('Cannot compute square root of a negative number')
	}

	const exp = (expPart ? BigInt(expPart) : 0n) - BigInt(fracPart.length)
	return {
		mantissa: BigInt(digits),
		digitCount: digits.length,
		exp,
	}
}

/**
 * Compute the square root of a non-negative arbitrary-precision decimal string
 * using BigInt arithmetic and a recursive divide-and-conquer Karatsuba square
 * root algorithm.
 *
 * The result is rounded half-up to `precision` fractional decimal digits
 * without double-rounding error, and trailing fractional zeros are stripped
 * (so exact integer roots like `sqrtDecimalRecursive('4', 20)` return `'2'`).
 *
 * @param {string | number | bigint} value - Non-negative decimal string (supports
 *   standard decimal and scientific notation), finite non-negative number, or
 *   non-negative BigInt.
 * @param {number} [precision=20] - Non-negative integer number of digits after
 *   the decimal point.
 * @returns {string} Arbitrary-precision decimal string representation of
 *   `sqrt(value)` rounded half-up to `precision` decimal places.
 * @throws {TypeError} If `value` is not a string, number, or BigInt, or if
 *   `precision` is not a number.
 * @throws {SyntaxError} If `value` is not a valid decimal string.
 * @throws {RangeError} If `value` is negative or non-finite, or if `precision`
 *   is not a non-negative safe integer.
 */
export function sqrtDecimalRecursive(value, precision = 20) {
	if (typeof precision !== 'number') {
		throw new TypeError('Precision must be a number')
	}
	if (!Number.isSafeInteger(precision) || precision < 0) {
		throw new RangeError('Precision must be a non-negative safe integer')
	}

	const { mantissa, digitCount, exp } = parseDecimalInput(value)
	if (mantissa === 0n) {
		return '0'
	}

	// Exact round-half-up via:
	//   q = floor((floor(sqrt(floor(4 * x * 10^(2 * precision)))) + 1) / 2)
	// Because 4 * x * 10^(2p) = 4 * mantissa * 10^(exp + 2p).
	const shift = exp + BigInt(precision) * 2n
	let scaled

	if (shift >= 0n) {
		scaled = (mantissa << 2n) * 10n ** shift
	} else {
		const drop = -shift
		// 4 * mantissa < 10^(digitCount + 1), so if drop >= digitCount + 1 the
		// floor quotient is guaranteed to be 0n without allocating 10n ** drop.
		if (drop >= BigInt(digitCount + 1)) {
			return '0'
		}
		scaled = (mantissa << 2n) / 10n ** drop
	}

	const [s] = karatsubaSqrtRem(scaled)
	const q = (s + 1n) >> 1n

	if (q === 0n) {
		return '0'
	}

	const digits = q.toString()
	if (precision === 0) {
		return digits
	}

	let intStr
	let fracStr
	if (digits.length <= precision) {
		intStr = '0'
		fracStr = '0'.repeat(precision - digits.length) + digits
	} else {
		const splitAt = digits.length - precision
		intStr = digits.slice(0, splitAt)
		fracStr = digits.slice(splitAt)
	}

	fracStr = fracStr.replace(/0+$/, '')
	return fracStr.length > 0 ? `${intStr}.${fracStr}` : intStr
}
