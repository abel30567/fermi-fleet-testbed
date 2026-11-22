/**
 * Computes the trace of an n×n row-major square matrix stored in a Float64Array
 * using a straightforward iterative loop over the main diagonal.
 *
 * The trace of a square matrix A ∈ R^(n×n) is defined as:
 *   tr(A) = Σ_{i=0}^{n-1} A[i, i] = Σ_{i=0}^{n-1} matrix[i * n + i]
 *
 * For an empty 0×0 matrix (`matrix.length === 0`), the trace is 0.
 *
 * Algorithm:
 * 1. Validate that `matrix` is a `Float64Array`.
 * 2. Determine and validate the matrix dimension `n` (either explicitly given
 *    or inferred as `sqrt(matrix.length)` when omitted), verifying `matrix.length === n * n`.
 * 3. Verify that all entries of `matrix` are finite numbers (rejecting `NaN` and `±Infinity`).
 * 4. Iteratively accumulate `matrix[i * (n + 1)]` for `i = 0 .. n - 1`.
 *
 * @param {Float64Array} matrix - Row-major flattened n×n square matrix of finite float64 values.
 * @param {number} [n] - Optional non-negative safe integer dimension of the square matrix.
 *   If omitted, inferred from `Math.sqrt(matrix.length)`.
 * @returns {number} The scalar trace (sum of main diagonal entries).
 * @throws {TypeError} If `matrix` is not a `Float64Array`, or if `n` is provided and not a number.
 * @throws {RangeError} If `n` is not a non-negative safe integer, if `matrix.length !== n * n`
 *   (or `matrix.length` is not a perfect square when `n` is omitted), or if any entry in `matrix`
 *   is not finite (`NaN`, `Infinity`, or `-Infinity`).
 */
export function traceTypedIterative(matrix, n) {
	if (!(matrix instanceof Float64Array)) {
		throw new TypeError('matrix must be a Float64Array');
	}

	const len = matrix.length;
	let dim;

	if (n === undefined) {
		dim = Math.round(Math.sqrt(len));
		if (dim * dim !== len) {
			throw new RangeError(
				`matrix length (${len}) must be a perfect square when dimension n is omitted`
			);
		}
	} else {
		if (typeof n !== 'number') {
			throw new TypeError('n must be a number');
		}
		if (!Number.isSafeInteger(n) || n < 0) {
			throw new RangeError(`n must be a non-negative safe integer, got ${n}`);
		}
		if (len !== n * n) {
			throw new RangeError(
				`matrix length (${len}) does not match n * n (${n * n}) for n = ${n}`
			);
		}
		dim = n;
	}

	for (let k = 0; k < len; k++) {
		if (!Number.isFinite(matrix[k])) {
			throw new RangeError(`matrix contains non-finite value at index ${k}: ${matrix[k]}`);
		}
	}

	let sum = 0;
	const stride = dim + 1;
	for (let i = 0; i < dim; i++) {
		sum += matrix[i * stride];
	}

	return sum;
}
