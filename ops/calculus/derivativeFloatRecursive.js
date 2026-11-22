/**
 * Computes the numerical first derivative f'(x) of a scalar function over
 * IEEE-754 float64 numbers using recursive step-halving central differences
 * combined with recursive Richardson (Neville/Ridders) extrapolation.
 *
 * At each recursion depth k with step size h_k = h_0 / 2^k, the central
 * difference D(h_k) = (f(x + h_k) - f(x - h_k)) / ((x + h_k) - (x - h_k))
 * is refined against the previous Richardson tableau row via:
 *   R(k, j) = R(k, j - 1) + (R(k, j - 1) - R(k - 1, j - 1)) / (4^j - 1)
 * cancelling O(h^(2j)) truncation error terms while monitoring float64
 * roundoff growth to return the most accurate estimate.
 *
 * @param {(x: number) => number} f - Scalar function to differentiate.
 * @param {number} x - Finite IEEE-754 float64 evaluation point.
 * @param {object} [options] - Optional configuration.
 * @param {number} [options.step] - Positive finite initial step size h_0.
 * @param {number} [options.tolerance=1e-10] - Positive finite convergence tolerance (combined absolute/relative).
 * @param {number} [options.maxDepth=12] - Maximum recursion depth (integer in [1, 50]).
 * @returns {number} Approximate derivative f'(x) as a finite float64 Number.
 * @throws {TypeError} If f is not a function, x/options have invalid types, or f returns a non-number.
 * @throws {RangeError} If x is non-finite, options are out of valid range, step overflows/underflows at x, or f produces non-finite values.
 */
export function derivativeFloatRecursive(f, x, options = {}) {
	if (typeof f !== 'function') {
		throw new TypeError('Expected f to be a function');
	}
	if (typeof x !== 'number') {
		throw new TypeError('Expected x to be a number');
	}
	if (!Number.isFinite(x)) {
		throw new RangeError('Expected x to be a finite number');
	}
	if (typeof options !== 'object' || options === null || Array.isArray(options)) {
		throw new TypeError('Expected options to be a plain object');
	}

	const {
		step,
		tolerance = 1e-10,
		maxDepth = 12,
	} = options;

	if (step !== undefined) {
		if (typeof step !== 'number') {
			throw new TypeError('Expected options.step to be a number');
		}
		if (!Number.isFinite(step) || step <= 0) {
			throw new RangeError('Expected options.step to be a positive finite number');
		}
	}

	if (typeof tolerance !== 'number') {
		throw new TypeError('Expected options.tolerance to be a number');
	}
	if (!Number.isFinite(tolerance) || tolerance <= 0) {
		throw new RangeError('Expected options.tolerance to be a positive finite number');
	}

	if (typeof maxDepth !== 'number') {
		throw new TypeError('Expected options.maxDepth to be a number');
	}
	if (!Number.isInteger(maxDepth) || maxDepth < 1 || maxDepth > 50) {
		throw new RangeError('Expected options.maxDepth to be an integer between 1 and 50');
	}

	const initialStep = step ?? defaultInitialStep(x);
	const baseEstimate = centralDifference(f, x, initialStep);

	/**
	 * Recursively builds the next Richardson extrapolation row from the
	 * previous row and tracks the tightest error estimate within this row.
	 *
	 * @param {number[]} prevRow
	 * @param {number} currVal
	 * @param {number} col
	 * @param {number} factor4 - Equal to 4^col.
	 * @param {number[]} row
	 * @param {number} bestVal
	 * @param {number} bestErr
	 * @returns {{ row: number[], bestVal: number, bestErr: number }}
	 */
	function extrapolateRow(prevRow, currVal, col, factor4, row, bestVal, bestErr) {
		if (col > prevRow.length) {
			return { row, bestVal, bestErr };
		}

		const prevDiag = prevRow[col - 1];
		const extrapolated = currVal + (currVal - prevDiag) / (factor4 - 1);
		if (!Number.isFinite(extrapolated)) {
			return { row, bestVal, bestErr };
		}

		row.push(extrapolated);

		const err = Math.max(
			Math.abs(extrapolated - currVal),
			Math.abs(extrapolated - prevDiag),
		);

		const nextBestVal = err <= bestErr ? extrapolated : bestVal;
		const nextBestErr = err <= bestErr ? err : bestErr;

		return extrapolateRow(
			prevRow,
			extrapolated,
			col + 1,
			factor4 * 4,
			row,
			nextBestVal,
			nextBestErr,
		);
	}

	/**
	 * Recursively halves the differentiation step and refines the Richardson
	 * tableau until convergence, roundoff degradation, step underflow, or maxDepth.
	 *
	 * @param {number} depth
	 * @param {number} h
	 * @param {number[]} prevRow
	 * @param {number} bestVal
	 * @param {number} bestErr
	 * @returns {number}
	 */
	function refine(depth, h, prevRow, bestVal, bestErr) {
		if (depth > maxDepth) {
			return bestVal;
		}

		const nextH = h * 0.5;
		if (nextH === 0 || x + nextH === x - nextH) {
			return bestVal;
		}

		const d0 = centralDifference(f, x, nextH);
		const {
			row,
			bestVal: updatedVal,
			bestErr: updatedErr,
		} = extrapolateRow(prevRow, d0, 1, 4, [d0], bestVal, bestErr);

		const threshold = tolerance * Math.max(1, Math.abs(updatedVal));
		if (updatedErr <= threshold) {
			return updatedVal;
		}

		// Guard against float64 roundoff amplification at very small steps.
		const diagDiff = Math.abs(row[row.length - 1] - prevRow[prevRow.length - 1]);
		if (depth >= 2 && diagDiff >= 2 * updatedErr) {
			return updatedVal;
		}

		return refine(depth + 1, nextH, row, updatedVal, updatedErr);
	}

	const result = refine(1, initialStep, [baseEstimate], baseEstimate, Infinity);
	return result === 0 ? 0 : result;
}

/**
 * Selects a scale-aware initial step size h_0 that stays small enough for
 * oscillatory functions and domains near zero while remaining well above
 * the float64 ULP at large |x|.
 *
 * @param {number} x
 * @returns {number}
 */
function defaultInitialStep(x) {
	if (x === 0) {
		return 1e-3;
	}
	const ax = Math.abs(x);
	const small = Math.min(1e-3, ax * 1e-2);
	const ulpSafe = ax * 1e-8;
	return Math.max(small, ulpSafe, Number.MIN_VALUE * 16);
}

/**
 * Evaluates the symmetric central difference quotient (f(x + h) - f(x - h)) / span
 * using the exact float64 span (x + h) - (x - h) to reduce step rounding error.
 *
 * @param {(x: number) => number} f
 * @param {number} x
 * @param {number} h
 * @returns {number}
 */
function centralDifference(f, x, h) {
	const xPlus = x + h;
	const xMinus = x - h;

	if (!Number.isFinite(xPlus) || !Number.isFinite(xMinus)) {
		throw new RangeError('Step size overflows float64 range around x');
	}

	const span = xPlus - xMinus;
	if (span === 0 || !Number.isFinite(span)) {
		throw new RangeError('Step size is too small to resolve distinct float64 points around x');
	}

	const fPlus = f(xPlus);
	if (typeof fPlus !== 'number') {
		throw new TypeError('Expected f(x) to return a number');
	}
	if (!Number.isFinite(fPlus)) {
		throw new RangeError('Expected f(x) to return a finite number');
	}

	const fMinus = f(xMinus);
	if (typeof fMinus !== 'number') {
		throw new TypeError('Expected f(x) to return a number');
	}
	if (!Number.isFinite(fMinus)) {
		throw new RangeError('Expected f(x) to return a finite number');
	}

	const quotient = (fPlus - fMinus) / span;
	if (!Number.isFinite(quotient)) {
		throw new RangeError('Derivative calculation overflowed float64 range');
	}

	return quotient;
}
