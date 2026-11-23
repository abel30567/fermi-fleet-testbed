/**
 * Validates that a value is a strictly ascending, de-duplicated array of finite numbers.
 *
 * @param {unknown} arr - Candidate input to validate.
 * @param {number} argIndex - Zero-based argument index for diagnostic messages.
 * @throws {TypeError} If `arr` is not an Array, is sparse, or contains a non-finite/non-number element.
 * @throws {RangeError} If `arr` is not strictly ascending (unsorted or contains duplicate elements).
 */
function validateSortedUniqueArray(arr, argIndex) {
	if (!Array.isArray(arr)) {
		throw new TypeError(
			`Argument at index ${argIndex} must be an Array; received ${arr === null ? 'null' : typeof arr}`,
		);
	}

	for (let i = 0; i < arr.length; i++) {
		if (!(i in arr)) {
			throw new TypeError(
				`Argument at index ${argIndex} must not be a sparse array (hole at index ${i})`,
			);
		}
		const val = arr[i];
		if (typeof val !== 'number' || !Number.isFinite(val)) {
			throw new TypeError(
				`Argument at index ${argIndex} must contain only finite numbers (invalid value at index ${i})`,
			);
		}
		if (i > 0) {
			const prev = arr[i - 1];
			if (val === prev) {
				throw new RangeError(
					`Argument at index ${argIndex} must be de-duplicated (duplicate value ${val} at index ${i})`,
				);
			}
			if (val < prev) {
				throw new RangeError(
					`Argument at index ${argIndex} must be sorted in strictly ascending order (${prev} > ${val} at index ${i})`,
				);
			}
		}
	}
}

/**
 * Normalizes `-0` to `+0` so algebraic identities (e.g. commutativity) hold under `Object.is`.
 *
 * @param {number} x - Finite number.
 * @returns {number} Normalized finite number.
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x;
}

/**
 * Copies an array while normalizing `-0` to `+0`.
 *
 * @param {number[]} arr - Validated sorted, de-duplicated array.
 * @returns {number[]} Shallow normalized copy.
 */
function copyNormalized(arr) {
	const out = new Array(arr.length);
	for (let i = 0; i < arr.length; i++) {
		out[i] = normalizeZero(arr[i]);
	}
	return out;
}

/**
 * Computes the logical OR (set union) of two validated sorted, de-duplicated arrays
 * using closed-form algebraic identities and a linear merge driven by the Boolean
 * inclusion-exclusion / De Morgan indicator identity:
 *
 *   1_{A U B}(x) = 1 - (1 - 1_A(x))(1 - 1_B(x)) = 1_A(x) + 1_B(x) - 1_A(x) * 1_B(x)
 *
 * @param {number[]} a - First validated sorted, de-duplicated array.
 * @param {number[]} b - Second validated sorted, de-duplicated array.
 * @returns {number[]} Strictly ascending, de-duplicated union of `a` and `b`.
 */
function mergeOrTwo(a, b) {
	const lenA = a.length;
	const lenB = b.length;

	// Identity law: A U {} = A, {} U B = B
	if (lenA === 0) return copyNormalized(b);
	if (lenB === 0) return copyNormalized(a);

	// Idempotence law: A U A = A
	if (a === b) return copyNormalized(a);

	// Ordered-interval disjointness identity:
	// If max(A) < min(B), then A n B = {} and A U B = A || B (and symmetrically for B, A).
	if (a[lenA - 1] < b[0]) {
		const out = new Array(lenA + lenB);
		for (let i = 0; i < lenA; i++) out[i] = normalizeZero(a[i]);
		for (let j = 0; j < lenB; j++) out[lenA + j] = normalizeZero(b[j]);
		return out;
	}
	if (b[lenB - 1] < a[0]) {
		const out = new Array(lenA + lenB);
		for (let j = 0; j < lenB; j++) out[j] = normalizeZero(b[j]);
		for (let i = 0; i < lenA; i++) out[lenB + i] = normalizeZero(a[i]);
		return out;
	}

	// Merge-style pass evaluating the indicator identity:
	//   ind_OR(p, q) = p + q - p*q = 1 - (1 - p)(1 - q)
	// For the minimum frontier element x = min(a[i], b[j]):
	//   - a[i] < b[j]  => (p, q) = (1, 0), contribution to A \ B
	//   - b[j] < a[i]  => (p, q) = (0, 1), contribution to B \ A
	//   - a[i] === b[j] => (p, q) = (1, 1), contribution to A n B (deduplicated via -p*q)
	const result = [];
	let i = 0;
	let j = 0;

	while (i < lenA && j < lenB) {
		const va = a[i];
		const vb = b[j];
		const x = va <= vb ? va : vb;
		const p = va === x ? 1 : 0;
		const q = vb === x ? 1 : 0;

		if (p + q - p * q === 1) {
			result.push(normalizeZero(x));
		}

		i += p;
		j += q;
	}

	// Remaining tail has (p, q) = (1, 0) or (0, 1), so ind_OR = 1 identically.
	while (i < lenA) {
		result.push(normalizeZero(a[i++]));
	}
	while (j < lenB) {
		result.push(normalizeZero(b[j++]));
	}

	return result;
}

/**
 * Computes the logical OR (set union) over two or more strictly ascending, de-duplicated
 * arrays of finite numbers using a merge-style algorithm backed by closed-form algebraic
 * identities (identity, idempotence, ordered-interval disjointness, associativity, and
 * the inclusion-exclusion / De Morgan indicator identity `1 - (1 - p)(1 - q) = p + q - pq`).
 *
 * For more than two arrays, applies a balanced divide-and-conquer merge exploiting
 * associativity of set union in O(N log k) time where N is the total element count
 * and k is the number of input arrays.
 *
 * @param {number[]} a - First strictly ascending, de-duplicated array of finite numbers.
 * @param {number[]} b - Second strictly ascending, de-duplicated array of finite numbers.
 * @param {...number[]} rest - Optional additional strictly ascending, de-duplicated arrays.
 * @returns {number[]} New strictly ascending, de-duplicated array containing the logical OR (union).
 * @throws {TypeError} If fewer than two arguments are provided, or any input is not a dense array of finite numbers.
 * @throws {RangeError} If any input array is not strictly ascending or contains duplicate values.
 */
export function orSortedArrSeries(a, b, ...rest) {
	if (arguments.length < 2) {
		throw new TypeError(
			`orSortedArrSeries requires at least 2 sorted, de-duplicated arrays; received ${arguments.length}`,
		);
	}

	const arrays = [a, b, ...rest];
	for (let idx = 0; idx < arrays.length; idx++) {
		validateSortedUniqueArray(arrays[idx], idx);
	}

	if (arrays.length === 2) {
		return mergeOrTwo(arrays[0], arrays[1]);
	}

	// Balanced pairwise reduction via associativity:
	//   U_{m=1..k} A_m = (U_{m=1..floor(k/2)} A_m) U (U_{m=floor(k/2)+1..k} A_m)
	let layer = arrays;
	while (layer.length > 1) {
		const next = [];
		for (let idx = 0; idx < layer.length; idx += 2) {
			if (idx + 1 < layer.length) {
				next.push(mergeOrTwo(layer[idx], layer[idx + 1]));
			} else {
				next.push(layer[idx]);
			}
		}
		layer = next;
	}

	return layer[0];
}
