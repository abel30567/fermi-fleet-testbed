/**
 * @typedef {Object} DualNumber
 * @property {number} v - Primal value (finite real number).
 * @property {number} d - Forward-mode derivative / tangent component (finite real number).
 */

/**
 * Validates that an element is a well-formed dual number `{ v, d }` with finite numeric fields.
 *
 * @param {unknown} elem - Candidate dual number element.
 * @param {number} index - Element index in the input vector (for error reporting).
 * @throws {TypeError} If the element is not an object or its `v`/`d` properties are not numbers.
 * @throws {RangeError} If `v` or `d` is not finite (`NaN`, `Infinity`, `-Infinity`).
 */
function validateDual(elem, index) {
	if (elem === null || typeof elem !== 'object' || Array.isArray(elem)) {
		throw new TypeError(`Element at index ${index} must be a dual number object { v, d }`);
	}
	if (typeof elem.v !== 'number' || typeof elem.d !== 'number') {
		throw new TypeError(`Element at index ${index} must have numeric v and d properties`);
	}
	if (!Number.isFinite(elem.v) || !Number.isFinite(elem.d)) {
		throw new RangeError(`Element at index ${index} must have finite v and d values`);
	}
}

/**
 * Divide-and-conquer pass that validates every dual element in `[lo, hi)` and finds `max |v_i|`.
 *
 * @param {DualNumber[]} vec - Non-empty vector of dual numbers.
 * @param {number} lo - Inclusive start index.
 * @param {number} hi - Exclusive end index.
 * @returns {number} Maximum absolute primal value in the slice.
 */
function validateAndMaxAbsRecursive(vec, lo, hi) {
	if (hi - lo === 1) {
		validateDual(vec[lo], lo);
		return Math.abs(vec[lo].v);
	}
	const mid = lo + ((hi - lo) >> 1);
	const leftMax = validateAndMaxAbsRecursive(vec, lo, mid);
	const rightMax = validateAndMaxAbsRecursive(vec, mid, hi);
	return leftMax >= rightMax ? leftMax : rightMax;
}

/**
 * Divide-and-conquer accumulation of the scaled sum of squares and scaled dot product
 * for dual numbers in `[lo, hi)`:
 *   - `sq = sum((v_i / scale)^2)`
 *   - `dot = sum((v_i / scale) * d_i)`
 *
 * In dual-number arithmetic, `(v_i + d_i * eps)^2 = v_i^2 + 2 * v_i * d_i * eps`;
 * dividing primal terms by `scale` avoids intermediate overflow/underflow, and the factor
 * of 2 cancels analytically with the `1 / (2 * sqrt(sum))` in the dual square-root rule.
 *
 * @param {DualNumber[]} vec - Validated vector of dual numbers.
 * @param {number} lo - Inclusive start index.
 * @param {number} hi - Exclusive end index.
 * @param {number} scale - Positive scaling factor (`max |v_i|`).
 * @returns {{ sq: number, dot: number }} Pairwise-summed scaled squares and scaled dot product.
 */
function sumScaledDualSquaresRecursive(vec, lo, hi, scale) {
	if (hi - lo === 1) {
		const { v, d } = vec[lo];
		const sv = v / scale;
		return { sq: sv * sv, dot: sv * d };
	}
	const mid = lo + ((hi - lo) >> 1);
	const left = sumScaledDualSquaresRecursive(vec, lo, mid, scale);
	const right = sumScaledDualSquaresRecursive(vec, mid, hi, scale);
	return {
		sq: left.sq + right.sq,
		dot: left.dot + right.dot,
	};
}

/**
 * Computes the Euclidean magnitude (L2 norm) of a vector of dual numbers `{ v, d }`
 * using a recursive divide-and-conquer algorithm with scaling for numerical stability.
 *
 * For a dual vector `x = [v_i + d_i * eps]`:
 *   - `v = ||v||_2 = sqrt(sum(v_i^2))`
 *   - `d = (sum(v_i * d_i)) / ||v||_2`
 *
 * For an empty vector or a zero primal vector (`||v||_2 === 0`), returns `{ v: 0, d: 0 }`
 * (using the zero subgradient at the non-differentiable origin).
 *
 * @param {DualNumber[]} vec - Array of dual number objects `{ v, d }`.
 * @returns {DualNumber} Dual number `{ v, d }` representing the vector magnitude and its derivative.
 * @throws {TypeError} If `vec` is not an array or any element is not a valid `{ v, d }` object with numeric fields.
 * @throws {RangeError} If any element has a non-finite `v` or `d` value.
 */
export function magnitudeDualRecursive(vec) {
	if (!Array.isArray(vec)) {
		throw new TypeError('Input must be an array of dual numbers { v, d }');
	}
	if (vec.length === 0) {
		return { v: 0, d: 0 };
	}

	const scale = validateAndMaxAbsRecursive(vec, 0, vec.length);
	if (scale === 0) {
		return { v: 0, d: 0 };
	}

	const { sq, dot } = sumScaledDualSquaresRecursive(vec, 0, vec.length, scale);
	const sqrtSq = Math.sqrt(sq);
	const v = scale * sqrtSq;
	const rawD = dot / sqrtSq;
	const d = rawD === 0 ? 0 : rawD;

	return { v, d };
}
