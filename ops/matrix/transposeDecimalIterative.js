/**
 * Arbitrary-precision decimal string matrix transposition (iterative).
 *
 * Uses BigInt-based scaled integer fixed-point arithmetic with zero external
 * dependencies to avoid IEEE-754 floating-point precision loss.
 */

const DECIMAL_REGEX = /^([+-])?(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/;
const MAX_ABS_EXPONENT = 1_000_000;

/**
 * Parses, rounds (half away from zero), and normalizes a decimal string
 * to at most `precision` fractional digits using BigInt scaled arithmetic.
 *
 * @param {string} raw - Input decimal string.
 * @param {number} precision - Non-negative integer maximum fractional digits.
 * @param {number} rowIndex - Row index for descriptive error messages.
 * @param {number} colIndex - Column index for descriptive error messages.
 * @returns {string} Normalized decimal string (never "-0").
 * @throws {TypeError} If `raw` is not a string.
 * @throws {RangeError} If `raw` is not a valid decimal string or exponent is out of range.
 */
function normalizeDecimalEntry(raw, precision, rowIndex, colIndex) {
	if (typeof raw !== 'string') {
		throw new TypeError(
			`Expected decimal string at matrix[${rowIndex}][${colIndex}], got ${typeof raw}`,
		);
	}

	const trimmed = raw.trim();
	const match = DECIMAL_REGEX.exec(trimmed);
	if (match === null) {
		throw new RangeError(
			`Invalid decimal string at matrix[${rowIndex}][${colIndex}]: "${raw}"`,
		);
	}

	const negative = match[1] === '-';
	const intDigits = match[2] ?? '';
	const fracDigits = match[3] ?? match[4] ?? '';
	const expStr = match[5];

	let exponent = 0;
	if (expStr !== undefined) {
		const parsedExp = Number(expStr);
		if (!Number.isSafeInteger(parsedExp) || Math.abs(parsedExp) > MAX_ABS_EXPONENT) {
			throw new RangeError(
				`Exponent out of supported range at matrix[${rowIndex}][${colIndex}]: "${raw}"`,
			);
		}
		exponent = parsedExp;
	}

	// Combine integer and fractional digits into a BigInt magnitude with decimal scale.
	const combinedDigits = intDigits + fracDigits;
	let magnitude = BigInt(combinedDigits);
	if (magnitude === 0n) {
		return '0';
	}

	let scale = fracDigits.length - exponent;

	if (scale < 0) {
		magnitude *= 10n ** BigInt(-scale);
		scale = 0;
	} else if (scale > precision) {
		const shift = scale - precision;
		const digitCount = magnitude.toString().length;

		// If shift exceeds digit count, magnitude < 10^(shift - 1) < 0.5 * 10^shift,
		// so half-away-from-zero rounding strictly yields 0.
		if (shift > digitCount) {
			return '0';
		}

		const divisor = 10n ** BigInt(shift);
		let quotient = magnitude / divisor;
		const remainder = magnitude % divisor;
		if (remainder * 2n >= divisor) {
			quotient += 1n;
		}
		magnitude = quotient;
		scale = precision;

		if (magnitude === 0n) {
			return '0';
		}
	}

	const digits = magnitude.toString();
	const signPrefix = negative ? '-' : '';

	if (scale === 0) {
		return signPrefix + digits;
	}

	let intPart;
	let fracPart;
	if (digits.length <= scale) {
		intPart = '0';
		fracPart = '0'.repeat(scale - digits.length) + digits;
	} else {
		const splitIndex = digits.length - scale;
		intPart = digits.slice(0, splitIndex);
		fracPart = digits.slice(splitIndex);
	}

	// Strip trailing fractional zeros iteratively.
	let end = fracPart.length;
	while (end > 0 && fracPart.charCodeAt(end - 1) === 48) {
		end -= 1;
	}

	if (end === 0) {
		return signPrefix + intPart;
	}

	return `${signPrefix}${intPart}.${fracPart.slice(0, end)}`;
}

/**
 * Computes the transpose of a 2D rectangular matrix of arbitrary-precision
 * decimal strings iteratively.
 *
 * Each entry is parsed into an exact BigInt fixed-point representation,
 * rounded half away from zero to at most `precision` fractional digits,
 * and normalized (stripping superfluous leading/trailing zeros and converting
 * any negative zero to `"0"`). The input matrix is never mutated.
 *
 * @param {string[][]} matrix - Non-empty rectangular `m x n` 2D array of decimal strings.
 *   Entries may include optional leading `+`/`-` signs, integer or fractional forms,
 *   and optional scientific notation (`e`/`E`).
 * @param {number} [precision=20] - Non-negative safe integer specifying the maximum
 *   number of fractional decimal places retained after rounding.
 * @returns {string[][]} A newly allocated `n x m` transposed matrix of normalized
 *   decimal strings where `result[c][r]` corresponds to `matrix[r][c]`.
 * @throws {TypeError} If `matrix` is not an array, any row is not an array,
 *   any matrix element is not a string, or `precision` is not a number.
 * @throws {RangeError} If `matrix` is empty, has empty rows, is jagged (non-rectangular),
 *   contains an invalid decimal string, or `precision` is not a non-negative safe integer.
 */
export function transposeDecimalIterative(matrix, precision = 20) {
	if (typeof precision !== 'number') {
		throw new TypeError(`precision must be a number, got ${typeof precision}`);
	}
	if (!Number.isSafeInteger(precision) || precision < 0) {
		throw new RangeError(
			`precision must be a non-negative safe integer, got ${precision}`,
		);
	}

	if (!Array.isArray(matrix)) {
		throw new TypeError(`matrix must be a 2D array, got ${typeof matrix}`);
	}
	const rows = matrix.length;
	if (rows === 0) {
		throw new RangeError('matrix must be non-empty');
	}

	if (!Array.isArray(matrix[0])) {
		throw new TypeError(`matrix[0] must be an array, got ${typeof matrix[0]}`);
	}
	const cols = matrix[0].length;
	if (cols === 0) {
		throw new RangeError('matrix rows must be non-empty');
	}

	for (let r = 1; r < rows; r += 1) {
		if (!Array.isArray(matrix[r])) {
			throw new TypeError(`matrix[${r}] must be an array, got ${typeof matrix[r]}`);
		}
		if (matrix[r].length !== cols) {
			throw new RangeError(
				`matrix must be rectangular: row 0 has length ${cols}, but row ${r} has length ${matrix[r].length}`,
			);
		}
	}

	const transposed = new Array(cols);
	for (let c = 0; c < cols; c += 1) {
		transposed[c] = new Array(rows);
	}

	for (let r = 0; r < rows; r += 1) {
		const row = matrix[r];
		for (let c = 0; c < cols; c += 1) {
			transposed[c][r] = normalizeDecimalEntry(row[c], precision, r, c);
		}
	}

	return transposed;
}
