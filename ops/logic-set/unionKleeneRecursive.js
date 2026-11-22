/**
 * @typedef {true | false | 'unknown'} KleeneValue
 * @typedef {Record<string, KleeneValue>} PlainPartialSet
 * @typedef {Map<any, KleeneValue>} MapPartialSet
 * @typedef {PlainPartialSet | MapPartialSet} PartialSet
 */

/**
 * Checks whether a value is a valid strong Kleene (K3) truth value.
 *
 * @param {unknown} value
 * @returns {value is KleeneValue}
 */
function isKleeneValue(value) {
	return value === true || value === false || value === 'unknown'
}

/**
 * Checks whether a value is a plain object (standard object literal or null-prototype object).
 *
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainObject(value) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return false
	}
	const proto = Object.getPrototypeOf(value)
	return proto === Object.prototype || proto === null
}

/**
 * Strong Kleene (K3) disjunction:
 * - `true` dominates `'unknown'` and `false`
 * - `'unknown' ∨ false = 'unknown'`
 * - `false ∨ false = false`
 *
 * @param {KleeneValue} a
 * @param {KleeneValue} b
 * @returns {KleeneValue}
 */
function kleeneOr(a, b) {
	if (a === true || b === true) {
		return true
	}
	if (a === 'unknown' || b === 'unknown') {
		return 'unknown'
	}
	return false
}

/**
 * Validates and normalizes a single partial set into a `Map<any, KleeneValue>`.
 *
 * @param {unknown} input
 * @param {number} index
 * @returns {{ map: MapPartialSet, isMap: boolean }}
 */
function validateAndNormalizePartialSet(input, index) {
	if (input instanceof Map) {
		const normalized = new Map()
		for (const [key, value] of input.entries()) {
			if (!isKleeneValue(value)) {
				throw new TypeError(
					`Invalid Kleene membership value at set[${index}] for key ${String(key)}: expected true, false, or 'unknown', got ${formatValue(value)}`,
				)
			}
			normalized.set(key, value)
		}
		return { map: normalized, isMap: true }
	}

	if (isPlainObject(input)) {
		const normalized = new Map()
		for (const key of Object.keys(input)) {
			const value = input[key]
			if (!isKleeneValue(value)) {
				throw new TypeError(
					`Invalid Kleene membership value at set[${index}] for key "${key}": expected true, false, or 'unknown', got ${formatValue(value)}`,
				)
			}
			normalized.set(key, value)
		}
		return { map: normalized, isMap: false }
	}

	throw new TypeError(
		`Invalid partial set at index ${index}: expected a plain object or Map, got ${formatValue(input)}`,
	)
}

/**
 * Formats an arbitrary value safely for diagnostic error messages.
 *
 * @param {unknown} value
 * @returns {string}
 */
function formatValue(value) {
	if (value === null) return 'null'
	if (value === undefined) return 'undefined'
	if (typeof value === 'string') return JSON.stringify(value)
	if (typeof value === 'symbol') return value.toString()
	if (typeof value === 'object') {
		const tag = Object.prototype.toString.call(value)
		return tag
	}
	return String(value)
}

/**
 * Recursively computes the Kleene union over a contiguous slice `[start, end)`
 * of combined unique keys from two partial sets via divide-and-conquer.
 *
 * Missing keys in either partial set default to `false` (absent from set).
 *
 * @param {unknown[]} keys
 * @param {number} start
 * @param {number} end
 * @param {MapPartialSet} left
 * @param {MapPartialSet} right
 * @returns {MapPartialSet}
 */
function unionKeysRecursive(keys, start, end, left, right) {
	const count = end - start
	if (count <= 0) {
		return new Map()
	}
	if (count === 1) {
		const key = keys[start]
		const leftVal = left.has(key) ? /** @type {KleeneValue} */ (left.get(key)) : false
		const rightVal = right.has(key) ? /** @type {KleeneValue} */ (right.get(key)) : false
		return new Map([[key, kleeneOr(leftVal, rightVal)]])
	}

	const mid = (start + end) >>> 1
	const leftHalf = unionKeysRecursive(keys, start, mid, left, right)
	const rightHalf = unionKeysRecursive(keys, mid, end, left, right)

	for (const [key, value] of rightHalf.entries()) {
		leftHalf.set(key, value)
	}
	return leftHalf
}

/**
 * Computes the Kleene union of two normalized partial sets by collecting
 * their combined key universe and dividing the keys recursively.
 *
 * @param {MapPartialSet} left
 * @param {MapPartialSet} right
 * @returns {MapPartialSet}
 */
function unionTwoPartialSetsRecursive(left, right) {
	/** @type {unknown[]} */
	const combinedKeys = []
	for (const key of left.keys()) {
		combinedKeys.push(key)
	}
	for (const key of right.keys()) {
		if (!left.has(key)) {
			combinedKeys.push(key)
		}
	}
	return unionKeysRecursive(combinedKeys, 0, combinedKeys.length, left, right)
}

/**
 * Recursively divides a slice `[start, end)` of normalized partial sets in half
 * and combines their unions via divide-and-conquer.
 *
 * @param {MapPartialSet[]} normalizedSets
 * @param {number} start
 * @param {number} end
 * @returns {MapPartialSet}
 */
function unionSetSliceRecursive(normalizedSets, start, end) {
	const count = end - start
	if (count <= 0) {
		return new Map()
	}
	if (count === 1) {
		return new Map(normalizedSets[start])
	}
	if (count === 2) {
		return unionTwoPartialSetsRecursive(normalizedSets[start], normalizedSets[start + 1])
	}

	const mid = (start + end) >>> 1
	const leftUnion = unionSetSliceRecursive(normalizedSets, start, mid)
	const rightUnion = unionSetSliceRecursive(normalizedSets, mid, end)
	return unionTwoPartialSetsRecursive(leftUnion, rightUnion)
}

/**
 * Converts a normalized `MapPartialSet` with string keys to a plain object safely,
 * preserving literal `'__proto__'` keys without triggering prototype mutation.
 *
 * @param {MapPartialSet} map
 * @returns {PlainPartialSet}
 */
function mapToPlainObject(map) {
	/** @type {PlainPartialSet} */
	const result = {}
	for (const [key, value] of map.entries()) {
		Object.defineProperty(result, /** @type {string} */ (key), {
			value,
			enumerable: true,
			writable: true,
			configurable: true,
		})
	}
	return result
}

/**
 * Computes the union of partial sets under strong Kleene three-valued logic (K3),
 * using a two-level recursive divide-and-conquer algorithm:
 * 1. Splits multiple input partial sets recursively in half and merges their sub-unions.
 * 2. Splits the combined key universe of two partial sets recursively in half and
 *    evaluates element-wise Kleene disjunction at the leaves.
 *
 * Membership semantics:
 * - Each partial set maps elements to `true` (definitely in the set),
 *   `false` (definitely absent), or `'unknown'` (membership indeterminate).
 * - Missing keys in any partial set default to `false` (absent from set).
 * - Union membership follows Kleene K3 OR:
 *   `m_{A ∪ B}(x) = m_A(x) ∨_K m_B(x)`, where `true` dominates `'unknown'` and `false`,
 *   `'unknown' ∨ false = 'unknown'`, and `false ∨ false = false`.
 * - Every key present in at least one input partial set is included in the result.
 *
 * Input & return conventions:
 * - Accepts variadic partial sets `unionKleeneRecursive(a, b, ...)` or a single array
 *   of partial sets `unionKleeneRecursive([a, b, ...])`.
 * - Each partial set may be a plain object (`Record<string, true | false | 'unknown'>`)
 *   or a `Map<any, true | false | 'unknown'>`.
 * - Returns a `Map` if any input partial set is a `Map` (preserving arbitrary key types);
 *   otherwise returns a new plain object (`{}` for zero inputs).
 * - Inputs are never mutated.
 *
 * @param {...(PartialSet | PartialSet[])} sets - Partial sets to union, or a single array of partial sets.
 * @returns {PartialSet} The Kleene union partial set.
 * @throws {TypeError} If any input is not a plain object or Map, or contains a membership value other than `true`, `false`, or `'unknown'`.
 */
export function unionKleeneRecursive(...sets) {
	/** @type {unknown[]} */
	let rawSets = sets
	if (sets.length === 1 && Array.isArray(sets[0])) {
		rawSets = sets[0]
	}

	if (rawSets.length === 0) {
		return {}
	}

	/** @type {MapPartialSet[]} */
	const normalizedSets = []
	let returnMap = false

	for (let i = 0; i < rawSets.length; i++) {
		const { map, isMap } = validateAndNormalizePartialSet(rawSets[i], i)
		normalizedSets.push(map)
		if (isMap) {
			returnMap = true
		}
	}

	const unionMap = unionSetSliceRecursive(normalizedSets, 0, normalizedSets.length)
	return returnMap ? unionMap : mapToPlainObject(unionMap)
}
