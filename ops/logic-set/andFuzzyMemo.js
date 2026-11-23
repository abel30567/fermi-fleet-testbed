/**
 * Zadeh fuzzy AND (intersection) operator over fuzzy logic truth values and
 * fuzzy sets with membership degrees in `[0, 1]`, backed by a precomputed
 * percentile lookup table and a bounded memoization cache.
 *
 * In Zadeh fuzzy logic, the conjunction of two membership degrees is:
 *   `mu_{A AND B}(x) = min(mu_A(x), mu_B(x))`
 *
 * Supported operand pairs (both operands must have the same kind):
 * - Two numbers in `[0, 1]` -> returns a number in `[0, 1]`.
 * - Two arrays of numbers in `[0, 1]` of equal length -> returns a new array.
 * - Two plain objects mapping keys to numbers in `[0, 1]` -> returns a new
 *   plain object over the union of keys (missing keys have membership `0`).
 * - Two `Map` instances mapping keys to numbers in `[0, 1]` -> returns a new
 *   `Map` over the union of keys (missing keys have membership `0`).
 *
 * @module ops/logic-set/andFuzzyMemo
 */

const TABLE_SCALE = 100;
const TABLE_STRIDE = TABLE_SCALE + 1;
const MAX_MEMO_ENTRIES = 4096;

/**
 * Precomputed 101x101 Zadeh AND lookup table for exact grid values
 * `0.00, 0.01, ..., 1.00`.
 * @type {Float64Array}
 */
const ZADEH_AND_TABLE = (() => {
	const table = new Float64Array(TABLE_STRIDE * TABLE_STRIDE);
	for (let i = 0; i <= TABLE_SCALE; i += 1) {
		const rowOffset = i * TABLE_STRIDE;
		for (let j = 0; j <= TABLE_SCALE; j += 1) {
			table[rowOffset + j] = (i <= j ? i : j) / TABLE_SCALE;
		}
	}
	return table;
})();

/**
 * Bounded FIFO memoization cache for arbitrary scalar pairs not on the
 * precomputed percentile grid.
 * @type {Map<string, number>}
 */
const scalarMemo = new Map();

/**
 * Validate a single fuzzy membership degree in `[0, 1]` and normalize `-0` to `0`.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {number}
 */
function validateMembership(value, label) {
	if (typeof value !== 'number') {
		throw new TypeError(`${label} must be a number`);
	}
	if (!Number.isFinite(value) || value < 0 || value > 1) {
		throw new RangeError(`${label} must be a finite number in [0, 1]`);
	}
	return value === 0 ? 0 : value;
}

/**
 * Check whether a value is a plain object (prototype is `Object.prototype` or `null`).
 *
 * @param {unknown} value
 * @returns {value is Record<string, number>}
 */
function isPlainObject(value) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		return false;
	}
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
}

/**
 * Compute Zadeh fuzzy AND for two already-validated, normalized scalar
 * membership degrees in `[0, 1]`, using the precomputed lookup table first
 * and falling back to the bounded memoization cache.
 *
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function andScalarValidated(a, b) {
	const ia = Math.round(a * TABLE_SCALE);
	const ib = Math.round(b * TABLE_SCALE);
	if (ia / TABLE_SCALE === a && ib / TABLE_SCALE === b) {
		return ZADEH_AND_TABLE[ia * TABLE_STRIDE + ib];
	}

	const key = `${a},${b}`;
	const cached = scalarMemo.get(key);
	if (cached !== undefined) {
		return cached;
	}

	const result = a <= b ? a : b;
	if (scalarMemo.size >= MAX_MEMO_ENTRIES) {
		const oldestKey = scalarMemo.keys().next().value;
		scalarMemo.delete(oldestKey);
	}
	scalarMemo.set(key, result);
	return result;
}

/**
 * Compute the Zadeh fuzzy AND (minimum / intersection) of two fuzzy truth
 * values or two fuzzy sets with membership degrees in `[0, 1]`.
 *
 * Uses a precomputed 101x101 table for exact percentile values (`0.00`..`1.00`)
 * and a bounded memoization cache for arbitrary floating-point values in `[0, 1]`.
 *
 * @param {number | number[] | Record<string, number> | Map<unknown, number>} a
 *   First fuzzy truth value or fuzzy set.
 * @param {number | number[] | Record<string, number> | Map<unknown, number>} b
 *   Second fuzzy truth value or fuzzy set (must match the kind of `a`).
 * @returns {number | number[] | Record<string, number> | Map<unknown, number>}
 *   Zadeh fuzzy conjunction / intersection of `a` and `b`.
 * @throws {TypeError} If operands are unsupported types, have mismatched kinds,
 *   or contain non-number membership values.
 * @throws {RangeError} If any membership value is outside `[0, 1]` or non-finite,
 *   or if array operands have different lengths.
 */
export function andFuzzyMemo(a, b) {
	if (typeof a === 'number' && typeof b === 'number') {
		const va = validateMembership(a, 'a');
		const vb = validateMembership(b, 'b');
		return andScalarValidated(va, vb);
	}

	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) {
			throw new RangeError('Fuzzy set arrays must have equal length');
		}
		const result = new Array(a.length);
		for (let i = 0; i < a.length; i += 1) {
			const va = validateMembership(a[i], `a[${i}]`);
			const vb = validateMembership(b[i], `b[${i}]`);
			result[i] = andScalarValidated(va, vb);
		}
		return result;
	}

	if (a instanceof Map && b instanceof Map) {
		const validatedA = new Map();
		for (const [k, v] of a.entries()) {
			validatedA.set(k, validateMembership(v, `a.get(${String(k)})`));
		}
		const validatedB = new Map();
		for (const [k, v] of b.entries()) {
			validatedB.set(k, validateMembership(v, `b.get(${String(k)})`));
		}

		const result = new Map();
		for (const [k, va] of validatedA.entries()) {
			const vb = validatedB.has(k) ? validatedB.get(k) : 0;
			result.set(k, andScalarValidated(va, vb));
		}
		for (const [k, vb] of validatedB.entries()) {
			if (!validatedA.has(k)) {
				result.set(k, andScalarValidated(0, vb));
			}
		}
		return result;
	}

	if (isPlainObject(a) && isPlainObject(b)) {
		const keysA = Object.keys(a);
		const keysB = Object.keys(b);
		const validatedA = Object.create(null);
		for (const k of keysA) {
			validatedA[k] = validateMembership(a[k], `a[${JSON.stringify(k)}]`);
		}
		const validatedB = Object.create(null);
		for (const k of keysB) {
			validatedB[k] = validateMembership(b[k], `b[${JSON.stringify(k)}]`);
		}

		const result = {};
		const setProp = (key, val) => {
			Object.defineProperty(result, key, {
				value: val,
				writable: true,
				enumerable: true,
				configurable: true,
			});
		};

		for (const k of keysA) {
			const vb = Object.prototype.hasOwnProperty.call(validatedB, k)
				? validatedB[k]
				: 0;
			setProp(k, andScalarValidated(validatedA[k], vb));
		}
		for (const k of keysB) {
			if (!Object.prototype.hasOwnProperty.call(validatedA, k)) {
				setProp(k, andScalarValidated(0, validatedB[k]));
			}
		}
		return result;
	}

	throw new TypeError(
		'Operands must both be numbers, arrays, plain objects, or Maps representing fuzzy memberships in [0, 1]',
	);
}
