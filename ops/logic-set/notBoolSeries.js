/**
 * Closed-form indicator negation over {0, 1} using the degree-1
 * Zhegalkin / alternating polynomial identity:
 *   neg(b) = sum_{k=0}^{1} (-1)^k * b^k = 1 - b
 *
 * @param {0 | 1} bit - Indicator value in {0, 1}.
 * @returns {0 | 1} Negated indicator value in {0, 1}.
 */
function negateIndicator(bit) {
	return /** @type {0 | 1} */ (1 - bit);
}

/**
 * Computes logical NOT over a plain boolean or relative set complement over a
 * JavaScript `Set` using a closed-form indicator/polynomial identity:
 *
 * - For a boolean `x`, maps `x` to its indicator `b ∈ {0, 1}` and evaluates
 *   the closed-form identity `neg(b) = 1 - b`, returning `(1 - b) === 1`.
 * - For a `Set` `A` with a required universe `Set` `U`, evaluates the
 *   closed-form characteristic-function identity
 *   `1_{U \ A}(u) = 1_U(u) * (1 - 1_A(u))` for each `u ∈ U`, returning a new
 *   `Set` without mutating either input.
 *
 * @template T
 * @overload
 * @param {boolean} value - Plain boolean value to negate.
 * @returns {boolean} Logical negation of `value`.
 */
/**
 * @template T
 * @overload
 * @param {Set<T>} value - Set whose relative complement in `universe` is computed.
 * @param {Set<T>} universe - Universe `Set` with respect to which complement is taken.
 * @returns {Set<T>} New `Set` containing all elements of `universe` not in `value`.
 */
/**
 * @template T
 * @param {boolean | Set<T>} value - A plain boolean or a `Set` instance.
 * @param {Set<T>} [universe] - Universe `Set` (required iff `value` is a `Set`).
 * @returns {boolean | Set<T>} Negated boolean or complement `Set`.
 * @throws {TypeError} If `value` is neither a boolean nor a `Set`, if `universe`
 *   is missing or not a `Set` when `value` is a `Set`, or if `universe` is
 *   supplied when `value` is a boolean.
 */
export function notBoolSeries(value, universe) {
	if (typeof value === 'boolean') {
		if (universe !== undefined) {
			throw new TypeError(
				'notBoolSeries: universe argument is only valid when value is a Set'
			);
		}
		const indicator = value ? 1 : 0;
		return negateIndicator(indicator) === 1;
	}

	if (value instanceof Set) {
		if (!(universe instanceof Set)) {
			throw new TypeError(
				'notBoolSeries: a universe Set is required when value is a Set'
			);
		}
		const result = new Set();
		for (const element of universe) {
			const inUniverse = 1;
			const inValue = value.has(element) ? 1 : 0;
			if (inUniverse * negateIndicator(inValue) === 1) {
				result.add(element);
			}
		}
		return result;
	}

	throw new TypeError('notBoolSeries: value must be a boolean or a Set');
}
