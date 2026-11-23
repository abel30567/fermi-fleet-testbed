/**
 * Computes the logical OR over plain booleans or the union over JS `Set` objects
 * using a recursive divide-and-conquer strategy.
 *
 * Accepts either variadic operands (`orBoolRecursive(a, b, ...)`) or a single
 * array of operands (`orBoolRecursive([a, b, ...])`). All operands must either
 * be plain booleans (`typeof x === 'boolean'`) or all be `Set` instances
 * (`x instanceof Set`).
 *
 * - For plain booleans: returns `true` if at least one operand is `true`,
 *   otherwise `false`. An empty array `[]` returns the disjunction identity `false`.
 * - For `Set` objects: returns a new `Set` containing the union of all input sets
 *   in left-to-right insertion order without mutating any input set.
 *
 * @param {...(boolean | Set<any> | Array<boolean> | Array<Set<any>>)} args
 *   One or more plain booleans, one or more `Set` instances, or a single array
 *   containing all plain booleans or all `Set` instances.
 * @returns {boolean | Set<any>} Logical OR result (`boolean`) or set union (`Set`).
 * @throws {TypeError} If no arguments are provided, or if operands are not all
 *   plain booleans or all `Set` instances.
 */
export function orBoolRecursive(...args) {
	if (args.length === 0) {
		throw new TypeError('orBoolRecursive requires at least one boolean or Set operand')
	}

	const items = args.length === 1 && Array.isArray(args[0]) ? args[0] : args

	if (items.length === 0) {
		return false
	}

	if (!(0 in items)) {
		throw new TypeError('Operand at index 0 is missing (sparse array is not allowed)')
	}

	const first = items[0]

	if (typeof first === 'boolean') {
		for (let i = 1; i < items.length; i++) {
			if (!(i in items) || typeof items[i] !== 'boolean') {
				throw new TypeError(
					`Expected all operands to be plain booleans, but got ${describeValue(items[i], i in items)} at index ${i}`
				)
			}
		}
		return orBooleansDivideAndConquer(items, 0, items.length)
	}

	if (first instanceof Set) {
		for (let i = 1; i < items.length; i++) {
			if (!(i in items) || !(items[i] instanceof Set)) {
				throw new TypeError(
					`Expected all operands to be Set instances, but got ${describeValue(items[i], i in items)} at index ${i}`
				)
			}
		}
		return unionSetsDivideAndConquer(items, 0, items.length)
	}

	throw new TypeError(
		`Expected operands to be plain booleans or Set instances, but got ${describeValue(first, true)} at index 0`
	)
}

/**
 * Recursively computes logical OR over `items[start..end)` using divide-and-conquer.
 *
 * @param {boolean[]} items
 * @param {number} start
 * @param {number} end
 * @returns {boolean}
 */
function orBooleansDivideAndConquer(items, start, end) {
	const len = end - start
	if (len === 1) {
		return items[start]
	}
	if (len === 2) {
		return items[start] || items[start + 1]
	}
	const mid = start + (len >>> 1)
	if (orBooleansDivideAndConquer(items, start, mid)) {
		return true
	}
	return orBooleansDivideAndConquer(items, mid, end)
}

/**
 * Recursively computes the union over `sets[start..end)` using divide-and-conquer.
 * Always returns a freshly allocated `Set` without mutating any input set.
 *
 * @param {Set<any>[]} sets
 * @param {number} start
 * @param {number} end
 * @returns {Set<any>}
 */
function unionSetsDivideAndConquer(sets, start, end) {
	const len = end - start
	if (len === 1) {
		return new Set(sets[start])
	}
	if (len === 2) {
		const merged = new Set(sets[start])
		for (const value of sets[start + 1]) {
			merged.add(value)
		}
		return merged
	}
	const mid = start + (len >>> 1)
	const left = unionSetsDivideAndConquer(sets, start, mid)
	const right = unionSetsDivideAndConquer(sets, mid, end)
	for (const value of right) {
		left.add(value)
	}
	return left
}

/**
 * Formats a value's type for clear validation error messages.
 *
 * @param {unknown} value
 * @param {boolean} exists
 * @returns {string}
 */
function describeValue(value, exists) {
	if (!exists) return 'empty slot'
	if (value === null) return 'null'
	if (Array.isArray(value)) return 'Array'
	if (typeof value === 'object') {
		return value.constructor?.name ?? 'Object'
	}
	return typeof value
}
