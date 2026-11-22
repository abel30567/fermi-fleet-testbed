/**
 * Strict decimal string pattern supporting optional sign, integer/fractional
 * forms (e.g. "42", "-0.5", ".25", "5."), and optional scientific notation
 * (e.g. "1.25e-10", "+3E4"). Leading/trailing whitespace is rejected.
 */
const DECIMAL_PATTERN = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/;

/**
 * Maximum absolute exponent allowed in scientific notation to prevent
 * unbounded memory allocation when expanding scaled BigInt values.
 */
const MAX_ABS_EXPONENT = 1_000_000;

/**
 * Validates the `precision` parameter.
 *
 * @param {number} precision - Non-negative safe integer number of decimal places.
 * @throws {TypeError} If `precision` is not a number or is NaN.
 * @throws {RangeError} If `precision` is not a non-negative safe integer.
 */
function validatePrecision(precision) {
	if (typeof precision !== 'number' || Number.isNaN(precision)) {
		throw new TypeError('precision must be a non-negative integer');
	}
	if (!Number.isSafeInteger(precision) || precision < 0) {
		throw new RangeError('precision must be a non-negative safe integer');
	}
}

/**
 * Validates that a matrix element is a syntactically valid decimal string.
 *
 * @param {unknown} value - Candidate matrix entry.
 * @param {number} row - Row index (for error reporting).
 * @param {number} col - Column index (for error reporting).
 * @returns {{ match: RegExpExecArray, exponent: number }} Parsed regex match and validated exponent.
 * @throws {TypeError} If `value` is not a string.
 * @throws {RangeError} If `value` is not a valid decimal string or has an out-of-range exponent.
 */
function validateDecimalEntry(value, row, col) {
	if (typeof value !== 'string') {
		throw new TypeError(`matrix[${row}][${col}] must be a decimal string`);
	}
	const match = DECIMAL_PATTERN.exec(value);
	if (match === null) {
		throw new RangeError(`matrix[${row}][${col}] is not a valid decimal string: "${value}"`);
	}

	let exponent = 0;
	if (match[5] !== undefined) {
		const parsedExp = Number(match[5]);
		if (!Number.isSafeInteger(parsedExp) || Math.abs(parsedExp) > MAX_ABS_EXPONENT) {
			throw new RangeError(
				`matrix[${row}][${col}] exponent is out of supported range (±${MAX_ABS_EXPONENT})`
			);
		}
		exponent = parsedExp;
	}

	return { match, exponent };
}

/**
 * Converts a previously validated decimal regex match into an exact BigInt
 * scaled integer `{ unscaled, scale }` representing `unscaled * 10^(-scale)`
 * with `scale >= 0`.
 *
 * @param {RegExpExecArray} match - Match from `DECIMAL_PATTERN`.
 * @param {number} exponent - Validated base-10 exponent.
 * @returns {{ unscaled: bigint, scale: number }} Exact scaled representation.
 */
function toScaledBigInt(match, exponent) {
	const sign = match[1];
	const intPart = match[2] ?? '';
	const fracPart = match[3] ?? match[4] ?? '';

	const digits = (intPart + fracPart).replace(/^0+/, '');
	if (digits.length === 0) {
		return { unscaled: 0n, scale: 0 };
	}

	let scale = fracPart.length - exponent;
	let trimmedDigits = digits;

	if (scale > 0) {
		let trailingZeros = 0;
		while (
			trailingZeros < scale &&
			trailingZeros < trimmedDigits.length &&
			trimmedDigits[trimmedDigits.length - 1 - trailingZeros] === '0'
		) {
			trailingZeros += 1;
		}
		if (trailingZeros > 0) {
			trimmedDigits = trimmedDigits.slice(0, trimmedDigits.length - trailingZeros);
			scale -= trailingZeros;
		}
	}

	let unscaled = BigInt(trimmedDigits);
	if (scale < 0) {
		unscaled *= 10n ** BigInt(-scale);
		scale = 0;
	}

	if (sign === '-') {
		unscaled = -unscaled;
	}

	return { unscaled, scale };
}

/**
 * Rounds an exact scaled BigInt value to `precision` fractional digits
 * (round half away from zero) and formats it as a normalized decimal string
 * with no trailing fractional zeros and no negative zero (`"-0"`).
 *
 * @param {bigint} unscaled - Exact signed integer mantissa.
 * @param {number} scale - Current non-negative decimal scale.
 * @param {number} precision - Maximum fractional digits in the output.
 * @returns {string} Normalized decimal string.
 */
function roundAndFormatDecimal(unscaled, scale, precision) {
	if (unscaled === 0n) {
		return '0';
	}

	const isNegative = unscaled < 0n;
	let absUnscaled = isNegative ? -unscaled : unscaled;
	let outScale = scale;

	if (scale > precision) {
		const divisor = 10n ** BigInt(scale - precision);
		let quotient = absUnscaled / divisor;
		const remainder = absUnscaled % divisor;
		if (remainder * 2n >= divisor) {
			quotient += 1n;
		}
		absUnscaled = quotient;
		outScale = precision;
	}

	if (absUnscaled === 0n) {
		return '0';
	}

	let digits = absUnscaled.toString();
	if (outScale === 0) {
		return (isNegative ? '-' : '') + digits;
	}

	if (digits.length <= outScale) {
		digits = '0'.repeat(outScale - digits.length + 1) + digits;
	}

	const splitIdx = digits.length - outScale;
	const intPart = digits.slice(0, splitIdx);
	const fracPart = digits.slice(splitIdx).replace(/0+$/, '');

	if (fracPart.length === 0) {
		return (isNegative ? '-' : '') + intPart;
	}

	return (isNegative ? '-' : '') + intPart + '.' + fracPart;
}

/**
 * Computes the trace (sum of main diagonal entries) of a square matrix of
 * arbitrary-precision decimal strings using exact BigInt fixed-point
 * arithmetic in a straightforward iterative loop.
 *
 * All entries of `matrix` (both diagonal and off-diagonal) are strictly
 * validated as decimal strings. Diagonal entries are summed exactly with zero
 * floating-point precision loss, then rounded half-away-from-zero to at most
 * `precision` decimal places and returned as a normalized decimal string
 * (without trailing fractional zeros or `"-0"`).
 *
 * @param {string[][]} matrix - Non-empty square `n x n` matrix of decimal strings.
 * @param {number} [precision=20] - Non-negative integer maximum decimal places in the result.
 * @returns {string} Normalized decimal string representing the matrix trace.
 * @throws {TypeError} If `matrix` or any row is not an array, any entry is not a string,
 *   or `precision` is not a number / is NaN.
 * @throws {RangeError} If `matrix` is empty or non-square, any entry is not a valid
 *   decimal string (or has an out-of-range exponent), or `precision` is not a
 *   non-negative safe integer.
 */
export function traceDecimalIterative(matrix, precision = 20) {
	validatePrecision(precision);

	if (!Array.isArray(matrix)) {
		throw new TypeError('matrix must be a 2D array of decimal strings');
	}

	const n = matrix.length;
	if (n === 0) {
		throw new RangeError('matrix must be a non-empty square matrix');
	}

	let sumUnscaled = 0n;
	let sumScale = 0;

	for (let i = 0; i < n; i += 1) {
		const row = matrix[i];
		if (!Array.isArray(row)) {
			throw new TypeError(`matrix[${i}] must be an array`);
		}
		if (row.length !== n) {
			throw new RangeError(
				`matrix must be square (${n}x${n}), but row ${i} has length ${row.length}`
			);
		}

		for (let j = 0; j < n; j += 1) {
			const validated = validateDecimalEntry(row[j], i, j);
			if (i === j) {
				const { unscaled, scale } = toScaledBigInt(validated.match, validated.exponent);
				if (scale === sumScale) {
					sumUnscaled += unscaled;
				} else if (scale > sumScale) {
					sumUnscaled = sumUnscaled * 10n ** BigInt(scale - sumScale) + unscaled;
					sumScale = scale;
				} else {
					sumUnscaled += unscaled * 10n ** BigInt(sumScale - scale);
				}
			}
		}
	}

	return roundAndFormatDecimal(sumUnscaled, sumScale, precision);
}
