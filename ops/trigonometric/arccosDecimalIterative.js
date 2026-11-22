/**
 * Computes the inverse cosine arccos(x) in radians over arbitrary-precision
 * decimal strings using BigInt-based fixed-point arithmetic and iterative
 * algorithms (Machin-like pi series, iterative arcsin power series, and
 * iterative Newton integer square root for range reduction near ±1).
 *
 * Range reduction ensures fast convergence across the entire domain [-1, 1]:
 * - x = 1: returns "0"
 * - x = -1: returns pi
 * - x = 0: returns pi / 2
 * - |x| <= 0.5: arccos(x) = pi / 2 - arcsin(x)
 * - 0.5 < |x| < 1: let t = sqrt((1 - |x|) / 2) in (0, 0.5);
 *     arccos(|x|) = 2 * arcsin(t), and for x < 0, arccos(x) = pi - 2 * arcsin(t).
 *
 * @param {string} x - Decimal string in [-1, 1] (supports optional leading +/-,
 *   integer/fractional forms, and optional scientific notation).
 * @param {number} [precision=20] - Non-negative integer number of decimal places
 *   for the returned normalized decimal string.
 * @returns {string} Normalized decimal string representing arccos(x) in [0, pi],
 *   rounded half-away-from-zero to `precision` decimal places with trailing
 *   fractional zeros stripped.
 * @throws {TypeError} If `x` is not a string or `precision` is not a number.
 * @throws {RangeError} If `x` is not a valid decimal string, `|x| > 1`, or
 *   `precision` is not a non-negative safe integer.
 */
export function arccosDecimalIterative(x, precision = 20) {
	if (typeof x !== 'string') {
		throw new TypeError('Input x must be a decimal string')
	}
	if (typeof precision !== 'number') {
		throw new TypeError('Precision must be a number')
	}
	if (!Number.isSafeInteger(precision) || precision < 0) {
		throw new RangeError('Precision must be a non-negative safe integer')
	}

	const parsed = parseDecimalString(x)
	assertInUnitInterval(parsed)

	if (parsed.absNum === 1n && parsed.exp === 0n && parsed.sign === 1) {
		return '0'
	}

	const guard = 20 + Math.ceil(Math.log10(precision + 10)) * 2
	const workScale = precision + guard
	const scaleFactor = 10n ** BigInt(workScale)

	let resultScaled

	if (parsed.absNum === 0n) {
		resultScaled = computePiScaled(scaleFactor) / 2n
	} else if (parsed.absNum === 1n && parsed.exp === 0n && parsed.sign === -1) {
		resultScaled = computePiScaled(scaleFactor)
	} else if (isAbsAtMostHalf(parsed)) {
		const piHalf = computePiScaled(scaleFactor) / 2n
		const absXScaled = scaleAbsDecimal(parsed, workScale)
		const arcsinAbs = computeArcsinScaled(absXScaled, scaleFactor)
		resultScaled = parsed.sign === 1 ? piHalf - arcsinAbs : piHalf + arcsinAbs
	} else {
		// 0.5 < |x| < 1: t = sqrt((1 - |x|) / 2) lies in (0, 0.5)
		const halfOneMinusAbsScaled2W = computeHalfOneMinusAbsScaled(parsed, workScale * 2)
		const tScaled = bigIntSqrt(halfOneMinusAbsScaled2W)
		const twoArcsinT = 2n * computeArcsinScaled(tScaled, scaleFactor)
		if (parsed.sign === 1) {
			resultScaled = twoArcsinT
		} else {
			resultScaled = computePiScaled(scaleFactor) - twoArcsinT
		}
	}

	const guardFactor = 10n ** BigInt(guard)
	const rounded = divRoundHalfAwayFromZero(resultScaled, guardFactor)
	return formatScaledDecimal(rounded, precision)
}

const DECIMAL_REGEX = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/

/**
 * Parses a decimal string into a normalized exact representation:
 * value = sign * absNum * 10^exp, where `digits` has no leading or trailing zeros
 * (except "0" with absNum = 0n and exp = 0n).
 *
 * @param {string} input
 * @returns {{ sign: 1 | -1, digits: string, absNum: bigint, exp: bigint }}
 */
function parseDecimalString(input) {
	const trimmed = input.trim()
	if (trimmed.length === 0) {
		throw new RangeError('Input x must be a non-empty decimal string')
	}

	const match = DECIMAL_REGEX.exec(trimmed)
	if (!match) {
		throw new RangeError(`Invalid decimal string: "${input}"`)
	}

	const [, signPart, intPart, fracPart1, fracPart2, expPart] = match
	const fracPart = fracPart1 ?? fracPart2 ?? ''
	const rawDigits = (intPart ?? '') + fracPart

	const strippedLeading = rawDigits.replace(/^0+/, '')
	if (strippedLeading.length === 0) {
		return { sign: 1, digits: '0', absNum: 0n, exp: 0n }
	}

	const digits = strippedLeading.replace(/0+$/, '')
	const trailingZeros = strippedLeading.length - digits.length
	const exp = BigInt(expPart ?? '0') - BigInt(fracPart.length) + BigInt(trailingZeros)
	const sign = signPart === '-' ? -1 : 1

	return { sign, digits, absNum: BigInt(digits), exp }
}

/**
 * Validates that the parsed decimal value lies exactly within [-1, 1].
 *
 * @param {{ digits: string, absNum: bigint, exp: bigint }} parsed
 */
function assertInUnitInterval(parsed) {
	if (parsed.absNum === 0n) return
	if (parsed.absNum === 1n && parsed.exp === 0n) return
	const d = BigInt(parsed.digits.length)
	if (d + parsed.exp <= 0n) return
	throw new RangeError('Input x must be in the domain [-1, 1]')
}

/**
 * Checks whether |x| <= 0.5 for a parsed decimal with 0 < |x| < 1.
 *
 * @param {{ digits: string, exp: bigint }} parsed
 * @returns {boolean}
 */
function isAbsAtMostHalf(parsed) {
	const d = BigInt(parsed.digits.length)
	if (d + parsed.exp < 0n) return true
	// Here d + exp === 0n, so 0.1 <= |x| < 1 and digits has no trailing zeros.
	const firstDigit = parsed.digits[0]
	if (firstDigit < '5') return true
	if (firstDigit > '5') return false
	return parsed.digits.length === 1
}

/**
 * Scales |x| to `round(|x| * 10^workScale)` for |x| <= 0.5 without allocating
 * oversized powers of 10 on tiny scientific-notation inputs.
 *
 * @param {{ digits: string, absNum: bigint, exp: bigint }} parsed
 * @param {number} workScale
 * @returns {bigint}
 */
function scaleAbsDecimal(parsed, workScale) {
	const shift = parsed.exp + BigInt(workScale)
	if (shift >= 0n) {
		return parsed.absNum * (10n ** shift)
	}
	const drop = -shift
	if (drop > BigInt(parsed.digits.length) + 1n) {
		return 0n
	}
	return divRoundHalfAwayFromZero(parsed.absNum, 10n ** drop)
}

/**
 * Computes floor(((1 - |x|) / 2) * 10^doubleScale) for 0.5 < |x| < 1.
 * Since 0.5 < |x| < 1, -exp === digits.length, bounding 10^(-exp) by input length.
 *
 * @param {{ absNum: bigint, exp: bigint }} parsed
 * @param {number} doubleScale
 * @returns {bigint}
 */
function computeHalfOneMinusAbsScaled(parsed, doubleScale) {
	const k = -parsed.exp
	const powK = 10n ** k
	const diff = powK - parsed.absNum
	const targetScale = BigInt(doubleScale)

	if (k <= targetScale) {
		return (diff * (10n ** (targetScale - k))) / 2n
	}
	return diff / (2n * (10n ** (k - targetScale)))
}

/**
 * Computes floor(sqrt(n)) for non-negative BigInt `n` using iterative Newton's method.
 *
 * @param {bigint} n
 * @returns {bigint}
 */
function bigIntSqrt(n) {
	if (n < 2n) return n
	const bitLen = n.toString(2).length
	let x = 1n << BigInt((bitLen + 1) >> 1)
	while (true) {
		const next = (x + n / x) >> 1n
		if (next >= x) return x
		x = next
	}
}

/**
 * Computes floor(pi * scaleFactor) via Machin's formula:
 * pi = 16 * arctan(1/5) - 4 * arctan(1/239).
 *
 * @param {bigint} scaleFactor
 * @returns {bigint}
 */
function computePiScaled(scaleFactor) {
	const extra = 10000n
	const extendedScale = scaleFactor * extra
	const piExtended =
		computeAtanReciprocalScaled(16n, 5n, extendedScale) -
		computeAtanReciprocalScaled(4n, 239n, extendedScale)
	return divRoundHalfAwayFromZero(piExtended, extra)
}

/**
 * Computes coeff * arctan(1 / m) * scaleFactor iteratively using the alternating
 * Taylor series for arctan(1 / m).
 *
 * @param {bigint} coeff
 * @param {bigint} m
 * @param {bigint} scaleFactor
 * @returns {bigint}
 */
function computeAtanReciprocalScaled(coeff, m, scaleFactor) {
	const mSquared = m * m
	let power = (coeff * scaleFactor) / m
	let sum = power
	let sign = -1n
	let k = 1n

	while (power > 0n) {
		power = power / mSquared
		const term = power / (2n * k + 1n)
		if (term === 0n) break
		sum += sign * term
		sign = -sign
		k += 1n
	}

	return sum
}

/**
 * Computes arcsin(u) * scaleFactor iteratively for 0 <= u <= 0.5 using:
 * arcsin(u) = sum_{n=0}^\infty ((2n)! / (4^n (n!)^2 (2n+1))) * u^(2n+1).
 *
 * @param {bigint} uScaled - Non-negative fixed-point value u * scaleFactor (u <= 0.5).
 * @param {bigint} scaleFactor
 * @returns {bigint}
 */
function computeArcsinScaled(uScaled, scaleFactor) {
	if (uScaled === 0n) return 0n

	const u2Scaled = (uScaled * uScaled) / scaleFactor
	let a = uScaled
	let sum = uScaled
	let n = 1n

	while (true) {
		a = (a * (2n * n - 1n) * u2Scaled) / (2n * n * scaleFactor)
		const term = a / (2n * n + 1n)
		if (term === 0n) break
		sum += term
		n += 1n
	}

	return sum
}

/**
 * Integer division with half-away-from-zero rounding (never returns -0n).
 *
 * @param {bigint} numerator
 * @param {bigint} denominator
 * @returns {bigint}
 */
function divRoundHalfAwayFromZero(numerator, denominator) {
	const neg = (numerator < 0n) !== (denominator < 0n)
	const n = numerator < 0n ? -numerator : numerator
	const d = denominator < 0n ? -denominator : denominator
	const q = n / d
	const r = n % d
	const rounded = r * 2n >= d ? q + 1n : q
	return neg && rounded !== 0n ? -rounded : rounded
}

/**
 * Formats a scaled BigInt integer (`value * 10^precision`) as a clean normalized
 * decimal string with no leading zeros, no trailing fractional zeros, and no "-0".
 *
 * @param {bigint} scaledValue
 * @param {number} precision
 * @returns {string}
 */
function formatScaledDecimal(scaledValue, precision) {
	if (scaledValue === 0n) return '0'
	const isNeg = scaledValue < 0n
	const absVal = isNeg ? -scaledValue : scaledValue
	const prefix = isNeg ? '-' : ''

	if (precision === 0) {
		return prefix + absVal.toString()
	}

	const digits = absVal.toString().padStart(precision + 1, '0')
	const intPart = digits.slice(0, digits.length - precision)
	const fracPart = digits.slice(digits.length - precision).replace(/0+$/, '')

	return fracPart.length > 0 ? `${prefix}${intPart}.${fracPart}` : `${prefix}${intPart}`
}
