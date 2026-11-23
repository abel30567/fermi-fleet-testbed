/**
 * Numerically and algorithmically robust logical AND over plain booleans or JS `Set` objects.
 *
 * - **Boolean mode**: When all operands are plain `boolean` primitives, computes the exact
 *   logical conjunction (`true` iff every operand is `true`). All operands are strictly
 *   validated up front (no implicit truthy/falsy coercion, no numeric casting, and no
 *   unchecked trailing operands via premature short-circuiting).
 * - **Set mode**: When all operands are `Set` instances, computes the exact set intersection
 *   using **cardinality pivoting** (selecting the smallest-cardinality set as the iteration
 *   pivot and ordering remaining sets by ascending size to minimize membership probes and
 *   bound work to `O(min_i |S_i| * (k - 1))`). Membership uses ECMAScript `SameValueZero`
 *   semantics (matching `NaN` with `NaN` and canonicalizing `-0` to `+0`) with zero
 *   floating-point accumulation error and guaranteed cardinality bounds
 *   `0 <= |result| <= min_i |S_i|`. Input sets are never mutated; a fresh `Set` is always
 *   returned.
 *
 * @param {boolean | Set<*>} a - First operand (plain boolean or `Set`).
 * @param {boolean | Set<*>} b - Second operand (must match the type of `a`).
 * @param {...(boolean | Set<*>)} rest - Optional additional operands of the same type.
 * @returns {boolean | Set<*>} Exact logical conjunction (`boolean`) or set intersection (`Set`).
 * @throws {TypeError} If fewer than two operands are provided, if any operand is neither a
 *   plain `boolean` nor a `Set`, or if `boolean` and `Set` operands are mixed.
 */
export function andBoolStable(a, b, ...rest) {
	if (arguments.length < 2) {
		throw new TypeError(
			`andBoolStable requires at least 2 arguments, received ${arguments.length}`
		)
	}

	const operands = [a, b, ...rest]
	const firstIsBool = typeof a === 'boolean'
	const firstIsSet = a instanceof Set

	if (!firstIsBool && !firstIsSet) {
		throw new TypeError(
			'andBoolStable operand 0 must be a plain boolean or a Set instance'
		)
	}

	if (firstIsBool) {
		for (let i = 1; i < operands.length; i++) {
			if (typeof operands[i] !== 'boolean') {
				throw new TypeError(
					`andBoolStable operand ${i} must be a plain boolean to match operand 0`
				)
			}
		}

		for (let i = 0; i < operands.length; i++) {
			if (!operands[i]) {
				return false
			}
		}
		return true
	}

	// Set mode: validate all operands up front before pivoting or short-circuiting.
	for (let i = 1; i < operands.length; i++) {
		if (!(operands[i] instanceof Set)) {
			throw new TypeError(
				`andBoolStable operand ${i} must be a Set instance to match operand 0`
			)
		}
	}

	// Deduplicate aliased Set references while preserving all distinct sets.
	const uniqueSets = []
	const seen = new Set()
	for (let i = 0; i < operands.length; i++) {
		const s = operands[i]
		if (s.size === 0) {
			return new Set()
		}
		if (!seen.has(s)) {
			seen.add(s)
			uniqueSets.push(s)
		}
	}

	// Cardinality pivoting: sort sets by ascending size so the smallest set is the pivot
	// and subsequent membership probes reject non-members as early as possible.
	uniqueSets.sort((x, y) => x.size - y.size)

	const pivot = uniqueSets[0]
	const result = new Set()

	if (uniqueSets.length === 1) {
		for (const item of pivot) {
			result.add(item)
		}
		return result
	}

	for (const item of pivot) {
		let inAll = true
		for (let i = 1; i < uniqueSets.length; i++) {
			if (!uniqueSets[i].has(item)) {
				inAll = false
				break
			}
		}
		if (inAll) {
			result.add(item)
		}
	}

	return result
}
