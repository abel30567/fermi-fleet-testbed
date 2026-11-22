/**
 * Maximum integer `n` for which `n!` is finite in IEEE-754 float64.
 * `170! ≈ 7.257415615307999e+306`, while `171!` overflows to `Infinity`.
 */
const MAX_FINITE_FACTORIAL_N = 170

/**
 * Lazily populated table of float64 factorials `0!` through `k!` (`k <= 170`).
 * Extended incrementally on demand by `factorialSequenceGenerator`.
 * @type {number[]}
 */
const factorialCache = [1]

/**
 * Internal lazy generator that yields successive float64 factorials starting
 * from `1!`, advancing only as far as requested up to `MAX_FINITE_FACTORIAL_N`.
 * @returns {Generator<number, void, undefined>}
 */
function* createFactorialStepper() {
	let acc = 1
	for (let k = 1; k <= MAX_FINITE_FACTORIAL_N; k += 1) {
		acc *= k
		yield acc
	}
}

const factorialStepper = createFactorialStepper()

/**
 * Validates that a value is a finite non-negative integer Number.
 *
 * @param {unknown} value - Candidate input value.
 * @returns {number} The validated non-negative integer.
 * @throws {TypeError} If `value` is not of type `number`.
 * @throws {RangeError} If `value` is NaN, non-finite, non-integer, or negative.
 */
function validateNonNegativeInteger(value) {
	if (typeof value !== 'number') {
		throw new TypeError(
			`Expected a non-negative integer number, received ${value === null ? 'null' : typeof value}`
		)
	}
	if (!Number.isFinite(value)) {
		throw new RangeError(`Expected a finite non-negative integer, received ${value}`)
	}
	if (!Number.isInteger(value)) {
		throw new RangeError(`Expected an integer, received ${value}`)
	}
	if (value < 0) {
		throw new RangeError(`Expected a non-negative integer, received ${value}`)
	}
	return value
}

/**
 * Computes `n!` as an IEEE-754 float64 Number, lazily advancing the internal
 * factorial generator only up to `n` (capped at 170, returning `Infinity` for `n > 170`).
 *
 * @param {unknown} value - Candidate non-negative integer.
 * @returns {number} IEEE-754 float64 factorial of `value`.
 */
function computeFactorialFloat(value) {
	const n = validateNonNegativeInteger(value)
	if (n > MAX_FINITE_FACTORIAL_N) {
		return Infinity
	}
	while (factorialCache.length <= n) {
		const next = factorialStepper.next()
		if (next.done) {
			break
		}
		factorialCache.push(next.value)
	}
	return factorialCache[n]
}

/**
 * Generator that lazily consumes an iterable of non-negative integers and yields
 * each element's IEEE-754 float64 factorial on demand.
 *
 * @param {Iterable<number>} iterable - Sequence of non-negative integers.
 * @returns {Generator<number, void, undefined>}
 */
function* streamFactorials(iterable) {
	for (const item of iterable) {
		yield computeFactorialFloat(item)
	}
}

/**
 * Computes the discrete factorial (`n!`) over IEEE-754 float64 `Number` values,
 * supporting both a single non-negative integer and lazy streaming over any
 * iterable of non-negative integers.
 *
 * - When given a single non-negative integer `number`, returns its float64
 *   factorial (`Infinity` for `n > 170`).
 * - When given an iterable (such as an `Array`, `Set`, or `Generator`, excluding
 *   strings), returns a lazy `Generator<number>` that pulls one input at a time
 *   and yields its float64 factorial without materializing the input sequence.
 *
 * Input type validation for the top-level argument is performed eagerly.
 * Per-element validation for iterables is performed lazily as elements are consumed.
 *
 * @param {number | Iterable<number>} input - A non-negative integer or an iterable of non-negative integers.
 * @returns {number | Generator<number, void, undefined>} The float64 factorial for a single number, or a lazy generator yielding float64 factorials for an iterable.
 * @throws {TypeError} If `input` is neither a `number` nor a non-string iterable, or if an iterable element is not a `number`.
 * @throws {RangeError} If a numeric value is `NaN`, non-finite, non-integer, or negative.
 */
export function factorialFloatLazy(input) {
	if (typeof input === 'number') {
		return computeFactorialFloat(input)
	}
	if (
		input !== null &&
		input !== undefined &&
		typeof input !== 'string' &&
		typeof input[Symbol.iterator] === 'function'
	) {
		return streamFactorials(input)
	}
	throw new TypeError(
		`Expected a non-negative integer number or an iterable of non-negative integers, received ${
			input === null ? 'null' : typeof input
		}`
	)
}
