/**
 * Lazily computes the bitwise AND (set intersection) over arbitrary-width BigInt bitsets.
 *
 * Bitset representation:
 * - Each bitset is a non-negative `BigInt` (`>= 0n`) of arbitrary bit width, where bit `k`
 *   (`1n << BigInt(k)`) is `1` iff non-negative integer `k` is a member of the set, and `0n`
 *   represents the empty set.
 *
 * Modes of operation:
 * - **Single iterable (`andBitsetLazy(source)`)**: Streams the running (cumulative) intersection
 *   across `source`, yielding `b_0`, `b_0 & b_1`, `b_0 & b_1 & b_2`, ...
 * - **Multiple iterables (`andBitsetLazy(sourceA, sourceB, ...rest)`)**: Streams the element-wise
 *   (lockstep) intersection across all iterables, yielding `s0[i] & s1[i] & ...` until the
 *   shortest iterable is exhausted.
 *
 * Laziness guarantees:
 * - Input iterables are never eagerly materialized into arrays.
 * - Iterators are opened only when consumption starts and advanced at most one step per `.next()`
 *   call, supporting arbitrarily large or infinite sequences.
 * - Early consumer termination (`break`, `.return()`) or exhaustion of the shortest input cleanly
 *   closes all still-open iterators via `iterator.return()`.
 *
 * @param {...Iterable<bigint>} sources - One or more non-string iterables yielding non-negative
 *   `BigInt` bitsets.
 * @returns {Generator<bigint, void, undefined>} A lazy generator yielding resulting non-negative
 *   `BigInt` bitsets.
 * @throws {TypeError} Synchronously if zero arguments are supplied or any argument is not a
 *   non-string iterable.
 * @throws {TypeError} Lazily during iteration if a source yields an invalid iterator or a value
 *   whose type is not `'bigint'`.
 * @throws {RangeError} Lazily during iteration if a yielded `BigInt` bitset is negative (`< 0n`).
 */
export function andBitsetLazy(...sources) {
	if (sources.length === 0) {
		throw new TypeError('andBitsetLazy requires at least one iterable bitset source')
	}

	for (let i = 0; i < sources.length; i++) {
		assertIterableSource(sources[i], i)
	}

	if (sources.length === 1) {
		return runningAndBitsets(sources[0])
	}

	return zipAndBitsets(sources)
}

/**
 * Validates that an argument is a non-string iterable object or function.
 *
 * @param {unknown} source
 * @param {number} index
 */
function assertIterableSource(source, index) {
	if (
		source === null ||
		(typeof source !== 'object' && typeof source !== 'function') ||
		typeof source[Symbol.iterator] !== 'function'
	) {
		throw new TypeError(
			`Argument at index ${index} must be an iterable of non-negative BigInt bitsets`
		)
	}
}

/**
 * Validates that a value is a non-negative BigInt bitset.
 *
 * @param {unknown} value
 * @returns {bigint}
 */
function assertBitset(value) {
	if (typeof value !== 'bigint') {
		throw new TypeError(`Bitset element must be a BigInt, received ${typeof value}`)
	}
	if (value < 0n) {
		throw new RangeError(`Bitset element must be non-negative, received ${value}`)
	}
	return value
}

/**
 * Opens an iterator from an iterable source and validates the iterator protocol.
 *
 * @param {Iterable<bigint>} source
 * @returns {Iterator<bigint>}
 */
function openIterator(source) {
	const iterator = source[Symbol.iterator]()
	if (
		iterator === null ||
		typeof iterator !== 'object' ||
		typeof iterator.next !== 'function'
	) {
		throw new TypeError('Iterable source did not return a valid iterator')
	}
	return iterator
}

/**
 * Yields the running cumulative bitwise AND of a single bitset iterable.
 *
 * @param {Iterable<bigint>} source
 * @returns {Generator<bigint, void, undefined>}
 */
function* runningAndBitsets(source) {
	const iterator = openIterator(source)
	let done = false
	let acc = null

	try {
		while (true) {
			const step = iterator.next()
			if (step.done) {
				done = true
				return
			}
			const value = assertBitset(step.value)
			acc = acc === null ? value : acc & value
			yield acc
		}
	} finally {
		if (!done && typeof iterator.return === 'function') {
			iterator.return()
		}
	}
}

/**
 * Yields the element-wise lockstep bitwise AND across two or more bitset iterables.
 *
 * @param {Iterable<bigint>[]} sources
 * @returns {Generator<bigint, void, undefined>}
 */
function* zipAndBitsets(sources) {
	const iterators = []
	const doneFlags = []

	try {
		for (let i = 0; i < sources.length; i++) {
			iterators.push(openIterator(sources[i]))
			doneFlags.push(false)
		}

		while (true) {
			let acc = null
			for (let i = 0; i < iterators.length; i++) {
				const step = iterators[i].next()
				if (step.done) {
					doneFlags[i] = true
					return
				}
				const value = assertBitset(step.value)
				acc = acc === null ? value : acc & value
			}
			yield acc
		}
	} finally {
		for (let i = iterators.length - 1; i >= 0; i--) {
			if (!doneFlags[i] && typeof iterators[i].return === 'function') {
				iterators[i].return()
			}
		}
	}
}
