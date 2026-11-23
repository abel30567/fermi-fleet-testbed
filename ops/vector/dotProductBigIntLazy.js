/**
 * @fileoverview Exact BigInt vector dot product computed lazily over iterables.
 */

/**
 * Validates that a value is a non-string iterable and returns its iterator.
 *
 * @param {unknown} iterable - Candidate vector iterable.
 * @param {string} name - Parameter name for error reporting.
 * @returns {Iterator<unknown>} Active iterator for the iterable.
 * @throws {TypeError} If the value is not a valid non-string iterable.
 */
function getVectorIterator(iterable, name) {
	if (
		iterable === null ||
		iterable === undefined ||
		typeof iterable === 'string' ||
		iterable instanceof String ||
		typeof iterable[Symbol.iterator] !== 'function'
	) {
		throw new TypeError(`Expected "${name}" to be a non-string iterable of BigInt values`);
	}

	const iterator = iterable[Symbol.iterator]();
	if (iterator === null || typeof iterator !== 'object' || typeof iterator.next !== 'function') {
		throw new TypeError(`Expected "${name}" [Symbol.iterator]() to return a valid iterator`);
	}

	return iterator;
}

/**
 * Validates that a vector element is an exact BigInt.
 *
 * @param {unknown} value - Element yielded by an input iterable.
 * @param {string} name - Parameter name for error reporting.
 * @param {number} index - Zero-based position of the element.
 * @returns {bigint} The validated BigInt value.
 * @throws {TypeError} If the element is not a BigInt.
 */
function assertBigIntElement(value, name, index) {
	if (typeof value !== 'bigint') {
		throw new TypeError(
			`Expected BigInt element in "${name}" at index ${index}, got ${value === null ? 'null' : typeof value}`
		);
	}
	return value;
}

/**
 * Safely closes an iterator if it has not yet completed.
 *
 * @param {Iterator<unknown>} iterator - Iterator to close.
 * @param {boolean} done - Whether the iterator has already completed.
 */
function closeIterator(iterator, done) {
	if (!done && typeof iterator.return === 'function') {
		try {
			iterator.return();
		} catch {
			// Preserve the primary error when aborting iteration.
		}
	}
}

/**
 * Lazily streams element-wise BigInt products from two iterables in lockstep.
 *
 * Consumes at most one element from each iterable per step (O(1) auxiliary
 * memory) and never materializes full input sequences.
 *
 * @param {Iterable<bigint>} a - First vector iterable of BigInt values.
 * @param {Iterable<bigint>} b - Second vector iterable of BigInt values.
 * @yields {bigint} The exact product `a[i] * b[i]` for each index `i`.
 * @throws {TypeError} If either input is not a valid iterable, both resolve to the same iterator instance, or any element is not a BigInt.
 * @throws {RangeError} If the two iterables do not have the same length.
 */
function* streamBigIntProducts(a, b) {
	const iterA = getVectorIterator(a, 'a');
	let doneA = false;
	let iterB;
	let doneB = false;

	try {
		iterB = getVectorIterator(b, 'b');
	} catch (err) {
		closeIterator(iterA, doneA);
		throw err;
	}

	if (iterA === iterB) {
		closeIterator(iterA, doneA);
		throw new TypeError(
			'Cannot compute dot product of an iterator with itself: "a" and "b" resolved to the same iterator instance'
		);
	}

	let index = 0;
	let completed = false;

	try {
		while (true) {
			const stepA = iterA.next();
			doneA = Boolean(stepA.done);
			const stepB = iterB.next();
			doneB = Boolean(stepB.done);

			if (doneA && doneB) {
				completed = true;
				return;
			}

			if (doneA !== doneB) {
				const shorter = doneA ? 'a' : 'b';
				const longer = doneA ? 'b' : 'a';
				throw new RangeError(
					`Vector length mismatch at index ${index}: "${shorter}" ended before "${longer}"`
				);
			}

			const valA = assertBigIntElement(stepA.value, 'a', index);
			const valB = assertBigIntElement(stepB.value, 'b', index);
			yield valA * valB;
			index += 1;
		}
	} finally {
		if (!completed) {
			closeIterator(iterA, doneA);
			closeIterator(iterB, doneB);
		}
	}
}

/**
 * Computes the exact BigInt dot product of two equal-length vector iterables
 * lazily in a single streaming pass with O(1) auxiliary memory.
 *
 * For two sequences `a = [a_0, ..., a_{n-1}]` and `b = [b_0, ..., b_{n-1}]`
 * of `bigint` values, returns `sum_{i=0}^{n-1} (a_i * b_i)`. For two empty
 * iterables, returns `0n`. Both iterables are consumed in lockstep via a
 * generator without materializing arrays.
 *
 * @param {Iterable<bigint>} a - First vector iterable of BigInt values.
 * @param {Iterable<bigint>} b - Second vector iterable of BigInt values.
 * @returns {bigint} Exact BigInt dot product of `a` and `b`.
 * @throws {TypeError} If `a` or `b` is not a non-string iterable, both resolve to the same iterator instance, or any element is not a `bigint`.
 * @throws {RangeError} If `a` and `b` yield different numbers of elements.
 */
export function dotProductBigIntLazy(a, b) {
	let sum = 0n;
	for (const product of streamBigIntProducts(a, b)) {
		sum += product;
	}
	return sum;
}
