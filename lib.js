export function add(a, b) {
	return a + b
}

export function laplacianN(f, point, h = 1e-4) {
	const n = point.length
	const f0 = f(point)
	let sum = 0
	for (let i = 0; i < n; i++) {
		const forward = point.slice()
		const backward = point.slice()
		forward[i] += h
		backward[i] -= h
		sum += (f(forward) - 2 * f0 + f(backward)) / (h * h)
	}
	return sum
}
