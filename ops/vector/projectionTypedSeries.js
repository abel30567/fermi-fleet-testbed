/**
 * Computes the closed-form orthogonal vector projection of `u` onto `v`:
 *   proj_v(u) = ((u · v) / (v · v)) * v
 *
 * Operates over `Float64Array` inputs and supports packed series of
 * `dim`-dimensional vectors stored contiguously in `u` and `v`.
 * When `dim` is omitted, the entire array is treated as a single vector
 * (`dim = u.length`).
 *
 * For extreme target vector magnitudes (`max |v_i| > 1e150` or `< 1e-150`),
 * components are scaled by `1 / max |v_i|` to prevent intermediate overflow
 * or underflow in `v · v`.
 *
 * @param {Float64Array} u - Source vector or packed series of vectors to project.
 * @param {Float64Array} v - Target vector or packed series of non-zero vectors to project onto.
 * @param {number} [dim] - Dimension of each packed vector (defaults to `u.length`).
 * @returns {Float64Array} A new `Float64Array` containing the projected vector(s).
 * @throws {TypeError} If `u` or `v` is not a `Float64Array`, or if `dim` is provided and not a number.
 * @throws {RangeError} If `u` and `v` differ in length, `dim` is not a positive integer,
 *   `u.length` is not divisible by `dim`, or any target vector in `v` is the zero vector.
 */
export function projectionTypedSeries(u, v, dim) {
	if (!(u instanceof Float64Array)) {
		throw new TypeError('Expected u to be a Float64Array')
	}
	if (!(v instanceof Float64Array)) {
		throw new TypeError('Expected v to be a Float64Array')
	}
	if (u.length !== v.length) {
		throw new RangeError(
			`Input Float64Arrays must have equal length (got ${u.length} and ${v.length})`,
		)
	}

	if (dim !== undefined) {
		if (typeof dim !== 'number') {
			throw new TypeError('Expected dim to be a positive integer')
		}
		if (!Number.isInteger(dim) || dim < 1) {
			throw new RangeError(`Expected dim to be a positive integer (got ${dim})`)
		}
	}

	const n = u.length
	if (n === 0) {
		return new Float64Array(0)
	}

	const vectorDim = dim === undefined ? n : dim
	if (n % vectorDim !== 0) {
		throw new RangeError(
			`Input length (${n}) must be a multiple of dim (${vectorDim})`,
		)
	}

	const out = new Float64Array(n)

	for (let offset = 0; offset < n; offset += vectorDim) {
		const end = offset + vectorDim

		let maxV = 0
		let hasNaN = false
		for (let i = offset; i < end; i++) {
			const av = Math.abs(v[i])
			if (Number.isNaN(av)) {
				hasNaN = true
			} else if (av > maxV) {
				maxV = av
			}
		}

		if (!hasNaN && maxV === 0) {
			throw new RangeError(
				`Target vector v at vector index ${offset / vectorDim} must not be the zero vector`,
			)
		}

		if (!hasNaN && Number.isFinite(maxV) && (maxV > 1e150 || maxV < 1e-150)) {
			const invMaxV = 1 / maxV
			let dotUV = 0
			let dotVV = 0
			for (let i = offset; i < end; i++) {
				const vn = v[i] * invMaxV
				dotUV += u[i] * vn
				dotVV += vn * vn
			}
			const scale = dotUV / dotVV
			for (let i = offset; i < end; i++) {
				const val = scale * (v[i] * invMaxV)
				out[i] = val === 0 ? 0 : val
			}
		} else {
			let dotUV = 0
			let dotVV = 0
			for (let i = offset; i < end; i++) {
				const vi = v[i]
				dotUV += u[i] * vi
				dotVV += vi * vi
			}
			const scale = dotUV / dotVV
			for (let i = offset; i < end; i++) {
				const val = scale * v[i]
				out[i] = val === 0 ? 0 : val
			}
		}
	}

	return out
}
