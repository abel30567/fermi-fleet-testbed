/**
 * @typedef {boolean | null | 'unknown'} KleeneValue
 * A three-valued Kleene (K3) truth value:
 * - `true`: definitely true
 * - `false`: definitely false
 * - `null` or `'unknown'`: unknown / indeterminate
 */

/**
 * @typedef {{ included: Set<any>, excluded: Set<any> }} PartialSetPair
 * A partial set represented as disjoint positive (`included`) and negative
 * (`excluded`) extensions. Elements absent from both sets have unknown membership.
 */

/**
 * Negates a single Kleene (K3) truth value.
 *
 * @param {unknown} value - Candidate Kleene truth value.
 * @param {string} [context] - Optional description of where the value appeared for error messages.
 * @returns {KleeneValue} Negated Kleene truth value.
 * @throws {TypeError} If `value` is not `true`, `false`, `null`, or `'unknown'`.
 */
function negateScalar(value, context = 'input') {
	if (value === true) {
		return false
	}
	if (value === false) {
		return true
	}
	if (value === null || value === 'unknown') {
		return value
	}
	throw new TypeError(
		`Invalid Kleene truth value at ${context}: expected true, false, null, or "unknown", received ${describeValue(value)}`
	)
}

/**
 * Formats a value concisely for validation error messages.
 *
 * @param {unknown} value
 * @returns {string}
 */
function describeValue(value) {
	if (value === undefined) {
		return 'undefined'
	}
	if (typeof value === 'string') {
		return JSON.stringify(value)
	}
	if (typeof value === 'symbol') {
		return value.toString()
	}
	if (typeof value === 'object' && value !== null) {
		const name = value.constructor && value.constructor.name
		return name ? `[object ${name}]` : '[object Object]'
	}
	return String(value)
}

/**
 * Returns true if `value` is a plain object (Object.prototype or null prototype).
 *
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainObject(value) {
	if (typeof value !== 'object' || value === null) {
		return false
	}
	const proto = Object.getPrototypeOf(value)
	return proto === Object.prototype || proto === null
}

/**
 * Checks whether a plain object uses the `{ included: Set, excluded: Set }` partial-set representation.
 *
 * @param {Record<string, unknown>} obj
 * @param {string[]} keys
 * @returns {boolean}
 */
function isPartialSetPair(obj, keys) {
	if (keys.length !== 2) {
		return false
	}
	return (
		Object.prototype.hasOwnProperty.call(obj, 'included') &&
		Object.prototype.hasOwnProperty.call(obj, 'excluded') &&
		obj.included instanceof Set &&
		obj.excluded instanceof Set
	)
}

/**
 * Computes the logical NOT (complement) over three-valued strong Kleene logic (K3)
 * and partial sets using a straightforward iterative implementation.
 *
 * Supported input forms:
 * 1. **Kleene truth value** (`true | false | null | 'unknown'`):
 *    - `not(true) = false`
 *    - `not(false) = true`
 *    - `not(null) = null`
 *    - `not('unknown') = 'unknown'`
 * 2. **Characteristic array** (`KleeneValue[]`):
 *    - Returns a new array with each element negated iteratively.
 * 3. **Characteristic Map** (`Map<K, KleeneValue>`):
 *    - Returns a new `Map` preserving key order with each membership value negated iteratively.
 * 4. **Characteristic plain object** (`Record<string, KleeneValue>`):
 *    - Returns a new plain object (preserving `null` prototype if present) with each own
 *      enumerable property's membership value negated iteratively.
 * 5. **Disjoint partial-set pair** (`{ included: Set<T>, excluded: Set<T> }`):
 *    - Validates that `included` and `excluded` are disjoint (K3 consistency) and returns
 *      a new `{ included, excluded }` pair with the positive and negative extensions swapped
 *      iteratively (`not(S+, S-) = (S-, S+)`).
 *
 * Inputs are never mutated.
 *
 * @template T
 * @param {KleeneValue | KleeneValue[] | Map<T, KleeneValue> | Record<string, KleeneValue> | PartialSetPair} input
 *   A Kleene truth value or a partial set representation.
 * @returns {KleeneValue | KleeneValue[] | Map<T, KleeneValue> | Record<string, KleeneValue> | PartialSetPair}
 *   The Kleene negation / partial-set complement in the same representation as `input`.
 * @throws {TypeError} If `input` is not a supported Kleene value or partial set, contains invalid
 *   Kleene truth values, or is a sparse array.
 * @throws {RangeError} If a `{ included, excluded }` partial-set pair contains any element in both sets.
 */
export function notKleeneIterative(input) {
	if (
		input === true ||
		input === false ||
		input === null ||
		input === 'unknown'
	) {
		return negateScalar(input)
	}

	if (Array.isArray(input)) {
		const length = input.length
		const result = new Array(length)
		for (let i = 0; i < length; i++) {
			if (!(i in input)) {
				throw new TypeError(
					`Invalid Kleene array: sparse hole at index ${i}`
				)
			}
			result[i] = negateScalar(input[i], `index ${i}`)
		}
		return result
	}

	if (input instanceof Map) {
		const result = new Map()
		for (const [key, value] of input.entries()) {
			result.set(key, negateScalar(value, `map key ${describeValue(key)}`))
		}
		return result
	}

	if (isPlainObject(input)) {
		const keys = Object.keys(input)

		if (isPartialSetPair(input, keys)) {
			const nextIncluded = new Set()
			const nextExcluded = new Set()

			for (const item of input.included) {
				if (input.excluded.has(item)) {
					throw new RangeError(
						`Inconsistent partial set: element ${describeValue(item)} appears in both included and excluded sets`
					)
				}
				nextExcluded.add(item)
			}

			for (const item of input.excluded) {
				nextIncluded.add(item)
			}

			return {
				included: nextIncluded,
				excluded: nextExcluded
			}
		}

		const result = Object.getPrototypeOf(input) === null ? Object.create(null) : {}
		for (let i = 0; i < keys.length; i++) {
			const key = keys[i]
			const negated = negateScalar(input[key], `property ${JSON.stringify(key)}`)
			Object.defineProperty(result, key, {
				value: negated,
				writable: true,
				enumerable: true,
				configurable: true
			})
		}
		return result
	}

	throw new TypeError(
		`Invalid input for notKleeneIterative: expected a Kleene truth value (true, false, null, "unknown") or a partial set (Array, Map, plain object, or { included: Set, excluded: Set }), received ${describeValue(input)}`
	)
}
