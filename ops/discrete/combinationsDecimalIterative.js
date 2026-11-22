const DECIMAL_PATTERN = /^([+-])?(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/;
const MAX_EXPONENT_SHIFT = 1_000_000n;

/**
 * Parses a decimal string representing a non-negative integer into a BigInt.
 *
 * Accepts optional leading `+`/`-` signs, integer and fractional forms with zero
 * fractional part (e.g. `"10"`, `"10.0"`, `"+10"`, `"-0.0"`), and optional
 * scientific notation resolving to an exact integer (e.g. `"1e2"`, `"1.5e1"`).
 *
 * @param {string} value - The input decimal string.
 * @param {string} name - Parameter name for error messages.
 * @returns {bigint} Parsed non-negative integer value.
 * @throws {TypeError} If `value` is not a string.
 * @throws {RangeError} If `value` is not a valid decimal string, is negative,
 *   is not an exact integer, or exceeds the supported exponent range.
 */
function parseNonNegativeIntegerDecimal(value, name) {
	if (typeof value !== 'string') {
		throw new TypeError(`${name} must be a decimal string`);
	}

	const trimmed = value.trim();
	const match = DECIMAL_PATTERN.exec(trimmed);
	if (!match) {
		throw new RangeError(`${name} must be a valid decimal string: "${value}"`);
	}

	const sign = match[1] === '-' ? -1 : 1;
	const intPart = match[2] ?? '';
	const fracPart = match[3] ?? match[4] ?? '';
	const expStr = match[5];

	const combined = intPart + fracPart;
	let firstNonZero = 0;
	while (firstNonZero < combined.length && combined.charCodeAt(firstNonZero) === 48) {
		firstNonZero += 1;
	}

	// All zeros (including "-0", "-0.0", "0e1000") represent exact zero.
	if (firstNonZero === combined.length) {
		return 0n;
	}

	if (sign < 0) {
		throw new RangeError(`${name} must be a non-negative integer: "${value}"`);
	}

	let lastNonZero = combined.length - 1;
	while (lastNonZero >= firstNonZero && combined.charCodeAt(lastNonZero) === 48) {
		lastNonZero -= 1;
	}

	const sigDigits = combined.slice(firstNonZero, lastNonZero + 1);
	const trailingZeros = BigInt(combined.length - 1 - lastNonZero);
	const exponent = expStr !== undefined ? BigInt(expStr) : 0n;
	const effectiveShift = exponent - BigInt(fracPart.length) + trailingZeros;

	if (effectiveShift < 0n) {
		throw new RangeError(`${name} must be an exact integer: "${value}"`);
	}

	if (effectiveShift > MAX_EXPONENT_SHIFT) {
		throw new RangeError(`${name} exponent exceeds supported limit: "${value}"`);
	}

	const base = BigInt(sigDigits);
	if (effectiveShift === 0n) {
		return base;
	}

	return base * (10n ** effectiveShift);
}

/**
 * Validates the precision argument as a non-negative safe integer.
 *
 * @param {number} precision - Number of fractional decimal digits to format.
 * @returns {number} Validated precision.
 * @throws {TypeError} If `precision` is not a number.
 * @throws {RangeError} If `precision` is not a non-negative safe integer.
 */
function validatePrecision(precision) {
	if (typeof precision !== 'number') {
		throw new TypeError('precision must be a number');
	}
	if (!Number.isSafeInteger(precision) || precision < 0) {
		throw new RangeError('precision must be a non-negative safe integer');
	}
	return precision;
}

/**
 * Formats a non-negative BigInt as a normalized decimal string with the
 * requested number of fractional digits.
 *
 * @param {bigint} value - Non-negative integer value.
 * @param {number} precision - Non-negative number of fractional digits.
 * @returns {string} Formatted decimal string.
 */
function formatIntegerDecimal(value, precision) {
	const intStr = value.toString();
	if (precision === 0) {
		return intStr;
	}
	return `${intStr}.${'0'.repeat(precision)}`;
}

/**
 * Computes the binomial coefficient `C(n, k) = n! / (k! * (n - k)!)` over
 * arbitrary-precision non-negative integer decimal strings using an iterative
 * multiplicative algorithm with BigInt arithmetic.
 *
 * Uses symmetry `r = min(k, n - k)` and evaluates the product iteratively via
 * `result = result * (n - r + i) / i` for `i = 1..r`, where each intermediate
 * division is mathematically exact. Returns `"0"` (formatted to `precision`)
 * when `k > n`.
 *
 * @param {string} n - Non-negative integer decimal string (total items).
 * @param {string} k - Non-negative integer decimal string (chosen items).
 * @param {number} [precision=0] - Non-negative integer number of fractional
 *   digits in the returned decimal string (`0` returns a plain integer string;
 *   values `> 0` append a decimal point and `precision` trailing zeros).
 * @returns {string} Exact binomial coefficient as a normalized decimal string.
 * @throws {TypeError} If `n` or `k` is not a string, or `precision` is not a number.
 * @throws {RangeError} If `n` or `k` is not a valid non-negative integer decimal
 *   string, or if `precision` is not a non-negative safe integer.
 */
export function combinationsDecimalIterative(n, k, precision = 0) {
	const nBig = parseNonNegativeIntegerDecimal(n, 'n');
	const kBig = parseNonNegativeIntegerDecimal(k, 'k');
	const prec = validatePrecision(precision);

	if (kBig > nBig) {
		return formatIntegerDecimal(0n, prec);
	}

	const diff = nBig - kBig;
	const r = kBig < diff ? kBig : diff;

	if (r === 0n) {
		return formatIntegerDecimal(1n, prec);
	}

	const base = nBig - r;
	let result = 1n;
	for (let i = 1n; i <= r; i += 1n) {
		result = (result * (base + i)) / i;
	}

	return formatIntegerDecimal(result, prec);
}
