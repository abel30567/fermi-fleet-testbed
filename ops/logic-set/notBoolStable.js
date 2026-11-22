/**
 * Computes exact logical negation for primitive booleans or set complement
 * relative to an explicit universe for JS `Set` instances.
 *
 * Numerically and semantically robust guarantees:
 * - Strict primitive boolean validation avoids implicit truthy/falsy coercion
 *   and boxed `Boolean` object pitfalls, yielding exact zero-error negation.
 * - Set complement uses single-pass `Set.prototype.has` (SameValueZero) over
 *   `universe` so `NaN` equality and `-0`/`+0` canonicalization remain exact,
 *   while returning a fresh `Set` without mutating either input.
 *
 * @template T
 * @overload
 * @param {boolean} a - A primitive boolean value to negate.
 * @returns {boolean} The logical negation `!a`.
 *
 * @overload
 * @param {Set<T>} a - The set whose relative complement is computed.
 * @param {Set<T>} universe - The universe `Set` to complement against.
 * @returns {Set<T>} A new `Set` containing every element of `universe` not in `a`.
 *
 * @throws {TypeError} If inputs are neither a single primitive boolean nor two `Set` instances.
 */
export function notBoolStable(a, universe) {
	if (typeof a === 'boolean') {
		if (arguments.length > 1 && universe !== undefined) {
			throw new TypeError(
				'notBoolStable expects a single primitive boolean without a universe argument',
			)
		}
		return !a
	}

	if (a instanceof Set) {
		if (!(universe instanceof Set)) {
			throw new TypeError(
				'notBoolStable requires a Set universe as the second argument when negating a Set',
			)
		}

		const complement = new Set()
		for (const item of universe) {
			if (!a.has(item)) {
				complement.add(item)
			}
		}
		return complement
	}

	throw new TypeError(
		'notBoolStable expects a primitive boolean or a pair of Set instances (set, universe)',
	)
}
