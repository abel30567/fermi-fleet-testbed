const SCALE = 10n ** 18n
const GUARD = 10n ** 22n
const WORK_SCALE = SCALE * GUARD

/**
 * Compute artanh(p / q) scaled by `workScale` via the Taylor series:
 *   artanh(z) = sum_{j=0..inf} z^(2j+1) / (2j + 1)
 * where 0 <= p < q.
 *
 * @param {bigint} p Non-negative numerator (p < q).
 * @param {bigint} q Positive denominator.
 * @param {bigint} workScale Fixed-point scaling factor.
 * @returns {bigint} Fixed-point approximation of artanh(p / q) * workScale.
 */
function artanhRational(p, q, workScale) {
	const p2 = p * p
	const q2 = q * q
	let power = (p * workScale) / q
	let sum = 0n
	for (let denom = 1n; power > 0n; denom += 2n) {
		const term = power / denom
		if (term === 0n) break
		sum += term
		power = (power * p2) / q2
	}
	return sum
}

/**
 * Compute artanh(z) scaled by `workScale` for a pre-scaled fixed-point argument
 * `zFp = round(z * workScale)` with 0 <= zFp < workScale.
 *
 * @param {bigint} zFp Fixed-point representation of z scaled by `workScale`.
 * @param {bigint} workScale Fixed-point scaling factor.
 * @returns {bigint} Fixed-point approximation of artanh(z) * workScale.
 */
function artanhScaled(zFp, workScale) {
	if (zFp === 0n) return 0n
	const z2 = (zFp * zFp + workScale / 2n) / workScale
	let power = zFp
	let sum = 0n
	for (let denom = 1n; power > 0n; denom += 2n) {
		const term = power / denom
		if (term === 0n) break
		sum += term
		power = (power * z2) / workScale
	}
	return sum
}

/**
 * Return floor(log2(n)) for a positive BigInt n using its hexadecimal bit length.
 *
 * @param {bigint} n Positive BigInt.
 * @returns {number} Integer floor(log2(n)).
 */
function floorLog2(n) {
	const hex = n.toString(16)
	const topNibble = parseInt(hex[0], 16)
	const topBits = 32 - Math.clz32(topNibble)
	return (hex.length - 1) * 4 + topBits - 1
}

// Precompute ln(2) * WORK_SCALE via the identity 2 = (4/3)^2 * (9/8):
//   ln(2) = 2 * ln(4/3) + ln(9/8) = 4 * artanh(1/7) + 2 * artanh(1/17)
const LN2_WORK =
	4n * artanhRational(1n, 7n, WORK_SCALE) +
	2n * artanhRational(1n, 17n, WORK_SCALE)

/**
 * Compute the base-2 logarithm of a positive exact BigInt integer, returned as a
 * fixed-point BigInt scaled by 10^18 (i.e. round(log2(n) * 10^18)).
 *
 * Exact powers of two return `k * 10^18` directly via bit-length identity.
 * General positive integers use range reduction `n = 2^e * m` with
 * `m in (1/sqrt(2), sqrt(2)]` and the artanh series identity:
 *   log2(n) = e + (2 / ln(2)) * artanh((m - 1) / (m + 1))
 * evaluated in high-precision BigInt arithmetic (40 decimal digits internally)
 * before rounding to 10^18.
 *
 * @param {bigint} n Positive BigInt integer (n > 0n).
 * @returns {bigint} Fixed-point BigInt representing round(log2(n) * 10^18).
 * @throws {TypeError} If `n` is not a BigInt.
 * @throws {RangeError} If `n <= 0n`.
 */
export function log2BigIntSeries(n) {
	if (typeof n !== 'bigint') {
		throw new TypeError(`Expected a BigInt argument, received ${typeof n}`)
	}
	if (n <= 0n) {
		throw new RangeError('Expected a positive BigInt (> 0n)')
	}

	const k = floorLog2(n)

	// Closed-form exact path for powers of two: log2(2^k) = k
	if ((n & (n - 1n)) === 0n) {
		return BigInt(k) * SCALE
	}

	// Range-reduce n = 2^e * m so that m is near 1 (|z| < 0.172)
	const pow2k = 1n << BigInt(k)
	let e = k
	let base = pow2k
	if (n * 1000n > 1414n * pow2k) {
		e = k + 1
		base = pow2k << 1n
	}

	const p = n - base
	const q = n + base
	const neg = p < 0n
	const absP = neg ? -p : p

	const zFp = (absP * WORK_SCALE + q / 2n) / q
	const lnRatioWork = 2n * artanhScaled(zFp, WORK_SCALE)
	const fracLog2Work = (lnRatioWork * WORK_SCALE + LN2_WORK / 2n) / LN2_WORK

	const totalWork = BigInt(e) * WORK_SCALE + (neg ? -fracLog2Work : fracLog2Work)
	return (totalWork + GUARD / 2n) / GUARD
}
