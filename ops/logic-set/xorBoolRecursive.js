/**
 * Computes the logical XOR (exclusive OR) over plain booleans or symmetric
 * difference over JS `Set` objects using a recursive divide-and-conquer
 * implementation.
 *
 * - For plain booleans: returns `true` iff an odd number of arguments are `true`.
 * - For JS `Set` objects: returns a new `Set` containing elements present in an
 *   odd number of input sets (generalized symmetric difference). Input sets are
 *   never mutated.
 *
 * Both the n-ary reduction across operands and the binary `Set` symmetric
 * difference split work recursively in half, achieving O(log n) recursion depth.
 *
 * @param {...(boolean|Set<*>)} args One or more plain booleans, or one or more `Set` objects (cannot mix types).
 * @returns {boolean|Set<*>} Boolean parity result or symmetric difference `Set`.
 * @throws {TypeError} If no arguments are provided, if any argument is neither a plain boolean nor a `Set`, or if booleans and `Set` objects are mixed.
 */
export function xorBoolRecursive(...args) {
	if (args.length === 0) {
		throw new TypeError(
			'xorBoolRecursive requires at least one boolean or Set argument'
		)
	}

	const first = args[0]

	if (typeof first === 'boolean') {
		for (let i = 1; i < args.length; i++) {
			if (typeof args[i] !== 'boolean') {
				throw new TypeError(
					`xorBoolRecursive expected all arguments to be plain booleans; argument at index ${i} has type ${describeValue(args[i])}`
				)
			}
		}
		return xorBooleansDivideConquer(args, 0, args.length)
	}

	if (first instanceof Set) {
		for (let i = 1; i < args.length; i++) {
			if (!(args[i] instanceof Set)) {
				throw new TypeError(
					`xorBoolRecursive expected all arguments to be Set instances; argument at index ${i} has type ${describeValue(args[i])}`
				)
			}
		}
		return xorSetsDivideConquer(args, 0, args.length)
	}

	throw new TypeError(
		`xorBoolRecursive expects plain booleans or Set instances; argument at index 0 has type ${describeValue(first)}`
	)
}

/**
 * Divide-and-conquer boolean XOR over `values[lo..hi)`.
 *
 * @param {boolean[]} values
 * @param {number} lo Inclusive start index.
 * @param {number} hi Exclusive end index.
 * @returns {boolean}
 */
function xorBooleansDivideConquer(values, lo, hi) {
	const len = hi - lo
	if (len === 1) {
		return values[lo]
	}
	if (len === 2) {
		return values[lo] !== values[lo + 1]
	}
	const mid = lo + (len >>> 1)
	const left = xorBooleansDivideConquer(values, lo, mid)
	const right = xorBooleansDivideConquer(values, mid, hi)
	return left !== right
}

/**
 * Divide-and-conquer Set symmetric difference over `sets[lo..hi)`.
 *
 * @param {Set<*>[]} sets
 * @param {number} lo Inclusive start index.
 * @param {number} hi Exclusive end index.
 * @returns {Set<*>}
 */
function xorSetsDivideConquer(sets, lo, hi) {
	const len = hi - lo
	if (len === 1) {
		return cloneSetDivideConquer(sets[lo])
	}
	if (len === 2) {
		return xorTwoSetsDivideConquer(sets[lo], sets[lo + 1])
	}
	const mid = lo + (len >>> 1)
	const left = xorSetsDivideConquer(sets, lo, mid)
	const right = xorSetsDivideConquer(sets, mid, hi)
	return xorTwoSetsDivideConquer(left, right)
}

/**
 * Copies a `Set` using divide-and-conquer traversal so input sets are never returned by reference.
 *
 * @param {Set<*>} source
 * @returns {Set<*>}
 */
function cloneSetDivideConquer(source) {
	const out = new Set()
	if (source.size === 0) {
		return out
	}
	const items = Array.from(source)
	copyRange(items, 0, items.length, out)
	return out
}

/**
 * Recursively copies `items[lo..hi)` into `out`.
 *
 * @param {Array<*>} items
 * @param {number} lo
 * @param {number} hi
 * @param {Set<*>} out
 */
function copyRange(items, lo, hi, out) {
	const len = hi - lo
	if (len === 0) {
		return
	}
	if (len === 1) {
		out.add(items[lo])
		return
	}
	const mid = lo + (len >>> 1)
	copyRange(items, lo, mid, out)
	copyRange(items, mid, hi, out)
}

/**
 * Computes symmetric difference of two `Set` instances using divide-and-conquer
 * partitioning of each set's elements against the other set.
 *
 * @param {Set<*>} setA
 * @param {Set<*>} setB
 * @returns {Set<*>}
 */
function xorTwoSetsDivideConquer(setA, setB) {
	const out = new Set()
	if (setA.size > 0) {
		const arrA = Array.from(setA)
		collectExclusiveRange(arrA, 0, arrA.length, setB, out)
	}
	if (setB.size > 0) {
		const arrB = Array.from(setB)
		collectExclusiveRange(arrB, 0, arrB.length, setA, out)
	}
	return out
}

/**
 * Recursively collects elements from `items[lo..hi)` that are not in `otherSet` into `out`.
 *
 * @param {Array<*>} items
 * @param {number} lo
 * @param {number} hi
 * @param {Set<*>} otherSet
 * @param {Set<*>} out
 */
function collectExclusiveRange(items, lo, hi, otherSet, out) {
	const len = hi - lo
	if (len === 0) {
		return
	}
	if (len === 1) {
		const elem = items[lo]
		if (!otherSet.has(elem)) {
			out.add(elem)
		}
		return
	}
	const mid = lo + (len >>> 1)
	collectExclusiveRange(items, lo, mid, otherSet, out)
	collectExclusiveRange(items, mid, hi, otherSet, out)
}

/**
 * Produces a concise human-readable type label for error messages.
 *
 * @param {*} value
 * @returns {string}
 */
function describeValue(value) {
	if (value === null) {
		return 'null'
	}
	if (Array.isArray(value)) {
		return 'Array'
	}
	if (typeof value === 'object') {
		return value.constructor?.name ?? 'object'
	}
	return typeof value
}
