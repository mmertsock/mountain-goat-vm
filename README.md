## Mountain Goat VM

A fake computer architecture and assembly language, with an interpreter hosted in JavaScript.

This is a learning exercise discussed on <https://www.runningcode.net>.

## Repository contents

- index.html: the virtual machine runtime
	- Program mode: execute a program as a single block of code
	- REPL mode: interactive execution, one line at a time
- assembly.js: the main virtual machine, language definition, and interpreter
- test.html and test.js: unit test runner
