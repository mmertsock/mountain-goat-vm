"use-strict";

import * as Assembly from './assembly.js';

const [Machine, DataType, AssemblyLanguage, AssemblySyntax, OperandSpec, AssemblyInstruction, AssemblyStatement] = [Assembly.Machine, Assembly.DataType, Assembly.AssemblyLanguage, Assembly.AssemblySyntax, Assembly.OperandSpec, Assembly.AssemblyInstruction, Assembly.AssemblyStatement];

function appendOutputItem(msg, className) {
    if (!TestSession.outputElement) { return; }
    var elem = document.createElement("li");
    elem.innerText = msg;
    elem.classList.toggle(className, true);
    TestSession.outputElement.append(elem);
}

function logTestMsg(msg, className) {
    console.log(msg);
    appendOutputItem(msg, className ? className : "log");
}

function debugDump(obj) {
    appendOutputItem("(debugDump)", "warn");
    console.log(obj);
}

function logTestHeader(msg) {
    console.log(`~~~~ ${msg} ~~~~`);
    appendOutputItem(msg, "header");
}

function logTestFail(msg) {
    console.warn(msg);
    appendOutputItem(msg, "warn");
}

export class TestSession {
    constructor(testFuncs) {
        this.testFuncs = Array.isArray(testFuncs) ? testFuncs : [];
        this.testsPassed = 0;
        this.testsFailed = 0;
    }
    append(testFuncs) {
        this.testFuncs = this.testFuncs.concat(testFuncs);
        return this;
    }
    async run(outputElement) {
        TestSession.outputElement = outputElement;
        // let timer = new PerfTimer("TestSession.run").start();
        for (let i = 0; i < this.testFuncs.length; i += 1) {
            await this.testFuncs[i]();
        }
        this.summarize(); //(timer);
    }
    summarize(timer) {
        logTestHeader("Test Summary " + new Date().toLocaleString());
        logTestMsg(`Tests run: ${this.testsPassed + this.testsFailed}`);
        if (this.testsFailed > 0) {
            logTestFail(`Tests failed: ${this.testsFailed}`);
        } else {
            logTestMsg("All tests passed.", "success");
        }
        // logTestMsg(timer.end().summary, "trace");
    }
}
TestSession.current = null;

class UnitTest {
    constructor(name, body) {
        this.name = name;
        this.body = body;
        this.expectations = 0;
        this.failures = 0;
    }

    get isOK() { return this.failures == 0; }
    get hadExpectations() { return this.expectations > 0; }

    build() {
        return function(config, expect) {
            logTestHeader(this.name);
            
            try {
                this.body(config, expect);
            } catch(e) {
                this.logFailure(`Exception thrown: ${e}\n${e.stack}`);
            }
            if (!this.hadExpectations) { return; }
            if (this.isOK) {
                TestSession.current.testsPassed += 1;
                logTestMsg(`Passed! Expectations: ` + this.expectations);
                return;
            }
            TestSession.current.testsFailed += 1;
            if (config) {
                logTestMsg(`config: ${JSON.stringify(config)}`);
            }
            if (expect) {
                logTestMsg(`expect: ${JSON.stringify(expect)}`);
            }
            logTestHeader(`END ${this.name} (${this.failures} failure${this.failures == 1 ? "" : "s"})`);
        }.bind(this);
    }

    buildAndRun() {
        return this.build()();
    }

    usage(msg) {
        if (!this.usaged) {
            logTestMsg("Usage:");
        }
        logTestMsg(msg);
        this.usaged = true;
    }
    logFailure(msg) {
        this.failures += 1;
        logTestFail(`${this.name}: ${msg}`);
        console.trace();
    }
    assertDefined(value, msg) {
        this.expectations += 1;
        if (typeof(value) === "undefined") {
            this.logFailure(this._assertMessage("unexpected undefined value", msg));
            return false;
        }
        return true;
    }
    describe(value) {
        let p = value ? Object.getPrototypeOf(value) : null;
        while (p) {
            if (!!Object.getOwnPropertyDescriptors(p).debugDescription)
                return value.debugDescription;
            p = Object.getPrototypeOf(p);
        }
        // if (!!value && !!value.constructor && !!Object.getOwnPropertyDescriptors(value.constructor.prototype).debugDescription) {
        //     return value.debugDescription;
        // }
        return `${value}`;
    }
    assertEqual(a, b, msg) {
        this.expectations += 1;
        if (!!a && !!b && a.constructor == b.constructor && typeof(a.isEqual) == "function") {
            if (!b.isEqual(a)) {
                this.logFailure(this._assertMessage(`assertEqual failure: ${this.describe(a)} neq ${this.describe(b)}`, msg));
                return false;
            }
            return true;
        }
        if (a != b) {
            this.logFailure(this._assertMessage(`assertEqual failure: ${this.describe(a)} != ${this.describe(b)}`, msg));
            return false;
        }
        return true;
    }
    assertEqualTol(a, b, tol, msg) {
        if (typeof(a?.isEqual) == 'function') {
            if (!a.isEqual(b, tol)) {
                this.logFailure(this._assertMessage(`assertEqualTol failure: ${this.describe(a)} neq ${this.describe(b)}`, msg));
                return false;
            }
        } else {
            if (!Math.fequal(a, b, tol)) {
                this.logFailure(this._assertMessage(`assertEqualTol failure: ${this.describe(a)} neq ${this.describe(b)}`, msg));
                return false;
            }
        }
        return true;
    }
    assertElementsEqual(a, b, msg) {
        this.expectations += 1;
        if (!a && !b) { return true; }
        if ((!a || !b)
            || (a.length != b.length)
            || (!a.every((item, i) => item == b[i]))) {
            this.logFailure(this._assertMessage(`assertElementsEqual: ${a} != ${b}`, msg));
            return false;
        }
        return true;
    }
    assertTrue(value, msg) {
        this.expectations += 1;
        if (value != true) {
            this.logFailure(this._assertMessage("assertTrue failure", msg));
            return false;
        }
        return true;
    }
    assertFalse(value, msg) {
        this.expectations += 1;
        if (value != false) {
            this.logFailure(this._assertMessage("assertFalse failure", msg));
            return false;
        }
        return true;
    }
    assertNoThrow(block, msg) {
        this.expectations += 1;
        try {
            return block();
        } catch(e) {
            this.logFailure(this._assertMessage(`assertNoThrow failure ${e}`, msg));
            return undefined;
        }
    }
    assertThrows(block, msg) {
        this.expectations += 1;
        try {
            block();
            this.logFailure(this._assertMessage(`assertThrows failure`, msg));
            return undefined;
        } catch(e) {
            return e;
        }
    }
    _assertMessage(main, supplement) {
        var messages = [main];
        if (supplement) { messages.push(supplement); }
        return messages.join(" — ");
    }
}

class BaseTypesTests {
    static datatypeTests() {
        new UnitTest("DataType.parse", function() {
            let value = this.assertNoThrow(() => {
                return DataType.word.parse("0");
            }, "word: parse 0");
            this.assertEqual(value, 0, "word: parsed 0");
            
            value = this.assertNoThrow(() => {
                return DataType.word.parse("123");
            }, "word: parse 123");
            this.assertEqual(value, 123, "word: parsed 123");
            
            this.assertThrows(() => {
                return DataType.word.parse("abc");
            }, "word: parse abc fails");
            
            this.assertEqual(DataType.register.max, Machine.NUM_REGISTERS - 1, "register: Max register count = N - 1");
            
            value = this.assertNoThrow(() => {
                return DataType.register.parse("0");
            }, "register parse 0");
            this.assertEqual(value, 0, "register: parsed 0");
            
            value = this.assertNoThrow(() => {
                return DataType.register.parse(Machine.NUM_REGISTERS - 1);
            }, "register: parse max allowed");
            this.assertEqual(value, Machine.NUM_REGISTERS - 1, "register: parse max allowed");
            
            this.assertThrows(() => {
                return DataType.register.parse(Machine.NUM_REGISTERS);
            }, "register: parse NUM_REGISTERS fails");
            
            this.assertThrows(() => {
                return DataType.register.parse("abc");
            }, "register: parse abc fails");
        }).buildAndRun();
    }
    
    static instructionTests() {
        let StubMachine = class {
            registers;
            constructor(registers) {
                this.registers = registers;
            }
        };
        
        new UnitTest("AssemblyInstruction.setRegister", function() {
            let machine = new StubMachine([0, 0, 0]);
            let sut = AssemblyInstruction.setRegister(3);
            let label = "";
            
            label = "SET (no tokens): ";
            this.assertThrows(() => {
                sut.execute([], machine);
            }, label + "invalid");
            this.assertElementsEqual(machine.registers, [0, 0, 0], label + "no state change");
            
            label = "SET 0: ";
            this.assertThrows(() => {
                sut.execute(["0"], machine);
            }, label + "invalid");
            this.assertElementsEqual(machine.registers, [0, 0, 0], label + "no state change");
            
            label = "SET 0 1 2: ";
            this.assertThrows(() => {
                sut.execute(["0", "1", "2"], machine);
            }, label + "invalid");
            this.assertElementsEqual(machine.registers, [0, 0, 0], label + "no state change");
            
            label = "SET a 1: ";
            this.assertThrows(() => {
                sut.execute(["a", "1"], machine);
            }, label + "invalid");
            this.assertElementsEqual(machine.registers, [0, 0, 0], label + "no state change");
            
            label = "SET 0 a: ";
            this.assertThrows(() => {
                sut.execute(["0", "a"], machine);
            }, label + "invalid");
            this.assertElementsEqual(machine.registers, [0, 0, 0], label + "no state change");
            
            label = "SET 3 1: ";
            this.assertThrows(() => {
                sut.execute(["3", "1"], machine);
            }, label + "invalid");
            this.assertElementsEqual(machine.registers, [0, 0, 0], label + "no state change");
            
            label = "SET 0 1: ";
            this.assertNoThrow(() => {
                sut.execute(["0", "1"], machine);
            }, label + "execute");
            this.assertElementsEqual(machine.registers, [1, 0, 0], label + "sets register 0");
        }).buildAndRun();
        
        new UnitTest("AssemblyInstruction.addRegisters", function() {
            let machine = new StubMachine([3, 4, 5]);
            let sut = AssemblyInstruction.addRegisters;
            let label = "";
            
            label = "ADD 0: ";
            this.assertThrows(() => {
                sut.execute(["0"], machine);
            }, label + "invalid");
            this.assertElementsEqual(machine.registers, [3, 4, 5], label + "no state change");
            
            label = "ADD: ";
            this.assertNoThrow(() => {
                sut.execute([], machine);
            }, label + "execute");
            this.assertElementsEqual(machine.registers, [7, 4, 5], label + "sets register 0");
        }).buildAndRun();
    }
    
    static all = [BaseTypesTests.datatypeTests, this.instructionTests];
}

class AssemblyLanguageTests {
    static getInstructionTests() {
        new UnitTest("AssemblyLanguage.getInstruction", function() {
            let addInstruction = AssemblyInstruction.addRegisters;
            let setInstruction = AssemblyInstruction.setRegister(Machine.NUM_REGISTERS);
            let language = new AssemblyLanguage([addInstruction, setInstruction]);
            
            this.assertThrows(() => language.getInstruction(undefined), "Throws: undefined keyword");
            this.assertThrows(() => language.getInstruction(""), "Throws: empty keyword");
            this.assertThrows(() => language.getInstruction("BOGUS"), "Throws: unknown keyword");
            this.assertThrows(() => language.getInstruction("aDd"), "Throws: requires case-sensitive match");
            
            this.assertEqual(language.getInstruction(setInstruction.keyword), setInstruction, "Get SET");
            this.assertEqual(language.getInstruction(addInstruction.keyword), addInstruction, "Get ADD");
        }).buildAndRun();
    }
    
    static parsingTests() {
        new UnitTest("AssemblySyntax.tokenizeLine", function() {
            const split = function(obj) { return [obj.keyword, obj.operands.length, obj.comment]; }
            let syntax = new AssemblySyntax();
            
            let result = syntax.tokenizeLine("");
            this.assertElementsEqual(split(result), [null, 0, null], "empty string");
            
            result = syntax.tokenizeLine("     ");
            this.assertElementsEqual(split(result), [null, 0, null], "all spaces");
            
            result = syntax.tokenizeLine("  # this  is a comment     ");
            this.assertElementsEqual(split(result), [null, 0, "this  is a comment"], "comment line: '#' stripped, comment trimmed, internal spaces preserved");
            
            result = syntax.tokenizeLine("ADD");
            this.assertElementsEqual(split(result), ["ADD", 0, null], "just a keyword");
            
            result = syntax.tokenizeLine(" set 1   123  # set  register");
            this.assertElementsEqual(split(result), ["SET", 2, "set  register"], "keyword, 2 operands, comment, ignores extra spaces outside comment")
            this.assertElementsEqual(result.operands, ["1", "123"], "2 operands");
            
            this.assertElementsEqual(syntax.tokenizeLine("set 3 a 2 4").operands, ["3", "a", "2", "4"], "operand validation is responsibility of the caller");
        }).buildAndRun();
        
        new UnitTest("AssemblyLanguage.assembleStatement", function() {
            let addInstruction = AssemblyInstruction.addRegisters;
            let setInstruction = AssemblyInstruction.setRegister(Machine.NUM_REGISTERS);
            // Varying the order of instructions in AssemblyLanguageTests to ensure 
            // the order doesn't affect behavior.
            let language = new AssemblyLanguage([setInstruction, addInstruction]);
            
            this.assertEqual(language.assembleStatement(""), null, "Empty text: returns null");
            this.assertEqual(language.assembleStatement("       "), null, "All spaces: returns null");
            
            let statement = language.assembleStatement("# line comment");
            this.assertEqual(statement.instruction, null, "line comment: no instruction");
            this.assertEqual(statement.comment, "line comment", "line comment text");
            
            this.assertThrows(() => language.assembleStatement("BOGUS"), "Throws: unknown keyword");
            
            statement = language.assembleStatement(`${addInstruction.keyword}`);
            this.assertEqual(statement?.instruction, addInstruction, "ADD: instruction");
            this.assertEqual(statement?.operands.length, 0, "ADD: no operands");
            this.assertEqual(statement?.comment, null, "ADD: no comment");
            
            this.assertThrows(() => language.assembleStatement("ADD 3 4"), "ADD: rejects any operands");
            
            statement = language.assembleStatement("set 1 1234 # set 1234");
            this.assertEqual(statement?.instruction, setInstruction, "SET: instruction");
            this.assertElementsEqual(statement?.operands, [1, 1234], "SET: operand values");
            this.assertEqual(statement?.text, "set 1 1234 # set 1234", "SET: text");
            this.assertEqual(statement?.comment, "set 1234", "SET: with comment");
            
            this.assertThrows(() => language.assembleStatement("SET"), "SET: no operands");
            this.assertThrows(() => language.assembleStatement("SET 3 1 2 4"), "SET: wrong operand count");
            this.assertThrows(() => language.assembleStatement("SET 1 abc"), "SET: invalid operand format");
            this.assertThrows(() => language.assembleStatement("SET def 2"), "SET: invalid operand format");
            // this.assertThrows(() => language.assembleStatement("SET 0.5 2"), "SET: invalid operand format"); // TODO: implement strict integer parsing
            this.assertThrows(() => language.assembleStatement("SET 7 2"), "SET: invalid register number");
        }).buildAndRun();
    }
    
    static all = [AssemblyLanguageTests.getInstructionTests, this.parsingTests];
}

class MachineTests {
    static initTests() {
        new UnitTest("Machine.init", function() {
            let machine = new Machine();
            this.assertEqual(machine.registers.length, Machine.NUM_REGISTERS, "Register count is correct");
            this.assertEqual(machine.registers.filter(r => r == 0).length, Machine.NUM_REGISTERS, "All registers initialized to zero");
            this.assertEqual(machine.instructionCount, 0, "Initialized with no instructions");
            this.assertTrue(machine.halting, "Will always halt immediately after init with no instructions");
            this.assertEqual(machine.nextInstruction, null, "nextInstruction always null after init with no instructions");
        }).buildAndRun();
    }
     
    static statementTests() {
        new UnitTest("Machine.append", function() {
            let machine = new Machine();
            let setInstruction = machine.assemblyLanguage.getInstruction("SET");
            let addInstruction = machine.assemblyLanguage.getInstruction("ADD");
            let statements = [
                new AssemblyStatement(setInstruction, [0, 5], "SET 0 5", null),
                new AssemblyStatement(setInstruction, [1, 10], "SET 1 10", null),
                new AssemblyStatement(addInstruction, [], "ADD", null),
                new AssemblyStatement(addInstruction, [], "ADD", null)
            ];
            
            this.assertTrue(machine.halting, "init: halting");
            this.assertEqual(machine.nextInstruction, null, "init: nextInstruction null");
            let pc0 = machine.pc;
            
            machine.append([]);
            this.assertEqual(machine.instructionCount, 0, "Append no statements: count == 0");
            this.assertTrue(machine.halting, "Append no statements: still halting");
            this.assertEqual(machine.pc, pc0, "Append no statements: PC unchanged");
            this.assertEqual(machine.nextInstruction, null, "Append no statements: nextInstruction null");
            
            machine.append([statements[0]]);
            this.assertEqual(machine.instructionCount, 1, "Append 1 statement: count == 1");
            this.assertFalse(machine.halting, "Append 1 statement: not halting");
            this.assertEqual(machine.pc, pc0, "Append 1 statement: PC unchanged");
            this.assertEqual(machine.nextInstruction, statements[0], "Append 1 statement: nextInstruction");
            
            machine.append([statements[1], statements[2]]);
            this.assertEqual(machine.instructionCount, 3, "Append more statements: count");
            this.assertFalse(machine.halting, "Append more statements: not halting");
            this.assertEqual(machine.pc, pc0, "Append more statements: PC unchanged");
            this.assertEqual(machine.nextInstruction, statements[0], "Append more statements: nextInstruction unchanged");
            
            let pc1 = machine.pc + 1;
            machine.setPC(pc1);
            this.assertEqual(machine.nextInstruction, statements[1], "Modify PC: nextInstruction updated");
            machine.append([statements[3]]);
            this.assertEqual(machine.pc, pc1, "Append with PC modified: PC not updated");
            
            machine.setPC(machine.instructionCount);
            this.assertTrue(machine.halting, "Move PC to end: halting");
            this.assertEqual(machine.nextInstruction, null, "Move PC to end: nextInstruction null");
        }).buildAndRun();
    }
    
    static stepTests() {
        new UnitTest("Machine.step: sequential", function() {
            let machine = new Machine();
            let setInstruction = machine.assemblyLanguage.getInstruction("SET");
            let addInstruction = machine.assemblyLanguage.getInstruction("ADD");
            let statements = [
                new AssemblyStatement(setInstruction, [1, 10], "SET 1 10", null),
                new AssemblyStatement(addInstruction, [], "ADD", null)
            ];
            
            let pc = machine.pc;
            machine.step();
            this.assertEqual(machine.pc, pc, "step with no statements loaded: PC unchanged");
            this.assertTrue(machine.halting, "step with no statements loaded: halting");
            
            console.log("~~~~ step with 1 statement loaded ~~~~");
            machine.append([statements[0]]);
            machine.step();
            this.assertEqual(machine.registers[1], 10, "step with 1 statement loaded: executed statement");
            this.assertTrue(machine.halting, "step with 1 statement loaded: halting");
            
            console.log("~~~~ step after 1 statement executed ~~~~");
            machine.step();
            this.assertTrue(machine.halting, "step after 1 statement executed: halting");
            
            machine.append([statements[1]]);
            machine.step();
            this.assertEqual(machine.registers[0], 10, "step second statement: executed ADD");
            this.assertTrue(machine.halting, "step second statement: halting");
            
            machine.step();
            this.assertEqual(machine.registers[0], 10, "step after second statement: noop");
            this.assertTrue(machine.halting, "step after second statement: halting");
            
            // Manually start over with instructions still loaded.
            machine.setPC(pc);
            machine.setRegister(1, 0);
            
            machine.step();
            this.assertEqual(machine.registers[1], 10, "step after reset PC: executed SET");
            this.assertFalse(machine.halting, "step after reset PC: not halting");
            machine.step();
            this.assertEqual(machine.registers[0], 20, "second step after reset PC: executed AD");
            this.assertTrue(machine.halting, "second step after reset PC: halting");
        }).buildAndRun();
        
        new UnitTest("Machine.step: noops", function() {
            let machine = new Machine();
            machine.append([new AssemblyStatement(null, [], "# noop", "noop")]);
            this.assertEqual(machine.instructionCount, 1, "Noop included in instructionCount");
            this.assertFalse(machine.halting, "append noop: ready");
            
            let pc0 = machine.pc;
            machine.step();
            this.assertTrue(machine.halting, "step after noop: halting");
            this.assertEqual(machine.pc, pc0 + 1, "step after noop: PC incremented");
            
            let setInstruction = machine.assemblyLanguage.getInstruction("SET");
            machine.append([new AssemblyStatement(setInstruction, [1, 10], "SET 1 10", null)]);
            machine.step();
            this.assertEqual(machine.registers[1], 10, "SET after noop step: SET executed");
            this.assertEqual(machine.pc, pc0 + 2, "SET after noop step: PC incremented");
        }).buildAndRun();
        
        new UnitTest("Machine.step: control flow", function() {
            // Step a single statement, it doesn't set the PC. Increments the PC normally.
            // Step a single statement, it sets the PC. Respects that, doesn't increment the PC.
        }).buildAndRun();
    }
    
    static runTests() {
        new UnitTest("Machine.run", function() {
            let machine = new Machine();
            let setInstruction = machine.assemblyLanguage.getInstruction("SET");
            let addInstruction = machine.assemblyLanguage.getInstruction("ADD");
            let statements = [
                new AssemblyStatement(setInstruction, [1, 10], "SET 1 10", null),
                new AssemblyStatement(null, [], "# noop", "noop"),
                new AssemblyStatement(addInstruction, [], "ADD", null)
            ];
            
            let pc0 = machine.pc;
            machine.run();
            this.assertEqual(machine.pc, pc0, "run with no statements: PC unchanged");
            this.assertTrue(machine.halting, "run with no statements: halting");
            
            machine.append(statements);
            this.assertEqual(machine.instructionCount, 3, "append 3 statements");
            this.assertFalse(machine.halting, "append 3 statements: ready");
            
            machine.run();
            this.assertElementsEqual([machine.registers[0], machine.registers[1]], [10, 10], "Statements executed, registers updated");
            this.assertTrue(machine.halting, "run 3 statements: halting");
            
            // Manually start over with instructions still loaded.
            machine.setPC(1);
            this.assertFalse(machine.halting, "Reset PC: not halting");
            machine.run();
            this.assertElementsEqual([machine.registers[0], machine.registers[1]], [20, 10], "Run after reset PC: statements executed, registers updated");
            this.assertTrue(machine.halting, "Run after reset PC: halting");
            
            // TODO: Control flow: statement changes PC, next statement the expected one, sets PC to a halting state, halts.
        }).buildAndRun();
    }
    
    static all = [MachineTests.initTests, this.statementTests, this.stepTests, this.runTests];
}

TestSession.current = new TestSession()
    .append(BaseTypesTests.all)
    .append(AssemblyLanguageTests.all)
    .append(MachineTests.all);

export async function uiReady() {
    TestSession.current.run(document.querySelector("#testOutput"));
}
