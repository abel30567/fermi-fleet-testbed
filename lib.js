export function add(a, b) {
	return a + b
}

export function scalarCurl2(P, Q, x, y, h = 1e-5) {
	const dQdx = (Q(x + h, y) - Q(x - h, y)) / (2 * h)
	const dPdy = (P(x, y + h) - P(x, y - h)) / (2 * h)
	return dQdx - dPdy
}
