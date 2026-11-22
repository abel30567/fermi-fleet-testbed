/**
 * Computes the Zadeh fuzzy XOR (symmetric difference) over fuzzy truth values
 * or fuzzy sets with membership degrees in [0, 1], using a closed-form
 * algebraic identity.
 *
 * In Zadeh fuzzy logic (complement `1 - x`, intersection `min`, union `max`),
 * the canonical XOR is:
 *   a XOR b = max(min(a, 1 - b), min(1 - a, b))
 *           = min(max(a, b), 1 - min(a, b))
 *
 * Substituting `max(x, y) = (x + y + |x - y|) / 2` and
 * `min(x, y) = (x + y - |x - y|) / 2` yields the closed-form identity:
 *   a XOR b = (1 + |a - b| - |a + b - 1|) / 2
 *
 * Evaluated across the `a + b = 1` boundary without cancellation:
 *   - if a + b <= 1: (a + b + |a - b|) / 2
 *   - if a + b >  1: ((1 - a) + (1 - b) + |a - b|) / 2
 *
 * Supported input forms (both operands must have the same form):
 *   1. Two membership numbers in [0, 1] -> returns a membership number in [0, 1].
 *   2. Two equal-length arrays of memberships in [0, 1] -> returns a new array.
 *   3. Two plain objects mapping element keys to memberships in [0, 1] ->
 *      returns a new plain object over the union of keys (missing keys default to 0).
 *
 * @param {number | number[] | Record<string, number>} a First fuzzy truth value or fuzzy set.
 * @param {number | number[] | Record<string, number>} b Second fuzzy truth value or fuzzy set.
 * @returns {number | number[] | Record<string, number>} Fuzzy XOR membership(s) in [0, 1].
 * @throws {TypeError} If arguments are missing, mismatched in kind, unsupported types, or contain non-numeric memberships.
 * @throws {RangeError} If any membership is non-finite or outside [0, 1], or if array operands have different lengths.
 */
export function xorFuzzySeries(a, b) {
	if (arguments.length !== 2) {
		throw new TypeError(`xorFuzzySeries expects exactly 2 arguments, received ${arguments.length}`)
	}

	if (typeof a === 'number' && typeof b === 'number') {
		validateMembership(a, 'a')
		validateMembership(b, 'b')
		return xorScalarClosedForm(a, b)
	}

	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) {
			throw new RangeError(`Fuzzy membership arrays must have equal length (${a.length} !== ${b.length})`)
		}
		const result = new Array(a.length)
		for (let i = 0; i < a.length; i++) {
			if (!Object.hasOwn(a, i)) {
				throw new TypeError(`a[${i}] must be a number in [0, 1], received empty array slot`)
			}
			if (!Object.hasOwn(b, i)) {
				throw new TypeError(`b[${i}] must be a number in [0, 1], received empty array slot`)
			}
			validateMembership(a[i], `a[${i}]`)
			validateMembership(b[i], `b[${i}]`)
			result[i] = xorScalarClosedForm(a[i], b[i])
		}
		return result
	}

	if (isPlainObject(a) && isPlainObject(b)) {
		const keysA = Object.keys(a)
		const keysB = Object.keys(b)
		const allKeys = new Set([...keysA, ...keysB])
		const result = {}
		for (const key of allKeys) {
			const valA = Object.hasOwn(a, key) ? a[key] : 0
			const valB = Object.hasOwn(b, key) ? b[key] : 0
			validateMembership(valA, `a[${JSON.stringify(key)}]`)
			validateMembership(valB, `b[${JSON.stringify(key)}]`)
			result[key] = xorScalarClosedForm(valA, valB)
		}
		return result
	}

	throw new TypeError(
		'xorFuzzySeries requires two numbers in [0, 1], two equal-length number arrays, or two plain fuzzy-set objects'
	)
}

/**
 * Closed-form Zadeh fuzzy XOR on validated scalar memberships in [0, 1].
 * Equivalent to `(1 + |a - b| - |a + b - 1|) / 2`, evaluated in cancellation-free form.
 *
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function xorScalarClosedForm(a, b) {
	const sum = a + b
	const diff = Math.abs(a - b)
	const raw = sum <= 1
		? (sum + diff) / 2
		: ((1 - a) + (1 - b) + diff) / 2
	if (raw <= 0) return 0
	if (raw >= 1) return 1
	return raw
}

/**
 * Validates that a value is a finite number within [0, 1].
 *
 * @param {unknown} value
 * @param {string} label
 */
function validateMembership(value, label) {
	if (typeof value !== 'number') {
		throw new TypeError(`${label} must be a number in [0, 1], received ${typeof value}`)
	}
	if (!Number.isFinite(value)) {
		throw new RangeError(`${label} must be a finite number in [0, 1], received ${value}`)
	}
	if (value < 0 || value > 1) {
		throw new RangeError(`${label} must be within [0, 1], received ${value}`)
	}
}

/**
 * Checks whether a value is a plain object (null-prototype or Object.prototype).
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
