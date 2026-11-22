/**
 * Compute the numerical gradient of a 1D or N-D scalar field stored in a
 * row-major (C-order) `Float64Array` using straightforward iterative loops.
 *
 * Uses second-order central finite differences at interior points and
 * one-sided finite differences at boundaries (first-order by default, or
 * second-order when `edgeOrder === 2`). Supports both uniform grid spacing and
 * strictly increasing non-uniform coordinate arrays per axis.
 *
 * Formulas along an axis with coordinates `x_0 < x_1 < ... < x_{L-1}`:
 * - Uniform spacing `h`:
 *   - Interior (`1 <= k <= L - 2`): `(f[k + 1] - f[k - 1]) / (2 * h)`
 *   - `edgeOrder === 1`:
 *     - `k = 0`: `(f[1] - f[0]) / h`
 *     - `k = L - 1`: `(f[L - 1] - f[L - 2]) / h`
 *   - `edgeOrder === 2` (requires `L >= 3`):
 *     - `k = 0`: `(-3 * f[0] + 4 * f[1] - f[2]) / (2 * h)`
 *     - `k = L - 1`: `(3 * f[L - 1] - 4 * f[L - 2] + f[L - 3]) / (2 * h)`
 * - Non-uniform coordinates `x`:
 *   - Interior (`h_s = x[k] - x[k - 1]`, `h_d = x[k + 1] - x[k]`):
 *     `(h_s / (h_d * (h_s + h_d))) * (f[k + 1] - f[k]) + (h_d / (h_s * (h_s + h_d))) * (f[k] - f[k - 1])`
 *   - `edgeOrder === 1`:
 *     - `k = 0`: `(f[1] - f[0]) / (x[1] - x[0])`
 *     - `k = L - 1`: `(f[L - 1] - f[L - 2]) / (x[L - 1] - x[L - 2])`
 *   - `edgeOrder === 2` (requires `L >= 3`):
 *     - `k = 0` (`h_1 = x[1] - x[0]`, `h_2 = x[2] - x[1]`):
 *       `((2 * h_1 + h_2) / (h_1 * (h_1 + h_2))) * (f[1] - f[0]) - (h_1 / (h_2 * (h_1 + h_2))) * (f[2] - f[1])`
 *     - `k = L - 1` (`h_1 = x[L - 1] - x[L - 2]`, `h_2 = x[L - 2] - x[L - 3]`):
 *       `((2 * h_1 + h_2) / (h_1 * (h_1 + h_2))) * (f[L - 1] - f[L - 2]) - (h_1 / (h_2 * (h_1 + h_2))) * (f[L - 2] - f[L - 3])`
 *
 * Edge behavior:
 * - If `values.length === 0`, returns an empty `Float64Array(0)` for 1D or an
 *   array of `shape.length` empty `Float64Array(0)` instances for N-D.
 * - If an axis has length 1 (and `edgeOrder === 1`), the partial derivative
 *   along that singleton axis is filled with zeros.
 *
 * @param {Float64Array} values - Flattened row-major scalar field values (all finite).
 * @param {number[]} [shape] - Grid dimensions `[n_0, ..., n_{D-1}]`. Defaults to `[values.length]`.
 * @param {number | Float64Array | Array<number | Float64Array>} [spacing=1] - Grid spacing:
 *   - `number`: uniform positive finite step applied to every axis.
 *   - `Float64Array`: in 1D, strictly increasing finite coordinates of length `shape[0]`;
 *     in N-D (`shape.length > 1`), per-axis uniform positive finite steps of length `shape.length`.
 *   - `Array<number | Float64Array>`: per-axis entries of length `shape.length`, each either a
 *     positive finite uniform step or a strictly increasing finite coordinate `Float64Array`
 *     matching that axis length.
 * @param {1 | 2} [edgeOrder=1] - Accuracy order of one-sided boundary differences (`1` or `2`).
 * @returns {Float64Array | Float64Array[]} A `Float64Array` for 1D fields, or an array of
 *   `shape.length` `Float64Array`s (one partial derivative per axis) for N-D fields.
 * @throws {TypeError} If `values` is not a `Float64Array`, or `shape`, `spacing`, or `edgeOrder`
 *   have invalid types.
 * @throws {RangeError} If `values` contains non-finite numbers, `shape` is empty/invalid or does
 *   not match `values.length`, `spacing` has non-positive/non-finite/non-increasing entries or
 *   mismatched lengths, or `edgeOrder` is not `1` or `2` (or `edgeOrder === 2` on an axis with
 *   fewer than 3 elements).
 */
export function gradientTypedIterative(values, shape, spacing = 1, edgeOrder = 1) {
	if (!(values instanceof Float64Array)) {
		throw new TypeError('values must be a Float64Array');
	}

	const totalLen = values.length;
	for (let i = 0; i < totalLen; i++) {
		if (!Number.isFinite(values[i])) {
			throw new RangeError(`values[${i}] must be a finite number`);
		}
	}

	let dims;
	if (shape === undefined) {
		dims = [totalLen];
	} else {
		if (!Array.isArray(shape)) {
			throw new TypeError('shape must be an array of non-negative safe integers');
		}
		if (shape.length === 0) {
			throw new RangeError('shape must be non-empty');
		}
		dims = new Array(shape.length);
		let expectedLen = 1;
		for (let d = 0; d < shape.length; d++) {
			const size = shape[d];
			if (typeof size !== 'number') {
				throw new TypeError(`shape[${d}] must be a number`);
			}
			if (!Number.isSafeInteger(size) || size < 0) {
				throw new RangeError(`shape[${d}] must be a non-negative safe integer`);
			}
			dims[d] = size;
			expectedLen *= size;
		}
		if (expectedLen !== totalLen) {
			throw new RangeError(
				`shape product (${expectedLen}) does not match values.length (${totalLen})`,
			);
		}
	}

	const ndim = dims.length;

	if (typeof edgeOrder !== 'number') {
		throw new TypeError('edgeOrder must be a number (1 or 2)');
	}
	if (edgeOrder !== 1 && edgeOrder !== 2) {
		throw new RangeError('edgeOrder must be 1 or 2');
	}

	// Normalize spacing into per-axis uniform steps (number) or coordinate arrays (Float64Array).
	const axisSpacings = new Array(ndim);
	if (typeof spacing === 'number') {
		if (!Number.isFinite(spacing) || spacing <= 0) {
			throw new RangeError('spacing must be a positive finite number');
		}
		for (let d = 0; d < ndim; d++) {
			axisSpacings[d] = spacing;
		}
	} else if (spacing instanceof Float64Array) {
		if (ndim === 1) {
			validateCoords(spacing, dims[0], 'spacing');
			axisSpacings[0] = spacing;
		} else {
			if (spacing.length !== ndim) {
				throw new RangeError(
					`spacing Float64Array length (${spacing.length}) must match number of dimensions (${ndim})`,
				);
			}
			for (let d = 0; d < ndim; d++) {
				const h = spacing[d];
				if (!Number.isFinite(h) || h <= 0) {
					throw new RangeError(`spacing[${d}] must be a positive finite number`);
				}
				axisSpacings[d] = h;
			}
		}
	} else if (Array.isArray(spacing)) {
		if (spacing.length !== ndim) {
			throw new RangeError(
				`spacing array length (${spacing.length}) must match number of dimensions (${ndim})`,
			);
		}
		for (let d = 0; d < ndim; d++) {
			const entry = spacing[d];
			if (typeof entry === 'number') {
				if (!Number.isFinite(entry) || entry <= 0) {
					throw new RangeError(`spacing[${d}] must be a positive finite number`);
				}
				axisSpacings[d] = entry;
			} else if (entry instanceof Float64Array) {
				validateCoords(entry, dims[d], `spacing[${d}]`);
				axisSpacings[d] = entry;
			} else {
				throw new TypeError(`spacing[${d}] must be a number or Float64Array`);
			}
		}
	} else {
		throw new TypeError('spacing must be a number, Float64Array, or array of per-axis spacings');
	}

	if (totalLen === 0) {
		if (ndim === 1) {
			return new Float64Array(0);
		}
		const emptyResults = new Array(ndim);
		for (let d = 0; d < ndim; d++) {
			emptyResults[d] = new Float64Array(0);
		}
		return emptyResults;
	}

	if (edgeOrder === 2) {
		for (let d = 0; d < ndim; d++) {
			if (dims[d] < 3) {
				throw new RangeError(
					`edgeOrder 2 requires at least 3 elements along axis ${d} (got ${dims[d]})`,
				);
			}
		}
	}

	// Precompute row-major strides iteratively.
	const strides = new Array(ndim);
	strides[ndim - 1] = 1;
	for (let d = ndim - 2; d >= 0; d--) {
		strides[d] = strides[d + 1] * dims[d + 1];
	}

	const partials = new Array(ndim);

	for (let axis = 0; axis < ndim; axis++) {
		const out = new Float64Array(totalLen);
		const axisLen = dims[axis];

		if (axisLen >= 2) {
			const axisStride = strides[axis];
			const blockSize = axisLen * axisStride;
			const outerSize = totalLen / blockSize;
			const innerSize = axisStride;
			const axisSpacing = axisSpacings[axis];

			if (typeof axisSpacing === 'number') {
				const invH = 1 / axisSpacing;
				const inv2H = 0.5 / axisSpacing;

				for (let outer = 0; outer < outerSize; outer++) {
					const outerOffset = outer * blockSize;
					for (let inner = 0; inner < innerSize; inner++) {
						const base = outerOffset + inner;
						const lastIdx = base + (axisLen - 1) * axisStride;

						// Left and right boundaries
						if (edgeOrder === 1) {
							out[base] = (values[base + axisStride] - values[base]) * invH;
							out[lastIdx] = (values[lastIdx] - values[lastIdx - axisStride]) * invH;
						} else {
							const f0 = values[base];
							const f1 = values[base + axisStride];
							const f2 = values[base + 2 * axisStride];
							out[base] = (3 * (f1 - f0) - (f2 - f1)) * inv2H;

							const fLast = values[lastIdx];
							const fPrev = values[lastIdx - axisStride];
							const fPrev2 = values[lastIdx - 2 * axisStride];
							out[lastIdx] = (3 * (fLast - fPrev) - (fPrev - fPrev2)) * inv2H;
						}

						// Interior central differences
						for (let k = 1; k < axisLen - 1; k++) {
							const idx = base + k * axisStride;
							out[idx] = (values[idx + axisStride] - values[idx - axisStride]) * inv2H;
						}
					}
				}
			} else {
				const coords = axisSpacing;
				const hLeft0 = coords[1] - coords[0];
				const hRightLast = coords[axisLen - 1] - coords[axisLen - 2];

				let leftW1 = 0;
				let leftW2 = 0;
				let rightW1 = 0;
				let rightW2 = 0;
				if (edgeOrder === 2) {
					const hLeft1 = coords[2] - coords[1];
					const hLeftSum = hLeft0 + hLeft1;
					leftW1 = (2 * hLeft0 + hLeft1) / (hLeft0 * hLeftSum);
					leftW2 = hLeft0 / (hLeft1 * hLeftSum);

					const hRightPrev = coords[axisLen - 2] - coords[axisLen - 3];
					const hRightSum = hRightLast + hRightPrev;
					rightW1 = (2 * hRightLast + hRightPrev) / (hRightLast * hRightSum);
					rightW2 = hRightLast / (hRightPrev * hRightSum);
				}

				for (let outer = 0; outer < outerSize; outer++) {
					const outerOffset = outer * blockSize;
					for (let inner = 0; inner < innerSize; inner++) {
						const base = outerOffset + inner;
						const lastIdx = base + (axisLen - 1) * axisStride;

						// Left and right boundaries
						if (edgeOrder === 1) {
							out[base] = (values[base + axisStride] - values[base]) / hLeft0;
							out[lastIdx] = (values[lastIdx] - values[lastIdx - axisStride]) / hRightLast;
						} else {
							const f0 = values[base];
							const f1 = values[base + axisStride];
							const f2 = values[base + 2 * axisStride];
							out[base] = leftW1 * (f1 - f0) - leftW2 * (f2 - f1);

							const fLast = values[lastIdx];
							const fPrev = values[lastIdx - axisStride];
							const fPrev2 = values[lastIdx - 2 * axisStride];
							out[lastIdx] = rightW1 * (fLast - fPrev) - rightW2 * (fPrev - fPrev2);
						}

						// Interior non-uniform second-order differences
						for (let k = 1; k < axisLen - 1; k++) {
							const idx = base + k * axisStride;
							const hs = coords[k] - coords[k - 1];
							const hd = coords[k + 1] - coords[k];
							const hSum = hs + hd;
							const fPrev = values[idx - axisStride];
							const fCurr = values[idx];
							const fNext = values[idx + axisStride];
							out[idx] =
								(hs / (hd * hSum)) * (fNext - fCurr) + (hd / (hs * hSum)) * (fCurr - fPrev);
						}
					}
				}
			}
		}

		partials[axis] = out;
	}

	return ndim === 1 ? partials[0] : partials;
}

/**
 * Validate a 1D coordinate array for an axis.
 *
 * @param {Float64Array} coords
 * @param {number} expectedLen
 * @param {string} label
 */
function validateCoords(coords, expectedLen, label) {
	if (coords.length !== expectedLen) {
		throw new RangeError(
			`${label} length (${coords.length}) must match axis length (${expectedLen})`,
		);
	}
	for (let i = 0; i < expectedLen; i++) {
		const c = coords[i];
		if (!Number.isFinite(c)) {
			throw new RangeError(`${label}[${i}] must be a finite number`);
		}
		if (i > 0 && c <= coords[i - 1]) {
			throw new RangeError(`${label} must be strictly increasing`);
		}
	}
}
