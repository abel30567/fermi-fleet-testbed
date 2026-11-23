/**
 * @fileoverview Numerically robust arbitrary-precision decimal string division.
 */

const DECIMAL_PATTERN = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/;
const VALID_ROUNDING_MODES = new Set(['half-even', 'half-up', 'truncate']);
const DEFAULT_PRECISION = 20;
const DEFAULT_MAX_OUTPUT_DIGITS = 1_000_000;

/**
 * Parse and normalize a finite decimal string into exact canonical scientific components:
 * `value = (negative ? -1 : 1) * digits * 10^exp` with `digits` having no leading or trailing zeros
 * (or `digits === 0n` with `negative === false` and `exp === 0n`).
 *
 * @param {string} value - Decimal string to parse.
 * @param {string} name - Parameter name for error reporting.
 * @returns {{ negative: boolean, digits: bigint, digitCount: bigint, exp: bigint }}
 */
function parseDecimal(value, name) {
	if (typeof value !== 'string') {
		throw new TypeError(`${name} must be a string`);
	}
	const trimmed = value.trim();
	const match = DECIMAL_PATTERN.exec(trimmed);
	if (!match) {
		throw new RangeError(`${name} must be a valid finite decimal string: "${value}"`);
	}

	const [, sign, intPart, fracPart, leadingFrac, expStr] = match;
	const fractional = fracPart ?? leadingFrac ?? '';
	const rawDigits = (intPart ?? '') + fractional;
	const strippedLeading = rawDigits.replace(/^0+/, '');

	if (strippedLeading.length === 0) {
		return { negative: false, digits: 0n, digitCount: 0n, exp: 0n };
	}

	let end = strippedLeading.length;
	while (end > 1 && strippedLeading.charCodeAt(end - 1) === 48) {
		end -= 1;
	}

	const trailingZeros = BigInt(strippedLeading.length - end);
	const coreDigits = strippedLeading.slice(0, end);
	const explicitExp = expStr !== undefined ? BigInt(expStr) : 0n;
	const exp = explicitExp - BigInt(fractional.length) + trailingZeros;

	return {
		negative: sign === '-',
		digits: BigInt(coreDigits),
		digitCount: BigInt(coreDigits.length),
		exp,
	};
}

/**
 * Format a non-negative scaled integer `scaledValue` representing `scaledValue * 10^(-precision)`
 * into a decimal string.
 *
 * @param {bigint} scaledValue - Non-negative integer quotient scaled by 10^precision.
 * @param {number} precision - Number of fractional digits.
 * @param {boolean} negative - Whether the quotient is negative.
 * @param {boolean} trimTrailingZeros - Whether to trim trailing zeros after the decimal point.
 * @returns {string}
 */
function formatScaledDecimal(scaledValue, precision, negative, trimTrailingZeros) {
	if (scaledValue === 0n) {
		if (trimTrailingZeros || precision === 0) {
			return '0';
		}
		return `0.${'0'.repeat(precision)}`;
	}

	const digits = scaledValue.toString();
	let intPart;
	let fracPart;

	if (precision === 0) {
		intPart = digits;
		fracPart = '';
	} else if (digits.length <= precision) {
		intPart = '0';
		fracPart = '0'.repeat(precision - digits.length) + digits;
	} else {
		const splitIdx = digits.length - precision;
		intPart = digits.slice(0, splitIdx);
		fracPart = digits.slice(splitIdx);
	}

	if (trimTrailingZeros && fracPart.length > 0) {
		let end = fracPart.length;
		while (end > 0 && fracPart.charCodeAt(end - 1) === 48) {
			end -= 1;
		}
		fracPart = fracPart.slice(0, end);
	}

	const signPrefix = negative ? '-' : '';
	return fracPart.length > 0 ? `${signPrefix}${intPart}.${fracPart}` : `${signPrefix}${intPart}`;
}

/**
 * Divide two arbitrary-precision decimal strings with configurable fractional precision.
 *
 * Uses exact `BigInt` normalization, decimal exponent scaling, magnitude-based underflow
 * short-circuiting, and exact remainder comparison (`2 * remainder` vs `divisor`) so that
 * intermediate floating-point rounding never occurs and the result satisfies a strict
 * error bound of `<= 0.5 * 10^(-precision)` for `'half-even'` and `'half-up'` (or
 * `< 10^(-precision)` for `'truncate'`).
 *
 * @param {string} dividend - Numerator as a finite decimal string (supports optional sign and scientific notation).
 * @param {string} divisor - Non-zero denominator as a finite decimal string (supports optional sign and scientific notation).
 * @param {number} [precision=20] - Non-negative integer number of digits after the decimal point.
 * @param {object} [options] - Optional rounding and formatting settings.
 * @param {'half-even'|'half-up'|'truncate'} [options.roundingMode='half-even'] - Rounding strategy applied at `precision`.
 * @param {boolean} [options.trimTrailingZeros=true] - Remove redundant trailing zeros after the decimal point.
 * @param {number} [options.maxOutputDigits=1000000] - Upper guard on output digit count to prevent runaway allocation on extreme exponents.
 * @returns {string} Exact rounded quotient as a canonical decimal string.
 * @throws {TypeError} If inputs or option fields have invalid types.
 * @throws {RangeError} If strings are not valid finite decimals, `divisor` is zero, `precision` is negative, or output exceeds `maxOutputDigits`.
 */
export function divideDecimalStable(dividend, divisor, precision = DEFAULT_PRECISION, options = {}) {
	const num = parseDecimal(dividend, 'dividend');
	const den = parseDecimal(divisor, 'divisor');

	if (typeof precision !== 'number') {
		throw new TypeError('precision must be a non-negative safe integer');
	}
	if (!Number.isSafeInteger(precision) || precision < 0) {
		throw new RangeError('precision must be a non-negative safe integer');
	}

	if (options === null || typeof options !== 'object' || Array.isArray(options)) {
		throw new TypeError('options must be an object');
	}

	const {
		roundingMode = 'half-even',
		trimTrailingZeros = true,
		maxOutputDigits = DEFAULT_MAX_OUTPUT_DIGITS,
	} = options;

	if (typeof roundingMode !== 'string' || !VALID_ROUNDING_MODES.has(roundingMode)) {
		throw new RangeError(
			`options.roundingMode must be one of: ${Array.from(VALID_ROUNDING_MODES).join(', ')}`,
		);
	}
	if (typeof trimTrailingZeros !== 'boolean') {
		throw new TypeError('options.trimTrailingZeros must be a boolean');
	}
	if (typeof maxOutputDigits !== 'number' || !Number.isSafeInteger(maxOutputDigits) || maxOutputDigits < 1) {
		throw new RangeError('options.maxOutputDigits must be a positive safe integer');
	}

	if (den.digits === 0n) {
		throw new RangeError('Division by zero');
	}

	if (num.digits === 0n) {
		return formatScaledDecimal(0n, precision, false, trimTrailingZeros);
	}

	const negative = num.negative !== den.negative;
	const shift = num.exp - den.exp + BigInt(precision);

	// Tight upper-bound magnitude check:
	// (num.digits / den.digits) * 10^shift < 10^(num.digitCount - den.digitCount + 1 + shift).
	// When that exponent is <= -1, the scaled quotient is strictly less than 0.1 (< 0.5),
	// so all supported rounding modes yield 0 without allocating 10^(-shift).
	const upperBoundExp = num.digitCount - den.digitCount + 1n + shift;
	if (upperBoundExp < 0n) {
		return formatScaledDecimal(0n, precision, false, trimTrailingZeros);
	}

	const maxDigitsBig = BigInt(maxOutputDigits);
	if (upperBoundExp > maxDigitsBig) {
		throw new RangeError(
			`Quotient exceeds maxOutputDigits (${maxOutputDigits}); increase options.maxOutputDigits if intended`,
		);
	}

	let scaledNum = num.digits;
	let scaledDen = den.digits;

	if (shift > 0n) {
		scaledNum *= 10n ** shift;
	} else if (shift < 0n) {
		scaledDen *= 10n ** (-shift);
	}

	let quotient = scaledNum / scaledDen;
	const remainder = scaledNum % scaledDen;

	if (remainder !== 0n && roundingMode !== 'truncate') {
		const twiceRemainder = remainder << 1n;
		if (roundingMode === 'half-up') {
			if (twiceRemainder >= scaledDen) {
				quotient += 1n;
			}
		} else if (roundingMode === 'half-even') {
			if (twiceRemainder > scaledDen || (twiceRemainder === scaledDen && (quotient & 1n) === 1n)) {
				quotient += 1n;
			}
		}
	}

	return formatScaledDecimal(quotient, precision, negative, trimTrailingZeros);
}
