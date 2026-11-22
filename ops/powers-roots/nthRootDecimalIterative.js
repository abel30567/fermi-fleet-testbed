const DECIMAL_PATTERN =
	/^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/

/**
 * Computes the bit length of a positive BigInt.
 *
 * @param {bigint} value - Positive BigInt value.
 * @returns {number} Number of bits required to represent `value`.
 */
function bitLength(value) {
	const hex = value.toString(16)
	const topNibble = Number.parseInt(hex[0], 16)
	return (hex.length - 1) * 4 + (32 - Math.clz32(topNibble))
}

/**
 * Parses a decimal string into a normalized sign, positive BigInt mantissa,
 * and base-10 exponent such that `|value| = mantissa * 10^exponent`.
 *
 * @param {string} raw - Decimal string to parse.
 * @returns {{ isNegative: boolean, mantissa: bigint, exponent: number }}
 */
function parseDecimal(raw) {
	if (typeof raw !== 'string') {
		throw new TypeError('value must be a decimal string')
	}

	const trimmed = raw.trim()
	const match = DECIMAL_PATTERN.exec(trimmed)
	if (!match) {
		throw new RangeError(`Invalid decimal string: "${raw}"`)
	}

	const [, signStr, intPart = '', fracPart1 = '', fracPart2 = '', expStr] = match
	const fracPart = fracPart1 || fracPart2
	const combinedDigits = intPart + fracPart

	let exp = -fracPart.length
	if (expStr !== undefined) {
		const parsedExp = Number(expStr)
		if (!Number.isSafeInteger(parsedExp)) {
			throw new RangeError(`Exponent out of safe integer range: "${expStr}"`)
		}
		exp += parsedExp
		if (!Number.isSafeInteger(exp)) {
			throw new RangeError('Effective decimal exponent out of safe integer range')
		}
	}

	const strippedLeading = combinedDigits.replace(/^0+/, '')
	if (strippedLeading.length === 0) {
		return { isNegative: false, mantissa: 0n, exponent: 0 }
	}

	const strippedTrailing = strippedLeading.replace(/0+$/, '')
	const trailingZeros = strippedLeading.length - strippedTrailing.length
	const normalizedExp = exp + trailingZeros
	if (!Number.isSafeInteger(normalizedExp)) {
		throw new RangeError('Normalized decimal exponent out of safe integer range')
	}

	return {
		isNegative: signStr === '-',
		mantissa: BigInt(strippedTrailing),
		exponent: normalizedExp,
	}
}

/**
 * Formats a non-negative scaled BigInt (`|result| * 10^precision`) as a
 * canonical decimal string, stripping insignificant trailing zeros.
 *
 * @param {bigint} scaled - Non-negative scaled integer representation.
 * @param {number} precision - Number of fractional decimal digits.
 * @param {boolean} isNegative - Whether the formatted value should be negative.
 * @returns {string}
 */
function formatScaledBigInt(scaled, precision, isNegative) {
	if (scaled === 0n) {
		return '0'
	}

	const sign = isNegative ? '-' : ''
	if (precision === 0) {
		return sign + scaled.toString()
	}

	const digits = scaled.toString()
	let intPart
	let fracPart

	if (digits.length <= precision) {
		intPart = '0'
		fracPart = digits.padStart(precision, '0')
	} else {
		const splitAt = digits.length - precision
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
 * Computes `floor(radicand^(1/n))` for a non-negative BigInt `radicand` and
 * integer `n >= 2` using an iterative Newton-Raphson loop.
 *
 * Starting from an overestimate `x0 = 2^ceil(bitLength(radicand) / n)`,
 * each iteration strictly decreases `x` while staying `>= floor(radicand^(1/n))`
 * until the first non-decreasing step, at which point `x` is the exact floor.
 *
 * @param {bigint} radicand - Non-negative BigInt radicand.
 * @param {number} n - Positive integer root degree (`n >= 2`).
 * @returns {bigint} Exact integer floor of `radicand^(1/n)`.
 */
function integerNthRoot(radicand, n) {
	if (radicand === 0n) return 0n
	if (radicand === 1n) return 1n

	const bigN = BigInt(n)
	const bigNMinus1 = bigN - 1n
	const radBits = bitLength(radicand)
	let x = 1n << BigInt(Math.ceil(radBits / n))

	while (true) {
		let quotient
		if (x === 1n) {
			quotient = radicand
		} else {
			const xBits = bitLength(x)
			if ((xBits - 1) * (n - 1) >= radBits) {
				quotient = 0n
			} else {
				quotient = radicand / (x ** bigNMinus1)
			}
		}

		const next = (bigNMinus1 * x + quotient) / bigN
		if (next >= x) {
			return x
		}
		x = next
	}
}

/**
 * Computes the real n-th root of an arbitrary-precision decimal string using
 * an iterative Newton-Raphson loop over scaled BigInt arithmetic.
 *
 * Results are rounded half-away-from-zero to `precision` decimal places, with
 * insignificant trailing fractional zeros stripped. Odd roots of negative
 * values are supported; even roots of negative values throw a `RangeError`.
 *
 * @param {string} value - Arbitrary-precision decimal string (e.g. `"2"`, `"-27"`, `"0.008"`, `"1e-6"`).
 * @param {number} n - Positive safe integer root degree (`n >= 1`).
 * @param {number} [precision=20] - Non-negative safe integer number of fractional decimal places.
 * @returns {string} Canonical decimal string representation of the real n-th root.
 * @throws {TypeError} If `value` is not a string, `n` is not a number, or `precision` is not a number.
 * @throws {RangeError} If `value` is not a valid decimal string, `n` is not a positive safe integer,
 *   `precision` is not a non-negative safe integer, or `value < 0` with an even `n`.
 */
export function nthRootDecimalIterative(value, n, precision = 20) {
	const { isNegative, mantissa, exponent } = parseDecimal(value)

	if (typeof n !== 'number') {
		throw new TypeError('n must be a number')
	}
	if (!Number.isSafeInteger(n) || n < 1) {
		throw new RangeError('n must be a positive safe integer')
	}

	if (typeof precision !== 'number') {
		throw new TypeError('precision must be a number')
	}
	if (!Number.isSafeInteger(precision) || precision < 0) {
		throw new RangeError('precision must be a non-negative safe integer')
	}

	if (mantissa === 0n) {
		return '0'
	}

	if (isNegative && n % 2 === 0) {
		throw new RangeError('Cannot compute even root of a negative number')
	}

	if (mantissa === 1n && exponent === 0) {
		return isNegative ? '-1' : '1'
	}

	if (n === 1) {
		const shift = exponent + precision
		if (!Number.isSafeInteger(shift)) {
			throw new RangeError('Scaled exponent out of safe integer range')
		}

		let scaled
		if (shift >= 0) {
			scaled = mantissa * (10n ** BigInt(shift))
		} else {
			const drop = -shift
			const digits = mantissa.toString()
			if (drop > digits.length) {
				scaled = 0n
			} else {
				const splitAt = digits.length - drop
				const intPart = splitAt === 0 ? 0n : BigInt(digits.slice(0, splitAt))
				const roundDigit = digits.charCodeAt(splitAt) - 48
				scaled = roundDigit >= 5 ? intPart + 1n : intPart
			}
		}

		return formatScaledBigInt(scaled, precision, isNegative)
	}

	// Compute floor(|value|^(1/n) * 10^(precision + 1)) exactly via:
	//   floor((|value| * 10^(n * (precision + 1)))^(1/n))
	//   = floor(floor(|value| * 10^(n * (precision + 1)))^(1/n))
	// One extra decimal digit suffices for exact half-away-from-zero rounding.
	const scaleShift = BigInt(exponent) + BigInt(n) * BigInt(precision + 1)
	let radicand

	if (scaleShift >= 0n) {
		radicand = mantissa * (10n ** scaleShift)
	} else {
		const drop = -scaleShift
		const digits = mantissa.toString()
		if (drop >= BigInt(digits.length)) {
			radicand = 0n
		} else {
			radicand = BigInt(digits.slice(0, digits.length - Number(drop)))
		}
	}

	const extraRoot = integerNthRoot(radicand, n)
	const scaled = (extraRoot + 5n) / 10n

	return formatScaledBigInt(scaled, precision, isNegative)
}
