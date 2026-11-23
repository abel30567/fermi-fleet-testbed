/**
 * @typedef {{ re: number, im: number }} Complex
 */

/**
 * Checks whether a value is a non-string iterable sequence.
 *
 * @param {unknown} value
 * @returns {value is Iterable<unknown>}
 */
function isSequence(value) {
	return (
		value !== null &&
		typeof value === 'object' &&
		typeof value[Symbol.iterator] === 'function'
	);
}

/**
 * Validates that a value is a complex number `{ re, im }` with finite numeric parts.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {Complex}
 */
function assertComplex(value, label) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${label} must be a complex number object { re, im }`);
	}
	const { re, im } = /** @type {Record<string, unknown>} */ (value);
	if (typeof re !== 'number' || !Number.isFinite(re)) {
		throw new TypeError(`${label}.re must be a finite number`);
	}
	if (typeof im !== 'number' || !Number.isFinite(im)) {
		throw new TypeError(`${label}.im must be a finite number`);
	}
	return { re, im };
}

/**
 * Validates that a complex divisor is non-zero.
 *
 * @param {Complex} divisor
 * @param {string} label
 */
function assertNonZeroDivisor(divisor, label) {
	if (divisor.re === 0 && divisor.im === 0) {
		throw new RangeError(`${label} cannot be zero (0 + 0i)`);
	}
}

/**
 * Normalizes `-0` to `0`.
 *
 * @param {number} n
 * @returns {number}
 */
function normalizeZero(n) {
	return n === 0 ? 0 : n;
}

/**
 * Divides two validated complex numbers using Smith's numerically stable algorithm
 * to avoid spurious intermediate overflow/underflow in `c^2 + d^2`.
 *
 * @param {Complex} a
 * @param {Complex} b
 * @returns {Complex}
 */
function dividePair(a, b) {
	assertNonZeroDivisor(b, 'divisor');

	const { re: ar, im: ai } = a;
	const { re: br, im: bi } = b;

	let re;
	let im;
	if (Math.abs(br) >= Math.abs(bi)) {
		const r = bi / br;
		const denom = br + bi * r;
		re = (ar + ai * r) / denom;
		im = (ai - ar * r) / denom;
	} else {
		const r = br / bi;
		const denom = bi + br * r;
		re = (ar * r + ai) / denom;
		im = (ai * r - ar) / denom;
	}

	return {
		re: normalizeZero(re),
		im: normalizeZero(im),
	};
}

/**
 * Lazily divides complex numbers represented as `{ re, im }`.
 *
 * Both `numerators` and `denominators` may be either an iterable sequence of
 * `{ re, im }` complex numbers or a single `{ re, im }` complex scalar:
 * - `(Iterable, Iterable)`: yields element-wise quotients, pulling one pair at a
 *   time until the shorter sequence is exhausted.
 * - `(Iterable, Complex)`: broadcasts the scalar divisor across the sequence.
 * - `(Complex, Iterable)`: broadcasts the scalar dividend across the sequence.
 * - `(Complex, Complex)`: yields a single quotient.
 *
 * Top-level input kinds and scalar operands are validated eagerly; elements of
 * iterable inputs are pulled and validated lazily on demand. Underlying iterators
 * are closed via `.return()` if iteration terminates early.
 *
 * @param {Iterable<Complex> | Complex} numerators - Dividend sequence or complex scalar.
 * @param {Iterable<Complex> | Complex} denominators - Divisor sequence or complex scalar.
 * @returns {Generator<Complex, void, undefined>} Lazy generator yielding `{ re, im }` quotients.
 * @throws {TypeError} If either argument is missing, not a complex object/iterable,
 *   or yields an invalid `{ re, im }` element.
 * @throws {RangeError} If a divisor is `{ re: 0, im: 0 }`.
 */
export function divideComplexLazy(numerators, denominators) {
	if (arguments.length < 2 || numerators === undefined || denominators === undefined) {
		throw new TypeError('divideComplexLazy requires two arguments: numerators and denominators');
	}

	const numIsSeq = isSequence(numerators);
	const denIsSeq = isSequence(denominators);

	const scalarNum = numIsSeq ? null : assertComplex(numerators, 'numerators');
	const scalarDen = denIsSeq ? null : assertComplex(denominators, 'denominators');
	if (scalarDen !== null) {
		assertNonZeroDivisor(scalarDen, 'denominators');
	}

	return (function* stream() {
		if (!numIsSeq && !denIsSeq) {
			yield dividePair(scalarNum, scalarDen);
			return;
		}

		if (numIsSeq && !denIsSeq) {
			let index = 0;
			for (const item of /** @type {Iterable<unknown>} */ (numerators)) {
				const num = assertComplex(item, `numerators[${index}]`);
				yield dividePair(num, scalarDen);
				index += 1;
			}
			return;
		}

		if (!numIsSeq && denIsSeq) {
			let index = 0;
			for (const item of /** @type {Iterable<unknown>} */ (denominators)) {
				const den = assertComplex(item, `denominators[${index}]`);
				yield dividePair(scalarNum, den);
				index += 1;
			}
			return;
		}

		const iterA = /** @type {Iterable<unknown>} */ (numerators)[Symbol.iterator]();
		let iterB = null;
		let doneA = false;
		let doneB = false;

		try {
			let index = 0;
			while (true) {
				const stepA = iterA.next();
				if (stepA.done) {
					doneA = true;
					break;
				}
				if (iterB === null) {
					iterB = /** @type {Iterable<unknown>} */ (denominators)[Symbol.iterator]();
				}
				const stepB = iterB.next();
				if (stepB.done) {
					doneB = true;
					break;
				}

				const num = assertComplex(stepA.value, `numerators[${index}]`);
				const den = assertComplex(stepB.value, `denominators[${index}]`);
				yield dividePair(num, den);
				index += 1;
			}
		} finally {
			if (!doneA && typeof iterA.return === 'function') {
				iterA.return();
			}
			if (iterB !== null && !doneB && typeof iterB.return === 'function') {
				iterB.return();
			}
		}
	})();
}
