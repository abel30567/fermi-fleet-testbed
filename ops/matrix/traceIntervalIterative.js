const f64View = new Float64Array(1);
const u64View = new BigUint64Array(f64View.buffer);

/**
 * Returns the greatest IEEE-754 binary64 floating-point number strictly less than `x`.
 *
 * @param {number} x
 * @returns {number}
 */
function nextDown(x) {
	if (Number.isNaN(x) || x === -Infinity) return x;
	if (x === 0) return -Number.MIN_VALUE;
	f64View[0] = x;
	u64View[0] = x > 0 ? u64View[0] - 1n : u64View[0] + 1n;
	return f64View[0] === 0 ? 0 : f64View[0];
}

/**
 * Returns the least IEEE-754 binary64 floating-point number strictly greater than `x`.
 *
 * @param {number} x
 * @returns {number}
 */
function nextUp(x) {
	if (Number.isNaN(x) || x === Infinity) return x;
	if (x === 0) return Number.MIN_VALUE;
	f64View[0] = x;
	u64View[0] = x > 0 ? u64View[0] + 1n : u64View[0] - 1n;
	return f64View[0] === 0 ? 0 : f64View[0];
}

/**
 * Computes `a + b` rounded toward -Infinity (IEEE-754 downward directed rounding)
 * using Dekker's error-free FastTwoSum transformation and `nextDown`.
 *
 * @param {number} a - Lower accumulator (may be `-Infinity` after prior negative overflow).
 * @param {number} b - Finite addend.
 * @returns {number} Largest binary64 float `<= a + b` in exact real arithmetic.
 */
function addDown(a, b) {
	if (!Number.isFinite(a)) return a;
	let x = a;
	let y = b;
	if (Math.abs(x) < Math.abs(y)) {
		x = b;
		y = a;
	}
	const s = x + y;
	if (s === Infinity) return Number.MAX_VALUE;
	if (s === -Infinity) return -Infinity;
	const err = y - (s - x);
	return err < 0 ? nextDown(s) : s;
}

/**
 * Computes `a + b` rounded toward +Infinity (IEEE-754 upward directed rounding)
 * using Dekker's error-free FastTwoSum transformation and `nextUp`.
 *
 * @param {number} a - Upper accumulator (may be `+Infinity` after prior positive overflow).
 * @param {number} b - Finite addend.
 * @returns {number} Smallest binary64 float `>= a + b` in exact real arithmetic.
 */
function addUp(a, b) {
	if (!Number.isFinite(a)) return a;
	let x = a;
	let y = b;
	if (Math.abs(x) < Math.abs(y)) {
		x = b;
		y = a;
	}
	const s = x + y;
	if (s === Infinity) return Infinity;
	if (s === -Infinity) return -Number.MAX_VALUE;
	const err = y - (s - x);
	return err > 0 ? nextUp(s) : s;
}

/**
 * Validates that `entry` is a valid closed finite interval `[lo, hi]` with `lo <= hi`.
 *
 * @param {unknown} entry
 * @param {number} row
 * @param {number} col
 */
function validateInterval(entry, row, col) {
	if (!Array.isArray(entry)) {
		throw new TypeError(`M[${row}][${col}] must be a [lo, hi] interval array`);
	}
	if (entry.length !== 2) {
		throw new RangeError(`M[${row}][${col}] must have length 2, got ${entry.length}`);
	}
	const [lo, hi] = entry;
	if (typeof lo !== 'number' || typeof hi !== 'number') {
		throw new TypeError(`M[${row}][${col}] interval endpoints must be numbers`);
	}
	if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
		throw new RangeError(`M[${row}][${col}] interval endpoints must be finite numbers`);
	}
	if (lo > hi) {
		throw new RangeError(`M[${row}][${col}] has invalid interval bounds: lo (${lo}) > hi (${hi})`);
	}
}

/**
 * Computes the trace of an n×n interval matrix `M` over closed real intervals `[lo, hi]`
 * using a straightforward iterative loop over the diagonal entries with IEEE-754 outward
 * rounding (`nextDown` / `nextUp`), guaranteeing rigorous enclosure of the exact real trace
 * for every real matrix `A ∈ M`.
 *
 * Because each diagonal entry occurs only once in `tr(M) = Σ M[i][i]`, the exact interval
 * range is `[Σ M[i][i][0], Σ M[i][i][1]]`. Outward rounding ensures `lo <= Σ M[i][i][0]`
 * and `hi >= Σ M[i][i][1]` in exact real arithmetic.
 *
 * @param {Array<Array<[number, number]>>} M - Non-empty square (n×n) matrix of valid finite `[lo, hi]` intervals (`lo <= hi`).
 * @returns {[number, number]} Outward-rounded interval `[lo, hi]` enclosing `tr(M)`.
 * @throws {TypeError} If `M`, any row, any entry, or any endpoint has an invalid type.
 * @throws {RangeError} If `M` is empty, non-square/ragged, or any entry is not a valid finite `[lo, hi]` interval with `lo <= hi`.
 */
export function traceIntervalIterative(M) {
	if (!Array.isArray(M)) {
		throw new TypeError('M must be a non-empty square 2D array of [lo, hi] intervals');
	}
	const n = M.length;
	if (n === 0) {
		throw new RangeError('M must be a non-empty square matrix');
	}

	for (let i = 0; i < n; i++) {
		const row = M[i];
		if (!Array.isArray(row)) {
			throw new TypeError(`Row ${i} of M must be an array`);
		}
		if (row.length !== n) {
			throw new RangeError(`M must be square (${n}×${n}), but row ${i} has length ${row.length}`);
		}
		for (let j = 0; j < n; j++) {
			validateInterval(row[j], i, j);
		}
	}

	let lo = M[0][0][0];
	let hi = M[0][0][1];

	for (let i = 1; i < n; i++) {
		lo = addDown(lo, M[i][i][0]);
		hi = addUp(hi, M[i][i][1]);
	}

	return [lo === 0 ? 0 : lo, hi === 0 ? 0 : hi];
}
