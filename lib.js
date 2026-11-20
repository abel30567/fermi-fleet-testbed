export function add(a, b) {
	return a + b
}

const LANCZOS_G = 7
const LANCZOS_P = [
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
const HALF_LOG_2PI = 0.5 * Math.log(2 * Math.PI)

function logGamma(z) {
	if (z < 0.5) {
		return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z)
	}
	const zm1 = z - 1
	let sum = LANCZOS_P[0]
	for (let i = 1; i < LANCZOS_P.length; i++) {
		sum += LANCZOS_P[i] / (zm1 + i)
	}
	const t = zm1 + LANCZOS_G + 0.5
	return HALF_LOG_2PI + (zm1 + 0.5) * Math.log(t) - t + Math.log(sum)
}

export function betaFunction(x, y) {
	if (
		typeof x !== 'number' ||
		typeof y !== 'number' ||
		!Number.isFinite(x) ||
		!Number.isFinite(y) ||
		x <= 0 ||
		y <= 0
	) {
		throw new RangeError('betaFunction requires finite positive numbers x and y')
	}
	return Math.exp(logGamma(x) + logGamma(y) - logGamma(x + y))
}
