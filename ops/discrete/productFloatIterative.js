/**
 * Computes the discrete product ∏_{k=start}^{end} termFn(k) over IEEE-754
 * float64 Numbers using a straightforward iterative multiplication loop.
 *
 * Follows standard mathematical conventions for discrete products:
 * - When `start > end`, the product is empty and returns `1` (the
 *   multiplicative identity).
 * - When `termFn` is omitted, defaults to the identity function `(k) => k`.
 * - Intermediate and final accumulation uses standard IEEE-754 double-precision
 *   floating-point multiplication (so very large products may overflow to
 *   `Infinity` / `-Infinity`, and very small products may underflow to `0`).
 *
 * @param {number} start - Inclusive lower integer bound of the product index (safe integer).
 * @param {number} end - Inclusive upper integer bound of the product index (safe integer).
 * @param {(k: number) => number} [termFn=(k) => k] - Function mapping each integer index `k`
 *   in `[start, end]` to a finite IEEE-754 float64 factor.
 * @returns {number} The iterative float64 product ∏_{k=start}^{end} termFn(k), or `1` if `start > end`.
 * @throws {TypeError} If `start` or `end` is not a number, if `termFn` is not a function,
 *   or if `termFn(k)` returns a non-number value.
 * @throws {RangeError} If `start` or `end` is not a safe integer, or if `termFn(k)` returns
 *   a non-finite number (`NaN`, `Infinity`, or `-Infinity`).
 *
 * @example
 * // 5! = 1 * 2 * 3 * 4 * 5 = 120
 * productFloatIterative(1, 5); // => 120
 *
 * @example
 * // Telescoping product: ∏_{k=1}^{4} (k + 1) / k = 5
 * productFloatIterative(1, 4, (k) => (k + 1) / k); // => 5
 */
export function productFloatIterative(start, end, termFn = (k) => k) {
	if (typeof start !== 'number') {
		throw new TypeError(`Expected "start" to be a number, got ${typeof start}`)
	}
	if (!Number.isSafeInteger(start)) {
		throw new RangeError(`Expected "start" to be a safe integer, got ${start}`)
	}
	if (typeof end !== 'number') {
		throw new TypeError(`Expected "end" to be a number, got ${typeof end}`)
	}
	if (!Number.isSafeInteger(end)) {
		throw new RangeError(`Expected "end" to be a safe integer, got ${end}`)
	}
	if (typeof termFn !== 'function') {
		throw new TypeError(`Expected "termFn" to be a function, got ${typeof termFn}`)
	}

	if (start > end) {
		return 1
	}

	let product = 1
	let k = start
	while (true) {
		const factor = termFn(k)
		if (typeof factor !== 'number') {
			throw new TypeError(`Expected termFn(${k}) to return a number, got ${typeof factor}`)
		}
		if (!Number.isFinite(factor)) {
			throw new RangeError(`Expected termFn(${k}) to return a finite number, got ${factor}`)
		}
		product *= factor
		if (k === end) {
			break
		}
		k += 1
	}

	return product
}
