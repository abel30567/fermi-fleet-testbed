/**
 * @typedef {true | false | 'unknown'} KleeneValue
 * @typedef {Map<any, KleeneValue> | Record<string, KleeneValue>} KleenePartialSet
 */

const VALID_KLEENE_VALUES = new Set([true, false, 'unknown'])

/**
 * Checks whether a value is a plain object (literal or null-prototype object).
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isPlainObject(value) {
	if (typeof value !== 'object' || value === null) {
		return false
	}
	const proto = Object.getPrototypeOf(value)
	return proto === Object.prototype || proto === null
}

/**
 * Validates that a value is a three-valued Kleene truth value (`true`, `false`, or `'unknown'`).
 *
 * @param {unknown} value
 * @param {string} context
 * @returns {KleeneValue}
 */
function validateKleeneValue(value, context) {
	if (!VALID_KLEENE_VALUES.has(value)) {
		throw new TypeError(
			`Invalid Kleene truth value for ${context}: expected true, false, or 'unknown', got ${String(value)}`
		)
	}
	return /** @type {KleeneValue} */ (value)
}

/**
 * Strong Kleene (K3) negation: ¬true = false, ¬false = true, ¬'unknown' = 'unknown'.
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
 * Strong Kleene (K3) conjunction: false dominates, true ∧ true = true, otherwise 'unknown'.
 *
 * @param {KleeneValue} left
 * @param {KleeneValue} right
 * @returns {KleeneValue}
 */
function kleeneAnd(left, right) {
	if (left === false || right === false) return false
	if (left === true && right === true) return true
	return 'unknown'
}

/**
 * Computes the set difference (A \ B) of two partial sets over three-valued
 * strong Kleene logic (K3: `true`, `false`, `'unknown'`) using a straightforward
 * iterative algorithm.
 *
 * For every element `x` in the combined domain of `a` and `b`, membership in
 * `a \ b` is defined point-wise by:
 *   `χ_{A \ B}(x) = χ_A(x) ∧_K (¬_K χ_B(x))`
 *
 * Truth table for `(a(x), b(x)) -> (a \ b)(x)`:
 * - `(true, true)       -> false`
 * - `(true, false)      -> true`
 * - `(true, 'unknown')  -> 'unknown'`
 * - `(false, *)         -> false`
 * - `('unknown', true)  -> false`
 * - `('unknown', false) -> 'unknown'`
 * - `('unknown', 'unknown') -> 'unknown'`
 *
 * Both inputs must share the same representation: either both `Map` instances
 * (supporting arbitrary keys) or both plain objects (string keys). The result
 * uses the same representation and does not mutate either input.
 *
 * @template {KleenePartialSet} T
 * @param {T} a - Minuend partial set mapping elements to `true | false | 'unknown'`.
 * @param {T} b - Subtrahend partial set mapping elements to `true | false | 'unknown'`.
 * @param {{ missing?: KleeneValue }} [options] - Optional configuration.
 * @param {KleeneValue} [options.missing=false] - Kleene truth value assumed for elements
 *   absent from one partial set (default `false` for closed-world; pass `'unknown'` for open-world).
 * @returns {T} A new partial set representing `a \ b` over the union of keys of `a` and `b`.
 * @throws {TypeError} If inputs are not valid partial sets of the same kind, contain invalid
 *   Kleene truth values, or if `options` is invalid.
 */
export function setDifferenceKleeneIterative(a, b, options = undefined) {
	const aIsMap = a instanceof Map
	const bIsMap = b instanceof Map
	const aIsObj = isPlainObject(a)
	const bIsObj = isPlainObject(b)

	if (!aIsMap && !aIsObj) {
		throw new TypeError('First argument "a" must be a Map or plain object partial set')
	}
	if (!bIsMap && !bIsObj) {
		throw new TypeError('Second argument "b" must be a Map or plain object partial set')
	}
	if (aIsMap !== bIsMap) {
		throw new TypeError('Both partial sets must use the same representation (both Map or both plain object)')
	}

	let missing = false
	if (options !== undefined) {
		if (!isPlainObject(options)) {
			throw new TypeError('Third argument "options" must be a plain object when provided')
		}
		if (Object.hasOwn(options, 'missing') && options.missing !== undefined) {
			missing = validateKleeneValue(options.missing, 'options.missing')
		}
	}

	if (aIsMap) {
		const mapA = /** @type {Map<any, KleeneValue>} */ (a)
		const mapB = /** @type {Map<any, KleeneValue>} */ (b)
		const result = new Map()

		for (const [key, rawA] of mapA) {
			const valA = validateKleeneValue(rawA, `a[${String(key)}]`)
			const hasB = mapB.has(key)
			const valB = hasB ? validateKleeneValue(mapB.get(key), `b[${String(key)}]`) : missing
			result.set(key, kleeneAnd(valA, kleeneNot(valB)))
		}

		for (const [key, rawB] of mapB) {
			if (mapA.has(key)) continue
			const valB = validateKleeneValue(rawB, `b[${String(key)}]`)
			result.set(key, kleeneAnd(missing, kleeneNot(valB)))
		}

		return /** @type {T} */ (result)
	}

	const objA = /** @type {Record<string, KleeneValue>} */ (a)
	const objB = /** @type {Record<string, KleeneValue>} */ (b)
	const result = {}

	const keysA = Object.keys(objA)
	for (let i = 0; i < keysA.length; i++) {
		const key = keysA[i]
		const valA = validateKleeneValue(objA[key], `a.${key}`)
		const hasB = Object.hasOwn(objB, key)
		const valB = hasB ? validateKleeneValue(objB[key], `b.${key}`) : missing
		Object.defineProperty(result, key, {
			value: kleeneAnd(valA, kleeneNot(valB)),
			enumerable: true,
			writable: true,
			configurable: true,
		})
	}

	const keysB = Object.keys(objB)
	for (let i = 0; i < keysB.length; i++) {
		const key = keysB[i]
		if (Object.hasOwn(objA, key)) continue
		const valB = validateKleeneValue(objB[key], `b.${key}`)
		Object.defineProperty(result, key, {
			value: kleeneAnd(missing, kleeneNot(valB)),
			enumerable: true,
			writable: true,
			configurable: true,
		})
	}

	return /** @type {T} */ (result)
}
