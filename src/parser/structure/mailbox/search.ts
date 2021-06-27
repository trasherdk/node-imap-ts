import { ParsingError } from "../../../errors";
import { NumberToken } from "../../../lexer/tokens";
import { ILexerToken } from "../../../lexer/types";
import { pairedArrayLoopGenerator } from "../../utility";

export class SearchResponse {
	public readonly results: number[];

	// From spec: "SEARCH" *(SP nz-number)
	public static match(tokens: ILexerToken<unknown>[]) {
		if (tokens[0]?.value === "SEARCH") {
			return new SearchResponse(tokens.slice(2));
		}
	}

	constructor(tokens: ILexerToken<unknown>[]) {
		this.results = [];
		// Format is number SP, and we can skip the SP tokens
		for (const [token] of pairedArrayLoopGenerator(tokens)) {
			if (!(token instanceof NumberToken) || token.getTrueValue() <= 0) {
				throw new ParsingError(
					"Searched returned invalid number value",
					tokens,
				);
			}

			this.results.push(token.getTrueValue());
		}
	}
}

export class ExtendedSearchResponse {
	public static match(tokens: ILexerToken<unknown>[]) {
		// TODO
		return null;
	}

	constructor(tokens: ILexerToken<unknown>[]) {}
}
