import { LITPLACEHOLDER } from "../constants";
import { utf7 } from "../encoding";
import { RE_INTEGER } from "../matchers";

type ExpressionEntry = number | string | string[];
type ParsedExpression = ExpressionEntry[];

export function parseExpr(
	input: string,
	literals?: string[],
): ParsedExpression {
	const results: ParsedExpression = [];
	parseExpression({ str: input }, literals || [], results, true);
	return results;
}

function parseExpression(
	o: { str: string },
	literals: string[],
	result: ParsedExpression,
	isTop: boolean = false,
	start: number = 0,
	useBrackets: boolean = true,
) {
	let inQuote = false;
	let lastPos = start - 1;
	let isBody = false;
	let escaping = false;
	let val;

	for (let i = start, len = o.str.length; i < len; ++i) {
		if (!inQuote) {
			if (isBody) {
				if (o.str[i] === "]") {
					val = convStr(
						o.str.substring(lastPos + 1, i + 1),
						literals,
					);
					result.push(val);
					lastPos = i;
					isBody = false;
				}
			} else if (o.str[i] === '"') {
				inQuote = true;
			} else if (
				o.str[i] === " " ||
				o.str[i] === ")" ||
				(useBrackets && o.str[i] === "]")
			) {
				if (i - (lastPos + 1) > 0) {
					val = convStr(o.str.substring(lastPos + 1, i), literals);
					result.push(val);
				}
				if (
					(o.str[i] === ")" || (useBrackets && o.str[i] === "]")) &&
					!isTop
				) {
					return i;
				}
				lastPos = i;
			} else if (o.str[i] === "(" || (useBrackets && o.str[i] === "[")) {
				if (
					o.str[i] === "[" &&
					i - 4 >= start &&
					o.str.substring(i - 4, i).toUpperCase() === "BODY"
				) {
					isBody = true;
					lastPos = i - 5;
				} else {
					const innerResult: string[] = [];
					i = parseExpression(
						o,
						literals,
						innerResult,
						false,
						i + 1,
						useBrackets,
					);
					lastPos = i;
					result.push(innerResult);
				}
			}
		} else if (o.str[i] === "\\") {
			escaping = !escaping;
		} else if (o.str[i] === '"') {
			if (!escaping) {
				inQuote = false;
			}
			escaping = false;
		}
		if (i + 1 === len && len - (lastPos + 1) > 0) {
			result.push(convStr(o.str.substring(lastPos + 1), literals));
		}
	}
	return start;
}

export function parseId(text, literals): Record<string, string> {
	const parsed = parseExpr(text, literals);
	const id: Record<string, string> = {};
	const idAttrs = parsed[0];

	if (!Array.isArray(idAttrs)) {
		return null;
	}
	for (let i = 0, len = idAttrs.length; i < len; i += 2) {
		id[idAttrs[i].toLowerCase()] = idAttrs[i + 1];
	}

	return id;
}

type TextCode =
	| string
	| {
			key: number | string;
			val: ExpressionEntry | ParsedExpression;
	  };

export function parseTextCode(text: string, literals: string[]): TextCode {
	const parsed = parseExpr(text, literals);

	const key = parsed[0];
	const val = parsed.slice(1);

	if (Array.isArray(key) || typeof key === "number") {
		throw new Error(`Cannot parse text code from string: ${text}`);
	}

	if (!val.length) {
		return key;
	}

	return {
		key,
		val: val.length === 1 ? val[0] : val,
	};
}

export function parseStatus(text, literals) {
	const parsed = parseExpr(text, literals);
	const attrs = {};
	const keyValPairs = parsed[1];

	if (Array.isArray(keyValPairs)) {
		// keyValPairs is [KEY1, VAL1, KEY2, VAL2, .... KEYn, VALn]
		for (let i = 0, len = keyValPairs.length; i < len; i += 2) {
			attrs[keyValPairs[i].toLowerCase()] = keyValPairs[i + 1];
		}
	}
	return {
		attrs,
		name: utf7.decode("" + parsed[0]),
	};
}

function convStr(str: string, literals: string[]) {
	if (str[0] === '"') {
		str = str.substring(1, str.length - 1);
		let newstr = "";
		let isEscaping = false;
		let p = 0;
		for (let i = 0, len = str.length; i < len; ++i) {
			if (str[i] === "\\") {
				if (!isEscaping) {
					isEscaping = true;
				} else {
					isEscaping = false;
					newstr += str.substring(p, i - 1);
					p = i;
				}
			} else if (str[i] === '"') {
				if (isEscaping) {
					isEscaping = false;
					newstr += str.substring(p, i - 1);
					p = i;
				}
			}
		}
		if (p === 0) {
			return str;
		} else {
			newstr += str.substring(p);
			return newstr;
		}
	} else if (str === "NIL") {
		return null;
	} else if (RE_INTEGER.test(str)) {
		// some IMAP extensions utilize large (64-bit) integers, which JavaScript
		// can't handle natively, so we'll just keep it as a string if it's too big
		const val = parseInt(str, 10);
		return val.toString() === str ? val : str;
	} else if (literals && literals.length && str === LITPLACEHOLDER) {
		let l = literals.shift();
		if (Buffer.isBuffer(l)) {
			l = l.toString("utf8");
		}
		return l;
	}

	return str;
}
