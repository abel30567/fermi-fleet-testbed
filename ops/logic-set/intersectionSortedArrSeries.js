/**
 * Ratio threshold above which two-way intersection switches from a linear
 * two-pointer merge to an exponential (galloping) merge.
 *
 * When `n > m * GALLOP_RATIO`, galloping achieves O(m log(1 + n / m))
 * comparisons versus O(m + n) for linear merge.
 */
const GALLOP_RATIO = 8;

/**
 * Validates that an input is a strictly increasing, de-duplicated array of
 * finite numbers.
 *
 * @param {unknown} arr - Candidate array to validate.
 * @param {number} argIndex - Positional index for error reporting.
 * @throws {TypeError} If `arr` is not an Array or contains non-number/hole entries.
 * @throws {RangeError} If any element is non-finite, duplicated, or out of order.
 */
function validateSortedUniqueArray(arr, argIndex) {
	if (!Array.isArray(arr)) {
		throw new TypeError(`Argument at index ${argIndex} must be an Array.`);
	}

	let prev = -Infinity;
	for (let i = 0; i < arr.length; i++) {
		if (!(i in arr)) {
			throw new TypeError(
				`Sparse hole at arrays[${argIndex}][${i}]; elements must be finite numbers.`,
			);
		}
		const val = arr[i];
		if (typeof val !== 'number') {
			throw new TypeError(
				`Element at arrays[${argIndex}][${i}] must be a number.`,
			);
		}
		if (!Number.isFinite(val)) {
			throw new RangeError(
				`Element at arrays[${argIndex}][${i}] must be a finite number.`,
			);
		}
		if (i > 0) {
			if (val === prev) {
				throw new RangeError(
					`Array at index ${argIndex} contains duplicate value ${val} at index ${i}; arrays must be strictly increasing and de-duplicated.`,
				);
			}
			if (val < prev) {
				throw new RangeError(
					`Array at index ${argIndex} is not strictly increasing at index ${i} (${prev} > ${val}).`,
				);
			}
		}
		prev = val;
	}
}

/**
 * Normalizes IEEE-754 negative zero (`-0`) to canonical positive zero (`0`).
 *
 * @param {number} value
 * @returns {number}
 */
function normalizeZero(value) {
	return value === 0 ? 0 : value;
}

/**
 * Binary search for the smallest index `idx` in `[lo, hi]` such that
 * `idx === hi || arr[idx] >= target`.
 *
 * @param {number[]} arr - Strictly increasing numeric array.
 * @param {number} lo - Inclusive start index.
 * @param {number} hi - Exclusive end index.
 * @param {number} target - Value to locate.
 * @returns {number}
 */
function lowerBound(arr, lo, hi, target) {
	let left = lo;
	let right = hi;
	while (left < right) {
		const mid = left + Math.floor((right - left) / 2);
		if (arr[mid] < target) {
			left = mid + 1;
		} else {
			right = mid;
		}
	}
	return left;
}

/**
 * Binary search for the smallest index `idx` in `[lo, hi]` such that
 * `idx === hi || arr[idx] > target`.
 *
 * @param {number[]} arr - Strictly increasing numeric array.
 * @param {number} lo - Inclusive start index.
 * @param {number} hi - Exclusive end index.
 * @param {number} target - Value to locate.
 * @returns {number}
 */
function upperBound(arr, lo, hi, target) {
	let left = lo;
	let right = hi;
	while (left < right) {
		const mid = left + Math.floor((right - left) / 2);
		if (arr[mid] <= target) {
			left = mid + 1;
		} else {
			right = mid;
		}
	}
	return left;
}

/**
 * Exponential (galloping) lower-bound search using the geometric step series
 * `2^0, 2^1, 2^2, ...` followed by binary search on the bracketed subinterval.
 *
 * Finds the smallest index `idx` in `[lo, hi]` such that
 * `idx === hi || arr[idx] >= target` in O(log(1 + idx - lo)) comparisons.
 *
 * @param {number[]} arr - Strictly increasing numeric array.
 * @param {number} lo - Inclusive start index.
 * @param {number} hi - Exclusive end index.
 * @param {number} target - Value to locate.
 * @returns {number}
 */
function gallopLowerBound(arr, lo, hi, target) {
	if (lo >= hi || arr[lo] >= target) {
		return lo;
	}

	let prev = lo;
	let step = 1;
	let curr = lo + step;

	while (curr < hi && arr[curr] < target) {
		prev = curr;
		step *= 2;
		curr = lo + step;
	}

	const right = curr < hi ? curr : hi;
	return lowerBound(arr, prev + 1, right, target);
}

/**
 * Linear two-pointer merge intersection over active subranges of two strictly
 * increasing arrays.
 *
 * @param {number[]} small
 * @param {number} smallStart
 * @param {number} smallEnd
 * @param {number[]} large
 * @param {number} largeStart
 * @param {number} largeEnd
 * @returns {number[]}
 */
function linearIntersectSlice(
	small,
	smallStart,
	smallEnd,
	large,
	largeStart,
	largeEnd,
) {
	const result = [];
	let i = smallStart;
	let j = largeStart;

	while (i < smallEnd && j < largeEnd) {
		const va = small[i];
		const vb = large[j];
		if (va === vb) {
			result.push(normalizeZero(va));
			i++;
			j++;
		} else if (va < vb) {
			i++;
		} else {
			j++;
		}
	}

	return result;
}

/**
 * Galloping merge intersection over active subranges where `large` is
 * significantly longer than `small`.
 *
 * @param {number[]} small
 * @param {number} smallStart
 * @param {number} smallEnd
 * @param {number[]} large
 * @param {number} largeStart
 * @param {number} largeEnd
 * @returns {number[]}
 */
function gallopIntersectSlice(
	small,
	smallStart,
	smallEnd,
	large,
	largeStart,
	largeEnd,
) {
	const result = [];
	let j = largeStart;

	for (let i = smallStart; i < smallEnd && j < largeEnd; i++) {
		const target = small[i];
		j = gallopLowerBound(large, j, largeEnd, target);
		if (j < largeEnd && large[j] === target) {
			result.push(normalizeZero(target));
			j++;
		}
	}

	return result;
}

/**
 * Intersects two validated, strictly increasing numeric arrays using
 * bounding-interval pruning and adaptive linear/galloping merge.
 *
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number[]}
 */
function intersectTwoSorted(a, b) {
	if (a.length === 0 || b.length === 0) {
		return [];
	}

	const minBound = a[0] > b[0] ? a[0] : b[0];
	const maxBound =
		a[a.length - 1] < b[b.length - 1] ? a[a.length - 1] : b[b.length - 1];

	if (minBound > maxBound) {
		return [];
	}

	const aStart = a[0] < minBound ? lowerBound(a, 0, a.length, minBound) : 0;
	const aEnd =
		a[a.length - 1] > maxBound
			? upperBound(a, aStart, a.length, maxBound)
			: a.length;
	if (aStart >= aEnd) {
		return [];
	}

	const bStart = b[0] < minBound ? lowerBound(b, 0, b.length, minBound) : 0;
	const bEnd =
		b[b.length - 1] > maxBound
			? upperBound(b, bStart, b.length, maxBound)
			: b.length;
	if (bStart >= bEnd) {
		return [];
	}

	const aLen = aEnd - aStart;
	const bLen = bEnd - bStart;

	let small;
	let smallStart;
	let smallEnd;
	let large;
	let largeStart;
	let largeEnd;

	if (aLen <= bLen) {
		small = a;
		smallStart = aStart;
		smallEnd = aEnd;
		large = b;
		largeStart = bStart;
		largeEnd = bEnd;
	} else {
		small = b;
		smallStart = bStart;
		smallEnd = bEnd;
		large = a;
		largeStart = aStart;
		largeEnd = aEnd;
	}

	const m = smallEnd - smallStart;
	const n = largeEnd - largeStart;

	if (n > m * GALLOP_RATIO) {
		return gallopIntersectSlice(
			small,
			smallStart,
			smallEnd,
			large,
			largeStart,
			largeEnd,
		);
	}

	return linearIntersectSlice(
		small,
		smallStart,
		smallEnd,
		large,
		largeStart,
		largeEnd,
	);
}

/**
 * Computes the set intersection of one or more strictly increasing,
 * de-duplicated finite numeric arrays using an adaptive merge / galloping
 * series reduction.
 *
 * ### Mathematical Formulation & Algorithm
 * Given a series of finite sets represented as strictly increasing arrays
 * $A_1, A_2, \dots, A_k$:
 *
 * 1. **Validation**: Every input array is validated to contain only finite
 *    numbers in strictly increasing order (no `NaN`, `±Infinity`, duplicates,
 *    or sparse holes) before any short-circuiting occurs.
 * 2. **Global Bounding-Interval Identity**:
 *    Any common element must lie in
 *    $[L, U] = [\max_i \min(A_i),\; \min_i \max(A_i)]$.
 *    If $L > U$ or any $A_i = \emptyset$, the intersection is immediately
 *    $\emptyset$.
 * 3. **Commutative-Associative Series Reduction**:
 *    By commutativity and associativity of $\cap$, the inputs are ordered by
 *    ascending cardinality $|A_{\pi(1)}| \le \dots \le |A_{\pi(k)}|$ and
 *    folded via the recurrence $S_1 = A_{\pi(1)} \cap [L, U]$,
 *    $S_j = S_{j-1} \cap A_{\pi(j)}$ with early exit whenever $S_{j-1} = \emptyset$.
 * 4. **Adaptive Pairwise Merge**:
 *    Each pairwise step restricts both arrays to their overlapping range and
 *    selects between:
 *    - **Linear two-pointer merge** in $O(m + n)$ when sizes are comparable.
 *    - **Exponential (galloping) merge** using the geometric step series
 *      $2^0, 2^1, 2^2, \dots$ plus binary search in $O(m \log(1 + n / m))$
 *      when $n > 8m$.
 *
 * All `-0` values are normalized to canonical `0` in the returned array, and
 * input arrays are never mutated.
 *
 * @param {...number[]} arrays - One or more strictly increasing arrays of finite numbers.
 * @returns {number[]} New strictly increasing array containing elements common to all inputs.
 * @throws {RangeError} If zero arrays are provided, or any array contains non-finite values, duplicates, or unsorted entries.
 * @throws {TypeError} If any argument is not an Array or contains non-number/hole entries.
 */
export function intersectionSortedArrSeries(...arrays) {
	if (arrays.length === 0) {
		throw new RangeError('Expected at least one sorted numeric array.');
	}

	for (let i = 0; i < arrays.length; i++) {
		validateSortedUniqueArray(arrays[i], i);
	}

	if (arrays.length === 1) {
		const single = arrays[0];
		const copy = new Array(single.length);
		for (let i = 0; i < single.length; i++) {
			copy[i] = normalizeZero(single[i]);
		}
		return copy;
	}

	let minBound = -Infinity;
	let maxBound = Infinity;

	for (let i = 0; i < arrays.length; i++) {
		const arr = arrays[i];
		if (arr.length === 0) {
			return [];
		}
		const first = arr[0];
		const last = arr[arr.length - 1];
		if (first > minBound) {
			minBound = first;
		}
		if (last < maxBound) {
			maxBound = last;
		}
	}

	if (minBound > maxBound) {
		return [];
	}

	const ordered = arrays.slice().sort((a, b) => a.length - b.length);

	const smallest = ordered[0];
	const start =
		smallest[0] < minBound
			? lowerBound(smallest, 0, smallest.length, minBound)
			: 0;
	const end =
		smallest[smallest.length - 1] > maxBound
			? upperBound(smallest, start, smallest.length, maxBound)
			: smallest.length;

	if (start >= end) {
		return [];
	}

	let acc = new Array(end - start);
	for (let i = start; i < end; i++) {
		acc[i - start] = normalizeZero(smallest[i]);
	}

	for (let i = 1; i < ordered.length; i++) {
		acc = intersectTwoSorted(acc, ordered[i]);
		if (acc.length === 0) {
			return [];
		}
	}

	return acc;
}
