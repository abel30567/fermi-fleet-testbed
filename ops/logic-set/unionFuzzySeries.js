/**
 * Computes the Zadeh fuzzy union (t-conorm / disjunction) over fuzzy logic
 * truth values or fuzzy sets with membership degrees in `[0, 1]`, using the
 * closed-form algebraic identity:
 *
 *   max(a, b) = (a + b + |a - b|) / 2
 *
 * Equivalently, by De Morgan's law over Zadeh complement (1 - x) and Zadeh
 * intersection min(a, b) = (a + b - |a - b|) / 2:
 *
 *   a ∨ b = 1 - min(1 - a, 1 - b) = (a + b + |a - b|) / 2
 *
 * Supports three homogeneous input forms (all operands must share the same form):
 * 1. Scalar fuzzy truth values (`number` in `[0, 1]`) -> returns `number`.
 * 2. Indexed fuzzy sets (`number[]` of equal length) -> returns `number[]`.
 * 3. Keyed fuzzy sets (plain objects `Record<string, number>`) -> returns a new
 *    plain object over the union of all keys (absent keys have membership `0`).
 *
 * Accepts two or more operands and folds associatively left-to-right.
 *
 * @param {...(number | number[] | Record<string, number>)} operands
 *   Two or more fuzzy truth values, equal-length membership arrays, or plain
 *   object fuzzy sets whose membership degrees lie in `[0, 1]`.
 * @returns {number | number[] | Record<string, number>}
 *   The Zadeh fuzzy union in the same representation as the inputs.
 * @throws {TypeError} If fewer than two operands are provided, operand types
 *   are unsupported or mixed, or any membership value is not a number.
 * @throws {RangeError} If any membership value is non-finite or outside `[0, 1]`,
 *   or if array operands have differing lengths.
 */
export function unionFuzzySeries(...operands) {
	if (operands.length < 2) {
		throw new TypeError(
			`unionFuzzySeries requires at least 2 operands, received ${operands.length}`,
		)
	}

	const first = operands[0]

	if (typeof first === 'number') {
		let acc = validateDegree(first, 'operands[0]')
		for (let i = 1; i < operands.length; i++) {
			const val = validateDegree(operands[i], `operands[${i}]`)
			acc = zadehUnionPair(acc, val)
		}
		return acc
	}

	if (Array.isArray(first)) {
		const len = first.length
		for (let i = 1; i < operands.length; i++) {
			if (!Array.isArray(operands[i])) {
				throw new TypeError(
					`Expected operands[${i}] to be an array to match operands[0]`,
				)
			}
			if (operands[i].length !== len) {
				throw new RangeError(
					`Array length mismatch at operands[${i}]: expected ${len}, got ${operands[i].length}`,
				)
			}
		}

		const result = new Array(len)
		for (let j = 0; j < len; j++) {
			let acc = validateDegree(first[j], `operands[0][${j}]`)
			for (let i = 1; i < operands.length; i++) {
				const val = validateDegree(operands[i][j], `operands[${i}][${j}]`)
				acc = zadehUnionPair(acc, val)
			}
			result[j] = acc
		}
		return result
	}

	if (isPlainObject(first)) {
		const keySet = new Set()
		for (let i = 0; i < operands.length; i++) {
			const obj = operands[i]
			if (!isPlainObject(obj)) {
				throw new TypeError(
					`Expected operands[${i}] to be a plain object to match operands[0]`,
				)
			}
			for (const key of Object.keys(obj)) {
				validateDegree(obj[key], `operands[${i}][${JSON.stringify(key)}]`)
				keySet.add(key)
			}
		}

		const result = {}
		for (const key of keySet) {
			let acc = 0
			for (let i = 0; i < operands.length; i++) {
				const obj = operands[i]
				const val = Object.prototype.hasOwnProperty.call(obj, key)
					? normalizeZero(obj[key])
					: 0
				acc = zadehUnionPair(acc, val)
			}
			Object.defineProperty(result, key, {
				value: acc,
				enumerable: true,
				writable: true,
				configurable: true,
			})
		}
		return result
	}

	throw new TypeError(
		'unionFuzzySeries operands must be numbers in [0, 1], equal-length number arrays, or plain objects',
	)
}

/**
 * Closed-form Zadeh union for two validated membership degrees in `[0, 1]`.
 * Uses the algebraic identity: max(a, b) = (a + b + |a - b|) / 2.
 *
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function zadehUnionPair(a, b) {
	const value = (a + b + Math.abs(a - b)) / 2
	if (value <= 0) return 0
	if (value >= 1) return 1
	return value
}

/**
 * Validates that a value is a finite number within `[0, 1]`.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {number}
 */
function validateDegree(value, label) {
	if (typeof value !== 'number') {
		throw new TypeError(`${label} must be a number in [0, 1]`)
	}
	if (!Number.isFinite(value) || value < 0 || value > 1) {
		throw new RangeError(
			`${label} must be a finite number in [0, 1], received ${value}`,
		)
	}
	return normalizeZero(value)
}

/**
 * Normalizes `-0` to `+0`.
 *
 * @param {number} n
 * @returns {number}
 */
function normalizeZero(n) {
	return n === 0 ? 0 : n
}

/**
 * Checks whether a value is a plain object (prototype is Object.prototype or null).
 *
 * @param {unknown} value
 * @returns {value is Record<string, number>}
 */
function isPlainObject(value) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		return false
	}
	const proto = Object.getPrototypeOf(value)
	return proto === Object.prototype || proto === null
}
