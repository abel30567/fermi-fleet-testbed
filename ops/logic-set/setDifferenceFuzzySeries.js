/**
 * Computes the Zadeh fuzzy set difference `A \ B` using a closed-form algebraic
 * identity over membership degrees in `[0, 1]`.
 *
 * In Zadeh fuzzy set theory, set difference is defined via intersection with
 * the Zadeh complement:
 *
 *   μ_{A \ B}(x) = min(μ_A(x), 1 - μ_B(x))
 *
 * Using the exact closed-form identity `min(u, v) = (u + v - |u - v|) / 2` with
 * `u = μ_A(x)` and `v = 1 - μ_B(x)` (where `|w| = sqrt(w^2)`), this simplifies to:
 *
 *   μ_{A \ B}(x) = (1 + μ_A(x) - μ_B(x) - |μ_A(x) + μ_B(x) - 1|) / 2
 *
 * Supported input representations (both `a` and `b` must have the same kind):
 * - Scalar numbers in `[0, 1]`: returns a number in `[0, 1]`.
 * - Dense arrays of equal length with values in `[0, 1]`: returns a new array.
 * - Plain objects mapping keys to values in `[0, 1]`: returns a new plain object
 *   over the union of keys from `a` and `b` (absent keys have membership `0`).
 * - `Map` instances mapping keys to values in `[0, 1]`: returns a new `Map`
 *   over the union of keys from `a` and `b` (absent keys have membership `0`).
 *
 * @param {number | number[] | Record<string, number> | Map<any, number>} a
 *   Minuend fuzzy set or scalar membership degree in `[0, 1]`.
 * @param {number | number[] | Record<string, number> | Map<any, number>} b
 *   Subtrahend fuzzy set or scalar membership degree in `[0, 1]`.
 * @returns {number | number[] | Record<string, number> | Map<any, number>}
 *   Fuzzy set difference `a \ b` in the same representation as the inputs.
 * @throws {TypeError} If inputs have invalid or mismatched types, or if an array is sparse.
 * @throws {RangeError} If any membership value is outside `[0, 1]`, non-finite, or if array lengths differ.
 */
export function setDifferenceFuzzySeries(a, b) {
	if (typeof a === 'number' && typeof b === 'number') {
		assertMembership(a, 'a')
		assertMembership(b, 'b')
		return fuzzyDifferenceScalar(a, b)
	}

	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) {
			throw new RangeError(
				`Fuzzy membership arrays must have the same length (received ${a.length} and ${b.length})`
			)
		}
		const result = new Array(a.length)
		for (let i = 0; i < a.length; i++) {
			if (!Object.hasOwn(a, i)) {
				throw new TypeError(`Sparse array hole at a[${i}] is not allowed`)
			}
			if (!Object.hasOwn(b, i)) {
				throw new TypeError(`Sparse array hole at b[${i}] is not allowed`)
			}
			const muA = a[i]
			const muB = b[i]
			assertMembership(muA, `a[${i}]`)
			assertMembership(muB, `b[${i}]`)
			result[i] = fuzzyDifferenceScalar(muA, muB)
		}
		return result
	}

	if (a instanceof Map && b instanceof Map) {
		for (const [key, value] of a) {
			assertMembership(value, `a.get(${String(key)})`)
		}
		for (const [key, value] of b) {
			assertMembership(value, `b.get(${String(key)})`)
		}
		const result = new Map()
		for (const [key, muA] of a) {
			const muB = b.has(key) ? b.get(key) : 0
			result.set(key, fuzzyDifferenceScalar(muA, muB))
		}
		for (const [key, muB] of b) {
			if (!a.has(key)) {
				result.set(key, fuzzyDifferenceScalar(0, muB))
			}
		}
		return result
	}

	if (isPlainObject(a) && isPlainObject(b)) {
		const keysA = Object.keys(a)
		const keysB = Object.keys(b)
		for (const key of keysA) {
			assertMembership(a[key], `a[${JSON.stringify(key)}]`)
		}
		for (const key of keysB) {
			assertMembership(b[key], `b[${JSON.stringify(key)}]`)
		}
		const result = {}
		for (const key of keysA) {
			const muA = a[key]
			const muB = Object.hasOwn(b, key) ? b[key] : 0
			defineOwnDataProperty(result, key, fuzzyDifferenceScalar(muA, muB))
		}
		for (const key of keysB) {
			if (!Object.hasOwn(a, key)) {
				defineOwnDataProperty(result, key, fuzzyDifferenceScalar(0, b[key]))
			}
		}
		return result
	}

	throw new TypeError(
		'Inputs a and b must both be numbers, dense arrays, plain objects, or Maps with membership values in [0, 1]'
	)
}

/**
 * Evaluates Zadeh fuzzy difference via the closed-form algebraic identity:
 *   min(a, 1 - b) = (u + v - |u - v|) / 2
 * where u = a and v = 1 - b.
 *
 * @param {number} muA
 * @param {number} muB
 * @returns {number}
 */
function fuzzyDifferenceScalar(muA, muB) {
	const u = muA
	const v = 1 - muB
	const value = 0.5 * (u + v - Math.abs(u - v))
	if (value <= 0) {
		return 0
	}
	if (value >= 1) {
		return 1
	}
	return value
}

/**
 * Validates that a value is a finite number in `[0, 1]`.
 *
 * @param {unknown} value
 * @param {string} label
 */
function assertMembership(value, label) {
	if (typeof value !== 'number') {
		throw new TypeError(
			`Membership ${label} must be a number in [0, 1], received ${typeof value}`
		)
	}
	if (!Number.isFinite(value) || value < 0 || value > 1) {
		throw new RangeError(
			`Membership ${label} must be a finite number in [0, 1], received ${value}`
		)
	}
}

/**
 * Checks whether a value is a plain object (`Object.prototype` or `null` prototype).
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
 * Safely defines an own enumerable data property without triggering prototype setters
 * (e.g. for a key literally named `'__proto__'`).
 *
 * @param {Record<string, number>} target
 * @param {string} key
 * @param {number} value
 */
function defineOwnDataProperty(target, key, value) {
	Object.defineProperty(target, key, {
		value,
		writable: true,
		enumerable: true,
		configurable: true,
	})
}
