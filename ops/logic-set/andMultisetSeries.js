const HALF_MAX_SAFE = Math.floor(Number.MAX_SAFE_INTEGER / 2)

/**
 * Validates that a value is a multiset represented as `Map<any, number>`
 * where every multiplicity is a non-negative safe integer.
 *
 * @param {unknown} value - Candidate multiset to validate.
 * @param {number} index - Zero-based argument index for error reporting.
 * @throws {TypeError} If `value` is not a `Map`, or any count is not a number or is `NaN`.
 * @throws {RangeError} If any count is negative, non-integer, non-finite, or exceeds `Number.MAX_SAFE_INTEGER`.
 */
function validateMultiset(value, index) {
	if (!(value instanceof Map)) {
		throw new TypeError(
			`andMultisetSeries: argument ${index} must be a Map<value, count>`,
		)
	}
	for (const [key, count] of value) {
		if (typeof count !== 'number' || Number.isNaN(count)) {
			throw new TypeError(
				`andMultisetSeries: count for key ${String(key)} in argument ${index} must be a number`,
			)
		}
		if (!Number.isSafeInteger(count) || count < 0) {
			throw new RangeError(
				`andMultisetSeries: count for key ${String(key)} in argument ${index} must be a non-negative safe integer`,
			)
		}
	}
}

/**
 * Computes the closed-form multiset conjunction multiplicity for two non-negative
 * safe integer counts using the algebraic identity:
 *
 *   min(x, y) = (x + y - |x - y|) / 2
 *
 * Falls back to `BigInt` arithmetic when `x + y` could exceed
 * `Number.MAX_SAFE_INTEGER`, guaranteeing exactness across the full safe integer range.
 *
 * @param {number} x - Non-negative safe integer multiplicity from the first multiset.
 * @param {number} y - Non-negative safe integer multiplicity from the second multiset.
 * @returns {number} The exact conjunction multiplicity `min(x, y)`.
 */
function closedFormConjunctionCount(x, y) {
	if (x <= HALF_MAX_SAFE && y <= HALF_MAX_SAFE) {
		return (x + y - Math.abs(x - y)) / 2
	}
	const bx = BigInt(x)
	const by = BigInt(y)
	const absDiff = bx >= by ? bx - by : by - bx
	return Number((bx + by - absDiff) / 2n)
}

/**
 * Computes the binary multiset AND (meet / conjunction) of two already-validated multisets.
 *
 * @template T
 * @param {Map<T, number>} a - First validated multiset.
 * @param {Map<T, number>} b - Second validated multiset.
 * @returns {Map<T, number>} New canonical multiset containing only positive multiplicities.
 */
function andTwoMultisets(a, b) {
	const result = new Map()
	const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a]

	for (const [key, countA] of smaller) {
		if (countA === 0 || !larger.has(key)) {
			continue
		}
		const countB = larger.get(key)
		const count = closedFormConjunctionCount(countA, countB)
		if (count > 0) {
			result.set(key, count)
		}
	}

	return result
}

/**
 * Computes the logical AND (conjunction / meet / intersection) of two or more
 * multisets represented as `Map<value, count>` (counting logic).
 *
 * For each element `x`, the resulting multiplicity is computed via the closed-form
 * algebraic identity linking multiset sum (`a + b`) and symmetric difference (`|a - b|`):
 *
 *   m_{A ∧ B}(x) = (m_A(x) + m_B(x) - |m_A(x) - m_B(x)|) / 2
 *
 * Which equals the finite threshold/layer-cake indicator series
 * `sum_{k=1}^{∞} 1[m_A(x) >= k] ∧ 1[m_B(x) >= k]`.
 *
 * The returned `Map` is always a new canonical instance with zero-count entries omitted;
 * input maps are never mutated.
 *
 * @template T
 * @param {Map<T, number>} a - First multiset (`Map<value, non-negative safe integer>`).
 * @param {Map<T, number>} b - Second multiset (`Map<value, non-negative safe integer>`).
 * @param {...Map<T, number>} rest - Optional additional multisets to fold with associative AND.
 * @returns {Map<T, number>} Canonical multiset representing `a ∧ b ∧ ...`.
 * @throws {TypeError} If fewer than two arguments are provided, any argument is not a `Map`,
 *   or any count is not a number / is `NaN`.
 * @throws {RangeError} If any count is negative, non-integer, non-finite, or unsafe.
 */
export function andMultisetSeries(a, b, ...rest) {
	const inputs = [a, b, ...rest]
	for (let i = 0; i < inputs.length; i++) {
		validateMultiset(inputs[i], i)
	}

	let acc = andTwoMultisets(inputs[0], inputs[1])
	for (let i = 2; i < inputs.length; i++) {
		acc = andTwoMultisets(acc, inputs[i])
	}
	return acc
}
