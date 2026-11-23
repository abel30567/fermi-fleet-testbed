const MAX_UINT32 = 0xffffffff;

function validateMaskIterable(mask, argIndex) {
	if (
		mask === null ||
		mask === undefined ||
		typeof mask === 'string' ||
		typeof mask[Symbol.iterator] !== 'function'
	) {
		throw new TypeError(
			`Mask argument at index ${argIndex} must be an iterable of Uint32 words (not a string).`,
		);
	}
}

function validateUint32Word(value, argIndex, wordIndex) {
	if (typeof value !== 'number' || !Number.isInteger(value)) {
		throw new TypeError(
			`Word at index ${wordIndex} of mask ${argIndex} must be an integer in [0, 0xFFFFFFFF].`,
		);
	}
	if (value < 0 || value > MAX_UINT32) {
		throw new RangeError(
			`Word at index ${wordIndex} of mask ${argIndex} (${value}) is out of Uint32 range [0, 0xFFFFFFFF].`,
		);
	}
	return value >>> 0;
}

function* intersectWords(masks) {
	const count = masks.length;
	const sources = new Array(count);
	let openedCount = 0;
	let activeError = false;

	try {
		for (let i = 0; i < count; i++) {
			const mask = masks[i];
			if (mask.constructor === Uint32Array) {
				sources[i] = { isTyped: true, array: mask, done: false };
			} else {
				const iter = mask[Symbol.iterator]();
				if (
					iter === null ||
					typeof iter !== 'object' ||
					typeof iter.next !== 'function'
				) {
					throw new TypeError(
						`Mask argument at index ${i} returned an invalid iterator.`,
					);
				}
				sources[i] = { isTyped: false, iter, done: false };
			}
			openedCount = i + 1;
		}

		for (let wordIndex = 0; ; wordIndex++) {
			let acc = MAX_UINT32;

			for (let i = 0; i < count; i++) {
				const src = sources[i];
				let word;

				if (src.isTyped) {
					if (wordIndex >= src.array.length) {
						src.done = true;
						return;
					}
					word = src.array[wordIndex];
				} else {
					let step;
					try {
						step = src.iter.next();
					} catch (err) {
						src.done = true;
						throw err;
					}
					if (step === null || typeof step !== 'object') {
						src.done = true;
						throw new TypeError(
							`Iterator for mask argument at index ${i} returned a non-object result.`,
						);
					}
					if (step.done) {
						src.done = true;
						return;
					}
					word = validateUint32Word(step.value, i, wordIndex);
				}

				acc = (acc & word) >>> 0;
			}

			yield acc;
		}
	} catch (err) {
		activeError = true;
		throw err;
	} finally {
		for (let i = 0; i < openedCount; i++) {
			const src = sources[i];
			if (!src.isTyped && !src.done && typeof src.iter.return === 'function') {
				if (activeError) {
					try {
						src.iter.return();
					} catch {
						// Preserve the primary error already being thrown.
					}
				} else {
					src.iter.return();
				}
			}
		}
	}
}

/**
 * Lazily computes the bitwise set intersection across one or more Uint32 bitmask
 * word sequences, yielding unsigned 32-bit integer words one at a time.
 *
 * Each input may be a `Uint32Array` or any iterable sequence (e.g. `Array`,
 * generator, or custom iterable) yielding Uint32 integer words in `[0, 0xFFFFFFFF]`.
 * Inputs are consumed lazily, one word per step, stopping as soon as the shortest
 * sequence is exhausted (trailing missing words are implicitly `0`). Underlying
 * iterators are closed via `.return()` on normal completion, early termination,
 * or error.
 *
 * @param {...(Uint32Array | Iterable<number>)} masks - One or more Uint32 bitmask word sequences.
 * @returns {Generator<number, void, undefined>} A lazy generator yielding intersected Uint32 words.
 * @throws {RangeError} If no masks are supplied, or if a yielded word is outside `[0, 0xFFFFFFFF]`.
 * @throws {TypeError} If any mask is not a valid iterable (or is a string), returns an invalid
 *   iterator, or yields a non-integer value.
 */
export function intersectionMask32Lazy(...masks) {
	if (masks.length === 0) {
		throw new RangeError(
			'intersectionMask32Lazy requires at least one bitmask sequence.',
		);
	}

	for (let i = 0; i < masks.length; i++) {
		validateMaskIterable(masks[i], i);
	}

	return intersectWords(masks);
}
