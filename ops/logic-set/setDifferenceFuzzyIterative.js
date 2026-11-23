/**
 * Checks whether a value is a plain object (created via `{}` or `Object.create(null)`).
 *
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
 * Validates that a membership degree is a finite number in the closed interval [0, 1].
 *
 * @param {unknown} degree - Candidate membership degree.
 * @param {string} setName - Name of the parameter for diagnostics.
 * @param {unknown} key - Element key associated with the membership degree.
 * @returns {number} Normalized membership degree (converts `-0` to `0`).
 * @throws {TypeError} If `degree` is not a number.
 * @throws {RangeError} If `degree` is non-finite or outside `[0, 1]`.
 */
function validateDegree(degree, setName, key) {
	if (typeof degree !== 'number') {
		throw new TypeError(
			`${setName}[${String(key)}] must be a number in [0, 1], received ${typeof degree}`,
		)
	}
	if (!Number.isFinite(degree) || degree < 0 || degree > 1) {
		throw new RangeError(
			`${setName}[${String(key)}] must be a finite number in [0, 1], received ${degree}`,
		)
	}
	return degree === 0 ? 0 : degree
}

/**
 * Computes the Zadeh fuzzy set difference `A \ B` using a straightforward iterative algorithm.
 *
 * Under Zadeh fuzzy logic operators, the membership degree of each element `x` in `A \ B` is
 * defined via intersection with the Zadeh complement of `B`:
 *
 *   μ_(A \ B)(x) = min(μ_A(x), 1 - μ_B(x))
 *
 * Elements absent from a fuzzy set have an implicit membership degree of `0`. By default,
 * entries whose resulting membership degree is `0` are omitted from the returned support;
 * pass `{ keepZeros: true }` to retain keys present in `setA` with a resulting degree of `0`.
 *
 * Both `setA` and `setB` must either both be plain objects (`Record<string, number>`) or both
 * be `Map<K, number>` instances, with all membership degrees in `[0, 1]`. Inputs are not mutated.
 *
 * @template {Record<string, number> | Map<any, number>} T
 * @param {T} setA - Minuend fuzzy set with membership degrees in `[0, 1]`.
 * @param {T} setB - Subtrahend fuzzy set with membership degrees in `[0, 1]`.
 * @param {{ keepZeros?: boolean }} [options] - Optional configuration.
 * @param {boolean} [options.keepZeros=false] - Whether to keep keys from `setA` whose resulting degree is `0`.
 * @returns {T} A new fuzzy set of the same container type as the inputs representing `setA \ setB`.
 * @throws {TypeError} If inputs are not matching plain objects or Maps, options are invalid, or any degree is not a number.
 * @throws {RangeError} If any membership degree in `setA` or `setB` is non-finite or outside `[0, 1]`.
 */
export function setDifferenceFuzzyIterative(setA, setB, options = {}) {
	if (!isPlainObject(options)) {
		throw new TypeError('options must be a plain object when provided')
	}
	const { keepZeros = false } = options
	if (typeof keepZeros !== 'boolean') {
		throw new TypeError('options.keepZeros must be a boolean')
	}

	const aIsMap = setA instanceof Map
	const bIsMap = setB instanceof Map
	const aIsObj = isPlainObject(setA)
	const bIsObj = isPlainObject(setB)

	if (aIsMap && bIsMap) {
		for (const [key, muB] of setB) {
			validateDegree(muB, 'setB', key)
		}

		const result = new Map()
		for (const [key, rawMuA] of setA) {
			const muA = validateDegree(rawMuA, 'setA', key)
			const muB = setB.has(key) ? setB.get(key) : 0
			const diff = Math.min(muA, 1 - muB)
			const normalized = diff === 0 ? 0 : diff
			if (normalized > 0 || keepZeros) {
				result.set(key, normalized)
			}
		}
		return /** @type {T} */ (result)
	}

	if (aIsObj && bIsObj) {
		const keysB = Object.keys(setB)
		for (let i = 0; i < keysB.length; i++) {
			const key = keysB[i]
			validateDegree(setB[key], 'setB', key)
		}

		const result = {}
		const keysA = Object.keys(setA)
		for (let i = 0; i < keysA.length; i++) {
			const key = keysA[i]
			const muA = validateDegree(setA[key], 'setA', key)
			const muB = Object.hasOwn(setB, key) ? setB[key] : 0
			const diff = Math.min(muA, 1 - muB)
			const normalized = diff === 0 ? 0 : diff
			if (normalized > 0 || keepZeros) {
				Object.defineProperty(result, key, {
					value: normalized,
					enumerable: true,
					writable: true,
					configurable: true,
				})
			}
		}
		return /** @type {T} */ (result)
	}

	if (!aIsMap && !aIsObj) {
		throw new TypeError('setA must be a plain object or a Map')
	}
	if (!bIsMap && !bIsObj) {
		throw new TypeError('setB must be a plain object or a Map')
	}
	throw new TypeError('setA and setB must both be plain objects or both be Maps')
}
