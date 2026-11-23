/**
 * @module ops/arithmetic/addDecimalLazy
 *
 * Arbitrary-precision decimal addition over decimal strings and sequences
 * using BigInt arithmetic and lazy generator-based streaming consumption.
 */

const DECIMAL_PATTERN = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
const DEFAULT_PRECISION = 20;
const MAX_PRECISION = 1_000_000;
const MAX_EXPONENT = 1_000_000;

/**
 * Checks whether a value is a non-string iterable (e.g. Array, Generator, Set, custom iterable).
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isSequenceIterable(value) {
	return value !== null
		&& value !== undefined
		&& typeof value !== 'string'
		&& typeof value[Symbol.iterator] === 'function';
}

/**
 * Validates the precision argument.
 *
 * @param {unknown} precision
 * @returns {number}
 */
function validatePrecision(precision) {
	if (typeof precision !== 'number') {
		throw new TypeError(`precision must be a non-negative integer, received ${typeof precision}`);
	}
	if (!Number.isInteger(precision) || precision < 0 || precision > MAX_PRECISION) {
		throw new RangeError(`precision must be an integer between 0 and ${MAX_PRECISION}, received ${precision}`);
	}
	return precision;
}

/**
 * Parses an arbitrary-precision decimal string into `{ value: bigint, scale: number }`
 * representing `value * 10^(-scale)` with `scale >= 0`.
 *
 * Accepts standard decimal strings and scientific notation (e.g. `"-12.34"`, `".5"`, `"1.5e-10"`).
 *
 * @param {string} input
 * @returns {{ value: bigint, scale: number }}
 */
function parseDecimal(input) {
	if (typeof input !== 'string') {
		throw new TypeError(`Decimal operand must be a string, received ${input === null ? 'null' : typeof input}`);
	}
	if (!DECIMAL_PATTERN.test(input)) {
		throw new RangeError(`Invalid decimal string: ${JSON.stringify(input)}`);
	}

	let idx = 0;
	let negative = false;
	if (input[0] === '-') {
		negative = true;
		idx = 1;
	} else if (input[0] === '+') {
		idx = 1;
	}

	const expIdx = input.search(/[eE]/);
	const mantissa = expIdx === -1 ? input.slice(idx) : input.slice(idx, expIdx);
	let exponent = 0;
	if (expIdx !== -1) {
		const expStr = input.slice(expIdx + 1);
		exponent = Number(expStr);
		if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > MAX_EXPONENT) {
			throw new RangeError(`Exponent out of supported range [-${MAX_EXPONENT}, ${MAX_EXPONENT}]: ${expStr}`);
		}
	}

	const dotIdx = mantissa.indexOf('.');
	const intPart = dotIdx === -1 ? mantissa : mantissa.slice(0, dotIdx);
	const fracPart = dotIdx === -1 ? '' : mantissa.slice(dotIdx + 1);

	let digits = (intPart + fracPart).replace(/^0+/, '');
	if (digits.length === 0) {
		return { value: 0n, scale: 0 };
	}

	let scale = fracPart.length - exponent;
	if (Math.abs(scale) > MAX_EXPONENT) {
		throw new RangeError(`Effective decimal scale out of supported range [-${MAX_EXPONENT}, ${MAX_EXPONENT}]`);
	}

	if (scale > 0) {
		let trailingZeros = 0;
		for (let i = digits.length - 1; i >= 0 && digits[i] === '0' && trailingZeros < scale; i--) {
			trailingZeros++;
		}
		if (trailingZeros > 0) {
			digits = digits.slice(0, digits.length - trailingZeros);
			scale -= trailingZeros;
		}
	}

	let value;
	if (scale < 0) {
		value = BigInt(digits) * (10n ** BigInt(-scale));
		scale = 0;
	} else {
		value = BigInt(digits);
	}

	return { value: negative ? -value : value, scale };
}

/**
 * Adds two parsed decimal values exactly.
 *
 * @param {{ value: bigint, scale: number }} a
 * @param {{ value: bigint, scale: number }} b
 * @returns {{ value: bigint, scale: number }}
 */
function addParsed(a, b) {
	if (a.value === 0n) return b;
	if (b.value === 0n) return a;

	let sum;
	let scale;
	if (a.scale === b.scale) {
		sum = a.value + b.value;
		scale = a.scale;
	} else if (a.scale < b.scale) {
		sum = a.value * (10n ** BigInt(b.scale - a.scale)) + b.value;
		scale = b.scale;
	} else {
		sum = a.value + b.value * (10n ** BigInt(a.scale - b.scale));
		scale = a.scale;
	}

	if (sum === 0n) {
		return { value: 0n, scale: 0 };
	}
	return { value: sum, scale };
}

/**
 * Rounds a parsed decimal to at most `precision` fractional decimal places
 * using round half-to-even (banker's rounding) and formats it as a canonical
 * decimal string with no unnecessary trailing zeros and no `"-0"`.
 *
 * @param {{ value: bigint, scale: number }} dec
 * @param {number} precision
 * @returns {string}
 */
function formatDecimal(dec, precision) {
	let { value, scale } = dec;
	if (value === 0n) return '0';

	if (scale > precision) {
		const shift = scale - precision;
		const divisor = 10n ** BigInt(shift);
		const half = divisor / 2n;
		const negative = value < 0n;
		const absVal = negative ? -value : value;

		let quotient = absVal / divisor;
		const remainder = absVal % divisor;

		if (remainder > half || (remainder === half && quotient % 2n !== 0n)) {
			quotient += 1n;
		}

		value = negative && quotient !== 0n ? -quotient : quotient;
		scale = precision;
	}

	if (value === 0n) return '0';

	const sign = value < 0n ? '-' : '';
	const digits = (value < 0n ? -value : value).toString();

	if (scale === 0) {
		return sign + digits;
	}

	if (digits.length <= scale) {
		const padded = '0'.repeat(scale - digits.length) + digits;
		const frac = padded.replace(/0+$/, '');
		return frac.length > 0 ? `${sign}0.${frac}` : '0';
	}

	const splitAt = digits.length - scale;
	const intPart = digits.slice(0, splitAt);
	const fracPart = digits.slice(splitAt).replace(/0+$/, '');
	return fracPart.length > 0 ? `${sign}${intPart}.${fracPart}` : `${sign}${intPart}`;
}

/**
 * Lazily adds arbitrary-precision decimal strings using BigInt arithmetic and a
 * generator-based streaming pipeline.
 *
 * Supports four call forms, all returning a lazy `Generator<string, void, undefined>`:
 * 1. **Pairwise sequences**: `addDecimalLazy(seqA, seqB, precision = 20)` —
 *    lazily pulls one decimal string from `seqA` and one from `seqB` per step,
 *    yielding `a_i + b_i` until either iterable is exhausted.
 * 2. **Scalar broadcast**: `addDecimalLazy(seq, scalar, precision = 20)` or
 *    `addDecimalLazy(scalar, seq, precision = 20)` — lazily adds the scalar
 *    decimal string to each element pulled from `seq`.
 * 3. **Two scalars**: `addDecimalLazy(scalarA, scalarB, precision = 20)` —
 *    yields the single sum `scalarA + scalarB`.
 * 4. **Single-sequence running sum**: `addDecimalLazy(seq, precision = 20)` —
 *    lazily yields the cumulative sum after each pulled element (keeping the
 *    internal accumulator exact to avoid cumulative rounding drift).
 *
 * Precision specifies the maximum number of fractional decimal places in each
 * yielded result (default `20`). Integer parts always retain full arbitrary
 * precision. Excess fractional digits are rounded using round half-to-even
 * (banker's rounding), trailing fractional zeros are stripped, and `-0` is
 * normalized to `"0"`.
 *
 * @param {string | Iterable<string>} a - First decimal string or iterable of decimal strings.
 * @param {string | Iterable<string> | number} [b] - Second decimal string, iterable of decimal strings, or `precision` when `a` is a single iterable for cumulative addition.
 * @param {number} [precision=20] - Maximum fractional decimal places (integer in `[0, 1_000_000]`).
 * @returns {Generator<string, void, undefined>} Lazy generator yielding formatted decimal sum strings.
 * @throws {TypeError} If operands or `precision` have invalid types.
 * @throws {RangeError} If `precision` is out of range or a decimal string is malformed.
 */
export function addDecimalLazy(a, b, precision) {
	const aIsString = typeof a === 'string';
	const aIsSeq = isSequenceIterable(a);

	if (!aIsString && !aIsSeq) {
		throw new TypeError('First argument must be a decimal string or an iterable of decimal strings');
	}

	// Single-sequence cumulative sum mode: addDecimalLazy(seq) or addDecimalLazy(seq, precision)
	if (aIsSeq && (b === undefined || (typeof b === 'number' && precision === undefined))) {
		const prec = validatePrecision(b === undefined ? DEFAULT_PRECISION : b);
		return (function* cumulativeSum() {
			let acc = { value: 0n, scale: 0 };
			const iter = a[Symbol.iterator]();
			let done = false;
			try {
				while (true) {
					const step = iter.next();
					if (step.done) {
						done = true;
						break;
					}
					acc = addParsed(acc, parseDecimal(step.value));
					yield formatDecimal(acc, prec);
				}
			} finally {
				if (!done) {
					iter.return?.();
				}
			}
		})();
	}

	const bIsString = typeof b === 'string';
	const bIsSeq = isSequenceIterable(b);

	if (!bIsString && !bIsSeq) {
		throw new TypeError('Second argument must be a decimal string or an iterable of decimal strings');
	}

	const prec = validatePrecision(precision === undefined ? DEFAULT_PRECISION : precision);

	// Scalar + Scalar
	if (aIsString && bIsString) {
		const parsedA = parseDecimal(a);
		const parsedB = parseDecimal(b);
		return (function* scalarSum() {
			yield formatDecimal(addParsed(parsedA, parsedB), prec);
		})();
	}

	// Sequence + Scalar (broadcast)
	if (aIsSeq && bIsString) {
		const parsedB = parseDecimal(b);
		return (function* seqPlusScalar() {
			const iter = a[Symbol.iterator]();
			let done = false;
			try {
				while (true) {
					const step = iter.next();
					if (step.done) {
						done = true;
						break;
					}
					yield formatDecimal(addParsed(parseDecimal(step.value), parsedB), prec);
				}
			} finally {
				if (!done) {
					iter.return?.();
				}
			}
		})();
	}

	// Scalar + Sequence (broadcast)
	if (aIsString && bIsSeq) {
		const parsedA = parseDecimal(a);
		return (function* scalarPlusSeq() {
			const iter = b[Symbol.iterator]();
			let done = false;
			try {
				while (true) {
					const step = iter.next();
					if (step.done) {
						done = true;
						break;
					}
					yield formatDecimal(addParsed(parsedA, parseDecimal(step.value)), prec);
				}
			} finally {
				if (!done) {
					iter.return?.();
				}
			}
		})();
	}

	// Sequence + Sequence (lazy zip addition)
	return (function* zipSum() {
		const iterA = a[Symbol.iterator]();
		const iterB = b[Symbol.iterator]();
		let doneA = false;
		let doneB = false;
		try {
			while (true) {
				const stepA = iterA.next();
				if (stepA.done) {
					doneA = true;
					break;
				}
				const stepB = iterB.next();
				if (stepB.done) {
					doneB = true;
					break;
				}
				const sum = addParsed(parseDecimal(stepA.value), parseDecimal(stepB.value));
				yield formatDecimal(sum, prec);
			}
		} finally {
			if (!doneA) {
				iterA.return?.();
			}
			if (!doneB) {
				iterB.return?.();
			}
		}
	})();
}
