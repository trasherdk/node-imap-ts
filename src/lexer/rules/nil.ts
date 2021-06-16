import { NilToken } from "../tokens/nil";
import { ILexerRule } from "../types";

export class NilRule implements ILexerRule<null> {
	public match(content: string): null | NilToken {
		const maybeNilString = content.substr(0, 3);
		if (maybeNilString === "NIL") {
			return new NilToken(maybeNilString);
		}
		return null;
	}
}
