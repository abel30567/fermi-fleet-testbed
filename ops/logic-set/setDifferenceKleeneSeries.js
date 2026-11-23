/**
 * @typedef {boolean | 'unknown'} KleeneValue
 * Three-valued strong Kleene (K3) truth value:
 * - `true`: certainly a member
 * - `false`: certainly not a member
 * - `'unknown'`: membership is undetermined
 */

/**
 * @typedef {Record<string, KleeneValue>} PartialSetObject
 * @typedef {Map<unknown, KleeneValue>} PartialSetMap
 * @typedef {PartialSetObject | PartialSetMap} PartialSet
 */

/**
 * @typedef {object} SetDifferenceKleeneOptions
 * @property {KleeneValue} [defaultValue='unknown']
 *   Membership value assigned to elements absent from a partial set.
 *   Defaults to `'unknown'` (open-world partial-set semantics).
 *   Pass `false` for closed-world semantics.
 * @property {Iterable<unknown>} [universe]
 *   Optional explicit universe of elements to evaluate in addition to
 *   the keys present in `setA` and `setB`.
 */

const UNKNOWN = 'unknown'

/**
 * Checks whether a value is a plain JavaScript object (either `Object.prototype`
 * or `null` prototype).
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
 * Encodes a strong Kleene truth value into balanced ternary `{-1, 0, 1}`.
 *
 * @param {unknown} value
 * @param {string} context
 * @returns {-1 | 0 | 1}
 */
function encodeKleene(value, context) {
	if (value === true) return 1
	if (value === false) return -1
	if (value === UNKNOWN) return 0
	throw new TypeError(
		`Invalid Kleene truth value at ${context}: expected true, false, or 'unknown', got ${formatValue(value)}`,
	)
}

/**
 * Decodes a balanced ternary value `{-1, 0, 1}` back to a Kleene truth value.
 *
 * @param {-1 | 0 | 1} code
 * @returns {KleeneValue}
 */
function decodeKleene(code) {
	if (code === 1) return true
	if (code === -1) return false
	return UNKNOWN
}

/**
 * Formats an arbitrary value safely for diagnostic error messages.
 *
 * @param {unknown} value
 * @returns {string}
 */
function formatValue(value) {
	if (typeof value === 'string') return JSON.stringify(value)
	if (typeof value === 'symbol') return value.toString()
	return String(value)
}

/**
 * Evaluates strong Kleene (K3) set difference `a ∧ ¬b` in balanced ternary
 * `u, v ∈ {-1, 0, 1}` using its exact bivariate polynomial / falling-factorial
 * series identity:
 *
 *   g(u, v) = Σ_{i=0}^{2} Σ_{j=0}^{2} c_{i,j} u^i v^j
 *           = (u - v - u² - v² - u·v + u²·v²) / 2
 *           = -C(u, 2) - C(v + 1, 2) + C(u·v, 2)
 *
 * Because `u³ = u` and `v³ = v` on `{-1, 0, 1}`, this degree-(2, 2) series is
 * the unique exact algebraic closed form of `min(u, -v)` over all 9 K3 pairs,
 * using purely exact integer arithmetic (every numerator is even in `{-2, 0, 2}`).
 *
 * @param {-1 | 0 | 1} u - Encoded membership in set A
 * @param {-1 | 0 | 1} v - Encoded membership in set B
 * @returns {-1 | 0 | 1}
 */
function kleeneDifferenceBalancedSeries(u, v) {
	const uv = u * v
	const termA = (u * (u - 1)) / 2 // C(u, 2)
	const termB = ((v + 1) * v) / 2 // C(v + 1, 2)
	const termAB = (uv * (uv - 1)) / 2 // C(u * v, 2)
	const result = -termA - termB + termAB
	return /** @type {-1 | 0 | 1} */ (result === 0 ? 0 : result)
}

/**
 * Validates and encodes a plain-object partial set into a key -> ternary Map.
 *
 * @param {Record<string, unknown>} obj
 * @param {string} name
 * @returns {Map<string, -1 | 0 | 1>}
 */
function validatePlainPartialSet(obj, name) {
	const encoded = new Map()
	for (const key of Object.keys(obj)) {
		encoded.set(key, encodeKleene(obj[key], `${name}[${JSON.stringify(key)}]`))
	}
	return encoded
}

/**
 * Validates and encodes a Map partial set into a key -> ternary Map.
 *
 * @param {Map<unknown, unknown>} map
 * @param {string} name
 * @returns {Map<unknown, -1 | 0 | 1>}
 */
function validateMapPartialSet(map, name) {
	const encoded = new Map()
	for (const [key, value] of map.entries()) {
		encoded.set(key, encodeKleene(value, `${name}.get(${formatValue(key)})`))
	}
	return encoded
}

/**
 * Computes the partial-set difference `A \ B` (`x ∈ A ∧ ¬(x ∈ B)`) under
 * three-valued strong Kleene logic (K3) using an exact closed-form bivariate
 * falling-factorial series over balanced ternary `{-1, 0, 1}`:
 *
 * ```
 *   g(u, v) = -C(u, 2) - C(v + 1, 2) + C(u·v, 2)
 *           = (u - v - u² - v² - u·v + u²·v²) / 2
 * ```
 *
 * where `false ↦ -1`, `'unknown' ↦ 0`, and `true ↦ +1`.
 *
 * Both `setA` and `setB` must be either plain objects (`Record<string, KleeneValue>`)
 * or both `Map<unknown, KleeneValue>` instances; the return value matches their
 * container type. Inputs are never mutated.
 *
 * @param {PartialSet} setA - Minuend partial set (`A`)
 * @param {PartialSet} setB - Subtrahend partial set (`B`)
 * @param {SetDifferenceKleeneOptions} [options] - Optional configuration
 * @returns {PartialSet} Partial set representing `A \ B` in strong Kleene K3 logic
 * @throws {TypeError} If inputs, container types, truth values, or options are invalid
 */
export function setDifferenceKleeneSeries(setA, setB, options = {}) {
	const aIsMap = setA instanceof Map
	const bIsMap = setB instanceof Map
	const aIsPlain = isPlainObject(setA)
	const bIsPlain = isPlainObject(setB)

	if (!aIsMap && !aIsPlain) {
		throw new TypeError(
			`Expected setA to be a plain object or Map, got ${formatValue(setA)}`,
		)
	}
	if (!bIsMap && !bIsPlain) {
		throw new TypeError(
			`Expected setB to be a plain object or Map, got ${formatValue(setB)}`,
		)
	}
	if (aIsMap !== bIsMap) {
		throw new TypeError(
			'Expected setA and setB to use the same container type (both plain objects or both Maps)',
		)
	}
	if (options !== undefined && !isPlainObject(options)) {
		throw new TypeError(
			`Expected options to be a plain object, got ${formatValue(options)}`,
		)
	}

	const defaultCode =
		options.defaultValue === undefined
			? 0
			: encodeKleene(options.defaultValue, 'options.defaultValue')

	let extraKeys = null
	if (options.universe !== undefined) {
		if (
			typeof options.universe === 'string' ||
			options.universe === null ||
			typeof options.universe !== 'object' ||
			typeof options.universe[Symbol.iterator] !== 'function'
		) {
			throw new TypeError(
				`Expected options.universe to be a non-string iterable, got ${formatValue(options.universe)}`,
			)
		}
		extraKeys = []
		for (const key of options.universe) {
			if (aIsPlain && typeof key !== 'string') {
				throw new TypeError(
					`Expected string keys in options.universe for plain-object partial sets, got ${formatValue(key)}`,
				)
			}
			extraKeys.push(key)
		}
	}

	const encodedA = aIsMap
		? validateMapPartialSet(setA, 'setA')
		: validatePlainPartialSet(setA, 'setA')
	const encodedB = bIsMap
		? validateMapPartialSet(setB, 'setB')
		: validatePlainPartialSet(setB, 'setB')

	const domain = new Set()
	for (const key of encodedA.keys()) domain.add(key)
	for (const key of encodedB.keys()) domain.add(key)
	if (extraKeys !== null) {
		for (const key of extraKeys) domain.add(key)
	}

	if (aIsMap) {
		const result = new Map()
		for (const key of domain) {
			const u = encodedA.has(key) ? encodedA.get(key) : defaultCode
			const v = encodedB.has(key) ? encodedB.get(key) : defaultCode
			result.set(key, decodeKleene(kleeneDifferenceBalancedSeries(u, v)))
		}
		return result
	}

	const result = {}
	for (const key of domain) {
		const u = encodedA.has(key) ? encodedA.get(key) : defaultCode
		const v = encodedB.has(key) ? encodedB.get(key) : defaultCode
		const value = decodeKleene(kleeneDifferenceBalancedSeries(u, v))
		Object.defineProperty(result, key, {
			value,
			enumerable: true,
			writable: true,
			configurable: true,
		})
	}
	return result
}
