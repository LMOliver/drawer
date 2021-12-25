export declare class UserInputError extends Error { }
type EReal = { readonly type: 'real', readonly min: number, readonly max: number; };
type EInteger = { readonly type: 'integer', readonly min: number, readonly max: number; };
type EBoolean = { readonly type: 'boolean'; };
type EString = { readonly type: 'string', readonly pattern?: RegExp; };
type EObject<entires extends { readonly [key: string]: EValue; }> = { readonly type: 'object', readonly entires: entires; };
type EArray<item extends EValue> = { readonly type: 'array', readonly maxLength: number, readonly item: item; };
type EUnion<branches extends readonly EValue[]> = { readonly type: 'union', readonly branches: branches; };
type Constant = number | null | undefined | string | boolean;
type EConstant<T extends Constant> = { readonly type: 'constant', readonly value: T; };
type EDict<T extends EValue> = { readonly type: 'dict', readonly value: T; };
type EChecker<T> = (value: unknown) => T;
type EValue = EReal | EInteger | EBoolean | EString | EObject<{ readonly [key: string]: EValue; }> | EArray<any> | EUnion<readonly EValue[]> | EChecker<any> | EConstant<Constant> | EDict<any>;

type ETransform<E extends EValue>
	=
	E extends EChecker<infer T> ? T :
	E extends EInteger | EReal | EBoolean | EString
	? { real: number, integer: number, boolean: boolean, string: string; }[E['type']]
	: E extends EObject<infer entires> ? { [key in keyof entires]: ETransform<entires[key]> }
	: E extends EArray<infer item> ? ETransform<item>[]
	: E extends EConstant<infer value> ? value
	: E extends EDict<infer value> ? { [x: string]: ETransform<value>; }
	: ETransform<E extends EUnion<infer branches> ? branches[number] : never>;

type Test1 = ETransform<{ type: 'array'; maxLength: 5, item: { type: 'object', entires: { a: { type: 'boolean'; }; }; }; }>;

export declare function ensure<T extends EValue>(type: T): (value: unknown) => ETransform<T>;
export declare function ensureUUID(value: unknown): string;