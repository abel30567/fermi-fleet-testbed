/**
 * Maximum number of generated permutations permitted in a single call
 * (9! = 362,880) to guard against combinatorial memory exhaustion.
 */
const MAX_PERMUTATIONS = 362_880;

/**
 * Normalizes IEEE-754 negative zero (`-0`) to `+0`.
 *
 * @param {number} value
 * @returns {number}
 */
function normalizeZero(value) {
	return value === 0 ? 0 : value;
}

/**
 * Validates and clones a complex number object `{ re, im }`.
 *
 * @param {unknown} value - Candidate complex number.
 * @param {number} index - Element index for error reporting.
 * @returns {{ re: number, im: number }} Validated complex number copy.
 * @throws {TypeError} If `value` is not an object with numeric `re` and `im` properties.
 * @throws {RangeError} If `re` or `im` is not a finite number (`NaN` or `±Infinity`).
 */
function validateComplex(value, index) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(
			`Element at index ${index} must be a complex number object { re, im }`,
		);
	}
	const { re, im } = value;
	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError(
			`Element at index ${index} must have numeric "re" and "im" properties`,
		);
	}
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError(
			`Element at index ${index} must have finite "re" and "im" values`,
		);
	}
	return { re: normalizeZero(re), im: normalizeZero(im) };
}

/**
 * Clones a validated complex number `{ re, im }`.
 *
 * @param {{ re: number, im: number }} z
 * @returns {{ re: number, im: number }}
 */
function cloneComplex(z) {
	return { re: z.re, im: z.im };
}

/**
 * Recursively generates all order-preserving interleavings (shuffles) of two
 * complex-number sequences `left` and `right`, appending deep-cloned results to `out`.
 *
 * @param {Array<{ re: number, im: number }>} left
 * @param {Array<{ re: number, im: number }>} right
 * @param {number} i
 * @param {number} j
 * @param {Array<{ re: number, im: number }>} buffer
 * @param {Array<Array<{ re: number, im: number }>>} out
 */
function interleaveRecursive(left, right, i, j, buffer, out) {
	if (i === left.length && j === right.length) {
		out.push(buffer.map(cloneComplex));
		return;
	}
	if (i < left.length) {
		buffer.push(left[i]);
		interleaveRecursive(left, right, i + 1, j, buffer, out);
		buffer.pop();
	}
	if (j < right.length) {
		buffer.push(right[j]);
		interleaveRecursive(left, right, i, j + 1, buffer, out);
		buffer.pop();
	}
}

/**
 * Divide-and-conquer recursive generator for all `choose`-permutations of `pool`.
 *
 * Splits `pool` into two halves `left` and `right`. For every valid split
 * `(j, choose - j)` with `0 <= j <= left.length` and `0 <= choose - j <= right.length`,
 * recursively computes `j`-permutations of `left` and `(choose - j)`-permutations of
 * `right`, then recursively interleaves every pair. By Vandermonde's identity:
 *   sum_j C(k, j) * P(m, j) * P(n - m, k - j) = P(n, k).
 *
 * @param {Array<{ re: number, im: number }>} pool
 * @param {number} choose
 * @returns {Array<Array<{ re: number, im: number }>>}
 */
function permuteDivideAndConquer(pool, choose) {
	if (choose === 0) {
		return [[]];
	}
	if (pool.length === 1) {
		return [[cloneComplex(pool[0])]];
	}

	const mid = Math.floor(pool.length / 2);
	const left = pool.slice(0, mid);
	const right = pool.slice(mid);

	const minLeft = Math.max(0, choose - right.length);
	const maxLeft = Math.min(choose, left.length);

	const result = [];
	const buffer = [];

	for (let j = minLeft; j <= maxLeft; j += 1) {
		const leftPerms = permuteDivideAndConquer(left, j);
		const rightPerms = permuteDivideAndConquer(right, choose - j);

		for (let a = 0; a < leftPerms.length; a += 1) {
			for (let b = 0; b < rightPerms.length; b += 1) {
				interleaveRecursive(leftPerms[a], rightPerms[b], 0, 0, buffer, result);
			}
		}
	}

	return result;
}

/**
 * Generates all discrete `k`-permutations of an array of complex numbers `{ re, im }`
 * using a recursive divide-and-conquer algorithm (halving the input and recursively
 * interleaving sub-permutations from each half).
 *
 * Each element is treated positionally, so an input of length `n` yields
 * `P(n, k) = n! / (n - k)!` permutations. Every returned `{ re, im }` object is a
 * fresh copy, leaving the input array and its elements unmutated.
 *
 * @param {Array<{ re: number, im: number }>} items - Array of complex numbers `{ re, im }`.
 * @param {number} [k=items.length] - Length of each permutation (`0 <= k <= items.length`).
 * @returns {Array<Array<{ re: number, im: number }>>} Array of all `k`-permutations of `items`.
 * @throws {TypeError} If `items` is not an array, contains sparse holes or invalid complex
 *   objects, or if `k` is provided and not a number.
 * @throws {RangeError} If any complex component is non-finite, if `k` is not an integer in
 *   `[0, items.length]`, or if `P(items.length, k)` exceeds the safety limit (362,880).
 */
export function permutationsComplexRecursive(items, k) {
	if (!Array.isArray(items)) {
		throw new TypeError('items must be an array of complex numbers { re, im }');
	}

	const normalized = new Array(items.length);
	for (let i = 0; i < items.length; i += 1) {
		if (!(i in items)) {
			throw new TypeError(`Sparse array hole at index ${i} is not allowed`);
		}
		normalized[i] = validateComplex(items[i], i);
	}

	let choose;
	if (k === undefined) {
		choose = normalized.length;
	} else {
		if (typeof k !== 'number') {
			throw new TypeError('k must be a non-negative integer');
		}
		if (!Number.isInteger(k) || k < 0 || k > normalized.length) {
			throw new RangeError(
				`k must be an integer between 0 and items.length (${normalized.length}), received ${k}`,
			);
		}
		choose = k;
	}

	let expectedCount = 1;
	for (let i = 0; i < choose; i += 1) {
		expectedCount *= normalized.length - i;
		if (expectedCount > MAX_PERMUTATIONS) {
			throw new RangeError(
				`Permutation count exceeds maximum supported limit (${MAX_PERMUTATIONS})`,
			);
		}
	}

	return permuteDivideAndConquer(normalized, choose);
}
