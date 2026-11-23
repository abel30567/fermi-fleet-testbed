/**
 * Fixed-point scaling factor (10^18) applied to projected vector components.
 * @type {bigint}
 */
export const SCALE = 10n ** 18n

/**
 * Validates that a value is a non-string iterable.
 *
 * @param {unknown} value - Candidate iterable value.
 * @param {string} name - Parameter name for error messages.
 * @throws {TypeError} If value is nullish, a string, or not iterable.
 */
function assertIterable(value, name) {
	if (
		value == null ||
		typeof value === 'string' ||
		typeof value[Symbol.iterator] !== 'function'
	) {
		throw new TypeError(`Expected "${name}" to be a non-string iterable of BigInt values`)
	}
}

/**
 * Validates that a vector component is a BigInt.
 *
 * @param {unknown} value - Candidate component value.
 * @param {string} name - Vector name for error messages.
 * @param {number} index - Zero-based component index.
 * @throws {TypeError} If value is not a bigint.
 */
function assertBigIntElement(value, name, index) {
	if (typeof value !== 'bigint') {
		throw new TypeError(
			`Expected BigInt at ${name}[${index}], received ${value === null ? 'null' : typeof value}`
		)
	}
}

/**
 * Performs exact BigInt division with round-half-to-even (banker's rounding).
 *
 * @param {bigint} numerator - Dividend (may be negative, zero, or positive).
 * @param {bigint} denominator - Strictly positive divisor (> 0n).
 * @returns {bigint} Rounded quotient.
 */
function divRoundHalfEven(numerator, denominator) {
	const quotient = numerator / denominator
	const remainder = numerator % denominator
	if (remainder === 0n) {
		return quotient
	}

	const twiceAbsRem = (remainder < 0n ? -remainder : remainder) * 2n
	if (twiceAbsRem > denominator || (twiceAbsRem === denominator && (quotient & 1n) !== 0n)) {
		return numerator < 0n ? quotient - 1n : quotient + 1n
	}
	return quotient
}

/**
 * Internal generator that streams inputs in lockstep and yields projected components lazily.
 *
 * Input vector `u` is consumed in a single pass with O(1) auxiliary memory; `v` is buffered
 * during the dot-product pass so one-shot iterables/generators are supported and projected
 * components can be yielded one by one on demand.
 *
 * @param {Iterable<bigint>} u - Vector being projected.
 * @param {Iterable<bigint>} v - Non-zero target vector to project onto.
 * @yields {bigint} Each fixed-point (scaled by 10^18) component of proj_v(u).
 */
function* projectionGenerator(u, v) {
	const iterU = u[Symbol.iterator]()
	const iterV = v[Symbol.iterator]()
	const vComponents = []

	let dotUV = 0n
	let dotVV = 0n
	let index = 0
	let uDone = false
	let vDone = false

	try {
		while (true) {
			const nextU = iterU.next()
			uDone = Boolean(nextU.done)
			const nextV = iterV.next()
			vDone = Boolean(nextV.done)

			if (uDone && vDone) {
				break
			}
			if (uDone !== vDone) {
				throw new RangeError('Input vectors "u" and "v" must have the same length')
			}

			const ui = nextU.value
			const vi = nextV.value
			assertBigIntElement(ui, 'u', index)
			assertBigIntElement(vi, 'v', index)

			dotUV += ui * vi
			dotVV += vi * vi
			vComponents.push(vi)
			index += 1
		}
	} finally {
		if (!uDone && typeof iterU.return === 'function') {
			iterU.return()
		}
		if (!vDone && typeof iterV.return === 'function') {
			iterV.return()
		}
	}

	if (vComponents.length === 0) {
		throw new RangeError('Input vectors "u" and "v" must not be empty')
	}
	if (dotVV === 0n) {
		throw new RangeError('Cannot project onto the zero vector "v"')
	}

	if (dotUV === 0n) {
		for (let i = 0; i < vComponents.length; i += 1) {
			yield 0n
		}
		return
	}

	const scaledDotUV = dotUV * SCALE
	for (let i = 0; i < vComponents.length; i += 1) {
		yield divRoundHalfEven(scaledDotUV * vComponents[i], dotVV)
	}
}

/**
 * Lazily computes the orthogonal vector projection of BigInt vector `u` onto
 * non-zero BigInt vector `v`:
 *
 *   proj_v(u) = ((u · v) / (v · v)) * v
 *
 * Because the projection ratio is generally rational, each yielded component is
 * returned as an exact fixed-point BigInt scaled by `10n ** 18n` (`SCALE`),
 * rounded with round-half-to-even (`((u · v) * 10^18 * v_i) / (v · v)`).
 *
 * Consumption of `u` and `v` is deferred until the returned generator is iterated;
 * `u` is streamed in a single pass without buffering, and output components are
 * computed and yielded lazily on demand.
 *
 * @param {Iterable<bigint>} u - Iterable of BigInt components representing vector u.
 * @param {Iterable<bigint>} v - Iterable of BigInt components representing non-zero vector v.
 * @returns {Generator<bigint, void, undefined>} Lazy generator yielding scaled BigInt components.
 * @throws {TypeError} If `u` or `v` is not a non-string iterable, or contains non-BigInt elements.
 * @throws {RangeError} If `u` and `v` are empty, differ in length, or `v` is the zero vector.
 */
export function projectionBigIntLazy(u, v) {
	assertIterable(u, 'u')
	assertIterable(v, 'v')
	return projectionGenerator(u, v)
}
