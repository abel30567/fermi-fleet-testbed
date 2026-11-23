const MAX_UINT32 = 0xffffffff;

/**
 * Validates that a value is a valid unsigned 32-bit integer word.
 *
 * @param {unknown} word - Candidate word value.
 * @param {number} index - Zero-based word index for error reporting.
 * @returns {number} The validated Uint32 word.
 */
function assertUint32Word(word, index) {
	if (typeof word !== 'number') {
		throw new TypeError(
			`Expected word at index ${index} to be a number, got ${word === null ? 'null' : typeof word}`
		);
	}
	if (!Number.isInteger(word) || word < 0 || word > MAX_UINT32) {
		throw new RangeError(
			`Expected word at index ${index} to be an unsigned 32-bit integer (0..${MAX_UINT32}), got ${word}`
		);
	}
	return word;
}

/**
 * Lazily yields the bitwise NOT (set complement) of a stream of Uint32 bitmask words.
 *
 * @param {Iterable<number>} words - Iterable of Uint32 words.
 * @param {number | undefined} bitLength - Optional universe size in bits.
 * @returns {Generator<number, void, undefined>}
 */
function* notMask32Generator(words, bitLength) {
	if (bitLength === undefined) {
		let index = 0;
		for (const rawWord of words) {
			const word = assertUint32Word(rawWord, index);
			index += 1;
			yield (~word) >>> 0;
		}
		return;
	}

	const wordCount = Math.ceil(bitLength / 32);
	if (wordCount === 0) {
		return;
	}

	const remainderBits = bitLength % 32;
	const lastWordMask =
		remainderBits === 0 ? MAX_UINT32 : MAX_UINT32 >>> (32 - remainderBits);

	const iterator = words[Symbol.iterator]();
	let exhausted = false;

	try {
		for (let i = 0; i < wordCount; i += 1) {
			let word = 0;
			if (!exhausted) {
				const step = iterator.next();
				if (step.done) {
					exhausted = true;
				} else {
					word = assertUint32Word(step.value, i);
				}
			}

			const inverted = (~word) >>> 0;
			if (i === wordCount - 1) {
				yield (inverted & lastWordMask) >>> 0;
			} else {
				yield inverted;
			}
		}
	} finally {
		if (!exhausted && typeof iterator.return === 'function') {
			iterator.return();
		}
	}
}

/**
 * Computes the logical NOT (set complement) over a Uint32 bitmask represented as a
 * sequence of 32-bit unsigned integer words (such as a `Uint32Array` or any iterable
 * of Uint32 words), yielding complemented words lazily via a generator.
 *
 * When `bitLength` is omitted, every word from `words` is complemented across all 32
 * bits (`(~word) >>> 0`), supporting finite or infinite iterables.
 *
 * When `bitLength` is provided, the universe consists of bits `0 .. bitLength - 1`:
 * - Exactly `Math.ceil(bitLength / 32)` words are yielded.
 * - Missing trailing words in `words` are treated as `0` (so their complement is all 1s).
 * - Extra words beyond `Math.ceil(bitLength / 32)` are not consumed from `words`.
 * - Unused high bits in the final word are masked to `0`.
 *
 * @param {Iterable<number>} words - Iterable of Uint32 bitmask words (e.g., `Uint32Array`, `Array`, or generator).
 * @param {number} [bitLength] - Optional total number of bits in the bitmask universe (non-negative safe integer).
 * @returns {Generator<number, void, undefined>} Lazy generator yielding complemented Uint32 words.
 * @throws {TypeError} If `words` is not a valid iterable (or is a string), if `bitLength` is not a number when provided, or if a yielded word is not a number.
 * @throws {RangeError} If `bitLength` is not a non-negative safe integer, or if a yielded word is not an integer in `[0, 0xffffffff]`.
 */
export function notMask32Lazy(words, bitLength = undefined) {
	if (
		words === null ||
		words === undefined ||
		typeof words === 'string' ||
		typeof words[Symbol.iterator] !== 'function'
	) {
		throw new TypeError(
			'Expected words to be an iterable of Uint32 words (such as Uint32Array, Array, or generator)'
		);
	}

	if (bitLength !== undefined) {
		if (typeof bitLength !== 'number') {
			throw new TypeError(
				`Expected bitLength to be a number when provided, got ${bitLength === null ? 'null' : typeof bitLength}`
			);
		}
		if (!Number.isSafeInteger(bitLength) || bitLength < 0) {
			throw new RangeError(
				`Expected bitLength to be a non-negative safe integer, got ${bitLength}`
			);
		}
	}

	return notMask32Generator(words, bitLength);
}
