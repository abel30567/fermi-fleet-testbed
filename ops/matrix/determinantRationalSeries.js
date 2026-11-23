/**
 * Compute the exact determinant of a square matrix of rational numbers.
 *
 * Each entry is represented as `{ num: BigInt, den: BigInt }` with `den !== 0n`.
 * Inputs need not be in lowest terms or have positive denominators; all entries
 * are validated and normalized before computation.
 *
 * Algorithm:
 * 1. Validate the matrix structure and normalize every rational entry.
 * 2. Clear denominators row-by-row using exact row LCMs to obtain an integer
 *    (`BigInt`) matrix `M` and a positive scaling denominator `totalDen` such
 *    that `det(matrix) = det(M) / totalDen`.
 * 3. Evaluate `det(M)` using closed-form formulas for `1x1` and `2x2`, and
 *    Bareiss fraction-free elimination (Sylvester's determinant identity) with
 *    row pivoting for `n >= 3`, guaranteeing exact division at every step.
 * 4. Reduce `det(M) / totalDen` to lowest terms with `den > 0n`.
 *
 * @typedef {{ num: bigint, den: bigint }} Rational
 *
 * @param {Rational[][]} matrix - Non-empty square 2D array of rationals.
 * @returns {Rational} Exact determinant normalized with `den > 0n` and `gcd(|num|, den) === 1n`.
 * @throws {TypeError} If `matrix` is not a 2D array of `{ num: bigint, den: bigint }` objects.
 * @throws {RangeError} If `matrix` is empty, non-square, or contains a zero denominator.
 */
export function determinantRationalSeries(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('matrix must be a 2D array of rationals');
	}
	const n = matrix.length;
	if (n === 0) {
		throw new RangeError('matrix must be non-empty');
	}

	/** @type {Rational[][]} */
	const normalized = new Array(n);
	for (let i = 0; i < n; i++) {
		const row = matrix[i];
		if (!Array.isArray(row)) {
			throw new TypeError(`matrix row ${i} must be an array`);
		}
		if (row.length !== n) {
			throw new RangeError(
				`matrix must be square: expected row ${i} to have length ${n}, got ${row.length}`
			);
		}
		const normRow = new Array(n);
		for (let j = 0; j < n; j++) {
			normRow[j] = parseAndNormalizeRational(row[j], i, j);
		}
		normalized[i] = normRow;
	}

	if (n === 1) {
		return normalized[0][0];
	}

	// Clear denominators per row: det(M) = totalDen * det(matrix)
	/** @type {bigint[][]} */
	const M = new Array(n);
	let totalDen = 1n;

	for (let i = 0; i < n; i++) {
		let rowLcm = 1n;
		for (let j = 0; j < n; j++) {
			rowLcm = lcmBigInt(rowLcm, normalized[i][j].den);
		}
		const intRow = new Array(n);
		for (let j = 0; j < n; j++) {
			const entry = normalized[i][j];
			intRow[j] = entry.num * (rowLcm / entry.den);
		}
		M[i] = intRow;
		totalDen *= rowLcm;
	}

	if (n === 2) {
		const detInt = M[0][0] * M[1][1] - M[0][1] * M[1][0];
		return normalizeRational(detInt, totalDen);
	}

	// Bareiss fraction-free elimination (Sylvester's determinant identity) with row pivoting
	let sign = 1n;
	let prevPivot = 1n;

	for (let k = 0; k < n - 1; k++) {
		let pivotRow = k;
		while (pivotRow < n && M[pivotRow][k] === 0n) {
			pivotRow++;
		}
		if (pivotRow === n) {
			return { num: 0n, den: 1n };
		}
		if (pivotRow !== k) {
			const tmp = M[k];
			M[k] = M[pivotRow];
			M[pivotRow] = tmp;
			sign = -sign;
		}

		const pivot = M[k][k];
		for (let i = k + 1; i < n; i++) {
			const factor = M[i][k];
			for (let j = k + 1; j < n; j++) {
				M[i][j] = (pivot * M[i][j] - factor * M[k][j]) / prevPivot;
			}
			M[i][k] = 0n;
		}
		prevPivot = pivot;
	}

	const detInt = sign * M[n - 1][n - 1];
	return normalizeRational(detInt, totalDen);
}

/**
 * Validate a single rational entry and return its reduced canonical form.
 *
 * @param {unknown} entry
 * @param {number} row
 * @param {number} col
 * @returns {Rational}
 */
function parseAndNormalizeRational(entry, row, col) {
	if (entry === null || typeof entry !== 'object') {
		throw new TypeError(`matrix[${row}][${col}] must be an object with bigint num and den`);
	}
	const { num, den } = /** @type {{ num: unknown, den: unknown }} */ (entry);
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`matrix[${row}][${col}] must have bigint num and den properties`);
	}
	if (den === 0n) {
		throw new RangeError(`matrix[${row}][${col}] denominator must be non-zero`);
	}
	return normalizeRational(num, den);
}

/**
 * Reduce a rational number num / den to lowest terms with den > 0n.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {Rational}
 */
function normalizeRational(num, den) {
	if (den === 0n) {
		throw new RangeError('Rational denominator must be non-zero');
	}
	if (num === 0n) {
		return { num: 0n, den: 1n };
	}
	let n = num;
	let d = den;
	if (d < 0n) {
		n = -n;
		d = -d;
	}
	const g = gcdBigInt(n, d);
	return { num: n / g, den: d / g };
}

/**
 * Compute |x| for BigInt.
 *
 * @param {bigint} x
 * @returns {bigint}
 */
function absBigInt(x) {
	return x < 0n ? -x : x;
}

/**
 * Compute gcd(|a|, |b|) via Euclidean algorithm.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcdBigInt(a, b) {
	let x = absBigInt(a);
	let y = absBigInt(b);
	while (y !== 0n) {
		const r = x % y;
		x = y;
		y = r;
	}
	return x;
}

/**
 * Compute lcm(|a|, |b|) for positive BigInts.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function lcmBigInt(a, b) {
	if (a === 0n || b === 0n) {
		return 0n;
	}
	return (absBigInt(a) / gcdBigInt(a, b)) * absBigInt(b);
}
