export function add(a, b) {
	return a + b
}

const SQRT_2PI = Math.sqrt(2 * Math.PI)

function erf(z) {
	if (z === 0) return 0
	const sign = z < 0 ? -1 : 1
	const a = Math.abs(z)
	// Abramowitz & Stegun formula 7.1.26 (max error <= 1.5e-7)
	const t = 1 / (1 + 0.3275911 * a)
	const poly =
		((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t
	const y = 1 - poly * Math.exp(-a * a)
	return sign * y
}

export function normalStats(x, mean = 0, std = 1) {
	if (typeof x !== 'number' || Number.isNaN(x)) {
		throw new RangeError('x must be a valid number')
	}
	if (typeof mean !== 'number' || !Number.isFinite(mean)) {
		throw new RangeError('mean must be a finite number')
	}
	if (typeof std !== 'number' || !Number.isFinite(std) || std <= 0) {
		throw new RangeError('std must be a positive finite number')
	}

	if (x === Infinity) return { pdf: 0, cdf: 1 }
	if (x === -Infinity) return { pdf: 0, cdf: 0 }

	const z = (x - mean) / std
	const pdf = Math.exp(-0.5 * z * z) / (std * SQRT_2PI)
	const cdf = Math.min(1, Math.max(0, 0.5 * (1 + erf(z * Math.SQRT1_2))))
	return { pdf, cdf }
}
