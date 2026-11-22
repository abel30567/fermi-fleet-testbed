/**
 * Regular expression matching strict decimal strings with optional sign and
 * optional scientific notation exponent.
 * Examples: "0", "-12.34", "+.5", "5.", "1.25e-10", "-3E+4".
 */
const DECIMAL_PATTERN =
	/^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/;

/**
 * Upper bound on the magnitude of a decimal scale or scientific notation
 * exponent to guard against excessive memory allocation when computing powers
 * of 10n.
 */
const MAX_SCALE = 100_000;

/**
 * Computes 10n ** BigInt(exp) for a non-negative integer exponent.
 *
 * @param {number} exp - Non-negative integer exponent.
 * @returns {bigint} 10 raised to the power of `exp`.
 */
function pow10(exp) {
	return 10n ** BigInt(exp);
}

/**
 * Parses and validates a decimal string into an exact scaled BigInt
 * representation `{ value, scale }` representing `value * 10^(-scale)`.
 *
 * @param {unknown} raw - Candidate decimal string element.
 * @param {string} vectorName - Vector identifier for error messages ("a" or "b").
 * @param {number} index - Element index within the vector.
 * @returns {{ value: bigint, scale: number }} Exact scaled integer representation.
 * @throws {TypeError} If `raw` is not a string.
 * @throws {RangeError} If `raw` is not a valid decimal string or its scale exceeds safe bounds.
 */
function parseDecimalString(raw, vectorName, index) {
	if (typeof raw !== "string") {
		throw new TypeError(
			`Expected vector "${vectorName}" element at index ${index} to be a decimal string, got ${raw === null ? "null" : typeof raw}`,
		);
	}

	const match = DECIMAL_PATTERN.exec(raw);
	if (match === null) {
		throw new RangeError(
			`Invalid decimal string in vector "${vectorName}" at index ${index}: ${JSON.stringify(raw)}`,
		);
	}

	const signChar = match[1];
	const intPart = match[2] ?? "";
	const fracPart = match[3] ?? match[4] ?? "";
	const expPart = match[5];

	const digits = intPart + fracPart;
	let unsignedValue = BigInt(digits);

	if (unsignedValue === 0n) {
		return { value: 0n, scale: 0 };
	}

	let exp = 0;
	if (expPart !== undefined) {
		exp = Number(expPart);
		if (!Number.isSafeInteger(exp) || Math.abs(exp) > MAX_SCALE) {
			throw new RangeError(
				`Exponent out of supported range in vector "${vectorName}" at index ${index}: ${JSON.stringify(raw)}`,
			);
		}
	}

	let scale = fracPart.length - exp;
	if (Math.abs(scale) > MAX_SCALE) {
		throw new RangeError(
			`Effective decimal scale exceeds supported limit (${MAX_SCALE}) in vector "${vectorName}" at index ${index}: ${JSON.stringify(raw)}`,
		);
	}

	if (scale < 0) {
		unsignedValue *= pow10(-scale);
		scale = 0;
	}

	const value = signChar === "-" ? -unsignedValue : unsignedValue;
	return { value, scale };
}

/**
 * Formats an exact scaled BigInt `{ value, scale }` into a normalized decimal
 * string rounded to at most `precision` fractional digits using half-away-from-zero
 * rounding. Never returns "-0" and strips unnecessary trailing fractional zeros.
 *
 * @param {bigint} value - Signed scaled integer value.
 * @param {number} scale - Non-negative number of fractional decimal places in `value`.
 * @param {number} precision - Maximum fractional digits in the output string.
 * @returns {string} Normalized decimal string.
 */
function formatDecimal(value, scale, precision) {
	if (value === 0n) {
		return "0";
	}

	const isNegative = value < 0n;
	let absValue = isNegative ? -value : value;
	let targetScale = scale;

	if (scale > precision) {
		const diff = scale - precision;
		const factor = pow10(diff);
		let quotient = absValue / factor;
		const remainder = absValue % factor;

		// Half-away-from-zero rounding
		if (remainder * 2n >= factor) {
			quotient += 1n;
		}

		absValue = quotient;
		targetScale = precision;
	}

	if (absValue === 0n) {
		return "0";
	}

	const signPrefix = isNegative ? "-" : "";
	const digits = absValue.toString();

	if (targetScale === 0) {
		return signPrefix + digits;
	}

	const padded =
		digits.length <= targetScale
			? digits.padStart(targetScale + 1, "0")
			: digits;
	const splitPoint = padded.length - targetScale;
	const intPart = padded.slice(0, splitPoint);
	const fracPart = padded.slice(splitPoint).replace(/0+$/, "");

	if (fracPart.length === 0) {
		return signPrefix + intPart;
	}

	return `${signPrefix}${intPart}.${fracPart}`;
}

/**
 * Computes the componentwise vector sum `a + b` over arbitrary-precision
 * decimal strings using an iterative BigInt fixed-point algorithm.
 *
 * Each pair of corresponding elements `(a[i], b[i])` is parsed into an exact
 * scaled `BigInt`, aligned to a common decimal scale, summed exactly with zero
 * floating-point precision loss, and formatted to at most `precision`
 * fractional digits using half-away-from-zero rounding.
 *
 * Output strings are normalized: trailing fractional zeros are stripped,
 * unnecessary decimal points are omitted, and zero is always represented as
 * `"0"` (never `"-0"`).
 *
 * @param {string[]} a - First input vector of decimal strings.
 * @param {string[]} b - Second input vector of decimal strings (same length as `a`).
 * @param {number} [precision=20] - Non-negative integer specifying the maximum
 *   number of fractional decimal places in each output component.
 * @returns {string[]} New array of normalized decimal strings representing `a + b`.
 * @throws {TypeError} If `a` or `b` is not an Array, if any vector element is
 *   not a string, or if `precision` is not a number.
 * @throws {RangeError} If `a` and `b` have different lengths, if any element is
 *   not a valid decimal string (or has an out-of-range exponent/scale), or if
 *   `precision` is negative, non-integer, or not a safe integer.
 */
export function vectorAddDecimalIterative(a, b, precision = 20) {
	if (!Array.isArray(a)) {
		throw new TypeError(
			`Expected first argument "a" to be an Array, got ${a === null ? "null" : typeof a}`,
		);
	}
	if (!Array.isArray(b)) {
		throw new TypeError(
			`Expected second argument "b" to be an Array, got ${b === null ? "null" : typeof b}`,
		);
	}
	if (typeof precision !== "number") {
		throw new TypeError(
			`Expected "precision" to be a number, got ${precision === null ? "null" : typeof precision}`,
		);
	}
	if (!Number.isInteger(precision) || precision < 0 || !Number.isSafeInteger(precision)) {
		throw new RangeError(
			`Expected "precision" to be a non-negative safe integer, got ${precision}`,
		);
	}
	if (a.length !== b.length) {
		throw new RangeError(
			`Vector length mismatch: vector "a" has length ${a.length}, vector "b" has length ${b.length}`,
		);
	}

	const length = a.length;
	const result = new Array(length);

	for (let i = 0; i < length; i += 1) {
		const left = parseDecimalString(a[i], "a", i);
		const right = parseDecimalString(b[i], "b", i);

		const commonScale = left.scale >= right.scale ? left.scale : right.scale;
		const leftScaled =
			left.scale === commonScale
				? left.value
				: left.value * pow10(commonScale - left.scale);
		const rightScaled =
			right.scale === commonScale
				? right.value
				: right.value * pow10(commonScale - right.scale);

		const sumValue = leftScaled + rightScaled;
		result[i] = formatDecimal(sumValue, commonScale, precision);
	}

	return result;
}
