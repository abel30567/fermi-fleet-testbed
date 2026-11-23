/**
 * @typedef {true | false | 'unknown'} KleeneValue
 * @typedef {KleeneValue | null} KleeneInputValue
 * @typedef {Map<unknown, KleeneInputValue> | Record<string, KleeneInputValue>} PartialSetInput
 * @typedef {object} IntersectionKleeneOptions
 * @property {Iterable<unknown>} [universe] Optional explicit universe of elements to evaluate.
 * @property {KleeneInputValue} [missing='unknown'] Default Kleene truth value for elements absent from a partial set.
 */

const UNKNOWN = 'unknown'

/**
 * Checks whether a value is a plain object (`{}` or `Object.create(null)`).
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
 * Validates and normalizes a Kleene three-valued logic value.
 * Accepts `true`, `false`, `'unknown'`, or `null` (normalized to `'unknown'`).
 *
 * @param {unknown} value
 * @param {string} context
 * @returns {KleeneValue}
 */
function normalizeKleeneValue(value, context) {
	if (value === true) {
		return true
	}
	if (value === false) {
		return false
	}
	if (value === UNKNOWN || value === null) {
		return UNKNOWN
	}
	throw new TypeError(
		`Invalid Kleene truth value for ${context}: expected true, false, 'unknown', or null`
	)
}

/**
 * Validates that an input is a partial set (`Map` or plain object) and that all
 * its entries contain valid Kleene truth values.
 *
 * @param {unknown} input
 * @param {string} paramName
 * @returns {'map' | 'object'}
 */
function validatePartialSet(input, paramName) {
	if (input instanceof Map) {
		for (const [key, value] of input.entries()) {
			normalizeKleeneValue(value, `${paramName}[${String(key)}]`)
		}
		return 'map'
	}
	if (isPlainObject(input)) {
		const keys = Object.keys(input)
		for (let i = 0; i < keys.length; i++) {
			const key = keys[i]
			normalizeKleeneValue(input[key], `${paramName}.${key}`)
		}
		return 'object'
	}
	throw new TypeError(
		`Expected ${paramName} to be a Map or plain object representing a partial set`
	)
}

/**
 * Computes strong Kleene (K3) conjunction of two normalized truth values.
 *
 * Truth table:
 * - false AND anything -> false
 * - true AND true -> true
 * - otherwise -> 'unknown'
 *
 * @param {KleeneValue} a
 * @param {KleeneValue} b
 * @returns {KleeneValue}
 */
function kleeneAnd(a, b) {
	if (a === false || b === false) {
		return false
	}
	if (a === true && b === true) {
		return true
	}
	return UNKNOWN
}

/**
 * Reads the normalized Kleene membership of `key` from a partial set,
 * falling back to `defaultValue` when the key is absent.
 *
 * @param {PartialSetInput} partialSet
 * @param {'map' | 'object'} kind
 * @param {unknown} key
 * @param {KleeneValue} defaultValue
 * @returns {KleeneValue}
 */
function readMembership(partialSet, kind, key, defaultValue) {
	if (kind === 'map') {
		const map = /** @type {Map<unknown, KleeneInputValue>} */ (partialSet)
		if (!map.has(key)) {
			return defaultValue
		}
		return normalizeKleeneValue(map.get(key), String(key))
	}
	if (typeof key !== 'string') {
		return defaultValue
	}
	const obj = /** @type {Record<string, KleeneInputValue>} */ (partialSet)
	if (!Object.prototype.hasOwnProperty.call(obj, key)) {
		return defaultValue
	}
	return normalizeKleeneValue(obj[key], key)
}

/**
 * Computes the intersection of two partial sets over three-valued strong Kleene
 * logic (K3: `true`, `false`, `'unknown'`) using a straightforward iterative algorithm.
 *
 * Each partial set maps elements to Kleene membership truth values (`true` for definite
 * member, `false` for definite non-member, `'unknown'` or `null` for indeterminate
 * membership). Elements absent from a partial set default to `options.missing`
 * (`'unknown'` under open-world partial set semantics).
 *
 * For each element `x` in the evaluated universe (the union of keys from `left` and
 * `right`, or `options.universe` when supplied), membership in the intersection is:
 * `chi(left ∩ right)(x) = chi(left)(x) ∧_K3 chi(right)(x)`.
 *
 * Returns a plain object when both `left` and `right` are plain objects, and a `Map`
 * when either input is a `Map`. Inputs are never mutated.
 *
 * @param {PartialSetInput} left First partial set (`Map` or plain object).
 * @param {PartialSetInput} right Second partial set (`Map` or plain object).
 * @param {IntersectionKleeneOptions} [options={}] Optional configuration.
 * @returns {Map<unknown, KleeneValue> | Record<string, KleeneValue>} Resulting partial set.
 */
export function intersectionKleeneIterative(left, right, options = {}) {
	const leftKind = validatePartialSet(left, 'left')
	const rightKind = validatePartialSet(right, 'right')

	if (options !== undefined && !isPlainObject(options)) {
		throw new TypeError('Expected options to be a plain object')
	}

	const defaultValue =
		options.missing === undefined
			? UNKNOWN
			: normalizeKleeneValue(options.missing, 'options.missing')

	const hasExplicitUniverse = options.universe !== undefined
	if (hasExplicitUniverse) {
		const u = options.universe
		if (
			u === null ||
			typeof u !== 'object' ||
			typeof u[Symbol.iterator] !== 'function'
		) {
			throw new TypeError('Expected options.universe to be an iterable object')
		}
	}

	const returnObject = leftKind === 'object' && rightKind === 'object'
	const resultMap = returnObject ? null : new Map()
	const resultObj = returnObject ? {} : null
	const seen = new Set()

	/**
	 * Evaluates one element iteratively and writes its Kleene intersection value.
	 *
	 * @param {unknown} key
	 */
	const processKey = (key) => {
		if (seen.has(key)) {
			return
		}
		if (returnObject && typeof key !== 'string') {
			throw new TypeError(
				'Universe elements must be strings when intersecting plain object partial sets'
			)
		}
		seen.add(key)

		const leftVal = readMembership(left, leftKind, key, defaultValue)
		const rightVal = readMembership(right, rightKind, key, defaultValue)
		const combined = kleeneAnd(leftVal, rightVal)

		if (returnObject) {
			Object.defineProperty(
				/** @type {Record<string, KleeneValue>} */ (resultObj),
				/** @type {string} */ (key),
				{
					value: combined,
					enumerable: true,
					writable: true,
					configurable: true,
				}
			)
		} else {
			/** @type {Map<unknown, KleeneValue>} */ (resultMap).set(key, combined)
		}
	}

	if (hasExplicitUniverse) {
		for (const element of /** @type {Iterable<unknown>} */ (options.universe)) {
			processKey(element)
		}
	} else {
		if (leftKind === 'map') {
			for (const key of /** @type {Map<unknown, KleeneInputValue>} */ (left).keys()) {
				processKey(key)
			}
		} else {
			const leftKeys = Object.keys(/** @type {Record<string, KleeneInputValue>} */ (left))
			for (let i = 0; i < leftKeys.length; i++) {
				processKey(leftKeys[i])
			}
		}

		if (rightKind === 'map') {
			for (const key of /** @type {Map<unknown, KleeneInputValue>} */ (right).keys()) {
				processKey(key)
			}
		} else {
			const rightKeys = Object.keys(/** @type {Record<string, KleeneInputValue>} */ (right))
			for (let i = 0; i < rightKeys.length; i++) {
				processKey(rightKeys[i])
			}
		}
	}

	return returnObject
		? /** @type {Record<string, KleeneValue>} */ (resultObj)
		: /** @type {Map<unknown, KleeneValue>} */ (resultMap)
}
