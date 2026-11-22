/**
 * @typedef {{ v: number, d: number }} DualNumber
 * A forward-mode dual number where `v` is the primal value and `d` is the derivative.
 */

/**
 * Validates that a value is a well-formed dual number `{ v, d }` with finite numeric components.
 *
 * @param {unknown} entry - Candidate dual number entry.
 * @param {number} row - Row index for error diagnostics.
 * @param {number} col - Column index for error diagnostics.
 * @throws {TypeError} If `entry` is not an object with numeric `v` and `d` properties.
 * @throws {RangeError} If `entry.v` or `entry.d` is not a finite number.
 */
function assertDualNumber(entry, row, col) {
	if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
		throw new TypeError(
			`Expected a dual number object { v, d } at matrix[${row}][${col}]`
		)
	}
	if (typeof entry.v !== 'number' || typeof entry.d !== 'number') {
		throw new TypeError(
			`Expected numeric v and d properties at matrix[${row}][${col}]`
		)
	}
	if (!Number.isFinite(entry.v) || !Number.isFinite(entry.d)) {
		throw new RangeError(
			`Expected finite v and d values at matrix[${row}][${col}]`
		)
	}
}

/**
 * Computes the transpose of a rectangular 2D matrix of dual numbers `{ v, d }`
 * using a straightforward iterative algorithm.
 *
 * Because transposition is linear, differentiating entrywise commutes with
 * transposition: `(A(t)^T)' = (A'(t))^T`. Each dual entry is deep-copied into
 * the resulting `n × m` matrix so mutating the output never mutates the input.
 *
 * @param {DualNumber[][]} matrix - Non-empty rectangular `m × n` matrix of dual numbers `{ v, d }`.
 * @returns {DualNumber[][]} Newly allocated `n × m` transposed matrix of dual numbers `{ v, d }`.
 * @throws {TypeError} If `matrix` is not a 2D array or contains an invalid dual number entry.
 * @throws {RangeError} If `matrix` is empty, has empty rows, is ragged, or has non-finite components.
 */
export function transposeDualIterative(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('Expected matrix to be a 2D array of dual numbers')
	}

	const rows = matrix.length
	if (rows === 0) {
		throw new RangeError('Expected matrix to be non-empty')
	}

	if (!Array.isArray(matrix[0])) {
		throw new TypeError('Expected matrix[0] to be an array')
	}

	const cols = matrix[0].length
	if (cols === 0) {
		throw new RangeError('Expected matrix rows to be non-empty')
	}

	for (let i = 1; i < rows; i += 1) {
		const row = matrix[i]
		if (!Array.isArray(row)) {
			throw new TypeError(`Expected matrix[${i}] to be an array`)
		}
		if (row.length !== cols) {
			throw new RangeError(
				`Expected rectangular matrix: row ${i} has length ${row.length}, expected ${cols}`
			)
		}
	}

	const result = new Array(cols)
	for (let j = 0; j < cols; j += 1) {
		result[j] = new Array(rows)
	}

	for (let i = 0; i < rows; i += 1) {
		const row = matrix[i]
		for (let j = 0; j < cols; j += 1) {
			const entry = row[j]
			assertDualNumber(entry, i, j)
			result[j][i] = { v: entry.v, d: entry.d }
		}
	}

	return result
}
