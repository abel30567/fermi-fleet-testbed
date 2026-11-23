/**
 * Arbitrary-precision decimal vector addition with lazy streaming evaluation.
 *
 * Consumes two vector iterables element-by-element via a generator, performs
 * exact base-10 arithmetic using `BigInt`, rounds to the configured fractional
 * precision (half away from zero), and yields canonical decimal strings.
 *
 * @module ops/vector/vectorAddDecimalLazy
 */

const DEFAULT_PRECISION = 20;
const MAX_EXPONENT = 1_000_000;
const DECIMAL_PATTERN = /^([+-])?(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/;

/**
 * Validates that a value is a non-string iterable suitable as a vector input.
 *
 * @param {unknown} value - Candidate vector iterable.
 * @param {string} name - Parameter name for error messages.
 * @throws {TypeError} If `value` is nullish, a string, or not iterable.
 */
function assertVectorIterable(value, name) {
	if (value === null || value === undefined) {
		throw new TypeError(`Parameter "${name}" must be an iterable of decimal strings`);
	}
	if (typeof value === 'string' || value instanceof String) {
		throw new TypeError(
			`Parameter "${name}" must be an iterable vector of decimal strings, not a string`
		);
	}
	if (typeof value[Symbol.iterator] !== 'function') {
		throw new TypeError(`Parameter "${name}" must be an iterable of decimal strings`);
	}
}

/**
 * Validates the fractional precision configuration argument.
 *
 * @param {unknown} precision - Non-negative integer maximum fractional digits.
 * @returns {number} Validated precision value.
 * @throws {TypeError} If `precision` is not a number.
 * @throws {RangeError} If `precision` is not a non-negative integer within bounds.
 */
function validatePrecision(precision) {
	if (precision === undefined) {
		return DEFAULT_PRECISION;
	}
	if (typeof precision !== 'number') {
		throw new TypeError('Parameter "precision" must be a non-negative integer');
	}
	if (!Number.isInteger(precision) || precision < 0 || precision > MAX_EXPONENT) {
		throw new RangeError(
			`Parameter "precision" must be an integer between 0 and ${MAX_EXPONENT}`
		);
	}
	return precision;
}

/**
 * Parses an arbitrary-precision decimal string into `{ unscaled, scale }`
 * representing `unscaled * 10^(-scale)` with `scale >= 0`.
 *
 * @param {unknown} raw - Element value expected to be a decimal string.
 * @param {string} label - Element location label for diagnostics.
 * @returns {{ unscaled: bigint, scale: number }} Parsed decimal representation.
 * @throws {TypeError} If `raw` is not a string.
 * @throws {SyntaxError} If `raw` is not a valid decimal string.
 * @throws {RangeError} If the resulting scale exceeds supported exponent limits.
 */
function parseDecimal(raw, label) {
	if (typeof raw !== 'string') {
		throw new TypeError(`Invalid element at ${label}: expected a decimal string`);
	}

	const trimmed = raw.trim();
	const match = DECIMAL_PATTERN.exec(trimmed);
	if (!match) {
		throw new SyntaxError(`Invalid decimal string at ${label}: "${raw}"`);
	}

	const sign = match[1] === '-' ? -1n : 1n;
	const intPart = match[2] ?? '';
	const fracPart = match[3] ?? match[4] ?? '';
	const exp = match[5] !== undefined ? Number(match[5]) : 0;

	if (!Number.isSafeInteger(exp) || Math.abs(exp) > MAX_EXPONENT) {
		throw new RangeError(`Exponent out of range at ${label}: "${raw}"`);
	}

	const magnitude = BigInt(intPart + fracPart);
	if (magnitude === 0n) {
		return { unscaled: 0n, scale: 0 };
	}

	const scale = fracPart.length - exp;
	if (Math.abs(scale) > MAX_EXPONENT) {
		throw new RangeError(`Decimal scale out of range at ${label}: "${raw}"`);
	}

	if (scale < 0) {
		return {
			unscaled: sign * magnitude * 10n ** BigInt(-scale),
			scale: 0,
		};
	}

	return {
		unscaled: sign * magnitude,
		scale,
	};
}

/**
 * Adds two parsed arbitrary-precision decimals and rounds the result to at most
 * `precision` fractional decimal places using half-away-from-zero rounding.
 *
 * @param {{ unscaled: bigint, scale: number }} left - Left operand.
 * @param {{ unscaled: bigint, scale: number }} right - Right operand.
 * @param {number} precision - Maximum fractional digits to retain.
 * @returns {{ unscaled: bigint, scale: number }} Sum rounded to `precision`.
 */
function addDecimals(left, right, precision) {
	let scale = Math.max(left.scale, right.scale);
	const scaledLeft =
		left.scale < scale ? left.unscaled * 10n ** BigInt(scale - left.scale) : left.unscaled;
	const scaledRight =
		right.scale < scale ? right.unscaled * 10n ** BigInt(scale - right.scale) : right.unscaled;

	let unscaled = scaledLeft + scaledRight;

	if (scale > precision) {
		const dropDigits = scale - precision;
		const factor = 10n ** BigInt(dropDigits);
		const isNegative = unscaled < 0n;
		const absValue = isNegative ? -unscaled : unscaled;
		const quotient = absValue / factor;
		const remainder = absValue % factor;
		const half = factor / 2n;
		const roundedAbs = remainder >= half ? quotient + 1n : quotient;
		unscaled = isNegative ? -roundedAbs : roundedAbs;
		scale = precision;
	}

	return { unscaled, scale };
}

/**
 * Formats an exact `{ unscaled, scale }` decimal into a canonical base-10 string
 * with no trailing fractional zeros and no negative zero.
 *
 * @param {bigint} unscaled - Signed integer significand.
 * @param {number} scale - Non-negative fractional digit count.
 * @returns {string} Canonical decimal string.
 */
function formatDecimal(unscaled, scale) {
	if (unscaled === 0n) {
		return '0';
	}

	const sign = unscaled < 0n ? '-' : '';
	const digits = (unscaled < 0n ? -unscaled : unscaled).toString();

	if (scale === 0) {
		return sign + digits;
	}

	const padded = digits.padStart(scale + 1, '0');
	const splitIndex = padded.length - scale;
	const intPart = padded.slice(0, splitIndex);
	const fracPart = padded.slice(splitIndex).replace(/0+$/, '');

	return fracPart.length > 0 ? `${sign}${intPart}.${fracPart}` : `${sign}${intPart}`;
}

/**
 * Safely closes an iterator if it is still open and implements `.return()`.
 *
 * @param {Iterator<unknown> | undefined} iterator - Iterator to close.
 * @param {boolean} isDone - Whether the iterator has already completed.
 */
function closeIterator(iterator, isDone) {
	if (iterator && !isDone && typeof iterator.return === 'function') {
		iterator.return();
	}
}

/**
 * Internal generator performing lazy element-wise arbitrary-precision decimal addition.
 *
 * @param {Iterable<string>} a - First vector iterable of decimal strings.
 * @param {Iterable<string>} b - Second vector iterable of decimal strings.
 * @param {number} precision - Maximum fractional digits to retain.
 * @returns {Generator<string, void, undefined>} Lazily evaluated sum sequence.
 */
function* streamVectorAddDecimal(a, b, precision) {
	let iterA;
	let iterB;
	let doneA = false;
	let doneB = false;

	try {
		iterA = a[Symbol.iterator]();
		iterB = b[Symbol.iterator]();

		let index = 0;
		while (true) {
			const stepA = iterA.next();
			doneA = Boolean(stepA.done);
			const stepB = iterB.next();
			doneB = Boolean(stepB.done);

			if (doneA && doneB) {
				return;
			}
			if (doneA !== doneB) {
				throw new RangeError(
					`Vector length mismatch at index ${index}: input iterables must have equal length`
				);
			}

			const decA = parseDecimal(stepA.value, `a[${index}]`);
			const decB = parseDecimal(stepB.value, `b[${index}]`);
			const sum = addDecimals(decA, decB, precision);
			yield formatDecimal(sum.unscaled, sum.scale);
			index += 1;
		}
	} finally {
		try {
			closeIterator(iterA, doneA);
		} finally {
			closeIterator(iterB, doneB);
		}
	}
}

/**
 * Lazily adds two vectors of arbitrary-precision decimal strings element-by-element.
 *
 * Arguments `a`, `b`, and `precision` are validated eagerly when called, while
 * elements from `a` and `b` are pulled lazily one pair at a time as the returned
 * generator is iterated. Both inputs may be any iterable sequence (arrays,
 * generators, custom iterables, sets, etc.), including infinite generators when
 * consumed partially.
 *
 * @param {Iterable<string>} a - First vector iterable of decimal strings.
 * @param {Iterable<string>} b - Second vector iterable of decimal strings.
 * @param {number} [precision=20] - Non-negative integer specifying the maximum
 *   number of fractional decimal places retained in each summed element
 *   (rounded half away from zero when the exact sum has more fractional digits).
 * @returns {Generator<string, void, undefined>} Generator yielding canonical
 *   arbitrary-precision decimal string sums.
 * @throws {TypeError} If `a` or `b` is not a valid iterable vector, if
 *   `precision` is not a number, or if an iterated element is not a string.
 * @throws {SyntaxError} If an iterated element is not a valid decimal string.
 * @throws {RangeError} If `precision` is out of range, an exponent/scale exceeds
 *   supported bounds, or the two iterables have mismatched lengths.
 */
export function vectorAddDecimalLazy(a, b, precision = DEFAULT_PRECISION) {
	assertVectorIterable(a, 'a');
	assertVectorIterable(b, 'b');
	const validatedPrecision = validatePrecision(precision);
	return streamVectorAddDecimal(a, b, validatedPrecision);
}
