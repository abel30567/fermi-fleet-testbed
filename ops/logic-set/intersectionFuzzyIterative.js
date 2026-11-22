/**
 * Zadeh fuzzy intersection (logic-set) using a straightforward iterative implementation.
 *
 * Computes the Zadeh t-norm intersection, defined pointwise by
 * `mu_{A ∩ B}(x) = min(mu_A(x), mu_B(x))`, over two or more fuzzy operands
 * whose membership degrees lie in the closed unit interval `[0, 1]`.
 *
 * Supported operand forms (all operands in a single call must share the same form):
 * - **Scalar memberships**: finite numbers in `[0, 1]`, returning their minimum.
 * - **Membership arrays**: equal-length dense arrays of numbers in `[0, 1]`, returning
 *   a new array with the element-wise minimum.
 * - **Plain object fuzzy sets**: plain objects mapping element keys to membership
 *   degrees in `[0, 1]`, returning a new plain object containing keys present in all
 *   input sets with their pointwise minimum (absent keys implicitly have membership
 *   `0`, so disjoint keys have intersection membership `0` and are omitted).
 *
 * @typedef {number | number[] | Record<string, number>} FuzzyOperand
 */

/**
 * Normalize `-0` to `+0`.
 *
 * @param {number} value
 * @returns {number}
 */
function normalizeZero(value) {
	return value === 0 ? 0 : value
}

/**
 * Check whether a value is a plain object (`Object.prototype` or `null` prototype).
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isPlainObject(value) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		return false
	}
	const proto = Object.getPrototypeOf(value)
	return proto === Object.prototype || proto === null
}

/**
 * Validate that a single value is a finite number in `[0, 1]`.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {number}
 */
function validateMembership(value, label) {
	if (typeof value !== 'number') {
		throw new TypeError(`${label} must be a number in [0, 1], received ${typeof value}`)
	}
	if (!Number.isFinite(value) || value < 0 || value > 1) {
		throw new RangeError(`${label} must be a finite number in [0, 1], received ${value}`)
	}
	return normalizeZero(value)
}

/**
 * Determine the operand kind (`'number'`, `'array'`, or `'object'`).
 *
 * @param {unknown} value
 * @param {number} index
 * @returns {'number' | 'array' | 'object'}
 */
function getOperandKind(value, index) {
	if (typeof value === 'number') {
		return 'number'
	}
	if (Array.isArray(value)) {
		return 'array'
	}
	if (isPlainObject(value)) {
		return 'object'
	}
	throw new TypeError(
		`Operand at index ${index} must be a membership number, array, or plain object`
	)
}

/**
 * Compute the Zadeh fuzzy intersection (`min`) iteratively across two or more
 * fuzzy membership values, equal-length membership arrays, or plain object fuzzy sets.
 *
 * @param {...FuzzyOperand} operands Two or more fuzzy operands of the same kind.
 * @returns {FuzzyOperand} The Zadeh fuzzy intersection in the same form as the inputs.
 * @throws {TypeError} If fewer than two operands are provided, operand kinds are
 *   unsupported or mismatched, arrays are sparse, or any membership is not a number.
 * @throws {RangeError} If any membership value is outside `[0, 1]` (including `NaN`
 *   and `±Infinity`) or if membership arrays have differing lengths.
 *
 * @example
 * intersectionFuzzyIterative(0.8, 0.3)
 * // => 0.3
 *
 * @example
 * intersectionFuzzyIterative([0.2, 0.9, 1], [0.5, 0.4, 0.7])
 * // => [0.2, 0.4, 0.7]
 *
 * @example
 * intersectionFuzzyIterative({ a: 0.6, b: 0.9 }, { b: 0.4, c: 0.8 })
 * // => { b: 0.4 }
 */
export function intersectionFuzzyIterative(...operands) {
	if (operands.length < 2) {
		throw new TypeError(
			`intersectionFuzzyIterative requires at least 2 operands, received ${operands.length}`
		)
	}

	const kind = getOperandKind(operands[0], 0)
	for (let i = 1; i < operands.length; i++) {
		const currentKind = getOperandKind(operands[i], i)
		if (currentKind !== kind) {
			throw new TypeError(
				`All operands must have the same type: expected ${kind} (from operand 0), received ${currentKind} at index ${i}`
			)
		}
	}

	if (kind === 'number') {
		let acc = validateMembership(operands[0], 'Operand 0')
		for (let i = 1; i < operands.length; i++) {
			const val = validateMembership(operands[i], `Operand ${i}`)
			if (val < acc) {
				acc = val
			}
		}
		return acc
	}

	if (kind === 'array') {
		const length = operands[0].length
		for (let i = 0; i < operands.length; i++) {
			const arr = operands[i]
			if (arr.length !== length) {
				throw new RangeError(
					`All fuzzy arrays must have the same length: expected ${length}, received ${arr.length} at operand ${i}`
				)
			}
			for (let j = 0; j < length; j++) {
				if (!Object.hasOwn(arr, j)) {
					throw new TypeError(`Operand ${i} contains a sparse hole at index ${j}`)
				}
				validateMembership(arr[j], `Operand ${i}[${j}]`)
			}
		}

		const result = new Array(length)
		for (let j = 0; j < length; j++) {
			let acc = normalizeZero(operands[0][j])
			for (let i = 1; i < operands.length; i++) {
				const val = normalizeZero(operands[i][j])
				if (val < acc) {
					acc = val
				}
			}
			result[j] = acc
		}
		return result
	}

	// kind === 'object': validate all own enumerable entries across all operands first
	for (let i = 0; i < operands.length; i++) {
		const obj = operands[i]
		const keys = Object.keys(obj)
		for (let k = 0; k < keys.length; k++) {
			const key = keys[k]
			validateMembership(obj[key], `Operand ${i}["${key}"]`)
		}
	}

	const result = {}
	const first = operands[0]
	const firstKeys = Object.keys(first)
	for (let k = 0; k < firstKeys.length; k++) {
		const key = firstKeys[k]
		let acc = normalizeZero(first[key])
		let presentInAll = true

		for (let i = 1; i < operands.length; i++) {
			const current = operands[i]
			if (!Object.hasOwn(current, key)) {
				presentInAll = false
				break
			}
			const val = normalizeZero(current[key])
			if (val < acc) {
				acc = val
			}
		}

		if (presentInAll) {
			Object.defineProperty(result, key, {
				value: acc,
				enumerable: true,
				writable: true,
				configurable: true,
			})
		}
	}

	return result
}
