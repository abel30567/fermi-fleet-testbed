export function add(a, b) {
	return a + b
}

export function vecNorm(v, p = 2) {
	if (!Array.isArray(v)) {
		throw new TypeError('Expected v to be an array')
	}
	if (typeof p !== 'number' || !(p > 0)) {
		throw new RangeError('Expected p to be a positive number or Infinity')
	}
	if (v.length === 0) {
		return 0
	}

	let maxAbs = 0
	for (let i = 0; i < v.length; i++) {
		const abs = Math.abs(v[i])
		if (Number.isNaN(abs)) return NaN
		if (abs > maxAbs) maxAbs = abs
	}

	if (maxAbs === 0) return 0
	if (maxAbs === Infinity || p === Infinity) return maxAbs

	if (p === 1) {
		let sum = 0
		for (let i = 0; i < v.length; i++) {
			sum += Math.abs(v[i])
		}
		return sum
	}

	let sum = 0
	for (let i = 0; i < v.length; i++) {
		const scaled = Math.abs(v[i]) / maxAbs
		sum += p === 2 ? scaled * scaled : Math.pow(scaled, p)
	}

	return maxAbs * (p === 2 ? Math.sqrt(sum) : Math.pow(sum, 1 / p))
}
