/**
 * @typedef {Object} Dual
 * @property {number} v - Primal value component (finite real number).
 * @property {number} d - First-order forward-mode derivative component (finite real number).
 */

const DUAL_KEYS = Object.freeze(['v', 'd'])

/**
 * Normalizes negative zero (`-0`) to positive zero (`0`).
 *
 * @param {number} n
 * @returns {number}
 */
function normalizeZero(n) {
	return n === 0 ? 0 : n
}

/**
 * Validates that a value is a well-formed dual number `{ v, d }` with finite numeric components.
 *
 * @param {unknown} value - Candidate dual number.
 * @param {number} index - Zero-based argument index for diagnostic error messages.
 * @returns {Dual}
 * @throws {TypeError} If the argument is not a plain-like object or lacks numeric `v`/`d` properties.
 * @throws {RangeError} If `v` or `d` is not a finite number (`NaN`, `Infinity`, `-Infinity`).
 */
function validateDual(value, index) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(`Argument at index ${index} must be a dual number object { v, d }`)
	}
	if (typeof value.v !== 'number') {
		throw new TypeError(`Argument at index ${index} must have a numeric "v" property`)
	}
	if (typeof value.d !== 'number') {
		throw new TypeError(`Argument at index ${index} must have a numeric "d" property`)
	}
	if (!Number.isFinite(value.v)) {
		throw new RangeError(`Argument at index ${index} has a non-finite "v" value: ${value.v}`)
	}
	if (!Number.isFinite(value.d)) {
		throw new RangeError(`Argument at index ${index} has a non-finite "d" value: ${value.d}`)
	}
	return value
}

/**
 * Recursively validates a contiguous slice of dual number arguments using divide-and-conquer.
 *
 * @param {ReadonlyArray<unknown>} items
 * @param {number} start
 * @param {number} end
 * @returns {void}
 */
function validateDualSliceRecursive(items, start, end) {
	if (start === end) {
		validateDual(items[start], start)
		return
	}
	const mid = (start + end) >>> 1
	validateDualSliceRecursive(items, start, mid)
	validateDualSliceRecursive(items, mid + 1, end)
}

/**
 * Recursively combines two dual numbers component-by-component via divide-and-conquer
 * over the component key list `['v', 'd']`.
 *
 * @param {Dual} left
 * @param {Dual} right
 * @param {ReadonlyArray<'v' | 'd'>} keys
 * @param {number} start
 * @param {number} end
 * @param {(x: number, y: number) => number} op
 * @returns {Partial<Dual>}
 */
function combineComponentsRecursive(left, right, keys, start, end, op) {
	if (start === end) {
		const key = keys[start]
		return { [key]: normalizeZero(op(left[key], right[key])) }
	}
	const mid = (start + end) >>> 1
	const leftPart = combineComponentsRecursive(left, right, keys, start, mid, op)
	const rightPart = combineComponentsRecursive(left, right, keys, mid + 1, end, op)
	return { ...leftPart, ...rightPart }
}

/**
 * Recursively sums a non-empty slice of dual numbers using divide-and-conquer
 * pairwise summation, achieving O(log n) recursion depth.
 *
 * @param {ReadonlyArray<Dual>} duals
 * @param {number} start
 * @param {number} end
 * @returns {Dual}
 */
function sumDualDivideAndConquer(duals, start, end) {
	if (start === end) {
		const item = duals[start]
		return { v: normalizeZero(item.v), d: normalizeZero(item.d) }
	}
	const mid = (start + end) >>> 1
	const leftSum = sumDualDivideAndConquer(duals, start, mid)
	const rightSum = sumDualDivideAndConquer(duals, mid + 1, end)
	return /** @type {Dual} */ (
		combineComponentsRecursive(leftSum, rightSum, DUAL_KEYS, 0, DUAL_KEYS.length - 1, (x, y) => x + y)
	)
}

/**
 * Subtracts one or more dual numbers `{ v, d }` from an initial minuend dual number
 * using a recursive divide-and-conquer strategy.
 *
 * Dual numbers represent `v + d*ε` with `ε² = 0`, carrying a primal value `v` alongside
 * its forward-mode derivative `d`. Subtraction is linear on both components:
 *
 *     (a_v + a_d*ε) - Σ (b_{i,v} + b_{i,d}*ε) = (a_v - Σ b_{i,v}) + (a_d - Σ b_{i,d})*ε
 *
 * For variadic inputs `(a, b, c, ...)`, the subtrahends `[b, c, ...]` are recursively
 * aggregated via divide-and-conquer pairwise summation (O(log n) stack depth), and the
 * combined subtrahend is subtracted from `a` via recursive component decomposition.
 *
 * @param {Dual} a - Minuend dual number `{ v, d }`.
 * @param {Dual} b - First subtrahend dual number `{ v, d }`.
 * @param {...Dual} rest - Optional additional subtrahend dual numbers `{ v, d }` for chained subtraction.
 * @returns {Dual} New dual number representing `a - b - ...rest`.
 * @throws {TypeError} If fewer than two arguments are provided or any argument is not a valid `{ v, d }` object with numeric fields.
 * @throws {RangeError} If any dual number contains a non-finite (`NaN`, `Infinity`, `-Infinity`) component.
 */
export function subtractDualRecursive(a, b, ...rest) {
	if (arguments.length < 2) {
		throw new TypeError(`subtractDualRecursive requires at least 2 dual number arguments, received ${arguments.length}`)
	}

	const allArgs = [a, b, ...rest]
	validateDualSliceRecursive(allArgs, 0, allArgs.length - 1)

	const subtrahendTotal = sumDualDivideAndConquer(allArgs, 1, allArgs.length - 1)

	return /** @type {Dual} */ (
		combineComponentsRecursive(a, subtrahendTotal, DUAL_KEYS, 0, DUAL_KEYS.length - 1, (x, y) => x - y)
	)
}
