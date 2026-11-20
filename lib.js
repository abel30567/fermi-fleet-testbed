export function add(a, b) {
	return a + b
}

export function dft1D(signal) {
	if (!Array.isArray(signal)) {
		throw new TypeError('signal must be an array of finite numbers')
	}

	const n = signal.length
	if (n === 0) {
		return []
	}

	for (let i = 0; i < n; i++) {
		if (typeof signal[i] !== 'number' || !Number.isFinite(signal[i])) {
			throw new TypeError(`signal[${i}] must be a finite number`)
		}
	}

	const result = new Array(n)
	const twoPiOverN = (2 * Math.PI) / n

	for (let k = 0; k < n; k++) {
		let re = 0
		let im = 0
		const baseAngle = twoPiOverN * k

		for (let t = 0; t < n; t++) {
			const angle = baseAngle * t
			const sample = signal[t]
			re += sample * Math.cos(angle)
			im -= sample * Math.sin(angle)
		}

		result[k] = {
			re: re === 0 ? 0 : re,
			im: im === 0 ? 0 : im,
		}
	}

	return result
}
