/**
 * Discrete modulo operation over IEEE-754 float64 Numbers with lazy,
 * generator-based streaming evaluation.
 *
 * Computes the mathematical modulo `((a % m) + m) % m` (normalizing `-0` to `0`),
 * yielding results on demand without eagerly materializing input iterables.
 */

/**
 * Checks whether a value is a non-string iterable.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isIterable(value) {
	return (
		value !== null &&
		value !== undefined &&
		typeof value !== 'string' &&
		typeof value[Symbol.iterator] === 'function'
	)
}

/**
 * Validates that a value is a finite IEEE-754 float64 Number.
 *
 * @param {unknown} value
 * @param {string} name
 */
function validateFiniteNumber(value, name) {
	if (typeof value !== 'number') {
		throw new TypeError(`${name} must be a finite number, got ${typeof value}`)
	}
	if (!Number.isFinite(value)) {
		throw new RangeError(`${name} must be a finite number, got ${value}`)
	}
}

/**
 * Validates that a divisor is a finite, non-zero IEEE-754 float64 Number.
 *
 * @param {unknown} value
 * @param {string} name
 */
function validateDivisor(value, name) {
	validateFiniteNumber(value, name)
	if (value === 0) {
		throw new RangeError(`${name} must be non-zero`)
	}
}

/**
 * Computes `((a % m) + m) % m` over IEEE-754 float64 Numbers, normalizing `-0` to `0`.
 *
 * @param {number} a
 * @param {number} m
 * @returns {number}
 */
function computeModulo(a, m) {
	const result = ((a % m) + m) % m
	return result === 0 ? 0 : result
}

/**
 * Lazily yields `computeModulo(a, divisor)` for each dividend in `dividends`.
 *
 * @param {Iterable<number>} dividends
 * @param {number} divisor
 * @returns {Generator<number, void, undefined>}
 */
function* moduloScalarStream(dividends, divisor) {
	for (const a of dividends) {
		validateFiniteNumber(a, 'dividend')
		yield computeModulo(a, divisor)
	}
}

/**
 * Lazily zips `dividends` and `divisors`, yielding `computeModulo(a, m)` until
 * either iterable is exhausted.
 *
 * @param {Iterable<number>} dividends
 * @param {Iterable<number>} divisors
 * @returns {Generator<number, void, undefined>}
 */
function* moduloZippedStream(dividends, divisors) {
	const divIter = dividends[Symbol.iterator]()
	const modIter = divisors[Symbol.iterator]()
	let divDone = false
	let modDone = false

	try {
		while (true) {
			const aStep = divIter.next()
			if (aStep.done) {
				divDone = true
				break
			}
			const mStep = modIter.next()
			if (mStep.done) {
				modDone = true
				break
			}
			validateFiniteNumber(aStep.value, 'dividend')
			validateDivisor(mStep.value, 'divisor')
			yield computeModulo(aStep.value, mStep.value)
		}
	} finally {
		if (!divDone && typeof divIter.return === 'function') {
			divIter.return()
		}
		if (!modDone && typeof modIter.return === 'function') {
			modIter.return()
		}
	}
}

/**
 * Lazily consumes an iterable of `[dividend, divisor]` pairs and yields
 * `computeModulo(a, m)` for each pair.
 *
 * @param {Iterable<Iterable<number>>} pairs
 * @returns {Generator<number, void, undefined>}
 */
function* moduloPairsStream(pairs) {
	for (const pair of pairs) {
		let a
		let m

		if (Array.isArray(pair)) {
			if (pair.length !== 2) {
				throw new RangeError('Each pair must contain exactly 2 elements: [dividend, divisor]')
			}
			;[a, m] = pair
		} else if (isIterable(pair)) {
			const iter = pair[Symbol.iterator]()
			let finished = false
			try {
				const aStep = iter.next()
				if (aStep.done) {
					finished = true
					throw new RangeError('Each pair must contain exactly 2 elements: [dividend, divisor]')
				}
				const mStep = iter.next()
				if (mStep.done) {
					finished = true
					throw new RangeError('Each pair must contain exactly 2 elements: [dividend, divisor]')
				}
				const extraStep = iter.next()
				if (!extraStep.done) {
					throw new RangeError('Each pair must contain exactly 2 elements: [dividend, divisor]')
				}
				finished = true
				a = aStep.value
				m = mStep.value
			} finally {
				if (!finished && typeof iter.return === 'function') {
					iter.return()
				}
			}
		} else {
			throw new TypeError('Each pair must be an iterable of [dividend, divisor]')
		}

		validateFiniteNumber(a, 'dividend')
		validateDivisor(m, 'divisor')
		yield computeModulo(a, m)
	}
}

/**
 * Lazily computes discrete mathematical modulo `((a % m) + m) % m` over IEEE-754
 * float64 Numbers as a streaming generator.
 *
 * Supports three input forms:
 * 1. `moduloFloatLazy(dividends, divisor)` — broadcasts a single finite non-zero
 *    number `divisor` over an iterable of `dividends`.
 * 2. `moduloFloatLazy(dividends, divisors)` — zips two iterables lazily until
 *    either is exhausted.
 * 3. `moduloFloatLazy(pairs)` — consumes an iterable of `[dividend, divisor]`
 *    2-element iterables lazily.
 *
 * For positive divisors `m > 0`, results lie in `[0, m)` (Euclidean modulo).
 * For negative divisors `m < 0`, results follow floored modulo in `(m, 0]`.
 * Negative zero (`-0`) is always normalized to `+0`.
 *
 * @param {Iterable<number> | Iterable<Iterable<number>>} input
 *   An iterable of dividends (when `divisor` is provided) or an iterable of
 *   `[dividend, divisor]` pairs (when `divisor` is omitted).
 * @param {number | Iterable<number>} [divisor]
 *   Optional finite non-zero float64 divisor or iterable of divisors.
 * @returns {Generator<number, void, undefined>}
 *   A lazy generator yielding float64 modulo results.
 * @throws {TypeError} If inputs or elements are not valid iterables/numbers.
 * @throws {RangeError} If any value is `NaN`/`±Infinity`, any divisor is `0`,
 *   or a pair does not have exactly 2 elements.
 */
export function moduloFloatLazy(input, divisor) {
	if (!isIterable(input)) {
		throw new TypeError('input must be a non-string iterable')
	}

	if (divisor === undefined) {
		return moduloPairsStream(input)
	}

	if (typeof divisor === 'number') {
		validateDivisor(divisor, 'divisor')
		return moduloScalarStream(input, divisor)
	}

	if (isIterable(divisor)) {
		return moduloZippedStream(input, divisor)
	}

	throw new TypeError('divisor must be a finite non-zero number or a non-string iterable')
}
