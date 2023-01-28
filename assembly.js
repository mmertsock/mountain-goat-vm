"use-strict";

export class Error {
}

Error.machine = {
    unknownInstruction: "Unknown instruction",
    invalidInputType: "Invalid input type",
    invalidInstructionFormat: "Invalid instruction format",
    inputOutsideRange: "Input outside valid range",
};

// A specific instance of a virtual machine running and executing code.
export class Machine {
    constructor() {
        this.registers = [0, 0];
        this.instructions = [
            Instruction.setRegister(this.registers.length),
            Instruction.addRegisters
        ];
    }
    
    // Instruction cycle
    
    getInstruction(id) {
        let instruction = this.instructions.find(i => i.id == id);
        if (!instruction) {
            throw Error.machine.unknownInstruction;
        }
        return instruction;
    }
    
    execute(instruction, input) {
        instruction.execute(input, this);
    }
    
    // Machine code implementation
    
    setRegister(rIndex, value) {
        this.registers[rIndex] = value;
    }
    
    addRegisters() {
        // TODO: handle integer overflow
        this.registers[0] = this.registers[0] + this.registers[1];
    }
}

// An instance of DataType describes a specific format of data used in registers or instruction operands.
export class DataType {
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
}
DataType.register = function(registerCount) {
    return new DataType({
        name: "register",
        min: 0,
        max: registerCount - 1
    });
};
DataType.word = new DataType({
    name: "word",
    width: Int16Array.BYTES_PER_ELEMENT,
    min: 0,
    max: 65535
});

// Specifications for a single operand in an instruction.
export class OperandSpec {
    constructor(config) {
        this.placeholder = config.placeholder;
        this.dataType = config.dataType;
    }
    
    get helpText() {
        return `${this.placeholder}: ${this.dataType.helpText}`;
    }
}

// An instance of Instruction describes the specifications and behavior of specific type of machine instruction.
export class Instruction {
    constructor(config) {
        this.id = config.id;
        this.description = config.description;
        // operands = array of OperandSpec:
        this.operands = config.operands;
        // machineCode = Machine.prototype.someFunction
        this.machineCode = config.machineCode;
    }
    
    // Executes this instruction in `machine` with the given tokenized operand text.
    execute(tokens, machine) {
        if (tokens.length != this.operands.length) {
            throw Error.machine.invalidInstructionFormat;
        }
        let values = this.operands.map((spec, index) => {
            return spec.dataType.parse(tokens[index]);
        });
        this.machineCode.apply(machine, values);
    }
    
    get helpText() {
        let exampleTokens = [this.id];
        for (const spec of this.operands) {
            exampleTokens.push(spec.placeholder);
        }
        let lines = [
            `${this.id}: ${this.description}`,
            `Example: ${exampleTokens.join(" ")}`
        ];
        for (const spec of this.operands) {
            lines.push(spec.helpText);
        }
        return lines;
    }
}

Instruction.setRegister = function(registerCount) {
    return new Instruction({
        id: "SET",
        description: "Sets $Rn to integer value i",
        operands: [
            new OperandSpec({
                placeholder: "n",
                dataType: DataType.register(registerCount)
            }),
            new OperandSpec({
                placeholder: "i",
                dataType: DataType.word
            })
        ],
        machineCode: Machine.prototype.setRegister
    });
};

Instruction.addRegisters = new Instruction({
    id: "ADD",
    description: "Sets $R0 = $R0 + $R1",
    operands: [],
    machineCode: Machine.prototype.addRegisters
});

// An instance of Program is a single execution of a block of code. Each Program instance creates a new Machine and runs the given code on that machine, leaving the machine in its final state after execution completes.
export class Program {
    static tokenize(input) {
        if (!input) {
            throw Error.machine.unknownInstruction;
        }
        input = input.toUpperCase();
        let tokens = input.split(" ");
        let instructionID = tokens.shift();
        return [instructionID, tokens];
    }
    
    static machineStateSummary(machine) {
        return machine.registers
            .map(r => `[${r}]`)
            .join(" ");
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
                let [instructionID, tokens] = Program.tokenize(line);
                let instruction = this.machine.getInstruction(instructionID);
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

// Maintains a single Machine instance, upon which individual instructions can be ran interactively. Exposes the current state of the machine for inspection and manipulation after each instruction.
export class REPL {
    constructor() {
        this.machine = new Machine();
    }
    
    get helpText() {
        let lines = [];
        for (const instruction of this.machine.instructions) {
            if (lines.length > 0) {
                lines.push("");
            }
            for (const line of instruction.helpText) {
                lines.push(line);
            }
        }
        return lines.join("\n");
    };
    
    errorMessage(text) {
        return `ERROR: ${text}.`;
    }
    
    run(input) {
        try {
            let [instructionID, tokens] = Program.tokenize(input);
            if (instructionID == "HELP") {
                return this.helpText;
            }
            
            let instruction = this.machine.getInstruction(instructionID);
            this.machine.execute(instruction, tokens);
            return Program.machineStateSummary(this.machine);
        } catch (e) {
            return this.errorMessage(e);
        }
    }
}
