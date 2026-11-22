/**
 * @typedef {Object} DualNumber
 * @property {number} v - Primal value (real part).
 * @property {number} d - Tangent / forward-mode derivative (dual part, coefficient of ε).
 */

/**
 * Validates that a value is a well-formed dual number `{ v, d }` with finite numbers.
 *
 * @param {unknown} entry - Candidate dual number.
 * @param {number} row - Row index for diagnostics.
 * @param {number} col - Column index for diagnostics.
 * @throws {TypeError} If the entry is not a non-null plain object or lacks numeric `v`/`d`.
 * @throws {RangeError} If `v` or `d` is not finite (`NaN`, `Infinity`, `-Infinity`).
 */
function assertDualNumber(entry, row, col) {
	if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
		throw new TypeError(`Expected dual number object {v, d} at [${row}][${col}]`)
	}
	if (typeof entry.v !== 'number' || typeof entry.d !== 'number') {
		throw new TypeError(`Dual number at [${row}][${col}] must have numeric v and d properties`)
	}
	if (!Number.isFinite(entry.v) || !Number.isFinite(entry.d)) {
		throw new RangeError(`Dual number at [${row}][${col}] must have finite v and d values`)
	}
}

/**
 * Computes the matrix trace over a square matrix of dual numbers `{ v, d }`.
 *
 * A dual matrix can be written as `M = A + εB` where `ε² = 0`, `A` holds the primal
 * values (`v`), and `B` holds the forward-mode derivatives (`d`). By linearity of the
 * trace operator, the exact closed-form (and first-order dual series) identity is:
 *
 *   tr(A + εB) = tr(A) + ε tr(B) = (Σᵢ Aᵢᵢ) + ε (Σᵢ Bᵢᵢ)
 *
 * Uses Neumaier compensated summation for numerical stability on both components.
 *
 * @param {DualNumber[][]} matrix - Non-empty square 2D array of dual numbers `{ v, d }`.
 * @returns {DualNumber} The trace as a dual number `{ v, d }`.
 * @throws {TypeError} If `matrix` is not a 2D array of dual number objects `{ v, d }`.
 * @throws {RangeError} If `matrix` is empty, non-square, or contains non-finite values.
 */
export function traceDualSeries(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('Expected matrix to be a non-empty 2D array')
	}

	const n = matrix.length
	if (n === 0) {
		throw new RangeError('Expected matrix to be non-empty')
	}

	for (let i = 0; i < n; i++) {
		const row = matrix[i]
		if (!Array.isArray(row)) {
			throw new TypeError(`Expected row ${i} to be an array`)
		}
		if (row.length !== n) {
			throw new RangeError(`Expected square ${n}x${n} matrix, but row ${i} has length ${row.length}`)
		}
		for (let j = 0; j < n; j++) {
			assertDualNumber(row[j], i, j)
		}
	}

	// Neumaier compensated summation for both primal (v) and derivative (d) diagonal sums
	let sumV = 0
	let compV = 0
	let sumD = 0
	let compD = 0

	for (let i = 0; i < n; i++) {
		const { v, d } = matrix[i][i]

		const nextV = sumV + v
		if (Math.abs(sumV) >= Math.abs(v)) {
			compV += (sumV - nextV) + v
		} else {
			compV += (v - nextV) + sumV
		}
		sumV = nextV

		const nextD = sumD + d
		if (Math.abs(sumD) >= Math.abs(d)) {
			compD += (sumD - nextD) + d
		} else {
			compD += (d - nextD) + sumD
		}
		sumD = nextD
	}

	const v = sumV + compV
	const d = sumD + compD

	return {
		v: Object.is(v, -0) ? 0 : v,
		d: Object.is(d, -0) ? 0 : d,
	}
}
