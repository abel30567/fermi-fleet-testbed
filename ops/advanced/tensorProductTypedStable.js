/**
 * Numerically stable tensor (outer) product over `Float64Array` inputs.
 *
 * Implements the element-wise tensor product `(a ⊗ b)[i * b.length + j] = a[i] * b[j]`
 * with IEEE-754 binary64 robustness techniques:
 * - Exact power-of-two exponent extraction (`frexp2`) and scaling (`scalePow2`)
 *   to prevent spurious intermediate overflow/underflow and double-rounding.
 * - Overflow/underflow-safe Euclidean norm using power-of-two scaling and
 *   Neumaier compensated summation (`norm2Scaled`) for `normalize` and
 *   Frobenius norm diagnostics.
 * - Overflow-free Veltkamp-Dekker error-free transformation (`twoProd`) on
 *   normalized mantissas (`|m| ∈ [0.5, 1)`) for exact per-element rounding
 *   residuals and tight Frobenius/max absolute error bounds.
 *
 * @module ops/advanced/tensorProductTypedStable
 */

const VELTKAMP_SPLIT = 134217729; // 2^27 + 1
const SUBNORMAL_THRESHOLD = 2.2250738585072014e-308; // 2^-1022
const SUBNORMAL_SCALE = 18014398509481984; // 2^54
const MAX_ARRAY_LENGTH = 2 ** 32 - 1;

// Shared scratch buffer for zero-allocation IEEE-754 bit inspection.
const _scratchBuf = new ArrayBuffer(8);
const _f64View = new Float64Array(_scratchBuf);
const _u64View = new BigUint64Array(_scratchBuf);

/**
 * Exact IEEE-754 binary64 decomposition into `x = mantissa * 2^exponent`
 * with `0.5 <= |mantissa| < 1` for finite nonzero `x`.
 *
 * @param {number} x - Finite number.
 * @returns {{ mantissa: number, exponent: number }} Exact mantissa and binary exponent.
 */
function frexp2(x) {
	if (x === 0) {
		return { mantissa: 0, exponent: 0 };
	}
	const sign = x < 0 ? -1 : 1;
	let ax = Math.abs(x);
	let expOffset = 0;

	if (ax < SUBNORMAL_THRESHOLD) {
		ax *= SUBNORMAL_SCALE;
		expOffset = -54;
	}

	_f64View[0] = ax;
	const bits = _u64View[0];
	const rawExp = Number((bits >> 52n) & 0x7ffn);
	const exponent = rawExp - 1022 + expOffset;

	// Replace exponent bits with biased 1022 (0x3fe) => value in [0.5, 1).
	_u64View[0] = (bits & 0x000fffffffffffffn) | 0x3fe0000000000000n;
	return { mantissa: sign * _f64View[0], exponent };
}

/**
 * Scales a finite number `x` by `2^exp` with exact power-of-two arithmetic
 * and without intermediate overflow/underflow or double-rounding for `|x| ∈ [0.25, 1)`.
 *
 * @param {number} x - Value to scale.
 * @param {number} exp - Integer binary exponent.
 * @returns {number} `x * 2^exp` (with `-0` normalized to `+0`).
 */
function scalePow2(x, exp) {
	if (x === 0) {
		return 0;
	}
	if (exp === 0) {
		return x;
	}

	// Fast single-rounding path when |x| is in normal mantissa range [0.25, 2)
	if (exp >= -1020 && exp <= 1023) {
		const res = x * (2 ** exp);
		return res === 0 ? 0 : res;
	}

	let val = x;
	let rem = exp;

	if (rem > 0) {
		while (rem > 1023) {
			val *= 2 ** 512;
			rem -= 512;
			if (!Number.isFinite(val)) {
				return val;
			}
		}
		// Keep a single step when remaining shift is within normal power-of-two bounds.
		if (rem > 512) {
			val *= 2 ** 512;
			rem -= 512;
			if (!Number.isFinite(val)) {
				return val;
			}
		}
		val *= 2 ** rem;
		return val;
	}

	// rem < -1020: step down while keeping intermediate values normal (>= 2^-1022)
	// so any final subnormal rounding occurs at most once.
	while (rem < -1020) {
		const step = rem < -2040 ? -1020 : -1020;
		val *= 2 ** step;
		rem -= step;
		if (val === 0) {
			return 0;
		}
	}
	val *= 2 ** rem;
	return val === 0 ? 0 : val;
}

/**
 * Error-free transformation (Veltkamp-Dekker `TwoProd`) for mantissas with `|a|, |b| < 1`.
 * Because `|a|, |b| < 1`, Veltkamp splitting cannot overflow and produces exact `(prod, err)`
 * such that `prod + err === a * b` in exact real arithmetic.
 *
 * @param {number} a - First mantissa (`|a| < 1`).
 * @param {number} b - Second mantissa (`|b| < 1`).
 * @returns {[number, number]} Exact pair `[prod, err]`.
 */
function twoProdMantissa(a, b) {
	const prod = a * b;
	const ca = VELTKAMP_SPLIT * a;
	const aHi = ca - (ca - a);
	const aLo = a - aHi;
	const cb = VELTKAMP_SPLIT * b;
	const bHi = cb - (cb - b);
	const bLo = b - bHi;
	const err = ((aHi * bHi - prod) + aHi * bLo + aLo * bHi) + aLo * bLo;
	return [prod, err];
}

/**
 * Computes the Euclidean (L2) norm of a `Float64Array` using exact power-of-two
 * scaling and Neumaier compensated summation.
 *
 * Returns both the exact scaled representation `(mantissa, exponent)`—which never
 * overflows or underflows even if the true norm exceeds `Number.MAX_VALUE` or falls
 * below `Number.MIN_VALUE`—and the reconstructed IEEE-754 `norm`.
 *
 * @param {Float64Array} arr - Validated finite Float64Array.
 * @returns {{ norm: number, mantissa: number, exponent: number, maxExp: number, isZero: boolean }}
 */
function norm2Scaled(arr) {
	const n = arr.length;
	let maxExp = -Infinity;

	for (let i = 0; i < n; i++) {
		const v = arr[i];
		if (v !== 0) {
			const { exponent } = frexp2(v);
			if (exponent > maxExp) {
				maxExp = exponent;
			}
		}
	}

	if (maxExp === -Infinity) {
		return { norm: 0, mantissa: 0, exponent: 0, maxExp: 0, isZero: true };
	}

	// Neumaier compensated summation of scaled squares: each s_i = arr[i] * 2^-maxExp has |s_i| < 1.
	let sum = 0;
	let comp = 0;
	for (let i = 0; i < n; i++) {
		const v = arr[i];
		if (v === 0) {
			continue;
		}
		const { mantissa, exponent } = frexp2(v);
		const delta = exponent - maxExp;
		// Terms with delta < -550 contribute < 2^-1100, negligible vs >= 0.25.
		if (delta < -550) {
			continue;
		}
		const scaled = mantissa * (2 ** delta);
		const sq = scaled * scaled;
		const t = sum + sq;
		if (Math.abs(sum) >= Math.abs(sq)) {
			comp += (sum - t) + sq;
		} else {
			comp += (sq - t) + sum;
		}
		sum = t;
	}

	const totalSq = sum + comp;
	const sqrtScaled = Math.sqrt(totalSq);
	const { mantissa, exponent } = frexp2(sqrtScaled);
	const totalExp = exponent + maxExp;
	const norm = scalePow2(mantissa, totalExp);

	return { norm, mantissa, exponent: totalExp, maxExp, isZero: false };
}

/**
 * Validates that an input is a `Float64Array` with all finite elements.
 *
 * @param {unknown} arr - Input to validate.
 * @param {string} name - Parameter name for error messages.
 */
function validateFloat64Array(arr, name) {
	if (!(arr instanceof Float64Array)) {
		throw new TypeError(`${name} must be a Float64Array`);
	}
	for (let i = 0; i < arr.length; i++) {
		if (!Number.isFinite(arr[i])) {
			throw new RangeError(`${name}[${i}] must be a finite number (got ${arr[i]})`);
		}
	}
}

/**
 * Validates an optional tensor shape array against a flat buffer length.
 *
 * @param {unknown} shape - Shape array to validate.
 * @param {number} expectedLength - Expected product of dimensions.
 * @param {string} name - Option name for error messages.
 * @returns {number[]} Validated shape copy.
 */
function validateShape(shape, expectedLength, name) {
	if (!Array.isArray(shape) || shape.length === 0) {
		throw new TypeError(`${name} must be a non-empty array of non-negative safe integers`);
	}
	let prod = 1;
	const out = new Array(shape.length);
	for (let i = 0; i < shape.length; i++) {
		const dim = shape[i];
		if (typeof dim !== 'number' || !Number.isInteger(dim) || dim < 0 || !Number.isSafeInteger(dim)) {
			throw new RangeError(`${name}[${i}] must be a non-negative safe integer`);
		}
		out[i] = dim;
		prod *= dim;
	}
	if (prod !== expectedLength) {
		throw new RangeError(
			`${name} product (${prod}) must equal array length (${expectedLength})`
		);
	}
	return out;
}

/**
 * Normalizes a `Float64Array` by its scaled compensated L2 norm without overflow/underflow.
 *
 * @param {Float64Array} arr - Input vector.
 * @param {{ mantissa: number, exponent: number, isZero: boolean }} normInfo - Output of `norm2Scaled`.
 * @returns {Float64Array} Unit-norm copy (or all zeros if `isZero`).
 */
function normalizeVector(arr, normInfo) {
	const out = new Float64Array(arr.length);
	if (normInfo.isZero) {
		return out;
	}
	const invNormM = normInfo.mantissa;
	const normExp = normInfo.exponent;

	for (let i = 0; i < arr.length; i++) {
		const v = arr[i];
		if (v === 0) {
			out[i] = 0;
			continue;
		}
		const { mantissa, exponent } = frexp2(v);
		// v / ||v||_2 = (mantissa / invNormM) * 2^(exponent - normExp)
		// Since |mantissa| in [0.5, 1) and invNormM in [0.5, 1), |mantissa / invNormM| in (0.5, 2).
		out[i] = scalePow2(mantissa / invNormM, exponent - normExp);
	}
	return out;
}

/**
 * @typedef {Object} TensorProductOptions
 * @property {boolean} [normalize=false] - If `true`, computes the unit-Frobenius-norm
 *   tensor product `(a / ||a||_2) ⊗ (b / ||b||_2)` using scaled compensated norms before
 *   multiplying so extreme magnitudes (`1e300`, `1e-300`, subnormals) never overflow or underflow.
 * @property {boolean} [scaled=false] - If `true` (typically with `returnDetails: true`),
 *   scales output elements by `2^(-scaleExponent)` where `scaleExponent = maxExp(a) + maxExp(b)`
 *   so extreme unnormalized products preserve full 53-bit precision without overflow/underflow.
 * @property {boolean} [returnDetails=false] - If `true`, returns a detailed result object
 *   containing `data`, `shape`, `scaleExponent`, `frobeniusNorm`, `frobeniusNormMantissa`,
 *   `frobeniusNormExponent`, `maxAbsError`, `frobeniusErrorBound`, `overflowCount`, and `underflowCount`.
 * @property {number[]} [shapeA] - Optional tensor shape for `a` whose product equals `a.length`.
 * @property {number[]} [shapeB] - Optional tensor shape for `b` whose product equals `b.length`.
 */

/**
 * @typedef {Object} TensorProductDetails
 * @property {Float64Array} data - Flattened row-major tensor product (`data[i * b.length + j]`).
 * @property {number[]} shape - Output tensor shape (`[...shapeA, ...shapeB]`).
 * @property {number} scaleExponent - Binary exponent `k` such that `trueValue ≈ data * 2^k` (`0` unless `scaled: true`).
 * @property {number} frobeniusNorm - Frobenius norm `||a ⊗ b||_F` (computed via scaled compensated L2 norms).
 * @property {number} frobeniusNormMantissa - Exact normalized mantissa of `||a ⊗ b||_F` (`0` or in `[0.5, 1)`).
 * @property {number} frobeniusNormExponent - Binary exponent of `||a ⊗ b||_F`.
 * @property {number} maxAbsError - Upper bound on maximum per-element absolute rounding error (via Veltkamp-Dekker `twoProd`).
 * @property {number} frobeniusErrorBound - Compensated L2 norm of per-element rounding errors.
 * @property {number} overflowCount - Number of elements that overflowed to `±Infinity` in `data`.
 * @property {number} underflowCount - Number of nonzero exact products that underflowed to `0` in `data`.
 */

/**
 * Computes the numerically stable element-wise tensor (outer) product of two `Float64Array` inputs.
 *
 * Output is stored in row-major order: `out[i * b.length + j] = a[i] * b[j]`, with `-0` normalized to `+0`.
 *
 * @param {Float64Array} a - First input tensor (flattened `Float64Array` of finite numbers).
 * @param {Float64Array} b - Second input tensor (flattened `Float64Array` of finite numbers).
 * @param {TensorProductOptions} [options] - Optional configuration for normalization, scaling, shapes, and diagnostics.
 * @returns {Float64Array | TensorProductDetails} Resulting `Float64Array` (default) or `TensorProductDetails` when `options.returnDetails` is `true`.
 * @throws {TypeError} If `a` or `b` is not a `Float64Array`, or if `options` fields have invalid types.
 * @throws {RangeError} If any element is `NaN`/`±Infinity`, shapes do not match lengths, or output length exceeds bounds.
 */
export function tensorProductTypedStable(a, b, options = undefined) {
	validateFloat64Array(a, 'a');
	validateFloat64Array(b, 'b');

	let normalize = false;
	let scaled = false;
	let returnDetails = false;
	let shapeA = [a.length];
	let shapeB = [b.length];

	if (options !== undefined) {
		if (options === null || typeof options !== 'object' || Array.isArray(options)) {
			throw new TypeError('options must be a plain object');
		}
		if (options.normalize !== undefined) {
			if (typeof options.normalize !== 'boolean') {
				throw new TypeError('options.normalize must be a boolean');
			}
			normalize = options.normalize;
		}
		if (options.scaled !== undefined) {
			if (typeof options.scaled !== 'boolean') {
				throw new TypeError('options.scaled must be a boolean');
			}
			scaled = options.scaled;
		}
		if (options.returnDetails !== undefined) {
			if (typeof options.returnDetails !== 'boolean') {
				throw new TypeError('options.returnDetails must be a boolean');
			}
			returnDetails = options.returnDetails;
		}
		if (options.shapeA !== undefined) {
			shapeA = validateShape(options.shapeA, a.length, 'options.shapeA');
		}
		if (options.shapeB !== undefined) {
			shapeB = validateShape(options.shapeB, b.length, 'options.shapeB');
		}
	}

	const m = a.length;
	const n = b.length;
	const totalLength = m * n;

	if (!Number.isSafeInteger(totalLength) || totalLength > MAX_ARRAY_LENGTH) {
		throw new RangeError(`Output tensor size (${m} * ${n}) exceeds maximum Float64Array length`);
	}

	const outShape = [...shapeA, ...shapeB];

	if (totalLength === 0) {
		const empty = new Float64Array(0);
		if (!returnDetails) {
			return empty;
		}
		return {
			data: empty,
			shape: outShape,
			scaleExponent: 0,
			frobeniusNorm: 0,
			frobeniusNormMantissa: 0,
			frobeniusNormExponent: 0,
			maxAbsError: 0,
			frobeniusErrorBound: 0,
			overflowCount: 0,
			underflowCount: 0,
		};
	}

	// Prepare effective operand vectors (pre-normalized without overflow/underflow if requested).
	let vecA = a;
	let vecB = b;
	let normA = null;
	let normB = null;

	if (normalize || returnDetails) {
		normA = norm2Scaled(a);
		normB = norm2Scaled(b);
	}

	if (normalize) {
		vecA = normalizeVector(a, normA);
		vecB = normalizeVector(b, normB);
		if (returnDetails) {
			normA = norm2Scaled(vecA);
			normB = norm2Scaled(vecB);
		}
	}

	// Pre-decompose vecA and vecB into exact (mantissa, exponent) arrays when scaling or diagnostics are needed.
	let scaleExponent = 0;
	let mantA = null;
	let expA = null;
	let mantB = null;
	let expB = null;

	if (scaled || returnDetails) {
		mantA = new Float64Array(m);
		expA = new Int32Array(m);
		mantB = new Float64Array(n);
		expB = new Int32Array(n);

		let maxExpA = -Infinity;
		for (let i = 0; i < m; i++) {
			const v = vecA[i];
			if (v !== 0) {
				const d = frexp2(v);
				mantA[i] = d.mantissa;
				expA[i] = d.exponent;
				if (d.exponent > maxExpA) {
					maxExpA = d.exponent;
				}
			}
		}

		let maxExpB = -Infinity;
		for (let j = 0; j < n; j++) {
			const v = vecB[j];
			if (v !== 0) {
				const d = frexp2(v);
				mantB[j] = d.mantissa;
				expB[j] = d.exponent;
				if (d.exponent > maxExpB) {
					maxExpB = d.exponent;
				}
			}
		}

		if (scaled && maxExpA !== -Infinity && maxExpB !== -Infinity) {
			scaleExponent = maxExpA + maxExpB;
		}
	}

	const out = new Float64Array(totalLength);

	// Fast path: plain Float64Array return without scaling or diagnostics.
	// IEEE-754 multiplication of two finite doubles is guaranteed correctly rounded (<= 0.5 ULP).
	if (!scaled && !returnDetails) {
		for (let i = 0; i < m; i++) {
			const ai = vecA[i];
			const rowOffset = i * n;
			if (ai === 0) {
				// Float64Array is already zero-initialized.
				continue;
			}
			for (let j = 0; j < n; j++) {
				const prod = ai * vecB[j];
				out[rowOffset + j] = prod === 0 ? 0 : prod;
			}
		}
		return out;
	}

	// Scaled and/or diagnostic path using exact exponent arithmetic and Dekker twoProd residuals.
	let maxAbsError = 0;
	let overflowCount = 0;
	let underflowCount = 0;

	// Track per-element rounding error magnitudes for compensated Frobenius error bound.
	const errValues = returnDetails ? new Float64Array(totalLength) : null;

	for (let i = 0; i < m; i++) {
		const ai = vecA[i];
		const rowOffset = i * n;
		if (ai === 0) {
			continue;
		}
		const ma = mantA[i];
		const ea = expA[i];

		for (let j = 0; j < n; j++) {
			const bj = vecB[j];
			if (bj === 0) {
				continue;
			}
			const mb = mantB[j];
			const eb = expB[j];
			const effExp = ea + eb - scaleExponent;

			let val;
			let absErr = 0;

			if (returnDetails) {
				const [pMant, errMant] = twoProdMantissa(ma, mb);
				if (scaleExponent === 0) {
					// Directly use single-rounded hardware product for exact IEEE-754 subnormal rounding.
					const direct = ai * bj;
					val = direct === 0 ? 0 : direct;
				} else {
					val = scalePow2(pMant, effExp);
				}

				if (!Number.isFinite(val)) {
					overflowCount++;
					absErr = Infinity;
				} else if (val === 0) {
					// Nonzero factors underflowed to zero; error equals the true magnitude (or MIN_VALUE bound).
					underflowCount++;
					absErr = scalePow2(Math.abs(pMant), effExp);
					if (absErr === 0) {
						absErr = Number.MIN_VALUE;
					}
				} else if (effExp < -1020) {
					// Subnormal region: rounding error is bounded by 0.5 * MIN_VALUE (plus scaled mantissa residual).
					absErr = 0.5 * Number.MIN_VALUE + scalePow2(Math.abs(errMant), effExp);
				} else {
					absErr = scalePow2(Math.abs(errMant), effExp);
				}

				errValues[rowOffset + j] = absErr;
				if (absErr > maxAbsError) {
					maxAbsError = absErr;
				}
			} else {
				// scaled === true && returnDetails === false
				val = scalePow2(ma * mb, effExp);
			}

			out[rowOffset + j] = val;
		}
	}

	if (!returnDetails) {
		return out;
	}

	// Compute Frobenius norm ||a ⊗ b||_F = ||a||_2 * ||b||_2 in exact scaled form.
	let frobeniusNorm = 0;
	let frobeniusNormMantissa = 0;
	let frobeniusNormExponent = 0;

	if (!normA.isZero && !normB.isZero) {
		const rawProdM = normA.mantissa * normB.mantissa;
		const dNorm = frexp2(rawProdM);
		frobeniusNormMantissa = dNorm.mantissa;
		frobeniusNormExponent = normA.exponent + normB.exponent + dNorm.exponent - scaleExponent;
		frobeniusNorm = scalePow2(frobeniusNormMantissa, frobeniusNormExponent);
	}

	// Compute Frobenius error bound via scaled compensated L2 norm of per-element errors.
	let frobeniusErrorBound = 0;
	if (overflowCount > 0) {
		frobeniusErrorBound = Infinity;
	} else if (maxAbsError > 0) {
		frobeniusErrorBound = norm2Scaled(errValues).norm;
	}

	return {
		data: out,
		shape: outShape,
		scaleExponent,
		frobeniusNorm,
		frobeniusNormMantissa,
		frobeniusNormExponent,
		maxAbsError,
		frobeniusErrorBound,
		overflowCount,
		underflowCount,
	};
}
