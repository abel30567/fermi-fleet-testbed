/**
 * @typedef {Object} DualNumber
 * @property {number} v Primal value component (finite real number).
 * @property {number} d Dual / forward-mode derivative component (finite real number).
 */

/**
 * Validates that a value is a well-formed dual number `{ v, d }` with finite numeric components.
 *
 * @param {unknown} entry - Candidate dual number.
 * @param {number} row - Row index for error reporting.
 * @param {number} col - Column index for error reporting.
 * @throws {TypeError} If `entry` is not a plain-like object with numeric `v` and `d` properties.
 * @throws {RangeError} If `entry.v` or `entry.d` is not a finite number.
 */
function assertDualEntry(entry, row, col) {
	if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
		throw new TypeError(
			`Expected dual number { v, d } at matrix[${row}][${col}]`
		)
	}
	if (typeof entry.v !== 'number' || typeof entry.d !== 'number') {
		throw new TypeError(
			`Expected numeric v and d at matrix[${row}][${col}]`
		)
	}
	if (!Number.isFinite(entry.v) || !Number.isFinite(entry.d)) {
		throw new RangeError(
			`Expected finite v and d at matrix[${row}][${col}]`
		)
	}
}

/**
 * Computes the matrix trace over dual numbers `{ v, d }`, propagating a
 * forward-mode derivative alongside the primal value.
 *
 * For a square dual matrix `M = A + εB` (with `ε² = 0`), the trace is linear,
 * giving the exact closed-form / first-order Taylor series identity:
 *
 *     tr(A + εB) = tr(A) + ε·tr(B) = (Σ A_ii) + ε·(Σ B_ii)
 *
 * Both the primal sum `v` and tangent sum `d` are accumulated using Neumaier
 * compensated summation to reduce floating-point cancellation error.
 *
 * @param {DualNumber[][]} matrix - Square `n × n` matrix of dual numbers `{ v, d }`.
 *   An empty `0 × 0` matrix `[]` has trace `{ v: 0, d: 0 }`.
 * @returns {DualNumber} Dual trace `{ v, d }` where `v = tr(A)` and `d = tr(B)`.
 * @throws {TypeError} If `matrix` or any row is not an array, or any entry is not `{ v, d }` with numbers.
 * @throws {RangeError} If `matrix` is not square or any entry contains a non-finite number.
 *
 * @example
 * traceDualSeries([
 *   [{ v: 1, d: 2 }, { v: 3, d: 4 }],
 *   [{ v: 5, d: 6 }, { v: 7, d: 8 }]
 * ])
 * // => { v: 8, d: 10 }
 */
export function traceDualSeries(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('Expected matrix to be a 2D array of dual numbers { v, d }')
	}

	const n = matrix.length

	for (let i = 0; i < n; i++) {
		if (!Array.isArray(matrix[i])) {
			throw new TypeError(`Expected matrix[${i}] to be an array`)
		}
	}

	for (let i = 0; i < n; i++) {
		const row = matrix[i]
		if (row.length !== n) {
			throw new RangeError(
				`Expected square matrix (${n}×${n}), but row ${i} has length ${row.length}`
			)
		}
		for (let j = 0; j < n; j++) {
			assertDualEntry(row[j], i, j)
		}
	}

	if (n === 0) {
		return { v: 0, d: 0 }
	}

	// Neumaier compensated summation for primal (v) and dual (d) diagonal components
	let sumV = 0
	let compV = 0
	let sumD = 0
	let compD = 0

	for (let i = 0; i < n; i++) {
		const { v, d } = matrix[i][i]

		const nextV = sumV + v
		if (Number.isFinite(nextV)) {
			if (Math.abs(sumV) >= Math.abs(v)) {
				compV += (sumV - nextV) + v
			} else {
				compV += (v - nextV) + sumV
			}
		} else {
			compV = 0
		}
		sumV = nextV

		const nextD = sumD + d
		if (Number.isFinite(nextD)) {
			if (Math.abs(sumD) >= Math.abs(d)) {
				compD += (sumD - nextD) + d
			} else {
				compD += (d - nextD) + sumD
			}
		} else {
			compD = 0
		}
		sumD = nextD
	}

	const totalV = sumV + compV
	const totalD = sumD + compD

	return {
		v: totalV === 0 ? 0 : totalV,
		d: totalD === 0 ? 0 : totalD,
	}
}
