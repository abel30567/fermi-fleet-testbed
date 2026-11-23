/**
 * Validates that an input argument is a non-string iterable.
 *
 * @param {unknown} input - Candidate bitmask iterable.
 * @param {number} index - Zero-based argument position.
 */
function validateInput(input, index) {
	if (
		input == null ||
		typeof input === 'string' ||
		typeof input[Symbol.iterator] !== 'function'
	) {
		throw new TypeError(
			`andMask32Lazy: argument ${index} must be an iterable of Uint32 words (e.g., Uint32Array)`
		)
	}
}

/**
 * Validates that a yielded word is an unsigned 32-bit integer.
 *
 * @param {unknown} word - Candidate 32-bit word.
 * @param {number} argIndex - Zero-based argument position.
 * @param {number} wordIndex - Zero-based word offset.
 */
function validateWord(word, argIndex, wordIndex) {
	if (
		typeof word !== 'number' ||
		!Number.isInteger(word) ||
		word < 0 ||
		word > 0xffffffff
	) {
		throw new RangeError(
			`andMask32Lazy: word at index ${wordIndex} of argument ${argIndex} must be an unsigned 32-bit integer`
		)
	}
}

/**
 * Lazily computes the bitwise AND (set intersection) across two or more Uint32
 * bitmask word sequences (such as `Uint32Array` instances or iterables yielding
 * unsigned 32-bit integer words).
 *
 * Consumes input iterables one word at a time on demand, stopping as soon as
 * the shortest input is exhausted (missing trailing words in shorter bitmasks
 * are implicitly zero). All open input iterators are closed on completion,
 * early termination, or error.
 *
 * @param {Uint32Array | Iterable<number>} first - First Uint32 bitmask word sequence.
 * @param {Uint32Array | Iterable<number>} second - Second Uint32 bitmask word sequence.
 * @param {...(Uint32Array | Iterable<number>)} rest - Additional Uint32 bitmask word sequences.
 * @returns {Generator<number, void, undefined>} Lazy generator yielding unsigned 32-bit integer words (`0` to `0xffffffff`).
 * @throws {TypeError} If fewer than two inputs are provided, any input is not a non-string iterable, or an iterable returns an invalid iterator.
 * @throws {RangeError} If any yielded word is not an unsigned 32-bit integer (`0 <= word <= 0xffffffff`).
 */
export function andMask32Lazy(first, second, ...rest) {
	if (arguments.length < 2) {
		throw new TypeError('andMask32Lazy requires at least 2 bitmask iterables')
	}

	const inputs = [first, second, ...rest]
	for (let i = 0; i < inputs.length; i++) {
		validateInput(inputs[i], i)
	}

	return (function* andMask32Generator() {
		const iterators = []
		const doneFlags = []
		try {
			for (let i = 0; i < inputs.length; i++) {
				const iter = inputs[i][Symbol.iterator]()
				if (iter == null || typeof iter.next !== 'function') {
					throw new TypeError(
						`andMask32Lazy: argument ${i} returned an invalid iterator`
					)
				}
				iterators.push(iter)
				doneFlags.push(false)
			}

			let wordIndex = 0
			while (true) {
				let acc = 0xffffffff
				for (let i = 0; i < iterators.length; i++) {
					let step
					try {
						step = iterators[i].next()
					} catch (err) {
						doneFlags[i] = true
						throw err
					}
					if (step.done) {
						doneFlags[i] = true
						return
					}
					const word = step.value
					validateWord(word, i, wordIndex)
					acc = (acc & word) >>> 0
				}
				yield acc
				wordIndex++
			}
		} finally {
			for (let i = 0; i < iterators.length; i++) {
				if (!doneFlags[i] && typeof iterators[i].return === 'function') {
					try {
						iterators[i].return()
					} catch {
						// Suppress secondary cleanup errors so primary completion/error propagates.
					}
				}
			}
		}
	})()
}
