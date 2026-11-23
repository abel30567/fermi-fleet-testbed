/**
 * Three-valued strong Kleene logic (K3) disjunction (`OR`) and partial-set union,
 * implemented iteratively without recursion or external dependencies.
 *
 * Truth values in Kleene logic K3:
 * - `true`  — definitely true
 * - `false` — definitely false
 * - `null`  — unknown / indeterminate
 *
 * Strong Kleene OR truth table (`a OR b`):
 * | a \ b   | true  | null  | false |
 * |---------|-------|-------|-------|
 * | true    | true  | true  | true  |
 * | null    | true  | null  | null  |
 * | false   | true  | null  | false |
 *
 * Supported input forms (all operands must share the same representation):
 * 1. Variadic Kleene truth values: `orKleeneIterative(a, b, ...rest)` -> `boolean | null`
 * 2. Single array of Kleene truth values: `orKleeneIterative([v1, v2, ...])` -> `boolean | null`
 *    (an empty array returns `false`, the identity element of disjunction)
 * 3. Partial sets as `Map<any, boolean | null>`: element-wise Kleene OR (missing keys default to `false`)
 * 4. Partial sets as plain characteristic objects `Record<string, boolean | null>`:
 *    element-wise Kleene OR over own enumerable string keys (missing keys default to `false`)
 * 5. Partial sets as structured pair objects `{ definite?: Set | Array, unknown?: Set | Array }`:
 *    returns `{ definite: Set, unknown: Set }` where `definite` is the union of all definite sets
 *    and `unknown` is the union of all unknown sets minus the resulting definite set.
 *
 * @param {...(boolean | null | Array<boolean | null> | Map<any, boolean | null> | Record<string, boolean | null> | { definite?: Set<any> | Array<any>, unknown?: Set<any> | Array<any> })} operands
 *   One or more Kleene truth values, a single array of Kleene truth values, or one or more partial sets
 *   of the same representation.
 * @returns {boolean | null | Map<any, boolean | null> | Record<string, boolean | null> | { definite: Set<any>, unknown: Set<any> }}
 *   The Kleene disjunction or partial-set union in the same representation as the input.
 * @throws {TypeError} If no operands are provided, operand kinds are mixed, or any value/structure is invalid.
 * @throws {RangeError} If a structured partial set has an element in both `definite` and `unknown`.
 */
export function orKleeneIterative(...operands) {
	if (operands.length === 0) {
		throw new TypeError('orKleeneIterative requires at least one operand')
	}

	const first = operands[0]

	if (isKleeneValue(first)) {
		return foldKleeneValues(operands)
	}

	if (Array.isArray(first)) {
		if (operands.length !== 1) {
			throw new TypeError(
				'When passing an array of Kleene values, pass a single array operand'
			)
		}
		return foldKleeneValues(first)
	}

	if (first instanceof Map) {
		return unionKleeneMaps(operands)
	}

	if (isPlainObject(first)) {
		if (isStructuredPartialSetCandidate(first)) {
			return unionStructuredPartialSets(operands)
		}
		return unionKleeneRecords(operands)
	}

	throw new TypeError(
		'Operands must be Kleene truth values (true, false, null), an array of Kleene values, Maps, plain characteristic objects, or { definite, unknown } partial sets'
	)
}

/**
 * Checks whether a value is a valid Kleene K3 truth value (`true`, `false`, or `null`).
 * @param {unknown} value
 * @returns {boolean}
 */
function isKleeneValue(value) {
	return value === true || value === false || value === null
}

/**
 * Checks whether a value is a plain object (`Object.prototype` or `null` prototype).
 * @param {unknown} value
 * @returns {boolean}
 */
function isPlainObject(value) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return false
	}
	const proto = Object.getPrototypeOf(value)
	return proto === Object.prototype || proto === null
}

/**
 * Combines two validated Kleene truth values using strong Kleene disjunction.
 * @param {boolean | null} a
 * @param {boolean | null} b
 * @returns {boolean | null}
 */
function kleeneOrPair(a, b) {
	if (a === true || b === true) {
		return true
	}
	if (a === null || b === null) {
		return null
	}
	return false
}

/**
 * Iteratively folds strong Kleene OR over an array of Kleene truth values,
 * validating every element.
 * @param {Array<unknown>} values
 * @returns {boolean | null}
 */
function foldKleeneValues(values) {
	let acc = false
	for (let i = 0; i < values.length; i++) {
		const value = values[i]
		if (!isKleeneValue(value)) {
			throw new TypeError(
				`Invalid Kleene truth value at index ${i}: expected true, false, or null`
			)
		}
		acc = kleeneOrPair(acc, value)
	}
	return acc
}

/**
 * Iteratively computes the Kleene OR (partial-set union) across one or more Maps.
 * @param {Array<unknown>} maps
 * @returns {Map<any, boolean | null>}
 */
function unionKleeneMaps(maps) {
	const result = new Map()

	for (let i = 0; i < maps.length; i++) {
		const current = maps[i]
		if (!(current instanceof Map)) {
			throw new TypeError(
				`Operand at index ${i} must be a Map to match the first operand`
			)
		}

		for (const [key, value] of current.entries()) {
			if (!isKleeneValue(value)) {
				throw new TypeError(
					`Invalid Kleene truth value in Map operand ${i} for key "${String(key)}": expected true, false, or null`
				)
			}
			const prev = result.has(key) ? result.get(key) : false
			result.set(key, kleeneOrPair(prev, value))
		}
	}

	return result
}

/**
 * Determines whether a plain object should be interpreted as a structured partial set
 * `{ definite, unknown }` rather than a characteristic object `Record<string, boolean | null>`.
 * @param {Record<string, unknown>} obj
 * @returns {boolean}
 */
function isStructuredPartialSetCandidate(obj) {
	const keys = Object.keys(obj)
	if (keys.length === 0) {
		return false
	}

	let hasStructuredKey = false
	let allKleeneValues = true
	for (let i = 0; i < keys.length; i++) {
		const key = keys[i]
		if (key === 'definite' || key === 'unknown') {
			hasStructuredKey = true
		} else {
			return false
		}
		if (!isKleeneValue(obj[key])) {
			allKleeneValues = false
		}
	}

	return hasStructuredKey && !allKleeneValues
}

/**
 * Iteratively computes the Kleene OR (partial-set union) across one or more
 * plain characteristic objects `Record<string, boolean | null>`.
 * @param {Array<unknown>} records
 * @returns {Record<string, boolean | null>}
 */
function unionKleeneRecords(records) {
	const result = {}

	for (let i = 0; i < records.length; i++) {
		const current = records[i]
		if (!isPlainObject(current) || isStructuredPartialSetCandidate(current)) {
			throw new TypeError(
				`Operand at index ${i} must be a plain characteristic object to match the first operand`
			)
		}

		const keys = Object.keys(current)
		for (let j = 0; j < keys.length; j++) {
			const key = keys[j]
			const value = current[key]
			if (!isKleeneValue(value)) {
				throw new TypeError(
					`Invalid Kleene truth value in object operand ${i} at key "${key}": expected true, false, or null`
				)
			}
			const prev = Object.prototype.hasOwnProperty.call(result, key)
				? result[key]
				: false
			const next = kleeneOrPair(prev, value)
			Object.defineProperty(result, key, {
				value: next,
				enumerable: true,
				writable: true,
				configurable: true,
			})
		}
	}

	return result
}

/**
 * Validates and extracts an element collection (`Set` or `Array`) for a structured partial set field.
 * @param {unknown} collection
 * @param {string} fieldName
 * @param {number} operandIndex
 * @returns {Set<any> | Array<any>}
 */
function validatePartialSetField(collection, fieldName, operandIndex) {
	if (collection === undefined) {
		return []
	}
	if (collection instanceof Set || Array.isArray(collection)) {
		return collection
	}
	throw new TypeError(
		`Structured partial set operand ${operandIndex} field "${fieldName}" must be a Set or Array`
	)
}

/**
 * Iteratively computes the partial-set union across one or more structured partial sets
 * `{ definite?: Set | Array, unknown?: Set | Array }`.
 * @param {Array<unknown>} sets
 * @returns {{ definite: Set<any>, unknown: Set<any> }}
 */
function unionStructuredPartialSets(sets) {
	const definiteOut = new Set()
	const unknownOut = new Set()

	for (let i = 0; i < sets.length; i++) {
		const current = sets[i]
		if (!isPlainObject(current)) {
			throw new TypeError(
				`Operand at index ${i} must be a structured partial set object { definite, unknown }`
			)
		}

		const keys = Object.keys(current)
		if (keys.length === 0) {
			throw new TypeError(
				`Operand at index ${i} must define at least "definite" or "unknown"`
			)
		}
		for (let k = 0; k < keys.length; k++) {
			const key = keys[k]
			if (key !== 'definite' && key !== 'unknown') {
				throw new TypeError(
					`Unexpected property "${key}" in structured partial set operand ${i}`
				)
			}
		}

		const defItems = validatePartialSetField(current.definite, 'definite', i)
		const unkItems = validatePartialSetField(current.unknown, 'unknown', i)

		const localDefinite = new Set()
		for (const item of defItems) {
			localDefinite.add(item)
			definiteOut.add(item)
			unknownOut.delete(item)
		}

		for (const item of unkItems) {
			if (localDefinite.has(item)) {
				throw new RangeError(
					`Contradictory partial set at operand ${i}: element "${String(item)}" appears in both definite and unknown`
				)
			}
			if (!definiteOut.has(item)) {
				unknownOut.add(item)
			}
		}
	}

	return { definite: definiteOut, unknown: unknownOut }
}
