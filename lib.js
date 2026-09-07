export function add(a, b) {
	return a + b
}

export function partialI(f, point, i, h = 1e-5) {
	const forward = point.slice()
	const backward = point.slice()
	forward[i] += h
	backward[i] -= h
	return (f(forward) - f(backward)) / (2 * h)
}
