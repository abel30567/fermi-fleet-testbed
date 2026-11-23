/**
 * Three-valued Kleene logic (`K3`) truth values.
 * @typedef {true | false | 'unknown'} KleeneValue
 */

/**
 * A partial set represented either as a plain object mapping string keys to
 * Kleene truth values or as a `Map` mapping arbitrary keys to Kleene truth values.
 * Absent keys represent `'unknown'` membership (open-world partial-set semantics).
 *
 * @typedef {Record<string, KleeneValue> | Map<any, KleeneValue>} PartialSet
 */

/**
 * Checks whether a value is a valid strong Kleene truth value (`true`, `false`, or `'unknown'`).
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
 * Computes strong Kleene disjunction (`a ∨ b`) over `{true, false, 'unknown'}`.
 *
 * Truth table:
 * - `true ∨ _ = true`
 * - `_ ∨ true = true`
 * - `false ∨ false = false`
 * - otherwise `'unknown'`
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
 * Validates all input partial sets and returns whether they are `Map` instances.
 *
 * @param {unknown[]} sets
 * @returns {boolean} `true` if all inputs are `Map` instances, `false` if all are plain objects.
 */
function validatePartialSets(sets) {
	if (sets.length < 2) {
		throw new TypeError('unionKleeneIterative requires at least two partial sets')
	}

	const firstIsMap = sets[0] instanceof Map
	if (!firstIsMap && !isPlainObject(sets[0])) {
		throw new TypeError('Argument 0 must be a plain object or Map representing a partial set')
	}

	for (let i = 0; i < sets.length; i++) {
		const current = sets[i]
		if (firstIsMap) {
			if (!(current instanceof Map)) {
				throw new TypeError(`Argument ${i} must be a Map to match the first partial set`)
			}
			for (const [key, value] of current.entries()) {
				if (!isKleeneValue(value)) {
					throw new TypeError(
						`Invalid Kleene truth value for key ${String(key)} in argument ${i}: expected true, false, or 'unknown'`
					)
				}
			}
		} else {
			if (!isPlainObject(current)) {
				throw new TypeError(`Argument ${i} must be a plain object to match the first partial set`)
			}
			const keys = Object.keys(current)
			for (let j = 0; j < keys.length; j++) {
				const key = keys[j]
				if (!isKleeneValue(current[key])) {
					throw new TypeError(
						`Invalid Kleene truth value for key "${key}" in argument ${i}: expected true, false, or 'unknown'`
					)
				}
			}
		}
	}

	return firstIsMap
}

/**
 * Computes the union of two or more partial sets under strong three-valued Kleene
 * logic (`true`, `false`, `'unknown'`) using a straightforward iterative algorithm.
 *
 * Under partial-set semantics, an element not explicitly listed in a partial set has
 * `'unknown'` membership in that set. Pointwise Kleene disjunction (`∨`) is applied
 * across all input sets for every element present in at least one input:
 * - `true` if the element is `true` in at least one partial set;
 * - `false` if the element is `false` in every partial set;
 * - `'unknown'` otherwise.
 *
 * Inputs must either all be plain objects (returns a new plain object) or all be
 * `Map` instances (returns a new `Map`). Input sets are never mutated.
 *
 * @template {PartialSet} T
 * @param {T} a - First partial set.
 * @param {T} b - Second partial set.
 * @param {...T} rest - Optional additional partial sets to union iteratively.
 * @returns {T} A new partial set representing the Kleene union of all inputs.
 * @throws {TypeError} If fewer than two partial sets are provided, container types are
 *   invalid or mixed, or any entry value is not `true`, `false`, or `'unknown'`.
 */
export function unionKleeneIterative(a, b, ...rest) {
	if (arguments.length < 2) {
		throw new TypeError('unionKleeneIterative requires at least two partial sets')
	}

	const sets = [a, b, ...rest]
	const isMapMode = validatePartialSets(sets)

	const universe = new Set()
	if (isMapMode) {
		for (let i = 0; i < sets.length; i++) {
			for (const key of sets[i].keys()) {
				universe.add(key)
			}
		}

		const result = new Map()
		for (const key of universe) {
			/** @type {KleeneValue} */
			let acc = false
			for (let i = 0; i < sets.length; i++) {
				const value = sets[i].has(key) ? sets[i].get(key) : 'unknown'
				acc = kleeneOr(acc, value)
				if (acc === true) {
					break
				}
			}
			result.set(key, acc)
		}
		return /** @type {any} */ (result)
	}

	for (let i = 0; i < sets.length; i++) {
		const keys = Object.keys(sets[i])
		for (let j = 0; j < keys.length; j++) {
			universe.add(keys[j])
		}
	}

	const result = {}
	for (const key of universe) {
		/** @type {KleeneValue} */
		let acc = false
		for (let i = 0; i < sets.length; i++) {
			const value = Object.hasOwn(sets[i], key) ? sets[i][key] : 'unknown'
			acc = kleeneOr(acc, value)
			if (acc === true) {
				break
			}
		}
		if (key === '__proto__') {
			Object.defineProperty(result, key, {
				value: acc,
				enumerable: true,
				writable: true,
				configurable: true,
			})
		} else {
			result[key] = acc
		}
	}

	return /** @type {any} */ (result)
}
