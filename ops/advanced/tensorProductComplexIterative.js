/**
 * @typedef {Object} Complex
 * @property {number} re - Real part (finite number).
 * @property {number} im - Imaginary part (finite number).
 */

/**
 * Validates that a value is a complex number object `{ re, im }` with finite numeric parts.
 *
 * @param {unknown} value - Candidate complex number.
 * @param {string} label - Descriptive label for error messages.
 * @throws {TypeError} If `value` is not a plain object with numeric `re` and `im` properties.
 * @throws {RangeError} If `re` or `im` is not finite (`NaN`, `Infinity`, `-Infinity`).
 */
function validateComplex(value, label) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(`${label} must be a complex number object { re, im }`);
	}
	if (typeof value.re !== 'number' || typeof value.im !== 'number') {
		throw new TypeError(`${label} must have numeric re and im properties`);
	}
	if (!Number.isFinite(value.re) || !Number.isFinite(value.im)) {
		throw new RangeError(`${label} must have finite re and im values`);
	}
}

/**
 * Validates a 1D complex vector or 2D complex matrix and returns its rank and dimensions.
 *
 * @param {unknown} tensor - Input array to validate.
 * @param {string} name - Parameter name for error messages.
 * @returns {{ rank: 0 } | { rank: 1, length: number } | { rank: 2, rows: number, cols: number }}
 * @throws {TypeError} If `tensor` is not an array or contains invalid element types.
 * @throws {RangeError} If a 2D matrix is ragged or contains non-finite complex components.
 */
function validateTensor(tensor, name) {
	if (!Array.isArray(tensor)) {
		throw new TypeError(`${name} must be a 1D array or 2D matrix of complex numbers { re, im }`);
	}

	if (tensor.length === 0) {
		return { rank: 0 };
	}

	if (Array.isArray(tensor[0])) {
		const rows = tensor.length;
		const cols = tensor[0].length;
		for (let i = 0; i < rows; i++) {
			const row = tensor[i];
			if (!Array.isArray(row)) {
				throw new TypeError(`${name}[${i}] must be an array row in a 2D matrix`);
			}
			if (row.length !== cols) {
				throw new RangeError(`${name} must be rectangular: row ${i} has length ${row.length}, expected ${cols}`);
			}
			for (let j = 0; j < cols; j++) {
				validateComplex(row[j], `${name}[${i}][${j}]`);
			}
		}
		return { rank: 2, rows, cols };
	}

	const length = tensor.length;
	for (let i = 0; i < length; i++) {
		validateComplex(tensor[i], `${name}[${i}]`);
	}
	return { rank: 1, length };
}

/**
 * Multiplies two complex numbers `{ re, im }`, normalizing `-0` to `0`.
 *
 * @param {Complex} z - First complex factor.
 * @param {Complex} w - Second complex factor.
 * @returns {Complex} Product `z * w`.
 */
function mulComplex(z, w) {
	const re = z.re * w.re - z.im * w.im;
	const im = z.re * w.im + z.im * w.re;
	return {
		re: re === 0 ? 0 : re,
		im: im === 0 ? 0 : im,
	};
}

/**
 * Computes the tensor (Kronecker) product of two complex vectors or two complex matrices
 * using a straightforward iterative implementation.
 *
 * - For 1D complex vectors `a` (length `m`) and `b` (length `n`), returns a 1D complex vector
 *   of length `m * n` where `result[i * n + j] = a[i] * b[j]`.
 * - For 2D complex matrices `a` (`m x n`) and `b` (`p x q`), returns a 2D complex matrix
 *   of shape `(m * p) x (n * q)` where `result[i * p + k][j * q + l] = a[i][j] * b[k][l]`.
 * - If either operand is empty (`[]`), validates the other operand and returns `[]`.
 *
 * @param {Complex[] | Complex[][]} a - First complex vector or matrix.
 * @param {Complex[] | Complex[][]} b - Second complex vector or matrix (same rank as `a`).
 * @returns {Complex[] | Complex[][]} The tensor (Kronecker) product `a ⊗ b`.
 * @throws {TypeError} If inputs are not valid arrays of `{ re, im }` objects or have mismatched ranks.
 * @throws {RangeError} If a matrix is ragged or any complex component is non-finite.
 */
export function tensorProductComplexIterative(a, b) {
	const metaA = validateTensor(a, 'a');
	const metaB = validateTensor(b, 'b');

	if (metaA.rank === 0 || metaB.rank === 0) {
		return [];
	}

	if (metaA.rank !== metaB.rank) {
		throw new TypeError(
			`Rank mismatch: cannot compute tensor product of a ${metaA.rank}D operand and a ${metaB.rank}D operand`,
		);
	}

	if (metaA.rank === 1) {
		const m = metaA.length;
		const n = metaB.length;
		const result = new Array(m * n);
		for (let i = 0; i < m; i++) {
			const ai = a[i];
			const offset = i * n;
			for (let j = 0; j < n; j++) {
				result[offset + j] = mulComplex(ai, b[j]);
			}
		}
		return result;
	}

	const m = metaA.rows;
	const n = metaA.cols;
	const p = metaB.rows;
	const q = metaB.cols;
	const outRows = m * p;
	const outCols = n * q;
	const result = new Array(outRows);

	for (let i = 0; i < m; i++) {
		const rowA = a[i];
		for (let k = 0; k < p; k++) {
			const rowB = b[k];
			const outRow = new Array(outCols);
			for (let j = 0; j < n; j++) {
				const aij = rowA[j];
				const colOffset = j * q;
				for (let l = 0; l < q; l++) {
					outRow[colOffset + l] = mulComplex(aij, rowB[l]);
				}
			}
			result[i * p + k] = outRow;
		}
	}

	return result;
}
