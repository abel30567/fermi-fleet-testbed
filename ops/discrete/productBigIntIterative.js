/**
 * Compute the exact discrete product over BigInt integers using a
 * straightforward iterative loop.
 *
 * Supports two calling conventions:
 * 1. Range + term function:
 *    `productBigIntIterative(fn, start, end, step = 1n)`
 *    Computes `∏_{i = start, start + step, ... <= end} fn(i)`.
 *    Returns `1n` for an empty range (`start > end`).
 *    Short-circuits immediately and returns `0n` as soon as `fn(i) === 0n`.
 *
 * 2. Iterable / Array of BigInt factors:
 *    `productBigIntIterative(factors)`
 *    Computes `∏_{x ∈ factors} x`.
 *    Returns `1n` for an empty iterable.
 *    Short-circuits immediately and returns `0n` as soon as a `0n` factor is encountered.
 *
 * Exactness:
 * Because the integers are closed under multiplication, the product of exact
 * `bigint` integers is always an exact `bigint` integer (no fixed-point scaling
 * is required). All indices, steps, and factors must be `bigint` values; passing
 * JS `number` or other types throws a `TypeError` to prevent silent precision loss.
 *
 * @overload
 * @param {Iterable<bigint>} factors - Array or iterable of exact `bigint` factors.
 * @returns {bigint} Exact product of all factors (`1n` if empty).
 *
 * @overload
 * @param {(index: bigint) => bigint} fn - Term function mapping each `bigint` index to a `bigint` factor.
 * @param {bigint} start - Inclusive lower bound of the index range.
 * @param {bigint} end - Inclusive upper bound of the index range.
 * @param {bigint} [step=1n] - Positive `bigint` stride between consecutive indices.
 * @returns {bigint} Exact discrete product (`1n` if `start > end`).
 *
 * @throws {TypeError} If argument count, types, or returned factor values are invalid.
 * @throws {RangeError} If `step <= 0n`.
 */
export function productBigIntIterative(first, start, end, step = 1n) {
	if (arguments.length === 1) {
		return productIterable(first)
	}

	if (arguments.length === 3 || arguments.length === 4) {
		return productRange(first, start, end, step)
	}

	throw new TypeError(
		`productBigIntIterative expects 1 argument (factors) or 3-4 arguments (fn, start, end[, step]), received ${arguments.length}`
	)
}

/**
 * @param {Iterable<bigint>} factors
 * @returns {bigint}
 */
function productIterable(factors) {
	if (
		factors === null ||
		factors === undefined ||
		typeof factors === 'string' ||
		typeof factors[Symbol.iterator] !== 'function'
	) {
		throw new TypeError('factors must be an array or iterable of BigInt values')
	}

	let acc = 1n
	let index = 0
	for (const factor of factors) {
		if (typeof factor !== 'bigint') {
			throw new TypeError(
				`All factors must be BigInt values; received ${typeof factor} at index ${index}`
			)
		}
		if (factor === 0n) {
			return 0n
		}
		acc *= factor
		index += 1
	}

	return acc
}

/**
 * @param {(index: bigint) => bigint} fn
 * @param {bigint} start
 * @param {bigint} end
 * @param {bigint} step
 * @returns {bigint}
 */
function productRange(fn, start, end, step) {
	if (typeof fn !== 'function') {
		throw new TypeError(`fn must be a function; received ${typeof fn}`)
	}
	if (typeof start !== 'bigint') {
		throw new TypeError(`start must be a BigInt; received ${typeof start}`)
	}
	if (typeof end !== 'bigint') {
		throw new TypeError(`end must be a BigInt; received ${typeof end}`)
	}
	if (typeof step !== 'bigint') {
		throw new TypeError(`step must be a BigInt; received ${typeof step}`)
	}
	if (step <= 0n) {
		throw new RangeError(`step must be a positive BigInt (> 0n); received ${step}n`)
	}

	let acc = 1n
	for (let i = start; i <= end; i += step) {
		const factor = fn(i)
		if (typeof factor !== 'bigint') {
			throw new TypeError(
				`fn(${i}n) must return a BigInt; received ${typeof factor}`
			)
		}
		if (factor === 0n) {
			return 0n
		}
		acc *= factor
	}

	return acc
}
