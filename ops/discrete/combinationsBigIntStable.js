/**
 * Computes the greatest common divisor of two non-negative BigInts
 * using the iterative Euclidean algorithm.
 *
 * @param {bigint} a - Non-negative BigInt.
 * @param {bigint} b - Non-negative BigInt.
 * @returns {bigint} Greatest common divisor of `a` and `b`.
 */
function gcdBigInt(a, b) {
	let x = a
	let y = b
	while (y !== 0n) {
		const r = x % y
		x = y
		y = r
	}
	return x
}

/**
 * Computes the exact binomial coefficient C(n, k) = n! / (k! * (n - k)!) over BigInt.
 *
 * Exploits symmetry `r = min(k, n - k)` to minimize iterations and cancels
 * `gcd(n - r + i, i)` at each multiplicative step before dividing and multiplying,
 * ensuring every intermediate value remains exact and bounded above by C(n, k)
 * without intermediate factorial blowup.
 *
 * @param {bigint} n - Total number of items (must be a non-negative BigInt).
 * @param {bigint} k - Number of chosen items (must be a non-negative BigInt).
 * @returns {bigint} Exact binomial coefficient C(n, k), or `0n` when `k > n`.
 * @throws {TypeError} If `n` or `k` is not a BigInt.
 * @throws {RangeError} If `n < 0n` or `k < 0n`.
 */
export function combinationsBigIntStable(n, k) {
	if (typeof n !== 'bigint') {
		throw new TypeError(`Expected n to be a BigInt, got ${typeof n}`)
	}
	if (typeof k !== 'bigint') {
		throw new TypeError(`Expected k to be a BigInt, got ${typeof k}`)
	}
	if (n < 0n) {
		throw new RangeError(`Expected n to be non-negative, got ${n}`)
	}
	if (k < 0n) {
		throw new RangeError(`Expected k to be non-negative, got ${k}`)
	}

	if (k > n) {
		return 0n
	}
	if (k === 0n || k === n) {
		return 1n
	}

	const diff = n - k
	const r = k > diff ? diff : k
	if (r === 1n) {
		return n
	}

	// Compute product_{i=1..r} (n - r + i) / i.
	// At step i, result equals C(n - r + i - 1, i - 1).
	// Letting g = gcd(num, i), numReduced = num / g and denReduced = i / g are coprime;
	// since result * numReduced / denReduced = C(n - r + i, i) is an integer,
	// denReduced divides result exactly by Euclid's lemma.
	let result = 1n
	const base = n - r
	for (let i = 1n; i <= r; i += 1n) {
		const num = base + i
		const g = gcdBigInt(num, i)
		const denReduced = i / g
		if (denReduced !== 1n) {
			result /= denReduced
		}
		result *= num / g
	}

	return result
}
