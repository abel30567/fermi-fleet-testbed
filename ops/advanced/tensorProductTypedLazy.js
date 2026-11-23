/**
 * Validates that an input argument is a non-string iterable (such as a
 * `Float64Array`, `Array`, generator, or custom iterable sequence).
 *
 * @param {unknown} input - Candidate input sequence.
 * @param {number} index - Zero-based parameter index for diagnostics.
 * @throws {TypeError} If `input` is nullish, a string, or not iterable.
 */
function assertIterableSequence(input, index) {
	if (
		input === null ||
		input === undefined ||
		typeof input === 'string' ||
		(typeof input !== 'object' && typeof input !== 'function') ||
		typeof input[Symbol.iterator] !== 'function'
	) {
		throw new TypeError(
			`tensorProductTypedLazy: argument at index ${index} must be a Float64Array or non-string iterable of finite numbers`,
		);
	}
}

/**
 * Validates that an element is a finite JavaScript number.
 *
 * @param {unknown} value - Element value to validate.
 * @param {number} factorIndex - Zero-based factor index.
 * @param {number} elementIndex - Zero-based element index within the factor.
 * @throws {TypeError} If `value` is not of type `number`.
 * @throws {RangeError} If `value` is `NaN`, `Infinity`, or `-Infinity`.
 */
function assertFiniteNumber(value, factorIndex, elementIndex) {
	if (typeof value !== 'number') {
		throw new TypeError(
			`tensorProductTypedLazy: element at factor ${factorIndex}, index ${elementIndex} must be a number`,
		);
	}
	if (!Number.isFinite(value)) {
		throw new RangeError(
			`tensorProductTypedLazy: element at factor ${factorIndex}, index ${elementIndex} must be finite`,
		);
	}
}

/**
 * Wraps an intermediate factor (indices `1 .. k-2`) so it is consumed lazily on
 * the first pass, cached into memory only as far as needed, and replayed on
 * subsequent passes without re-iterating single-use iterables.
 *
 * For `Float64Array` inputs, elements are validated lazily in place without copying.
 *
 * @param {Float64Array | Iterable<number>} input
 * @param {number} factorIndex
 */
function createLazyFactor(input, factorIndex) {
	if (input instanceof Float64Array) {
		let validatedUpTo = 0;
		return {
			*iterate() {
				for (let i = 0; i < input.length; i++) {
					const val = input[i];
					if (i >= validatedUpTo) {
						assertFiniteNumber(val, factorIndex, i);
						validatedUpTo = i + 1;
					}
					yield val;
				}
			},
			close() {},
		};
	}

	/** @type {Iterator<number> | null} */
	let iterator = null;
	let exhausted = false;
	/** @type {number[]} */
	const cache = [];

	return {
		*iterate() {
			let i = 0;
			while (true) {
				if (i < cache.length) {
					yield cache[i++];
					continue;
				}
				if (exhausted) {
					return;
				}
				if (iterator === null) {
					iterator = input[Symbol.iterator]();
				}
				let step;
				try {
					step = iterator.next();
				} catch (err) {
					iterator = null;
					exhausted = true;
					throw err;
				}
				if (step.done) {
					exhausted = true;
					iterator = null;
					return;
				}
				assertFiniteNumber(step.value, factorIndex, i);
				cache.push(step.value);
				i++;
				yield step.value;
			}
		},
		close() {
			if (iterator !== null && !exhausted) {
				exhausted = true;
				const it = iterator;
				iterator = null;
				if (typeof it.return === 'function') {
					it.return();
				}
			}
		},
	};
}

/**
 * Materializes and validates the final factor as a `Float64Array`.
 * If `input` is already a `Float64Array`, validates its elements in place
 * without allocating a copy.
 *
 * @param {Float64Array | Iterable<number>} input
 * @param {number} factorIndex
 * @returns {Float64Array}
 */
function materializeLastFactor(input, factorIndex) {
	if (input instanceof Float64Array) {
		for (let i = 0; i < input.length; i++) {
			assertFiniteNumber(input[i], factorIndex, i);
		}
		return input;
	}

	const values = [];
	let i = 0;
	for (const val of input) {
		assertFiniteNumber(val, factorIndex, i++);
		values.push(val);
	}
	return Float64Array.from(values);
}

/**
 * Computes the tensor product (outer / Kronecker-order product) of two or more
 * `Float64Array` or iterable numeric sequences lazily, streaming one
 * `Float64Array` fiber along the final axis per yielded step in row-major
 * (C-order) lexicographical order.
 *
 * For two inputs `a` (length `m`) and `b` (length `n`), yields `m`
 * `Float64Array` rows of length `n` where `row_i[j] = a[i] * b[j]`.
 *
 * For `k` inputs `(f_0, f_1, ..., f_{k-1})`, yields `|f_0| * ... * |f_{k-2}|`
 * `Float64Array` fibers of length `|f_{k-1}|` where each element equals
 * `f_0[i_0] * f_1[i_1] * ... * f_{k-2}[i_{k-2}] * f_{k-1}[j]`.
 *
 * Laziness guarantees:
 * - Argument types are validated synchronously on call, while elements are
 *   pulled and validated strictly on demand as the returned generator advances.
 * - The outermost sequence `f_0` is streamed in `O(1)` memory and may be
 *   infinite when consumed partially.
 * - Intermediate sequences `f_1 .. f_{k-2}` are pulled on demand and cached
 *   only as far as needed.
 * - The final sequence `f_{k-1}` is not touched until the first fiber is
 *   actually produced; if any factor is empty, iteration terminates without
 *   consuming remaining elements.
 * - Early termination (`break` / `.return()`) closes any open iterators.
 *
 * @param {Float64Array | Iterable<number>} a - First input sequence (streamed lazily).
 * @param {Float64Array | Iterable<number>} b - Second input sequence.
 * @param {...(Float64Array | Iterable<number>)} rest - Optional additional factors for higher-order tensor products.
 * @returns {Generator<Float64Array, void, undefined>} Lazy generator yielding `Float64Array` fibers of length `|lastFactor|`.
 * @throws {TypeError} If fewer than 2 inputs are provided, an input is not a non-string iterable, or any consumed element is not a number.
 * @throws {RangeError} If any consumed element is `NaN`, `Infinity`, or `-Infinity`.
 */
export function tensorProductTypedLazy(a, b, ...rest) {
	if (arguments.length < 2) {
		throw new TypeError(
			'tensorProductTypedLazy: requires at least 2 input sequences',
		);
	}

	const factors = [a, b, ...rest];
	for (let i = 0; i < factors.length; i++) {
		assertIterableSequence(factors[i], i);
	}

	return (function* generateTensorProduct() {
		// Fast short-circuit if any Float64Array factor is already known to be empty.
		for (let i = 0; i < factors.length; i++) {
			if (factors[i] instanceof Float64Array && factors[i].length === 0) {
				return;
			}
		}

		const lastIdx = factors.length - 1;
		const firstInput = factors[0];
		const middleFactors = [];
		for (let i = 1; i < lastIdx; i++) {
			middleFactors.push(createLazyFactor(factors[i], i));
		}

		/** @type {Float64Array | null} */
		let lastFactor = null;
		let abortedEmpty = false;

		/**
		 * Recursively streams fibers for factors `depth .. lastIdx`.
		 * @param {number} depth
		 * @param {number} prefixProd
		 */
		function* emit(depth, prefixProd) {
			if (depth === lastIdx) {
				if (lastFactor === null) {
					lastFactor = materializeLastFactor(factors[lastIdx], lastIdx);
				}
				const len = lastFactor.length;
				if (len === 0) {
					abortedEmpty = true;
					return;
				}
				const fiber = new Float64Array(len);
				for (let j = 0; j < len; j++) {
					fiber[j] = prefixProd * lastFactor[j];
				}
				yield fiber;
				return;
			}

			const factor = middleFactors[depth - 1];
			let seenAny = false;
			for (const val of factor.iterate()) {
				seenAny = true;
				yield* emit(depth + 1, prefixProd * val);
				if (abortedEmpty) {
					return;
				}
			}
			if (!seenAny) {
				abortedEmpty = true;
			}
		}

		try {
			if (firstInput instanceof Float64Array) {
				for (let i = 0; i < firstInput.length; i++) {
					const val = firstInput[i];
					assertFiniteNumber(val, 0, i);
					yield* emit(1, val);
					if (abortedEmpty) {
						break;
					}
				}
			} else {
				let idx = 0;
				for (const val of firstInput) {
					assertFiniteNumber(val, 0, idx++);
					yield* emit(1, val);
					if (abortedEmpty) {
						break;
					}
				}
			}
		} finally {
			for (const factor of middleFactors) {
				factor.close();
			}
		}
	})();
}
