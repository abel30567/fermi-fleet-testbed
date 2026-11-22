/**
 * Validate a 2D matrix shape tuple `[rows, cols]` against an expected flat length.
 *
 * @param {unknown} shape - Candidate `[rows, cols]` shape tuple.
 * @param {number} expectedLength - Expected number of elements (`rows * cols`).
 * @param {string} name - Parameter name for error messages.
 * @returns {[number, number]} Validated `[rows, cols]` tuple.
 */
function validateShape(shape, expectedLength, name) {
	if (!Array.isArray(shape) || shape.length !== 2) {
		throw new TypeError(`${name} must be a 2-element array [rows, cols]`)
	}

	const [rows, cols] = shape
	if (!Number.isSafeInteger(rows) || rows < 0) {
		throw new RangeError(`${name}[0] (rows) must be a non-negative safe integer`)
	}
	if (!Number.isSafeInteger(cols) || cols < 0) {
		throw new RangeError(`${name}[1] (cols) must be a non-negative safe integer`)
	}
	if (rows * cols !== expectedLength) {
		throw new RangeError(
			`${name} dimensions [${rows}, ${cols}] require ${rows * cols} elements, but got Float64Array of length ${expectedLength}`
		)
	}

	return [rows, cols]
}

/**
 * Validate that an operand is a Float64Array containing only finite numbers.
 *
 * @param {unknown} arr - Candidate operand.
 * @param {string} name - Parameter name for error messages.
 */
function validateFloat64Array(arr, name) {
	if (!(arr instanceof Float64Array)) {
		throw new TypeError(`${name} must be a Float64Array`)
	}

	for (let i = 0; i < arr.length; i++) {
		if (!Number.isFinite(arr[i])) {
			throw new RangeError(`${name}[${i}] must be a finite number, got ${arr[i]}`)
		}
	}
}

/**
 * Compute the iterative outer / Kronecker tensor product of two `Float64Array` inputs.
 *
 * By default (when `options` is omitted or neither `shapeA` nor `shapeB` is provided),
 * computes the 1D outer product as a flattened row-major `Float64Array` of length
 * `a.length * b.length` where:
 *
 *     out[i * b.length + j] = a[i] * b[j]
 *
 * When `options.shapeA` and `options.shapeB` are provided as `[rows, cols]` tuples,
 * treats `a` and `b` as row-major 2D matrices of shapes `[m, n]` and `[p, q]` and
 * computes their Kronecker product `A ⊗ B` as a row-major `Float64Array` of shape
 * `[m * p, n * q]` where:
 *
 *     out[(i * p + k) * (n * q) + (j * q + l)] = a[i * n + j] * b[k * q + l]
 *
 * @param {Float64Array} a - First input tensor (all elements must be finite).
 * @param {Float64Array} b - Second input tensor (all elements must be finite).
 * @param {{ shapeA?: [number, number], shapeB?: [number, number] }} [options] - Optional matrix shapes for 2D Kronecker product.
 * @returns {Float64Array} Flattened row-major tensor product of length `a.length * b.length`.
 * @throws {TypeError} If `a` or `b` is not a `Float64Array`, or if `options`/shapes have invalid types.
 * @throws {RangeError} If any element is non-finite (`NaN`, `Infinity`, `-Infinity`), shapes do not match array lengths, or output size exceeds safe integer limits.
 */
export function tensorProductTypedIterative(a, b, options) {
	validateFloat64Array(a, 'a')
	validateFloat64Array(b, 'b')

	let shapeA
	let shapeB

	if (options !== undefined) {
		if (typeof options !== 'object' || options === null || Array.isArray(options)) {
			throw new TypeError('options must be a plain object when provided')
		}

		const hasShapeA = options.shapeA !== undefined
		const hasShapeB = options.shapeB !== undefined

		if (hasShapeA !== hasShapeB) {
			throw new TypeError('options.shapeA and options.shapeB must either both be provided or both be omitted')
		}

		if (hasShapeA && hasShapeB) {
			shapeA = validateShape(options.shapeA, a.length, 'options.shapeA')
			shapeB = validateShape(options.shapeB, b.length, 'options.shapeB')
		}
	}

	const aLen = a.length
	const bLen = b.length
	const outLen = aLen * bLen

	if (!Number.isSafeInteger(outLen)) {
		throw new RangeError(`Output length ${aLen} * ${bLen} exceeds Number.MAX_SAFE_INTEGER`)
	}

	const out = new Float64Array(outLen)
	if (outLen === 0) {
		return out
	}

	if (shapeA && shapeB) {
		const [m, n] = shapeA
		const [p, q] = shapeB
		const outCols = n * q

		for (let i = 0; i < m; i++) {
			const aRowOffset = i * n
			const outBlockRow = i * p
			for (let k = 0; k < p; k++) {
				const bRowOffset = k * q
				const outRowOffset = (outBlockRow + k) * outCols
				for (let j = 0; j < n; j++) {
					const aij = a[aRowOffset + j]
					const outColOffset = outRowOffset + j * q
					for (let l = 0; l < q; l++) {
						out[outColOffset + l] = aij * b[bRowOffset + l]
					}
				}
			}
		}

		return out
	}

	for (let i = 0; i < aLen; i++) {
		const ai = a[i]
		const rowOffset = i * bLen
		for (let j = 0; j < bLen; j++) {
			out[rowOffset + j] = ai * b[j]
		}
	}

	return out
}
