/**
 * Lazily adds IEEE-754 float64 numbers using a streaming generator.
 *
 * Supports pairwise addition of two iterables, scalar-to-iterable broadcasting
 * in either operand position, and scalar-to-scalar addition as a single-element
 * stream. Iterable inputs are consumed strictly on demand (one element per
 * `.next()` call, with zero lookahead) and are closed via `iterator.return()`
 * if consumption stops early or when the shorter iterable is exhausted.
 *
 * @module ops/arithmetic/addFloatLazy
 */

/**
 * Describes a runtime value's type for diagnostic error messages.
 *
 * @param {unknown} value
 * @returns {string}
 */
function describeType(value) {
	if (value === null) return 'null'
	if (value instanceof String) return 'String object'
	if (value instanceof Number) return 'Number object'
	if (Array.isArray(value)) return 'Array'
	return typeof value
}

/**
 * Returns true if `value` is a valid iterable sequence operand.
 * Strings (primitive or boxed) are explicitly excluded so character sequences
 * are not silently treated as numeric streams.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isIterableOperand(value) {
	return (
		value !== null &&
		typeof value === 'object' &&
		!(value instanceof String) &&
		typeof value[Symbol.iterator] === 'function'
	)
}

/**
 * Validates that an operand is either a primitive IEEE-754 float64 `number`
 * or an iterable object.
 *
 * @param {unknown} value
 * @param {string} name
 * @returns {'number' | 'iterable'}
 */
function classifyOperand(value, name) {
	if (typeof value === 'number') {
		return 'number'
	}
	if (isIterableOperand(value)) {
		return 'iterable'
	}
	throw new TypeError(
		`addFloatLazy: operand "${name}" must be an IEEE-754 float64 number or an iterable of numbers, got ${describeType(value)}`,
	)
}

/**
 * Validates that an individual element is a primitive IEEE-754 float64 `number`.
 * All IEEE-754 float64 values are accepted, including `-0`, subnormals,
 * `Infinity`, `-Infinity`, and `NaN`.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {number}
 */
function validateFloat64(value, label) {
	if (typeof value !== 'number') {
		throw new TypeError(
			`addFloatLazy: ${label} must be an IEEE-754 float64 number, got ${describeType(value)}`,
		)
	}
	return value
}

/**
 * Acquires and validates an iterator from an iterable operand.
 *
 * @param {Iterable<unknown>} iterable
 * @param {string} name
 * @returns {Iterator<unknown>}
 */
function openIterator(iterable, name) {
	const iter = iterable[Symbol.iterator]()
	if (iter === null || typeof iter !== 'object' || typeof iter.next !== 'function') {
		throw new TypeError(
			`addFloatLazy: operand "${name}" returned an invalid iterator (${describeType(iter)})`,
		)
	}
	return iter
}

/**
 * Closes an unfinished iterator if it implements `return()`.
 *
 * @param {Iterator<unknown>} iter
 */
function closeIterator(iter) {
	if (typeof iter.return === 'function') {
		iter.return()
	}
}

/**
 * @param {number} a
 * @param {number} b
 * @returns {Generator<number, void, undefined>}
 */
function* addScalarScalar(a, b) {
	yield a + b
}

/**
 * @param {number} scalar
 * @param {Iterable<number>} iterable
 * @param {string} label
 * @returns {Generator<number, void, undefined>}
 */
function* addScalarIterable(scalar, iterable, label) {
	const iter = openIterator(iterable, label)
	let done = false
	let index = 0

	try {
		while (true) {
			const step = iter.next()
			if (step.done) {
				done = true
				return
			}
			const value = validateFloat64(step.value, `${label}[${index}]`)
			yield scalar + value
			index += 1
		}
	} finally {
		if (!done) {
			closeIterator(iter)
		}
	}
}

/**
 * @param {Iterable<number>} iterable
 * @param {number} scalar
 * @param {string} label
 * @returns {Generator<number, void, undefined>}
 */
function* addIterableScalar(iterable, scalar, label) {
	const iter = openIterator(iterable, label)
	let done = false
	let index = 0

	try {
		while (true) {
			const step = iter.next()
			if (step.done) {
				done = true
				return
			}
			const value = validateFloat64(step.value, `${label}[${index}]`)
			yield value + scalar
			index += 1
		}
	} finally {
		if (!done) {
			closeIterator(iter)
		}
	}
}

/**
 * @param {Iterable<number>} a
 * @param {Iterable<number>} b
 * @returns {Generator<number, void, undefined>}
 */
function* addIterableIterable(a, b) {
	const iterA = openIterator(a, 'a')
	let iterB = null
	let doneA = false
	let doneB = false
	let index = 0

	try {
		while (true) {
			const stepA = iterA.next()
			if (stepA.done) {
				doneA = true
				return
			}
			const valA = validateFloat64(stepA.value, `a[${index}]`)

			if (iterB === null) {
				iterB = openIterator(b, 'b')
			}
			const stepB = iterB.next()
			if (stepB.done) {
				doneB = true
				return
			}
			const valB = validateFloat64(stepB.value, `b[${index}]`)

			yield valA + valB
			index += 1
		}
	} finally {
		try {
			if (!doneA) {
				closeIterator(iterA)
			}
		} finally {
			if (iterB !== null && iterB !== iterA && !doneB) {
				closeIterator(iterB)
			}
		}
	}
}

/**
 * Lazily computes IEEE-754 float64 arithmetic addition (`a + b`) as a
 * generator stream.
 *
 * - `(Iterable<number>, Iterable<number>)`: yields pairwise sums `a[i] + b[i]`
 *   until the shorter iterable is exhausted.
 * - `(number, Iterable<number>)` or `(Iterable<number>, number)`: broadcasts
 *   the scalar across every element of the iterable.
 * - `(number, number)`: yields the single float64 sum `a + b`.
 *
 * Top-level argument validation is performed eagerly on invocation; element
 * validation is performed lazily as each item is pulled from its iterator.
 *
 * @param {number | Iterable<number>} a - First float64 number or iterable of float64 numbers.
 * @param {number | Iterable<number>} b - Second float64 number or iterable of float64 numbers.
 * @returns {Generator<number, void, undefined>} A lazy generator yielding IEEE-754 float64 sums.
 * @throws {TypeError} If the argument count is not 2, an operand is neither a
 *   float64 number nor a non-string iterable, an iterable returns an invalid
 *   iterator, or a yielded element is not a primitive `number`.
 */
export function addFloatLazy(a, b) {
	if (arguments.length !== 2) {
		throw new TypeError(
			`addFloatLazy requires exactly 2 arguments (a, b), got ${arguments.length}`,
		)
	}

	const kindA = classifyOperand(a, 'a')
	const kindB = classifyOperand(b, 'b')

	if (kindA === 'number' && kindB === 'number') {
		return addScalarScalar(a, b)
	}
	if (kindA === 'number') {
		return addScalarIterable(a, b, 'b')
	}
	if (kindB === 'number') {
		return addIterableScalar(a, b, 'a')
	}
	return addIterableIterable(a, b)
}
