/**
 * Computes Zadeh's fuzzy logical disjunction (OR) / fuzzy set union over
 * membership degrees in [0, 1] using the closed-form algebraic identity:
 *
 *   a ∨ b = (a + b + √((a - b)²)) / 2
 *
 * Evaluated with Knuth's error-free TwoSum / TwoDiff compensation and
 * `Math.hypot` for √((a - b)²) so that the closed-form identity is exact
 * in IEEE 754 binary64 across all inputs in [0, 1], including subnormals
 * and values adjacent to powers of two.
 *
 * Supported operand kinds (all operands must share the same kind, minimum 2):
 * - Scalar membership numbers in [0, 1] -> returns a number in [0, 1]
 * - Equal-length arrays of membership numbers -> returns an array
 * - Plain objects mapping universe keys to membership numbers (missing keys
 *   have implicit membership 0) -> returns a plain object over the key union
 * - `Map` instances mapping universe keys to membership numbers (missing keys
 *   have implicit membership 0) -> returns a `Map` over the key union
 *
 * @param {number|number[]|Record<string, number>|Map<*, number>} a - First fuzzy value or fuzzy set.
 * @param {number|number[]|Record<string, number>|Map<*, number>} b - Second fuzzy value or fuzzy set.
 * @param {...(number|number[]|Record<string, number>|Map<*, number>)} rest - Additional fuzzy values or fuzzy sets.
 * @returns {number|number[]|Record<string, number>|Map<*, number>} The Zadeh fuzzy disjunction / union.
 * @throws {TypeError} If fewer than 2 operands are provided, operand kinds do not match, or a membership value is not a number.
 * @throws {RangeError} If any membership value is non-finite or outside [0, 1], or if fuzzy set arrays have different lengths.
 */
export function orFuzzySeries(a, b, ...rest) {
	if (arguments.length < 2) {
		throw new TypeError('orFuzzySeries requires at least 2 operands')
	}

	const operands = [a, b, ...rest]

	if (typeof a === 'number') {
		let acc = validateMembership(a, 'operand 0')
		for (let i = 1; i < operands.length; i++) {
			const next = validateMembership(operands[i], `operand ${i}`)
			acc = zadehOrScalar(acc, next)
		}
		return acc
	}

	if (Array.isArray(a)) {
		const len = a.length
		for (let i = 1; i < operands.length; i++) {
			if (!Array.isArray(operands[i])) {
				throw new TypeError(`Expected operand ${i} to be an Array to match operand 0`)
			}
			if (operands[i].length !== len) {
				throw new RangeError(
					`Fuzzy set array length mismatch at operand ${i}: expected ${len}, got ${operands[i].length}`
				)
			}
		}

		const result = new Array(len)
		for (let idx = 0; idx < len; idx++) {
			if (!Object.hasOwn(a, idx)) {
				throw new TypeError(`Missing (sparse) membership at operand 0 index ${idx}`)
			}
			let acc = validateMembership(a[idx], `operand 0[${idx}]`)
			for (let i = 1; i < operands.length; i++) {
				const arr = operands[i]
				if (!Object.hasOwn(arr, idx)) {
					throw new TypeError(`Missing (sparse) membership at operand ${i} index ${idx}`)
				}
				const next = validateMembership(arr[idx], `operand ${i}[${idx}]`)
				acc = zadehOrScalar(acc, next)
			}
			result[idx] = acc
		}
		return result
	}

	if (a instanceof Map) {
		for (let i = 1; i < operands.length; i++) {
			if (!(operands[i] instanceof Map)) {
				throw new TypeError(`Expected operand ${i} to be a Map to match operand 0`)
			}
		}

		const keys = new Set()
		for (let i = 0; i < operands.length; i++) {
			for (const [k, v] of operands[i].entries()) {
				validateMembership(v, `operand ${i} key ${String(k)}`)
				keys.add(k)
			}
		}

		const result = new Map()
		for (const k of keys) {
			let acc = 0
			for (let i = 0; i < operands.length; i++) {
				const v = operands[i].has(k) ? normalizeZero(operands[i].get(k)) : 0
				acc = zadehOrScalar(acc, v)
			}
			result.set(k, acc)
		}
		return result
	}

	if (isPlainObject(a)) {
		for (let i = 1; i < operands.length; i++) {
			if (!isPlainObject(operands[i])) {
				throw new TypeError(`Expected operand ${i} to be a plain object to match operand 0`)
			}
		}

		const keys = new Set()
		for (let i = 0; i < operands.length; i++) {
			const obj = operands[i]
			for (const k of Object.keys(obj)) {
				validateMembership(obj[k], `operand ${i}.${k}`)
				keys.add(k)
			}
		}

		const result = {}
		for (const k of keys) {
			let acc = 0
			for (let i = 0; i < operands.length; i++) {
				const obj = operands[i]
				const v = Object.hasOwn(obj, k) ? normalizeZero(obj[k]) : 0
				acc = zadehOrScalar(acc, v)
			}
			result[k] = acc
		}
		return result
	}

	throw new TypeError(
		'orFuzzySeries operands must be numbers in [0, 1], arrays, plain objects, or Maps'
	)
}

/**
 * Closed-form algebraic identity for Zadeh OR on two validated memberships in [0, 1]:
 *   a ∨ b = (a + b + √((a - b)²)) / 2
 *
 * Uses Knuth's TwoSum / TwoDiff error-free transformations so that the sum
 * `(a + b) + |a - b|` is exact before halving.
 *
 * @param {number} a - Validated membership in [0, 1].
 * @param {number} b - Validated membership in [0, 1].
 * @returns {number} Exact Zadeh disjunction in [0, 1].
 */
function zadehOrScalar(a, b) {
	// Error-free sum: a + b = s + es
	const s = a + b
	const vs = s - a
	const es = (a - (s - vs)) + (b - vs)

	// Error-free difference: a - b = d + ed
	const d = a - b
	const vd = d - a
	const ed = (a - (d - vd)) + (-b - vd)

	// |a - b| = √((a - b)²) via Math.hypot (no underflow) plus signed compensation term
	const absD = Math.hypot(d)
	const absEd = d < 0 ? -ed : ed

	// Error-free sum of primary terms: s + absD = m + em
	const m = s + absD
	const vm = m - s
	const em = (s - (m - vm)) + (absD - vm)

	const combined = (m + (em + es + absEd)) * 0.5
	return normalizeZero(combined)
}

/**
 * Validates that a value is a finite number in [0, 1].
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {number}
 */
function validateMembership(value, label) {
	if (typeof value !== 'number') {
		throw new TypeError(`${label} must be a number, got ${typeof value}`)
	}
	if (!Number.isFinite(value) || value < 0 || value > 1) {
		throw new RangeError(`${label} must be a finite number in [0, 1], got ${value}`)
	}
	return normalizeZero(value)
}

/**
 * Normalizes -0 to +0.
 *
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x
}

/**
 * Checks whether a value is a plain object (Object.prototype or null prototype).
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
