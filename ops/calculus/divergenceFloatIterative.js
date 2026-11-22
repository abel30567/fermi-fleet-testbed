/**
 * Computes the numerical divergence of a vector field `F: R^n -> R^n` at a
 * given `point` over IEEE-754 float64 numbers using an iterative central
 * finite-difference scheme.
 *
 * For a vector field `F(x_0, ..., x_{n-1}) = [F_0, ..., F_{n-1}]`, the
 * divergence is defined as:
 *
 *     div(F)(x) = sum_{i=0}^{n-1} (dF_i / dx_i)(x)
 *
 * Each partial derivative `dF_i / dx_i` is approximated iteratively over each
 * dimension `i` using the second-order central finite difference:
 *
 *     dF_i / dx_i ≈ (F_i(x + h * e_i) - F_i(x - h * e_i)) / (2 * h)
 *
 * The input `point` array is never mutated, and fresh coordinate copies are
 * passed to `F` on every evaluation so mutations inside `F` cannot corrupt
 * the calculation.
 *
 * Time complexity: O(n^2) coordinate copying and validation plus 2n evaluations
 * of `F`, where `n = point.length`.
 *
 * @param {(coords: number[]) => number[]} F - Vector field mapping an
 *   `n`-element array of finite numbers to an `n`-element array of finite
 *   numbers.
 * @param {readonly number[]} point - Non-empty `n`-element array of finite
 *   numbers specifying the evaluation point. Not mutated.
 * @param {number} [h=1e-6] - Positive finite step size for central finite
 *   differences.
 * @returns {number} Approximate divergence of `F` at `point`.
 * @throws {TypeError} If `F` is not a function, `point` is not an array of
 *   numbers, `h` is not a number, or `F` does not return an array of numbers.
 * @throws {RangeError} If `point` is empty or contains non-finite numbers,
 *   `h` is not positive and finite, or `F` returns an array whose length does
 *   not match `point.length` or that contains non-finite numbers.
 *
 * @example
 * // F(x, y, z) = [x^2, y^3, z * x] => div(F) = 2x + 3y^2 + x
 * const div = divergenceFloatIterative(
 *   ([x, y, z]) => [x ** 2, y ** 3, z * x],
 *   [1, 2, 3],
 * )
 * // => ~15
 */
export function divergenceFloatIterative(F, point, h = 1e-6) {
	if (typeof F !== 'function') {
		throw new TypeError('F must be a vector field function')
	}

	if (!Array.isArray(point)) {
		throw new TypeError('point must be a non-empty array of finite numbers')
	}

	const dim = point.length
	if (dim === 0) {
		throw new RangeError('point must be a non-empty array of finite numbers')
	}

	const baseCoords = new Array(dim)
	for (let i = 0; i < dim; i++) {
		const coord = point[i]
		if (typeof coord !== 'number') {
			throw new TypeError(`point[${i}] must be a finite number`)
		}
		if (!Number.isFinite(coord)) {
			throw new RangeError(`point[${i}] must be a finite number`)
		}
		baseCoords[i] = coord
	}

	if (typeof h !== 'number') {
		throw new TypeError('h must be a positive finite number')
	}
	if (!Number.isFinite(h) || h <= 0) {
		throw new RangeError('h must be a positive finite number')
	}

	const twoH = 2 * h
	let divergence = 0

	for (let i = 0; i < dim; i++) {
		const center = baseCoords[i]

		const plusCoords = baseCoords.slice()
		plusCoords[i] = center + h
		const fPlus = F(plusCoords)
		validateFieldOutput(fPlus, dim)

		const minusCoords = baseCoords.slice()
		minusCoords[i] = center - h
		const fMinus = F(minusCoords)
		validateFieldOutput(fMinus, dim)

		divergence += (fPlus[i] - fMinus[i]) / twoH
	}

	return divergence
}

/**
 * Validates that a vector field evaluation produced an array of finite numbers
 * matching the expected dimension.
 *
 * @param {unknown} output - Raw value returned by the vector field.
 * @param {number} expectedDim - Expected length matching `point.length`.
 * @throws {TypeError} If `output` is not an array or contains a non-number.
 * @throws {RangeError} If `output.length !== expectedDim` or contains a
 *   non-finite number.
 */
function validateFieldOutput(output, expectedDim) {
	if (!Array.isArray(output)) {
		throw new TypeError('F must return an array of finite numbers')
	}
	if (output.length !== expectedDim) {
		throw new RangeError(
			`F returned vector of dimension ${output.length}, expected ${expectedDim}`,
		)
	}
	for (let j = 0; j < expectedDim; j++) {
		const value = output[j]
		if (typeof value !== 'number') {
			throw new TypeError(`F output[${j}] must be a finite number`)
		}
		if (!Number.isFinite(value)) {
			throw new RangeError(`F output[${j}] must be a finite number`)
		}
	}
}
