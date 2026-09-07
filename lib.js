export function add(a, b) {
	return a + b
}

export function gradientN(f, point, h = 1e-5) {
	return point.map((_, i) => {
		const forward = point.slice()
		const backward = point.slice()
		forward[i] += h
		backward[i] -= h
		return (f(forward) - f(backward)) / (2 * h)
	})
}
