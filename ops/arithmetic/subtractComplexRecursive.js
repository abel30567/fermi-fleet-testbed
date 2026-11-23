/**
 * @typedef {{ re: number, im: number }} Complex
 */

const COMPONENTS = Object.freeze(['re', 'im']);

/**
 * Validates that a value is a finite complex number object `{ re, im }`.
 *
 * @param {unknown} value - Candidate value to validate.
 * @param {string} label - Parameter name for error reporting.
 * @throws {TypeError} If `value` is not a plain-like object with numeric `re` and `im`.
 * @throws {RangeError} If `re` or `im` is not a finite number.
 */
function assertComplex(value, label) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(`${label} must be a complex number object { re, im }`);
	}
	const { re, im } = value;
	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError(`${label}.re and ${label}.im must be numbers`);
	}
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError(`${label}.re and ${label}.im must be finite numbers`);
	}
}

/**
 * Normalizes IEEE-754 negative zero (`-0`) to positive zero (`0`).
 *
 * @param {number} n
 * @returns {number}
 */
function normalizeZero(n) {
	return n === 0 ? 0 : n;
}

/**
 * Applies a binary scalar operation over a slice of component keys using
 * recursive divide-and-conquer, then merges the resulting partial objects.
 *
 * @param {Complex} lhs
 * @param {Complex} rhs
 * @param {(x: number, y: number) => number} op
 * @param {readonly ('re' | 'im')[]} keys
 * @param {number} start
 * @param {number} end
 * @returns {Partial<Complex>}
 */
function combineComponentsRecursive(lhs, rhs, op, keys, start, end) {
	if (end - start === 1) {
		const key = keys[start];
		return { [key]: normalizeZero(op(lhs[key], rhs[key])) };
	}
	const mid = start + ((end - start) >> 1);
	const leftPart = combineComponentsRecursive(lhs, rhs, op, keys, start, mid);
	const rightPart = combineComponentsRecursive(lhs, rhs, op, keys, mid, end);
	return { ...leftPart, ...rightPart };
}

/**
 * Recursively sums an array slice of complex numbers via divide-and-conquer
 * pairwise reduction.
 *
 * @param {Complex[]} values
 * @param {number} start
 * @param {number} end
 * @returns {Complex}
 */
function sumComplexDivideAndConquer(values, start, end) {
	if (end - start === 1) {
		return {
			re: normalizeZero(values[start].re),
			im: normalizeZero(values[start].im),
		};
	}
	const mid = start + ((end - start) >> 1);
	const leftSum = sumComplexDivideAndConquer(values, start, mid);
	const rightSum = sumComplexDivideAndConquer(values, mid, end);
	return /** @type {Complex} */ (
		combineComponentsRecursive(
			leftSum,
			rightSum,
			(x, y) => x + y,
			COMPONENTS,
			0,
			COMPONENTS.length,
		)
	);
}

/**
 * Subtracts one or more complex numbers from an initial complex number `a`
 * using a recursive divide-and-conquer strategy.
 *
 * For two inputs `(a, b)`, computes `a - b` by recursively splitting the
 * complex components `['re', 'im']` and combining the partial differences.
 * For additional subtrahends `(a, b, ...rest)`, first reduces `[b, ...rest]`
 * via divide-and-conquer pairwise summation and then subtracts the result
 * from `a`.
 *
 * @param {Complex} a - Minuend complex number `{ re, im }`.
 * @param {Complex} b - First subtrahend complex number `{ re, im }`.
 * @param {...Complex} rest - Optional additional subtrahend complex numbers.
 * @returns {Complex} The resulting complex difference `{ re, im }`.
 * @throws {TypeError} If any argument is not a `{ re, im }` object with numeric fields.
 * @throws {RangeError} If any `re` or `im` component is `NaN` or infinite.
 */
export function subtractComplexRecursive(a, b, ...rest) {
	assertComplex(a, 'a');
	assertComplex(b, 'b');
	for (let i = 0; i < rest.length; i += 1) {
		assertComplex(rest[i], `rest[${i}]`);
	}

	const subtrahend =
		rest.length === 0
			? b
			: sumComplexDivideAndConquer([b, ...rest], 0, rest.length + 1);

	return /** @type {Complex} */ (
		combineComponentsRecursive(
			a,
			subtrahend,
			(x, y) => x - y,
			COMPONENTS,
			0,
			COMPONENTS.length,
		)
	);
}
