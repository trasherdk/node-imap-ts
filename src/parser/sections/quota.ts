import { parseExpr } from "./common";

export function parseQuota(text, literals) {
	const r = parseExpr(text, literals);
	const resources = {};

	if (Array.isArray(r[1])) {
		for (let i = 0, len = r[1].length; i < len; i += 3) {
			resources[r[1][i].toLowerCase()] = {
				limit: r[1][i + 2],
				usage: r[1][i + 1],
			};
		}
	}

	return {
		resources,
		root: r[0],
	};
}

export function parseQuotaRoot(text, literals) {
	const r = parseExpr(text, literals);

	return {
		mailbox: r[0],
		roots: r.slice(1),
	};
}
