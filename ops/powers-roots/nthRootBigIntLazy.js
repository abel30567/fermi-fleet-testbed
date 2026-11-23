/**
 * Fixed-point scaling factor (10^18) used for non-integer nth-root results.
 * A returned value `r` represents the real number `r / 10^18`.
 * @type {bigint}
 */
export const SCALE = 10n ** 18n

const EXACT_DEGREE_LIMIT = 256n

/**
 * Determine whether a value is a non-string iterable sequence.
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
 * Validate a scalar radicand.
 *
 * @param {unknown} x
 * @returns {bigint}
 */
function validateRadicand(x) {
	if (typeof x !== 'bigint') {
		throw new TypeError(`Radicand x must be a BigInt, received ${typeof x}`)
	}
	return x
}

/**
 * Validate and normalize a scalar root degree to a positive BigInt.
 *
 * @param {unknown} n
 * @returns {bigint}
 */
function validateDegree(n) {
	if (typeof n === 'bigint') {
		if (n <= 0n) {
			throw new RangeError(`Root degree n must be a positive integer (> 0), received ${n}`)
		}
		return n
	}
	if (typeof n === 'number') {
		if (!Number.isFinite(n) || !Number.isInteger(n) || !Number.isSafeInteger(n)) {
			throw new TypeError(`Root degree n must be a BigInt or safe integer, received ${n}`)
		}
		if (n <= 0) {
			throw new RangeError(`Root degree n must be a positive integer (> 0), received ${n}`)
		}
		return BigInt(n)
	}
	throw new TypeError(`Root degree n must be a BigInt or safe integer, received ${typeof n}`)
}

/**
 * Compute bit length of a non-negative BigInt.
 *
 * @param {bigint} value
 * @returns {number}
 */
function bitLength(value) {
	if (value === 0n) return 0
	const hex = value.toString(16)
	const firstNibble = parseInt(hex[0], 16)
	const leadingBits = 32 - Math.clz32(firstNibble)
	return (hex.length - 1) * 4 + leadingBits
}

/**
 * Compute exact integer exponentiation `base ** exp` via binary exponentiation.
 *
 * @param {bigint} base
 * @param {bigint} exp
 * @returns {bigint}
 */
function bigIntPow(base, exp) {
	let result = 1n
	let b = base
	let e = exp
	while (e > 0n) {
		if ((e & 1n) === 1n) result *= b
		e >>= 1n
		if (e > 0n) b *= b
	}
	return result
}

/**
 * Compute fixed-point exponentiation `(base / scale) ** exp * scale`
 * for `base >= scale` using binary exponentiation.
 *
 * @param {bigint} base
 * @param {bigint} exp
 * @param {bigint} scale
 * @returns {bigint}
 */
function fixedPow(base, exp, scale) {
	let result = scale
	let b = base
	let e = exp
	while (e > 0n) {
		if ((e & 1n) === 1n) result = (result * b) / scale
		e >>= 1n
		if (e > 0n) b = (b * b) / scale
	}
	return result
}

/**
 * Lazily generate monotonically decreasing integer Newton-Raphson iterates
 * converging to `floor(m ** (1 / n))` for `m >= 1n`, `n >= 2n`.
 *
 * @param {bigint} m
 * @param {bigint} n
 * @returns {Generator<bigint, bigint, void>}
 */
function* exactNewtonSteps(m, n) {
	const bits = BigInt(bitLength(m))
	let current = 1n << ((bits + n - 1n) / n)
	const nMinus1 = n - 1n

	while (true) {
		yield current
		const denom = bigIntPow(current, nMinus1)
		const next = (nMinus1 * current + m / denom) / n
		if (next >= current) {
			return current
		}
		current = next
	}
}

/**
 * Lazily generate fixed-point Newton-Raphson iterates converging to
 * `absX ** (1 / n) * guardScale` for large degrees `n`.
 *
 * @param {bigint} absX
 * @param {bigint} n
 * @param {bigint} guardScale
 * @returns {Generator<bigint, bigint, void>}
 */
function* fixedNewtonSteps(absX, n, guardScale) {
	const bits = BigInt(bitLength(absX))
	const q = bits / n
	const r = bits % n
	// Tight upper bound: 2^(b/n) = 2^q * 2^(r/n) <= 2^q * (1 + r/n)
	let current = (guardScale + (guardScale * r + n - 1n) / n) << q
	const nMinus1 = n - 1n
	const scaledTarget = absX * guardScale * guardScale

	for (let iter = 0; iter < 512; iter++) {
		yield current
		const denom = fixedPow(current, nMinus1, guardScale)
		const next = (nMinus1 * current + scaledTarget / denom) / n
		const diff = next >= current ? next - current : current - next
		if (next >= current || diff <= 1n) {
			return next < current ? next : current
		}
		current = next
	}
	return current
}

/**
 * Compute the fixed-point BigInt nth root (scaled by 10^18, rounded to nearest)
 * of a single BigInt radicand `x` and positive integer degree `n`.
 *
 * @param {unknown} rawX
 * @param {unknown} rawN
 * @returns {bigint}
 */
function computeNthRootScalar(rawX, rawN) {
	const x = validateRadicand(rawX)
	const n = validateDegree(rawN)

	if (x < 0n && (n & 1n) === 0n) {
		throw new RangeError(`Cannot compute even root (n=${n}) of negative BigInt (${x})`)
	}

	if (x === 0n) return 0n
	if (n === 1n) return x * SCALE

	const negative = x < 0n
	const absX = negative ? -x : x

	if (absX === 1n) {
		return negative ? -SCALE : SCALE
	}

	let magnitude

	if (n <= EXACT_DEGREE_LIMIT) {
		const m = absX * bigIntPow(SCALE, n)
		const steps = exactNewtonSteps(m, n)
		let step = steps.next()
		while (!step.done) {
			step = steps.next()
		}
		const floorRoot = step.value

		if (bigIntPow(floorRoot, n) === m) {
			magnitude = floorRoot
		} else {
			// Exact nearest-integer rounding: check if m^(1/n) >= floorRoot + 0.5
			// Equivalent to: m * 2^n >= (2 * floorRoot + 1)^n
			const lhs = m << n
			const rhs = bigIntPow((floorRoot << 1n) + 1n, n)
			magnitude = lhs >= rhs ? floorRoot + 1n : floorRoot
		}
	} else {
		const extraDigits = Math.max(24, n.toString().length * 2 + 18)
		const guardScale = bigIntPow(10n, BigInt(18 + extraDigits))
		const steps = fixedNewtonSteps(absX, n, guardScale)
		let step = steps.next()
		while (!step.done) {
			step = steps.next()
		}
		const factor = guardScale / SCALE
		magnitude = (step.value + (factor >> 1n)) / factor
	}

	return negative ? -magnitude : magnitude
}

/**
 * Internal lazy generator streaming nth roots over iterable inputs without
 * buffering or eagerly consuming source iterators.
 *
 * @param {bigint | Iterable<bigint>} xInput
 * @param {bigint | Iterable<bigint | number>} nInput
 * @param {boolean} xIsIter
 * @param {boolean} nIsIter
 * @returns {Generator<bigint, void, void>}
 */
function* nthRootStream(xInput, nInput, xIsIter, nIsIter) {
	const xIter = xIsIter ? xInput[Symbol.iterator]() : null
	const nIter = nIsIter ? nInput[Symbol.iterator]() : null
	let xDone = !xIsIter
	let nDone = !nIsIter

	try {
		while (true) {
			let xVal = xInput
			if (xIter !== null) {
				const nextX = xIter.next()
				if (nextX.done) {
					xDone = true
					break
				}
				xVal = nextX.value
			}

			let nVal = nInput
			if (nIter !== null) {
				const nextN = nIter.next()
				if (nextN.done) {
					nDone = true
					break
				}
				nVal = nextN.value
			}

			yield computeNthRootScalar(xVal, nVal)
		}
	} finally {
		if (!xDone && xIter !== null && typeof xIter.return === 'function') {
			xIter.return()
		}
		if (!nDone && nIter !== null && typeof nIter.return === 'function') {
			nIter.return()
		}
	}
}

/**
 * Compute the nth root over exact BigInt integers, returning fixed-point BigInt
 * values scaled by `10^18` (`SCALE = 10n ** 18n`), rounded to the nearest unit
 * of `10^-18`.
 *
 * Supports both scalar calls and lazy streaming over iterables/generators:
 * - Scalar: `nthRootBigIntLazy(x, n)` returns a single fixed-point `bigint`
 *   computed via a lazy Newton-Raphson step generator.
 * - Streaming: when `x` and/or `n` is an iterable (such as an Array, Generator,
 *   Set, or BigInt64Array), returns a `Generator<bigint>` that consumes input
 *   iterables lazily one item at a time and cleans up underlying iterators on
 *   early termination. When both `x` and `n` are iterables, they are zipped
 *   lazily until the shorter iterable ends.
 *
 * @param {bigint | Iterable<bigint>} x - Radicand BigInt, or iterable of BigInt radicands.
 * @param {bigint | number | Iterable<bigint | number>} n - Positive integer root degree, or iterable of degrees.
 * @returns {bigint | Generator<bigint, void, void>} Fixed-point BigInt scaled by `10^18`, or a lazy generator yielding fixed-point BigInt results.
 * @throws {TypeError} If any radicand is not a BigInt or any degree is not a BigInt or safe integer.
 * @throws {RangeError} If any degree `n <= 0` or if computing an even root of a negative BigInt.
 *
 * @example
 * // Scalar usage (exact root: 27^(1/3) = 3 * 10^18)
 * nthRootBigIntLazy(27n, 3n) // 3000000000000000000n
 *
 * @example
 * // Lazy generator usage over an infinite sequence
 * function* naturals() { for (let i = 1n; ; i++) yield i }
 * const roots = nthRootBigIntLazy(naturals(), 2n)
 * roots.next().value // 1000000000000000000n
 * roots.next().value // 1414213562373095049n
 */
export function nthRootBigIntLazy(x, n) {
	const xIsIter = isIterable(x)
	const nIsIter = isIterable(n)

	if (!xIsIter && !nIsIter) {
		return computeNthRootScalar(x, n)
	}

	const scalarX = xIsIter ? x : validateRadicand(x)
	const scalarN = nIsIter ? n : validateDegree(n)

	return nthRootStream(scalarX, scalarN, xIsIter, nIsIter)
}
