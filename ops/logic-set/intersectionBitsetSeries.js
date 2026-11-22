const LIMB_BITS = 30n
const LIMB_BASE = 2n ** LIMB_BITS

/**
 * Computes the set intersection of one or more arbitrary-width non-negative BigInt bitsets
 * using the dyadic characteristic-function product series.
 *
 * Each non-negative BigInt `A_i` encodes a finite subset `S_i ⊆ ℤ_{≥0}` via its binary expansion
 * `A_i = Σ_{k≥0} b_{i,k} · 2^k`, where `b_{i,k} = ⌊A_i / 2^k⌋ mod 2 ∈ {0, 1}` is the
 * characteristic function of `S_i`. The intersection `⋂_i S_i` has characteristic function
 * `Π_i b_{i,k}`, giving the exact finite dyadic series:
 *
 *     intersection(A_0, ..., A_{m-1}) = Σ_{k=0}^{K} (Π_{i=0}^{m-1} b_{i,k}) · 2^k
 *
 * To evaluate arbitrarily wide bitsets efficiently without bitwise operators, the series is
 * partitioned into radix-`2^30` blocks (`k = 30j + r`, `0 ≤ r < 30`):
 *
 *     Σ_{j≥0} ( Σ_{r=0}^{29} (Π_{i=0}^{m-1} b_{i, 30j + r}) · 2^r ) · 2^{30j}
 *
 * Both outer and inner sums terminate as soon as any operand's remaining quotient reaches zero,
 * since all higher characteristic values of that operand are identically 0.
 *
 * @param {...bigint} bitsets One or more non-negative BigInt bitsets to intersect.
 * @returns {bigint} Non-negative BigInt bitset representing the intersection of all inputs.
 * @throws {RangeError} If no bitsets are provided or if any bitset is negative.
 * @throws {TypeError} If any argument is not a `bigint`.
 */
export function intersectionBitsetSeries(...bitsets) {
	const count = bitsets.length
	if (count === 0) {
		throw new RangeError('intersectionBitsetSeries requires at least one BigInt bitset argument')
	}

	let hasZero = false
	for (let i = 0; i < count; i++) {
		const value = bitsets[i]
		if (typeof value !== 'bigint') {
			throw new TypeError(`Expected bitset at argument index ${i} to be a bigint, got ${typeof value}`)
		}
		if (value < 0n) {
			throw new RangeError(`Expected bitset at argument index ${i} to be a non-negative bigint, got ${value}`)
		}
		if (value === 0n) {
			hasZero = true
		}
	}

	if (hasZero) {
		return 0n
	}

	if (count === 1) {
		return bitsets[0]
	}

	const remaining = bitsets.slice()
	const limbs = new Array(count)
	let result = 0n
	let basePower = 1n

	while (true) {
		let anyExhausted = false
		for (let i = 0; i < count; i++) {
			const q = remaining[i]
			const limb = Number(q % LIMB_BASE)
			const next = q / LIMB_BASE
			limbs[i] = limb
			remaining[i] = next
			if (next === 0n) {
				anyExhausted = true
			}
		}

		// Inner characteristic-function product series over the 30 bits in block j:
		// Σ_{r=0}^{29} (Π_{i=0}^{count-1} b_{i, 30j + r}) * 2^r
		let limbSum = 0
		let pow2 = 1
		while (true) {
			let prod = 1
			let anyLimbZero = false
			for (let i = 0; i < count; i++) {
				const v = limbs[i]
				if (v === 0) {
					anyLimbZero = true
					break
				}
				const bit = v % 2
				prod *= bit
				limbs[i] = (v - bit) / 2
			}
			if (anyLimbZero) {
				break
			}
			if (prod === 1) {
				limbSum += pow2
			}
			pow2 *= 2
		}

		if (limbSum !== 0) {
			result += BigInt(limbSum) * basePower
		}

		if (anyExhausted) {
			break
		}

		basePower *= LIMB_BASE
	}

	return result
}
