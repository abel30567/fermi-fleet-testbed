/**
 * Validate that a value is a non-null iterable object (excluding primitive strings).
 *
 * @param {unknown} value
 * @param {string} label
 */
function assertIterableObject(value, label) {
	if (
		value === null ||
		typeof value !== 'object' ||
		typeof value[Symbol.iterator] !== 'function'
	) {
		throw new TypeError(
			`Expected "${label}" to be an iterable object (e.g. Array, TypedArray, Set, or generator)`
		)
	}
}

/**
 * Validate that a value is supported by the default comparator.
 *
 * @param {unknown} value
 * @param {string} label
 */
function validateDefaultValue(value, label) {
	const type = typeof value
	if (type === 'number') {
		if (Number.isNaN(value)) {
			throw new RangeError(`Input sequence "${label}" must not contain NaN`)
		}
		return
	}
	if (type === 'bigint' || type === 'string') {
		return
	}
	throw new TypeError(
		`Input sequence "${label}" contains unsupported value of type "${type}" for default comparator; provide a custom compare function`
	)
}

/**
 * Default strict ascending comparator for numbers, bigints, and strings.
 *
 * @param {number|bigint|string} x
 * @param {number|bigint|string} y
 * @returns {number}
 */
function defaultCompare(x, y) {
	const typeX = typeof x
	const typeY = typeof y
	if (typeX !== typeY) {
		throw new TypeError(
			`Cannot compare values of different types ("${typeX}" and "${typeY}") with default comparator; provide a custom compare function`
		)
	}
	if (typeX === 'number') {
		if (Number.isNaN(x) || Number.isNaN(y)) {
			throw new RangeError('Cannot compare NaN values')
		}
	} else if (typeX !== 'bigint' && typeX !== 'string') {
		throw new TypeError(
			`Unsupported value type "${typeX}" for default comparator; provide a custom compare function`
		)
	}
	return x < y ? -1 : x > y ? 1 : 0
}

/**
 * Invoke comparator and verify it returns a non-NaN number.
 *
 * @template T
 * @param {(x: T, y: T) => number} compare
 * @param {T} x
 * @param {T} y
 * @returns {number}
 */
function safeCompare(compare, x, y) {
	const result = compare(x, y)
	if (typeof result !== 'number') {
		throw new TypeError('Comparator must return a number')
	}
	if (Number.isNaN(result)) {
		throw new RangeError('Comparator must not return NaN')
	}
	return result
}

/**
 * Obtain and validate an iterator from an iterable.
 *
 * @template T
 * @param {Iterable<T>} iterable
 * @param {string} label
 * @returns {Iterator<T>}
 */
function getIterator(iterable, label) {
	const iter = iterable[Symbol.iterator]()
	if (
		iter === null ||
		typeof iter !== 'object' ||
		typeof iter.next !== 'function'
	) {
		throw new TypeError(
			`Input "${label}" [Symbol.iterator]() must return an iterator object with a next() method`
		)
	}
	return iter
}

/**
 * Advance an iterator by one element and validate strict ascending order.
 *
 * @template T
 * @param {Iterator<T>} iter
 * @param {boolean} hasPrev
 * @param {T|undefined} prev
 * @param {string} label
 * @param {(x: T, y: T) => number} compare
 * @param {boolean} isDefault
 * @returns {IteratorResult<T>}
 */
function nextValidated(iter, hasPrev, prev, label, compare, isDefault) {
	const step = iter.next()
	if (step === null || typeof step !== 'object') {
		throw new TypeError(
			`Iterator for "${label}" returned a non-object result`
		)
	}
	if (step.done) {
		return step
	}
	const val = step.value
	if (isDefault) {
		validateDefaultValue(val, label)
	}
	if (hasPrev) {
		const order = safeCompare(compare, prev, val)
		if (order > 0) {
			throw new RangeError(
				`Input sequence "${label}" is not sorted in ascending order`
			)
		}
		if (order === 0) {
			throw new RangeError(
				`Input sequence "${label}" contains duplicate elements`
			)
		}
	}
	return step
}

/**
 * Close any unfinished upstream iterators on early termination or error.
 *
 * @param {Iterator<any>|null} iterA
 * @param {boolean} doneA
 * @param {Iterator<any>|null} iterB
 * @param {boolean} doneB
 */
function closeIterators(iterA, doneA, iterB, doneB) {
	let firstError
	let hasError = false

	if (!doneA && iterA !== null && typeof iterA.return === 'function') {
		try {
			iterA.return()
		} catch (err) {
			firstError = err
			hasError = true
		}
	}

	if (!doneB && iterB !== null && typeof iterB.return === 'function') {
		try {
			iterB.return()
		} catch (err) {
			if (!hasError) {
				firstError = err
				hasError = true
			}
		}
	}

	if (hasError) {
		throw firstError
	}
}

/**
 * Internal generator performing the lazy two-way merge symmetric difference.
 *
 * @template T
 * @param {Iterable<T>} a
 * @param {Iterable<T>} b
 * @param {(x: T, y: T) => number} compare
 * @param {boolean} isDefault
 * @returns {Generator<T, void, void>}
 */
function* xorStream(a, b, compare, isDefault) {
	let iterA = null
	let iterB = null
	let doneA = true
	let doneB = true

	try {
		iterA = getIterator(a, 'a')
		doneA = false
		iterB = getIterator(b, 'b')
		doneB = false

		let stepA = nextValidated(iterA, false, undefined, 'a', compare, isDefault)
		doneA = Boolean(stepA.done)

		let stepB = nextValidated(iterB, false, undefined, 'b', compare, isDefault)
		doneB = Boolean(stepB.done)

		while (!doneA && !doneB) {
			const valA = stepA.value
			const valB = stepB.value
			const cmp = safeCompare(compare, valA, valB)

			if (cmp < 0) {
				yield valA
				stepA = nextValidated(iterA, true, valA, 'a', compare, isDefault)
				doneA = Boolean(stepA.done)
			} else if (cmp > 0) {
				yield valB
				stepB = nextValidated(iterB, true, valB, 'b', compare, isDefault)
				doneB = Boolean(stepB.done)
			} else {
				stepA = nextValidated(iterA, true, valA, 'a', compare, isDefault)
				doneA = Boolean(stepA.done)
				stepB = nextValidated(iterB, true, valB, 'b', compare, isDefault)
				doneB = Boolean(stepB.done)
			}
		}

		while (!doneA) {
			const valA = stepA.value
			yield valA
			stepA = nextValidated(iterA, true, valA, 'a', compare, isDefault)
			doneA = Boolean(stepA.done)
		}

		while (!doneB) {
			const valB = stepB.value
			yield valB
			stepB = nextValidated(iterB, true, valB, 'b', compare, isDefault)
			doneB = Boolean(stepB.done)
		}
	} finally {
		closeIterators(iterA, doneA, iterB, doneB)
	}
}

/**
 * Lazily computes the logical XOR (symmetric difference) of two strictly sorted,
 * de-duplicated sequences using a streaming two-way merge algorithm.
 *
 * Elements are pulled from `a` and `b` on demand in O(1) auxiliary space, making
 * it safe for large or infinite sorted iterables. Both sequences must be strictly
 * increasing according to `compare` (no out-of-order or duplicate elements).
 * Unfinished upstream iterators are automatically closed via `.return()` if
 * iteration terminates early.
 *
 * @template T
 * @param {Iterable<T>} a - First sorted, de-duplicated iterable sequence.
 * @param {Iterable<T>} b - Second sorted, de-duplicated iterable sequence.
 * @param {(x: T, y: T) => number} [compare] - Optional comparator returning a negative
 *   number when `x < y`, `0` when equal, or a positive number when `x > y`. Defaults to
 *   strict ascending order for numbers, bigints, or strings of matching type.
 * @returns {Generator<T, void, void>} A lazy generator yielding elements present in
 *   exactly one of `a` or `b`, in strictly sorted order.
 * @throws {TypeError} If `a` or `b` is not an iterable object, if `compare` is provided
 *   and not a function, if an iterator violates the iterator protocol, or if values are
 *   incompatible with the comparator.
 * @throws {RangeError} During iteration if either input sequence is unsorted, contains
 *   duplicate elements, contains `NaN` (with default comparator), or if `compare` returns `NaN`.
 */
export function xorSortedArrLazy(a, b, compare) {
	assertIterableObject(a, 'a')
	assertIterableObject(b, 'b')

	const isDefault = compare === undefined
	if (!isDefault && typeof compare !== 'function') {
		throw new TypeError('Expected "compare" to be a function when provided')
	}

	return xorStream(a, b, isDefault ? defaultCompare : compare, isDefault)
}
