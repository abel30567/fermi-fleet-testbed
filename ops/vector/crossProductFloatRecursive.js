/**
 * Computes the 3D vector cross product (a × b) over IEEE-754 float64 numbers
 * using a recursive divide-and-conquer cofactor expansion.
 *
 * The component index range [0, 3) is recursively bisected (divide-and-conquer)
 * into individual basis components, each evaluated as the signed 2×2 minor
 * determinant via recursive Laplace cofactor expansion down to 1×1 base cases.
 *
 * @module ops/vector/crossProductFloatRecursive
 */

/**
 * Recursively validates that every element in a vector is a finite float64 number.
 *
 * @param {number[]} vec - Vector to validate.
 * @param {string} name - Parameter name used in error messages.
 * @param {number} [index=0] - Current element index.
 * @throws {TypeError} If any element is not of type `number`.
 * @throws {RangeError} If any element is `NaN` or non-finite (`±Infinity`).
 */
function validateElementsRecursive(vec, name, index = 0) {
	if (index >= vec.length) {
		return;
	}
	const value = vec[index];
	if (typeof value !== 'number') {
		throw new TypeError(`${name}[${index}] must be a number, received ${typeof value}`);
	}
	if (!Number.isFinite(value)) {
		throw new RangeError(`${name}[${index}] must be a finite float64 number, received ${value}`);
	}
	validateElementsRecursive(vec, name, index + 1);
}

/**
 * Validates that an argument is a 3-element array of finite float64 numbers.
 *
 * @param {unknown} vec - Candidate 3D vector.
 * @param {string} name - Parameter name used in error messages.
 * @throws {TypeError} If `vec` is not an Array or contains non-number elements.
 * @throws {RangeError} If `vec` does not have length 3 or contains non-finite numbers.
 */
function validateVector3(vec, name) {
	if (!Array.isArray(vec)) {
		throw new TypeError(`${name} must be an Array of 3 numbers`);
	}
	if (vec.length !== 3) {
		throw new RangeError(`${name} must have length 3, received ${vec.length}`);
	}
	validateElementsRecursive(vec, name, 0);
}

/**
 * Recursively builds a copy of `row` with the entry at `skipCol` omitted.
 *
 * @param {number[]} row - Source matrix row.
 * @param {number} skipCol - Column index to omit.
 * @param {number} [col=0] - Current column index.
 * @returns {number[]} Row with `skipCol` excluded.
 */
function omitColumnRecursive(row, skipCol, col = 0) {
	if (col >= row.length) {
		return [];
	}
	const rest = omitColumnRecursive(row, skipCol, col + 1);
	return col === skipCol ? rest : [row[col], ...rest];
}

/**
 * Recursively constructs the (n-1)×(n-1) minor submatrix by removing row 0
 * and column `skipCol`.
 *
 * @param {number[][]} matrix - Square matrix of order n >= 2.
 * @param {number} skipCol - Column index to remove.
 * @param {number} [row=1] - Current row index (starting after row 0).
 * @returns {number[][]} The minor submatrix.
 */
function buildMinorRecursive(matrix, skipCol, row = 1) {
	if (row >= matrix.length) {
		return [];
	}
	return [
		omitColumnRecursive(matrix[row], skipCol, 0),
		...buildMinorRecursive(matrix, skipCol, row + 1),
	];
}

/**
 * Recursively computes the determinant of an n×n matrix via Laplace cofactor
 * expansion along its first row.
 *
 * @param {number[][]} matrix - Square matrix of order n >= 1.
 * @returns {number} Determinant of `matrix`.
 */
function determinantRecursive(matrix) {
	const n = matrix.length;
	if (n === 1) {
		return matrix[0][0];
	}

	/**
	 * Recursively sums the cofactor terms across columns of row 0.
	 *
	 * @param {number} col - Current column index.
	 * @returns {number} Partial sum of cofactors from `col` to `n - 1`.
	 */
	function expandRow(col) {
		if (col >= n) {
			return 0;
		}
		const sign = col % 2 === 0 ? 1 : -1;
		const minor = buildMinorRecursive(matrix, col, 1);
		const term = sign * matrix[0][col] * determinantRecursive(minor);
		return term + expandRow(col + 1);
	}

	return expandRow(0);
}

/**
 * Recursively assembles cross-product components over the half-open basis
 * index range `[start, end)` using divide-and-conquer.
 *
 * @param {number[]} a - First 3D vector.
 * @param {number[]} b - Second 3D vector.
 * @param {number} start - Inclusive start basis index.
 * @param {number} end - Exclusive end basis index.
 * @returns {number[]} Computed components for indices `[start, end)`.
 */
function assembleCrossRecursive(a, b, start, end) {
	if (end - start === 1) {
		const k = start;
		const sign = k % 2 === 0 ? 1 : -1;
		const minor = [
			omitColumnRecursive(a, k, 0),
			omitColumnRecursive(b, k, 0),
		];
		const raw = sign * determinantRecursive(minor);
		return [raw === 0 ? 0 : raw];
	}

	const mid = start + Math.floor((end - start) / 2);
	const left = assembleCrossRecursive(a, b, start, mid);
	const right = assembleCrossRecursive(a, b, mid, end);
	return [...left, ...right];
}

/**
 * Computes the 3D cross product `a × b` of two finite IEEE-754 float64 vectors
 * using a recursive divide-and-conquer cofactor expansion.
 *
 * @param {[number, number, number]} a - First 3D vector `[ax, ay, az]`.
 * @param {[number, number, number]} b - Second 3D vector `[bx, by, bz]`.
 * @returns {[number, number, number]} The cross product vector `[cx, cy, cz]`.
 * @throws {TypeError} If `a` or `b` is not an Array or contains non-number elements.
 * @throws {RangeError} If `a` or `b` does not have length 3 or contains non-finite numbers.
 */
export function crossProductFloatRecursive(a, b) {
	validateVector3(a, 'a');
	validateVector3(b, 'b');
	return /** @type {[number, number, number]} */ (assembleCrossRecursive(a, b, 0, 3));
}
