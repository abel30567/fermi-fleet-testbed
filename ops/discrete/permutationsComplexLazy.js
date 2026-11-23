/**
 * @typedef {{ re: number, im: number }} Complex
 */

/**
 * Validates that a value is a finite complex number object `{ re, im }`
 * and returns a clean shallow copy.
 *
 * @param {unknown} value - Candidate complex number.
 * @param {number} index - Zero-based position in the input sequence.
 * @returns {Complex} Normalized `{ re, im }` complex object.
 * @throws {TypeError} If the element is not an object or lacks numeric `re`/`im`.
 * @throws {RangeError} If `re` or `im` is not finite (`NaN`, `Infinity`, `-Infinity`).
 */
function validateComplex(value, index) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(
			`Element at index ${index} must be a complex number object { re, im }`
		);
	}
	const { re, im } = /** @type {{ re: unknown, im: unknown }} */ (value);
	if (typeof re !== 'number') {
		throw new TypeError(
			`Element at index ${index} must have a numeric 're' property`
		);
	}
	if (!Number.isFinite(re)) {
		throw new RangeError(
			`Element at index ${index} must have a finite 're' property`
		);
	}
	if (typeof im !== 'number') {
		throw new TypeError(
			`Element at index ${index} must have a numeric 'im' property`
		);
	}
	if (!Number.isFinite(im)) {
		throw new RangeError(
			`Element at index ${index} must have a finite 'im' property`
		);
	}
	return { re, im };
}

/**
 * Advances an array of distinct numbers to its next lexicographic permutation
 * in-place (Narayana Pandita's algorithm).
 *
 * @param {number[]} arr
 * @returns {boolean} `true` if a next permutation exists, `false` if already at the last.
 */
function nextPermutation(arr) {
	let i = arr.length - 2;
	while (i >= 0 && arr[i] >= arr[i + 1]) {
		i--;
	}
	if (i < 0) return false;

	let j = arr.length - 1;
	while (arr[j] <= arr[i]) {
		j--;
	}

	const tmp = arr[i];
	arr[i] = arr[j];
	arr[j] = tmp;

	let left = i + 1;
	let right = arr.length - 1;
	while (left < right) {
		const swap = arr[left];
		arr[left] = arr[right];
		arr[right] = swap;
		left++;
		right--;
	}
	return true;
}

/**
 * Advances a sorted `r`-combination of indices from `{0, ..., n - 1}`
 * to the next lexicographic combination in-place.
 *
 * @param {number[]} comb
 * @param {number} n
 * @returns {boolean} `true` if a next combination exists, `false` otherwise.
 */
function nextCombination(comb, n) {
	const r = comb.length;
	let i = r - 1;
	while (i >= 0 && comb[i] === n - r + i) {
		i--;
	}
	if (i < 0) return false;

	comb[i]++;
	for (let j = i + 1; j < r; j++) {
		comb[j] = comb[j - 1] + 1;
	}
	return true;
}

/**
 * Internal generator implementing lazy discrete permutations over complex numbers.
 *
 * @param {Iterable<Complex>} iterable
 * @param {number | undefined} k
 * @returns {Generator<Complex[], void, void>}
 */
function* generatePermutations(iterable, k) {
	if (k === 0) {
		yield [];
		return;
	}

	const iterator = iterable[Symbol.iterator]();
	if (iterator === null || typeof iterator !== 'object' || typeof iterator.next !== 'function') {
		throw new TypeError('iterable[Symbol.iterator]() must return an iterator object');
	}

	let iterClosed = false;

	/**
	 * Pulls and validates the next complex element from the underlying iterator.
	 *
	 * @param {number} index
	 * @returns {Complex | null}
	 */
	function pullNext(index) {
		let step;
		try {
			step = iterator.next();
		} catch (err) {
			iterClosed = true;
			throw err;
		}
		if (step.done) {
			iterClosed = true;
			return null;
		}
		return validateComplex(step.value, index);
	}

	try {
		/** @type {Complex[]} */
		const pool = [];

		if (k === undefined) {
			// Full permutations require knowing all elements of the finite sequence.
			let item;
			while ((item = pullNext(pool.length)) !== null) {
				pool.push(item);
			}

			const n = pool.length;
			if (n === 0) {
				yield [];
				return;
			}

			const indices = Array.from({ length: n }, (_, i) => i);
			do {
				const out = new Array(n);
				for (let i = 0; i < n; i++) {
					const z = pool[indices[i]];
					out[i] = { re: z.re, im: z.im };
				}
				yield out;
			} while (nextPermutation(indices));
			return;
		}

		// Streaming k-permutations: consume only the first k elements initially.
		while (pool.length < k) {
			const item = pullNext(pool.length);
			if (item === null) {
				// Fewer than k elements available: P(n, k) = 0.
				return;
			}
			pool.push(item);
		}

		// Phase 1: yield all k! permutations of the initial k elements before pulling more.
		const initIndices = Array.from({ length: k }, (_, i) => i);
		do {
			const out = new Array(k);
			for (let i = 0; i < k; i++) {
				const z = pool[initIndices[i]];
				out[i] = { re: z.re, im: z.im };
			}
			yield out;
		} while (nextPermutation(initIndices));

		// Phase 2: progressively pull element m = k, k+1, ... and yield all k-permutations
		// that include index m (exact count per step: k * P(m, k - 1)).
		let nextItem;
		while ((nextItem = pullNext(pool.length)) !== null) {
			const m = pool.length;
			pool.push(nextItem);

			if (k === 1) {
				yield [{ re: nextItem.re, im: nextItem.im }];
				continue;
			}

			const subLen = k - 1;
			const comb = Array.from({ length: subLen }, (_, i) => i);

			do {
				const perm = comb.slice();
				do {
					for (let pos = 0; pos < k; pos++) {
						const out = new Array(k);
						for (let i = 0; i < pos; i++) {
							const z = pool[perm[i]];
							out[i] = { re: z.re, im: z.im };
						}
						out[pos] = { re: nextItem.re, im: nextItem.im };
						for (let i = pos; i < subLen; i++) {
							const z = pool[perm[i]];
							out[i + 1] = { re: z.re, im: z.im };
						}
						yield out;
					}
				} while (nextPermutation(perm));
			} while (nextCombination(comb, m));
		}
	} finally {
		if (!iterClosed && typeof iterator.return === 'function') {
			iterator.return();
		}
	}
}

/**
 * Lazily generates discrete permutations of complex numbers represented as `{ re, im }`.
 *
 * Elements are treated as distinct by their position in the input iterable, producing
 * `P(n, k) = n! / (n - k)!` permutations for a finite sequence of length `n`.
 *
 * Streaming / laziness guarantees:
 * - Output permutations are generated one at a time via a JS generator without
 *   materializing all permutations in memory.
 * - When `k` is specified, the input iterable is consumed progressively: only the first
 *   `k` elements are pulled to emit the first `k!` permutations, and each subsequent
 *   element `z_m` is pulled only after all `k`-permutations of `{z_0, ..., z_{m-1}}`
 *   have been yielded. This allows streaming over very large or infinite iterables.
 * - When `k === 0`, yields a single empty permutation `[]` without pulling any elements.
 * - When `k` is omitted, yields all `n!` full permutations in lexicographic index order.
 * - Each yielded array and `{ re, im }` element is freshly cloned so caller mutations
 *   cannot corrupt subsequent permutations.
 *
 * @param {Iterable<Complex>} iterable - Iterable sequence of complex numbers `{ re, im }`.
 * @param {number} [k] - Optional permutation length (non-negative safe integer). Defaults to full length.
 * @returns {Generator<Complex[], void, void>} Generator yielding arrays of `{ re, im }` complex numbers.
 * @throws {TypeError} If `iterable` is not a valid non-string iterable, or if `k` is not a number when provided.
 * @throws {RangeError} If `k` is negative, non-integer, or exceeds `Number.MAX_SAFE_INTEGER`.
 */
export function permutationsComplexLazy(iterable, k) {
	if (
		iterable === null ||
		iterable === undefined ||
		typeof iterable === 'string' ||
		typeof iterable[Symbol.iterator] !== 'function'
	) {
		throw new TypeError('iterable must be a valid non-string iterable');
	}

	if (k !== undefined) {
		if (typeof k !== 'number') {
			throw new TypeError('k must be a non-negative safe integer');
		}
		if (!Number.isSafeInteger(k) || k < 0) {
			throw new RangeError('k must be a non-negative safe integer');
		}
	}

	return generatePermutations(iterable, k);
}
