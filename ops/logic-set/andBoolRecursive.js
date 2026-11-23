/**
 * Recursive divide-and-conquer logical AND over plain booleans or JS `Set` objects.
 *
 * - When given plain booleans (`boolean`), computes their logical conjunction (`&&`).
 *   An empty boolean array `[]` evaluates to `true` (the identity element of conjunction).
 * - When given JS `Set` objects, computes their set-theoretic intersection (`∩`) and
 *   returns a newly allocated `Set` without mutating any input sets.
 *
 * Accepts either variadic arguments (`andBoolRecursive(a, b, ...)`) or a single array
 * of homogeneous operands (`andBoolRecursive([a, b, ...])`).
 *
 * @param {...(boolean|Set<*>|Array<boolean|Set<*>>)} args - One or more plain booleans,
 *   one or more `Set` instances, or a single array containing all booleans or all `Set`s.
 * @returns {boolean|Set<*>} The boolean conjunction or the intersection `Set`.
 * @throws {TypeError} If called with no arguments, unsupported operand types, or mixed
 *   boolean and `Set` operands.
 */
export function andBoolRecursive(...args) {
	if (args.length === 0) {
		throw new TypeError('andBoolRecursive requires at least one boolean, Set, or array argument');
	}

	let operands;
	if (args.length === 1 && Array.isArray(args[0])) {
		operands = args[0];
		if (operands.length === 0) {
			return true;
		}
	} else {
		operands = args;
	}

	const first = operands[0];
	if (typeof first === 'boolean') {
		for (let i = 0; i < operands.length; i++) {
			if (typeof operands[i] !== 'boolean') {
				throw new TypeError(
					`Expected all operands to be plain booleans, got ${describeType(operands[i])} at index ${i}`
				);
			}
		}
		return andBooleansDivideConquer(operands, 0, operands.length);
	}

	if (first instanceof Set) {
		for (let i = 0; i < operands.length; i++) {
			if (!(operands[i] instanceof Set)) {
				throw new TypeError(
					`Expected all operands to be Set instances, got ${describeType(operands[i])} at index ${i}`
				);
			}
		}
		return intersectSetsDivideConquer(operands, 0, operands.length);
	}

	throw new TypeError(
		`Expected plain booleans or Set instances, got ${describeType(first)} at index 0`
	);
}

/**
 * Divide-and-conquer boolean conjunction over `values[lo..hi)`.
 *
 * @param {boolean[]} values
 * @param {number} lo
 * @param {number} hi
 * @returns {boolean}
 */
function andBooleansDivideConquer(values, lo, hi) {
	const len = hi - lo;
	if (len === 0) {
		return true;
	}
	if (len === 1) {
		return values[lo];
	}
	const mid = lo + Math.floor(len / 2);
	const left = andBooleansDivideConquer(values, lo, mid);
	if (!left) {
		return false;
	}
	return andBooleansDivideConquer(values, mid, hi);
}

/**
 * Divide-and-conquer n-ary set intersection over `sets[lo..hi)`.
 *
 * @param {Set<*>[]} sets
 * @param {number} lo
 * @param {number} hi
 * @returns {Set<*>}
 */
function intersectSetsDivideConquer(sets, lo, hi) {
	const len = hi - lo;
	if (len === 1) {
		return new Set(sets[lo]);
	}
	if (len === 2) {
		return intersectTwoSetsRecursive(sets[lo], sets[lo + 1]);
	}
	const mid = lo + Math.floor(len / 2);
	const left = intersectSetsDivideConquer(sets, lo, mid);
	if (left.size === 0) {
		return left;
	}
	const right = intersectSetsDivideConquer(sets, mid, hi);
	if (right.size === 0) {
		return right;
	}
	return intersectTwoSetsRecursive(left, right);
}

/**
 * Computes the intersection of two sets using divide-and-conquer recursion
 * over the elements of the smaller set.
 *
 * @param {Set<*>} a
 * @param {Set<*>} b
 * @returns {Set<*>}
 */
function intersectTwoSetsRecursive(a, b) {
	if (a.size === 0 || b.size === 0) {
		return new Set();
	}
	const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
	const elements = Array.from(smaller);
	const result = new Set();
	collectSharedElements(elements, 0, elements.length, larger, result);
	return result;
}

/**
 * Recursively splits `elements[lo..hi)` and inserts elements present in `other` into `out`.
 *
 * @param {Array<*>} elements
 * @param {number} lo
 * @param {number} hi
 * @param {Set<*>} other
 * @param {Set<*>} out
 */
function collectSharedElements(elements, lo, hi, other, out) {
	const len = hi - lo;
	if (len === 0) {
		return;
	}
	if (len === 1) {
		const item = elements[lo];
		if (other.has(item)) {
			out.add(item);
		}
		return;
	}
	const mid = lo + Math.floor(len / 2);
	collectSharedElements(elements, lo, mid, other, out);
	collectSharedElements(elements, mid, hi, other, out);
}

/**
 * Produces a concise type label for error messages.
 *
 * @param {*} value
 * @returns {string}
 */
function describeType(value) {
	if (value === null) return 'null';
	if (Array.isArray(value)) return 'Array';
	if (value instanceof Set) return 'Set';
	if (typeof value === 'object') {
		return value.constructor?.name ?? 'Object';
	}
	return typeof value;
}
