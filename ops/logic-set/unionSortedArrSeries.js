/**
 * Normalizes `-0` to `+0` so numeric set elements have a single canonical
 * IEEE-754 representation for zero.
 *
 * @param {number} value - A finite numeric value.
 * @returns {number} The value with `-0` normalized to `0`.
 */
function normalizeZero(value) {
	return value === 0 ? 0 : value;
}

/**
 * Validates that an argument is a strictly increasing array of finite numbers
 * (sorted in ascending order with no duplicate values).
 *
 * @param {unknown} arr - Candidate input array.
 * @param {number} argIndex - Zero-based argument index for diagnostic messages.
 * @throws {TypeError} If `arr` is not an Array or contains non-number elements.
 * @throws {RangeError} If `arr` contains non-finite numbers (`NaN`, `±Infinity`),
 *   duplicate values, or elements not in strictly ascending order.
 */
function validateSortedUniqueArray(arr, argIndex) {
	if (!Array.isArray(arr)) {
		throw new TypeError(
			`Argument at index ${argIndex} must be an Array of finite numbers.`
		);
	}

	let prev = -Infinity;
	for (let i = 0; i < arr.length; i++) {
		const value = arr[i];
		if (typeof value !== 'number') {
			throw new TypeError(
				`Element at argument ${argIndex}, index ${i} must be a number.`
			);
		}
		if (!Number.isFinite(value)) {
			throw new RangeError(
				`Element at argument ${argIndex}, index ${i} must be a finite number.`
			);
		}
		if (i > 0) {
			if (value === prev) {
				throw new RangeError(
					`Argument at index ${argIndex} contains duplicate value ${value} at index ${i}; input arrays must be de-duplicated.`
				);
			}
			if (value < prev) {
				throw new RangeError(
					`Argument at index ${argIndex} is not strictly sorted in ascending order at index ${i} (${prev} followed by ${value}).`
				);
			}
		}
		prev = value;
	}
}

/**
 * Computes the set union of two already-validated, strictly increasing numeric
 * arrays using a linear-time two-pointer merge.
 *
 * Loop invariant: `out` is strictly increasing and contains every distinct
 * element from `a[0..i-1]` and `b[0..j-1]`.
 *
 * @param {readonly number[]} a - First strictly increasing finite numeric array.
 * @param {readonly number[]} b - Second strictly increasing finite numeric array.
 * @returns {number[]} Strictly increasing union `a ∪ b`.
 */
function mergeTwoSortedUnique(a, b) {
	const lenA = a.length;
	const lenB = b.length;

	if (lenA === 0) {
		const copy = new Array(lenB);
		for (let j = 0; j < lenB; j++) {
			copy[j] = normalizeZero(b[j]);
		}
		return copy;
	}
	if (lenB === 0) {
		const copy = new Array(lenA);
		for (let i = 0; i < lenA; i++) {
			copy[i] = normalizeZero(a[i]);
		}
		return copy;
	}

	const out = [];
	let i = 0;
	let j = 0;

	while (i < lenA && j < lenB) {
		const va = a[i];
		const vb = b[j];
		if (va < vb) {
			out.push(normalizeZero(va));
			i++;
		} else if (vb < va) {
			out.push(normalizeZero(vb));
			j++;
		} else {
			out.push(normalizeZero(va));
			i++;
			j++;
		}
	}

	while (i < lenA) {
		out.push(normalizeZero(a[i++]));
	}
	while (j < lenB) {
		out.push(normalizeZero(b[j++]));
	}

	return out;
}

/**
 * Computes the set union over zero or more sorted, de-duplicated finite numeric
 * arrays using a two-pointer merge and balanced bottom-up pairwise
 * divide-and-conquer k-way merge series.
 *
 * Mathematical definition & identities:
 * - Nullary union (identity element): `⋃∅ = ∅` (returns `[]`).
 * - Binary union: `A ∪ B = { x | x ∈ A ∨ x ∈ B }`, preserving strict ascending
 *   order and satisfying the inclusion-exclusion identity
 *   `|A ∪ B| = |A| + |B| - |A ∩ B|`.
 * - k-way union via associative pairwise reduction series:
 *   `⋃_{r=0}^{k-1} A_r` is reduced across `⌈log₂ k⌉` passes by merging adjacent
 *   pairs `(C_{2t}, C_{2t+1}) ↦ C_{2t} ∪ C_{2t+1}` until a single sorted,
 *   de-duplicated array remains.
 *
 * Complexity:
 * - Binary (`k = 2`): `O(|A| + |B|)` time, `O(|A ∪ B|)` auxiliary space.
 * - General (`k ≥ 2`): `O(N log k)` time where `N = ∑ |A_r|`, `O(N)` space,
 *   and `O(1)` call stack depth.
 *
 * Input arrays are never mutated; `-0` values are canonicalized to `0`.
 *
 * @param {...(readonly number[])} arrays - Zero or more strictly increasing
 *   arrays of finite numbers (sorted ascending, de-duplicated).
 * @returns {number[]} A new strictly increasing, de-duplicated array containing
 *   the union of all input arrays.
 * @throws {TypeError} If any argument is not an Array or contains a non-number
 *   element.
 * @throws {RangeError} If any element is non-finite (`NaN`, `Infinity`,
 *   `-Infinity`), or if any input array is not strictly increasing (contains
 *   duplicates or out-of-order elements).
 */
export function unionSortedArrSeries(...arrays) {
	const k = arrays.length;
	for (let idx = 0; idx < k; idx++) {
		validateSortedUniqueArray(arrays[idx], idx);
	}

	if (k === 0) {
		return [];
	}

	if (k === 1) {
		const src = arrays[0];
		const copy = new Array(src.length);
		for (let i = 0; i < src.length; i++) {
			copy[i] = normalizeZero(src[i]);
		}
		return copy;
	}

	if (k === 2) {
		return mergeTwoSortedUnique(arrays[0], arrays[1]);
	}

	// Balanced bottom-up pairwise merge series: O(N log k) time, O(1) stack.
	let current = arrays;
	while (current.length > 1) {
		const next = [];
		const len = current.length;
		for (let i = 0; i < len; i += 2) {
			if (i + 1 < len) {
				next.push(mergeTwoSortedUnique(current[i], current[i + 1]));
			} else {
				next.push(current[i]);
			}
		}
		current = next;
	}

	return current[0];
}
