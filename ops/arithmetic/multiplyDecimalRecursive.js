/**
 * Arbitrary-precision decimal string multiplication using a recursive
 * divide-and-conquer Karatsuba algorithm.
 *
 * Zero dependencies, pure ESM.
 *
 * @module ops/arithmetic/multiplyDecimalRecursive
 */

const DECIMAL_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
const KARATSUBA_THRESHOLD = 8;

/**
 * Remove redundant high-order zeros from a little-endian base-10 digit array.
 *
 * @param {number[]} digits - Little-endian array of base-10 digits (0-9).
 * @returns {number[]} Normalized little-endian digit array (at least one digit).
 */
function trimDigits(digits) {
	let end = digits.length;
	while (end > 1 && digits[end - 1] === 0) {
		end--;
	}
	return end === digits.length ? digits : digits.slice(0, end);
}

/**
 * Add two non-negative little-endian base-10 digit arrays.
 *
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number[]}
 */
function addDigits(a, b) {
	const maxLen = Math.max(a.length, b.length);
	const out = new Array(maxLen);
	let carry = 0;

	for (let i = 0; i < maxLen; i++) {
		const sum = (i < a.length ? a[i] : 0) + (i < b.length ? b[i] : 0) + carry;
		if (sum >= 10) {
			out[i] = sum - 10;
			carry = 1;
		} else {
			out[i] = sum;
			carry = 0;
		}
	}

	if (carry > 0) {
		out.push(carry);
	}

	return trimDigits(out);
}

/**
 * Subtract two non-negative little-endian base-10 digit arrays (requires a >= b).
 *
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number[]}
 */
function subDigits(a, b) {
	const out = new Array(a.length);
	let borrow = 0;

	for (let i = 0; i < a.length; i++) {
		let diff = a[i] - (i < b.length ? b[i] : 0) - borrow;
		if (diff < 0) {
			diff += 10;
			borrow = 1;
		} else {
			borrow = 0;
		}
		out[i] = diff;
	}

	return trimDigits(out);
}

/**
 * Multiply a little-endian base-10 digit array by 10^shift.
 *
 * @param {number[]} digits
 * @param {number} shift
 * @returns {number[]}
 */
function shiftDigits(digits, shift) {
	if (shift <= 0 || (digits.length === 1 && digits[0] === 0)) {
		return digits;
	}
	const out = new Array(digits.length + shift);
	for (let i = 0; i < shift; i++) {
		out[i] = 0;
	}
	for (let i = 0; i < digits.length; i++) {
		out[i + shift] = digits[i];
	}
	return out;
}

/**
 * Base-case schoolbook multiplication for small little-endian base-10 digit arrays.
 *
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number[]}
 */
function schoolbookMultiply(a, b) {
	const out = new Array(a.length + b.length).fill(0);

	for (let i = 0; i < a.length; i++) {
		const ai = a[i];
		if (ai === 0) continue;
		let carry = 0;
		for (let j = 0; j < b.length; j++) {
			const prod = out[i + j] + ai * b[j] + carry;
			out[i + j] = prod % 10;
			carry = (prod - out[i + j]) / 10;
		}
		let k = i + b.length;
		while (carry > 0) {
			const sum = out[k] + carry;
			out[k] = sum % 10;
			carry = (sum - out[k]) / 10;
			k++;
		}
	}

	return trimDigits(out);
}

/**
 * Recursive divide-and-conquer Karatsuba multiplication over little-endian
 * base-10 digit arrays.
 *
 * Splits operands at half the maximum length `m`:
 *   x = x1 * 10^m + x0
 *   y = y1 * 10^m + y0
 *   x * y = z2 * 10^(2m) + z1 * 10^m + z0
 * where z0 = x0*y0, z2 = x1*y1, z1 = (x0 + x1)(y0 + y1) - z2 - z0.
 *
 * @param {number[]} x
 * @param {number[]} y
 * @returns {number[]}
 */
function karatsubaMultiply(x, y) {
	const a = trimDigits(x);
	const b = trimDigits(y);

	if ((a.length === 1 && a[0] === 0) || (b.length === 1 && b[0] === 0)) {
		return [0];
	}

	if (a.length <= KARATSUBA_THRESHOLD || b.length <= KARATSUBA_THRESHOLD) {
		return schoolbookMultiply(a, b);
	}

	const n = Math.max(a.length, b.length);
	const m = Math.floor(n / 2);

	const x0 = a.length <= m ? a : trimDigits(a.slice(0, m));
	const x1 = a.length > m ? trimDigits(a.slice(m)) : [0];
	const y0 = b.length <= m ? b : trimDigits(b.slice(0, m));
	const y1 = b.length > m ? trimDigits(b.slice(m)) : [0];

	const z0 = karatsubaMultiply(x0, y0);
	const z2 = karatsubaMultiply(x1, y1);
	const z1Full = karatsubaMultiply(addDigits(x0, x1), addDigits(y0, y1));
	const z1 = subDigits(subDigits(z1Full, z2), z0);

	return addDigits(addDigits(shiftDigits(z2, 2 * m), shiftDigits(z1, m)), z0);
}

/**
 * Validate and parse an arbitrary-precision decimal string.
 *
 * @param {string} value
 * @param {string} paramName
 * @returns {{ negative: boolean, digits: number[], scale: number, isZero: boolean }}
 */
function parseDecimal(value, paramName) {
	if (typeof value !== 'string') {
		throw new TypeError(`${paramName} must be a decimal string`);
	}
	if (!DECIMAL_PATTERN.test(value)) {
		throw new RangeError(`${paramName} is not a valid decimal string: "${value}"`);
	}

	let negative = false;
	let body = value;
	if (body[0] === '-') {
		negative = true;
		body = body.slice(1);
	} else if (body[0] === '+') {
		body = body.slice(1);
	}

	const dotIndex = body.indexOf('.');
	let intPart;
	let fracPart;
	if (dotIndex === -1) {
		intPart = body;
		fracPart = '';
	} else {
		intPart = body.slice(0, dotIndex);
		fracPart = body.slice(dotIndex + 1).replace(/0+$/, '');
	}

	const scale = fracPart.length;
	const combined = (intPart + fracPart).replace(/^0+/, '');

	if (combined.length === 0) {
		return { negative: false, digits: [0], scale: 0, isZero: true };
	}

	const digits = new Array(combined.length);
	for (let i = 0; i < combined.length; i++) {
		digits[i] = combined.charCodeAt(combined.length - 1 - i) - 48;
	}

	return { negative, digits, scale, isZero: false };
}

/**
 * Convert a normalized little-endian base-10 digit array to an MSB-first string.
 *
 * @param {number[]} digits
 * @returns {string}
 */
function digitsToString(digits) {
	const chars = new Array(digits.length);
	for (let i = 0; i < digits.length; i++) {
		chars[i] = String(digits[digits.length - 1 - i]);
	}
	return chars.join('');
}

/**
 * Format a non-negative integer represented by `digits` divided by 10^scale.
 *
 * @param {number[]} digits - Normalized little-endian digit array.
 * @param {number} scale - Number of fractional digits.
 * @param {boolean} negative - Whether the value is negative.
 * @param {boolean} stripTrailingZeros - Whether to trim trailing fractional zeros.
 * @returns {string}
 */
function formatDecimal(digits, scale, negative, stripTrailingZeros) {
	const isZero = digits.length === 1 && digits[0] === 0;
	const sign = !isZero && negative ? '-' : '';
	const raw = digitsToString(digits);

	if (scale === 0) {
		return sign + raw;
	}

	let intPart;
	let fracPart;
	if (raw.length <= scale) {
		intPart = '0';
		fracPart = '0'.repeat(scale - raw.length) + raw;
	} else {
		const splitAt = raw.length - scale;
		intPart = raw.slice(0, splitAt);
		fracPart = raw.slice(splitAt);
	}

	if (stripTrailingZeros) {
		fracPart = fracPart.replace(/0+$/, '');
		if (fracPart.length === 0) {
			return sign + intPart;
		}
	}

	return `${sign}${intPart}.${fracPart}`;
}

/**
 * Multiply two arbitrary-precision decimal strings using a recursive
 * divide-and-conquer (Karatsuba) algorithm.
 *
 * Input strings must match standard base-10 decimal syntax (`[+-]?(\d+(\.\d*)?|\.\d+)`),
 * without whitespace, thousands separators, or scientific notation.
 *
 * Precision behavior:
 * - When `precision` is `undefined`, returns the exact product normalized with
 *   no redundant leading integer zeros or trailing fractional zeros.
 * - When `precision` is a non-negative safe integer, rounds the exact product
 *   to `precision` decimal places using round-half-away-from-zero semantics and
 *   formats with exactly `precision` fractional digits (or no decimal point when
 *   `precision === 0`). Negative zero is normalized to positive zero.
 *
 * @param {string} a - First arbitrary-precision decimal string.
 * @param {string} b - Second arbitrary-precision decimal string.
 * @param {number} [precision] - Optional non-negative integer number of decimal places.
 * @returns {string} Product formatted as a decimal string.
 * @throws {TypeError} If `a` or `b` is not a string, or `precision` is provided and not a number.
 * @throws {RangeError} If `a` or `b` is not a valid decimal string, or `precision` is negative, non-integer, or unsafe.
 */
export function multiplyDecimalRecursive(a, b, precision) {
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

	if (parsedA.isZero || parsedB.isZero) {
		if (precision === undefined || precision === 0) {
			return '0';
		}
		return `0.${'0'.repeat(precision)}`;
	}

	const resultNegative = parsedA.negative !== parsedB.negative;
	const totalScale = parsedA.scale + parsedB.scale;
	const productDigits = karatsubaMultiply(parsedA.digits, parsedB.digits);

	if (precision === undefined) {
		return formatDecimal(productDigits, totalScale, resultNegative, true);
	}

	if (precision >= totalScale) {
		const paddedDigits = shiftDigits(productDigits, precision - totalScale);
		return formatDecimal(paddedDigits, precision, resultNegative, false);
	}

	const dropCount = totalScale - precision;
	const roundDigit = dropCount - 1 < productDigits.length ? productDigits[dropCount - 1] : 0;
	let keptDigits = dropCount < productDigits.length ? trimDigits(productDigits.slice(dropCount)) : [0];

	if (roundDigit >= 5) {
		keptDigits = addDigits(keptDigits, [1]);
	}

	return formatDecimal(keptDigits, precision, resultNegative, false);
}
