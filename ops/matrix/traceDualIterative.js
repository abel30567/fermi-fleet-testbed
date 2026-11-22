/**
 * @typedef {Object} DualNumber
 * @property {number} v - Primal value (must be a finite number).
 * @property {number} d - Forward-mode derivative component (must be a finite number).
 */

/**
 * Validates that a value is a well-formed dual number `{ v, d }` with finite numeric components.
 *
 * @param {unknown} entry - The value to validate.
 * @param {number} row - Row index for descriptive error reporting.
 * @param {number} col - Column index for descriptive error reporting.
 * @throws {TypeError} If the entry is not a non-null object or its `v`/`d` properties are not numbers.
 * @throws {RangeError} If `v` or `d` is not a finite number (e.g., `NaN`, `Infinity`, `-Infinity`).
 */
function validateDualEntry(entry, row, col) {
	if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
		throw new TypeError(`matrix[${row}][${col}] must be a dual number object { v, d }`);
	}
	if (typeof entry.v !== 'number' || typeof entry.d !== 'number') {
		throw new TypeError(`matrix[${row}][${col}] must have numeric "v" and "d" properties`);
	}
	if (!Number.isFinite(entry.v) || !Number.isFinite(entry.d)) {
		throw new RangeError(`matrix[${row}][${col}] must have finite "v" and "d" values`);
	}
}

/**
 * Computes the trace of a square matrix over dual numbers `{ v, d }` iteratively.
 *
 * For an n × n matrix A whose entries are dual numbers A[i][j] = (v_ij, d_ij),
 * the trace is the sum of the main diagonal entries:
 *   tr(A) = { v: Σ A[i][i].v, d: Σ A[i][i].d } for i = 0 .. n - 1.
 *
 * Because the trace is a linear operator, the derivative of the trace equals the
 * trace of the derivative matrix: d(tr(A)) = tr(dA).
 *
 * @param {DualNumber[][]} matrix - Non-empty square n × n 2D array of dual numbers `{ v, d }`.
 * @returns {DualNumber} The dual-number trace `{ v, d }`.
 * @throws {TypeError} If `matrix` is not a 2D array or any entry is not a valid dual object with numeric `v` and `d`.
 * @throws {RangeError} If `matrix` is empty, non-square/ragged, or contains non-finite `v` or `d` values.
 */
export function traceDualIterative(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('matrix must be a 2D array of dual numbers');
	}

	const n = matrix.length;
	if (n === 0) {
		throw new RangeError('matrix must be a non-empty square 2D array');
	}

	for (let i = 0; i < n; i++) {
		const row = matrix[i];
		if (!Array.isArray(row)) {
			throw new TypeError(`matrix[${i}] must be an array`);
		}
		if (row.length !== n) {
			throw new RangeError(
				`matrix must be square (${n}x${n}), but row ${i} has length ${row.length}`
			);
		}
		for (let j = 0; j < n; j++) {
			validateDualEntry(row[j], i, j);
		}
	}

	let sumV = 0;
	let sumD = 0;
	for (let i = 0; i < n; i++) {
		const diag = matrix[i][i];
		sumV += diag.v;
		sumD += diag.d;
	}

	return { v: sumV, d: sumD };
}
