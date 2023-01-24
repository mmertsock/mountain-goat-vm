"use-strict";

import * as Assembly from './assembly.js';

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
        this.testFuncs = testFuncs;
        this.testsPassed = 0;
        this.testsFailed = 0;
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

class AssemblyTests {
    static datatypeTests() {
        new UnitTest("DataType.parse", function() {
            let value = this.assertNoThrow(() => {
                return Assembly.DataType.word.parse("0");
            }, "word: parse 0");
            this.assertEqual(value, 0, "word: parsed 0");
            
            value = this.assertNoThrow(() => {
                return Assembly.DataType.word.parse("123");
            }, "word: parse 123");
            this.assertEqual(value, 123, "word: parsed 123");
            
            this.assertThrows(() => {
                return Assembly.DataType.word.parse("abc");
            }, "word: parse abc fails");
            
            this.assertEqual(Assembly.DataType.register(5).max, 4, "register(5): Max register count = N - 1");
            
            value = this.assertNoThrow(() => {
                return Assembly.DataType.register(5).parse("0");
            }, "register(5): parse 0");
            this.assertEqual(value, 0, "register(5): parsed 0");
            
            value = this.assertNoThrow(() => {
                return Assembly.DataType.register(5).parse("4");
            }, "register(5): parse 4");
            this.assertEqual(value, 4, "register(5): parsed 4");
            
            this.assertThrows(() => {
                return Assembly.DataType.register(5).parse("abc");
            }, "register(5): parse abc fails");
            
            this.assertThrows(() => {
                return Assembly.DataType.register(5).parse("abc");
            }, "register(5): parse 5 fails");
        }).buildAndRun();
    }
    
    static instructionTests() {
        new UnitTest("Instruction.setRegister", function() {
            let machine = {
                registers: [0, 0, 0]
            };
            let sut = Assembly.Instruction.setRegister(3);
            let label = "";
            
            label = "SET (no tokens)";
            this.assertThrows(() => {
                sut.execute([], machine);
            }, label + "invalid");
            this.assertElementsEqual(machine.registers, [0, 0, 0], label + "no state change");
            
            label = "SET 0";
            this.assertThrows(() => {
                sut.execute(["0"], machine);
            }, label + "invalid");
            this.assertElementsEqual(machine.registers, [0, 0, 0], label + "no state change");
            
            label = "SET 0 1 2";
            this.assertThrows(() => {
                sut.execute(["0", "1", "2"], machine);
            }, label + "invalid");
            this.assertElementsEqual(machine.registers, [0, 0, 0], label + "no state change");
            
            label = "SET a 1";
            this.assertThrows(() => {
                sut.execute(["a", "1"], machine);
            }, label + "invalid");
            this.assertElementsEqual(machine.registers, [0, 0, 0], label + "no state change");
            
            label = "SET 0 a";
            this.assertThrows(() => {
                sut.execute(["0", "a"], machine);
            }, label + "invalid");
            this.assertElementsEqual(machine.registers, [0, 0, 0], label + "no state change");
            
            label = "SET 3 1";
            this.assertThrows(() => {
                sut.execute(["3", "1"], machine);
            }, label + "invalid");
            this.assertElementsEqual(machine.registers, [0, 0, 0], label + "no state change");
            
            label = "SET 0 1";
            this.assertNoThrow(() => {
                sut.execute(["0", "1"], machine);
            }, label + "execute");
            this.assertElementsEqual(machine.registers, [1, 0, 0], label + "sets register 0");
        }).buildAndRun();
        
        new UnitTest("Instruction.addRegisters", function() {
            let machine = {
                registers: [3, 4, 5]
            };
            let sut = Assembly.Instruction.addRegisters;
            let label = "";
            
            label = "ADD 0";
            this.assertThrows(() => {
                sut.execute(["0"], machine);
            }, label + "invalid");
            this.assertElementsEqual(machine.registers, [3, 4, 5], label + "no state change");
            
            label = "ADD";
            this.assertNoThrow(() => {
                sut.execute([], machine);
            }, label + "execute");
            this.assertElementsEqual(machine.registers, [7, 4, 5], label + "sets register 0");
        }).buildAndRun();
    }
} // end class assembly

TestSession.current = new TestSession([
    AssemblyTests.datatypeTests,
    AssemblyTests.instructionTests
]);

export async function uiReady() {
    TestSession.current.run(document.querySelector("#testOutput"));
}
