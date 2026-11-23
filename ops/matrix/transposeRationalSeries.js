/**
 * Computes the greatest common divisor of two non-negative BigInts via the Euclidean algorithm.
 *
 * @param {bigint} a - Non-negative integer.
 * @param {bigint} b - Non-negative integer.
 * @returns {bigint} Greatest common divisor of `a` and `b`.
 */
function gcdBigInt(a, b) {
	let x = a < 0n ? -a : a;
	let y = b < 0n ? -b : b;
	while (y !== 0n) {
		const t = x % y;
		x = y;
		y = t;
	}
	return x;
}

/**
 * Validates and normalizes an exact rational `{ num: bigint, den: bigint }` into lowest terms
 * with a strictly positive denominator (`den > 0n`, `gcd(|num|, den) === 1n`).
 *
 * @param {unknown} value - Candidate rational entry.
 * @param {number} rowIndex - Row index for error reporting.
 * @param {number} colIndex - Column index for error reporting.
 * @returns {{ num: bigint, den: bigint }} Normalized rational in lowest terms.
 */
function normalizeRational(value, rowIndex, colIndex) {
	if (value === null || typeof value !== 'object') {
		throw new TypeError(
			`Invalid rational at [${rowIndex}][${colIndex}]: expected an object { num: bigint, den: bigint }.`,
		);
	}
	const { num, den } = value;
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(
			`Invalid rational at [${rowIndex}][${colIndex}]: num and den must both be BigInt.`,
		);
	}
	if (den === 0n) {
		throw new RangeError(
			`Invalid rational at [${rowIndex}][${colIndex}]: denominator must be non-zero.`,
		);
	}
	if (num === 0n) {
		return { num: 0n, den: 1n };
	}

	const signAdjustedNum = den < 0n ? -num : num;
	const signAdjustedDen = den < 0n ? -den : den;
	const divisor = gcdBigInt(signAdjustedNum, signAdjustedDen);

	return {
		num: signAdjustedNum / divisor,
		den: signAdjustedDen / divisor,
	};
}

/**
 * Computes the exact matrix transpose over the field of rational numbers `Q`,
 * represented as `{ num: bigint, den: bigint }` pairs in lowest terms.
 *
 * Uses the closed-form transpose identity (equivalently the canonical basis outer-product
 * series `A^T = sum_{i=0}^{m-1} sum_{j=0}^{n-1} A_{i,j} e_j e_i^T`):
 * `(A^T)_{j,i} = normalize(A_{i,j})` for `0 <= j < n`, `0 <= i < m`.
 *
 * Each output entry is guaranteed to satisfy `den > 0n` and `gcd(|num|, den) === 1n`
 * (with zero represented canonically as `{ num: 0n, den: 1n }`).
 *
 * @param {Array<Array<{ num: bigint, den: bigint }>>} matrix - Non-empty rectangular `m x n` rational matrix.
 * @returns {Array<Array<{ num: bigint, den: bigint }>>} The `n x m` transposed rational matrix with normalized entries.
 * @throws {TypeError} If `matrix` is not a 2D array or any entry is not `{ num: bigint, den: bigint }`.
 * @throws {RangeError} If `matrix` is empty, has empty rows, is non-rectangular, or contains a zero denominator.
 */
export function transposeRationalSeries(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('matrix must be a 2D array of rational objects.');
	}
	const rows = matrix.length;
	if (rows === 0) {
		throw new RangeError('matrix must be non-empty.');
	}

	if (!Array.isArray(matrix[0])) {
		throw new TypeError('matrix row 0 must be an array.');
	}
	const cols = matrix[0].length;
	if (cols === 0) {
		throw new RangeError('matrix rows must be non-empty.');
	}

	// Validate rectangular shape and normalize all entries before building output.
	const normalized = new Array(rows);
	for (let i = 0; i < rows; i++) {
		const row = matrix[i];
		if (!Array.isArray(row)) {
			throw new TypeError(`matrix row ${i} must be an array.`);
		}
		if (row.length !== cols) {
			throw new RangeError(
				`matrix must be rectangular: row ${i} has length ${row.length}, expected ${cols}.`,
			);
		}
		const normRow = new Array(cols);
		for (let j = 0; j < cols; j++) {
			normRow[j] = normalizeRational(row[j], i, j);
		}
		normalized[i] = normRow;
	}

	// Closed-form transpose: result[j][i] = normalized[i][j].
	const result = new Array(cols);
	for (let j = 0; j < cols; j++) {
		const outRow = new Array(rows);
		for (let i = 0; i < rows; i++) {
			const entry = normalized[i][j];
			outRow[i] = { num: entry.num, den: entry.den };
		}
		result[j] = outRow;
	}

	return result;
}
