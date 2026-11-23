/**
 * Arbitrary-precision decimal subtraction using a recursive divide-and-conquer
 * algorithm over base-10 digit arrays (ESM, Node 20+, zero dependencies).
 *
 * @module ops/arithmetic/subtractDecimalRecursive
 */

const DECIMAL_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

/**
 * Parses and validates a decimal string into a normalized sign and digit strings.
 *
 * @param {string} value - Decimal string to parse.
 * @param {string} name - Parameter name for error messages.
 * @returns {{ sign: 1 | -1, intPart: string, fracPart: string }}
 * @throws {TypeError} If `value` is not a string.
 * @throws {RangeError} If `value` is not a valid base-10 decimal string.
 */
function parseDecimal(value, name) {
	if (typeof value !== 'string') {
		throw new TypeError(`Expected "${name}" to be a string, received ${typeof value}`);
	}
	if (!DECIMAL_PATTERN.test(value)) {
		throw new RangeError(`Invalid decimal string for "${name}": "${value}"`);
	}

	let sign = 1;
	let body = value;
	if (body[0] === '-') {
		sign = -1;
		body = body.slice(1);
	} else if (body[0] === '+') {
		body = body.slice(1);
	}

	const dotIndex = body.indexOf('.');
	let rawInt = dotIndex === -1 ? body : body.slice(0, dotIndex);
	let rawFrac = dotIndex === -1 ? '' : body.slice(dotIndex + 1);

	// Strip leading zeros from integer part, preserving at least one digit.
	let intStart = 0;
	while (intStart < rawInt.length - 1 && rawInt.charCodeAt(intStart) === 48) {
		intStart++;
	}
	const intPart = rawInt.length === 0 ? '0' : rawInt.slice(intStart);

	// Strip trailing zeros from fractional part for canonical alignment.
	let fracEnd = rawFrac.length;
	while (fracEnd > 0 && rawFrac.charCodeAt(fracEnd - 1) === 48) {
		fracEnd--;
	}
	const fracPart = rawFrac.slice(0, fracEnd);

	// Normalize negative zero to positive zero.
	if (intPart === '0' && fracPart.length === 0) {
		sign = 1;
	}

	return { sign, intPart, fracPart };
}

/**
 * Validates the optional `precision` parameter.
 *
 * @param {number | undefined} precision - Number of fractional decimal places.
 * @throws {TypeError} If `precision` is neither `undefined` nor a number.
 * @throws {RangeError} If `precision` is not a non-negative safe integer.
 */
function validatePrecision(precision) {
	if (precision === undefined) {
		return;
	}
	if (typeof precision !== 'number') {
		throw new TypeError(`Expected "precision" to be a number or undefined, received ${typeof precision}`);
	}
	if (!Number.isSafeInteger(precision) || precision < 0) {
		throw new RangeError(`Expected "precision" to be a non-negative safe integer, received ${precision}`);
	}
}

/**
 * Encodes an aligned decimal number (intPart + fracPart) into a fixed-length
 * base-10 digit array of length `intLen + scale`.
 *
 * @param {string} intPart - Normalized integer digits.
 * @param {string} fracPart - Normalized fractional digits.
 * @param {number} intLen - Target integer digit count (left-padded with 0).
 * @param {number} scale - Target fractional digit count (right-padded with 0).
 * @returns {Uint8Array}
 */
function toAlignedDigits(intPart, fracPart, intLen, scale) {
	const digits = new Uint8Array(intLen + scale);
	const intOffset = intLen - intPart.length;
	for (let i = 0; i < intPart.length; i++) {
		digits[intOffset + i] = intPart.charCodeAt(i) - 48;
	}
	for (let i = 0; i < fracPart.length; i++) {
		digits[intLen + i] = fracPart.charCodeAt(i) - 48;
	}
	return digits;
}

/**
 * Divide-and-conquer comparison of two equal-length base-10 digit slices
 * over `[start, end)`.
 *
 * @param {Uint8Array} a
 * @param {Uint8Array} b
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 * @returns {-1 | 0 | 1}
 */
function compareRange(a, b, start, end) {
	if (start >= end) {
		return 0;
	}
	if (end - start === 1) {
		if (a[start] === b[start]) return 0;
		return a[start] > b[start] ? 1 : -1;
	}
	const mid = (start + end) >>> 1;
	const highCmp = compareRange(a, b, start, mid);
	if (highCmp !== 0) {
		return highCmp;
	}
	return compareRange(a, b, mid, end);
}

/**
 * Divide-and-conquer unsigned base-10 addition over `[start, end)`.
 * Splits the digit range in half, recursively adds the lower half first to obtain
 * its carry-out, then recursively adds the upper half with that carry.
 *
 * @param {Uint8Array} a
 * @param {Uint8Array} b
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 * @param {0 | 1} carryIn - Incoming carry into index `end - 1`.
 * @param {Uint8Array} out - Output digit buffer.
 * @returns {0 | 1} Outgoing carry from index `start`.
 */
function addRange(a, b, start, end, carryIn, out) {
	if (start >= end) {
		return carryIn;
	}
	if (end - start === 1) {
		const sum = a[start] + b[start] + carryIn;
		if (sum >= 10) {
			out[start] = sum - 10;
			return 1;
		}
		out[start] = sum;
		return 0;
	}
	const mid = (start + end) >>> 1;
	const midCarry = addRange(a, b, mid, end, carryIn, out);
	return addRange(a, b, start, mid, midCarry, out);
}

/**
 * Divide-and-conquer unsigned base-10 subtraction (`a - b`, requiring `a >= b`)
 * over `[start, end)`. Splits the digit range in half, recursively subtracts
 * the lower half first to obtain its borrow-out, then recursively subtracts the
 * upper half with that borrow.
 *
 * @param {Uint8Array} a - Minuend digits (`a >= b`).
 * @param {Uint8Array} b - Subtrahend digits.
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 * @param {0 | 1} borrowIn - Incoming borrow into index `end - 1`.
 * @param {Uint8Array} out - Output digit buffer.
 * @returns {0 | 1} Outgoing borrow from index `start`.
 */
function subRange(a, b, start, end, borrowIn, out) {
	if (start >= end) {
		return borrowIn;
	}
	if (end - start === 1) {
		const diff = a[start] - b[start] - borrowIn;
		if (diff < 0) {
			out[start] = diff + 10;
			return 1;
		}
		out[start] = diff;
		return 0;
	}
	const mid = (start + end) >>> 1;
	const midBorrow = subRange(a, b, mid, end, borrowIn, out);
	return subRange(a, b, start, mid, midBorrow, out);
}

/**
 * Divide-and-conquer in-place increment (propagation of a carry of 1) over
 * `[start, end)`. Short-circuits the upper half when carry becomes 0.
 *
 * @param {Uint8Array} digits
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 * @param {0 | 1} carryIn - Incoming carry.
 * @returns {0 | 1} Outgoing carry from index `start`.
 */
function incrementRange(digits, start, end, carryIn) {
	if (carryIn === 0 || start >= end) {
		return carryIn;
	}
	if (end - start === 1) {
		const sum = digits[start] + carryIn;
		if (sum >= 10) {
			digits[start] = sum - 10;
			return 1;
		}
		digits[start] = sum;
		return 0;
	}
	const mid = (start + end) >>> 1;
	const midCarry = incrementRange(digits, mid, end, carryIn);
	if (midCarry === 0) {
		return 0;
	}
	return incrementRange(digits, start, mid, midCarry);
}

/**
 * Converts a slice `[start, end)` of base-10 digits (0..9) into an ASCII string.
 *
 * @param {Uint8Array} digits
 * @param {number} start
 * @param {number} end
 * @returns {string}
 */
function digitsToString(digits, start, end) {
	const CHUNK_SIZE = 4096;
	let result = '';
	const codes = new Array(Math.min(CHUNK_SIZE, Math.max(0, end - start)));
	for (let pos = start; pos < end; pos += CHUNK_SIZE) {
		const limit = Math.min(pos + CHUNK_SIZE, end);
		const len = limit - pos;
		for (let i = 0; i < len; i++) {
			codes[i] = digits[pos + i] + 48;
		}
		if (len < codes.length) {
			codes.length = len;
		}
		result += String.fromCharCode(...codes);
	}
	return result;
}

/**
 * Formats an unsigned digit buffer with `intLen` integer digits and `scale`
 * fractional digits, applying optional half-away-from-zero rounding to
 * `precision` fractional places.
 *
 * @param {Uint8Array} digits - Base-10 digit array of length `intLen + scale`.
 * @param {number} intLen - Number of integer digits (>= 1).
 * @param {number} scale - Number of fractional digits (>= 0).
 * @param {1 | -1} sign - Sign of the result.
 * @param {number | undefined} precision - Optional fractional precision.
 * @returns {string}
 */
function formatResult(digits, intLen, scale, sign, precision) {
	let buf = digits;
	let curIntLen = intLen;
	let curScale = scale;
	let padRightZeros = 0;

	if (precision !== undefined) {
		if (precision < curScale) {
			const keepLen = curIntLen + precision;
			const roundDigit = buf[keepLen];
			if (roundDigit >= 5) {
				const carry = incrementRange(buf, 0, keepLen, 1);
				if (carry === 1) {
					const expanded = new Uint8Array(keepLen + 1);
					expanded[0] = 1;
					expanded.set(buf.subarray(0, keepLen), 1);
					buf = expanded;
					curIntLen += 1;
				}
			}
			curScale = precision;
		} else if (precision > curScale) {
			padRightZeros = precision - curScale;
		}
	}

	// Strip leading zeros from the integer portion, leaving at least one digit.
	let intStart = 0;
	while (intStart < curIntLen - 1 && buf[intStart] === 0) {
		intStart++;
	}

	let fracEnd = curIntLen + curScale;
	if (precision === undefined) {
		// Strip trailing fractional zeros in exact mode.
		while (fracEnd > curIntLen && buf[fracEnd - 1] === 0) {
			fracEnd--;
		}
	}

	// Determine whether the formatted value is zero (to prevent "-0" / "-0.00").
	let isZero = true;
	for (let i = intStart; i < fracEnd; i++) {
		if (buf[i] !== 0) {
			isZero = false;
			break;
		}
	}

	const intStr = digitsToString(buf, intStart, curIntLen);
	const fracStr = digitsToString(buf, curIntLen, fracEnd) + (padRightZeros > 0 ? '0'.repeat(padRightZeros) : '');
	const prefix = sign === -1 && !isZero ? '-' : '';

	return fracStr.length > 0 ? `${prefix}${intStr}.${fracStr}` : `${prefix}${intStr}`;
}

/**
 * Subtracts two arbitrary-precision base-10 decimal strings (`a - b`) using a
 * recursive divide-and-conquer algorithm over aligned digit arrays.
 *
 * Input strings must match `/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/` (no whitespace,
 * grouping separators, or scientific notation).
 *
 * When `precision` is omitted (`undefined`), returns the exact normalized
 * decimal string with redundant leading and trailing fractional zeros stripped.
 * When `precision` is a non-negative safe integer, rounds the result using
 * half-away-from-zero rounding and formats it with exactly `precision`
 * fractional digits (or no decimal point when `precision === 0`). Negative zero
 * is always normalized to unsigned zero (`"0"` or `"0.00..."`).
 *
 * @param {string} a - Minuend as a base-10 decimal string.
 * @param {string} b - Subtrahend as a base-10 decimal string.
 * @param {number} [precision] - Optional non-negative safe integer specifying
 *   the number of fractional digits in the rounded output.
 * @returns {string} The difference `a - b` formatted as a decimal string.
 * @throws {TypeError} If `a` or `b` is not a string, or `precision` is neither
 *   `undefined` nor a number.
 * @throws {RangeError} If `a` or `b` is not a valid decimal string, or
 *   `precision` is negative, non-integer, `NaN`, or not a safe integer.
 */
export function subtractDecimalRecursive(a, b, precision = undefined) {
	const parsedA = parseDecimal(a, 'a');
	const parsedB = parseDecimal(b, 'b');
	validatePrecision(precision);

	// a - b = signA * |a| + (-signB) * |b|
	const effSignB = parsedB.sign === 1 ? -1 : 1;

	const intLen = Math.max(parsedA.intPart.length, parsedB.intPart.length);
	const scale = Math.max(parsedA.fracPart.length, parsedB.fracPart.length);
	const totalLen = intLen + scale;

	const digitsA = toAlignedDigits(parsedA.intPart, parsedA.fracPart, intLen, scale);
	const digitsB = toAlignedDigits(parsedB.intPart, parsedB.fracPart, intLen, scale);

	let resultDigits = new Uint8Array(totalLen);
	let resultIntLen = intLen;
	let resultSign = 1;

	if (parsedA.sign === effSignB) {
		const carry = addRange(digitsA, digitsB, 0, totalLen, 0, resultDigits);
		if (carry === 1) {
			const expanded = new Uint8Array(totalLen + 1);
			expanded[0] = 1;
			expanded.set(resultDigits, 1);
			resultDigits = expanded;
			resultIntLen += 1;
		}
		resultSign = parsedA.sign;
	} else {
		const cmp = compareRange(digitsA, digitsB, 0, totalLen);
		if (cmp === 0) {
			resultSign = 1;
		} else if (cmp > 0) {
			subRange(digitsA, digitsB, 0, totalLen, 0, resultDigits);
			resultSign = parsedA.sign;
		} else {
			subRange(digitsB, digitsA, 0, totalLen, 0, resultDigits);
			resultSign = effSignB;
		}
	}

	return formatResult(resultDigits, resultIntLen, scale, resultSign, precision);
}
