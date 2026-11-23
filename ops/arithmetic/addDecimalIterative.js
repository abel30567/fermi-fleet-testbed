const DECIMAL_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

/**
 * Strip leading `'0'` characters from a non-empty digit string, keeping a
 * single `'0'` when all characters are zeros.
 *
 * @param {string} digits
 * @returns {string}
 */
function stripLeadingZeros(digits) {
	let i = 0;
	while (i < digits.length - 1 && digits.charCodeAt(i) === 48) {
		i++;
	}
	return digits.slice(i);
}

/**
 * Strip trailing `'0'` characters from a fractional digit string.
 *
 * @param {string} digits
 * @returns {string}
 */
function stripTrailingZeros(digits) {
	let end = digits.length;
	while (end > 0 && digits.charCodeAt(end - 1) === 48) {
		end--;
	}
	return digits.slice(0, end);
}

/**
 * Validate and parse a base-10 decimal string into sign, integer digits,
 * and fractional digits.
 *
 * @param {string} value
 * @param {string} name
 * @returns {{ sign: 1 | -1, intPart: string, fracPart: string }}
 */
function parseDecimal(value, name) {
	if (typeof value !== 'string') {
		throw new TypeError(`${name} must be a decimal string`);
	}
	if (!DECIMAL_PATTERN.test(value)) {
		throw new RangeError(`${name} is not a valid decimal string: "${value}"`);
	}

	let sign = 1;
	let start = 0;
	const firstCode = value.charCodeAt(0);
	if (firstCode === 45) {
		// '-'
		sign = -1;
		start = 1;
	} else if (firstCode === 43) {
		// '+'
		start = 1;
	}

	const dotIndex = value.indexOf('.', start);
	let rawInt;
	let rawFrac;
	if (dotIndex === -1) {
		rawInt = value.slice(start);
		rawFrac = '';
	} else {
		rawInt = value.slice(start, dotIndex);
		rawFrac = value.slice(dotIndex + 1);
	}

	const intPart = rawInt.length > 0 ? stripLeadingZeros(rawInt) : '0';
	const fracPart = stripTrailingZeros(rawFrac);

	if (intPart === '0' && fracPart.length === 0) {
		sign = 1;
	}

	return { sign, intPart, fracPart };
}

/**
 * Validate the optional precision argument.
 *
 * @param {number | undefined} precision
 */
function validatePrecision(precision) {
	if (precision === undefined) {
		return;
	}
	if (typeof precision !== 'number') {
		throw new TypeError('precision must be a non-negative integer or undefined');
	}
	if (!Number.isSafeInteger(precision) || precision < 0) {
		throw new RangeError('precision must be a non-negative safe integer');
	}
}

/**
 * Compare two non-negative integer digit strings iteratively.
 *
 * @param {string} a
 * @param {string} b
 * @returns {-1 | 0 | 1}
 */
function compareUnsigned(a, b) {
	const na = stripLeadingZeros(a);
	const nb = stripLeadingZeros(b);
	if (na.length !== nb.length) {
		return na.length > nb.length ? 1 : -1;
	}
	for (let i = 0; i < na.length; i++) {
		const ca = na.charCodeAt(i);
		const cb = nb.charCodeAt(i);
		if (ca !== cb) {
			return ca > cb ? 1 : -1;
		}
	}
	return 0;
}

/**
 * Add two non-negative integer digit strings iteratively from least-significant
 * to most-significant digit with carry propagation.
 *
 * @param {string} a
 * @param {string} b
 * @returns {string}
 */
function addUnsigned(a, b) {
	const out = [];
	let i = a.length - 1;
	let j = b.length - 1;
	let carry = 0;

	while (i >= 0 || j >= 0 || carry > 0) {
		const da = i >= 0 ? a.charCodeAt(i--) - 48 : 0;
		const db = j >= 0 ? b.charCodeAt(j--) - 48 : 0;
		const sum = da + db + carry;
		if (sum >= 10) {
			out.push(String(sum - 10));
			carry = 1;
		} else {
			out.push(String(sum));
			carry = 0;
		}
	}

	out.reverse();
	return stripLeadingZeros(out.join(''));
}

/**
 * Subtract non-negative integer digit string `b` from `a` iteratively,
 * assuming `a >= b`.
 *
 * @param {string} a
 * @param {string} b
 * @returns {string}
 */
function subtractUnsigned(a, b) {
	const out = [];
	let i = a.length - 1;
	let j = b.length - 1;
	let borrow = 0;

	while (i >= 0) {
		let da = a.charCodeAt(i--) - 48 - borrow;
		const db = j >= 0 ? b.charCodeAt(j--) - 48 : 0;
		if (da < db) {
			da += 10;
			borrow = 1;
		} else {
			borrow = 0;
		}
		out.push(String(da - db));
	}

	out.reverse();
	return stripLeadingZeros(out.join(''));
}

/**
 * Increment a non-negative integer digit string by 1 iteratively.
 *
 * @param {string} digits
 * @returns {string}
 */
function incrementUnsigned(digits) {
	const out = [];
	let carry = 1;
	for (let i = digits.length - 1; i >= 0; i--) {
		const d = digits.charCodeAt(i) - 48 + carry;
		if (d >= 10) {
			out.push(String(d - 10));
			carry = 1;
		} else {
			out.push(String(d));
			carry = 0;
		}
	}
	if (carry > 0) {
		out.push('1');
	}
	out.reverse();
	return stripLeadingZeros(out.join(''));
}

/**
 * Check whether every character in a digit string is `'0'`.
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
 * Add two arbitrary-precision base-10 decimal strings using a straightforward
 * iterative digit-by-digit algorithm.
 *
 * When `precision` is omitted (`undefined`), returns the exact normalized
 * decimal string with redundant leading integer zeros and trailing fractional
 * zeros removed.
 *
 * When `precision` is a non-negative safe integer, rounds the exact sum to
 * `precision` fractional digits using round-half-away-from-zero and formats
 * the output with exactly `precision` fractional digits (or as an integer
 * string when `precision === 0`). Zero results are always positive (never `"-0"`).
 *
 * @param {string} a - First decimal string (e.g. `"123.45"`, `"-0.5"`, `"+42"`).
 * @param {string} b - Second decimal string.
 * @param {number} [precision] - Optional number of fractional digits to round/format to.
 * @returns {string} The sum formatted as a decimal string.
 * @throws {TypeError} If `a` or `b` is not a string, or `precision` is neither undefined nor a number.
 * @throws {RangeError} If `a` or `b` is not a valid decimal string, or `precision` is not a non-negative safe integer.
 */
export function addDecimalIterative(a, b, precision) {
	const parsedA = parseDecimal(a, 'a');
	const parsedB = parseDecimal(b, 'b');
	validatePrecision(precision);

	const maxFrac = Math.max(parsedA.fracPart.length, parsedB.fracPart.length);
	const scaledA = parsedA.intPart + parsedA.fracPart.padEnd(maxFrac, '0');
	const scaledB = parsedB.intPart + parsedB.fracPart.padEnd(maxFrac, '0');

	let resultDigits;
	let resultSign;

	if (parsedA.sign === parsedB.sign) {
		resultDigits = addUnsigned(scaledA, scaledB);
		resultSign = parsedA.sign;
	} else {
		const cmp = compareUnsigned(scaledA, scaledB);
		if (cmp === 0) {
			resultDigits = '0';
			resultSign = 1;
		} else if (cmp > 0) {
			resultDigits = subtractUnsigned(scaledA, scaledB);
			resultSign = parsedA.sign;
		} else {
			resultDigits = subtractUnsigned(scaledB, scaledA);
			resultSign = parsedB.sign;
		}
	}

	let resInt;
	let resFrac;
	if (maxFrac === 0) {
		resInt = resultDigits;
		resFrac = '';
	} else {
		const padded = resultDigits.padStart(maxFrac + 1, '0');
		const splitIndex = padded.length - maxFrac;
		resInt = stripLeadingZeros(padded.slice(0, splitIndex));
		resFrac = padded.slice(splitIndex);
	}

	if (precision === undefined) {
		resFrac = stripTrailingZeros(resFrac);
		if (resInt === '0' && resFrac.length === 0) {
			return '0';
		}
		const prefix = resultSign < 0 ? '-' : '';
		return resFrac.length > 0 ? `${prefix}${resInt}.${resFrac}` : `${prefix}${resInt}`;
	}

	if (resFrac.length <= precision) {
		resFrac = resFrac.padEnd(precision, '0');
	} else {
		const roundDigit = resFrac.charCodeAt(precision) - 48;
		const keptFrac = resFrac.slice(0, precision);
		if (roundDigit >= 5) {
			const combined = resInt + keptFrac;
			const incremented = incrementUnsigned(combined);
			if (precision === 0) {
				resInt = incremented;
				resFrac = '';
			} else {
				const paddedInc = incremented.padStart(precision + 1, '0');
				const splitIndex = paddedInc.length - precision;
				resInt = stripLeadingZeros(paddedInc.slice(0, splitIndex));
				resFrac = paddedInc.slice(splitIndex);
			}
		} else {
			resFrac = keptFrac;
		}
	}

	if (resInt === '0' && isAllZeros(resFrac)) {
		resultSign = 1;
	}

	const prefix = resultSign < 0 ? '-' : '';
	return precision > 0 ? `${prefix}${resInt}.${resFrac}` : `${prefix}${resInt}`;
}
