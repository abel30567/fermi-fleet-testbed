const DECIMAL_PATTERN = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/;

/**
 * Parses and validates a decimal string into an exact BigInt-scaled representation:
 * `unscaled * 10^(-scale)`.
 *
 * @param {unknown} raw - Candidate decimal string element.
 * @param {number} index - Element index in the input array (for error reporting).
 * @returns {{ unscaled: bigint, scale: number }} Parsed exact decimal.
 */
function parseDecimal(raw, index) {
	if (typeof raw !== "string") {
		throw new TypeError(`values[${index}] must be a decimal string, received ${typeof raw}`);
	}

	const match = DECIMAL_PATTERN.exec(raw);
	if (match === null) {
		throw new RangeError(`values[${index}] is not a valid decimal string: "${raw}"`);
	}

	const sign = match[1];
	const intPart = match[2] ?? "";
	const fracPart = match[3] ?? match[4] ?? "";
	const expStr = match[5];

	let exp = 0;
	if (expStr !== undefined) {
		const expBig = BigInt(expStr);
		if (expBig > BigInt(Number.MAX_SAFE_INTEGER) || expBig < BigInt(Number.MIN_SAFE_INTEGER)) {
			throw new RangeError(`values[${index}] exponent is out of supported safe integer range`);
		}
		exp = Number(expBig);
	}

	const trimmedFrac = fracPart.replace(/0+$/, "");
	const rawDigits = (intPart + trimmedFrac).replace(/^0+/, "");

	if (rawDigits.length === 0) {
		return { unscaled: 0n, scale: 0 };
	}

	let unscaled = BigInt(rawDigits);
	if (sign === "-") {
		unscaled = -unscaled;
	}

	const scale = trimmedFrac.length - exp;
	if (!Number.isSafeInteger(scale)) {
		throw new RangeError(`values[${index}] decimal scale exceeds safe integer range`);
	}

	return { unscaled, scale };
}

/**
 * Formats a positive BigInt magnitude with a non-negative decimal scale into a normalized
 * decimal string (stripping trailing fractional zeros).
 *
 * @param {bigint} magnitude - Strictly positive unscaled integer value.
 * @param {number} scale - Non-negative number of fractional decimal places.
 * @param {boolean} negative - Whether the value is negative.
 * @returns {string} Normalized decimal string.
 */
function formatScaledMagnitude(magnitude, scale, negative) {
	const prefix = negative ? "-" : "";
	const digits = magnitude.toString();

	if (scale === 0) {
		return prefix + digits;
	}

	let intPart;
	let fracPart;
	if (digits.length <= scale) {
		intPart = "0";
		fracPart = digits.padStart(scale, "0");
	} else {
		const splitIndex = digits.length - scale;
		intPart = digits.slice(0, splitIndex);
		fracPart = digits.slice(splitIndex);
	}

	const trimmedFrac = fracPart.replace(/0+$/, "");
	if (trimmedFrac.length === 0) {
		return prefix + intPart;
	}
	return `${prefix}${intPart}.${trimmedFrac}`;
}

/**
 * Computes the discrete product of an array of arbitrary-precision decimal strings
 * using an iterative BigInt scaled-integer algorithm.
 *
 * All elements are multiplied exactly without IEEE-754 floating-point precision loss.
 * By mathematical convention, the empty product (`values.length === 0`) evaluates to `"1"`.
 * The final exact product is rounded to `precision` fractional decimal places using
 * round-half-away-from-zero and normalized (trailing fractional zeros removed, never `"-0"`).
 *
 * @param {string[]} values - Array of decimal strings (supports optional leading `+`/`-`,
 *   integer/fractional forms, and optional scientific notation like `"1.5e-10"`).
 * @param {number} [precision=20] - Non-negative safe integer specifying the maximum number
 *   of fractional decimal places in the returned string.
 * @returns {string} Normalized decimal string representing the product rounded to `precision`.
 * @throws {TypeError} If `values` is not an Array, any element is not a string, or `precision`
 *   is not a number.
 * @throws {RangeError} If any element is not a valid decimal string, `precision` is not a
 *   non-negative safe integer, or an exponent/scale overflows safe integer bounds.
 */
export function productDecimalIterative(values, precision = 20) {
	if (!Array.isArray(values)) {
		throw new TypeError("values must be an Array of decimal strings");
	}

	if (typeof precision !== "number") {
		throw new TypeError("precision must be a non-negative integer");
	}
	if (!Number.isInteger(precision) || precision < 0 || !Number.isSafeInteger(precision)) {
		throw new RangeError("precision must be a non-negative safe integer");
	}

	let accUnscaled = 1n;
	let accScale = 0;

	for (let i = 0; i < values.length; i += 1) {
		const { unscaled, scale } = parseDecimal(values[i], i);

		if (accUnscaled === 0n) {
			continue;
		}
		if (unscaled === 0n) {
			accUnscaled = 0n;
			accScale = 0;
			continue;
		}

		accUnscaled *= unscaled;
		accScale += scale;
		if (!Number.isSafeInteger(accScale)) {
			throw new RangeError("accumulated decimal scale exceeds safe integer range");
		}
	}

	if (accUnscaled === 0n) {
		return "0";
	}

	const negative = accUnscaled < 0n;
	const absUnscaled = negative ? -accUnscaled : accUnscaled;

	if (accScale <= 0) {
		const prefix = negative ? "-" : "";
		return prefix + absUnscaled.toString() + "0".repeat(-accScale);
	}

	if (accScale <= precision) {
		return formatScaledMagnitude(absUnscaled, accScale, negative);
	}

	const drop = accScale - precision;
	const absDigits = absUnscaled.toString();

	if (drop > absDigits.length) {
		return "0";
	}

	const keepLength = absDigits.length - drop;
	let rounded = keepLength > 0 ? BigInt(absDigits.slice(0, keepLength)) : 0n;
	const firstDroppedDigit = absDigits.charCodeAt(keepLength) - 48;
	if (firstDroppedDigit >= 5) {
		rounded += 1n;
	}

	if (rounded === 0n) {
		return "0";
	}

	return formatScaledMagnitude(rounded, precision, negative);
}
