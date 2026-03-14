import * as AST from "./ast.js";

export interface Symbol {
    name: string;
    type: AST.Type;
}

export class SymbolTable {
    private symbols: Map<string, Symbol> = new Map();
    constructor(public parent?: SymbolTable) {}

    public define(name: string, type: AST.Type) {
        this.symbols.set(name, { name, type });
    }

    public lookup(name: string): Symbol | undefined {
        return this.symbols.get(name) || this.parent?.lookup(name);
    }
}

export class Checker {
    private globalScope = new SymbolTable();
    private currentScope = this.globalScope;
    private implementations: Set<string> = new Set();

    constructor(private program: AST.Program) {
        this.predefine();
    }

    private predefine() {
        const types = [
            "i8", "u8", "i16", "u16", "i32", "u32", "i64", "u64", "i128", "u128",
            "isize", "usize", "f16", "f32", "f64", "f80", "f128",
            "bool", "void", "noreturn", "type", "anyerror", "comptime_int", "comptime_float"
        ];
        for (const t of types) {
            this.globalScope.define(t, { name: "Type" });
        }
        this.globalScope.define("error", { name: "ErrorSet" });
    }

    public check() {
        // First pass: define all top-level declarations
        for (const decl of this.program.body) {
            this.defineTopLevel(decl);
        }
        // Second pass: full body check
        for (const decl of this.program.body) {
            this.checkTopLevel(decl);
        }
    }

    private defineTopLevel(decl: AST.ImportDeclaration | AST.TopLevelDeclaration) {
        if (decl.type === "ImportDeclaration") {
            const parts = decl.module.split(".");
            this.globalScope.define(parts[0], { name: parts[0] });
        } else if (decl.type === "FunctionDeclaration") {
            this.globalScope.define(decl.name, { name: "Function" });
        } else if (decl.type === "StructDeclaration") {
            this.globalScope.define(decl.name, { name: "Type" });
        } else if (decl.type === "EnumDeclaration") {
            this.globalScope.define(decl.name, { name: "Type" });
        } else if (decl.type === "UnionDeclaration") {
            this.globalScope.define(decl.name, { name: "Type" });
        } else if (decl.type === "TraitDeclaration") {
            this.globalScope.define(decl.name, { name: "Trait" });
        } else if (decl.type === "MacroDeclaration") {
            this.globalScope.define(decl.name, { name: "Macro" });
        }
    }

    private checkTopLevel(decl: AST.ImportDeclaration | AST.TopLevelDeclaration) {
        if (decl.type === "FunctionDeclaration") {
            this.checkFunction(decl);
        } else if (decl.type === "TraitImplementation") {
            this.checkTraitImpl(decl);
        }
    }

    private checkTraitImpl(impl: AST.TraitImplementation) {
        if (!this.globalScope.lookup(impl.traitName)) {
            throw new Error(`Undefined trait: ${impl.traitName}`);
        }
        this.implementations.add(`${impl.traitName}:${impl.targetType.name}`);
        for (const method of impl.methods) {
            this.checkFunction(method);
        }
    }

    private checkFunction(fn: AST.FunctionDeclaration) {
        const parentScope = this.currentScope;
        this.currentScope = new SymbolTable(parentScope);

        for (const param of fn.params) {
            this.currentScope.define(param.name, param.type);
        }

        let inferredType: AST.Type;
        if (fn.body.type === "Block") {
            inferredType = this.checkBlock(fn.body);
        } else {
            inferredType = this.checkExpression(fn.body);
        }

        if (!fn.returnType && inferredType.name !== "any") {
            fn.returnType = inferredType;
        }

        this.currentScope = parentScope;
    }

    private checkBlock(block: AST.Block): AST.Type {
        const parentScope = this.currentScope;
        this.currentScope = new SymbolTable(parentScope);

        for (const stmt of block.statements) {
            this.checkStatement(stmt);
        }

        let type: AST.Type = { name: "void" };
        if (block.lastExpression) {
            type = this.checkExpression(block.lastExpression);
        }

        this.currentScope = parentScope;
        return type;
    }

    private checkStatement(stmt: AST.Statement) {
        if (stmt.type === "RequireStatement") {
            if (!this.globalScope.lookup(stmt.trait)) {
                throw new Error(`Undefined trait: ${stmt.trait}`);
            }
            // If it's a concrete type, we can check implementations.
            // But often it's a generic type parameter.
            return;
        }
        if (stmt.type === "VariableDeclaration") {
            const initType = this.checkExpression(stmt.init);
            const type = stmt.declaredType || initType;
            this.currentScope.define(stmt.name, type as AST.Type);
        } else if (stmt.type === "ReturnStatement") {
            if (stmt.argument) this.checkExpression(stmt.argument);
        } else {
            this.checkExpression(stmt as AST.Expression);
        }
    }

    private checkExpression(expr: AST.Expression): AST.Type {
        switch (expr.type) {
            case "Literal":
                if (typeof expr.value === "number") {
                    if (expr.raw.includes(".")) return { name: "f32" };
                    return { name: "i32" };
                }
                if (typeof expr.value === "string") return { name: "[]const u8" };
                if (expr.value === null) return { name: "any" };
                return { name: "any" };
            case "Identifier":
                if (expr.name.startsWith("@")) return { name: "any" };
                if (expr.name === "true" || expr.name === "false") return { name: "bool" };
                const sym = this.currentScope.lookup(expr.name);
                if (!sym) throw new Error(`Undefined identifier: ${expr.name}`);
                return sym.type;
            case "BinaryExpression":
                const left = this.checkExpression(expr.left);
                const right = this.checkExpression(expr.right);
                if (["==", "!=", "<", ">", "<=", ">="].includes(expr.operator)) return { name: "bool" };
                if (expr.operator === "??") return right;
                if (left.name !== "any") return left;
                if (right.name !== "any") return right;
                return { name: "any" };
            case "CallExpression":
                this.checkExpression(expr.callee);
                for (const arg of expr.args) this.checkExpression(arg);
                return { name: "any" };
            case "MemberExpression":
                const objType = this.checkExpression(expr.object);
                if (objType.name === "std") {
                    if (expr.property.name === "debug") return { name: "std.debug" };
                }
                if (objType.name === "std.debug") {
                    if (expr.property.name === "print") return { name: "Function" };
                }
                return { name: "any" };
            case "GenericInstantiation":
                this.checkExpression(expr.target);
                return { name: "any" };
            case "UnaryExpression":
                let t = this.checkExpression(expr.argument);
                if (expr.operator === "?") {
                    if (t.name.startsWith("!")) return { ...t, name: t.name.substring(1) };
                    return t;
                }
                return t;
            case "Block":
                return this.checkBlock(expr);
            case "AnonymousStruct":
                for (const el of expr.elements) this.checkExpression(el);
                return { name: "any" };
            case "IfExpression":
                this.checkExpression(expr.test);
                const consType = expr.consequent.type === "Block" ? this.checkBlock(expr.consequent) : this.checkExpression(expr.consequent);
                if (expr.alternate) {
                    const altType = expr.alternate.type === "Block" ? this.checkBlock(expr.alternate) : this.checkExpression(expr.alternate);
                    if (consType.name === altType.name) return consType;
                }
                return consType;
            case "MacroInvocation":
                return { name: "any" };
            case "MatchExpression":
                this.checkExpression(expr.discriminant);
                for (const arm of expr.arms) {
                    const parentScope = this.currentScope;
                    this.currentScope = new SymbolTable(parentScope);

                    if (arm.pattern.type === "CallExpression") {
                        for (const arg of arm.pattern.args) {
                            if (arg.type === "Identifier") {
                                this.currentScope.define(arg.name, { name: "any" });
                            }
                        }
                    } else if (arm.pattern.type !== "Identifier" || arm.pattern.name !== "else") {
                        // this.checkExpression(arm.pattern);
                    }

                    if (arm.body.type === "Block") this.checkBlock(arm.body);
                    else this.checkExpression(arm.body);

                    this.currentScope = parentScope;
                }
                return { name: "any" };
            default:
                return { name: "any" };
        }
    }
}
