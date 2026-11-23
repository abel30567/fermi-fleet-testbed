/**
 * Checks whether a value is a plain object (created via `{}` or `Object.create(null)`).
 *
 * @param {unknown} value - Value to inspect.
 * @returns {boolean} True if `value` is a plain object.
 */
function isPlainObject(value) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return false
	}
	const proto = Object.getPrototypeOf(value)
	return proto === Object.prototype || proto === null
}

/**
 * Validates a single fuzzy membership value in [0, 1].
 *
 * @param {unknown} value - Membership degree to validate.
 * @param {unknown} key - Element key (used in error messages).
 * @param {string} label - Parameter label (`a` or `b`).
 */
function validateMembership(value, key, label) {
	if (typeof value !== 'number') {
		throw new TypeError(
			`Expected finite number membership in [0, 1] for ${label}[${String(key)}], received ${typeof value}`,
		)
	}
	if (!Number.isFinite(value) || value < 0 || value > 1) {
		throw new RangeError(
			`Expected membership in [0, 1] for ${label}[${String(key)}], received ${value}`,
		)
	}
}

/**
 * Recursively validates a slice of `[key, value]` entries using divide-and-conquer.
 *
 * @param {Array<[unknown, unknown]>} entries - Entry array to validate.
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 * @param {string} label - Parameter label (`a` or `b`).
 */
function validateEntriesDivideAndConquer(entries, start, end, label) {
	if (start >= end) {
		return
	}
	if (end - start === 1) {
		const [key, value] = entries[start]
		validateMembership(value, key, label)
		return
	}
	const mid = start + Math.floor((end - start) / 2)
	validateEntriesDivideAndConquer(entries, start, mid, label)
	validateEntriesDivideAndConquer(entries, mid, end, label)
}

/**
 * Defines an own enumerable property on a plain object safely (including `__proto__`).
 *
 * @param {Record<string, number>} target - Target plain object.
 * @param {string} key - Property key.
 * @param {number} value - Property value.
 */
function setOwnProperty(target, key, value) {
	Object.defineProperty(target, key, {
		value,
		writable: true,
		enumerable: true,
		configurable: true,
	})
}

/**
 * Computes the Zadeh fuzzy set difference `A \ B` for a single element.
 *
 * Using Zadeh operators:
 * - Complement: `μ_{¬B}(x) = 1 - μ_B(x)`
 * - Intersection: `μ_{A ∩ ¬B}(x) = min(μ_A(x), 1 - μ_B(x))`
 *
 * @param {number} muA - Membership degree in A (in [0, 1]).
 * @param {number} muB - Membership degree in B (in [0, 1]).
 * @returns {number} Resulting membership degree in [0, 1] (with -0 normalized to 0).
 */
function zadehDifferenceValue(muA, muB) {
	const value = Math.min(muA, 1 - muB)
	return value === 0 ? 0 : value
}

/**
 * Computes the fuzzy set difference `A \ B` over fuzzy sets with membership degrees
 * in `[0, 1]` using Zadeh operators (`μ_{A \ B}(x) = min(μ_A(x), 1 - μ_B(x))`) and
 * a recursive divide-and-conquer implementation (`O(log n)` stack depth).
 *
 * Accepts either two plain objects (`Record<string, number>`) or two `Map<K, number>`
 * instances, returning the same container type. Absent elements are treated as having
 * membership degree `0`. By default, elements whose resulting membership is `0` are
 * omitted (canonical sparse fuzzy set); set `options.includeZero = true` to retain
 * all universe elements from `A ∪ B` with explicit `0` memberships.
 *
 * @template K
 * @param {Record<string, number> | Map<K, number>} a - First fuzzy set (minuend `A`).
 * @param {Record<string, number> | Map<K, number>} b - Second fuzzy set (subtrahend `B`).
 * @param {{ includeZero?: boolean }} [options] - Optional configuration.
 * @param {boolean} [options.includeZero=false] - Whether to include zero-membership elements from `A ∪ B`.
 * @returns {Record<string, number> | Map<K, number>} Fuzzy set `A \ B` in the same container type as inputs.
 * @throws {TypeError} If `a` or `b` are not both plain objects or both Maps, if `options` is invalid, or if any membership is not a number.
 * @throws {RangeError} If any membership value in `a` or `b` is not finite or outside `[0, 1]`.
 */
export function setDifferenceFuzzyRecursive(a, b, options = undefined) {
	const aIsMap = a instanceof Map
	const bIsMap = b instanceof Map
	const aIsObj = isPlainObject(a)
	const bIsObj = isPlainObject(b)

	if (!((aIsMap && bIsMap) || (aIsObj && bIsObj))) {
		throw new TypeError(
			'Expected both `a` and `b` to be plain objects or both to be Map instances',
		)
	}

	let includeZero = false
	if (options !== undefined) {
		if (!isPlainObject(options)) {
			throw new TypeError('Expected `options` to be a plain object when provided')
		}
		if (options.includeZero !== undefined) {
			if (typeof options.includeZero !== 'boolean') {
				throw new TypeError('Expected `options.includeZero` to be a boolean')
			}
			includeZero = options.includeZero
		}
	}

	const entriesA = aIsMap ? Array.from(a.entries()) : Object.entries(a)
	const entriesB = bIsMap ? Array.from(b.entries()) : Object.entries(b)

	validateEntriesDivideAndConquer(entriesA, 0, entriesA.length, 'a')
	validateEntriesDivideAndConquer(entriesB, 0, entriesB.length, 'b')

	// Collect candidate universe keys. When `includeZero` is false, elements absent from A
	// always have μ_A(x) = 0 => min(0, 1 - μ_B(x)) = 0, so only keys of A can be positive.
	let keys
	if (includeZero) {
		const seen = new Set()
		keys = []
		for (let i = 0; i < entriesA.length; i++) {
			const k = entriesA[i][0]
			seen.add(k)
			keys.push(k)
		}
		for (let i = 0; i < entriesB.length; i++) {
			const k = entriesB[i][0]
			if (!seen.has(k)) {
				seen.add(k)
				keys.push(k)
			}
		}
	} else {
		keys = entriesA.map(([k]) => k)
	}

	if (aIsMap) {
		const mergeMaps = (left, right) => {
			const merged = new Map(left)
			for (const [k, v] of right) {
				merged.set(k, v)
			}
			return merged
		}

		const solveMap = (start, end) => {
			if (start >= end) {
				return new Map()
			}
			if (end - start === 1) {
				const key = keys[start]
				const muA = a.has(key) ? a.get(key) : 0
				const muB = b.has(key) ? b.get(key) : 0
				const mu = zadehDifferenceValue(muA, muB)
				const result = new Map()
				if (includeZero || mu > 0) {
					result.set(key, mu)
				}
				return result
			}
			const mid = start + Math.floor((end - start) / 2)
			const left = solveMap(start, mid)
			const right = solveMap(mid, end)
			return mergeMaps(left, right)
		}

		return solveMap(0, keys.length)
	}

	const mergeObjects = (left, right) => {
		const merged = {}
		for (const [k, v] of Object.entries(left)) {
			setOwnProperty(merged, k, v)
		}
		for (const [k, v] of Object.entries(right)) {
			setOwnProperty(merged, k, v)
		}
		return merged
	}

	const solveObject = (start, end) => {
		if (start >= end) {
			return {}
		}
		if (end - start === 1) {
			const key = keys[start]
			const muA = Object.prototype.hasOwnProperty.call(a, key) ? a[key] : 0
			const muB = Object.prototype.hasOwnProperty.call(b, key) ? b[key] : 0
			const mu = zadehDifferenceValue(muA, muB)
			const result = {}
			if (includeZero || mu > 0) {
				setOwnProperty(result, key, mu)
			}
			return result
		}
		const mid = start + Math.floor((end - start) / 2)
		const left = solveObject(start, mid)
		const right = solveObject(mid, end)
		return mergeObjects(left, right)
	}

	return solveObject(0, keys.length)
}
