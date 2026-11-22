/**
 * @typedef {{ re: number, im: number }} Complex
 */

/**
 * Normalizes `-0` to `0` while preserving all other numbers.
 *
 * @param {number} value
 * @returns {number}
 */
function normalizeZero(value) {
	return value === 0 ? 0 : value;
}

/**
 * Validates that a value is a finite complex number `{ re, im }`.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {Complex}
 * @throws {TypeError} If the value is not an object with numeric `re` and `im` properties.
 * @throws {RangeError} If `re` or `im` is not a finite number (NaN or ±Infinity).
 */
function validateComplex(value, label) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(`${label} must contain complex numbers as { re, im } objects`);
	}
	const { re, im } = /** @type {{ re: unknown, im: unknown }} */ (value);
	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError(`${label} complex entries must have numeric re and im properties`);
	}
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError(`${label} complex entries must have finite re and im values`);
	}
	return {
		re: normalizeZero(re),
		im: normalizeZero(im),
	};
}

/**
 * Iteratively validates a complex tensor (0D scalar or rectangular N-D nested array
 * of `{ re, im }` objects), returning its shape and row-major flat data array.
 *
 * @param {unknown} tensor
 * @param {string} name
 * @returns {{ shape: number[], flat: Complex[] }}
 * @throws {TypeError} If the tensor has invalid types, mixed nesting depths, or sparse slots.
 * @throws {RangeError} If the tensor is ragged or contains non-finite complex components.
 */
function flattenComplexTensorIterative(tensor, name) {
	if (tensor === null || tensor === undefined) {
		throw new TypeError(`${name} must be a complex number { re, im } or a nested array of them`);
	}

	/** @type {number[]} */
	const shape = [];
	/** @type {unknown[]} */
	let currentLevel = [tensor];

	while (true) {
		const first = currentLevel[0];

		if (Array.isArray(first)) {
			const dimSize = first.length;
			shape.push(dimSize);

			/** @type {unknown[]} */
			const nextLevel = dimSize === 0 ? [] : new Array(currentLevel.length * dimSize);
			let writeIdx = 0;

			for (let i = 0; i < currentLevel.length; i++) {
				const node = currentLevel[i];
				if (!Array.isArray(node)) {
					throw new TypeError(`${name} has mixed nesting depths (irregular tensor)`);
				}
				if (node.length !== dimSize) {
					throw new RangeError(
						`${name} is ragged: expected dimension length ${dimSize}, got ${node.length}`
					);
				}
				for (let j = 0; j < dimSize; j++) {
					if (!(j in node)) {
						throw new TypeError(`${name} must not contain sparse array holes`);
					}
					nextLevel[writeIdx++] = node[j];
				}
			}

			if (dimSize === 0) {
				return { shape, flat: [] };
			}
			currentLevel = nextLevel;
		} else {
			/** @type {Complex[]} */
			const flat = new Array(currentLevel.length);
			for (let i = 0; i < currentLevel.length; i++) {
				const item = currentLevel[i];
				if (Array.isArray(item)) {
					throw new TypeError(`${name} has mixed nesting depths (irregular tensor)`);
				}
				flat[i] = validateComplex(item, name);
			}
			return { shape, flat };
		}
	}
}

/**
 * Iteratively reshapes a flat row-major array of complex numbers into a nested array
 * matching `shape`. Supports 0D shapes (returns scalar) and shapes containing 0.
 *
 * @param {Complex[]} flat
 * @param {number[]} shape
 * @returns {Complex | unknown[]}
 */
function reshapeIterative(flat, shape) {
	if (shape.length === 0) {
		return flat[0];
	}

	const zeroIdx = shape.indexOf(0);
	if (zeroIdx === 0) {
		return [];
	}

	/** @type {unknown[]} */
	let current;
	let startAxis;

	if (zeroIdx > 0) {
		let leafCount = 1;
		for (let axis = 0; axis < zeroIdx; axis++) {
			leafCount *= shape[axis];
		}
		current = new Array(leafCount);
		for (let i = 0; i < leafCount; i++) {
			current[i] = [];
		}
		startAxis = zeroIdx - 1;
	} else {
		current = flat;
		startAxis = shape.length - 1;
	}

	for (let axis = startAxis; axis >= 1; axis--) {
		const size = shape[axis];
		const groupCount = current.length / size;
		const next = new Array(groupCount);
		for (let g = 0; g < groupCount; g++) {
			const chunk = new Array(size);
			const base = g * size;
			for (let k = 0; k < size; k++) {
				chunk[k] = current[base + k];
			}
			next[g] = chunk;
		}
		current = next;
	}

	return current;
}

/**
 * Computes the tensor product (multilinear outer product) `a ⊗ b` of two complex tensors
 * using a straightforward iterative implementation (no recursion).
 *
 * Each element is a complex number represented as `{ re: number, im: number }`.
 * Inputs may be 0D complex scalars, 1D vectors, 2D matrices, or arbitrary-rank rectangular
 * nested arrays of complex numbers. If `a` has shape `(d_1, ..., d_r)` and `b` has shape
 * `(e_1, ..., e_s)`, the result has shape `(d_1, ..., d_r, e_1, ..., e_s)` with entries:
 * `(a ⊗ b)[i_1]...[i_r][j_1]...[j_s] = a[i_1]...[i_r] * b[j_1]...[j_s]`.
 *
 * @param {Complex | unknown[]} a - First complex scalar or rectangular N-D complex tensor.
 * @param {Complex | unknown[]} b - Second complex scalar or rectangular N-D complex tensor.
 * @returns {Complex | unknown[]} The tensor product `a ⊗ b` of shape `[...shape(a), ...shape(b)]`.
 * @throws {TypeError} If either input is not a valid complex scalar/tensor, has mixed nesting depths,
 *   contains sparse array holes, or has entries without numeric `re`/`im` fields.
 * @throws {RangeError} If either input is ragged or contains non-finite (`NaN`/`Infinity`) components.
 */
export function tensorProductComplexIterative(a, b) {
	const parsedA = flattenComplexTensorIterative(a, 'a');
	const parsedB = flattenComplexTensorIterative(b, 'b');

	const outShape = [...parsedA.shape, ...parsedB.shape];
	const flatA = parsedA.flat;
	const flatB = parsedB.flat;
	const lenA = flatA.length;
	const lenB = flatB.length;

	/** @type {Complex[]} */
	const flatResult = new Array(lenA * lenB);
	let outIdx = 0;

	for (let i = 0; i < lenA; i++) {
		const aRe = flatA[i].re;
		const aIm = flatA[i].im;
		for (let j = 0; j < lenB; j++) {
			const bRe = flatB[j].re;
			const bIm = flatB[j].im;
			const re = aRe * bRe - aIm * bIm;
			const im = aRe * bIm + aIm * bRe;
			flatResult[outIdx++] = {
				re: normalizeZero(re),
				im: normalizeZero(im),
			};
		}
	}

	return reshapeIterative(flatResult, outShape);
}
