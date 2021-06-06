export interface ISequence {
	buf: void | Buffer;
	consecutive: boolean;
	charset: string;
	chunk: string;
	index: number;
	encoding: string;
	length: number;
	pendoffset: void | number;
}
export interface IState {
	buffer: void | Buffer;
	consecutive: boolean;
	curReplace?: void | ISequence;
	encoding: void | string;
	remainder: void | undefined;
	replaces: any[];
}
