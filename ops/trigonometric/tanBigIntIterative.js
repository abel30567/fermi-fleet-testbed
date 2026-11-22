/**
 * Fixed-point scale factor (`10^18`) for both input radians and output tangent values.
 *
 * A BigInt value `v` represents the real number `v / 10^18`.
 *
 * @type {bigint}
 */
const SCALE = 10n ** 18n

/**
 * Guard precision multiplier (`10^62`), giving 80 total fractional decimal digits
 * (`WORK_SCALE = 10^80`) during range reduction and Taylor series evaluation.
 *
 * @type {bigint}
 */
const GUARD_SCALE = 10n ** 62n

/**
 * Internal working fixed-point scale (`10^80`).
 *
 * @type {bigint}
 */
const WORK_SCALE = SCALE * GUARD_SCALE

/**
 * Square of the internal working scale (`10^160`), used in Taylor term updates.
 *
 * @type {bigint}
 */
const WORK_SCALE_SQ = WORK_SCALE * WORK_SCALE

/**
 * Pi scaled by `WORK_SCALE` (`10^80`), rounded to nearest integer.
 * Exact value ends in `...6208998628...`, rounding to `...620900` (divisible by 4).
 *
 * @type {bigint}
 */
const PI_WORK =
	314159265358979323846264338327950288419716939937510582097494459230781640628620900n

/**
 * `pi / 2` scaled by `WORK_SCALE` (`10^80`).
 *
 * @type {bigint}
 */
const HALF_PI_WORK = PI_WORK / 2n

/**
 * `pi / 4` scaled by `WORK_SCALE` (`10^80`).
 *
 * @type {bigint}
 */
const QUARTER_PI_WORK = PI_WORK / 4n

/**
 * Computes the trigonometric tangent `tan(x)` over exact BigInt fixed-point numbers
 * using a straightforward iterative sin/cos Taylor series with guard digits.
 *
 * Both input and output use fixed-point BigInt representation scaled by `10^18`:
 * - Input `x` represents the angle `x / 10^18` in radians (for example, `0n` is `0` rad
 *   and `785398163397448310n` is approximately `pi / 4` rad).
 * - Output represents `tan(x / 10^18) * 10^18`, rounded half away from zero to preserve
 *   exact odd symmetry `tanBigIntIterative(-x) === -tanBigIntIterative(x)`.
 *
 * Algorithm:
 * 1. Validate that `x` is a `BigInt`.
 * 2. Extract the sign via odd symmetry (`tan(-x) = -tan(x)`) and scale `|x|` to
 *    80 fractional decimal digits (`10^80`, i.e., 62 guard digits).
 * 3. Reduce modulo `pi` into `[-pi/2, pi/2]`, fold negative values via odd symmetry
 *    into `[0, pi/2]`, and apply the co-function identity `sin(pi/2 - u) = cos(u)`,
 *    `cos(pi/2 - u) = sin(u)` to map the evaluation point `u` into `[0, pi/4]`.
 *    This guarantees fast Taylor convergence and eliminates cancellation near poles.
 * 4. Iteratively accumulate the Maclaurin series for `sin(u)` and `cos(u)` until
 *    successive terms vanish at `10^80` working precision.
 * 5. Reject poles where `cos(x)` rounds to `0` at the `10^18` fixed-point resolution
 *    (`|cos(x)| <= 0.5 * 10^-18`, i.e., the closest fixed-point grid point to `(k + 1/2) * pi`).
 * 6. Return `round(sin(x) * 10^18 / cos(x))` with the restored sign.
 *
 * @param {bigint} x Angle in fixed-point radians scaled by `10n ** 18n`.
 * @returns {bigint} Tangent `tan(x / 10^18)` in fixed-point BigInt scaled by `10n ** 18n`.
 * @throws {TypeError} If `x` is not a `BigInt`.
 * @throws {RangeError} If `x` lies at a tangent pole where `cos(x) = 0` at `10^18` precision.
 */
export function tanBigIntIterative(x) {
	if (typeof x !== 'bigint') {
		throw new TypeError(`Expected a BigInt argument, received ${typeof x}`)
	}

	if (x === 0n) {
		return 0n
	}

	// Preserve exact odd symmetry: tan(-x) = -tan(x).
	let sign = x < 0n ? -1n : 1n
	const absX = x < 0n ? -x : x

	// Lift input to working precision and reduce modulo pi into [-pi/2, pi/2).
	const xWork = absX * GUARD_SCALE
	const k = (xWork + HALF_PI_WORK) / PI_WORK
	let r = xWork - k * PI_WORK

	if (r < 0n) {
		sign = -sign
		r = -r
	}

	// Fold [pi/4, pi/2] to [0, pi/4] using sin(pi/2 - u) = cos(u), cos(pi/2 - u) = sin(u).
	const useComplement = r > QUARTER_PI_WORK
	const u = useComplement ? HALF_PI_WORK - r : r

	// Straightforward iterative Maclaurin series for sin(u) and cos(u) on u in [0, pi/4].
	const u2 = u * u
	let sinSum = u
	let cosSum = WORK_SCALE
	let termSin = u
	let termCos = WORK_SCALE

	for (let n = 1n; ; n++) {
		const twoN = 2n * n
		termCos = -(termCos * u2) / (WORK_SCALE_SQ * (twoN - 1n) * twoN)
		termSin = -(termSin * u2) / (WORK_SCALE_SQ * twoN * (twoN + 1n))
		if (termCos === 0n && termSin === 0n) {
			break
		}
		cosSum += termCos
		sinSum += termSin
	}

	const sinVal = useComplement ? cosSum : sinSum
	const cosVal = useComplement ? sinSum : cosSum

	// Reject poles where cos(x) equals 0 at the 10^18 fixed-point resolution.
	const absCos = cosVal < 0n ? -cosVal : cosVal
	if (absCos === 0n || absCos * 2n <= GUARD_SCALE) {
		throw new RangeError('Tangent is undefined at poles where cos(x) = 0')
	}

	// Divide sin(x) / cos(x) at full working precision and round half away from zero.
	const numerator = sinVal * SCALE
	const absResult = (numerator + cosVal / 2n) / cosVal
	return sign < 0n ? -absResult : absResult
}
