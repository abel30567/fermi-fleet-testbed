/**
 * Checks whether two numbers are equal within combined absolute and scaled
 * relative error bounds without risking overflow on large magnitudes.
 *
 * @param {number} x - First value.
 * @param {number} y - Second value.
 * @param {number} absTol - Non-negative finite absolute tolerance.
 * @param {number} relTol - Finite relative tolerance in [0, 1).
 * @returns {boolean} True when |x - y| <= absTol + relTol * max(|x|, |y|).
 */
function withinErrorBound(x, y, absTol, relTol) {
	if (x === y) return true
	if (absTol === 0 && relTol === 0) return false
	if (!Number.isFinite(x) || !Number.isFinite(y)) return false

	const ax = Math.abs(x)
	const ay = Math.abs(y)
	const scale = ax >= ay ? ax : ay

	// Scale before subtracting for large magnitudes so x - y cannot overflow to Infinity.
	if (scale > 1e150) {
		return Math.abs(x / scale - y / scale) <= relTol + absTol / scale
	}

	return Math.abs(x - y) <= absTol + relTol * scale
}

/**
 * Normalizes IEEE-754 negative zero (-0) to canonical positive zero (+0).
 *
 * @param {number} x - Numeric value.
 * @returns {number} Canonicalized value.
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x
}

/**
 * Validates that an input is a sorted (non-decreasing) array of non-NaN numbers.
 *
 * @param {unknown} arr - Candidate input array.
 * @param {string} name - Parameter name for diagnostics.
 */
function validateSortedNumericArray(arr, name) {
	if (!Array.isArray(arr)) {
		throw new TypeError(`${name} must be an Array`)
	}
	for (let i = 0; i < arr.length; i++) {
		const v = arr[i]
		if (typeof v !== 'number' || Number.isNaN(v)) {
			throw new TypeError(`${name}[${i}] must be a non-NaN number`)
		}
		if (i > 0 && v < arr[i - 1]) {
			throw new RangeError(`${name} must be sorted in non-decreasing order (inversion at index ${i})`)
		}
	}
}

/**
 * Validates and extracts error-bound options.
 *
 * @param {unknown} options - Optional configuration object.
 * @returns {{ absTol: number, relTol: number }} Normalized tolerances.
 */
function parseOptions(options) {
	if (options === undefined) {
		return { absTol: 0, relTol: 0 }
	}
	if (typeof options !== 'object' || options === null || Array.isArray(options)) {
		throw new TypeError('options must be a plain object')
	}

	const { absTol = 0, relTol = 0 } = options

	if (typeof absTol !== 'number' || Number.isNaN(absTol)) {
		throw new TypeError('options.absTol must be a number')
	}
	if (!Number.isFinite(absTol) || absTol < 0) {
		throw new RangeError('options.absTol must be a finite number >= 0')
	}

	if (typeof relTol !== 'number' || Number.isNaN(relTol)) {
		throw new TypeError('options.relTol must be a number')
	}
	if (!Number.isFinite(relTol) || relTol < 0 || relTol >= 1) {
		throw new RangeError('options.relTol must be a finite number in [0, 1)')
	}

	return { absTol, relTol }
}

/**
 * Computes the set union of two sorted (non-decreasing) numeric arrays using a
 * single-pass, left-stable merge algorithm with numerically robust comparisons.
 *
 * Numerical stability guarantees:
 * - Uses direct order comparisons (`<`) instead of subtraction (`a - b`) to
 *   prevent overflow on extreme magnitudes (e.g. ±Number.MAX_VALUE).
 * - Supports optional combined absolute and scaled relative error bounds
 *   (`|x - y| <= absTol + relTol * max(|x|, |y|)`) evaluated with magnitude
 *   scaling so large-value comparisons cannot overflow.
 * - Anchors deduplication against the last emitted representative to prevent
 *   tolerance drift chains, and stably prefers elements from `a` on ties.
 * - Normalizes `-0` to `+0`, handles `±Infinity`, and rejects `NaN` or unsorted inputs.
 *
 * @param {readonly number[]} a - First sorted numeric array.
 * @param {readonly number[]} b - Second sorted numeric array.
 * @param {{ absTol?: number, relTol?: number }} [options] - Optional error-bound settings.
 * @returns {number[]} Strictly ascending, de-duplicated union of `a` and `b`.
 */
export function unionSortedArrStable(a, b, options) {
	validateSortedNumericArray(a, 'a')
	validateSortedNumericArray(b, 'b')
	const { absTol, relTol } = parseOptions(options)

	const result = []
	let hasLast = false
	let last = 0
	let i = 0
	let j = 0

	while (i < a.length && j < b.length) {
		const va = normalizeZero(a[i])
		if (hasLast && withinErrorBound(last, va, absTol, relTol)) {
			i++
			continue
		}

		const vb = normalizeZero(b[j])
		if (hasLast && withinErrorBound(last, vb, absTol, relTol)) {
			j++
			continue
		}

		if (withinErrorBound(va, vb, absTol, relTol)) {
			result.push(va)
			last = va
			hasLast = true
			i++
			j++
		} else if (va < vb) {
			result.push(va)
			last = va
			hasLast = true
			i++
		} else {
			result.push(vb)
			last = vb
			hasLast = true
			j++
		}
	}

	while (i < a.length) {
		const va = normalizeZero(a[i++])
		if (!hasLast || !withinErrorBound(last, va, absTol, relTol)) {
			result.push(va)
			last = va
			hasLast = true
		}
	}

	while (j < b.length) {
		const vb = normalizeZero(b[j++])
		if (!hasLast || !withinErrorBound(last, vb, absTol, relTol)) {
			result.push(vb)
			last = vb
			hasLast = true
		}
	}

	return result
}
