export type NodeType =
    | "Program"
    | "ImportDeclaration"
    | "FunctionDeclaration"
    | "StructDeclaration"
    | "EnumDeclaration"
    | "UnionDeclaration"
    | "VariableDeclaration"
    | "Block"
    | "BinaryExpression"
    | "UnaryExpression"
    | "CallExpression"
    | "MemberExpression"
    | "Identifier"
    | "Literal"
    | "IfExpression"
    | "MatchExpression"
    | "MatchArm"
    | "GenericInstantiation"
    | "StructInitialization"
    | "AnonymousStruct"
    | "TypeReference"
    | "ReturnStatement"
    | "Assignment"
    | "TraitDeclaration"
    | "TraitImplementation"
    | "RequireStatement"
    | "DeferStatement"
    | "RawZigBlock"
    | "MacroDeclaration"
    | "MacroInvocation";

export interface Node {
    type: NodeType;
}

export interface Program extends Node {
    type: "Program";
    body: (ImportDeclaration | TopLevelDeclaration)[];
}

export type TopLevelDeclaration =
    | FunctionDeclaration
    | StructDeclaration
    | EnumDeclaration
    | UnionDeclaration
    | TraitDeclaration
    | TraitImplementation
    | MacroDeclaration;

export interface ImportDeclaration extends Node {
    type: "ImportDeclaration";
    module: string;
}

export interface FunctionDeclaration extends Node {
    type: "FunctionDeclaration";
    modifiers?: string[];
    name: string;
    params: Parameter[];
    returnType?: Type;
    body: Expression | Block;
}

export interface StructDeclaration extends Node {
    type: "StructDeclaration";
    modifiers?: string[];
    name: string;
    fields: Field[];
}

export interface Field {
    name: string;
    type: Type;
}

export interface EnumDeclaration extends Node {
    type: "EnumDeclaration";
    modifiers?: string[];
    name: string;
    variants: string[];
}

export interface UnionDeclaration extends Node {
    type: "UnionDeclaration";
    modifiers?: string[];
    name: string;
    variants: UnionVariant[];
}

export interface UnionVariant {
    name: string;
    payload?: Type;
}

export interface TraitDeclaration extends Node {
    type: "TraitDeclaration";
    name: string;
    methods: TraitMethod[];
}

export interface TraitMethod {
    name: string;
    params: Parameter[];
    returnType: Type;
}

export interface TraitImplementation extends Node {
    type: "TraitImplementation";
    traitName: string;
    targetType: Type;
    methods: FunctionDeclaration[];
}

export interface Parameter {
    name: string;
    type: Type;
    isComptime?: boolean;
}

export interface Block extends Node {
    type: "Block";
    statements: Statement[];
    lastExpression?: Expression;
}

export type Statement =
    | VariableDeclaration
    | ReturnStatement
    | Assignment
    | RequireStatement
    | DeferStatement
    | RawZigBlock
    | Expression;

export interface Assignment extends Node {
    type: "Assignment";
    left: Expression;
    right: Expression;
}

export interface VariableDeclaration extends Node {
    type: "VariableDeclaration";
    modifiers?: string[];
    name: string;
    kind: "let" | "var";
    declaredType?: Type;
    init: Expression;
}

export interface ReturnStatement extends Node {
    type: "ReturnStatement";
    argument?: Expression;
}

export interface RequireStatement extends Node {
    type: "RequireStatement";
    target: string;
    trait: string;
}

export interface DeferStatement extends Node {
    type: "DeferStatement";
    kind: "defer" | "errdefer";
    body: Expression | Block;
}

export interface RawZigBlock extends Node {
    type: "RawZigBlock";
    code: string;
}

export interface MacroDeclaration extends Node {
    type: "MacroDeclaration";
    name: string;
    params: string[];
    body: Expression | Block;
}

export interface MacroInvocation extends Node {
    type: "MacroInvocation";
    name: string;
    args: Expression[];
}

export type Expression =
    | BinaryExpression
    | UnaryExpression
    | CallExpression
    | MemberExpression
    | GenericInstantiation
    | StructInitialization
    | AnonymousStruct
    | MacroInvocation
    | Identifier
    | Literal
    | IfExpression
    | MatchExpression
    | Block;

export interface BinaryExpression extends Node {
    type: "BinaryExpression";
    left: Expression;
    operator: string;
    right: Expression;
}

export interface UnaryExpression extends Node {
    type: "UnaryExpression";
    operator: string;
    argument: Expression;
}

export interface CallExpression extends Node {
    type: "CallExpression";
    callee: Expression;
    args: Expression[];
}

export interface MemberExpression extends Node {
    type: "MemberExpression";
    object: Expression;
    property: Identifier;
}

export interface Identifier extends Node {
    type: "Identifier";
    name: string;
}

export interface Literal extends Node {
    type: "Literal";
    value: any;
    raw: string;
}

export interface IfExpression extends Node {
    type: "IfExpression";
    test: Expression;
    consequent: Block | Expression;
    alternate?: Block | Expression;
}

export interface MatchExpression extends Node {
    type: "MatchExpression";
    discriminant: Expression;
    arms: MatchArm[];
}

export interface MatchArm {
    pattern: Expression;
    body: Expression | Block;
}

export interface GenericInstantiation extends Node {
    type: "GenericInstantiation";
    target: Expression;
    args: Type[];
}

export interface AnonymousStruct extends Node {
    type: "AnonymousStruct";
    elements: Expression[];
}

export interface StructInitialization extends Node {
    type: "StructInitialization";
    target: Expression;
    fields: { name: string, value: Expression }[];
}

export interface Type {
    name: string;
    genericArgs?: Type[];
    isOptional?: boolean;
    isErrorUnion?: boolean;
}
