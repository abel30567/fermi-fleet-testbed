/**
 * Exact discrete modulo over arbitrary-precision `BigInt` values using a
 * lazy, streaming generator pipeline.
 *
 * Computes the canonical floored (discrete) modulo `a mod m` satisfying:
 *   `a = floor(a / m) * m + r`
 * where `0n <= r < m` for `m > 0n` and `m < r <= 0n` for `m < 0n`.
 * Because the discrete modulo of two exact integers is always an exact integer,
 * every yielded residue is an exact `BigInt` (no fixed-point scaling required).
 *
 * Inputs may be scalar `BigInt` values or iterables (arrays, generators,
 * `BigInt64Array`, `BigUint64Array`, sets, custom iterables) consumed lazily
 * one element at a time without buffering:
 * - `(Iterable<bigint>, bigint)`: streams `a mod m` for each `a` in `dividends`.
 * - `(bigint, Iterable<bigint>)`: streams `a mod m` for each `m` in `moduli`.
 * - `(Iterable<bigint>, Iterable<bigint>)`: lazily zips both iterables and
 *   streams pairwise `a_i mod m_i` until the shorter iterable ends.
 * - `(bigint, bigint)`: yields the single residue `dividends mod moduli`.
 *
 * @module ops/discrete/moduloBigIntLazy
 */

/**
 * Checks whether a value is a non-string iterable object.
 *
 * @param {unknown} value
 * @returns {value is Iterable<unknown>}
 */
function isIterableInput(value) {
	return (
		value !== null &&
		(typeof value === 'object' || typeof value === 'function') &&
		typeof value[Symbol.iterator] === 'function'
	)
}

/**
 * Validates that a top-level argument is either a `BigInt` or a non-string iterable.
 *
 * @param {unknown} value
 * @param {string} name
 * @returns {'bigint' | 'iterable'}
 */
function classifyInput(value, name) {
	if (typeof value === 'bigint') {
		return 'bigint'
	}
	if (isIterableInput(value)) {
		return 'iterable'
	}
	throw new TypeError(
		`Expected "${name}" to be a BigInt or a non-string Iterable of BigInt values, received ${value === null ? 'null' : typeof value}.`,
	)
}

/**
 * Asserts that an individual element is a `BigInt`.
 *
 * @param {unknown} value
 * @param {string} role
 * @returns {bigint}
 */
function assertBigInt(value, role) {
	if (typeof value !== 'bigint') {
		throw new TypeError(
			`Expected ${role} element to be a BigInt, received ${value === null ? 'null' : typeof value}.`,
		)
	}
	return value
}

/**
 * Asserts that a modulus is a non-zero `BigInt`.
 *
 * @param {unknown} value
 * @returns {bigint}
 */
function assertNonZeroModulus(value) {
	const modulus = assertBigInt(value, 'modulus')
	if (modulus === 0n) {
		throw new RangeError('Modulus cannot be zero (0n).')
	}
	return modulus
}

/**
 * Computes exact discrete (floored) modulo for two validated `BigInt` values.
 *
 * @param {bigint} dividend
 * @param {bigint} modulus Non-zero `BigInt` modulus.
 * @returns {bigint} Exact residue `r` with `a = floor(a / m) * m + r`.
 */
function discreteMod(dividend, modulus) {
	const remainder = dividend % modulus
	if (remainder === 0n) {
		return 0n
	}
	return (remainder + modulus) % modulus
}

/**
 * Lazily streams `a mod modulus` for each `a` in an iterable of `BigInt` dividends.
 *
 * @param {Iterable<bigint>} dividends
 * @param {bigint} modulus
 * @returns {Generator<bigint, void, undefined>}
 */
function* streamIterableByScalar(dividends, modulus) {
	for (const rawDividend of dividends) {
		const dividend = assertBigInt(rawDividend, 'dividend')
		yield discreteMod(dividend, modulus)
	}
}

/**
 * Lazily streams `dividend mod m` for each `m` in an iterable of `BigInt` moduli.
 *
 * @param {bigint} dividend
 * @param {Iterable<bigint>} moduli
 * @returns {Generator<bigint, void, undefined>}
 */
function* streamScalarByIterable(dividend, moduli) {
	for (const rawModulus of moduli) {
		const modulus = assertNonZeroModulus(rawModulus)
		yield discreteMod(dividend, modulus)
	}
}

/**
 * Lazily zips two iterables of `BigInt` values and yields pairwise `a_i mod m_i`.
 * Stops as soon as either iterable is exhausted and closes any unfinished iterator.
 *
 * @param {Iterable<bigint>} dividends
 * @param {Iterable<bigint>} moduli
 * @returns {Generator<bigint, void, undefined>}
 */
function* streamIterableByIterable(dividends, moduli) {
	const divIter = dividends[Symbol.iterator]()
	const modIter = moduli[Symbol.iterator]()
	let divDone = false
	let modDone = false

	try {
		while (true) {
			const divStep = divIter.next()
			if (divStep.done) {
				divDone = true
				break
			}
			const modStep = modIter.next()
			if (modStep.done) {
				modDone = true
				break
			}
			const dividend = assertBigInt(divStep.value, 'dividend')
			const modulus = assertNonZeroModulus(modStep.value)
			yield discreteMod(dividend, modulus)
		}
	} finally {
		try {
			if (!divDone) {
				divIter.return?.()
			}
		} finally {
			if (!modDone) {
				modIter.return?.()
			}
		}
	}
}

/**
 * Yields a single discrete modulo result for two scalar `BigInt` inputs.
 *
 * @param {bigint} dividend
 * @param {bigint} modulus
 * @returns {Generator<bigint, void, undefined>}
 */
function* streamScalarByScalar(dividend, modulus) {
	yield discreteMod(dividend, modulus)
}

/**
 * Lazily computes the discrete (floored) modulo over exact `BigInt` values.
 *
 * Top-level arguments are validated eagerly before returning the generator;
 * iterable elements are validated and transformed lazily as each residue is
 * requested by the consumer.
 *
 * @param {bigint | Iterable<bigint>} dividends - A `BigInt` dividend or iterable of `BigInt` dividends.
 * @param {bigint | Iterable<bigint>} moduli - A non-zero `BigInt` modulus or iterable of non-zero `BigInt` moduli.
 * @returns {Generator<bigint, void, undefined>} Lazy generator yielding exact `BigInt` residues.
 * @throws {TypeError} If either argument is not a `BigInt` or non-string iterable, or if an iterable yields a non-`BigInt`.
 * @throws {RangeError} If a scalar modulus is `0n` (thrown eagerly) or an iterable modulus yields `0n` (thrown lazily on consumption).
 */
export function moduloBigIntLazy(dividends, moduli) {
	const divKind = classifyInput(dividends, 'dividends')
	const modKind = classifyInput(moduli, 'moduli')

	if (modKind === 'bigint' && moduli === 0n) {
		throw new RangeError('Modulus cannot be zero (0n).')
	}

	if (divKind === 'iterable' && modKind === 'bigint') {
		return streamIterableByScalar(dividends, moduli)
	}
	if (divKind === 'bigint' && modKind === 'iterable') {
		return streamScalarByIterable(dividends, moduli)
	}
	if (divKind === 'iterable' && modKind === 'iterable') {
		return streamIterableByIterable(dividends, moduli)
	}
	return streamScalarByScalar(dividends, moduli)
}
