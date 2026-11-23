/**
 * Computes the logical-set union over plain booleans or JS `Set` objects using
 * a recursive divide-and-conquer strategy.
 *
 * - When given one or more `boolean` arguments, returns their logical disjunction (`||`).
 * - When given one or more `Set` arguments, returns a new `Set` containing all
 *   distinct elements across every input set without mutating any input.
 * - Mixing `boolean` and `Set` arguments, passing zero arguments, or passing
 *   any other type throws a `TypeError`.
 *
 * Divide-and-conquer splits both the operand list and set element ranges at
 * their midpoint, keeping recursion depth at O(log n).
 *
 * @template T
 * @param {...(boolean | Set<T>)} operands - One or more plain booleans, or one or more `Set` instances.
 * @returns {boolean | Set<T>} The logical union (`boolean`) or set union (`Set<T>`).
 * @throws {TypeError} If called with no arguments, unsupported types, or mixed booleans and `Set`s.
 */
export function unionBoolRecursive(...operands) {
	if (operands.length === 0) {
		throw new TypeError('unionBoolRecursive requires at least one boolean or Set argument')
	}

	const first = operands[0]
	const isBoolMode = typeof first === 'boolean'
	const isSetMode = first instanceof Set

	if (!isBoolMode && !isSetMode) {
		throw new TypeError('unionBoolRecursive operands must all be booleans or all be Set instances')
	}

	for (let i = 1; i < operands.length; i++) {
		const item = operands[i]
		if (isBoolMode && typeof item !== 'boolean') {
			throw new TypeError(
				`unionBoolRecursive expected boolean at argument index ${i}, received ${describeType(item)}`
			)
		}
		if (isSetMode && !(item instanceof Set)) {
			throw new TypeError(
				`unionBoolRecursive expected Set at argument index ${i}, received ${describeType(item)}`
			)
		}
	}

	if (isBoolMode) {
		return unionBooleansDivideAndConquer(operands, 0, operands.length - 1)
	}

	return unionSetsDivideAndConquer(operands, 0, operands.length - 1)
}

/**
 * Recursively computes the logical OR of `values[lo..hi]` via divide-and-conquer.
 *
 * @param {boolean[]} values
 * @param {number} lo
 * @param {number} hi
 * @returns {boolean}
 */
function unionBooleansDivideAndConquer(values, lo, hi) {
	if (lo === hi) {
		return values[lo]
	}

	const mid = (lo + hi) >>> 1
	const left = unionBooleansDivideAndConquer(values, lo, mid)
	if (left) {
		return true
	}
	return unionBooleansDivideAndConquer(values, mid + 1, hi)
}

/**
 * Recursively computes the union of `sets[lo..hi]` via divide-and-conquer,
 * always returning a freshly allocated `Set`.
 *
 * @template T
 * @param {Set<T>[]} sets
 * @param {number} lo
 * @param {number} hi
 * @returns {Set<T>}
 */
function unionSetsDivideAndConquer(sets, lo, hi) {
	if (lo === hi) {
		const target = new Set()
		const elements = Array.from(sets[lo])
		addRangeDivideAndConquer(target, elements, 0, elements.length - 1)
		return target
	}

	const mid = (lo + hi) >>> 1
	const left = unionSetsDivideAndConquer(sets, lo, mid)
	const right = unionSetsDivideAndConquer(sets, mid + 1, hi)
	return mergeTwoSetsDivideAndConquer(left, right)
}

/**
 * Merges two sets into a single `Set` using divide-and-conquer element insertion.
 * Mutates the larger internal working set `target` (which is always newly created
 * by `unionSetsDivideAndConquer`) to minimize element copies.
 *
 * @template T
 * @param {Set<T>} left
 * @param {Set<T>} right
 * @returns {Set<T>}
 */
function mergeTwoSetsDivideAndConquer(left, right) {
	const [target, source] = left.size >= right.size ? [left, right] : [right, left]
	const elements = Array.from(source)
	addRangeDivideAndConquer(target, elements, 0, elements.length - 1)
	return target
}

/**
 * Inserts `elements[lo..hi]` into `target` using divide-and-conquer recursion.
 *
 * @template T
 * @param {Set<T>} target
 * @param {T[]} elements
 * @param {number} lo
 * @param {number} hi
 */
function addRangeDivideAndConquer(target, elements, lo, hi) {
	if (lo > hi) {
		return
	}
	if (lo === hi) {
		target.add(elements[lo])
		return
	}

	const mid = (lo + hi) >>> 1
	addRangeDivideAndConquer(target, elements, lo, mid)
	addRangeDivideAndConquer(target, elements, mid + 1, hi)
}

/**
 * Formats a value's type for diagnostic `TypeError` messages.
 *
 * @param {unknown} value
 * @returns {string}
 */
function describeType(value) {
	if (value === null) {
		return 'null'
	}
	if (typeof value === 'object') {
		return value.constructor?.name ?? 'Object'
	}
	return typeof value
}
