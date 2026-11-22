/**
 * Arbitrary-precision decimal subtraction using a closed-form scaled-integer
 * positional series identity:
 *
 *   a - b = sum_k (a_k - b_k) * 10^k = (A * 10^(s - s_a) - B * 10^(s - s_b)) * 10^-s
 *
 * where a = A * 10^-s_a, b = B * 10^-s_b, and s = max(s_a, s_b).
 *
 * @module ops/arithmetic/subtractDecimalSeries
 */

const DECIMAL_PATTERN = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))$/;

/**
 * Parse and validate an arbitrary-precision base-10 decimal string into
 * an exact scaled BigInt representation `unscaled * 10^(-scale)`.
 *
 * @param {string} value - Decimal string to parse.
 * @param {string} name - Parameter name for error messages.
 * @returns {{ unscaled: bigint, scale: number }} Exact scaled representation.
 */
function parseDecimal(value, name) {
	if (typeof value !== 'string') {
		throw new TypeError(`${name} must be a decimal string`);
	}

	const match = DECIMAL_PATTERN.exec(value);
	if (!match) {
		throw new RangeError(`${name} is not a valid decimal string: ${JSON.stringify(value)}`);
	}

	const sign = match[1] === '-' ? -1n : 1n;
	const intPart = match[2] ?? '0';
	const fracPart = match[3] ?? match[4] ?? '';
	const digits = intPart + fracPart;
	const unscaled = sign * BigInt(digits);

	return { unscaled, scale: fracPart.length };
}

/**
 * Format an exact scaled BigInt `unscaled * 10^(-scale)` as a canonical decimal string.
 *
 * @param {bigint} unscaled - Signed unscaled integer value.
 * @param {number} scale - Number of fractional digits (>= 0).
 * @param {boolean} trimTrailingZeros - Whether to strip trailing fractional zeros.
 * @returns {string} Canonical decimal string (never "-0" or "-0.00").
 */
function formatDecimal(unscaled, scale, trimTrailingZeros) {
	if (unscaled === 0n) {
		return scale > 0 && !trimTrailingZeros ? `0.${'0'.repeat(scale)}` : '0';
	}

	const isNegative = unscaled < 0n;
	const digits = (isNegative ? -unscaled : unscaled).toString();
	const prefix = isNegative ? '-' : '';

	if (scale === 0) {
		return prefix + digits;
	}

	const padded = digits.padStart(scale + 1, '0');
	const splitIndex = padded.length - scale;
	const intPart = padded.slice(0, splitIndex);
	let fracPart = padded.slice(splitIndex);

	if (trimTrailingZeros) {
		fracPart = fracPart.replace(/0+$/, '');
		if (fracPart.length === 0) {
			return prefix + intPart;
		}
	}

	return `${prefix}${intPart}.${fracPart}`;
}

/**
 * Round a signed scaled BigInt from `fromScale` down to `toScale` using
 * half-away-from-zero rounding.
 *
 * @param {bigint} unscaled - Signed unscaled integer value.
 * @param {number} fromScale - Current fractional scale.
 * @param {number} toScale - Target fractional scale (< fromScale).
 * @returns {bigint} Rounded unscaled integer at `toScale`.
 */
function roundHalfAwayFromZero(unscaled, fromScale, toScale) {
	const drop = BigInt(fromScale - toScale);
	const factor = 10n ** drop;
	const half = factor / 2n;
	const isNegative = unscaled < 0n;
	const absVal = isNegative ? -unscaled : unscaled;

	let quotient = absVal / factor;
	const remainder = absVal % factor;

	if (remainder >= half) {
		quotient += 1n;
	}

	if (quotient === 0n) {
		return 0n;
	}

	return isNegative ? -quotient : quotient;
}

/**
 * Subtract two arbitrary-precision decimal strings (`a - b`) with an optional
 * configurable decimal precision argument.
 *
 * Uses the closed-form scaled-integer series identity:
 * `a - b = (A * 10^(s - s_a) - B * 10^(s - s_b)) * 10^(-s)`.
 *
 * - When `precision` is omitted (`undefined`), returns the exact normalized
 *   decimal string with unnecessary trailing fractional zeros stripped.
 * - When `precision` is provided as a non-negative integer, rounds the result
 *   to `precision` fractional digits (half-away-from-zero) and formats with
 *   exactly `precision` fractional digits (no decimal point when `precision === 0`).
 *
 * @param {string} a - Minuend as a base-10 decimal string (e.g. `"123.45"`, `"-0.5"`, `".25"`).
 * @param {string} b - Subtrahend as a base-10 decimal string.
 * @param {number} [precision] - Optional non-negative integer number of decimal places.
 * @returns {string} The difference `a - b` formatted as a decimal string.
 * @throws {TypeError} If `a` or `b` is not a string, or `precision` is not a number when provided.
 * @throws {RangeError} If `a` or `b` is not a valid decimal string, or `precision` is not a safe non-negative integer.
 */
export function subtractDecimalSeries(a, b, precision) {
	const parsedA = parseDecimal(a, 'a');
	const parsedB = parseDecimal(b, 'b');

	if (precision !== undefined) {
		if (typeof precision !== 'number') {
			throw new TypeError('precision must be a non-negative integer');
		}
		if (!Number.isSafeInteger(precision) || precision < 0) {
			throw new RangeError('precision must be a non-negative safe integer');
		}
	}

	const commonScale = Math.max(parsedA.scale, parsedB.scale);
	const scaledA = parsedA.unscaled * 10n ** BigInt(commonScale - parsedA.scale);
	const scaledB = parsedB.unscaled * 10n ** BigInt(commonScale - parsedB.scale);

	// Closed-form difference identity: a - b = a + (-b) = (scaledA - scaledB) * 10^(-commonScale)
	const diff = scaledA - scaledB;

	if (precision === undefined) {
		return formatDecimal(diff, commonScale, true);
	}

	if (precision < commonScale) {
		const rounded = roundHalfAwayFromZero(diff, commonScale, precision);
		return formatDecimal(rounded, precision, false);
	}

	const expanded = diff * 10n ** BigInt(precision - commonScale);
	return formatDecimal(expanded, precision, false);
}
