/**
 * @typedef {{ v: number, d: number }} DualNumber
 * A dual number representing a primal value `v` and its forward-mode derivative `d`.
 */

/**
 * Validates that a matrix is a non-empty rectangular 2D array of finite dual numbers.
 *
 * @param {unknown} matrix - The value to validate.
 * @param {string} name - Parameter name for descriptive error messages.
 * @returns {{ rows: number, cols: number }} The validated matrix dimensions.
 * @throws {TypeError} If `matrix` is not a 2D array or contains non-dual entries.
 * @throws {RangeError} If `matrix` is empty, has empty/ragged rows, or contains non-finite numbers.
 */
function validateDualMatrix(matrix, name) {
	if (!Array.isArray(matrix)) {
		throw new TypeError(`${name} must be a 2D array of dual numbers`)
	}

	const rows = matrix.length
	if (rows === 0) {
		throw new RangeError(`${name} must not be empty`)
	}

	if (!Array.isArray(matrix[0])) {
		throw new TypeError(`${name}[0] must be an array`)
	}

	const cols = matrix[0].length
	if (cols === 0) {
		throw new RangeError(`${name} rows must not be empty`)
	}

	for (let i = 0; i < rows; i++) {
		const row = matrix[i]
		if (!Array.isArray(row)) {
			throw new TypeError(`${name}[${i}] must be an array`)
		}
		if (row.length !== cols) {
			throw new RangeError(
				`${name} must be rectangular: row ${i} has length ${row.length}, expected ${cols}`
			)
		}
		for (let j = 0; j < cols; j++) {
			const cell = row[j]
			if (cell === null || typeof cell !== 'object' || Array.isArray(cell)) {
				throw new TypeError(
					`${name}[${i}][${j}] must be a dual number object { v, d }`
				)
			}
			if (typeof cell.v !== 'number' || typeof cell.d !== 'number') {
				throw new TypeError(
					`${name}[${i}][${j}] must have numeric v and d properties`
				)
			}
			if (!Number.isFinite(cell.v) || !Number.isFinite(cell.d)) {
				throw new RangeError(
					`${name}[${i}][${j}] must have finite v and d values`
				)
			}
		}
	}

	return { rows, cols }
}

/**
 * Multiplies two matrices of dual numbers `{ v, d }` iteratively.
 *
 * Computes `C = A * B` for an `m × k` matrix `a` and a `k × n` matrix `b` using a
 * standard triple-nested loop where each entry is accumulated as:
 * `C[i][j] = sum_{p=0}^{k-1} dualMul(a[i][p], b[p][j])`
 * with `dualMul(x, y) = { v: x.v * y.v, d: x.v * y.d + x.d * y.v }`.
 *
 * @param {DualNumber[][]} a - Left operand matrix of shape `m × k`.
 * @param {DualNumber[][]} b - Right operand matrix of shape `k × n`.
 * @returns {DualNumber[][]} Product matrix of shape `m × n` with primal values and derivatives.
 * @throws {TypeError} If `a` or `b` is not a 2D array or contains invalid dual entries.
 * @throws {RangeError} If `a` or `b` is empty, ragged, contains non-finite numbers, or has incompatible dimensions (`a[0].length !== b.length`).
 */
export function matMulDualIterative(a, b) {
	const { rows: m, cols: k } = validateDualMatrix(a, 'a')
	const { rows: bRows, cols: n } = validateDualMatrix(b, 'b')

	if (k !== bRows) {
		throw new RangeError(
			`Incompatible matrix dimensions: ${m}x${k} cannot be multiplied by ${bRows}x${n}`
		)
	}

	const result = new Array(m)

	for (let i = 0; i < m; i++) {
		const rowA = a[i]
		const outRow = new Array(n)

		for (let j = 0; j < n; j++) {
			let v = 0
			let d = 0

			for (let p = 0; p < k; p++) {
				const x = rowA[p]
				const y = b[p][j]
				v += x.v * y.v
				d += x.v * y.d + x.d * y.v
			}

			outRow[j] = { v, d }
		}

		result[i] = outRow
	}

	return result
}
