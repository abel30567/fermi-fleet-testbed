/**
 * Fixed-point scaling factor (10^18) used to represent non-integer BigInt values.
 * @type {bigint}
 */
export const SCALE = 10n ** 18n

/**
 * Default finite-difference step size (10^12 = 10^-6 in 10^18 fixed-point),
 * chosen near the optimal central-difference balance (epsilon^(1/3) for epsilon = 10^-18).
 * @type {bigint}
 */
export const DEFAULT_STEP = 10n ** 12n

/**
 * Divide two BigInts with round-half-to-even (banker's rounding).
 *
 * @param {bigint} numerator - Dividend.
 * @param {bigint} denominator - Strictly positive divisor.
 * @returns {bigint} Rounded quotient.
 */
function divRoundHalfEven(numerator, denominator) {
	const quotient = numerator / denominator
	const remainder = numerator % denominator
	if (remainder === 0n) return quotient

	const absRemTwice = (remainder < 0n ? -remainder : remainder) * 2n
	if (absRemTwice > denominator) {
		return numerator > 0n ? quotient + 1n : quotient - 1n
	}
	if (absRemTwice === denominator) {
		if ((quotient & 1n) === 0n) return quotient
		return numerator > 0n ? quotient + 1n : quotient - 1n
	}
	return quotient
}

/**
 * Internal generator that lazily consumes `point` on first pull and yields
 * each partial derivative component on demand using central finite differences.
 *
 * @param {(coords: bigint[]) => bigint} f
 * @param {Iterable<bigint>} point
 * @param {bigint} h
 * @returns {Generator<bigint, void, void>}
 */
function* generateGradient(f, point, h) {
	const coords = []
	for (const value of point) {
		if (typeof value !== 'bigint') {
			throw new TypeError(
				`point coordinate at index ${coords.length} must be a BigInt, got ${typeof value}`,
			)
		}
		coords.push(value)
	}

	if (coords.length === 0) {
		throw new RangeError('point must contain at least one coordinate')
	}

	const twoH = 2n * h

	for (let i = 0; i < coords.length; i++) {
		const xPlus = coords.slice()
		xPlus[i] = coords[i] + h
		const fPlus = f(xPlus)
		if (typeof fPlus !== 'bigint') {
			throw new TypeError(
				`f must return a BigInt, got ${typeof fPlus} at coordinate index ${i}`,
			)
		}

		const xMinus = coords.slice()
		xMinus[i] = coords[i] - h
		const fMinus = f(xMinus)
		if (typeof fMinus !== 'bigint') {
			throw new TypeError(
				`f must return a BigInt, got ${typeof fMinus} at coordinate index ${i}`,
			)
		}

		const numerator = (fPlus - fMinus) * SCALE
		yield divRoundHalfEven(numerator, twoH)
	}
}

/**
 * Compute the gradient ∇f(point) of a scalar function over BigInt fixed-point
 * coordinates (scaled by 10^18) via central finite differences, yielding each
 * partial derivative ∂f/∂x_i lazily from a generator.
 *
 * For each coordinate i, the central-difference approximation is:
 *   ∂f/∂x_i ≈ round(((f(x + h·e_i) - f(x - h·e_i)) * 10^18) / (2h))
 *
 * Both inputs and outputs use 10^18 fixed-point scaling (or any consistent
 * scaling shared by `point`, `h`, and `f`, since the scale cancels in the
 * difference quotient before multiplying by 10^18). Non-array iterables for
 * `point` are consumed lazily upon first iteration, and `f` is evaluated only
 * twice per yielded partial derivative.
 *
 * @param {(coords: bigint[]) => bigint} f - Scalar field mapping a coordinate array of BigInts to a BigInt.
 * @param {Iterable<bigint>} point - Non-empty iterable of BigInt coordinates where the gradient is evaluated.
 * @param {bigint} [h=DEFAULT_STEP] - Strictly positive BigInt finite-difference step size (defaults to 10^12).
 * @returns {Generator<bigint, void, void>} Generator yielding fixed-point BigInt partial derivatives scaled by 10^18.
 * @throws {TypeError} If `f` is not a function, `point` is not an iterable of BigInts, `h` is not a BigInt, or `f` returns a non-BigInt.
 * @throws {RangeError} If `point` is empty or `h <= 0n`.
 */
export function gradientBigIntLazy(f, point, h = DEFAULT_STEP) {
	if (typeof f !== 'function') {
		throw new TypeError(`f must be a function, got ${typeof f}`)
	}

	if (
		point === null ||
		point === undefined ||
		typeof point === 'string' ||
		typeof point[Symbol.iterator] !== 'function'
	) {
		throw new TypeError('point must be an iterable of BigInt coordinates')
	}

	if (typeof h !== 'bigint') {
		throw new TypeError(`h must be a BigInt, got ${typeof h}`)
	}

	if (h <= 0n) {
		throw new RangeError('h must be a positive BigInt')
	}

	if (Array.isArray(point)) {
		if (point.length === 0) {
			throw new RangeError('point must contain at least one coordinate')
		}
		for (let i = 0; i < point.length; i++) {
			if (typeof point[i] !== 'bigint') {
				throw new TypeError(
					`point coordinate at index ${i} must be a BigInt, got ${typeof point[i]}`,
				)
			}
		}
	}

	return generateGradient(f, point, h)
}
