/**
 * @typedef {Object} DualNumber
 * @property {number} v - Primal value component (finite real number).
 * @property {number} d - Forward-mode derivative (tangent) component (finite real number).
 */

const VALID_MODES = new Set(['full', 'same', 'valid'])

/**
 * Normalize -0 to +0 for deterministic numeric outputs.
 *
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x
}

/**
 * Validate a dual-number sequence and split it into primal and tangent real arrays.
 *
 * @param {unknown} seq
 * @param {string} name
 * @returns {{ v: number[], d: number[] }}
 */
function validateDualSequence(seq, name) {
	if (!Array.isArray(seq)) {
		throw new TypeError(`${name} must be an array of dual numbers { v, d }`)
	}
	if (seq.length === 0) {
		throw new RangeError(`${name} must be a non-empty array`)
	}

	const v = new Array(seq.length)
	const d = new Array(seq.length)

	for (let i = 0; i < seq.length; i++) {
		const item = seq[i]
		if (item === null || typeof item !== 'object' || Array.isArray(item)) {
			throw new TypeError(`${name}[${i}] must be a dual number object { v, d }`)
		}
		if (typeof item.v !== 'number' || typeof item.d !== 'number') {
			throw new TypeError(`${name}[${i}].v and ${name}[${i}].d must be numbers`)
		}
		if (!Number.isFinite(item.v) || !Number.isFinite(item.d)) {
			throw new RangeError(`${name}[${i}].v and ${name}[${i}].d must be finite numbers`)
		}
		v[i] = item.v
		d[i] = item.d
	}

	return { v, d }
}

/**
 * Discrete full linear convolution (Cauchy product) of two real sequences.
 *
 * @param {number[]} u
 * @param {number[]} w
 * @returns {number[]}
 */
function convolveRealFull(u, w) {
	const m = u.length
	const n = w.length
	const out = new Array(m + n - 1).fill(0)

	for (let i = 0; i < m; i++) {
		const ui = u[i]
		if (ui === 0) continue
		for (let j = 0; j < n; j++) {
			out[i + j] += ui * w[j]
		}
	}

	return out
}

/**
 * Compute the discrete linear convolution of two sequences of dual numbers `{ v, d }`
 * using the formal power series (Cauchy product) identity over the dual-number ring
 * R[e]/(e^2):
 *
 *   A(x) = A_v(x) + e * A_d(x)
 *   B(x) = B_v(x) + e * B_d(x)
 *   (A * B)(x) = (A_v * B_v)(x) + e * ((A_v * B_d)(x) + (A_d * B_v)(x))
 *
 * Supported modes:
 * - `'full'` (default): full discrete linear convolution of length `a.length + b.length - 1`.
 * - `'same'`: central slice of length `a.length`, starting at `Math.floor((b.length - 1) / 2)`.
 * - `'valid'`: fully overlapping slice of length `Math.max(a.length, b.length) - Math.min(a.length, b.length) + 1`,
 *   starting at `Math.min(a.length, b.length) - 1`.
 *
 * @param {DualNumber[]} a - First non-empty sequence of dual numbers `{ v, d }`.
 * @param {DualNumber[]} b - Second non-empty sequence of dual numbers `{ v, d }`.
 * @param {'full' | 'same' | 'valid'} [mode='full'] - Convolution output mode.
 * @returns {DualNumber[]} Convolved sequence of dual numbers `{ v, d }`.
 */
export function convolutionDualSeries(a, b, mode = 'full') {
	const seqA = validateDualSequence(a, 'a')
	const seqB = validateDualSequence(b, 'b')

	if (typeof mode !== 'string') {
		throw new TypeError("mode must be a string ('full', 'same', or 'valid')")
	}
	if (!VALID_MODES.has(mode)) {
		throw new RangeError(`Unsupported mode "${mode}"; expected 'full', 'same', or 'valid'`)
	}

	const m = seqA.v.length
	const n = seqB.v.length

	// Closed-form series / Cauchy product identity:
	//   c_v = a_v * b_v
	//   c_d = a_v * b_d + a_d * b_v
	const cv = convolveRealFull(seqA.v, seqB.v)
	const avBd = convolveRealFull(seqA.v, seqB.d)
	const adBv = convolveRealFull(seqA.d, seqB.v)

	let start = 0
	let length = m + n - 1

	if (mode === 'same') {
		start = Math.floor((n - 1) / 2)
		length = m
	} else if (mode === 'valid') {
		const minLen = Math.min(m, n)
		const maxLen = Math.max(m, n)
		start = minLen - 1
		length = maxLen - minLen + 1
	}

	const result = new Array(length)
	for (let k = 0; k < length; k++) {
		const idx = start + k
		result[k] = {
			v: normalizeZero(cv[idx]),
			d: normalizeZero(avBd[idx] + adBv[idx]),
		}
	}

	return result
}
