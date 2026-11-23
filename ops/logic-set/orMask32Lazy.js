/**
 * Checks whether a value is a `Uint32Array` (including cross-realm instances).
 *
 * @param {unknown} value
 * @returns {value is Uint32Array}
 */
function isUint32Array(value) {
	return (
		value instanceof Uint32Array ||
		Object.prototype.toString.call(value) === '[object Uint32Array]'
	)
}

/**
 * Validates that an input mask is either a `Uint32Array` or a non-string,
 * non-TypedArray iterable of uint32 words.
 *
 * @param {unknown} mask
 * @param {number} index
 */
function validateMaskInput(mask, index) {
	if (isUint32Array(mask)) {
		return
	}
	if (
		mask === null ||
		mask === undefined ||
		typeof mask === 'string' ||
		ArrayBuffer.isView(mask) ||
		typeof mask[Symbol.iterator] !== 'function'
	) {
		throw new TypeError(
			`Argument at index ${index} must be a Uint32Array or an iterable of uint32 words`
		)
	}
}

/**
 * Validates that a yielded word is an unsigned 32-bit integer in `[0, 0xFFFFFFFF]`.
 *
 * @param {unknown} word
 * @param {number} maskIndex
 * @param {number} wordIndex
 * @returns {number}
 */
function validateUint32Word(word, maskIndex, wordIndex) {
	if (typeof word !== 'number' || !Number.isInteger(word)) {
		throw new TypeError(
			`Mask ${maskIndex} word at index ${wordIndex} must be an integer number`
		)
	}
	if (word < 0 || word > 0xffffffff) {
		throw new RangeError(
			`Mask ${maskIndex} word at index ${wordIndex} must be a uint32 in [0, 4294967295]`
		)
	}
	return word
}

/**
 * Lazily computes the bitwise OR (logic-set union) across zero or more Uint32
 * bitmasks represented as `Uint32Array` words or iterables of uint32 words.
 *
 * Top-level arguments are validated eagerly at call time; individual words are
 * pulled lazily on demand from each input iterable. Shorter masks are logically
 * zero-extended until all input masks are exhausted. When iteration terminates
 * early or throws, any remaining open input iterators are closed via `.return()`.
 *
 * @param {...(Uint32Array | Iterable<number>)} masks Bitmasks of uint32 words to OR together.
 * @returns {Generator<number, void, undefined>} Lazy generator yielding unsigned 32-bit OR words.
 * @throws {TypeError} If any argument is not a `Uint32Array` or iterable, or yields a non-integer word.
 * @throws {RangeError} If any iterable yields an integer outside `[0, 0xFFFFFFFF]`.
 */
export function orMask32Lazy(...masks) {
	for (let i = 0; i < masks.length; i++) {
		validateMaskInput(masks[i], i)
	}

	return (function* orMask32Generator() {
		if (masks.length === 0) {
			return
		}

		/** @type {Array<{kind: 'u32', arr: Uint32Array, pos: number, done: boolean} | {kind: 'iter', iter: Iterator<number>, done: boolean, maskIndex: number}>} */
		const sources = []
		let abruptError = false

		try {
			for (let i = 0; i < masks.length; i++) {
				const mask = masks[i]
				if (isUint32Array(mask)) {
					sources.push({
						kind: 'u32',
						arr: mask,
						pos: 0,
						done: mask.length === 0,
					})
				} else {
					const iter = mask[Symbol.iterator]()
					if (
						iter === null ||
						typeof iter !== 'object' ||
						typeof iter.next !== 'function'
					) {
						throw new TypeError(
							`Argument at index ${i} returned an invalid iterator`
						)
					}
					sources.push({
						kind: 'iter',
						iter,
						done: false,
						maskIndex: i,
					})
				}
			}

			let wordIndex = 0
			while (true) {
				let anyActive = false
				let acc = 0

				for (let i = 0; i < sources.length; i++) {
					const src = sources[i]
					if (src.done) {
						continue
					}

					if (src.kind === 'u32') {
						if (src.pos < src.arr.length) {
							anyActive = true
							acc |= src.arr[src.pos++]
						} else {
							src.done = true
						}
					} else {
						const step = src.iter.next()
						if (step.done) {
							src.done = true
						} else {
							anyActive = true
							const word = validateUint32Word(
								step.value,
								src.maskIndex,
								wordIndex
							)
							acc |= word
						}
					}
				}

				if (!anyActive) {
					break
				}

				yield acc >>> 0
				wordIndex++
			}
		} catch (err) {
			abruptError = true
			throw err
		} finally {
			let closeError
			let hasCloseError = false
			for (let i = 0; i < sources.length; i++) {
				const src = sources[i]
				if (
					src.kind === 'iter' &&
					!src.done &&
					typeof src.iter.return === 'function'
				) {
					src.done = true
					try {
						src.iter.return()
					} catch (err) {
						if (!hasCloseError) {
							closeError = err
							hasCloseError = true
						}
					}
				}
			}
			if (hasCloseError && !abruptError) {
				throw closeError
			}
		}
	})()
}
