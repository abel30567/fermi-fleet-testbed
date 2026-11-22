/**
 * @typedef {object} DualNumber
 * @property {number} v - Primal value (real part).
 * @property {number} d - Tangent / forward-mode derivative (dual part, coefficient of ε where ε² = 0).
 */

/**
 * Normalizes IEEE-754 negative zero (-0) to positive zero (0).
 *
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x;
}

/**
 * Validates that a value is a well-formed dual number `{ v, d }` with finite numbers.
 *
 * @param {unknown} value - Candidate dual number.
 * @param {string} label - Label used in error messages.
 * @returns {DualNumber} Validated dual number copy with normalized zeros.
 * @throws {TypeError} If `value` is not a non-null, non-array object with numeric `v` and `d`.
 * @throws {RangeError} If `v` or `d` is not finite (`NaN`, `Infinity`, or `-Infinity`).
 */
function validateDual(value, label) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(`${label} must be a dual number object { v, d }`);
	}
	const { v, d } = /** @type {{ v: unknown, d: unknown }} */ (value);
	if (typeof v !== 'number' || typeof d !== 'number') {
		throw new TypeError(`${label} must have numeric "v" and "d" properties`);
	}
	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError(`${label} "v" and "d" must be finite numbers`);
	}
	return { v: normalizeZero(v), d: normalizeZero(d) };
}

/**
 * Multiplies two validated dual numbers using the Leibniz product rule:
 * `(a.v + a.d·ε)(b.v + b.d·ε) = (a.v·b.v) + (a.v·b.d + a.d·b.v)·ε (mod ε²)`.
 *
 * Direct computation of `a.v * b.d + a.d * b.v` avoids the catastrophic cancellation
 * that Karatsuba's `(a.v + a.d)(b.v + b.d) - a.v·b.v - a.d·b.d` can suffer from the
 * discarded ε² term when primal and dual magnitudes differ widely.
 *
 * @param {DualNumber} a
 * @param {DualNumber} b
 * @returns {DualNumber}
 */
function multiplyPair(a, b) {
	return {
		v: normalizeZero(a.v * b.v),
		d: normalizeZero(a.v * b.d + a.d * b.v),
	};
}

/**
 * Recursively multiplies a contiguous slice `factors[start..end)` of validated dual numbers
 * using balanced divide-and-conquer binary-tree reduction (`O(log n)` recursion depth).
 *
 * @param {DualNumber[]} factors - Pre-validated dual numbers.
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 * @returns {DualNumber}
 */
function multiplyRange(factors, start, end) {
	const len = end - start;
	if (len === 0) {
		return { v: 1, d: 0 };
	}
	if (len === 1) {
		return { v: factors[start].v, d: factors[start].d };
	}
	if (len === 2) {
		return multiplyPair(factors[start], factors[start + 1]);
	}
	const mid = start + (len >> 1);
	const left = multiplyRange(factors, start, mid);
	const right = multiplyRange(factors, mid, end);
	return multiplyPair(left, right);
}

/**
 * Multiplies dual numbers `{ v, d }` carrying a forward-mode derivative alongside the primal value,
 * using recursive divide-and-conquer binary-tree reduction.
 *
 * Supports:
 * - Binary invocation: `multiplyDualRecursive(a, b)`
 * - Variadic invocation: `multiplyDualRecursive(d1, d2, d3, ...)`
 * - Array invocation: `multiplyDualRecursive([d1, d2, ...])` (empty array returns multiplicative identity `{ v: 1, d: 0 }`)
 *
 * @param {DualNumber | DualNumber[]} first - First dual number or an array of dual numbers.
 * @param {...DualNumber} rest - Additional dual numbers for binary or variadic multiplication.
 * @returns {DualNumber} Product dual number `{ v, d }`.
 * @throws {TypeError} If called with no arguments, invalid argument types, or an array mixed with extra arguments.
 * @throws {RangeError} If any dual number has non-finite `v` or `d`.
 */
export function multiplyDualRecursive(first, ...rest) {
	if (arguments.length === 0) {
		throw new TypeError('multiplyDualRecursive requires at least one dual number or an array of dual numbers');
	}

	/** @type {unknown[]} */
	let rawFactors;
	if (Array.isArray(first)) {
		if (rest.length > 0) {
			throw new TypeError('Cannot pass additional arguments when the first argument is an array');
		}
		rawFactors = first;
	} else {
		rawFactors = [first, ...rest];
	}

	/** @type {DualNumber[]} */
	const validated = new Array(rawFactors.length);
	for (let i = 0; i < rawFactors.length; i++) {
		validated[i] = validateDual(rawFactors[i], `factor[${i}]`);
	}

	return multiplyRange(validated, 0, validated.length);
}
