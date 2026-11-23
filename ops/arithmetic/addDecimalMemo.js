/**
 * @fileoverview Arbitrary-precision decimal string addition with configurable
 * precision, implemented via precomputed base-10 arithmetic lookup tables and
 * bounded result memoization.
 */

const DECIMAL_RE = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

/** Precomputed lookup tables for base-10 digit addition with carry (0..1). */
const ADD_DIGIT = new Uint8Array(200);
const ADD_CARRY = new Uint8Array(200);

/** Precomputed lookup tables for base-10 digit subtraction with borrow (0..1). */
const SUB_DIGIT = new Uint8Array(200);
const SUB_BORROW = new Uint8Array(200);

/** Precomputed ASCII digit strings ('0'..'9'). */
const DIGIT_CHAR = Array.from({ length: 10 }, (_, d) => String(d));

/** Precomputed zero-padding strings for common lengths. */
const ZERO_PAD_LIMIT = 128;
const ZERO_PAD = Array.from({ length: ZERO_PAD_LIMIT + 1 }, (_, n) => '0'.repeat(n));

for (let c = 0; c <= 1; c++) {
	for (let a = 0; a <= 9; a++) {
		for (let b = 0; b <= 9; b++) {
			const idx = c * 100 + a * 10 + b;

			const sum = a + b + c;
			ADD_DIGIT[idx] = sum >= 10 ? sum - 10 : sum;
			ADD_CARRY[idx] = sum >= 10 ? 1 : 0;

			const diff = a - b - c;
			SUB_DIGIT[idx] = diff < 0 ? diff + 10 : diff;
			SUB_BORROW[idx] = diff < 0 ? 1 : 0;
		}
	}
}

/** Bounded memoization cache for computed decimal sums. */
const MAX_CACHE_SIZE = 4096;
const MAX_MEMO_KEY_LENGTH = 4096;
const memoCache = new Map();

/**
 * Returns a string consisting of `count` ASCII '0' characters.
 *
 * @param {number} count
 * @returns {string}
 */
function zeros(count) {
	if (count <= ZERO_PAD_LIMIT) {
		return ZERO_PAD[count];
	}
	return '0'.repeat(count);
}

/**
 * Strips leading zeros from an unsigned integer digit string, preserving `'0'`.
 *
 * @param {string} digits
 * @returns {string}
 */
function stripLeadingZeros(digits) {
	let i = 0;
	const last = digits.length - 1;
	while (i < last && digits.charCodeAt(i) === 48) {
		i++;
	}
	return i === 0 ? digits : digits.slice(i);
}

/**
 * Strips trailing zeros from a fractional digit string.
 *
 * @param {string} frac
 * @returns {string}
 */
function stripTrailingZeros(frac) {
	let end = frac.length;
	while (end > 0 && frac.charCodeAt(end - 1) === 48) {
		end--;
	}
	return end === frac.length ? frac : frac.slice(0, end);
}

/**
 * Validates and parses a decimal string into canonical sign, integer, and
 * fractional digit parts.
 *
 * @param {string} value
 * @param {string} name
 * @returns {{ sign: 1 | -1, intPart: string, fracPart: string, canonical: string }}
 */
function parseDecimal(value, name) {
	if (typeof value !== 'string') {
		throw new TypeError(`${name} must be a decimal string`);
	}
	const trimmed = value.trim();
	if (!DECIMAL_RE.test(trimmed)) {
		throw new RangeError(`${name} is not a valid decimal string: ${JSON.stringify(value)}`);
	}

	let sign = 1;
	let body = trimmed;
	const firstCode = body.charCodeAt(0);
	if (firstCode === 45) {
		sign = -1;
		body = body.slice(1);
	} else if (firstCode === 43) {
		body = body.slice(1);
	}

	const dotIndex = body.indexOf('.');
	const rawInt = dotIndex === -1 ? body : body.slice(0, dotIndex);
	const rawFrac = dotIndex === -1 ? '' : body.slice(dotIndex + 1);

	const intPart = rawInt.length === 0 ? '0' : stripLeadingZeros(rawInt);
	const fracPart = stripTrailingZeros(rawFrac);

	if (intPart === '0' && fracPart.length === 0) {
		return { sign: 1, intPart: '0', fracPart: '', canonical: '0' };
	}

	const canonical = `${sign < 0 ? '-' : ''}${intPart}${fracPart.length > 0 ? `.${fracPart}` : ''}`;
	return { sign, intPart, fracPart, canonical };
}

/**
 * Adds two equal-length unsigned digit strings using precomputed lookup tables.
 *
 * @param {string} a
 * @param {string} b
 * @returns {string}
 */
function addUnsigned(a, b) {
	const len = a.length;
	const out = new Array(len);
	let carry = 0;

	for (let i = len - 1; i >= 0; i--) {
		const idx = carry * 100 + (a.charCodeAt(i) - 48) * 10 + (b.charCodeAt(i) - 48);
		out[i] = DIGIT_CHAR[ADD_DIGIT[idx]];
		carry = ADD_CARRY[idx];
	}

	const result = out.join('');
	return carry > 0 ? `1${result}` : result;
}

/**
 * Subtracts equal-length unsigned digit string `b` from `a` (`a >= b`) using
 * precomputed lookup tables.
 *
 * @param {string} a
 * @param {string} b
 * @returns {string}
 */
function subUnsigned(a, b) {
	const len = a.length;
	const out = new Array(len);
	let borrow = 0;

	for (let i = len - 1; i >= 0; i--) {
		const idx = borrow * 100 + (a.charCodeAt(i) - 48) * 10 + (b.charCodeAt(i) - 48);
		out[i] = DIGIT_CHAR[SUB_DIGIT[idx]];
		borrow = SUB_BORROW[idx];
	}

	return out.join('');
}

/**
 * Increments an unsigned digit string by 1 using precomputed lookup tables.
 *
 * @param {string} digits
 * @returns {string}
 */
function incrementUnsigned(digits) {
	const len = digits.length;
	const out = new Array(len);
	let carry = 1;

	for (let i = len - 1; i >= 0; i--) {
		if (carry === 0) {
			out[i] = digits[i];
		} else {
			const idx = 100 + (digits.charCodeAt(i) - 48) * 10;
			out[i] = DIGIT_CHAR[ADD_DIGIT[idx]];
			carry = ADD_CARRY[idx];
		}
	}

	const result = out.join('');
	return carry > 0 ? `1${result}` : result;
}

/**
 * Checks whether a digit string contains only '0' characters.
 *
 * @param {string} digits
 * @returns {boolean}
 */
function isAllZeros(digits) {
	for (let i = 0; i < digits.length; i++) {
		if (digits.charCodeAt(i) !== 48) {
			return false;
		}
	}
	return true;
}

/**
 * Stores a computed result in the bounded memoization cache.
 *
 * @param {string} key
 * @param {string} value
 */
function cacheSet(key, value) {
	if (memoCache.size >= MAX_CACHE_SIZE) {
		const oldestKey = memoCache.keys().next().value;
		memoCache.delete(oldestKey);
	}
	memoCache.set(key, value);
}

/**
 * Adds two arbitrary-precision decimal strings with an optional configurable
 * fractional precision, backed by precomputed digit lookup tables and bounded
 * result memoization.
 *
 * When `precision` is omitted (`undefined`), the exact sum is returned with
 * redundant leading and trailing zeros removed. When `precision` is a
 * non-negative safe integer, the exact sum is rounded half-away-from-zero to
 * `precision` fractional digits and formatted with exactly `precision` digits
 * after the decimal point (or no decimal point when `precision === 0`).
 *
 * @param {string} a - First arbitrary-precision decimal string (e.g. `"-123.45"`).
 * @param {string} b - Second arbitrary-precision decimal string (e.g. `"0.55"`).
 * @param {number} [precision] - Optional non-negative integer number of fractional decimal places.
 * @returns {string} The decimal sum formatted according to `precision`.
 * @throws {TypeError} If `a` or `b` is not a string, or `precision` is defined and not a number.
 * @throws {RangeError} If `a` or `b` is not a valid decimal string, or `precision` is not a non-negative safe integer.
 */
export function addDecimalMemo(a, b, precision) {
	if (precision !== undefined) {
		if (typeof precision !== 'number') {
			throw new TypeError('precision must be a number when provided');
		}
		if (!Number.isSafeInteger(precision) || precision < 0) {
			throw new RangeError('precision must be a non-negative safe integer');
		}
	}

	const parsedA = parseDecimal(a, 'a');
	const parsedB = parseDecimal(b, 'b');

	const [firstKey, secondKey] =
		parsedA.canonical <= parsedB.canonical
			? [parsedA.canonical, parsedB.canonical]
			: [parsedB.canonical, parsedA.canonical];
	const precKey = precision === undefined ? '' : String(precision);
	const cacheKey = `${firstKey}|${secondKey}|${precKey}`;

	if (cacheKey.length <= MAX_MEMO_KEY_LENGTH && memoCache.has(cacheKey)) {
		return memoCache.get(cacheKey);
	}

	const scale = Math.max(parsedA.fracPart.length, parsedB.fracPart.length);
	const rawDigitsA = parsedA.intPart + parsedA.fracPart + zeros(scale - parsedA.fracPart.length);
	const rawDigitsB = parsedB.intPart + parsedB.fracPart + zeros(scale - parsedB.fracPart.length);

	const maxLen = Math.max(rawDigitsA.length, rawDigitsB.length);
	const alignedA = zeros(maxLen - rawDigitsA.length) + rawDigitsA;
	const alignedB = zeros(maxLen - rawDigitsB.length) + rawDigitsB;

	let resSign = 1;
	let magDigits;

	if (parsedA.sign === parsedB.sign) {
		resSign = parsedA.sign;
		magDigits = addUnsigned(alignedA, alignedB);
	} else if (alignedA === alignedB) {
		resSign = 1;
		magDigits = zeros(scale + 1);
	} else if (alignedA > alignedB) {
		resSign = parsedA.sign;
		magDigits = subUnsigned(alignedA, alignedB);
	} else {
		resSign = parsedB.sign;
		magDigits = subUnsigned(alignedB, alignedA);
	}

	if (magDigits.length <= scale) {
		magDigits = zeros(scale + 1 - magDigits.length) + magDigits;
	}

	const splitIdx = magDigits.length - scale;
	let resInt = stripLeadingZeros(magDigits.slice(0, splitIdx));
	let resFrac = scale > 0 ? magDigits.slice(splitIdx) : '';

	let formatted;
	if (precision === undefined) {
		resFrac = stripTrailingZeros(resFrac);
		if (resInt === '0' && resFrac.length === 0) {
			formatted = '0';
		} else {
			formatted = `${resSign < 0 ? '-' : ''}${resInt}${resFrac.length > 0 ? `.${resFrac}` : ''}`;
		}
	} else {
		if (resFrac.length < precision) {
			resFrac += zeros(precision - resFrac.length);
		} else if (resFrac.length > precision) {
			const roundDigit = resFrac.charCodeAt(precision) - 48;
			resFrac = resFrac.slice(0, precision);
			if (roundDigit >= 5) {
				const incremented = incrementUnsigned(resInt + resFrac);
				const incSplit = incremented.length - precision;
				resInt = stripLeadingZeros(incremented.slice(0, incSplit));
				resFrac = precision > 0 ? incremented.slice(incSplit) : '';
			}
		}

		if (resInt === '0' && isAllZeros(resFrac)) {
			resSign = 1;
		}
		formatted = `${resSign < 0 ? '-' : ''}${resInt}${precision > 0 ? `.${resFrac}` : ''}`;
	}

	if (cacheKey.length <= MAX_MEMO_KEY_LENGTH) {
		cacheSet(cacheKey, formatted);
	}

	return formatted;
}
