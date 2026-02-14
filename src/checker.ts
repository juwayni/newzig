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
    }

    public check() {
        for (const decl of this.program.body) {
            this.checkTopLevel(decl);
        }
    }

    private checkTopLevel(decl: AST.ImportDeclaration | AST.TopLevelDeclaration) {
        if (decl.type === "ImportDeclaration") {
            const parts = decl.module.split(".");
            this.globalScope.define(parts[0], { name: "Module" });
        } else if (decl.type === "FunctionDeclaration") {
            this.globalScope.define(decl.name, {
                name: "Function",
            });
            this.checkFunction(decl);
        } else if (decl.type === "StructDeclaration") {
            this.globalScope.define(decl.name, { name: "Type" });
        } else if (decl.type === "EnumDeclaration") {
            this.globalScope.define(decl.name, { name: "Type" });
        } else if (decl.type === "UnionDeclaration") {
            this.globalScope.define(decl.name, { name: "Type" });
        } else if (decl.type === "TraitDeclaration") {
            this.globalScope.define(decl.name, { name: "Trait" });
        } else if (decl.type === "TraitImplementation") {
            this.checkTraitImpl(decl);
        }
    }

    private checkTraitImpl(impl: AST.TraitImplementation) {
        if (!this.globalScope.lookup(impl.traitName)) {
            throw new Error(`Undefined trait: ${impl.traitName}`);
        }
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

        if (fn.body.type === "Block") {
            this.checkBlock(fn.body);
        } else {
            this.checkExpression(fn.body);
        }

        this.currentScope = parentScope;
    }

    private checkBlock(block: AST.Block) {
        const parentScope = this.currentScope;
        this.currentScope = new SymbolTable(parentScope);

        for (const stmt of block.statements) {
            this.checkStatement(stmt);
        }

        if (block.lastExpression) {
            this.checkExpression(block.lastExpression);
        }

        this.currentScope = parentScope;
    }

    private checkStatement(stmt: AST.Statement) {
        if (stmt.type === "RequireStatement") {
            if (!this.globalScope.lookup(stmt.trait)) {
                throw new Error(`Undefined trait: ${stmt.trait}`);
            }
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
                if (typeof expr.value === "number") return { name: "i32" };
                if (typeof expr.value === "string") return { name: "[]const u8" };
                return { name: "any" };
            case "Identifier":
                if (expr.name.startsWith("@")) return { name: "any" };
                const sym = this.currentScope.lookup(expr.name);
                if (!sym) throw new Error(`Undefined identifier: ${expr.name}`);
                return sym.type;
            case "BinaryExpression":
                this.checkExpression(expr.left);
                this.checkExpression(expr.right);
                return { name: "any" };
            case "CallExpression":
                this.checkExpression(expr.callee);
                for (const arg of expr.args) this.checkExpression(arg);
                return { name: "any" };
            case "MemberExpression":
                this.checkExpression(expr.object);
                return { name: "any" };
            case "GenericInstantiation":
                this.checkExpression(expr.target);
                return { name: "any" };
            case "UnaryExpression":
                return this.checkExpression(expr.argument);
            case "Block":
                this.checkBlock(expr);
                return { name: "any" };
            case "AnonymousStruct":
                for (const el of expr.elements) this.checkExpression(el);
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
