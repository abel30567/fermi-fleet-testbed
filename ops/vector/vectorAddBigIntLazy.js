/**
 * Lazily computes the element-wise vector sum of two BigInt iterables.
 *
 * Consumes both input iterables in lockstep using O(1) auxiliary memory and
 * yields each exact BigInt sum on demand. Because addition is linear, this
 * operates identically on exact integer BigInts and fixed-point BigInts scaled
 * by 10^18 (i.e. `(x * 10^18) + (y * 10^18) === (x + y) * 10^18`).
 *
 * Input iterables are validated eagerly to be non-string iterables, and each
 * yielded element is validated lazily to be a `bigint`. If one iterable
 * terminates before the other, a `RangeError` is thrown.
 *
 * @param {Iterable<bigint>} a - First iterable of BigInt values.
 * @param {Iterable<bigint>} b - Second iterable of BigInt values (must have the same length as `a`).
 * @returns {Generator<bigint, void, undefined>} A generator yielding `a_i + b_i` for each index `i`.
 * @throws {TypeError} If `a` or `b` is not a valid iterable (or is a string), or if any yielded element is not a `bigint`.
 * @throws {RangeError} If `a` and `b` have different lengths.
 */
export function vectorAddBigIntLazy(a, b) {
	assertIterable(a, 'a');
	assertIterable(b, 'b');
	return vectorAddBigIntLazyGenerator(a, b);
}

/**
 * Validates that a value is a non-string iterable.
 *
 * @param {unknown} value - Value to validate.
 * @param {string} name - Parameter name for error messages.
 * @throws {TypeError} If `value` is nullish, a string, or lacks a callable `[Symbol.iterator]`.
 */
function assertIterable(value, name) {
	if (
		value == null ||
		typeof value === 'string' ||
		typeof value[Symbol.iterator] !== 'function'
	) {
		throw new TypeError(`Parameter "${name}" must be an iterable of BigInt values`);
	}
}

/**
 * Internal generator performing lockstep lazy BigInt vector addition.
 *
 * @param {Iterable<bigint>} a
 * @param {Iterable<bigint>} b
 * @returns {Generator<bigint, void, undefined>}
 */
function* vectorAddBigIntLazyGenerator(a, b) {
	let iterA;
	let iterB;
	let doneA = false;
	let doneB = false;
	let index = 0;

	try {
		iterA = a[Symbol.iterator]();
		if (iterA == null || typeof iterA.next !== 'function') {
			throw new TypeError('Parameter "a" [Symbol.iterator]() must return a valid iterator');
		}

		iterB = b[Symbol.iterator]();
		if (iterB == null || typeof iterB.next !== 'function') {
			throw new TypeError('Parameter "b" [Symbol.iterator]() must return a valid iterator');
		}

		while (true) {
			const stepA = iterA.next();
			doneA = Boolean(stepA.done);
			const stepB = iterB.next();
			doneB = Boolean(stepB.done);

			if (doneA && doneB) {
				return;
			}

			if (doneA !== doneB) {
				throw new RangeError(
					`Vector length mismatch at index ${index}: input iterables must have equal length`
				);
			}

			const valA = stepA.value;
			const valB = stepB.value;

			if (typeof valA !== 'bigint') {
				throw new TypeError(
					`Expected BigInt in first iterable at index ${index}, received ${describeType(valA)}`
				);
			}

			if (typeof valB !== 'bigint') {
				throw new TypeError(
					`Expected BigInt in second iterable at index ${index}, received ${describeType(valB)}`
				);
			}

			yield valA + valB;
			index += 1;
		}
	} finally {
		if (iterA && !doneA && typeof iterA.return === 'function') {
			try {
				iterA.return();
			} catch {
				// Ignore cleanup errors during unwinding
			}
		}
		if (iterB && !doneB && typeof iterB.return === 'function') {
			try {
				iterB.return();
			} catch {
				// Ignore cleanup errors during unwinding
			}
		}
	}
}

/**
 * Returns a human-readable type label for error messages.
 *
 * @param {unknown} value
 * @returns {string}
 */
function describeType(value) {
	if (value === null) {
		return 'null';
	}
	return typeof value;
}
