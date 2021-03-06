import { LexerTokenList, TokenTypes } from "../../../lexer/types";
import { matchesFormat } from "../../utility";

export class ModSeqBodyResponse {
	constructor(public readonly modseq: number | bigint) {}
}

export function match(
	tokens: LexerTokenList,
): null | { match: ModSeqBodyResponse; length: number } {
	const isMatch = matchesFormat(tokens, [
		{ type: TokenTypes.atom, value: "MODSEQ" },
		{ sp: true },
		{ type: TokenTypes.operator, value: "(" },
		[{ type: TokenTypes.number }, { type: TokenTypes.bigint }],
		{ type: TokenTypes.operator, value: ")" },
	]);

	if (isMatch) {
		return {
			match: new ModSeqBodyResponse(
				tokens[3].getTrueValue() as number | bigint,
			),
			length: 5,
		};
	}

	return null;
}
