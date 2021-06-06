import { InvalidParsedDataError } from "../../errors";
import { utf7 } from "../encoding";
import { parseExpr } from "./common";

type Box = {
	delimiter: string;
	flags: string[];
	name: string;
};

type Namespace = {
	delimiter: string;
	extensions: undefined | Record<string, number | string | string[]>;
	prefix: string;
};

export function parseBoxList(text, literals): Box {
	const [flags, delimiter, name, ...cruft] = parseExpr(text, literals);

	// Make sure the items we got back are what we expect
	if (
		!Array.isArray(flags) ||
		typeof delimiter !== "string" ||
		!(typeof name === "string" || typeof name === "number") ||
		cruft.length
	) {
		throw new InvalidParsedDataError(
			["Array", "string", "string | number"],
			[
				typeof flags,
				typeof delimiter,
				typeof name,
				`${cruft.length} extra data`,
			],
		);
	}

	return {
		delimiter,
		flags,
		name: utf7.decode("" + name),
	};
}

export function parseNamespaces(text, literals) {
	const parsed = parseExpr(text, literals);
	const collected: Namespace[][] = [];

	for (let n = 0; n < 3; ++n) {
		const block = parsed[n];
		if (Array.isArray(block)) {
			const namespaces: Namespace[] = [];
			for (let i = 0, len = block.length; i < len; ++i) {
				const [prefix, delimiter, ...extentions] = block[i];
				const nsobj: Namespace = {
					delimiter,
					extensions: undefined,
					prefix,
				};
				if (extentions.length) {
					nsobj.extensions = {};
				}
				for (let e = 0; e < extentions.length; e += 2) {
					nsobj.extensions[extentions[e]] = extentions[e + 1];
				}
				namespaces.push(nsobj);
			}
			collected[n] = namespaces;
		}
	}

	return {
		other: collected[1],
		personal: collected[0],
		shared: collected[2],
	};
}
