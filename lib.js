export function add(a, b) {
	return a + b
}

export function jacobianN(F, point, h = 1e-5) {
	const m = F(point).length
	const n = point.length
	const J = Array.from({ length: m }, () => new Array(n).fill(0))
	for (let j = 0; j < n; j++) {
		const forward = point.slice()
		const backward = point.slice()
		forward[j] += h
		backward[j] -= h
		const fForward = F(forward)
		const fBackward = F(backward)
		for (let i = 0; i < m; i++) {
			J[i][j] = (fForward[i] - fBackward[i]) / (2 * h)
		}
	}
	return J
}
