/**
 * Canonicalizes a validated finite IEEE-754 number by converting `-0` to `+0`.
 *
 * @param {number} value - A finite number.
 * @returns {number} Canonical number (`+0` when `value === 0`, otherwise `value`).
 */
function canonicalizeZero(value) {
	return value === 0 ? 0 : value;
}

/**
 * Validates an interval `[lo, hi]` and returns a newly allocated canonical copy.
 *
 * @param {unknown} entry - Candidate interval tuple.
 * @param {number} rowIndex - Row index for error reporting.
 * @param {number} colIndex - Column index for error reporting.
 * @returns {[number, number]} Deep-copied canonical `[lo, hi]` interval.
 */
function cloneAndValidateInterval(entry, rowIndex, colIndex) {
	if (!Array.isArray(entry)) {
		throw new TypeError(
			`Interval at [${rowIndex}][${colIndex}] must be a [lo, hi] array`
		);
	}
	if (entry.length !== 2) {
		throw new RangeError(
			`Interval at [${rowIndex}][${colIndex}] must have length 2, got ${entry.length}`
		);
	}

	const lo = entry[0];
	const hi = entry[1];

	if (typeof lo !== 'number' || typeof hi !== 'number') {
		throw new TypeError(
			`Interval endpoints at [${rowIndex}][${colIndex}] must be numbers`
		);
	}
	if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
		throw new RangeError(
			`Interval endpoints at [${rowIndex}][${colIndex}] must be finite numbers`
		);
	}
	if (lo > hi) {
		throw new RangeError(
			`Interval at [${rowIndex}][${colIndex}] is inverted: lo (${lo}) > hi (${hi})`
		);
	}

	return [canonicalizeZero(lo), canonicalizeZero(hi)];
}

/**
 * Computes the transpose of an interval matrix over IEEE-754 binary64 intervals `[lo, hi]`.
 *
 * Each entry `matrix[i][j]` must be a valid finite interval `[lo, hi]` with `lo <= hi`.
 * Because transposition is an exact index permutation `(A^T)[j][i] = A[i][j]` with no
 * floating-point arithmetic on endpoints, copying validated endpoints directly yields the
 * tightest possible outward-rounded enclosure (zero ULP inflation, exact interval hull)
 * across the full finite IEEE-754 range including subnormals and `±Number.MAX_VALUE`.
 *
 * Signed zeros (`-0`) are canonicalized to `+0` without altering mathematical enclosure,
 * and every output row and interval tuple is freshly allocated to prevent aliasing.
 *
 * @param {Array<Array<[number, number]>>} matrix - Non-empty rectangular `m x n` interval matrix.
 * @returns {Array<Array<[number, number]>>} Deep-copied `n x m` transposed interval matrix.
 * @throws {TypeError} If the matrix, any row, any interval, or any endpoint has an invalid type.
 * @throws {RangeError} If the matrix is empty, ragged, or contains non-finite, malformed, or inverted intervals.
 */
export function transposeIntervalStable(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('Input matrix must be an array of rows');
	}

	const rows = matrix.length;
	if (rows === 0) {
		throw new RangeError('Input matrix must be non-empty');
	}

	const firstRow = matrix[0];
	if (!Array.isArray(firstRow)) {
		throw new TypeError('Matrix row 0 must be an array');
	}

	const cols = firstRow.length;
	if (cols === 0) {
		throw new RangeError('Input matrix rows must be non-empty');
	}

	// Validate rectangular structure before allocating the transposed result.
	for (let i = 1; i < rows; i++) {
		const row = matrix[i];
		if (!Array.isArray(row)) {
			throw new TypeError(`Matrix row ${i} must be an array`);
		}
		if (row.length !== cols) {
			throw new RangeError(
				`Input matrix must be rectangular: row ${i} has length ${row.length}, expected ${cols}`
			);
		}
	}

	/** @type {Array<Array<[number, number]>>} */
	const result = new Array(cols);
	for (let j = 0; j < cols; j++) {
		result[j] = new Array(rows);
	}

	for (let i = 0; i < rows; i++) {
		const row = matrix[i];
		for (let j = 0; j < cols; j++) {
			result[j][i] = cloneAndValidateInterval(row[j], i, j);
		}
	}

	return result;
}
