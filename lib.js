export function add(a, b) {
	return a + b
}

const LANCZOS_G = 7
const LANCZOS_COEFFICIENTS = [
	0.99999999999980993,
	676.5203681218851,
	-1259.1392167224028,
	771.32342877765313,
	-176.61502916214059,
	12.507343278686905,
	-0.13857109526572012,
	9.9843695780195716e-6,
	1.5056327351493116e-7,
]

export function gammaLanczos(z) {
	if (typeof z !== 'number' || Number.isNaN(z) || z <= 0) {
		throw new RangeError('z must be a positive real number')
	}
	if (z === Infinity) {
		return Infinity
	}
	if (z < 0.5) {
		return Math.PI / (Math.sin(Math.PI * z) * gammaLanczos(1 - z))
	}

	const x = z - 1
	let a = LANCZOS_COEFFICIENTS[0]
	for (let i = 1; i < LANCZOS_COEFFICIENTS.length; i++) {
		a += LANCZOS_COEFFICIENTS[i] / (x + i)
	}

	const t = x + LANCZOS_G + 0.5
	const logGamma = 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a)
	return Math.exp(logGamma)
}
