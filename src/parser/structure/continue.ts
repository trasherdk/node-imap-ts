import { ParsingError } from "../../errors";
import { ILexerToken, TokenTypes } from "../../lexer/types";
import { getOriginalInput } from "../utility";
import TextCode from "./text.code";

const CONTENT_TOKENS_START_INDEX = 2;

export default class ContinueResponse {
	public readonly textCode?: TextCode;
	public readonly text?: string;

	// continue-req    = "+" SP (resp-text / base64) CRLF
	// resp-text       = ["[" resp-text-code "]" SP] text
	// base64          = *(4base64-char) [base64-terminal]
	// base64-char     = ALPHA / DIGIT / "+" / "/" ; Case-sensitive
	// base64-terminal = (2base64-char "==") / (3base64-char "=")
	constructor(public readonly tokens: ILexerToken<unknown>[]) {
		if (
			tokens[0].type !== TokenTypes.operator ||
			tokens[0].getTrueValue() !== "+"
		) {
			throw new ParsingError(
				"Instantiating ContinueResponse with non-continue repsonse input",
				tokens,
			);
		}

		// Check if we have a text code, and grab it if we do
		this.textCode = TextCode.match(tokens, CONTENT_TOKENS_START_INDEX);

		// If there is a text code, the spec indicates it should be
		// followed by an SP character, then the text. So if we found
		// a code skip over it and the trailing SP. Otherwise start
		// from the top.
		const textTokens = tokens.slice(
			this.textCode
				? this.textCode.endingIndex + 2
				: CONTENT_TOKENS_START_INDEX,
		);
		if (textTokens.length) {
			// We just add the raw value to the string here because
			// everything else is just considered text, there are
			// no more things we need to parse
			this.text = getOriginalInput(textTokens);
		}
	}
}
