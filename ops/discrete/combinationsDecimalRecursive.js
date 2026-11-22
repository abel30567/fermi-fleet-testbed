/**
 * @fileoverview Arbitrary-precision discrete combinations C(n, k) over decimal strings
 * using a recursive divide-and-conquer binary-splitting product tree.
 */

const DECIMAL_PATTERN = /^([+-])?(\d+)(?:\.(\d+))?$/;

/**
 * Parses and validates a non-negative integer represented as a decimal string.
 *
 * Accepts standard decimal integer strings (e.g. `"0"`, `"42"`, `"+10"`, `"10.0"`,
 * `"5.000"`). Rejects non-strings, negative values, fractional values with non-zero
 * fractional digits, and malformed strings.
 *
 * @param {string} value - The decimal string to parse.
 * @param {string} name - Parameter name for descriptive error messages.
 * @returns {bigint} The parsed non-negative integer as a native `BigInt`.
 * @throws {TypeError} If `value` is not a string.
 * @throws {RangeError} If `value` is malformed, negative, or fractional.
 */
function parseNonNegativeIntegerDecimal(value, name) {
	if (typeof value !== 'string') {
		throw new TypeError(`${name} must be a decimal string`);
	}

	const trimmed = value.trim();
	const match = DECIMAL_PATTERN.exec(trimmed);
	if (!match) {
		throw new RangeError(`${name} must be a valid non-negative integer decimal string`);
	}

	const [, sign, intPart, fracPart] = match;

	if (sign === '-') {
		throw new RangeError(`${name} must be non-negative`);
	}

	if (fracPart !== undefined && /[^0]/.test(fracPart)) {
		throw new RangeError(`${name} must be an integer without non-zero fractional digits`);
	}

	return BigInt(intPart);
}

/**
 * Validates the configurable decimal precision argument.
 *
 * @param {number} precision - Number of fractional digits to format in the output.
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
}

/**
 * Computes the exact product of all integers in the inclusive range `[low, high]`
 * using recursive divide-and-conquer binary splitting.
 *
 * Balancing operand sizes at each recursion level allows V8's sub-quadratic BigInt
 * multiplication to operate efficiently while keeping recursion depth at O(log(high - low)).
 *
 * @param {bigint} low - Lower bound of the product range (inclusive).
 * @param {bigint} high - Upper bound of the product range (inclusive).
 * @returns {bigint} The product `low * (low + 1) * ... * high`, or `1n` if `low > high`.
 */
function rangeProduct(low, high) {
	if (low > high) {
		return 1n;
	}
	if (low === high) {
		return low;
	}
	if (low + 1n === high) {
		return low * high;
	}

	const mid = low + ((high - low) >> 1n);
	return rangeProduct(low, mid) * rangeProduct(mid + 1n, high);
}

/**
 * Formats an exact non-negative `BigInt` as a decimal string with `precision`
 * fractional digits.
 *
 * @param {bigint} value - Exact integer result.
 * @param {number} precision - Number of fractional digits to append (`0` omits decimal point).
 * @returns {string} Formatted decimal string.
 */
function formatDecimalInteger(value, precision) {
	const intStr = value.toString();
	return precision === 0 ? intStr : `${intStr}.${'0'.repeat(precision)}`;
}

/**
 * Computes the binomial coefficient `C(n, k) = n! / (k! * (n - k)!)` over
 * arbitrary-precision decimal strings using native `BigInt` and a recursive
 * divide-and-conquer binary-splitting product tree.
 *
 * Exploits symmetry `C(n, k) = C(n, min(k, n - k))` to minimize the product tree
 * size, returning `"0"` when `k > n` and `"1"` when `k === 0` or `k === n`
 * (formatted with `precision` fractional digits).
 *
 * @param {string} n - Non-negative integer decimal string representing total items.
 * @param {string} k - Non-negative integer decimal string representing chosen items.
 * @param {number} [precision=0] - Non-negative integer number of fractional digits in output.
 * @returns {string} Exact decimal string representation of `C(n, k)`.
 * @throws {TypeError} If `n` or `k` is not a string, or `precision` is not a number.
 * @throws {RangeError} If `n` or `k` is negative, fractional, or malformed, or if `precision` is invalid.
 */
export function combinationsDecimalRecursive(n, k, precision = 0) {
	const nVal = parseNonNegativeIntegerDecimal(n, 'n');
	const kVal = parseNonNegativeIntegerDecimal(k, 'k');
	validatePrecision(precision);

	if (kVal > nVal) {
		return formatDecimalInteger(0n, precision);
	}
	if (kVal === 0n || kVal === nVal) {
		return formatDecimalInteger(1n, precision);
	}

	const diff = nVal - kVal;
	const r = kVal < diff ? kVal : diff;

	const numerator = rangeProduct(nVal - r + 1n, nVal);
	const denominator = rangeProduct(1n, r);

	return formatDecimalInteger(numerator / denominator, precision);
}
