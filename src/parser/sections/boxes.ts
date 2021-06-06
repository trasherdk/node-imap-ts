import { utf7 } from "../encoding";
import { parseExpr } from "./common";

export function parseBoxList(text, literals) {
	const r = parseExpr(text, literals);
	return {
		delimiter: r[1],
		flags: r[0],
		name: utf7.decode("" + r[2]),
	};
}

export function parseNamespaces(text, literals) {
	const r = parseExpr(text, literals);
	let i;
	let len;
	let j;
	let len2;
	let ns;
	let nsobj;
	let namespaces;
	let n;

	for (n = 0; n < 3; ++n) {
		if (r[n]) {
			namespaces = [];
			for (i = 0, len = r[n].length; i < len; ++i) {
				ns = r[n][i];
				nsobj = {
					delimiter: ns[1],
					extensions: undefined,
					prefix: ns[0],
				};
				if (ns.length > 2) {
					nsobj.extensions = {};
				}
				for (j = 2, len2 = ns.length; j < len2; j += 2) {
					nsobj.extensions[ns[j]] = ns[j + 1];
				}
				namespaces.push(nsobj);
			}
			r[n] = namespaces;
		}
	}

	return {
		other: r[1],
		personal: r[0],
		shared: r[2],
	};
}
