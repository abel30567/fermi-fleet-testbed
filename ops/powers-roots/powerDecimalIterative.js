/**
 * Arbitrary-precision decimal string exponentiation using straightforward
 * iterative methods over scaled BigInt arithmetic.
 *
 * - Integer exponents use iterative binary exponentiation (exact BigInt when
 *   exactness fits within working bounds, otherwise fixed-point scaled BigInt).
 * - Fractional exponents (positive base) use `exp(exponent * ln(base))` with:
 *   - Iterative base-10 + Newton-Heron square-root range reduction and
 *     iterative `artanh` Taylor series for `ln(base)`.
 *   - Iterative halving/squaring range reduction and iterative Taylor series
 *     for `exp(y)`.
 */

const DECIMAL_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/
const MAX_PRECISION = 10_000
const MAX_RESULT_DIGITS = 100_000

/**
 * Compute 10n ** BigInt(n).
 *
 * @param {number} n Non-negative integer exponent.
 * @returns {bigint}
 */
function pow10(n) {
	return 10n ** BigInt(n)
}

/**
 * Round `num / den` to the nearest integer (half away from zero).
 * Assumes `den > 0n`.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {bigint}
 */
function divRound(num, den) {
	if (num >= 0n) {
		return (num * 2n + den) / (den * 2n)
	}
	return -((-num * 2n + den) / (den * 2n))
}

/**
 * Parse and validate a decimal string into canonical `{ coeff, exp10 }` such
 * that value = `coeff * 10^exp10`, with trailing zeros removed from `coeff`
 * (and `0` normalized to `{ coeff: 0n, exp10: 0 }`).
 *
 * @param {string} value
 * @param {string} name Parameter name for error messages.
 * @returns {{ coeff: bigint, exp10: number }}
 */
function parseDecimal(value, name) {
	if (typeof value !== 'string') {
		throw new TypeError(`${name} must be a decimal string`)
	}
	const trimmed = value.trim()
	if (!DECIMAL_RE.test(trimmed)) {
		throw new RangeError(`${name} is not a valid decimal string: "${value}"`)
	}

	let sign = 1n
	let idx = 0
	if (trimmed[0] === '-') {
		sign = -1n
		idx = 1
	} else if (trimmed[0] === '+') {
		idx = 1
	}

	const eIdx = trimmed.search(/[eE]/)
	const mantissa = eIdx === -1 ? trimmed.slice(idx) : trimmed.slice(idx, eIdx)
	const expPart = eIdx === -1 ? 0 : Number(trimmed.slice(eIdx + 1))

	if (!Number.isSafeInteger(expPart)) {
		throw new RangeError(`${name} exponent is out of safe integer range`)
	}

	const dotIdx = mantissa.indexOf('.')
	let digits
	let fracLen = 0
	if (dotIdx === -1) {
		digits = mantissa
	} else {
		digits = mantissa.slice(0, dotIdx) + mantissa.slice(dotIdx + 1)
		fracLen = mantissa.length - dotIdx - 1
	}

	const rawCoeff = BigInt(digits)
	if (rawCoeff === 0n) {
		return { coeff: 0n, exp10: 0 }
	}

	// Strip trailing zeros so integer detection is simply `exp10 >= 0`.
	const coeffStr = rawCoeff.toString()
	let end = coeffStr.length
	while (end > 1 && coeffStr[end - 1] === '0') {
		end--
	}
	const strippedZeros = coeffStr.length - end
	const coeff = sign * BigInt(coeffStr.slice(0, end))
	const exp10 = expPart - fracLen + strippedZeros

	if (!Number.isSafeInteger(exp10)) {
		throw new RangeError(`${name} scale is out of safe integer range`)
	}

	return { coeff, exp10 }
}

/**
 * Format a fixed-point BigInt `value` (representing `real * 10^scale`)
 * rounded to `precision` fractional decimal places, trimming trailing zeros.
 *
 * @param {bigint} value
 * @param {number} scale
 * @param {number} precision
 * @returns {string}
 */
function formatFixed(value, scale, precision) {
	let rounded
	if (scale > precision) {
		rounded = divRound(value, pow10(scale - precision))
	} else if (scale < precision) {
		rounded = value * pow10(precision - scale)
	} else {
		rounded = value
	}

	if (rounded === 0n) {
		return '0'
	}

	const neg = rounded < 0n
	const abs = neg ? -rounded : rounded
	const signPrefix = neg ? '-' : ''

	if (precision === 0) {
		return `${signPrefix}${abs.toString()}`
	}

	const str = abs.toString().padStart(precision + 1, '0')
	const intPart = str.slice(0, str.length - precision)
	const fracPart = str.slice(str.length - precision).replace(/0+$/, '')
	return fracPart.length > 0 ? `${signPrefix}${intPart}.${fracPart}` : `${signPrefix}${intPart}`
}

/**
 * Approximate `Number` value of a parsed decimal (may return `Infinity` for
 * very large values, which is handled by callers).
 *
 * @param {{ coeff: bigint, exp10: number }} dec
 * @returns {number}
 */
function approxNumber(dec) {
	if (dec.coeff === 0n) return 0
	const neg = dec.coeff < 0n
	const s = (neg ? -dec.coeff : dec.coeff).toString()
	const take = Math.min(15, s.length)
	const lead = Number(s.slice(0, take))
	const exp = dec.exp10 + (s.length - take)
	const val = lead * 10 ** exp
	return neg ? -val : val
}

/**
 * Approximate `log10(x)` for a positive parsed decimal `x`, remaining accurate
 * even when `x` is extremely close to `1` or has a very large/small exponent.
 *
 * @param {{ coeff: bigint, exp10: number }} dec Positive decimal (`coeff > 0n`).
 * @returns {number}
 */
function approxLog10(dec) {
	const s = dec.coeff.toString()
	const d = s.length
	let k = dec.exp10 + d - 1
	if (s[0] >= '4' || (s[0] === '3' && d > 1)) {
		k += 1
	}

	if (k !== 0) {
		const take = Math.min(15, d)
		const lead = Number(s.slice(0, take))
		const mApprox = lead * 10 ** (dec.exp10 - k + (d - take))
		return k + Math.log10(mApprox)
	}

	// k === 0: dec is in (0.3, 3]. Check proximity to 1 carefully.
	// dec = coeff * 10^exp10, with exp10 <= 0.
	const unit = pow10(-dec.exp10)
	const delta = dec.coeff - unit
	if (delta === 0n) return 0

	const deltaAbs = delta < 0n ? -delta : delta
	const ds = deltaAbs.toString()
	const dtake = Math.min(15, ds.length)
	const dlead = Number(ds.slice(0, dtake))
	const dApprox = (delta < 0n ? -1 : 1) * dlead * 10 ** (dec.exp10 + (ds.length - dtake))

	if (Math.abs(dApprox) < 1e-5) {
		return dApprox / Math.LN10
	}
	return Math.log10(1 + dApprox)
}

/**
 * Integer square root `floor(sqrt(n))` via iterative Newton-Heron method.
 *
 * @param {bigint} n Non-negative BigInt.
 * @returns {bigint}
 */
function isqrt(n) {
	if (n < 2n) return n
	const bitLen = n.toString(16).length * 4
	let x = 1n << BigInt((bitLen + 1) >> 1)
	while (true) {
		const next = (x + n / x) >> 1n
		if (next >= x) return x
		x = next
	}
}

/**
 * Iterative binary exponentiation for BigInt integers: `base ** exp`.
 *
 * @param {bigint} base
 * @param {bigint} exp Non-negative BigInt.
 * @returns {bigint}
 */
function bigintPowIterative(base, exp) {
	let result = 1n
	let b = base
	let e = exp
	while (e > 0n) {
		if ((e & 1n) === 1n) {
			result *= b
		}
		e >>= 1n
		if (e > 0n) {
			b *= b
		}
	}
	return result
}

/**
 * Iterative binary exponentiation over fixed-point scaled BigInts.
 * Computes `(baseFixed / scaleFactor) ** exp * scaleFactor`.
 *
 * @param {bigint} baseFixed
 * @param {bigint} exp Non-negative BigInt.
 * @param {bigint} scaleFactor
 * @returns {bigint}
 */
function fpPowIterative(baseFixed, exp, scaleFactor) {
	let result = scaleFactor
	let b = baseFixed
	let e = exp
	while (e > 0n) {
		if ((e & 1n) === 1n) {
			result = divRound(result * b, scaleFactor)
		}
		e >>= 1n
		if (e > 0n) {
			b = divRound(b * b, scaleFactor)
		}
	}
	return result
}

/**
 * Compute `ln(u)` in fixed-point arithmetic for `u` near `1`
 * (`|u - scaleFactor| <= scaleFactor / 16n`) using the iterative artanh
 * Taylor series: `ln(u) = 2 * sum_{j=0}^inf t^(2j+1) / (2j+1)`, `t = (u-1)/(u+1)`.
 *
 * @param {bigint} u
 * @param {bigint} scaleFactor
 * @returns {bigint}
 */
function fpLnUnit(u, scaleFactor) {
	const t = divRound((u - scaleFactor) * scaleFactor, u + scaleFactor)
	if (t === 0n) return 0n
	const t2 = divRound(t * t, scaleFactor)
	let term = t
	let sum = t
	let k = 3n
	while (true) {
		term = divRound(term * t2, scaleFactor)
		const addend = divRound(term, k)
		if (addend === 0n) break
		sum += addend
		k += 2n
	}
	return sum * 2n
}

/**
 * Compute `ln(m)` in fixed-point arithmetic for `m > 0` by iteratively taking
 * square roots until `|u - 1| <= 1/16`, then applying `fpLnUnit`.
 *
 * @param {bigint} mFixed
 * @param {bigint} scaleFactor
 * @returns {bigint}
 */
function fpLnReduced(mFixed, scaleFactor) {
	const threshold = scaleFactor / 16n
	let u = mFixed
	let halvings = 0
	while (u > scaleFactor + threshold || u < scaleFactor - threshold) {
		u = isqrt(u * scaleFactor)
		halvings++
	}
	return fpLnUnit(u, scaleFactor) << BigInt(halvings)
}

/**
 * Compute `ln(dec)` as a fixed-point BigInt at decimal scale `scale`.
 *
 * @param {{ coeff: bigint, exp10: number }} dec Positive decimal (`coeff > 0n`).
 * @param {number} scale
 * @returns {bigint}
 */
function fpLn(dec, scale) {
	const s = dec.coeff.toString()
	const d = s.length
	let k = dec.exp10 + d - 1
	if (s[0] >= '4' || (s[0] === '3' && d > 1)) {
		k += 1
	}

	const kGuard = k === 0 ? 0 : String(Math.abs(k)).length + 2
	const internalScale = scale + 12 + kGuard
	const internalScaleFactor = pow10(internalScale)

	// m = coeff * 10^(exp10 - k), scaled by 10^internalScale
	const shift = dec.exp10 - k + internalScale
	const mFixed = shift >= 0 ? dec.coeff * pow10(shift) : divRound(dec.coeff, pow10(-shift))

	let total = fpLnReduced(mFixed, internalScaleFactor)
	if (k !== 0) {
		const ln10 = fpLnReduced(10n * internalScaleFactor, internalScaleFactor)
		total += BigInt(k) * ln10
	}

	return divRound(total, pow10(internalScale - scale))
}

/**
 * Compute `exp(y)` as a fixed-point BigInt at decimal scale `scale`, where
 * `yFixed` represents `y * 10^scale`. Uses iterative halving, Taylor series
 * `sum_{j=0}^inf r^j / j!`, and iterative squaring.
 *
 * @param {bigint} yFixed
 * @param {number} scale
 * @returns {bigint}
 */
function fpExp(yFixed, scale) {
	const scaleFactor = pow10(scale)
	if (yFixed === 0n) return scaleFactor

	const absY = yFixed < 0n ? -yFixed : yFixed
	const limit = scaleFactor / 16n
	let halvings = 0
	while (absY >> BigInt(halvings) > limit) {
		halvings++
	}

	const guard = halvings + 12
	const guardPow = pow10(guard)
	const intScaleFactor = scaleFactor * guardPow
	const r = divRound(yFixed * guardPow, 1n << BigInt(halvings))

	let sum = intScaleFactor
	let term = intScaleFactor
	let j = 1n
	while (true) {
		term = divRound(term * r, intScaleFactor * j)
		if (term === 0n) break
		sum += term
		j += 1n
	}

	let res = sum
	for (let i = 0; i < halvings; i++) {
		res = divRound(res * res, intScaleFactor)
	}

	return divRound(res, guardPow)
}

/**
 * Convert a positive parsed decimal `dec` into fixed-point at `scale`,
 * computing either `dec` or `1 / dec`.
 *
 * @param {{ coeff: bigint, exp10: number }} dec Positive decimal.
 * @param {number} scale
 * @param {boolean} reciprocal Whether to compute `1 / dec`.
 * @returns {bigint}
 */
function decimalToFixed(dec, scale, reciprocal) {
	if (!reciprocal) {
		const shift = dec.exp10 + scale
		return shift >= 0 ? dec.coeff * pow10(shift) : divRound(dec.coeff, pow10(-shift))
	}
	// (1 / (coeff * 10^exp10)) * 10^scale = 10^(scale - exp10) / coeff
	const shift = scale - dec.exp10
	if (shift >= 0) {
		return divRound(pow10(shift), dec.coeff)
	}
	return divRound(1n, dec.coeff * pow10(-shift))
}

/**
 * Compute `base ** exponent` over arbitrary-precision decimal strings using
 * straightforward iterative methods.
 *
 * @param {string} base Decimal string representing the base (plain or scientific notation).
 * @param {string} exponent Decimal string representing the exponent (plain or scientific notation).
 * @param {number} [precision=20] Number of fractional decimal places in the result (non-negative integer, max 10000).
 * @returns {string} Canonical decimal string rounded half-away-from-zero to `precision` fractional digits (trailing fractional zeros trimmed).
 * @throws {TypeError} If `base` or `exponent` is not a string, or `precision` is not a number.
 * @throws {RangeError} If inputs are malformed, `0` is raised to a negative power, a negative base is raised to a non-integer exponent, `precision` is invalid, or the result exceeds maximum magnitude.
 */
export function powerDecimalIterative(base, exponent, precision = 20) {
	const b = parseDecimal(base, 'base')
	const e = parseDecimal(exponent, 'exponent')

	if (typeof precision !== 'number') {
		throw new TypeError('precision must be a number')
	}
	if (!Number.isInteger(precision) || precision < 0 || precision > MAX_PRECISION) {
		throw new RangeError(`precision must be an integer between 0 and ${MAX_PRECISION}`)
	}

	// x^0 = 1 (including 0^0 = 1)
	if (e.coeff === 0n) {
		return '1'
	}

	// 0^e
	if (b.coeff === 0n) {
		if (e.coeff < 0n) {
			throw new RangeError('0 cannot be raised to a negative power')
		}
		return '0'
	}

	// 1^e = 1
	if (b.coeff === 1n && b.exp10 === 0) {
		return '1'
	}

	const isIntegerExp = e.exp10 >= 0

	// Negative base handling
	let resultNeg = false
	if (b.coeff < 0n) {
		if (!isIntegerExp) {
			throw new RangeError('Negative base cannot be raised to a non-integer exponent')
		}
		// (-1)^n fast path
		if (b.coeff === -1n && b.exp10 === 0) {
			const isOdd = e.exp10 === 0 && (e.coeff & 1n) !== 0n
			return isOdd ? '-1' : '1'
		}
		resultNeg = e.exp10 === 0 && (e.coeff & 1n) !== 0n
	}

	const absBase = b.coeff < 0n ? { coeff: -b.coeff, exp10: b.exp10 } : b

	// Exponent === 1 fast path
	if (e.coeff === 1n && e.exp10 === 0) {
		const fixed = decimalToFixed(absBase, precision + 2, false)
		return formatFixed(resultNeg ? -fixed : fixed, precision + 2, precision)
	}

	// Estimate result magnitude: log10(|base|^exponent) = exponent * log10(|base|)
	const log10Base = approxLog10(absBase)
	const expApprox = approxNumber(e)
	const estLog10 = expApprox * log10Base

	if (estLog10 > MAX_RESULT_DIGITS) {
		throw new RangeError(`Result magnitude (10^${Math.floor(estLog10)}) exceeds maximum supported digits (${MAX_RESULT_DIGITS})`)
	}
	if (estLog10 < -(precision + 10) * 1.01 - 10) {
		return '0'
	}

	const estIntDigits = Math.max(0, Math.ceil(estLog10) + 1)

	// Integer exponent path: iterative binary exponentiation
	if (isIntegerExp) {
		const absExpInt = (e.coeff < 0n ? -e.coeff : e.coeff) * pow10(e.exp10)
		const isNegExp = e.coeff < 0n

		// Exact integer base with positive integer exponent -> exact BigInt power
		if (!isNegExp && absBase.exp10 >= 0) {
			const exactPow = bigintPowIterative(absBase.coeff, absExpInt)
			const trailingZeros = absBase.exp10 * Number(absExpInt)
			const signPrefix = resultNeg ? '-' : ''
			return `${signPrefix}${exactPow.toString()}${'0'.repeat(trailingZeros)}`
		}

		// Positive integer exponent on fractional base with modest exact length
		if (!isNegExp && absBase.exp10 < 0 && absExpInt <= 10_000n) {
			const exactScale = -absBase.exp10 * Number(absExpInt)
			if (exactScale <= precision + 50) {
				const exactPow = bigintPowIterative(absBase.coeff, absExpInt)
				return formatFixed(resultNeg ? -exactPow : exactPow, exactScale, precision)
			}
		}

		// General integer exponent (positive or negative): fixed-point binary exponentiation
		const expDigits = absExpInt.toString().length
		const workScale = precision + estIntDigits + expDigits + 20
		const scaleFactor = pow10(workScale)
		const baseFixed = decimalToFixed(absBase, workScale, isNegExp)
		const powFixed = fpPowIterative(baseFixed, absExpInt, scaleFactor)
		return formatFixed(resultNeg ? -powFixed : powFixed, workScale, precision)
	}

	// Fractional exponent path: exp(exponent * ln(base))
	const expIntDigits = Math.max(0, e.exp10 + (e.coeff < 0n ? -e.coeff : e.coeff).toString().length)
	const yScale = precision + estIntDigits + 20
	const lnScale = yScale + expIntDigits + 15

	const lnBaseFixed = fpLn(absBase, lnScale)
	// y = e.coeff * 10^(e.exp10) * lnBaseFixed * 10^(-lnScale), scaled to yScale
	const shift = e.exp10 - lnScale + yScale
	const rawY = e.coeff * lnBaseFixed
	const yFixed = shift >= 0 ? rawY * pow10(shift) : divRound(rawY, pow10(-shift))

	const expFixed = fpExp(yFixed, yScale)
	return formatFixed(expFixed, yScale, precision)
}
