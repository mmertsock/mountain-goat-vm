"use-strict";

export class Error {
    static machine = {
        unknownInstruction: "Unknown instruction",
        invalidInputType: "Invalid input type",
        invalidInstructionFormat: "Invalid instruction format",
        inputOutsideRange: "Input outside valid range",
    };
}

/// A specific instance of a virtual machine running and executing code.
export class Machine {
    /// Size of one word, in bytes, for instructions and addresses in memory.
    static WORD_SIZE = Uint16Array.BYTES_PER_ELEMENT;
    /// Max unsigned value of one word, and size of memory in bytes.
    static WORD_RANGE = 0x1 << (8 * Uint16Array.BYTES_PER_ELEMENT);
    /// Total count of general-purpose registers.
    static NUM_REGISTERS = 2;
    /// A value for the PC register that is guaranteed to halt execution.
    /// Note that the machine halts with _any_ PC value outside the range of available statements; `PC_HALT` is just a constant that's guaranteed to work.
    static PC_HALT = -1;
    
    assemblyLanguage; // AssemblyLanguage
    registers; // Array of values
    #statements; // array of AssemblyStatement
    
    /// Index to the `statements` array, indicating the next instruction to execute.
    /// A value outside of the statements array's bounds will halt the machine, in this case the `halting` property will be true.
    #pc;
    
    constructor() {
        this.registers = new Array(Machine.NUM_REGISTERS).fill(0);
        this.assemblyLanguage = new AssemblyLanguage([
            AssemblyInstruction.setRegister(this.registers.length),
            AssemblyInstruction.addRegisters
        ]);
        this.#statements = [];
        this.#pc = 0;
    }
    
    /// Appends AssemblyStatements to the end of the current set of stored statements.
    append(statements) {
        if (!Array.isArray(statements)) { return; }
        this.#statements = this.#statements.concat(statements);
    }
    
    get instructionCount() {
        return this.#statements.length;
    }
    
    /// True if `pc` points to an invalid instruction index, false if `pc` points to a valid instruction index.
    get halting() {
        return this.#pc < 0 || this.#pc >= this.#statements.length;
    }
    
    get pc() {
        return this.#pc;
    }
    
    /// The AssemblyStatement currently indicated by `pc`.
    /// If currently in `halting` state, returns null.
    get nextInstruction() {
        if (this.halting) {
            return null;
        } else {
            return this.#statements[this.#pc];
        }
    }
    
    /// Executes the single next instruction indicated by `pc` and then returns immediately. Does nothing if the machine is currently `halting`.
    step() {
        let next = this.nextInstruction;
        if (!next) { return; }
        
        this.#pc = this.#pc + 1;
        if (next.instruction) {
            next.instruction.microcode.apply(this, next.operands);
        }
    }
    
    /// Begins execution at the next instruction indicated by `pc`.
    /// Execution halts when pc no longer points to a valid instruction index (`halting` is true).
    run() {
        // TODO: add a max-cycles argument, to give a chance to interrupt infinite loops?
        while (!this.halting) {
            this.step();
        }
    }
    
    get stateSummary() {
        return this.registers
            .map(r => `[${r}]`)
            .join(" ");
    }
    
    // TODO: instead, REPL should append one instruction then run.
    execute(instruction, input) {
        instruction.execute(input, this);
    }
    
    // Microcode implementation
    
    setPC(value) {
        this.#pc = value;
    }
    
    setRegister(rIndex, value) {
        this.registers[rIndex] = value;
    }
    
    addRegisters() {
        // TODO: handle integer overflow
        this.registers[0] = this.registers[0] + this.registers[1];
    }
}

/// An instance of DataType describes a specific format of data used in registers or instruction operands.
export class DataType {
    name;
    min;
    max;
    
    constructor(config) {
        this.name = config.name;
        this.min = config.min;
        this.max = config.max;
    }
    
    get helpText() {
        return `${this.name} [${this.min} - ${this.max}]`;
    }
    
    parse(code) {
        let integer = parseInt(code);
        if (isNaN(integer)) {
            throw Error.machine.invalidInputType;
        }
        if (integer < this.min || integer > this.max) {
            throw Error.machine.inputOutsideRange;
        }
        return integer;
    }
    
    // Enumerated DataType instances.
    
    static register = new DataType({
        name: "register",
        min: 0,
        max: Machine.NUM_REGISTERS - 1
    });
    
    static address = new DataType({
        name: "address",
        width: Machine.WORD_SIZE,
        min: 0x0,
        max: Machine.WORD_RANGE
    });
    
    static word = new DataType({
        name: "word",
        width: Machine.WORD_SIZE,
        min: 0,
        max: Machine.WORD_RANGE
    });
} // end class DataType.

/// Specifications for instructions and other details of the Machine's assembly language.
export class AssemblyLanguage {
    instructionSpecs; // Array of AssemblyInstruction
    #syntax;
    
    constructor(instructionSpecs) {
        this.instructionSpecs = instructionSpecs;
        this.#syntax = new AssemblySyntax();
    }
    
    getInstruction(keyword) {
        let instruction = this.instructionSpecs.find(i => i.keyword == keyword);
        if (!instruction) {
            throw Error.machine.unknownInstruction;
        }
        return instruction;
    }
    
    /// Parses a single line of assembly code into an AssemblyStatement.
    /// Returns a null value, or an AssemblyStatement with a null instruction value, for various types of valid but empty statements.
    /// Throws a Machine.Error if it fails to parse.
    assembleStatement(text) {
        let line = this.#syntax.tokenizeLine(text);
        if (!line.keyword && !line.comment) { return null; }
        
        if (line.keyword) {
            let instruction = this.getInstruction(line.keyword);
            if (line.operands.length != instruction.operands.length) {
                throw Error.machine.invalidInstructionFormat;
            }
            let operands = instruction.operands.map((spec, index) => {
                return spec.dataType.parse(line.operands[index]);
            });
            return new AssemblyStatement(instruction, operands, text, line.comment);
        } else {
            return new AssemblyStatement(null, [], text, line.comment);
        }
    }
}

export class AssemblySyntax {
    /// Enumeration of token types.
    static TokenCategory = {
        comment: "comment",
        keyword: "keyword",
        operand: "operand"
    };
    
    /// Parses a single line of assembly code into cleaned tokens with metadata.
    tokenizeLine(text) {
        let comment = null;
        let index = text.indexOf("#");
        if (index >= 0) {
            comment = text.substring(index + 1).trim();
            text = text.substring(0, index);
        }
        
        let tokens = text.trim().split(" ").filter(item => item.length > 0);
        let keyword = tokens.length > 0 ? tokens.shift().toUpperCase() : null;
        
        return {
            keyword: keyword,
            operands: tokens,
            comment: comment
        };
    }
}

/// Specifications for a single operand in an assembly instruction, and how to encode/decode its value within a machine code instruction.
export class OperandSpec {
    placeholder;
    dataType;
    
    constructor(config) {
        this.placeholder = config.placeholder;
        this.dataType = config.dataType;
    }
    
    get helpText() {
        return `${this.placeholder}: ${this.dataType.helpText}`;
    }
}

/// An abstract specification of the behavior of a specific assembly language instruction.
export class AssemblyInstruction {
    keyword;
    operands; // array of OperandSpec
    microcode; // Machine.prototype.someFunction
    description;
    
    constructor(config) {
        this.keyword = config.keyword;
        this.operands = config.operands;
        this.microcode = config.microcode;
        this.description = config.description;
    }
    
    /// Executes this instruction in `machine` with the given tokenized operand text.
    execute(tokens, machine) {
        if (tokens.length != this.operands.length) {
            throw Error.machine.invalidInstructionFormat;
        }
        let values = this.operands.map((spec, index) => {
            return spec.dataType.parse(tokens[index]);
        });
        this.microcode.apply(machine, values);
    }
    
    get helpText() {
        let exampleTokens = [this.keyword];
        for (const spec of this.operands) {
            exampleTokens.push(spec.placeholder);
        }
        let lines = [
            `${this.keyword}: ${this.description}`,
            `Example: ${exampleTokens.join(" ")}`
        ];
        for (const spec of this.operands) {
            lines.push(spec.helpText);
        }
        return lines;
    }
    
    // Enumerated AssemblyInstruction instances.
    
    static setRegister(registerCount) {
        return new AssemblyInstruction({
            keyword: "SET",
            operands: [
                new OperandSpec({
                    placeholder: "n",
                    dataType: DataType.register
                }),
                new OperandSpec({
                    placeholder: "i",
                    dataType: DataType.word
                })
            ],
            microcode: Machine.prototype.setRegister,
            description: "Sets $Rn to integer value i",
        });
    }
    
    static addRegisters = new AssemblyInstruction({
        keyword: "ADD",
        operands: [],
        microcode: Machine.prototype.addRegisters,
        description: "Sets $R0 = $R0 + $R1"
    });
} // end class AssemblyInstruction.

/// A specific invocation of one AssemblyInstruction, with operand values.
/// Assumes that all values are already validated per the instruction's specifications.
export class AssemblyStatement {
    /// AssemblyInstruction. Null indicates no-op, such as a comment line.
    instruction;
    /// Array of operand values, parsed to correct data types, not text input.
    operands;
    /// The original raw text of the statement.
    text;
    /// Null if no comment, otherwise a single line of text, no comment delimiter included.
    comment;
    
    constructor(instruction, operands, text, comment) {
        this.instruction = instruction;
        this.operands = operands;
        this.text = text || "";
        this.comment = (!!comment && comment.length > 0) ? comment : null;
    }
}

/// An instance of Program is a single execution of a block of code.
/// 
/// Each Program instance creates a new Machine and runs the given code on that machine, leaving the machine in its final state after execution completes.
export class Program {
    static tokenize(input) {
        if (!input) {
            throw Error.machine.unknownInstruction;
        }
        input = input.toUpperCase();
        let tokens = input.split(" ");
        let keyword = tokens.shift();
        return [keyword, tokens];
    }
    
    constructor(text) {
        this.machine = new Machine();
        this.input = text.split("\n");
        this.output = [];
        this.run();
    }
    
    run() {
        try {
            this.input.forEach(line => {
                let [keyword, tokens] = Program.tokenize(line);
                let instruction = this.machine.assemblyLanguage.getInstruction(keyword);
                this.machine.execute(instruction, tokens);
            });
            this.appendOutput("HALT");
        } catch (e) {
            this.appendOutput(`ERROR: ${e}`);
        }
    }
    
    appendOutput(text) {
        this.output.push(text);
    }
}

/// Maintains a single Machine instance, upon which individual instructions can be ran interactively. Exposes the current state of the machine for inspection and manipulation after each instruction.
export class REPL {
    constructor() {
        this.machine = new Machine();
    }
    
    get helpText() {
        let lines = [
            `I am running on a ${Machine.WORD_SIZE * 8}-bit virtual machine. Instructions:`,
        ];
        for (const instruction of this.machine.assemblyLanguage.instructionSpecs) {
            instruction.helpText.forEach((line, index) => {
                lines.push((index == 0 ? "# " : "") + line);
            });
        }
        
        return lines.join("\n");
    }
    
    errorMessage(text) {
        return `ERROR: ${text}.`;
    }
    
    run(input) {
        try {
            let [keyword, tokens] = Program.tokenize(input);
            if (keyword == "HELP") {
                return this.helpText;
            }
            
            let instruction = this.machine.assemblyLanguage.getInstruction(keyword);
            this.machine.execute(instruction, tokens);
            return this.machine.stateSummary;
        } catch (e) {
            return this.errorMessage(e);
        }
    }
}
