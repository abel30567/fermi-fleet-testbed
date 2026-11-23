const DECIMAL_REGEX = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/
const MAX_SCALE = 1_000_000
const POW10_CACHE = [1n]

/**
 * Computes 10^exp as a BigInt, caching small powers for streaming performance.
 *
 * @param {number} exp - Non-negative integer exponent.
 * @returns {bigint}
 */
function pow10(exp) {
	if (exp <= 256) {
		while (POW10_CACHE.length <= exp) {
			POW10_CACHE.push(POW10_CACHE[POW10_CACHE.length - 1] * 10n)
		}
		return POW10_CACHE[exp]
	}
	return 10n ** BigInt(exp)
}

/**
 * Parses a decimal string (standard or scientific notation) into a normalized
 * arbitrary-precision `{ unscaled, scale }` representation where
 * `value = unscaled * 10^(-scale)`.
 *
 * @param {unknown} raw - Candidate decimal string.
 * @returns {{ unscaled: bigint, scale: number }}
 */
function parseDecimal(raw) {
	if (typeof raw !== 'string') {
		throw new TypeError(`Expected decimal string element, got ${raw === null ? 'null' : typeof raw}`)
	}

	const trimmed = raw.trim()
	const match = DECIMAL_REGEX.exec(trimmed)
	if (!match) {
		throw new SyntaxError(`Invalid decimal string: ${JSON.stringify(raw)}`)
	}

	const isNegative = match[1] === '-'
	const intPart = match[2] ?? ''
	const fracPart = match[3] ?? match[4] ?? ''
	const expStr = match[5]

	let exp = 0
	if (expStr !== undefined) {
		exp = Number(expStr)
		if (!Number.isSafeInteger(exp) || Math.abs(exp) > MAX_SCALE) {
			throw new RangeError(`Exponent out of supported range (±${MAX_SCALE}): ${JSON.stringify(raw)}`)
		}
	}

	let digits = intPart + fracPart
	const firstNonZero = digits.search(/[1-9]/)
	if (firstNonZero === -1) {
		return { unscaled: 0n, scale: 0 }
	}
	digits = digits.slice(firstNonZero)

	let scale = fracPart.length - exp
	if (scale > 0) {
		let end = digits.length
		while (end > 0 && digits.charCodeAt(end - 1) === 48 && scale > 0) {
			end--
			scale--
		}
		digits = digits.slice(0, end)
	}

	if (scale > MAX_SCALE || -scale > MAX_SCALE) {
		throw new RangeError(`Effective decimal scale out of supported range (±${MAX_SCALE}): ${JSON.stringify(raw)}`)
	}

	let unscaled = BigInt(digits)
	if (scale < 0) {
		unscaled *= pow10(-scale)
		scale = 0
	}

	return {
		unscaled: isNegative ? -unscaled : unscaled,
		scale,
	}
}

/**
 * Lazily parses decimal strings from an iterable one element at a time.
 *
 * @param {Iterable<string>} iterable
 * @yields {{ unscaled: bigint, scale: number }}
 */
function* parseDecimalStream(iterable) {
	for (const raw of iterable) {
		yield parseDecimal(raw)
	}
}

/**
 * Lazily accumulates parsed decimal terms into exact running totals.
 *
 * @param {Iterable<{ unscaled: bigint, scale: number }>} terms
 * @yields {{ unscaled: bigint, scale: number }}
 */
function* accumulateDecimalStream(terms) {
	let accUnscaled = 0n
	let accScale = 0

	for (const { unscaled, scale } of terms) {
		if (unscaled !== 0n) {
			if (scale > accScale) {
				accUnscaled = accUnscaled * pow10(scale - accScale) + unscaled
				accScale = scale
			} else if (scale < accScale) {
				accUnscaled += unscaled * pow10(accScale - scale)
			} else {
				accUnscaled += unscaled
			}
		}
		yield { unscaled: accUnscaled, scale: accScale }
	}
}

/**
 * Formats an exact scaled BigInt decimal value to a canonical string, rounded
 * to at most `precision` fractional digits using round-half-away-from-zero.
 *
 * @param {bigint} unscaled
 * @param {number} scale
 * @param {number} precision
 * @returns {string}
 */
function formatDecimal(unscaled, scale, precision) {
	if (unscaled === 0n) {
		return '0'
	}

	const isNegative = unscaled < 0n
	let absVal = isNegative ? -unscaled : unscaled
	let finalScale = scale

	if (scale > precision) {
		const divisor = pow10(scale - precision)
		const quotient = absVal / divisor
		const remainder = absVal % divisor
		absVal = remainder * 2n >= divisor ? quotient + 1n : quotient
		finalScale = precision

		if (absVal === 0n) {
			return '0'
		}
	}

	const sign = isNegative ? '-' : ''
	const digits = absVal.toString()

	if (finalScale === 0) {
		return sign + digits
	}

	let intStr
	let fracStr
	if (digits.length <= finalScale) {
		intStr = '0'
		fracStr = digits.padStart(finalScale, '0')
	} else {
		const splitIdx = digits.length - finalScale
		intStr = digits.slice(0, splitIdx)
		fracStr = digits.slice(splitIdx)
	}

	fracStr = fracStr.replace(/0+$/, '')
	if (fracStr.length === 0) {
		return sign + intStr
	}
	return `${sign}${intStr}.${fracStr}`
}

/**
 * Computes the discrete summation of arbitrary-precision decimal strings from
 * any non-string iterable using a lazy generator-based streaming pipeline.
 *
 * Terms are consumed one at a time without materializing the input sequence in
 * memory and accumulated exactly with `BigInt` arithmetic. The final result is
 * rounded once to at most `precision` fractional decimal digits using
 * round-half-away-from-zero, with redundant trailing fractional zeros stripped.
 *
 * @param {Iterable<string>} values - Iterable sequence (Array, Generator, Set,
 *   custom iterable, etc.) of decimal strings in standard or scientific notation.
 * @param {number} [precision=20] - Maximum number of fractional decimal places
 *   in the returned result (non-negative integer).
 * @returns {string} Canonical decimal string representing the exact or rounded sum.
 * @throws {TypeError} If `values` is not a non-string iterable, any yielded
 *   element is not a string, or `precision` is not a number.
 * @throws {RangeError} If `precision` is negative, non-integer, or exceeds the
 *   supported scale bound, or if an input exponent exceeds the supported range.
 * @throws {SyntaxError} If any yielded element is not a valid decimal string.
 */
export function summationDecimalLazy(values, precision = 20) {
	if (
		values === null ||
		values === undefined ||
		typeof values === 'string' ||
		typeof values[Symbol.iterator] !== 'function'
	) {
		throw new TypeError('values must be a non-string iterable of decimal strings')
	}

	if (typeof precision !== 'number' || Number.isNaN(precision)) {
		throw new TypeError('precision must be a non-negative integer')
	}

	if (!Number.isInteger(precision) || precision < 0 || precision > MAX_SCALE) {
		throw new RangeError(`precision must be an integer between 0 and ${MAX_SCALE}`)
	}

	let total = { unscaled: 0n, scale: 0 }
	const stream = accumulateDecimalStream(parseDecimalStream(values))
	for (const running of stream) {
		total = running
	}

	return formatDecimal(total.unscaled, total.scale, precision)
}
