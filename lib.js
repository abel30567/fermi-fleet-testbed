export function add(a, b) {
	return a + b
}

export function distanceN(p, q) {
	if (p.length !== q.length) {
		throw new RangeError('distanceN: points must have the same length')
	}
	let sum = 0
	for (let i = 0; i < p.length; i++) {
		const diff = p[i] - q[i]
		sum += diff * diff
	}
	return Math.sqrt(sum)
}
