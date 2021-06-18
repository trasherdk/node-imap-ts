import { ILexerToken } from "../../../src/lexer/types";

export type TestSpec = {
	name: string;
	input: string;
	results:
		| {
				lexer: ILexerToken<unknown>[];
		  }
		| {
				error: Error;
		  };
};
