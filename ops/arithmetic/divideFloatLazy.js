/**
 * Lazily performs IEEE-754 float64 division over numbers and/or iterable sequences.
 *
 * Accepts any combination of scalar `number` values and non-string `Iterable<number>`
 * sequences (such as Arrays, Generators, TypedArrays, Sets, or custom iterables):
 * - `(iterable, iterable)`: yields pairwise quotients `a / b`, stopping when the
 *   shorter iterable finishes (unless `options.strictLength` is `true`).
 * - `(iterable, scalar)`: broadcasts the scalar divisor across every element of `numerators`.
 * - `(scalar, iterable)`: broadcasts the scalar dividend across every element of `denominators`.
 * - `(scalar, scalar)`: yields a single quotient `numerators / denominators`.
 *
 * Top-level arguments and options are validated eagerly before returning the generator.
 * Input iterables are never pulled until `.next()` is invoked on the returned generator,
 * and unfinished source iterators are closed via `.return()` if iteration terminates early
 * or throws.
 *
 * By default, arithmetic follows standard IEEE-754 binary64 semantics (including signed
 * zeros, `Infinity`, `-Infinity`, `NaN`, subnormals, overflow, and underflow).
 *
 * @param {number | Iterable<number>} numerators - Dividend float64 number or iterable of float64 numbers.
 * @param {number | Iterable<number>} denominators - Divisor float64 number or iterable of float64 numbers.
 * @param {object} [options] - Optional behavior flags.
 * @param {boolean} [options.strictZero=false] - When `true`, throw a `RangeError` instead of
 *   applying IEEE-754 division-by-zero semantics when a divisor is `0` or `-0`.
 * @param {boolean} [options.strictLength=false] - When `true` and both inputs are iterables,
 *   throw a `RangeError` if the two iterables do not have the same length.
 * @returns {Generator<number, void, undefined>} Lazy generator yielding IEEE-754 float64 quotients.
 * @throws {TypeError} If `numerators`, `denominators`, `options`, or any yielded element has an invalid type.
 * @throws {RangeError} If `strictZero` is enabled and a divisor is zero, or if `strictLength` is enabled
 *   and the input iterables have different lengths.
 */
export function divideFloatLazy(numerators, denominators, options = undefined) {
	if (arguments.length < 2) {
		throw new TypeError('divideFloatLazy requires two operands: (numerators, denominators)')
	}

	const numKind = classifyOperand(numerators, 'numerators')
	const denKind = classifyOperand(denominators, 'denominators')
	const { strictZero, strictLength } = parseOptions(options)

	if (numKind === 'scalar' && denKind === 'scalar') {
		return divideScalars(numerators, denominators, strictZero)
	}
	if (numKind === 'iterable' && denKind === 'scalar') {
		return divideIterableByScalar(numerators, denominators, strictZero)
	}
	if (numKind === 'scalar' && denKind === 'iterable') {
		return divideScalarByIterable(numerators, denominators, strictZero)
	}
	return divideTwoIterables(numerators, denominators, strictZero, strictLength)
}

/**
 * Classifies an operand as `'scalar'` or `'iterable'`, or throws a `TypeError`.
 *
 * @param {unknown} value
 * @param {string} name
 * @returns {'scalar' | 'iterable'}
 */
function classifyOperand(value, name) {
	if (typeof value === 'number') {
		return 'scalar'
	}
	if (
		value !== null &&
		value !== undefined &&
		typeof value !== 'string' &&
		!(value instanceof String) &&
		typeof value[Symbol.iterator] === 'function'
	) {
		return 'iterable'
	}
	throw new TypeError(`${name} must be a number or a non-string iterable of numbers`)
}

/**
 * Validates and normalizes the optional `options` object.
 *
 * @param {unknown} options
 * @returns {{ strictZero: boolean, strictLength: boolean }}
 */
function parseOptions(options) {
	if (options === undefined) {
		return { strictZero: false, strictLength: false }
	}
	if (typeof options !== 'object' || options === null || Array.isArray(options)) {
		throw new TypeError('options must be a plain object when provided')
	}

	const { strictZero = false, strictLength = false } = options
	if (typeof strictZero !== 'boolean') {
		throw new TypeError('options.strictZero must be a boolean')
	}
	if (typeof strictLength !== 'boolean') {
		throw new TypeError('options.strictLength must be a boolean')
	}
	return { strictZero, strictLength }
}

/**
 * Acquires and validates an iterator from an iterable.
 *
 * @param {Iterable<number>} iterable
 * @param {string} name
 * @returns {Iterator<number>}
 */
function acquireIterator(iterable, name) {
	const iterator = iterable[Symbol.iterator]()
	if (
		iterator === null ||
		typeof iterator !== 'object' ||
		typeof iterator.next !== 'function'
	) {
		throw new TypeError(`${name}[Symbol.iterator]() must return an iterator object`)
	}
	return iterator
}

/**
 * Safely closes an iterator if it has not already finished.
 *
 * @param {Iterator<unknown> | undefined} iterator
 * @param {boolean} done
 */
function closeIterator(iterator, done) {
	if (iterator && !done && typeof iterator.return === 'function') {
		iterator.return()
	}
}

/**
 * Validates two operands as IEEE-754 float64 numbers and returns their quotient.
 *
 * @param {unknown} dividend
 * @param {unknown} divisor
 * @param {boolean} strictZero
 * @returns {number}
 */
function dividePair(dividend, divisor, strictZero) {
	if (typeof dividend !== 'number') {
		throw new TypeError(
			`Expected dividend element to be a number, got ${dividend === null ? 'null' : typeof dividend}`,
		)
	}
	if (typeof divisor !== 'number') {
		throw new TypeError(
			`Expected divisor element to be a number, got ${divisor === null ? 'null' : typeof divisor}`,
		)
	}
	if (strictZero && divisor === 0) {
		throw new RangeError('Division by zero is not allowed when options.strictZero is true')
	}
	return dividend / divisor
}

/**
 * @param {number} numerator
 * @param {number} denominator
 * @param {boolean} strictZero
 * @returns {Generator<number, void, undefined>}
 */
function* divideScalars(numerator, denominator, strictZero) {
	yield dividePair(numerator, denominator, strictZero)
}

/**
 * @param {Iterable<number>} numerators
 * @param {number} denominator
 * @param {boolean} strictZero
 * @returns {Generator<number, void, undefined>}
 */
function* divideIterableByScalar(numerators, denominator, strictZero) {
	const numIter = acquireIterator(numerators, 'numerators')
	let numDone = false
	try {
		while (true) {
			const step = numIter.next()
			if (step.done) {
				numDone = true
				return
			}
			yield dividePair(step.value, denominator, strictZero)
		}
	} finally {
		closeIterator(numIter, numDone)
	}
}

/**
 * @param {number} numerator
 * @param {Iterable<number>} denominators
 * @param {boolean} strictZero
 * @returns {Generator<number, void, undefined>}
 */
function* divideScalarByIterable(numerator, denominators, strictZero) {
	const denIter = acquireIterator(denominators, 'denominators')
	let denDone = false
	try {
		while (true) {
			const step = denIter.next()
			if (step.done) {
				denDone = true
				return
			}
			yield dividePair(numerator, step.value, strictZero)
		}
	} finally {
		closeIterator(denIter, denDone)
	}
}

/**
 * @param {Iterable<number>} numerators
 * @param {Iterable<number>} denominators
 * @param {boolean} strictZero
 * @param {boolean} strictLength
 * @returns {Generator<number, void, undefined>}
 */
function* divideTwoIterables(numerators, denominators, strictZero, strictLength) {
	const numIter = acquireIterator(numerators, 'numerators')
	let denIter
	let numDone = false
	let denDone = false
	try {
		denIter = acquireIterator(denominators, 'denominators')
		while (true) {
			const numStep = numIter.next()
			if (numStep.done) {
				numDone = true
				if (strictLength) {
					const denStep = denIter.next()
					if (denStep.done) {
						denDone = true
					} else {
						throw new RangeError('Input iterables have different lengths')
					}
				}
				return
			}

			const denStep = denIter.next()
			if (denStep.done) {
				denDone = true
				if (strictLength) {
					throw new RangeError('Input iterables have different lengths')
				}
				return
			}

			yield dividePair(numStep.value, denStep.value, strictZero)
		}
	} finally {
		try {
			closeIterator(numIter, numDone)
		} finally {
			closeIterator(denIter, denDone)
		}
	}
}
