/**
 * Logical OR (set union / disjunction) over zero or more strictly increasing,
 * de-duplicated finite numeric arrays using merge-style algorithms.
 *
 * Mathematical model & identities:
 * - Each input array represents a finite subset of ℝ in canonical strictly
 *   increasing order: A = [a_0 < a_1 < ... < a_{m-1}].
 * - Pointwise indicator-function identity (disjunction):
 *     1_{A ∪ B}(x) = 1_A(x) ∨ 1_B(x) = 1_A(x) + 1_B(x) - 1_A(x)·1_B(x)
 * - For two arrays, a linear-time two-pointer merge scans both sequences in
 *   monotone lockstep, emitting equal elements once (corresponding to the
 *   -1_A·1_B inclusion-exclusion term). Closed-form short-circuits apply for
 *   the identity element (A ∪ ∅ = A), idempotence (A ∪ A = A), and disjoint
 *   ranges (max(A) < min(B) ⇒ A ∪ B = A ∥ B).
 * - For k ≥ 3 arrays, associativity of ∪ yields a balanced bottom-up dyadic
 *   pairwise merge series:
 *     ⋃_{i=0}^{k-1} A_i = (A_0 ∪ A_1) ∪ (A_2 ∪ A_3) ∪ ...
 *   achieving O(N log k) time where N = Σ |A_i|, avoiding the O(k·N) cost of
 *   unbalanced sequential left-folding.
 * - For k = 0 arguments, returns the empty-disjunction identity element [].
 * - Signed zero (-0) is normalized to +0, matching ECMAScript Set
 *   (SameValueZero) semantics and ensuring strict commutativity under Object.is.
 *
 * @param {...number[]} arrays - Zero or more strictly increasing arrays of finite numbers.
 * @returns {number[]} New strictly increasing, de-duplicated array representing the union.
 * @throws {TypeError} If any argument is not an Array, is sparse, or contains a non-number element.
 * @throws {RangeError} If any element is non-finite (NaN, ±Infinity) or any array is not strictly increasing (unsorted or contains duplicates).
 */
export function orSortedArrSeries(...arrays) {
	for (let k = 0; k < arrays.length; k++) {
		validateSortedUniqueArray(arrays[k], k)
	}

	if (arrays.length === 0) {
		return []
	}

	if (arrays.length === 1) {
		return copyNormalized(arrays[0])
	}

	if (arrays.length === 2) {
		return mergeTwoSorted(arrays[0], arrays[1])
	}

	// Filter out empty arrays using identity A ∪ ∅ = A.
	const nonEmpty = []
	for (let k = 0; k < arrays.length; k++) {
		if (arrays[k].length > 0) {
			nonEmpty.push(arrays[k])
		}
	}

	if (nonEmpty.length === 0) {
		return []
	}

	if (nonEmpty.length === 1) {
		return copyNormalized(nonEmpty[0])
	}

	// Balanced bottom-up dyadic pairwise merge series: O(N log k) time.
	let current = nonEmpty
	while (current.length > 1) {
		const next = []
		for (let i = 0; i < current.length; i += 2) {
			if (i + 1 < current.length) {
				next.push(mergeTwoSorted(current[i], current[i + 1]))
			} else {
				next.push(current[i])
			}
		}
		current = next
	}

	return current[0]
}

/**
 * Validates that an input is a dense Array of finite numbers in strictly
 * increasing order (sorted and de-duplicated).
 *
 * @param {unknown} arr - Candidate array.
 * @param {number} argIndex - Positional index for error messages.
 * @throws {TypeError} If not a dense Array of numbers.
 * @throws {RangeError} If elements are non-finite, unsorted, or duplicated.
 */
function validateSortedUniqueArray(arr, argIndex) {
	if (!Array.isArray(arr)) {
		throw new TypeError(
			`Argument at index ${argIndex} must be an Array of finite numbers.`
		)
	}

	let prev = -Infinity
	for (let i = 0; i < arr.length; i++) {
		if (!(i in arr)) {
			throw new TypeError(
				`Argument at index ${argIndex} must not be a sparse array (hole at index ${i}).`
			)
		}

		const val = arr[i]
		if (typeof val !== 'number') {
			throw new TypeError(
				`Argument at index ${argIndex} contains a non-number element at index ${i}.`
			)
		}

		if (!Number.isFinite(val)) {
			throw new RangeError(
				`Argument at index ${argIndex} contains a non-finite number at index ${i}: ${val}.`
			)
		}

		if (i > 0) {
			if (val === prev) {
				throw new RangeError(
					`Argument at index ${argIndex} contains a duplicate value (${val}) at index ${i}; arrays must be strictly increasing.`
				)
			}
			if (val < prev) {
				throw new RangeError(
					`Argument at index ${argIndex} is not sorted in strictly increasing order at index ${i} (${val} < ${prev}).`
				)
			}
		}

		prev = val
	}
}

/**
 * Returns a shallow copy of a validated numeric array with -0 normalized to +0.
 *
 * @param {number[]} arr
 * @returns {number[]}
 */
function copyNormalized(arr) {
	const len = arr.length
	const out = new Array(len)
	for (let i = 0; i < len; i++) {
		const v = arr[i]
		out[i] = v === 0 ? 0 : v
	}
	return out
}

/**
 * Concatenates two disjoint sorted arrays a and b where max(a) < min(b),
 * normalizing -0 to +0.
 *
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number[]}
 */
function concatNormalized(a, b) {
	const aLen = a.length
	const bLen = b.length
	const out = new Array(aLen + bLen)
	for (let i = 0; i < aLen; i++) {
		const v = a[i]
		out[i] = v === 0 ? 0 : v
	}
	for (let j = 0; j < bLen; j++) {
		const v = b[j]
		out[aLen + j] = v === 0 ? 0 : v
	}
	return out
}

/**
 * Merges two validated strictly increasing arrays into their sorted,
 * de-duplicated union using a two-pointer scan with algebraic short-circuits.
 *
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number[]}
 */
function mergeTwoSorted(a, b) {
	// Idempotence identity: A ∪ A = A
	if (a === b) {
		return copyNormalized(a)
	}

	const aLen = a.length
	const bLen = b.length

	// Identity element: ∅ ∪ B = B, A ∪ ∅ = A
	if (aLen === 0) {
		return copyNormalized(b)
	}
	if (bLen === 0) {
		return copyNormalized(a)
	}

	// Disjoint-range closed-form short-circuits: max(A) < min(B) or max(B) < min(A)
	if (a[aLen - 1] < b[0]) {
		return concatNormalized(a, b)
	}
	if (b[bLen - 1] < a[0]) {
		return concatNormalized(b, a)
	}

	// General linear-time two-pointer merge with deduplication
	const out = []
	let i = 0
	let j = 0

	while (i < aLen && j < bLen) {
		const av = a[i]
		const bv = b[j]
		if (av < bv) {
			out.push(av === 0 ? 0 : av)
			i++
		} else if (bv < av) {
			out.push(bv === 0 ? 0 : bv)
			j++
		} else {
			// av === bv: emit once (1_A + 1_B - 1_A·1_B = 1)
			out.push(av === 0 ? 0 : av)
			i++
			j++
		}
	}

	while (i < aLen) {
		const av = a[i++]
		out.push(av === 0 ? 0 : av)
	}

	while (j < bLen) {
		const bv = b[j++]
		out.push(bv === 0 ? 0 : bv)
	}

	return out
}
