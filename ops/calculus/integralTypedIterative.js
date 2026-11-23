/**
 * Computes the definite numerical integral of sampled function values stored in
 * a `Float64Array` using a straightforward iterative composite trapezoidal rule.
 *
 * For sample values `y[0..n-1]`:
 * - When `xOrStep` is a finite number `dx` (default `1`), each interval has
 *   uniform width `dx`: `sum_{i=0}^{n-2} 0.5 * (y[i] + y[i + 1]) * dx`.
 * - When `xOrStep` is a `Float64Array` of sample coordinates `x` (same length
 *   as `y`), each interval has width `x[i + 1] - x[i]`:
 *   `sum_{i=0}^{n-2} 0.5 * (y[i] + y[i + 1]) * (x[i + 1] - x[i])`.
 *
 * Returns `0` when fewer than 2 sample points are provided.
 *
 * @param {Float64Array} y - Sampled function values. All entries must be finite.
 * @param {number | Float64Array} [xOrStep=1] - Uniform grid spacing `dx` or a
 *   `Float64Array` of sample `x` coordinates with the same length as `y`.
 * @returns {number} Approximate definite integral over the sampled domain.
 * @throws {TypeError} If `y` is not a `Float64Array`, or `xOrStep` is neither a
 *   number nor a `Float64Array`.
 * @throws {RangeError} If `xOrStep` is a non-finite number, if `xOrStep` is a
 *   `Float64Array` whose length differs from `y.length`, or if any element of
 *   `y` (or `xOrStep`) is non-finite (`NaN` or `±Infinity`).
 */
export function integralTypedIterative(y, xOrStep = 1) {
	if (!(y instanceof Float64Array)) {
		throw new TypeError('Expected y to be a Float64Array')
	}

	const n = y.length
	const isArrayX = xOrStep instanceof Float64Array

	if (!isArrayX && typeof xOrStep !== 'number') {
		throw new TypeError('Expected xOrStep to be a number or a Float64Array')
	}

	if (isArrayX) {
		if (xOrStep.length !== n) {
			throw new RangeError(
				`Expected x and y to have the same length (got ${xOrStep.length} and ${n})`,
			)
		}
		for (let i = 0; i < n; i++) {
			if (!Number.isFinite(y[i])) {
				throw new RangeError(`Expected all elements of y to be finite (index ${i})`)
			}
			if (!Number.isFinite(xOrStep[i])) {
				throw new RangeError(`Expected all elements of x to be finite (index ${i})`)
			}
		}

		if (n < 2) {
			return 0
		}

		let sum = 0
		for (let i = 0; i < n - 1; i++) {
			sum += 0.5 * (y[i] + y[i + 1]) * (xOrStep[i + 1] - xOrStep[i])
		}
		return sum
	}

	if (!Number.isFinite(xOrStep)) {
		throw new RangeError('Expected step size dx to be a finite number')
	}

	for (let i = 0; i < n; i++) {
		if (!Number.isFinite(y[i])) {
			throw new RangeError(`Expected all elements of y to be finite (index ${i})`)
		}
	}

	if (n < 2) {
		return 0
	}

	let sum = 0
	for (let i = 0; i < n - 1; i++) {
		sum += 0.5 * (y[i] + y[i + 1]) * xOrStep
	}
	return sum
}
