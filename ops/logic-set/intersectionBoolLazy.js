/**
 * Lazily computes the logical or set-theoretic intersection over plain booleans
 * or JS `Set` objects using a streaming, generator-based pipeline.
 *
 * Supported call forms:
 * - Variadic plain booleans: `intersectionBoolLazy(b1, b2, ...)` -> `boolean`
 * - Variadic `Set` objects: `intersectionBoolLazy(s1, s2, ...)` -> `Set`
 * - Single iterable/sequence (e.g. Array, Generator, custom iterable) of plain
 *   booleans: `intersectionBoolLazy(boolIterable)` -> `boolean`
 * - Single iterable/sequence of `Set` objects:
 *   `intersectionBoolLazy(setIterable)` -> `Set`
 *
 * When given an iterable sequence, elements are pulled lazily one at a time and
 * consumption short-circuits immediately (closing the underlying iterator via
 * `return()`) as soon as an absorbing state is reached (`false` for booleans,
 * or an empty intersection for `Set` objects). Input `Set` objects are never
 * mutated, and a fresh `Set` instance is always returned in set mode.
 *
 * @module ops/logic-set/intersectionBoolLazy
 */

/**
 * Lazily yields values from an already-opened iterator, ensuring `iterator.return()`
 * is invoked if the consumer stops early or throws while handling a yielded value.
 *
 * @template T
 * @param {Iterator<T>} iterator
 * @returns {Generator<T, void, void>}
 */
function* streamRemaining(iterator) {
	let awaitingConsumer = false;
	try {
		while (true) {
			const step = iterator.next();
			if (step.done) {
				return;
			}
			awaitingConsumer = true;
			yield step.value;
			awaitingConsumer = false;
		}
	} finally {
		if (awaitingConsumer && typeof iterator.return === 'function') {
			iterator.return();
		}
	}
}

/**
 * Safely closes an iterator if it implements the optional `return()` method.
 *
 * @param {Iterator<unknown>} iterator
 */
function closeIterator(iterator) {
	if (typeof iterator.return === 'function') {
		iterator.return();
	}
}

/**
 * Streaming generator that validates and yields booleans from a source iterable,
 * terminating immediately after yielding `false`.
 *
 * @param {Iterable<unknown>} source
 * @returns {Generator<boolean, void, void>}
 */
function* lazyBooleanStream(source) {
	for (const value of source) {
		if (typeof value !== 'boolean') {
			throw new TypeError(
				'Expected all elements in boolean intersection to be plain booleans'
			);
		}
		yield value;
		if (value === false) {
			return;
		}
	}
}

/**
 * Streaming filter generator that lazily yields items from `source` that are
 * members of `predicateSet`.
 *
 * @template T
 * @param {Iterable<T>} source
 * @param {Set<T>} predicateSet
 * @returns {Generator<T, void, void>}
 */
function* filterInSet(source, predicateSet) {
	for (const item of source) {
		if (predicateSet.has(item)) {
			yield item;
		}
	}
}

/**
 * Chains generator filter stages over a non-empty array of validated `Set`
 * instances, starting from the smallest set to avoid intermediate allocations.
 *
 * @template T
 * @param {Set<T>[]} sets
 * @returns {Generator<T, void, void>}
 */
function* streamSetArrayIntersection(sets) {
	let smallestIndex = 0;
	for (let i = 0; i < sets.length; i++) {
		if (sets[i].size === 0) {
			return;
		}
		if (sets[i].size < sets[smallestIndex].size) {
			smallestIndex = i;
		}
	}

	/** @type {Iterable<T>} */
	let pipeline = sets[smallestIndex];
	for (let i = 0; i < sets.length; i++) {
		if (i !== smallestIndex) {
			pipeline = filterInSet(pipeline, sets[i]);
		}
	}

	yield* pipeline;
}

/**
 * Streaming generator that lazily intersects `firstSet` with subsequent `Set`
 * instances pulled from `restSets`, short-circuiting immediately when the
 * running intersection becomes empty.
 *
 * @template T
 * @param {Set<T>} firstSet
 * @param {Iterable<unknown>} restSets
 * @returns {Generator<T, void, void>}
 */
function* streamSetSequenceIntersection(firstSet, restSets) {
	if (firstSet.size === 0) {
		return;
	}

	/** @type {Set<T>} */
	let current = firstSet;
	for (const nextSet of restSets) {
		if (!(nextSet instanceof Set)) {
			throw new TypeError(
				'Expected all elements in set intersection to be Set instances'
			);
		}
		if (nextSet.size === 0) {
			return;
		}
		const [smaller, larger] =
			current.size <= nextSet.size ? [current, nextSet] : [nextSet, current];
		current = new Set(filterInSet(smaller, larger));
		if (current.size === 0) {
			return;
		}
	}

	yield* current;
}

/**
 * Checks whether a value is an eligible sequence iterable (excluding strings,
 * `Map` instances, `Boolean` wrappers, and TypedArrays/DataViews).
 *
 * @param {unknown} value
 * @returns {value is Iterable<unknown>}
 */
function isSequenceIterable(value) {
	if (value === null || typeof value !== 'object') {
		return false;
	}
	if (
		value instanceof Boolean ||
		value instanceof Map ||
		ArrayBuffer.isView(value)
	) {
		return false;
	}
	return typeof value[Symbol.iterator] === 'function';
}

/**
 * Computes the lazy logical conjunction (over plain booleans) or lazy set
 * intersection (over JS `Set` objects).
 *
 * @param {...(boolean | Set<any> | Iterable<boolean | Set<any>>)} args
 *   Either one or more plain booleans, one or more `Set` instances, or a single
 *   non-empty iterable sequence yielding all plain booleans or all `Set`
 *   instances.
 * @returns {boolean | Set<any>}
 *   A plain `boolean` for boolean inputs, or a newly allocated `Set` for `Set`
 *   inputs.
 * @throws {TypeError}
 *   If called with no arguments, unsupported operand types (such as strings,
 *   numbers, `null`, `undefined`, `new Boolean(...)`, `Map`, TypedArrays, or
 *   plain objects), or mixed boolean and `Set` operands.
 * @throws {RangeError}
 *   If given an empty iterable sequence.
 */
export function intersectionBoolLazy(...args) {
	if (args.length === 0) {
		throw new TypeError(
			'intersectionBoolLazy requires at least one argument (boolean, Set, or iterable sequence)'
		);
	}

	if (args.length === 1) {
		const single = args[0];

		if (typeof single === 'boolean') {
			return single;
		}

		if (single instanceof Set) {
			return new Set(single);
		}

		if (!isSequenceIterable(single)) {
			throw new TypeError(
				'Expected a plain boolean, Set, or iterable sequence of booleans or Sets'
			);
		}

		const iterator = single[Symbol.iterator]();
		if (
			iterator === null ||
			typeof iterator !== 'object' ||
			typeof iterator.next !== 'function'
		) {
			throw new TypeError('Iterable must return a valid iterator object');
		}

		const firstStep = iterator.next();
		if (firstStep.done) {
			throw new RangeError(
				'Input sequence must contain at least one boolean or Set'
			);
		}

		const firstValue = firstStep.value;

		if (typeof firstValue === 'boolean') {
			if (firstValue === false) {
				closeIterator(iterator);
				return false;
			}
			for (const value of lazyBooleanStream(streamRemaining(iterator))) {
				if (value === false) {
					return false;
				}
			}
			return true;
		}

		if (firstValue instanceof Set) {
			if (firstValue.size === 0) {
				closeIterator(iterator);
				return new Set();
			}
			return new Set(
				streamSetSequenceIntersection(firstValue, streamRemaining(iterator))
			);
		}

		closeIterator(iterator);
		throw new TypeError(
			'Sequence elements must all be plain booleans or all be Set instances'
		);
	}

	const firstArg = args[0];

	if (typeof firstArg === 'boolean') {
		for (let i = 1; i < args.length; i++) {
			if (typeof args[i] !== 'boolean') {
				throw new TypeError(
					'All variadic arguments must be plain booleans when the first argument is a boolean'
				);
			}
		}
		for (const value of lazyBooleanStream(args)) {
			if (value === false) {
				return false;
			}
		}
		return true;
	}

	if (firstArg instanceof Set) {
		for (let i = 1; i < args.length; i++) {
			if (!(args[i] instanceof Set)) {
				throw new TypeError(
					'All variadic arguments must be Set instances when the first argument is a Set'
				);
			}
		}
		return new Set(streamSetArrayIntersection(args));
	}

	throw new TypeError(
		'Multiple arguments must all be plain booleans or all be Set instances'
	);
}
