/**
 * Validates that an input is a strictly increasing array of finite numbers,
 * returning a shallow copy with `-0` normalized to `+0` (SameValueZero
 * canonical form).
 *
 * @param {unknown} input - Candidate array to validate.
 * @param {number} argIndex - Position of the argument for error diagnostics.
 * @returns {number[]} Validated, normalized copy of the array.
 * @throws {TypeError} If `input` is not an Array or contains non-number / sparse elements.
 * @throws {RangeError} If any element is non-finite (`NaN`, `±Infinity`), unsorted, or duplicated.
 */
function validateSortedUniqueArray(input, argIndex) {
	if (!Array.isArray(input)) {
		throw new TypeError(`Argument at index ${argIndex} must be an Array`);
	}

	const len = input.length;
	const out = new Array(len);

	for (let i = 0; i < len; i++) {
		if (!(i in input)) {
			throw new TypeError(
				`Argument at index ${argIndex} contains a sparse hole at element ${i}`
			);
		}
		const val = input[i];
		if (typeof val !== 'number') {
			throw new TypeError(
				`Argument at index ${argIndex} must contain only numbers (found ${typeof val} at element ${i})`
			);
		}
		if (!Number.isFinite(val)) {
			throw new RangeError(
				`Argument at index ${argIndex} must contain only finite numbers (found ${val} at element ${i})`
			);
		}

		const normalized = val === 0 ? 0 : val;
		if (i > 0) {
			const prev = out[i - 1];
			if (normalized === prev) {
				throw new RangeError(
					`Argument at index ${argIndex} must be de-duplicated (duplicate ${normalized} at element ${i})`
				);
			}
			if (normalized < prev) {
				throw new RangeError(
					`Argument at index ${argIndex} must be strictly increasing (${normalized} < ${prev} at element ${i})`
				);
			}
		}

		out[i] = normalized;
	}

	return out;
}

/**
 * Computes the binary symmetric difference `A Δ B = (A \ B) ∪ (B \ A)`
 * of two strictly increasing arrays of finite numbers using a two-pointer
 * merge scan in `O(|A| + |B|)` time.
 *
 * @param {number[]} a - First validated strictly increasing numeric array.
 * @param {number[]} b - Second validated strictly increasing numeric array.
 * @returns {number[]} Strictly increasing array representing `A Δ B`.
 */
function xorSortedPair(a, b) {
	const result = [];
	const lenA = a.length;
	const lenB = b.length;
	let i = 0;
	let j = 0;

	while (i < lenA && j < lenB) {
		const va = a[i];
		const vb = b[j];
		if (va < vb) {
			// va ∈ A \ B
			result.push(va);
			i++;
		} else if (vb < va) {
			// vb ∈ B \ A
			result.push(vb);
			j++;
		} else {
			// va === vb ∈ A ∩ B: excluded by symmetric difference
			i++;
			j++;
		}
	}

	while (i < lenA) {
		result.push(a[i++]);
	}
	while (j < lenB) {
		result.push(b[j++]);
	}

	return result;
}

/**
 * Computes the logical XOR (n-ary symmetric difference) over a series of
 * sorted, de-duplicated finite numeric arrays.
 *
 * ### Mathematical Formulation
 * - **Binary identity**:
 *   `A Δ B = (A \ B) ∪ (B \ A) = (A ∪ B) \ (A ∩ B)`
 *   evaluated via a linear two-pointer merge scan.
 * - **N-ary series / parity identity**:
 *   `A_0 Δ A_1 Δ ... Δ A_{k-1} = { x | Σ_{m=0}^{k-1} 1_{A_m}(x) ≡ 1 (mod 2) }`,
 *   i.e., the sorted set of elements appearing in an odd number of input arrays.
 * - **Associative reduction**:
 *   Because `(P(S), Δ, ∅)` forms an abelian group (associative, commutative,
 *   identity `[]`, self-inverse `A Δ A = []`), the series is evaluated via a
 *   balanced pairwise merge tree in `O(N log k)` time and `O(N)` space, where
 *   `N = Σ |A_m|` and `k` is the number of input arrays.
 *
 * Input arrays are never mutated, and `-0` is normalized to `+0` so that zero
 * has a single canonical representation matching `Set` (SameValueZero) semantics.
 *
 * @param {...number[]} arrays - Zero or more strictly increasing arrays of finite numbers.
 * @returns {number[]} A new strictly increasing array containing elements present in an odd number of inputs.
 * @throws {TypeError} If any argument is not an Array, is sparse, or contains non-number elements.
 * @throws {RangeError} If any element is non-finite (`NaN`, `±Infinity`), or any array is not strictly increasing (unsorted or contains duplicates).
 */
export function xorSortedArrSeries(...arrays) {
	const k = arrays.length;
	if (k === 0) {
		return [];
	}

	// Validate all inputs up front and produce normalized copies.
	let level = new Array(k);
	for (let i = 0; i < k; i++) {
		level[i] = validateSortedUniqueArray(arrays[i], i);
	}

	if (k === 1) {
		return level[0];
	}

	// Balanced pairwise merge reduction exploiting associativity of Δ: O(N log k).
	while (level.length > 1) {
		const next = [];
		for (let i = 0; i < level.length; i += 2) {
			if (i + 1 < level.length) {
				next.push(xorSortedPair(level[i], level[i + 1]));
			} else {
				next.push(level[i]);
			}
		}
		level = next;
	}

	return level[0];
}
