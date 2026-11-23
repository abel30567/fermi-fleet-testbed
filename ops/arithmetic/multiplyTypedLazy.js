/**
 * Lazily multiplies two {@link Float64Array} instances element-wise, or two
 * iterables of {@link Float64Array} chunks element-wise in lockstep.
 *
 * - When both `a` and `b` are `Float64Array` instances of equal length, returns
 *   a generator yielding each IEEE-754 float64 product `a[i] * b[i]` on demand.
 * - When both `a` and `b` are iterables (excluding strings and TypedArrays)
 *   yielding `Float64Array` chunks, returns a generator that pulls one chunk
 *   from each iterable per step, validates matching `Float64Array` lengths, and
 *   yields a new `Float64Array` of element-wise products. Upstream iterators
 *   are closed if iteration stops early or fails.
 *
 * @param {Float64Array | Iterable<Float64Array>} a First `Float64Array` or iterable of `Float64Array` chunks.
 * @param {Float64Array | Iterable<Float64Array>} b Second `Float64Array` or iterable of `Float64Array` chunks.
 * @returns {Generator<number, void, undefined> | Generator<Float64Array, void, undefined>}
 *   A lazy generator of scalar products (for `Float64Array` inputs) or `Float64Array` product chunks (for iterable inputs).
 * @throws {TypeError} If inputs are not both `Float64Array` instances or both valid iterables yielding `Float64Array` chunks.
 * @throws {RangeError} If paired `Float64Array` lengths differ or input iterables yield different numbers of chunks.
 */
export function multiplyTypedLazy(a, b) {
	const aIsF64 = a instanceof Float64Array;
	const bIsF64 = b instanceof Float64Array;

	if (aIsF64 && bIsF64) {
		if (a.length !== b.length) {
			throw new RangeError(
				`Float64Array length mismatch: expected equal lengths, got ${a.length} and ${b.length}`,
			);
		}
		return multiplyFloat64Pair(a, b);
	}

	if (aIsF64 !== bIsF64) {
		throw new TypeError(
			'Both inputs must be Float64Array instances or both must be iterables of Float64Array instances',
		);
	}

	if (!isValidChunkIterable(a) || !isValidChunkIterable(b)) {
		throw new TypeError(
			'Inputs must be Float64Array instances or iterables of Float64Array instances',
		);
	}

	return multiplyFloat64Streams(a, b);
}

/**
 * Checks whether a value is an iterable sequence eligible to stream `Float64Array` chunks.
 * Rejects primitives (including strings), `null`, `undefined`, and `ArrayBufferView`s.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isValidChunkIterable(value) {
	return (
		value !== null &&
		typeof value === 'object' &&
		!ArrayBuffer.isView(value) &&
		typeof value[Symbol.iterator] === 'function'
	);
}

/**
 * Lazily yields element-wise products for two equal-length `Float64Array`s.
 *
 * @param {Float64Array} a
 * @param {Float64Array} b
 * @returns {Generator<number, void, undefined>}
 */
function* multiplyFloat64Pair(a, b) {
	const len = a.length;
	for (let i = 0; i < len; i++) {
		yield a[i] * b[i];
	}
}

/**
 * Lazily consumes two iterables of `Float64Array` chunks in lockstep, yielding
 * a `Float64Array` of element-wise products for each pair of chunks.
 *
 * @param {Iterable<Float64Array>} a
 * @param {Iterable<Float64Array>} b
 * @returns {Generator<Float64Array, void, undefined>}
 */
function* multiplyFloat64Streams(a, b) {
	let iterA;
	let iterB;
	let doneA = false;
	let doneB = false;

	try {
		iterA = a[Symbol.iterator]();
		if (!iterA || typeof iterA.next !== 'function') {
			throw new TypeError('First input iterable did not return a valid iterator');
		}
		iterB = b[Symbol.iterator]();
		if (!iterB || typeof iterB.next !== 'function') {
			throw new TypeError('Second input iterable did not return a valid iterator');
		}

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
					'Input iterables must yield the same number of Float64Array chunks',
				);
			}

			const chunkA = stepA.value;
			const chunkB = stepB.value;
			if (!(chunkA instanceof Float64Array) || !(chunkB instanceof Float64Array)) {
				throw new TypeError(
					'Each element yielded by input iterables must be a Float64Array',
				);
			}
			if (chunkA.length !== chunkB.length) {
				throw new RangeError(
					`Float64Array chunk length mismatch: expected equal lengths, got ${chunkA.length} and ${chunkB.length}`,
				);
			}

			const out = new Float64Array(chunkA.length);
			for (let i = 0; i < chunkA.length; i++) {
				out[i] = chunkA[i] * chunkB[i];
			}
			yield out;
		}
	} finally {
		try {
			if (iterA && !doneA && typeof iterA.return === 'function') {
				iterA.return();
			}
		} finally {
			if (iterB && !doneB && typeof iterB.return === 'function') {
				iterB.return();
			}
		}
	}
}
