/**
 * Fixed-point scale factor (10^18) used for non-integer fixed-point BigInt results.
 * A returned value `r` represents the real number `r / SCALE`.
 *
 * @type {bigint}
 */
export const SCALE = 10n ** 18n

/**
 * Lookup table for bit lengths of single hexadecimal digits (0x0..0xf).
 *
 * @type {readonly number[]}
 */
const HEX_BIT_LENGTH = [0, 1, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4]

/**
 * Computes the exact bit length of a positive BigInt (`floor(log2(n)) + 1`).
 * Uses base-16 conversion so even very large BigInts run in linear time without recursion.
 *
 * @param {bigint} n - Positive BigInt (> 0n).
 * @returns {number} Number of significant binary digits in `n`.
 */
function bitLengthBigInt(n) {
	const hex = n.toString(16)
	const topNibble = parseInt(hex[0], 16)
	return (hex.length - 1) * 4 + HEX_BIT_LENGTH[topNibble]
}

/**
 * Lazily streams the binary fractional bits of `log2(x / 2^workBits)` for `x` in `[2^workBits, 2^(workBits + 1))`.
 * Each yielded value is either `0n` or `1n`, representing successive bits `2^-1, 2^-2, ...`.
 *
 * @param {bigint} mantissa - Fixed-point mantissa in `[2^workBits, 2^(workBits + 1))`.
 * @param {number} workBits - Number of fixed-point fractional bits in `mantissa`.
 * @param {number} bitCount - Maximum number of fractional bits to generate.
 * @returns {Generator<bigint, void, void>} Stream of fractional bits (`0n` or `1n`).
 */
function* streamLog2FractionalBits(mantissa, workBits, bitCount) {
	const shift = BigInt(workBits)
	const one = 1n << shift
	const two = one << 1n
	let x = mantissa

	for (let i = 0; i < bitCount; i++) {
		if (x === one) {
			yield 0n
			continue
		}
		x = (x * x) >> shift
		if (x >= two) {
			yield 1n
			x >>= 1n
		} else {
			yield 0n
		}
	}
}

/**
 * Validates that a single value is a strictly positive BigInt.
 *
 * @param {unknown} value - Value to validate.
 * @returns {bigint} The validated positive BigInt.
 * @throws {TypeError} If `value` is not a `bigint`.
 * @throws {RangeError} If `value` is less than or equal to `0n`.
 */
function validatePositiveBigInt(value) {
	if (typeof value !== 'bigint') {
		throw new TypeError(
			`log2BigIntLazy: expected a BigInt, received ${value === null ? 'null' : typeof value}`
		)
	}
	if (value <= 0n) {
		throw new RangeError(
			`log2BigIntLazy: input must be a positive BigInt (> 0n), received ${value}n`
		)
	}
	return value
}

/**
 * Validates optional configuration and returns the effective fixed-point scale.
 *
 * @param {{ scale?: bigint } | undefined} options - Optional configuration object.
 * @returns {bigint} Validated positive BigInt scale factor.
 * @throws {TypeError} If `options` is not an object or `options.scale` is not a `bigint`.
 * @throws {RangeError} If `options.scale` is less than or equal to `0n`.
 */
function resolveScale(options) {
	if (options === undefined) {
		return SCALE
	}
	if (typeof options !== 'object' || options === null || Array.isArray(options)) {
		throw new TypeError('log2BigIntLazy: options must be a plain object')
	}
	if (options.scale === undefined) {
		return SCALE
	}
	if (typeof options.scale !== 'bigint') {
		throw new TypeError(
			`log2BigIntLazy: options.scale must be a BigInt, received ${options.scale === null ? 'null' : typeof options.scale}`
		)
	}
	if (options.scale <= 0n) {
		throw new RangeError(
			`log2BigIntLazy: options.scale must be a positive BigInt (> 0n), received ${options.scale}n`
		)
	}
	return options.scale
}

/**
 * Computes fixed-point `round(log2(n) * scale)` for a single positive BigInt `n`.
 *
 * @param {bigint} n - Positive BigInt (> 0n).
 * @param {bigint} scale - Positive BigInt fixed-point scale (defaults to 10^18).
 * @returns {bigint} Fixed-point base-2 logarithm scaled by `scale`.
 */
function computeLog2BigInt(n, scale) {
	const value = validatePositiveBigInt(n)
	const integerPart = bitLengthBigInt(value) - 1

	// Fast, exact path for powers of two (including 1n = 2^0).
	if ((value & (value - 1n)) === 0n) {
		return BigInt(integerPart) * scale
	}

	const scaleBits = bitLengthBigInt(scale)
	const fracBitCount = scaleBits + 32
	const workBits = fracBitCount + 24

	// Normalize value to fixed-point mantissa in [2^workBits, 2^(workBits + 1)).
	const mantissa =
		integerPart <= workBits
			? value << BigInt(workBits - integerPart)
			: value >> BigInt(integerPart - workBits)

	// Consume the fractional bit stream into a binary fixed-point accumulator.
	let fracBits = 0n
	for (const bit of streamLog2FractionalBits(mantissa, workBits, fracBitCount)) {
		fracBits = (fracBits << 1n) | bit
	}

	// Scale fractional binary value to target fixed-point scale with half-up rounding.
	const fracShift = BigInt(fracBitCount)
	const half = 1n << (fracShift - 1n)
	const scaledFraction = (fracBits * scale + half) >> fracShift

	return BigInt(integerPart) * scale + scaledFraction
}

/**
 * Lazily computes `computeLog2BigInt` over an iterable of positive BigInts,
 * pulling and validating one item at a time on demand.
 *
 * @param {Iterable<bigint>} iterable - Iterable sequence of positive BigInts.
 * @param {bigint} scale - Positive BigInt fixed-point scale.
 * @returns {Generator<bigint, void, void>} Lazy generator of scaled base-2 logarithms.
 */
function* mapLog2Lazy(iterable, scale) {
	for (const item of iterable) {
		yield computeLog2BigInt(item, scale)
	}
}

/**
 * Computes the base-2 logarithm (`log2`) over exact positive `BigInt` integers,
 * returning fixed-point `BigInt` results scaled by `10^18` (or a custom `options.scale`).
 *
 * - For a single `BigInt` input `n > 0n`, returns a single fixed-point `BigInt`
 *   equal to `round(log2(n) * scale)`. Exact powers of two (`2^k`) return exact `k * scale`.
 * - For an iterable sequence of `BigInt`s (arrays, generators, sets, `BigUint64Array`,
 *   custom iterables, etc.), returns a lazy `Generator<bigint>` that consumes input elements
 *   strictly on demand without buffering the sequence.
 * - Internally uses a streaming bit-by-bit binary logarithm generator so arbitrarily large
 *   `BigInt`s are computed accurately in constant working precision.
 *
 * @overload
 * @param {bigint} input - A single positive BigInt (`> 0n`).
 * @param {{ scale?: bigint }} [options] - Optional configuration (`scale` defaults to `10n ** 18n`).
 * @returns {bigint} Fixed-point `log2(input)` scaled by `scale`.
 *
 * @overload
 * @param {Iterable<bigint>} input - An iterable of positive BigInts (`> 0n`), consumed lazily.
 * @param {{ scale?: bigint }} [options] - Optional configuration (`scale` defaults to `10n ** 18n`).
 * @returns {Generator<bigint, void, void>} Lazy generator yielding fixed-point `log2` values.
 *
 * @param {bigint | Iterable<bigint>} input - Positive BigInt or iterable of positive BigInts.
 * @param {{ scale?: bigint }} [options] - Optional configuration.
 * @returns {bigint | Generator<bigint, void, void>} Fixed-point BigInt result or lazy generator.
 * @throws {TypeError} If `input` is neither a `bigint` nor a non-string iterable, or if an iterable element is not a `bigint`, or if `options` is invalid.
 * @throws {RangeError} If any input `BigInt` (or `options.scale`) is `<= 0n`.
 */
export function log2BigIntLazy(input, options) {
	const scale = resolveScale(options)

	if (typeof input === 'bigint') {
		return computeLog2BigInt(input, scale)
	}

	if (
		input !== null &&
		typeof input === 'object' &&
		typeof input[Symbol.iterator] === 'function'
	) {
		return mapLog2Lazy(input, scale)
	}

	throw new TypeError(
		`log2BigIntLazy: expected a positive BigInt or an iterable of BigInts, received ${input === null ? 'null' : typeof input}`
	)
}
