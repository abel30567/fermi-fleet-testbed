/**
 * Numerically computes the first derivative f'(x) of a scalar function over
 * IEEE-754 float64 numbers using recursive Richardson extrapolation (Ridders'
 * method with recursive step halving).
 *
 * At each recursion level, the step size h is halved and the new central
 * difference D(h) is recursively extrapolated against the previous level's
 * Richardson row:
 *
 *   D_k(h) = (4^k * D_{k-1}(h / 2) - D_{k-1}(h)) / (4^k - 1)
 *
 * Recursion terminates when the Ridders error estimate meets the requested
 * tolerance, when floating-point roundoff begins to dominate truncation error,
 * when the step size underflows the ULP at x, or when maxDepth is reached.
 *
 * @param {(x: number) => number} f - Scalar real-valued function to differentiate.
 * @param {number} x - Finite float64 point at which to evaluate the derivative.
 * @param {object} [options] - Optional configuration parameters.
 * @param {number} [options.h] - Initial positive finite step size. Defaults to
 *   a scale-aware step chosen from |x|.
 * @param {number} [options.maxDepth=12] - Maximum number of recursive step
 *   halvings (integer in [1, 30]).
 * @param {number} [options.tolerance=1e-12] - Target non-negative finite error
 *   tolerance (relative to |f'(x)| when non-zero, absolute when zero).
 * @returns {number} Approximated first derivative f'(x) as a float64 Number,
 *   or NaN if f cannot be finitely evaluated in any neighborhood of x.
 * @throws {TypeError} If arguments or function return values have invalid types.
 * @throws {RangeError} If numeric arguments are out of their valid domains.
 */
export function derivativeFloatRecursive(f, x, options = {}) {
	if (typeof f !== 'function') {
		throw new TypeError('f must be a function')
	}
	if (typeof x !== 'number') {
		throw new TypeError('x must be a number')
	}
	if (!Number.isFinite(x)) {
		throw new RangeError('x must be a finite number')
	}
	if (
		options === null ||
		typeof options !== 'object' ||
		Array.isArray(options)
	) {
		throw new TypeError('options must be a plain object')
	}

	const { h: rawH, maxDepth = 12, tolerance = 1e-12 } = options

	let initialStep
	if (rawH === undefined) {
		initialStep =
			x === 0
				? 1e-2
				: Math.max(Math.min(1e-2, Math.abs(x) * 1e-2), Math.abs(x) * 1e-7)
	} else {
		if (typeof rawH !== 'number') {
			throw new TypeError('options.h must be a number')
		}
		if (!Number.isFinite(rawH) || rawH <= 0) {
			throw new RangeError('options.h must be a positive finite number')
		}
		initialStep = rawH
	}

	if (typeof maxDepth !== 'number') {
		throw new TypeError('options.maxDepth must be a number')
	}
	if (!Number.isInteger(maxDepth) || maxDepth < 1 || maxDepth > 30) {
		throw new RangeError('options.maxDepth must be an integer between 1 and 30')
	}

	if (typeof tolerance !== 'number') {
		throw new TypeError('options.tolerance must be a number')
	}
	if (!Number.isFinite(tolerance) || tolerance < 0) {
		throw new RangeError(
			'options.tolerance must be a non-negative finite number'
		)
	}

	/**
	 * Evaluates the symmetric central difference quotient at step size h using
	 * the exact representable float64 span (x + h) - (x - h).
	 *
	 * @param {number} step
	 * @returns {number}
	 */
	function centralDifference(step) {
		const xPlus = x + step
		const xMinus = x - step
		const span = xPlus - xMinus
		if (span === 0 || !Number.isFinite(span)) {
			return Number.NaN
		}
		const yPlus = f(xPlus)
		const yMinus = f(xMinus)
		if (typeof yPlus !== 'number' || typeof yMinus !== 'number') {
			throw new TypeError('f(x) must return a number')
		}
		if (!Number.isFinite(yPlus) || !Number.isFinite(yMinus)) {
			return Number.NaN
		}
		return (yPlus - yMinus) / span
	}

	/**
	 * Recursively computes one Richardson extrapolation row from column index
	 * `col` through `prevRow.length`, returning the completed row and updated
	 * best estimate/error pair.
	 *
	 * @param {number} col - Current column index into prevRow.
	 * @param {number} currVal - Value at (currentRow, col).
	 * @param {number[]} prevRow - Richardson row from the previous step size.
	 * @param {number} factor - Extrapolation weight 4^(col + 1).
	 * @param {number} bestVal - Best derivative estimate found so far.
	 * @param {number} bestErr - Error estimate associated with bestVal.
	 * @returns {{ row: number[], bestVal: number, bestErr: number }}
	 */
	function extrapolateRow(col, currVal, prevRow, factor, bestVal, bestErr) {
		if (col >= prevRow.length) {
			return { row: [currVal], bestVal, bestErr }
		}

		const prevColVal = prevRow[col]
		const nextVal = (factor * currVal - prevColVal) / (factor - 1)
		const err = Math.max(
			Math.abs(nextVal - currVal),
			Math.abs(nextVal - prevColVal)
		)

		let nextBestVal = bestVal
		let nextBestErr = bestErr
		if (Number.isFinite(nextVal) && err <= bestErr) {
			nextBestVal = nextVal
			nextBestErr = err
		}

		const tail = extrapolateRow(
			col + 1,
			nextVal,
			prevRow,
			factor * 4,
			nextBestVal,
			nextBestErr
		)
		return {
			row: [currVal, ...tail.row],
			bestVal: tail.bestVal,
			bestErr: tail.bestErr
		}
	}

	/**
	 * Recursively halves the step size and refines the Richardson tableau until
	 * convergence, roundoff onset, underflow, or maxDepth.
	 *
	 * @param {number} depth - Current recursion depth (number of halvings so far).
	 * @param {number} step - Current step size h.
	 * @param {number[]} prevRow - Previous Richardson row (empty until first finite sample).
	 * @param {number} bestVal - Best estimate so far.
	 * @param {number} bestErr - Associated error estimate.
	 * @returns {number}
	 */
	function refine(depth, step, prevRow, bestVal, bestErr) {
		const d0 = centralDifference(step)

		if (!Number.isFinite(d0)) {
			// If we already have a valid estimate, stop before domain/underflow failure.
			if (prevRow.length > 0) {
				return bestVal
			}
			// Otherwise, shrink step size to try entering the valid domain of f.
			if (depth >= maxDepth) {
				return Number.NaN
			}
			return refine(depth + 1, step * 0.5, prevRow, bestVal, bestErr)
		}

		if (prevRow.length === 0) {
			if (depth >= maxDepth) {
				return d0
			}
			return refine(depth + 1, step * 0.5, [d0], d0, Number.POSITIVE_INFINITY)
		}

		const {
			row: currRow,
			bestVal: nextBestVal,
			bestErr: nextBestErr
		} = extrapolateRow(0, d0, prevRow, 4, bestVal, bestErr)

		const threshold =
			nextBestVal !== 0 ? tolerance * Math.abs(nextBestVal) : tolerance
		if (nextBestErr <= threshold) {
			return nextBestVal
		}

		const lastDiff = Math.abs(
			currRow[currRow.length - 1] - prevRow[prevRow.length - 1]
		)
		if (
			Number.isFinite(nextBestErr) &&
			(!Number.isFinite(lastDiff) || lastDiff >= 2 * nextBestErr)
		) {
			return nextBestVal
		}

		if (depth >= maxDepth) {
			return nextBestVal
		}

		return refine(depth + 1, step * 0.5, currRow, nextBestVal, nextBestErr)
	}

	return refine(0, initialStep, [], Number.NaN, Number.POSITIVE_INFINITY)
}
