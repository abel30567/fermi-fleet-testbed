/**
 * Default strict total-order comparator for primitive comparable values
 * (`number`, `bigint`, or `string`).
 *
 * @template T
 * @param {T} a
 * @param {T} b
 * @returns {number} Negative if `a < b`, `0` if `a === b`, positive if `a > b`.
 * @throws {TypeError} If either value is not a supported primitive or types differ.
 * @throws {RangeError} If either value is `NaN`.
 */
function defaultCompare(a, b) {
	validateDefaultComparable(a)
	validateDefaultComparable(b)
	if (typeof a !== typeof b) {
		throw new TypeError(
			`Cannot compare values of different types (${typeof a} vs ${typeof b}) without a custom comparator`,
		)
	}
	if (a < b) return -1
	if (a > b) return 1
	return 0
}

/**
 * Validates that a value is supported by `defaultCompare`.
 *
 * @param {unknown} value
 * @throws {TypeError} If value is not a `number`, `bigint`, or `string`.
 * @throws {RangeError} If value is `NaN`.
 */
function validateDefaultComparable(value) {
	const type = typeof value
	if (type !== 'number' && type !== 'bigint' && type !== 'string') {
		throw new TypeError(
			`Default comparator only supports number, bigint, or string values; received ${value === null ? 'null' : type}`,
		)
	}
	if (type === 'number' && Number.isNaN(value)) {
		throw new RangeError('Input sequence contains NaN, which cannot be ordered')
	}
}

/**
 * Invokes `compare(x, y)` and ensures it returns a valid finite-comparable number (not NaN).
 *
 * @template T
 * @param {(x: T, y: T) => number} compare
 * @param {T} x
 * @param {T} y
 * @returns {number}
 * @throws {TypeError} If `compare` does not return a non-NaN number.
 */
function safeCompare(compare, x, y) {
	const result = compare(x, y)
	if (typeof result !== 'number' || Number.isNaN(result)) {
		throw new TypeError('Comparator must return a non-NaN number')
	}
	return result
}

/**
 * Validates that a value is a non-null iterable object (such as an Array,
 * TypedArray, Set, Generator, or custom iterable).
 *
 * @param {unknown} value
 * @param {string} name
 * @throws {TypeError} If `value` is not an iterable object.
 */
function assertIterable(value, name) {
	if (
		value === null ||
		typeof value !== 'object' ||
		typeof value[Symbol.iterator] !== 'function'
	) {
		throw new TypeError(
			`Expected "${name}" to be an iterable object (e.g. Array or generator)`,
		)
	}
}

/**
 * Lazily computes the set intersection of two strictly sorted, de-duplicated
 * iterable sequences using a two-pointer merge-style generator algorithm.
 *
 * Elements are pulled on demand without materializing either input sequence,
 * allowing callers to stop early or intersect infinite sorted streams.
 * Both inputs are validated lazily as elements are consumed to ensure they
 * remain strictly ordered according to `compare` (no out-of-order or duplicate
 * elements). Unfinished underlying iterators are closed via `.return()` if the
 * consumer exits early.
 *
 * @template T
 * @param {Iterable<T>} a - First strictly ascending, de-duplicated sorted sequence.
 * @param {Iterable<T>} b - Second strictly ascending, de-duplicated sorted sequence.
 * @param {(x: T, y: T) => number} [compare] - Optional comparator returning `< 0`, `0`, or `> 0`.
 *   Defaults to ascending order for homogeneous `number`, `bigint`, or `string` sequences.
 * @returns {Generator<T, void, undefined>} Lazy generator yielding common elements in sorted order.
 * @throws {TypeError} Eagerly if `a` or `b` is not an iterable object, or if `compare` is not a function;
 *   lazily if `compare` returns a non-number/`NaN` or incompatible types are encountered.
 * @throws {RangeError} Lazily if either sequence is unsorted, contains duplicates, or contains `NaN`
 *   under the default comparator.
 */
export function intersectionSortedArrLazy(a, b, compare = defaultCompare) {
	assertIterable(a, 'a')
	assertIterable(b, 'b')
	if (typeof compare !== 'function') {
		throw new TypeError('Expected "compare" to be a function')
	}

	const isDefaultCompare = compare === defaultCompare

	return (function* mergeIntersection() {
		const iterA = a[Symbol.iterator]()
		const iterB = b[Symbol.iterator]()

		let stepA = { done: true, value: undefined }
		let stepB = { done: true, value: undefined }
		let hasA = false
		let hasB = false
		let prevA
		let prevB

		const advanceA = () => {
			stepA = iterA.next()
			if (stepA.done) return false
			if (isDefaultCompare) {
				validateDefaultComparable(stepA.value)
			}
			if (hasA) {
				const order = safeCompare(compare, prevA, stepA.value)
				if (order > 0) {
					throw new RangeError(
						'Input sequence "a" must be sorted in ascending order',
					)
				}
				if (order === 0) {
					throw new RangeError(
						'Input sequence "a" must be de-duplicated (duplicate element detected)',
					)
				}
			}
			prevA = stepA.value
			hasA = true
			return true
		}

		const advanceB = () => {
			stepB = iterB.next()
			if (stepB.done) return false
			if (isDefaultCompare) {
				validateDefaultComparable(stepB.value)
			}
			if (hasB) {
				const order = safeCompare(compare, prevB, stepB.value)
				if (order > 0) {
					throw new RangeError(
						'Input sequence "b" must be sorted in ascending order',
					)
				}
				if (order === 0) {
					throw new RangeError(
						'Input sequence "b" must be de-duplicated (duplicate element detected)',
					)
				}
			}
			prevB = stepB.value
			hasB = true
			return true
		}

		try {
			if (!advanceA()) return
			if (!advanceB()) return

			while (true) {
				const cmp = safeCompare(compare, stepA.value, stepB.value)
				if (cmp === 0) {
					yield stepA.value
					if (!advanceA()) return
					if (!advanceB()) return
				} else if (cmp < 0) {
					if (!advanceA()) return
				} else {
					if (!advanceB()) return
				}
			}
		} finally {
			if (!stepA.done && typeof iterA.return === 'function') {
				iterA.return()
			}
			if (!stepB.done && typeof iterB.return === 'function') {
				iterB.return()
			}
		}
	})()
}
