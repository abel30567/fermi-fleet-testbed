/**
 * Checks whether a value is a non-string iterable object.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isNonStringIterable(value) {
	return (
		value !== null &&
		typeof value === 'object' &&
		!(value instanceof String) &&
		typeof value[Symbol.iterator] === 'function'
	)
}

/**
 * Checks whether a value can serve as a multiset source (a Map or a non-string iterable).
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isMultisetSource(value) {
	return value instanceof Map || isNonStringIterable(value)
}

/**
 * Validates that a multiset count is a non-negative safe integer.
 *
 * @param {unknown} count
 * @throws {TypeError} If count is not a number.
 * @throws {RangeError} If count is NaN, non-finite, non-integer, negative, or unsafe.
 */
function validateCount(count) {
	if (typeof count !== 'number') {
		throw new TypeError(`Multiset count must be a number, got ${typeof count}`)
	}
	if (!Number.isSafeInteger(count) || count < 0) {
		throw new RangeError(
			`Multiset count must be a non-negative safe integer, got ${count}`
		)
	}
}

/**
 * Validates a `[value, count]` multiset entry tuple.
 *
 * @param {unknown} entry
 * @throws {TypeError} If entry is not a 2-element array or count is not a number.
 * @throws {RangeError} If count is not a non-negative safe integer.
 */
function validateEntry(entry) {
	if (!Array.isArray(entry) || entry.length !== 2) {
		throw new TypeError('Multiset entry must be a [value, count] tuple')
	}
	validateCount(entry[1])
}

/**
 * Distinguishes a `[value, count]` entry candidate from a nested multiset when
 * inspecting the first element of a single iterable argument.
 *
 * @param {unknown} item
 * @returns {boolean}
 */
function isEntryTupleCandidate(item) {
	return (
		Array.isArray(item) &&
		item.length === 2 &&
		!(item[1] instanceof Map) &&
		!isNonStringIterable(item[1])
	)
}

/**
 * Yields `first` followed by the remaining values of `iterator`, closing the
 * iterator if consumption terminates early.
 *
 * @template T
 * @param {T} first
 * @param {Iterator<T>} iterator
 * @returns {Generator<T, void, void>}
 */
function* prependIterator(first, iterator) {
	let completed = false
	try {
		yield first
		while (true) {
			const step = iterator.next()
			if (step.done) {
				completed = true
				return
			}
			yield step.value
		}
	} finally {
		if (!completed && typeof iterator.return === 'function') {
			iterator.return()
		}
	}
}

/**
 * Lazily streams validated `[value, count]` entries from a single multiset source.
 *
 * @template T
 * @param {Map<T, number> | Iterable<[T, number]>} source
 * @returns {Generator<[T, number], void, void>}
 */
function* streamValidatedEntries(source) {
	if (source instanceof Map) {
		for (const [key, count] of source) {
			validateCount(count)
			yield [key, count]
		}
		return
	}
	for (const entry of source) {
		validateEntry(entry)
		yield [entry[0], entry[1]]
	}
}

/**
 * Lazily streams the multiset OR across one or more `Map<T, number>` instances
 * without materializing a merged map or iterating untouched entries ahead of demand.
 *
 * @template T
 * @param {Array<Map<T, number>>} maps
 * @returns {Generator<[T, number], void, void>}
 */
function* orMapsLazy(maps) {
	if (maps.length === 1) {
		for (const [key, count] of maps[0]) {
			validateCount(count)
			if (count > 0) {
				yield [key, count]
			}
		}
		return
	}

	const seen = new Set()
	for (let i = 0; i < maps.length; i++) {
		const current = maps[i]
		for (const [key, rawCount] of current) {
			validateCount(rawCount)
			if (seen.has(key)) continue

			let maxCount = rawCount
			for (let j = i + 1; j < maps.length; j++) {
				const other = maps[j]
				if (other.has(key)) {
					const otherCount = other.get(key)
					validateCount(otherCount)
					if (otherCount > maxCount) {
						maxCount = otherCount
					}
				}
			}

			seen.add(key)
			if (maxCount > 0) {
				yield [key, maxCount]
			}
		}
	}
}

/**
 * Lazily consumes an iterable of multiset sources in a single streaming pass,
 * retaining only positive maximum counts per key, then yields `[value, count]` pairs.
 *
 * @template T
 * @param {Iterable<Map<T, number> | Iterable<[T, number]>>} multisets
 * @returns {Generator<[T, number], void, void>}
 */
function* orMultisetSequenceLazy(multisets) {
	const acc = new Map()
	for (const multiset of multisets) {
		if (!isMultisetSource(multiset)) {
			throw new TypeError(
				'Each multiset must be a Map or non-string iterable of [value, count] entries'
			)
		}
		for (const [key, count] of streamValidatedEntries(multiset)) {
			if (count > 0) {
				const prev = acc.get(key)
				if (prev === undefined || count > prev) {
					acc.set(key, count)
				}
			}
		}
	}
	for (const entry of acc) {
		yield entry
	}
}

/**
 * Lazily consumes a single non-string iterable that is either an iterable of
 * `[value, count]` entries or an iterable of multisets.
 *
 * @template T
 * @param {Iterable<unknown>} iterable
 * @returns {Generator<[T, number], void, void>}
 */
function* orSingleIterableLazy(iterable) {
	const iterator = iterable[Symbol.iterator]()
	const firstStep = iterator.next()
	if (firstStep.done) {
		return
	}

	const first = firstStep.value
	if (isEntryTupleCandidate(first)) {
		const acc = new Map()
		for (const entry of prependIterator(first, iterator)) {
			validateEntry(entry)
			const [key, count] = entry
			if (count > 0) {
				const prev = acc.get(key)
				if (prev === undefined || count > prev) {
					acc.set(key, count)
				}
			}
		}
		for (const entry of acc) {
			yield entry
		}
		return
	}

	if (!isMultisetSource(first)) {
		if (typeof iterator.return === 'function') {
			iterator.return()
		}
		throw new TypeError(
			'Each multiset must be a Map or non-string iterable of [value, count] entries'
		)
	}

	yield* orMultisetSequenceLazy(prependIterator(first, iterator))
}

/**
 * Computes the lazy multiset logical OR (counting-logic join / multiset union)
 * over `Map<value, count>` multisets and/or lazy iterables of multisets or entries.
 *
 * For each element `x`, its resulting multiplicity is `max(count_1(x), ..., count_n(x))`,
 * omitting entries whose final count is `0`. This generalizes boolean OR over `{0, 1}`
 * indicator multisets while remaining commutative, associative, and idempotent.
 *
 * Returns a generator yielding `[value, count]` entries (which can be streamed lazily
 * or materialized via `new Map(orMultisetLazy(...))`):
 * - No input iterables are consumed until iteration begins.
 * - When all arguments are `Map` instances, entries are streamed lazily key-by-key
 *   using `O(1)` lookups on the remaining maps without iterating untouched entries.
 * - When given a sequence of multisets or entry iterables, inputs are consumed in a
 *   single streaming pass using `O(|unique keys|)` memory.
 *
 * Supported call forms:
 * - `orMultisetLazy()` -> empty generator
 * - `orMultisetLazy(map)` -> lazy validated stream of positive entries in `map`
 * - `orMultisetLazy(multisetsIterable)` -> OR over a lazy iterable of multisets
 * - `orMultisetLazy(entriesIterable)` -> OR over a lazy iterable of `[value, count]` entries
 * - `orMultisetLazy(m1, m2, ...rest)` -> OR across multiple `Map` or entry-iterable multisets
 *
 * @template T
 * @param {...(Map<T, number> | Iterable<[T, number]> | Iterable<Map<T, number> | Iterable<[T, number]>>)} inputs
 * @returns {Generator<[T, number], void, void>} Generator yielding `[value, count]` entries with `count > 0`.
 * @throws {TypeError} If any input is not a `Map` or non-string iterable, or if an entry/count has an invalid type.
 * @throws {RangeError} If any count is not a non-negative safe integer.
 */
export function orMultisetLazy(...inputs) {
	if (inputs.length === 0) {
		return (function* empty() {})()
	}

	for (let i = 0; i < inputs.length; i++) {
		if (!isMultisetSource(inputs[i])) {
			throw new TypeError(
				`Argument at index ${i} must be a Map or non-string iterable`
			)
		}
	}

	if (inputs.length === 1) {
		const only = inputs[0]
		if (only instanceof Map) {
			return orMapsLazy([only])
		}
		return orSingleIterableLazy(only)
	}

	if (inputs.every((input) => input instanceof Map)) {
		return orMapsLazy(inputs)
	}

	return orMultisetSequenceLazy(inputs)
}
