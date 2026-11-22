/**
 * @typedef {[number, number]} Interval
 * A closed real interval `[lo, hi]` with `lo <= hi` (neither bound may be `NaN`).
 */

/**
 * @typedef {Interval[][]} IntervalMatrix
 * A non-empty rectangular 2D array of `[lo, hi]` intervals of shape `m × n`.
 */

/**
 * Normalizes IEEE-754 negative zero (`-0`) to positive zero (`+0`) without
 * altering the mathematical value or shrinking interval enclosure.
 *
 * @param {number} value
 * @returns {number}
 */
function normalizeZero(value) {
	return value === 0 ? 0 : value;
}

/**
 * Computes the transpose of a 2D interval matrix using a straightforward
 * iterative implementation.
 *
 * For an `m × n` interval matrix `M` whose entries are closed intervals
 * `M[i][j] = [lo, hi]`, returns a fresh `n × m` interval matrix `T` such that
 * `T[j][i] = [lo, hi]` (with `-0` normalized to `+0`).
 *
 * Because matrix transposition is an exact index permutation with no
 * floating-point arithmetic operations, outward rounding incurs zero rounding
 * error and guarantees exact enclosure: for every real matrix `A ∈ M`, its
 * transpose satisfies `Aᵀ ∈ transposeIntervalIterative(M)`, and the result is
 * the tightest possible interval hull.
 *
 * All output rows and interval tuples are freshly allocated so that the
 * returned matrix shares no mutable references with `M`.
 *
 * Complexity: `O(m * n)` time and `O(m * n)` space.
 *
 * @param {IntervalMatrix} M - Non-empty rectangular 2D matrix of `[lo, hi]` intervals.
 * @returns {IntervalMatrix} Freshly allocated transposed interval matrix of shape `n × m`.
 * @throws {TypeError} If `M` is not an array, any row is not an array, or any
 *   cell is not a 2-element array of numbers.
 * @throws {RangeError} If `M` is empty, has empty rows, is ragged (non-rectangular),
 *   contains `NaN` bounds, or contains an inverted interval (`lo > hi`).
 *
 * @example
 * transposeIntervalIterative([
 *   [[1, 2], [3, 4]],
 *   [[5, 6], [7, 8]],
 *   [[9, 10], [11, 12]],
 * ]);
 * // => [
 * //   [[1, 2], [5, 6], [9, 10]],
 * //   [[3, 4], [7, 8], [11, 12]],
 * // ]
 */
export function transposeIntervalIterative(M) {
	if (!Array.isArray(M)) {
		throw new TypeError('Expected M to be a 2D array of [lo, hi] intervals');
	}

	const rows = M.length;
	if (rows === 0) {
		throw new RangeError('Matrix M must be non-empty');
	}

	if (!Array.isArray(M[0])) {
		throw new TypeError('Row 0 of matrix M must be an array');
	}

	const cols = M[0].length;
	if (cols === 0) {
		throw new RangeError('Matrix M rows must be non-empty');
	}

	for (let i = 1; i < rows; i++) {
		if (!Array.isArray(M[i])) {
			throw new TypeError(`Row ${i} of matrix M must be an array`);
		}
		if (M[i].length !== cols) {
			throw new RangeError(
				`Matrix M must be rectangular: row ${i} has length ${M[i].length}, expected ${cols}`,
			);
		}
	}

	/** @type {IntervalMatrix} */
	const result = new Array(cols);
	for (let j = 0; j < cols; j++) {
		result[j] = new Array(rows);
	}

	for (let i = 0; i < rows; i++) {
		const row = M[i];
		for (let j = 0; j < cols; j++) {
			const cell = row[j];
			if (!Array.isArray(cell) || cell.length !== 2) {
				throw new TypeError(
					`Entry M[${i}][${j}] must be a [lo, hi] 2-element array`,
				);
			}

			const lo = cell[0];
			const hi = cell[1];

			if (typeof lo !== 'number' || typeof hi !== 'number') {
				throw new TypeError(
					`Interval bounds at M[${i}][${j}] must be numbers`,
				);
			}

			if (Number.isNaN(lo) || Number.isNaN(hi)) {
				throw new RangeError(
					`Interval bounds at M[${i}][${j}] must not be NaN`,
				);
			}

			if (lo > hi) {
				throw new RangeError(
					`Invalid interval at M[${i}][${j}]: lower bound (${lo}) exceeds upper bound (${hi})`,
				);
			}

			result[j][i] = [normalizeZero(lo), normalizeZero(hi)];
		}
	}

	return result;
}
