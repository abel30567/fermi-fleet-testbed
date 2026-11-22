/**
 * Validates that an input is an array of strictly increasing finite numbers
 * (sorted in ascending order and de-duplicated).
 *
 * @param {unknown} arr - Value to validate.
 * @param {string} name - Parameter name for error messages.
 * @throws {TypeError} If `arr` is not an Array or contains a non-number element.
 * @throws {RangeError} If `arr` contains a non-finite number (NaN, ±Infinity),
 *   duplicate elements, or elements not in strictly ascending order.
 */
function validateSortedUniqueArray(arr, name) {
	if (!Array.isArray(arr)) {
		throw new TypeError(`${name} must be an Array of finite numbers`)
	}

	for (let i = 0; i < arr.length; i++) {
		const value = arr[i]
		if (typeof value !== 'number') {
			throw new TypeError(`${name}[${i}] must be a number, got ${typeof value}`)
		}
		if (!Number.isFinite(value)) {
			throw new RangeError(`${name}[${i}] must be a finite number, got ${value}`)
		}
		if (i > 0) {
			const prev = arr[i - 1]
			if (value === prev) {
				throw new RangeError(
					`${name} must be de-duplicated (duplicate value ${value} at indices ${i - 1} and ${i})`
				)
			}
			if (value < prev) {
				throw new RangeError(
					`${name} must be sorted in strictly ascending order (${prev} > ${value} at indices ${i - 1} and ${i})`
				)
			}
		}
	}
}

/**
 * Computes the logical NOT (set complement `U \ A`) of a sorted, de-duplicated
 * finite numeric array `a` relative to a sorted, de-duplicated finite numeric
 * universe array `universe`.
 *
 * ## Mathematical Formulation (Indicator Identity)
 * Over a finite totally ordered universe $U = \{u_0 < u_1 < \dots < u_{m-1}\}$,
 * the characteristic (indicator) function $\mathbf{1}_S : U \to \{0, 1\}$ satisfies
 * the exact closed-form / finite-series Boolean complement identity:
 *
 * $$\mathbf{1}_{U \setminus A}(u) = 1 - \mathbf{1}_A(u) = \sum_{k=0}^{1} (-1)^k \mathbf{1}_A(u)^k \quad (\forall u \in U)$$
 *
 * Thus:
 * $$\neg_U A = U \setminus A = \{ u \in U \mid 1 - \mathbf{1}_A(u) = 1 \} = U \setminus (A \cap U).$$
 *
 * ## Algorithm
 * Exploiting the strict total order on both `a` and `universe`, a single
 * two-pointer merge-style linear scan evaluates $\mathbf{1}_A(u_j)$ for every
 * $u_j \in U$ in $O(|A| + |U|)$ time and $O(|U \setminus A|)$ auxiliary space:
 * 1. Validate that both `a` and `universe` are strictly increasing arrays of
 *    finite numbers.
 * 2. Advance pointer `i` in `a` past all elements strictly smaller than
 *    `u = universe[j]`.
 * 3. Compute the indicator `inA = (i < a.length && a[i] === u) ? 1 : 0`.
 * 4. Apply the complement identity `inComplement = 1 - inA`: emit `u` when
 *    `inComplement === 1`, otherwise advance `i` past the matched element.
 *
 * Because `universe` is strictly increasing and emitted in order, the returned
 * array is guaranteed to be strictly increasing and de-duplicated. Neither input
 * array is mutated.
 *
 * @param {readonly number[]} a - Sorted, de-duplicated array of finite numbers representing set `A`.
 * @param {readonly number[]} universe - Sorted, de-duplicated array of finite numbers representing universe `U`.
 * @returns {number[]} New sorted, de-duplicated array containing the complement `U \ A`.
 * @throws {TypeError} If `a` or `universe` is not an Array, or contains any non-number element.
 * @throws {RangeError} If `a` or `universe` contains any non-finite number (`NaN`, `±Infinity`),
 *   duplicate values, or unsorted elements.
 */
export function notSortedArrSeries(a, universe) {
	validateSortedUniqueArray(a, 'a')
	validateSortedUniqueArray(universe, 'universe')

	const result = []
	let i = 0
	const aLen = a.length
	const uLen = universe.length

	for (let j = 0; j < uLen; j++) {
		const u = universe[j]

		// Advance pointer in `a` past elements strictly smaller than `u`
		while (i < aLen && a[i] < u) {
			i++
		}

		// Evaluate indicator 1_A(u) and apply closed-form complement identity 1_{U\A}(u) = 1 - 1_A(u)
		const indicatorA = i < aLen && a[i] === u ? 1 : 0
		const indicatorNotA = 1 - indicatorA

		if (indicatorNotA === 1) {
			result.push(u)
		} else {
			i++
		}
	}

	return result
}
