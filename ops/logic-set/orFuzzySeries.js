/**
 * Computes the Zadeh fuzzy logic OR (fuzzy disjunction / s-norm) or fuzzy set
 * union over membership degrees in `[0, 1]` using a closed-form algebraic
 * identity.
 *
 * For two membership degrees `a, b ∈ [0, 1]`, the Zadeh OR operator is defined
 * by `a ∨ b = max(a, b)`. Starting from the closed-form absolute-value identity:
 *
 *   max(a, b) = (a + b + |a - b|) / 2
 *             = (a + b + sgn(a - b) * (a - b)) / 2
 *
 * and letting `s = sgn(a - b) ∈ {-1, 0, +1}`, the discrete Lagrange indicator
 * weights `w_b = s * (s - 1) / 2` and `w_a = 1 - w_b` yield the exact
 * closed-form evaluation:
 *
 *   max(a, b) = w_a * a + w_b * b
 *
 * which avoids conditional branching, floating-point rounding drift, and
 * subnormal underflow across the full unit interval `[0, 1]`.
 *
 * Supports four uniform operand representations (and 2 or more operands via
 * associative folding):
 * - Scalar membership degrees (`number` in `[0, 1]`)
 * - Fuzzy set vectors (`Array<number>` of equal length, each in `[0, 1]`)
 * - Fuzzy set records (plain objects mapping element keys to `[0, 1]`; absent
 *   keys have membership `0`)
 * - Fuzzy set maps (`Map<K, number>` mapping keys to `[0, 1]`; absent keys
 *   have membership `0`)
 *
 * @template {number | number[] | Record<string, number> | Map<any, number>} T
 * @param {T} a - First fuzzy truth value or fuzzy set.
 * @param {T} b - Second fuzzy truth value or fuzzy set.
 * @param {...T} rest - Optional additional fuzzy truth values or fuzzy sets.
 * @returns {T} The Zadeh OR / fuzzy union in the same representation as inputs.
 * @throws {TypeError} If fewer than two operands are provided, operand types
 *   are unsupported or mismatched, or any membership value is not a number.
 * @throws {RangeError} If any membership value is non-finite or outside
 *   `[0, 1]`, or if array operands have different lengths.
 */
export function orFuzzySeries(a, b, ...rest) {
	if (arguments.length < 2) {
		throw new TypeError('orFuzzySeries requires at least two operands')
	}

	const operands = [a, b, ...rest]
	const kind = classifyOperand(a)

	for (let i = 1; i < operands.length; i++) {
		if (classifyOperand(operands[i]) !== kind) {
			throw new TypeError(
				`All operands to orFuzzySeries must have the same representation (expected ${kind})`
			)
		}
	}

	if (kind === 'number') {
		let acc = validateMembership(operands[0], 'operand[0]')
		for (let i = 1; i < operands.length; i++) {
			const next = validateMembership(operands[i], `operand[${i}]`)
			acc = zadehOrScalar(acc, next)
		}
		return acc
	}

	if (kind === 'array') {
		const len = operands[0].length
		for (let i = 1; i < operands.length; i++) {
			if (operands[i].length !== len) {
				throw new RangeError(
					`Array operands must have equal length (expected ${len}, got ${operands[i].length})`
				)
			}
		}

		const result = new Array(len)
		for (let idx = 0; idx < len; idx++) {
			let acc = readArrayMembership(operands[0], idx, 0)
			for (let i = 1; i < operands.length; i++) {
				const next = readArrayMembership(operands[i], idx, i)
				acc = zadehOrScalar(acc, next)
			}
			result[idx] = acc
		}
		return result
	}

	if (kind === 'map') {
		const result = new Map()
		for (let i = 0; i < operands.length; i++) {
			const map = operands[i]
			for (const [key, rawVal] of map.entries()) {
				const val = validateMembership(rawVal, `operand[${i}].get(${String(key)})`)
				const prev = result.has(key) ? result.get(key) : 0
				result.set(key, zadehOrScalar(prev, val))
			}
		}
		return result
	}

	// Plain object fuzzy set representation
	const result = {}
	for (let i = 0; i < operands.length; i++) {
		const obj = operands[i]
		const keys = Object.keys(obj)
		for (let k = 0; k < keys.length; k++) {
			const key = keys[k]
			const val = validateMembership(obj[key], `operand[${i}][${JSON.stringify(key)}]`)
			const prev = Object.prototype.hasOwnProperty.call(result, key) ? result[key] : 0
			Object.defineProperty(result, key, {
				value: zadehOrScalar(prev, val),
				enumerable: true,
				writable: true,
				configurable: true
			})
		}
	}
	return result
}

/**
 * Closed-form algebraic evaluation of Zadeh OR for two validated scalars in `[0, 1]`.
 *
 * Derived from `max(a, b) = (a + b + |a - b|) / 2` with `|a - b| = s * (a - b)`
 * where `s = Math.sign(a - b) ∈ {-1, 0, 1}`.
 *
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function zadehOrScalar(a, b) {
	const s = Math.sign(a - b)
	const wb = (s * (s - 1)) / 2
	const wa = 1 - wb
	return (wa * a + wb * b) + 0
}

/**
 * Validates that a value is a finite number in `[0, 1]` and normalizes `-0` to `+0`.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {number}
 */
function validateMembership(value, label) {
	if (typeof value !== 'number') {
		throw new TypeError(`${label} must be a number in [0, 1]`)
	}
	if (!Number.isFinite(value) || value < 0 || value > 1) {
		throw new RangeError(`${label} must be a finite number in [0, 1], got ${value}`)
	}
	return value + 0
}

/**
 * Reads and validates an element from a dense array operand.
 *
 * @param {unknown[]} arr
 * @param {number} idx
 * @param {number} operandIndex
 * @returns {number}
 */
function readArrayMembership(arr, idx, operandIndex) {
	if (!Object.prototype.hasOwnProperty.call(arr, idx)) {
		throw new TypeError(`operand[${operandIndex}][${idx}] must not be a sparse hole`)
	}
	return validateMembership(arr[idx], `operand[${operandIndex}][${idx}]`)
}

/**
 * Classifies a supported operand representation or throws a `TypeError`.
 *
 * @param {unknown} value
 * @returns {'number' | 'array' | 'map' | 'object'}
 */
function classifyOperand(value) {
	if (typeof value === 'number') {
		return 'number'
	}
	if (Array.isArray(value)) {
		return 'array'
	}
	if (value instanceof Map) {
		return 'map'
	}
	if (isPlainObject(value)) {
		return 'object'
	}
	throw new TypeError(
		'Operands to orFuzzySeries must be numbers in [0, 1], arrays, plain objects, or Maps'
	)
}

/**
 * Checks whether a value is a plain object (`Object.prototype` or `null` prototype).
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
