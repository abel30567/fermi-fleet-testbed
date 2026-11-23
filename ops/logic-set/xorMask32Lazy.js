/**
 * Checks whether a value is a Uint32Array (including cross-realm instances).
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
 * Validates that an argument is a valid bitmask word source (Uint32Array or iterable).
 *
 * @param {unknown} mask
 * @param {number} index
 */
function validateMaskSource(mask, index) {
	if (mask === null || mask === undefined || typeof mask === 'string') {
		throw new TypeError(
			`Mask at argument ${index} must be a Uint32Array or an iterable of uint32 words`,
		)
	}
	if (ArrayBuffer.isView(mask)) {
		if (!isUint32Array(mask)) {
			throw new TypeError(
				`TypedArray mask at argument ${index} must be a Uint32Array`,
			)
		}
		return
	}
	if (typeof mask !== 'object' || typeof mask[Symbol.iterator] !== 'function') {
		throw new TypeError(
			`Mask at argument ${index} must be a Uint32Array or an iterable of uint32 words`,
		)
	}
}

/**
 * Validates that a yielded value is an unsigned 32-bit integer word.
 *
 * @param {unknown} value
 * @param {number} sourceIndex
 * @returns {number}
 */
function validateUint32Word(value, sourceIndex) {
	if (typeof value !== 'number' || !Number.isInteger(value)) {
		throw new TypeError(
			`Word from mask at argument ${sourceIndex} must be a uint32 integer`,
		)
	}
	if (value < 0 || value > 0xffffffff) {
		throw new RangeError(
			`Word from mask at argument ${sourceIndex} must be in [0, 4294967295], received ${value}`,
		)
	}
	return value
}

/**
 * Internal generator that streams XORed unsigned 32-bit words lazily.
 *
 * @param {Array<Uint32Array | Iterable<number>>} masks
 * @returns {Generator<number, void, void>}
 */
function* xorMask32Stream(masks) {
	/** @type {Array<{ arr: Uint32Array | null, index: number, iter: Iterator<number> | null, done: boolean }>} */
	const states = []
	try {
		for (let i = 0; i < masks.length; i++) {
			const mask = masks[i]
			if (isUint32Array(mask)) {
				states.push({
					arr: mask,
					index: 0,
					iter: null,
					done: mask.length === 0,
				})
			} else {
				const iter = mask[Symbol.iterator]()
				if (iter === null || typeof iter !== 'object' || typeof iter.next !== 'function') {
					throw new TypeError(
						`Iterator for mask at argument ${i} must be an object with a next() method`,
					)
				}
				states.push({
					arr: null,
					index: 0,
					iter,
					done: false,
				})
			}
		}

		while (true) {
			let acc = 0
			let anyActive = false

			for (let i = 0; i < states.length; i++) {
				const st = states[i]
				if (st.done) {
					continue
				}

				if (st.arr !== null) {
					if (st.index < st.arr.length) {
						acc ^= st.arr[st.index++]
						anyActive = true
					} else {
						st.done = true
					}
				} else {
					const step = st.iter.next()
					if (step.done) {
						st.done = true
					} else {
						acc ^= validateUint32Word(step.value, i)
						anyActive = true
					}
				}
			}

			if (!anyActive) {
				return
			}

			yield acc >>> 0
		}
	} finally {
		for (let i = 0; i < states.length; i++) {
			const st = states[i]
			if (!st.done && st.iter !== null && typeof st.iter.return === 'function') {
				st.done = true
				st.iter.return()
			}
		}
	}
}

/**
 * Lazily computes the bitwise XOR (symmetric difference) across two or more
 * 32-bit unsigned bitmasks represented as `Uint32Array` instances or iterables
 * of unsigned 32-bit integer words.
 *
 * Words are consumed one step at a time from each input sequence. Shorter
 * bitmasks are implicitly zero-padded (`w ^ 0 === w`) until all input sequences
 * are exhausted. Each yielded value is normalized to an unsigned 32-bit integer
 * in `[0, 0xFFFFFFFF]`.
 *
 * @param {...(Uint32Array | Iterable<number>)} masks - Two or more bitmask word sequences.
 * @returns {Generator<number, void, void>} A lazy generator yielding XORed uint32 words.
 * @throws {TypeError} If fewer than two masks are provided, any mask is invalid,
 *   or an iterable yields a non-integer / non-number word.
 * @throws {RangeError} If an iterable yields an integer outside `[0, 0xFFFFFFFF]`.
 */
export function xorMask32Lazy(...masks) {
	if (masks.length < 2) {
		throw new TypeError(
			`xorMask32Lazy requires at least 2 bitmask arguments, received ${masks.length}`,
		)
	}
	for (let i = 0; i < masks.length; i++) {
		validateMaskSource(masks[i], i)
	}
	return xorMask32Stream(masks)
}
