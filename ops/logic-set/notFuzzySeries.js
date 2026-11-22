/**
 * Zadeh fuzzy NOT (complement) operator over fuzzy truth values and fuzzy sets
 * with membership degrees in [0, 1].
 *
 * Mathematical definition (exact closed-form / terminating series identity):
 *   N(mu) = 1 - mu = sum_{k=0}^{1} c_k * mu^k  (c_0 = 1, c_1 = -1)
 *
 * Equivalently, this is the closed form of:
 *   - The Sugeno complement series N_lambda(mu) = (1 - mu) * sum_{k=0}^{inf} (-lambda * mu)^k at lambda = 0.
 *   - The convergent geometric-series identity N(mu) = 2 / sum_{k=0}^{inf} (mu / 2)^k - 1 for mu in [0, 1].
 *
 * Supports:
 *   - Scalar fuzzy truth value: number in [0, 1] -> number in [0, 1]
 *   - Fuzzy set as Array of membership degrees -> new Array of negated degrees
 *   - Fuzzy set as Map<K, number> -> new Map<K, number> of negated degrees
 *   - Fuzzy set as plain Object (Record<string, number>) -> new plain Object of negated degrees
 *
 * @param {number | number[] | Map<any, number> | Record<string, number>} input
 *   A fuzzy membership degree in [0, 1] or a fuzzy set whose membership degrees lie in [0, 1].
 * @returns {number | number[] | Map<any, number> | Record<string, number>}
 *   The Zadeh fuzzy complement with the same container shape as the input.
 * @throws {TypeError} If `input` is not a number, Array, Map, or plain Object, or contains non-number memberships.
 * @throws {RangeError} If any membership degree is non-finite (NaN, +/-Infinity) or outside [0, 1].
 */
export function notFuzzySeries(input) {
	if (typeof input === 'number') {
		return negateMembership(input, 'input')
	}

	if (Array.isArray(input)) {
		const result = new Array(input.length)
		for (let i = 0; i < input.length; i++) {
			if (!(i in input)) {
				throw new TypeError(`Expected a number at index ${i}, got empty slot`)
			}
			result[i] = negateMembership(input[i], `index ${i}`)
		}
		return result
	}

	if (input instanceof Map) {
		const result = new Map()
		for (const [key, value] of input.entries()) {
			result.set(key, negateMembership(value, `key ${String(key)}`))
		}
		return result
	}

	if (isPlainObject(input)) {
		const proto = Object.getPrototypeOf(input)
		const result = proto === null ? Object.create(null) : {}
		for (const key of Object.keys(input)) {
			const negated = negateMembership(input[key], `key "${key}"`)
			Object.defineProperty(result, key, {
				value: negated,
				writable: true,
				enumerable: true,
				configurable: true,
			})
		}
		return result
	}

	throw new TypeError(
		'Expected input to be a number in [0, 1], an Array, a Map, or a plain Object'
	)
}

/**
 * Validates a single membership degree in [0, 1] and applies the closed-form
 * Zadeh negation identity N(mu) = 1 - mu.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {number}
 */
function negateMembership(value, label) {
	if (typeof value !== 'number') {
		throw new TypeError(`Expected a finite number in [0, 1] for ${label}, got ${typeof value}`)
	}
	if (!Number.isFinite(value)) {
		throw new RangeError(`Expected a finite number in [0, 1] for ${label}, got ${value}`)
	}
	if (value < 0 || value > 1) {
		throw new RangeError(`Expected membership degree in [0, 1] for ${label}, got ${value}`)
	}
	const negated = 1 - value
	return negated === 0 ? 0 : negated
}

/**
 * Checks whether a value is a plain object (prototype is Object.prototype or null).
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isPlainObject(value) {
	if (value === null || typeof value !== 'object') {
		return false
	}
	const proto = Object.getPrototypeOf(value)
	return proto === Object.prototype || proto === null
}
