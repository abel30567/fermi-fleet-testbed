/**
 * @typedef {Object} DualNumber
 * @property {number} v - Primal (real) value component.
 * @property {number} d - Forward-mode derivative (dual / infinitesimal) component.
 */

/**
 * Validates that a value is a well-formed dual number `{ v, d }` with finite numeric components.
 *
 * @param {unknown} entry - Candidate dual number to validate.
 * @param {number} row - Row index for error reporting.
 * @param {number} col - Column index for error reporting.
 * @throws {TypeError} If the entry is not a non-null object with numeric `v` and `d` properties.
 * @throws {RangeError} If `v` or `d` is not a finite number (`NaN`, `Infinity`, `-Infinity`).
 */
function validateDualEntry(entry, row, col) {
	if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
		throw new TypeError(`matrix[${row}][${col}] must be a dual number object { v, d }`);
	}
	if (typeof entry.v !== 'number' || typeof entry.d !== 'number') {
		throw new TypeError(`matrix[${row}][${col}] must have numeric properties "v" and "d"`);
	}
	if (!Number.isFinite(entry.v) || !Number.isFinite(entry.d)) {
		throw new RangeError(`matrix[${row}][${col}] properties "v" and "d" must be finite numbers`);
	}
}

/**
 * Computes the trace of a square matrix of dual numbers `{ v, d }` using a
 * straightforward iterative algorithm.
 *
 * For an n x n matrix A with dual-number entries A[i][j] = v + d*ε (ε² = 0),
 * the trace is the sum of the main diagonal entries:
 *   tr(A) = { v: sum_{i=0}^{n-1} A[i][i].v, d: sum_{i=0}^{n-1} A[i][i].d }.
 * For an empty (0 x 0) matrix, returns the additive identity `{ v: 0, d: 0 }`.
 *
 * @param {DualNumber[][]} matrix - Square matrix of dual numbers `{ v, d }`.
 * @returns {DualNumber} The trace as a new dual number `{ v, d }`.
 * @throws {TypeError} If `matrix` is not an array of arrays of valid dual number objects.
 * @throws {RangeError} If `matrix` is not square or any entry contains non-finite numbers.
 */
export function traceDualIterative(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('matrix must be an array of rows');
	}

	const n = matrix.length;

	for (let i = 0; i < n; i++) {
		const row = matrix[i];
		if (!Array.isArray(row)) {
			throw new TypeError(`matrix[${i}] must be an array`);
		}
		if (row.length !== n) {
			throw new RangeError(`matrix must be square: expected row ${i} to have length ${n}, got ${row.length}`);
		}
		for (let j = 0; j < n; j++) {
			validateDualEntry(row[j], i, j);
		}
	}

	let v = 0;
	let d = 0;
	for (let i = 0; i < n; i++) {
		const diag = matrix[i][i];
		v += diag.v;
		d += diag.d;
	}

	return { v, d };
}
