/**
 * Computes the discrete summation over exact BigInt integers using a
 * straightforward iterative accumulator.
 *
 * Supports two calling conventions:
 * 1. Inclusive index range: `summationBigIntIterative(start, end, termFn?)`
 *    Computes `Σ_{i = start}^{end} termFn(i)` where `termFn` defaults to the
 *    identity function `i => i`. Returns `0n` when `start > end`.
 * 2. Iterable of BigInts: `summationBigIntIterative(terms, termFn?)`
 *    Computes `Σ_{x ∈ terms} termFn(x)` for any iterable (Array, Set,
 *    Generator, BigInt64Array, etc.) yielding `bigint` values, where `termFn`
 *    defaults to the identity function `x => x`. Returns `0n` for an empty
 *    iterable.
 *
 * Because summation is linear, fixed-point BigInt values scaled by `10n ** 18n`
 * (or any uniform scale factor) can be summed directly with zero rounding loss.
 *
 * @param {bigint | Iterable<bigint>} startOrTerms
 *   Inclusive BigInt lower bound `start`, or an iterable of `bigint` values.
 * @param {bigint | ((value: bigint) => bigint)} [endOrTermFn]
 *   Inclusive BigInt upper bound `end` (when `startOrTerms` is a `bigint`),
 *   or an optional mapping function `(x: bigint) => bigint` (when
 *   `startOrTerms` is an iterable).
 * @param {(index: bigint) => bigint} [termFn]
 *   Optional term function `(i: bigint) => bigint` used in range mode.
 * @returns {bigint} The exact BigInt sum.
 * @throws {TypeError} If arguments, iterable elements, or `termFn` return
 *   values are not valid `bigint`s or functions as required.
 */
export function summationBigIntIterative(startOrTerms, endOrTermFn, termFn) {
	if (typeof startOrTerms === 'bigint') {
		if (typeof endOrTermFn !== 'bigint') {
			throw new TypeError(
				'summationBigIntIterative: end bound must be a bigint when start is a bigint'
			)
		}
		if (termFn !== undefined && typeof termFn !== 'function') {
			throw new TypeError(
				'summationBigIntIterative: termFn must be a function when provided'
			)
		}

		const start = startOrTerms
		const end = endOrTermFn
		if (start > end) {
			return 0n
		}

		let sum = 0n
		if (termFn === undefined) {
			for (let i = start; i <= end; i += 1n) {
				sum += i
			}
			return sum
		}

		for (let i = start; i <= end; i += 1n) {
			const term = termFn(i)
			if (typeof term !== 'bigint') {
				throw new TypeError(
					`summationBigIntIterative: termFn must return a bigint (received ${typeof term} at index ${i})`
				)
			}
			sum += term
		}
		return sum
	}

	if (
		startOrTerms === null ||
		typeof startOrTerms !== 'object' ||
		typeof startOrTerms[Symbol.iterator] !== 'function'
	) {
		throw new TypeError(
			'summationBigIntIterative: first argument must be a bigint start bound or an iterable of bigints'
		)
	}

	if (termFn !== undefined) {
		throw new TypeError(
			'summationBigIntIterative: unexpected third argument when summing an iterable'
		)
	}

	if (endOrTermFn !== undefined && typeof endOrTermFn !== 'function') {
		throw new TypeError(
			'summationBigIntIterative: termFn must be a function when provided with an iterable'
		)
	}

	const mapFn = endOrTermFn
	let sum = 0n
	let index = 0
	for (const value of startOrTerms) {
		if (typeof value !== 'bigint') {
			throw new TypeError(
				`summationBigIntIterative: iterable element at position ${index} must be a bigint (received ${typeof value})`
			)
		}
		if (mapFn === undefined) {
			sum += value
		} else {
			const term = mapFn(value)
			if (typeof term !== 'bigint') {
				throw new TypeError(
					`summationBigIntIterative: termFn must return a bigint (received ${typeof term} at position ${index})`
				)
			}
			sum += term
		}
		index += 1
	}

	return sum
}
