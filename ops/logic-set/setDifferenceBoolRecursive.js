/**
 * Computes the set difference (`A \ B`, or left-associative `A \ B \ C ...`)
 * over plain booleans or JavaScript `Set` objects using a recursive
 * divide-and-conquer implementation.
 *
 * - **Boolean mode**: treats `false` as the empty set `∅` and `true` as the
 *   singleton `{1}`, computing material nonimplication `a && !(b || ...rest)`.
 * - **Set mode**: returns a new `Set` containing all elements of `a` that are
 *   not members of `b` (or any additional subtrahend sets), preserving the
 *   insertion order of `a` without mutating any input set.
 *
 * @template T
 * @param {boolean | Set<T>} a - The minuend plain boolean or `Set`.
 * @param {boolean | Set<T>} b - The subtrahend plain boolean or `Set`.
 * @param {...(boolean | Set<T>)} rest - Optional additional subtrahend operands
 *   matching the type of `a` and `b`.
 * @returns {boolean | Set<T>} The resulting boolean or new `Set`.
 * @throws {TypeError} If fewer than two arguments are provided, if any operand
 *   is neither a plain boolean nor a `Set`, or if boolean and `Set` operands
 *   are mixed.
 */
export function setDifferenceBoolRecursive(a, b, ...rest) {
	if (arguments.length < 2) {
		throw new TypeError(
			'setDifferenceBoolRecursive requires at least 2 arguments',
		)
	}

	const isBool = typeof a === 'boolean'
	const isSet = a instanceof Set

	if (!isBool && !isSet) {
		throw new TypeError(
			`Expected argument 1 to be a plain boolean or Set, received ${describeType(a)}`,
		)
	}

	const subtrahends = [b, ...rest]
	for (let i = 0; i < subtrahends.length; i++) {
		const arg = subtrahends[i]
		if (isBool && typeof arg !== 'boolean') {
			throw new TypeError(
				`Expected argument ${i + 2} to be a plain boolean to match argument 1, received ${describeType(arg)}`,
			)
		}
		if (isSet && !(arg instanceof Set)) {
			throw new TypeError(
				`Expected argument ${i + 2} to be a Set to match argument 1, received ${describeType(arg)}`,
			)
		}
	}

	if (isBool) {
		const excluded = orBooleansDivideAndConquer(
			subtrahends,
			0,
			subtrahends.length,
		)
		return a && !excluded
	}

	const excludeSet =
		subtrahends.length === 1
			? subtrahends[0]
			: unionSetsDivideAndConquer(subtrahends, 0, subtrahends.length)

	const elements = [...a]
	return diffSetDivideAndConquer(elements, 0, elements.length, excludeSet)
}

/**
 * Recursively computes the logical OR of `values[lo..hi - 1]` via divide-and-conquer.
 *
 * @param {boolean[]} values
 * @param {number} lo
 * @param {number} hi
 * @returns {boolean}
 */
function orBooleansDivideAndConquer(values, lo, hi) {
	const len = hi - lo
	if (len <= 0) {
		return false
	}
	if (len === 1) {
		return values[lo]
	}
	const mid = lo + (len >>> 1)
	return (
		orBooleansDivideAndConquer(values, lo, mid) ||
		orBooleansDivideAndConquer(values, mid, hi)
	)
}

/**
 * Recursively computes the union of `sets[lo..hi - 1]` via divide-and-conquer,
 * always returning a newly allocated `Set`.
 *
 * @template T
 * @param {Set<T>[]} sets
 * @param {number} lo
 * @param {number} hi
 * @returns {Set<T>}
 */
function unionSetsDivideAndConquer(sets, lo, hi) {
	const len = hi - lo
	if (len <= 0) {
		return new Set()
	}
	if (len === 1) {
		return new Set(sets[lo])
	}
	const mid = lo + (len >>> 1)
	const left = unionSetsDivideAndConquer(sets, lo, mid)
	const right = unionSetsDivideAndConquer(sets, mid, hi)
	for (const value of right) {
		left.add(value)
	}
	return left
}

/**
 * Recursively computes `{ x ∈ elements[lo..hi - 1] : x ∉ exclude }` via
 * divide-and-conquer, preserving element order in a newly allocated `Set`.
 *
 * @template T
 * @param {T[]} elements
 * @param {number} lo
 * @param {number} hi
 * @param {Set<T>} exclude
 * @returns {Set<T>}
 */
function diffSetDivideAndConquer(elements, lo, hi, exclude) {
	const len = hi - lo
	if (len <= 0) {
		return new Set()
	}
	if (len === 1) {
		const item = elements[lo]
		return exclude.has(item) ? new Set() : new Set([item])
	}
	const mid = lo + (len >>> 1)
	const left = diffSetDivideAndConquer(elements, lo, mid, exclude)
	const right = diffSetDivideAndConquer(elements, mid, hi, exclude)
	for (const value of right) {
		left.add(value)
	}
	return left
}

/**
 * Formats a value's runtime type for error messages.
 *
 * @param {unknown} value
 * @returns {string}
 */
function describeType(value) {
	if (value === null) {
		return 'null'
	}
	if (Array.isArray(value)) {
		return 'Array'
	}
	if (value instanceof Set) {
		return 'Set'
	}
	if (value instanceof Boolean) {
		return 'Boolean object'
	}
	return typeof value
}
