export function add(a, b) {
	return a + b
}

export function divergence2(P, Q, x, y, h = 1e-5) {
	const dPdx = (P(x + h, y) - P(x - h, y)) / (2 * h)
	const dQdy = (Q(x, y + h) - Q(x, y - h)) / (2 * h)
	return dPdx + dQdy
}
