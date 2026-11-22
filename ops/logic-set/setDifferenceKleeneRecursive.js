/**
 * @typedef {true | false | 'unknown'} KleeneValue
 * Three-valued Kleene (K3) truth value.
 */

/**
 * @typedef {Record<string, KleeneValue>} KleenePlainPartialSet
 * Partial set represented as a plain object mapping string keys to Kleene truth values.
 */

/**
 * @typedef {Map<any, KleeneValue>} KleeneMapPartialSet
 * Partial set represented as a Map mapping arbitrary keys to Kleene truth values.
 */

/**
 * Checks whether a value is a valid Kleene K3 truth value (`true`, `false`, or `'unknown'`).
 *
 * @param {unknown} value
 * @returns {value is KleeneValue}
 */
function isKleeneValue(value) {
	return value === true || value === false || value === 'unknown'
}

/**
 * Checks whether a value is a plain object (`Object.prototype` or `null` prototype).
 *
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainObject(value) {
	if (value === null || typeof value !== 'object') {
		return false
	}
	const proto = Object.getPrototypeOf(value)
	return proto === Object.prototype || proto === null
}

/**
 * Validates that a partial set is either a plain object or a Map and that all of its
 * membership values are valid Kleene K3 truth values (`true`, `false`, or `'unknown'`).
 *
 * @param {unknown} input
 * @param {string} name
 * @returns {'map' | 'object'}
 * @throws {TypeError} If `input` is not a plain object or Map, or contains an invalid membership value.
 */
function validatePartialSet(input, name) {
	if (input instanceof Map) {
		for (const [key, value] of input.entries()) {
			if (!isKleeneValue(value)) {
				throw new TypeError(
					`${name} contains invalid Kleene membership value for key ${String(key)}: expected true, false, or 'unknown'`
				)
			}
		}
		return 'map'
	}

	if (isPlainObject(input)) {
		for (const key of Object.keys(input)) {
			if (!isKleeneValue(input[key])) {
				throw new TypeError(
					`${name} contains invalid Kleene membership value for key "${key}": expected true, false, or 'unknown'`
				)
			}
		}
		return 'object'
	}

	throw new TypeError(
		`${name} must be a plain object or a Map representing a Kleene partial set`
	)
}

/**
 * Kleene K3 strong negation (`¬_K`).
 *
 * @param {KleeneValue} value
 * @returns {KleeneValue}
 */
function kleeneNot(value) {
	if (value === true) return false
	if (value === false) return true
	return 'unknown'
}

/**
 * Kleene K3 strong conjunction (`∧_K`).
 *
 * @param {KleeneValue} a
 * @param {KleeneValue} b
 * @returns {KleeneValue}
 */
function kleeneAnd(a, b) {
	if (a === false || b === false) return false
	if (a === true && b === true) return true
	return 'unknown'
}

/**
 * Safely defines an own enumerable data property on a plain object, including
 * special keys such as `'__proto__'`.
 *
 * @param {Record<string, KleeneValue>} target
 * @param {string} key
 * @param {KleeneValue} value
 */
function setOwnProperty(target, key, value) {
	if (key === '__proto__') {
		Object.defineProperty(target, key, {
			value,
			writable: true,
			enumerable: true,
			configurable: true,
		})
	} else {
		target[key] = value
	}
}

/**
 * Merges two disjoint partial-set plain objects into a single plain object.
 *
 * @param {KleenePlainPartialSet} left
 * @param {KleenePlainPartialSet} right
 * @returns {KleenePlainPartialSet}
 */
function mergePlainPartialSets(left, right) {
	for (const key of Object.keys(right)) {
		setOwnProperty(left, key, right[key])
	}
	return left
}

/**
 * Merges two disjoint partial-set Maps into a single Map.
 *
 * @param {KleeneMapPartialSet} left
 * @param {KleeneMapPartialSet} right
 * @returns {KleeneMapPartialSet}
 */
function mergeMapPartialSets(left, right) {
	for (const [key, value] of right.entries()) {
		left.set(key, value)
	}
	return left
}

/**
 * Recursively computes the Kleene set difference over `keys[start..end)` using
 * divide-and-conquer, splitting the key slice in half and merging partial results.
 *
 * @param {Array<any>} keys
 * @param {number} start
 * @param {number} end
 * @param {(key: any) => KleeneValue} getA
 * @param {(key: any) => KleeneValue} getB
 * @param {'map' | 'object'} kind
 * @returns {KleeneMapPartialSet | KleenePlainPartialSet}
 */
function computeDifferenceRecursive(keys, start, end, getA, getB, kind) {
	const length = end - start

	if (length <= 0) {
		return kind === 'map' ? new Map() : {}
	}

	if (length === 1) {
		const key = keys[start]
		const membership = kleeneAnd(getA(key), kleeneNot(getB(key)))
		if (kind === 'map') {
			return new Map([[key, membership]])
		}
		const single = {}
		setOwnProperty(single, key, membership)
		return single
	}

	const mid = start + Math.floor(length / 2)
	const leftResult = computeDifferenceRecursive(keys, start, mid, getA, getB, kind)
	const rightResult = computeDifferenceRecursive(keys, mid, end, getA, getB, kind)

	if (kind === 'map') {
		return mergeMapPartialSets(
			/** @type {KleeneMapPartialSet} */ (leftResult),
			/** @type {KleeneMapPartialSet} */ (rightResult)
		)
	}
	return mergePlainPartialSets(
		/** @type {KleenePlainPartialSet} */ (leftResult),
		/** @type {KleenePlainPartialSet} */ (rightResult)
	)
}

/**
 * Computes the set difference `setA \ setB` over three-valued Kleene (K3) logic
 * partial sets using a recursive divide-and-conquer algorithm.
 *
 * Partial sets may be passed as either two plain objects (`Record<string, true | false | 'unknown'>`)
 * or two `Map` instances (`Map<any, true | false | 'unknown'>`). Both inputs must use the same
 * representation, and the returned partial set preserves that representation without mutating inputs.
 *
 * Missing keys default to `false`. For every key `x` present in `setA` or `setB`, membership in
 * `setA \ setB` is defined by Kleene K3 logic:
 *
 *     m_{A \ B}(x) = m_A(x) ∧_K ¬_K m_B(x)
 *
 * Truth table:
 * - `true \ false = true`
 * - `true \ true = false`
 * - `true \ 'unknown' = 'unknown'`
 * - `false \ false = false`, `false \ true = false`, `false \ 'unknown' = false`
 * - `'unknown' \ false = 'unknown'`
 * - `'unknown' \ true = false`
 * - `'unknown' \ 'unknown' = 'unknown'`
 *
 * @template {KleenePlainPartialSet | KleeneMapPartialSet} T
 * @param {T} setA - Left operand partial set (`A`).
 * @param {T} setB - Right operand partial set (`B`).
 * @returns {T} A new partial set of the same kind containing `setA \ setB` over the combined keys.
 * @throws {TypeError} If either input is not a plain object or Map, if the two inputs have
 *   mismatched container types, or if any entry has a value other than `true`, `false`, or `'unknown'`.
 */
export function setDifferenceKleeneRecursive(setA, setB) {
	const kindA = validatePartialSet(setA, 'setA')
	const kindB = validatePartialSet(setB, 'setB')

	if (kindA !== kindB) {
		throw new TypeError(
			`setA and setB must have matching types (received ${kindA} and ${kindB})`
		)
	}

	if (kindA === 'map') {
		const mapA = /** @type {KleeneMapPartialSet} */ (setA)
		const mapB = /** @type {KleeneMapPartialSet} */ (setB)
		const combinedKeys = Array.from(new Set([...mapA.keys(), ...mapB.keys()]))
		const getA = (key) => (mapA.has(key) ? mapA.get(key) : false)
		const getB = (key) => (mapB.has(key) ? mapB.get(key) : false)
		return /** @type {T} */ (
			computeDifferenceRecursive(combinedKeys, 0, combinedKeys.length, getA, getB, 'map')
		)
	}

	const objA = /** @type {KleenePlainPartialSet} */ (setA)
	const objB = /** @type {KleenePlainPartialSet} */ (setB)
	const combinedKeys = Array.from(new Set([...Object.keys(objA), ...Object.keys(objB)]))
	const getA = (key) => (Object.hasOwn(objA, key) ? objA[key] : false)
	const getB = (key) => (Object.hasOwn(objB, key) ? objB[key] : false)
	return /** @type {T} */ (
		computeDifferenceRecursive(combinedKeys, 0, combinedKeys.length, getA, getB, 'object')
	)
}
