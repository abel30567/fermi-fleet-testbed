/**
 * Three-valued Kleene logic (K3) truth value:
 * - `true`: definitely true
 * - `false`: definitely false
 * - `null`: unknown
 *
 * @typedef {boolean | null} KleeneValue
 */

/**
 * A partial set represented as disjoint sets of definitely-included and
 * definitely-excluded elements; all other elements have unknown membership.
 *
 * @typedef {{ included: Set<any> | Array<any>, excluded: Set<any> | Array<any> }} StructuredPartialSet
 */

/**
 * A partial set represented as a Map from elements to Kleene truth values.
 * Missing keys have unknown (`null`) membership.
 *
 * @typedef {Map<any, KleeneValue>} MapPartialSet
 */

/**
 * A partial set represented as a plain object mapping string keys to Kleene
 * truth values. Missing keys have unknown (`null`) membership.
 *
 * @typedef {Record<string, KleeneValue>} RecordPartialSet
 */

/**
 * Canonical Kleene unknown truth value.
 * @type {null}
 */
export const UNKNOWN = null

/**
 * Check whether a value is a valid Kleene truth value (`true`, `false`, or `null`).
 *
 * @param {unknown} value
 * @returns {value is KleeneValue}
 */
function isKleeneValue(value) {
	return value === true || value === false || value === null
}

/**
 * Check whether a value is a plain object (literal or null-prototype object).
 *
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainObject(value) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		return false
	}
	const proto = Object.getPrototypeOf(value)
	return proto === Object.prototype || proto === null
}

/**
 * Check whether a value is a supported collection for structured partial sets.
 *
 * @param {unknown} value
 * @returns {value is Set<any> | Array<any>}
 */
function isSetOrArray(value) {
	return value instanceof Set || Array.isArray(value)
}

/**
 * Determine whether a plain object should be interpreted as a structured partial set
 * (`{ included, excluded }`) rather than a characteristic record.
 *
 * @param {Record<string, unknown>} obj
 * @returns {boolean}
 */
function isStructuredPartialSetCandidate(obj) {
	const keys = Object.keys(obj)
	if (keys.length !== 2) {
		return false
	}
	if (
		!Object.prototype.hasOwnProperty.call(obj, 'included') ||
		!Object.prototype.hasOwnProperty.call(obj, 'excluded')
	) {
		return false
	}
	return isSetOrArray(obj.included) || isSetOrArray(obj.excluded)
}

/**
 * Classify a single operand into one of the four supported Kleene operand kinds.
 *
 * @param {unknown} operand
 * @param {number} index
 * @returns {'scalar' | 'map' | 'structured' | 'record'}
 */
function classifyOperand(operand, index) {
	if (isKleeneValue(operand)) {
		return 'scalar'
	}
	if (operand instanceof Map) {
		return 'map'
	}
	if (isPlainObject(operand)) {
		return isStructuredPartialSetCandidate(operand) ? 'structured' : 'record'
	}
	throw new TypeError(
		`Invalid operand at index ${index}: expected a Kleene value (true, false, or null) or a partial set (Map, plain object, or { included, excluded })`,
	)
}

/**
 * Iteratively compute the Kleene K3 XOR of an array of scalar truth values.
 *
 * Truth table (strong Kleene K3):
 * - `true XOR false = true`, `false XOR true = true`
 * - `true XOR true = false`, `false XOR false = false`
 * - Any operation involving `null` (unknown) yields `null` (unknown)
 *
 * All elements are validated iteratively even if an earlier element is `null`.
 *
 * @param {KleeneValue[]} values
 * @returns {KleeneValue}
 */
function xorKleeneScalarsIterative(values) {
	let parity = false
	let hasUnknown = false

	for (let i = 0; i < values.length; i++) {
		const value = values[i]
		if (!isKleeneValue(value)) {
			throw new TypeError(
				`Invalid Kleene truth value at index ${i}: expected true, false, or null`,
			)
		}
		if (value === null) {
			hasUnknown = true
		} else if (!hasUnknown) {
			parity = parity !== value
		}
	}

	return hasUnknown ? null : parity
}

/**
 * Iteratively compute the Kleene K3 XOR (symmetric difference) of Map partial sets.
 *
 * @param {MapPartialSet[]} maps
 * @returns {MapPartialSet}
 */
function xorMapPartialSetsIterative(maps) {
	const allKeys = new Set()

	for (let i = 0; i < maps.length; i++) {
		const map = maps[i]
		if (!(map instanceof Map)) {
			throw new TypeError(
				`Operand at index ${i} must be a Map partial set to match the first operand`,
			)
		}
		for (const [key, value] of map.entries()) {
			if (!isKleeneValue(value)) {
				throw new TypeError(
					`Invalid Kleene truth value for key ${String(key)} in Map at index ${i}: expected true, false, or null`,
				)
			}
			allKeys.add(key)
		}
	}

	const result = new Map()
	for (const key of allKeys) {
		let parity = false
		let hasUnknown = false

		for (let i = 0; i < maps.length; i++) {
			const map = maps[i]
			const value = map.has(key) ? map.get(key) : null
			if (value === null) {
				hasUnknown = true
				break
			}
			parity = parity !== value
		}

		result.set(key, hasUnknown ? null : parity)
	}

	return result
}

/**
 * Iteratively compute the Kleene K3 XOR (symmetric difference) of plain-object partial sets.
 *
 * @param {RecordPartialSet[]} records
 * @returns {RecordPartialSet}
 */
function xorRecordPartialSetsIterative(records) {
	const allKeys = new Set()

	for (let i = 0; i < records.length; i++) {
		const record = records[i]
		if (!isPlainObject(record) || isStructuredPartialSetCandidate(record)) {
			throw new TypeError(
				`Operand at index ${i} must be a plain-object partial set to match the first operand`,
			)
		}
		const keys = Object.keys(record)
		for (let j = 0; j < keys.length; j++) {
			const key = keys[j]
			const value = record[key]
			if (!isKleeneValue(value)) {
				throw new TypeError(
					`Invalid Kleene truth value for key "${key}" in object at index ${i}: expected true, false, or null`,
				)
			}
			allKeys.add(key)
		}
	}

	const result = {}
	for (const key of allKeys) {
		let parity = false
		let hasUnknown = false

		for (let i = 0; i < records.length; i++) {
			const record = records[i]
			const value = Object.prototype.hasOwnProperty.call(record, key)
				? record[key]
				: null
			if (value === null) {
				hasUnknown = true
				break
			}
			parity = parity !== value
		}

		const finalValue = hasUnknown ? null : parity
		if (key === '__proto__') {
			Object.defineProperty(result, key, {
				value: finalValue,
				enumerable: true,
				writable: true,
				configurable: true,
			})
		} else {
			result[key] = finalValue
		}
	}

	return result
}

/**
 * Validate and normalize a structured partial set into disjoint `included` and `excluded` Sets.
 *
 * @param {unknown} candidate
 * @param {number} index
 * @returns {{ included: Set<any>, excluded: Set<any> }}
 */
function normalizeStructuredPartialSet(candidate, index) {
	if (!isPlainObject(candidate) || !isStructuredPartialSetCandidate(candidate)) {
		throw new TypeError(
			`Operand at index ${index} must be a structured partial set ({ included, excluded }) to match the first operand`,
		)
	}
	if (!isSetOrArray(candidate.included) || !isSetOrArray(candidate.excluded)) {
		throw new TypeError(
			`Structured partial set at index ${index} must have Set or Array values for both "included" and "excluded"`,
		)
	}

	const included = new Set()
	for (const item of candidate.included) {
		included.add(item)
	}

	const excluded = new Set()
	for (const item of candidate.excluded) {
		if (included.has(item)) {
			throw new RangeError(
				`Structured partial set at index ${index} contains element ${String(item)} in both "included" and "excluded"`,
			)
		}
		excluded.add(item)
	}

	return { included, excluded }
}

/**
 * Iteratively compute the Kleene K3 XOR (symmetric difference) of structured partial sets.
 *
 * @param {StructuredPartialSet[]} sets
 * @returns {{ included: Set<any>, excluded: Set<any> }}
 */
function xorStructuredPartialSetsIterative(sets) {
	let acc = normalizeStructuredPartialSet(sets[0], 0)

	for (let i = 1; i < sets.length; i++) {
		const next = normalizeStructuredPartialSet(sets[i], i)
		const nextIncluded = new Set()
		const nextExcluded = new Set()

		for (const item of acc.included) {
			if (next.excluded.has(item)) {
				nextIncluded.add(item)
			} else if (next.included.has(item)) {
				nextExcluded.add(item)
			}
		}

		for (const item of acc.excluded) {
			if (next.included.has(item)) {
				nextIncluded.add(item)
			} else if (next.excluded.has(item)) {
				nextExcluded.add(item)
			}
		}

		acc = { included: nextIncluded, excluded: nextExcluded }
	}

	return acc
}

/**
 * Compute XOR (exclusive disjunction / symmetric difference) over three-valued
 * Strong Kleene logic (`true`, `false`, `null` for unknown) and partial sets,
 * using a straightforward iterative implementation.
 *
 * Supported call forms:
 * - Scalar Kleene values: `xorKleeneIterative(a, b, ...)` or `xorKleeneIterative([a, b, ...])`
 *   where each value is `true`, `false`, or `null` (unknown). An empty array `[]`
 *   returns the XOR identity `false`.
 * - Map partial sets: `xorKleeneIterative(mapA, mapB, ...)` or `xorKleeneIterative([mapA, mapB, ...])`
 *   where each `Map` maps elements to `true | false | null` (absent keys are treated as `null`).
 * - Plain-object partial sets: `xorKleeneIterative(objA, objB, ...)` or `xorKleeneIterative([objA, objB, ...])`
 *   where each plain object maps string keys to `true | false | null` (absent keys are treated as `null`).
 * - Structured partial sets: `xorKleeneIterative(psA, psB, ...)` or `xorKleeneIterative([psA, psB, ...])`
 *   where each operand is `{ included: Set | Array, excluded: Set | Array }` with disjoint
 *   included/excluded members (elements in neither are treated as unknown).
 *
 * All operands in a call must share the same representation kind.
 *
 * @param {...(KleeneValue | MapPartialSet | RecordPartialSet | StructuredPartialSet | Array<KleeneValue | MapPartialSet | RecordPartialSet | StructuredPartialSet>)} args
 * @returns {KleeneValue | MapPartialSet | RecordPartialSet | { included: Set<any>, excluded: Set<any> }}
 * @throws {TypeError} If called with no operands, invalid types, or mismatched operand kinds.
 * @throws {RangeError} If a structured partial set contains overlapping `included` and `excluded` elements.
 */
export function xorKleeneIterative(...args) {
	if (args.length === 0) {
		throw new TypeError('xorKleeneIterative requires at least one operand')
	}

	let operands
	if (args.length === 1 && Array.isArray(args[0])) {
		operands = args[0]
		if (operands.length === 0) {
			return false
		}
	} else {
		operands = args
	}

	const kind = classifyOperand(operands[0], 0)

	if (kind === 'scalar') {
		return xorKleeneScalarsIterative(operands)
	}
	if (kind === 'map') {
		return xorMapPartialSetsIterative(operands)
	}
	if (kind === 'structured') {
		return xorStructuredPartialSetsIterative(operands)
	}
	return xorRecordPartialSetsIterative(operands)
}
