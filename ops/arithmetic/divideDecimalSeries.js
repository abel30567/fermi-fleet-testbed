/**
 * Arbitrary-precision decimal string division using a factored geometric
 * (Neumann / Goldschmidt) series identity over BigInt fixed-point arithmetic.
 *
 * For any positive divisor D with bit length b, normalizing x = D / 2^b places
 * x in [1/2, 1), so r = 1 - x lies in (0, 1/2]. The reciprocal satisfies the
 * geometric series and its Euler/Goldschmidt product identity:
 *
 *   1 / x = 1 / (1 - r) = sum_{n=0}^{inf} r^n = prod_{j=0}^{inf} (1 + r^(2^j))
 *
 * Because r <= 1/2, the factors converge quadratically in O(log(precision))
 * iterations using only BigInt addition, subtraction, multiplication, and
 * bit shifts. A single exact remainder check (R = N - q * D) resolves any
 * boundary case for exact round-half-away-from-zero decimal rounding.
 */

const DECIMAL_PATTERN = /^[+-]?(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/

/**
 * Compute the bit length of a positive BigInt.
 *
 * @param {bigint} n - Positive integer.
 * @returns {number} Number of bits required to represent n.
 */
function bitLength(n) {
  const hex = n.toString(16)
  const firstNibble = parseInt(hex[0], 16)
  return (hex.length - 1) * 4 + (32 - Math.clz32(firstNibble))
}

/**
 * Parse and validate a decimal string into a canonical sign, BigInt mantissa,
 * and base-10 scale such that value = (-1)^negative * mantissa * 10^(-scale).
 *
 * @param {string} value - Decimal string input.
 * @param {string} name - Parameter name for error messages.
 * @returns {{ negative: boolean, mantissa: bigint, scale: number, digitCount: number }}
 */
function parseDecimal(value, name) {
  if (typeof value !== 'string') {
    throw new TypeError(`${name} must be a decimal string`)
  }
  const trimmed = value.trim()
  const match = DECIMAL_PATTERN.exec(trimmed)
  if (!match) {
    throw new RangeError(`${name} is not a valid decimal string: "${value}"`)
  }

  const negative = trimmed[0] === '-'
  const intDigits = match[1] ?? ''
  const fracDigits = match[2] ?? match[3] ?? ''
  const expStr = match[4]

  let exponent = 0
  if (expStr !== undefined) {
    exponent = Number(expStr)
    if (!Number.isSafeInteger(exponent)) {
      throw new RangeError(`${name} exponent out of safe integer range: "${value}"`)
    }
  }

  const combined = (intDigits + fracDigits).replace(/^0+/, '')
  if (combined.length === 0) {
    return { negative: false, mantissa: 0n, scale: 0, digitCount: 0 }
  }

  const trimmedRight = combined.replace(/0+$/, '')
  const trailingZeros = combined.length - trimmedRight.length
  const scale = fracDigits.length - exponent - trailingZeros
  if (!Number.isSafeInteger(scale)) {
    throw new RangeError(`${name} scale out of safe integer range: "${value}"`)
  }

  return {
    negative,
    mantissa: BigInt(trimmedRight),
    scale,
    digitCount: trimmedRight.length,
  }
}

/**
 * Compute floor(N / D) and remainder R = N - floor(N / D) * D for positive
 * BigInts N >= D > 0 using the geometric series product identity
 * 1 / (1 - r) = prod_{j >= 0} (1 + r^(2^j)) in binary fixed-point arithmetic.
 *
 * @param {bigint} numerator - Positive integer N >= D.
 * @param {bigint} denominator - Positive integer D > 0.
 * @returns {{ quotient: bigint, remainder: bigint }}
 */
function dividePositiveBySeries(numerator, denominator) {
  const bN = bitLength(numerator)
  const bD = bitLength(denominator)
  const kBits = bN - bD + 1
  const guardBits = 48
  const workBits = BigInt(kBits + guardBits)
  const one = 1n << workBits

  // Normalize x = D / 2^bD in [1/2, 1) with workBits fractional bits.
  const bDBig = BigInt(bD)
  const xFp =
    workBits >= bDBig
      ? denominator << (workBits - bDBig)
      : denominator >> (bDBig - workBits)

  // r = 1 - x in (0, 1/2], so 1/x = 1/(1 - r) = prod_{j >= 0} (1 + r^(2^j)).
  let rFp = one - xFp
  let invXFp = one

  while (rFp > 0n) {
    invXFp = (invXFp * (one + rFp)) >> workBits
    rFp = (rFp * rFp) >> workBits
  }

  // Approximate quotient: N / D = (N / 2^bD) * (1 / x).
  let quotient = (numerator * invXFp) >> (workBits + bDBig)

  // Exact remainder verification eliminates any fixed-point truncation boundary error.
  let remainder = numerator - quotient * denominator
  while (remainder < 0n) {
    quotient -= 1n
    remainder += denominator
  }
  while (remainder >= denominator) {
    quotient += 1n
    remainder -= denominator
  }

  return { quotient, remainder }
}

/**
 * Format a non-negative scaled integer as a canonical decimal string with
 * trailing fractional zeros removed and no negative zero.
 *
 * @param {bigint} scaled - Rounded non-negative integer representing |result| * 10^precision.
 * @param {boolean} negative - Whether the quotient is negative.
 * @param {number} precision - Number of fractional digits in scaled.
 * @returns {string}
 */
function formatDecimal(scaled, negative, precision) {
  if (scaled === 0n) {
    return '0'
  }

  const sign = negative ? '-' : ''
  const digits = scaled.toString()

  if (precision === 0) {
    return sign + digits
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

  const trimmedFrac = fracPart.replace(/0+$/, '')
  if (trimmedFrac.length === 0) {
    return sign + intPart
  }
  return `${sign}${intPart}.${trimmedFrac}`
}

/**
 * Divide two arbitrary-precision decimal strings to a configurable number of
 * fractional decimal places using a geometric-series reciprocal expansion.
 *
 * Results are rounded half away from zero to `precision` decimal places and
 * formatted canonically (no leading zeros except `'0'`, no trailing fractional
 * zeros, and no `'-0'`).
 *
 * @param {string} dividend - Decimal string numerator (supports optional sign and scientific notation).
 * @param {string} divisor - Non-zero decimal string denominator (supports optional sign and scientific notation).
 * @param {number} [precision=20] - Non-negative integer number of decimal places to compute.
 * @returns {string} Canonical arbitrary-precision decimal string quotient.
 * @throws {TypeError} If `dividend` or `divisor` is not a string, or `precision` is not a number.
 * @throws {RangeError} If inputs are malformed decimal strings, `divisor` is zero, or `precision` is not a non-negative integer.
 */
export function divideDecimalSeries(dividend, divisor, precision = 20) {
  const a = parseDecimal(dividend, 'dividend')
  const b = parseDecimal(divisor, 'divisor')

  if (typeof precision !== 'number') {
    throw new TypeError('precision must be a non-negative integer')
  }
  if (!Number.isInteger(precision) || precision < 0) {
    throw new RangeError('precision must be a non-negative integer')
  }
  if (b.mantissa === 0n) {
    throw new RangeError('Division by zero')
  }
  if (a.mantissa === 0n) {
    return '0'
  }

  const negative = a.negative !== b.negative
  const shift = precision + b.scale - a.scale
  if (!Number.isSafeInteger(shift)) {
    throw new RangeError('Result scale exceeds safe integer range')
  }

  let numerator
  let denominator
  if (shift >= 0) {
    numerator = a.mantissa * 10n ** BigInt(shift)
    denominator = b.mantissa
  } else {
    const negShift = -shift
    // Fast underflow check: if 2 * a.mantissa < b.mantissa * 10^negShift, result rounds to 0.
    if (negShift >= a.digitCount - b.digitCount + 2) {
      return '0'
    }
    numerator = a.mantissa
    denominator = b.mantissa * 10n ** BigInt(negShift)
  }

  let quotient
  let remainder
  if (numerator < denominator) {
    quotient = 0n
    remainder = numerator
  } else {
    ;({ quotient, remainder } = dividePositiveBySeries(numerator, denominator))
  }

  // Exact round-half-away-from-zero: round up when remainder / denominator >= 1/2.
  if (remainder * 2n >= denominator) {
    quotient += 1n
  }

  return formatDecimal(quotient, negative, precision)
}
