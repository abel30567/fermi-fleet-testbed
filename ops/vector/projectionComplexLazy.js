/**
 * @typedef {{ re: number, im: number }} Complex
 */

/**
 * Validate that an input is a non-string iterable.
 *
 * @param {unknown} value - Candidate iterable.
 * @param {string} name - Parameter name for error messages.
 */
function assertIterable(value, name) {
	if (
		value == null ||
		typeof value === 'string' ||
		typeof value[Symbol.iterator] !== 'function'
	) {
		throw new TypeError(`Parameter "${name}" must be an iterable of complex numbers`);
	}
}

/**
 * Validate that a value is a finite complex number `{ re, im }`.
 *
 * @param {unknown} z - Candidate complex number.
 * @param {string} name - Vector name for error messages.
 * @param {number} index - Element index for error messages.
 * @returns {Complex}
 */
function validateComplex(z, name, index) {
	if (typeof z !== 'object' || z === null) {
		throw new TypeError(
			`Element at index ${index} of "${name}" must be an object with numeric { re, im }`,
		);
	}
	const { re, im } = /** @type {Record<string, unknown>} */ (z);
	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError(
			`Element at index ${index} of "${name}" must have numeric re and im properties`,
		);
	}
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError(
			`Element at index ${index} of "${name}" must have finite re and im values`,
		);
	}
	return { re, im };
}

/**
 * Compute an exact power-of-two scale factor for a positive finite magnitude.
 * Dividing or multiplying by a normal power of two preserves all mantissa bits
 * while preventing intermediate overflow and underflow.
 *
 * @param {number} mag - Positive finite magnitude.
 * @returns {number}
 */
function powerOfTwoScale(mag) {
	const exp = Math.max(-1022, Math.min(1023, Math.floor(Math.log2(mag))));
	return 2 ** exp;
}

/**
 * Normalize negative zero to positive zero.
 *
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x;
}

/**
 * Internal generator performing lockstep lazy consumption of `u` and `v`,
 * scale-safe Hermitian inner product accumulation, and lazy element-wise yield.
 *
 * @param {Iterable<Complex>} u
 * @param {Iterable<Complex>} v
 * @returns {Generator<Complex, void, undefined>}
 */
function* projectionGenerator(u, v) {
	const iterU = u[Symbol.iterator]();
	const iterV = v[Symbol.iterator]();

	let uDone = false;
	let vDone = false;

	/** @type {number[]} */
	const vRe = [];
	/** @type {number[]} */
	const vIm = [];

	let uScale = 0;
	let vScale = 0;
	let numReScaled = 0;
	let numImScaled = 0;
	let denomScaled = 0;

	try {
		let index = 0;
		while (true) {
			const stepU = iterU.next();
			uDone = Boolean(stepU.done);
			const stepV = iterV.next();
			vDone = Boolean(stepV.done);

			if (uDone && vDone) {
				break;
			}
			if (uDone !== vDone) {
				throw new RangeError('Input vectors must have the same length');
			}

			const cu = validateComplex(stepU.value, 'u', index);
			const cv = validateComplex(stepV.value, 'v', index);

			const ur = cu.re;
			const ui = cu.im;
			const vr = cv.re;
			const vi = cv.im;

			vRe.push(vr);
			vIm.push(vi);

			const magV = Math.max(Math.abs(vr), Math.abs(vi));
			if (magV > 0) {
				const nextVScale = powerOfTwoScale(magV);
				if (nextVScale > vScale) {
					const ratioV = vScale === 0 ? 0 : vScale / nextVScale;
					denomScaled *= ratioV * ratioV;
					numReScaled *= ratioV;
					numImScaled *= ratioV;
					vScale = nextVScale;
				}
			}

			const magU = Math.max(Math.abs(ur), Math.abs(ui));
			if (magU > 0) {
				const nextUScale = powerOfTwoScale(magU);
				if (nextUScale > uScale) {
					const ratioU = uScale === 0 ? 0 : uScale / nextUScale;
					numReScaled *= ratioU;
					numImScaled *= ratioU;
					uScale = nextUScale;
				}
			}

			if (vScale > 0) {
				const svr = vr / vScale;
				const svi = vi / vScale;
				denomScaled += svr * svr + svi * svi;

				if (uScale > 0) {
					const sur = ur / uScale;
					const sui = ui / uScale;
					// Hermitian inner product term: u_k * conj(v_k)
					numReScaled += sur * svr + sui * svi;
					numImScaled += sui * svr - sur * svi;
				}
			}

			index += 1;
		}
	} finally {
		if (!uDone && typeof iterU.return === 'function') {
			iterU.return();
		}
		if (!vDone && typeof iterV.return === 'function') {
			iterV.return();
		}
	}

	const len = vRe.length;
	if (len === 0) {
		throw new RangeError('Input vectors must not be empty');
	}
	if (vScale === 0 || denomScaled === 0) {
		throw new RangeError('Cannot project onto the zero vector');
	}

	if (uScale === 0) {
		for (let i = 0; i < len; i++) {
			yield { re: 0, im: 0 };
		}
		return;
	}

	const qRe = numReScaled / denomScaled;
	const qIm = numImScaled / denomScaled;

	for (let i = 0; i < len; i++) {
		const svr = vRe[i] / vScale;
		const svi = vIm[i] / vScale;
		const re = (qRe * svr - qIm * svi) * uScale;
		const im = (qRe * svi + qIm * svr) * uScale;
		yield {
			re: normalizeZero(re),
			im: normalizeZero(im),
		};
	}
}

/**
 * Lazily compute the orthogonal vector projection of complex vector `u` onto
 * non-zero complex vector `v`, where elements are `{ re, im }` complex numbers:
 *
 *   proj_v(u) = (<u, v> / <v, v>) * v
 *
 * using the standard Hermitian inner product `<u, v> = sum(u_k * conj(v_k))`.
 *
 * Returns a generator that does not consume `u` or `v` until iteration begins.
 * During iteration, `u` and `v` are consumed in lockstep (failing immediately on
 * length mismatch or invalid elements and closing open iterators), and projected
 * components are computed and yielded lazily one element at a time. Power-of-two
 * dynamic rescaling prevents intermediate overflow and underflow without
 * introducing mantissa rounding error.
 *
 * @param {Iterable<Complex>} u - Iterable sequence of complex numbers to project.
 * @param {Iterable<Complex>} v - Iterable sequence of complex numbers to project onto (must be non-zero).
 * @returns {Generator<Complex, void, undefined>} Lazy generator yielding projected `{ re, im }` elements.
 * @throws {TypeError} If `u` or `v` is not a valid iterable, or any element lacks numeric `{ re, im }`.
 * @throws {RangeError} If vectors differ in length, are empty, contain non-finite numbers, or `v` is the zero vector.
 */
export function projectionComplexLazy(u, v) {
	assertIterable(u, 'u');
	assertIterable(v, 'v');
	return projectionGenerator(u, v);
}
