/**
 * Checks whether a value is a plain object (`{}` or `Object.create(null)`).
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
 * Validates that a membership degree is a finite number in `[0, 1]` and
 * normalizes `-0` to `0`.
 *
 * @param {unknown} value
 * @param {string} context
 * @returns {number}
 */
function validateMembership(value, context) {
	if (typeof value !== 'number') {
		throw new TypeError(`${context} must be a number in [0, 1]`)
	}
	if (!Number.isFinite(value) || value < 0 || value > 1) {
		throw new RangeError(`${context} must be a finite number in [0, 1]`)
	}
	return value === 0 ? 0 : value
}

/**
 * Computes the Zadeh fuzzy logic AND (minimum t-norm) or fuzzy set intersection
 * over one or more fuzzy truth values or fuzzy sets using a straightforward
 * iterative implementation.
 *
 * Supported operand representations (all operands in a call must share the same kind):
 * - Fuzzy truth values (`number` in `[0, 1]`): returns `min(a, b, ...)`.
 * - Indexed fuzzy sets (`number[]` of equal length with values in `[0, 1]`):
 *   returns a new array with element-wise minimum memberships.
 * - Keyed fuzzy sets (plain objects `Record<string, number>` with values in `[0, 1]`):
 *   returns a new plain object containing keys present in all input sets with their
 *   minimum membership (keys absent from any set have implicit membership `0`).
 * - Map fuzzy sets (`Map<K, number>` with values in `[0, 1]`):
 *   returns a new `Map` containing keys present in all input maps with their
 *   minimum membership (keys absent from any map have implicit membership `0`).
 *
 * @template {number | number[] | Record<string, number> | Map<any, number>} T
 * @param {...T} operands One or more fuzzy truth values or fuzzy sets of the same representation.
 * @returns {T} The Zadeh fuzzy AND / intersection result.
 * @throws {TypeError} If no operands are provided, an operand has an unsupported or mismatched type,
 *   or any membership degree is not a number.
 * @throws {RangeError} If any membership degree is not finite or outside `[0, 1]`,
 *   or if array fuzzy sets have differing lengths.
 */
export function andFuzzyIterative(...operands) {
	if (operands.length === 0) {
		throw new TypeError('andFuzzyIterative requires at least one operand')
	}

	const first = operands[0]

	if (typeof first === 'number') {
		let result = validateMembership(first, 'Operand 0')
		for (let i = 1; i < operands.length; i++) {
			const current = operands[i]
			if (typeof current !== 'number') {
				throw new TypeError(`Operand ${i} must be a number to match operand 0`)
			}
			const val = validateMembership(current, `Operand ${i}`)
			if (val < result) {
				result = val
			}
		}
		return result
	}

	if (Array.isArray(first)) {
		const length = first.length
		const result = new Array(length)
		for (let j = 0; j < length; j++) {
			result[j] = validateMembership(first[j], `Operand 0[${j}]`)
		}
		for (let i = 1; i < operands.length; i++) {
			const current = operands[i]
			if (!Array.isArray(current)) {
				throw new TypeError(`Operand ${i} must be an Array to match operand 0`)
			}
			if (current.length !== length) {
				throw new RangeError(
					`Operand ${i} length (${current.length}) does not match operand 0 length (${length})`,
				)
			}
			for (let j = 0; j < length; j++) {
				const val = validateMembership(current[j], `Operand ${i}[${j}]`)
				if (val < result[j]) {
					result[j] = val
				}
			}
		}
		return result
	}

	if (first instanceof Map) {
		for (let i = 0; i < operands.length; i++) {
			const current = operands[i]
			if (!(current instanceof Map)) {
				throw new TypeError(`Operand ${i} must be a Map to match operand 0`)
			}
			for (const [key, val] of current.entries()) {
				validateMembership(val, `Operand ${i} entry "${String(key)}"`)
			}
		}

		const result = new Map()
		for (const [key, firstVal] of first.entries()) {
			let minVal = firstVal === 0 ? 0 : firstVal
			let inAll = true
			for (let i = 1; i < operands.length; i++) {
				const current = operands[i]
				if (!current.has(key)) {
					inAll = false
					break
				}
				const rawVal = current.get(key)
				const val = rawVal === 0 ? 0 : rawVal
				if (val < minVal) {
					minVal = val
				}
			}
			if (inAll) {
				result.set(key, minVal)
			}
		}
		return result
	}

	if (isPlainObject(first)) {
		for (let i = 0; i < operands.length; i++) {
			const current = operands[i]
			if (!isPlainObject(current)) {
				throw new TypeError(`Operand ${i} must be a plain object to match operand 0`)
			}
			const keys = Object.keys(current)
			for (let k = 0; k < keys.length; k++) {
				const key = keys[k]
				validateMembership(current[key], `Operand ${i} property "${key}"`)
			}
		}

		const result = {}
		const firstKeys = Object.keys(first)
		for (let k = 0; k < firstKeys.length; k++) {
			const key = firstKeys[k]
			let minVal = first[key] === 0 ? 0 : first[key]
			let inAll = true
			for (let i = 1; i < operands.length; i++) {
				const current = operands[i]
				if (!Object.prototype.hasOwnProperty.call(current, key)) {
					inAll = false
					break
				}
				const rawVal = current[key]
				const val = rawVal === 0 ? 0 : rawVal
				if (val < minVal) {
					minVal = val
				}
			}
			if (inAll) {
				Object.defineProperty(result, key, {
					value: minVal,
					enumerable: true,
					writable: true,
					configurable: true,
				})
			}
		}
		return result
	}

	throw new TypeError(
		'Operand 0 must be a number in [0, 1], an Array, a plain object, or a Map',
	)
}
