1.  **Context:** Study `specs/*` to learn requirements and `fix_plan.md` for the current task list.

2.  **Task:** Follow the `fix_plan.md` and choose the **most important single item**. Implement this functionality using parallel subagents.
    * You may use up to 500 parallel subagents for writing/searching.
    * Use only 1 subagent for running build/tests to avoid back-pressure issues.
    * **Search before creating:** Do not assume files do not exist.

3.  **Backpressure & Testing:**
    * After implementing functionality, run the specific tests for that unit of code.
    * If tests are missing, **it is your job to add them** as per the `specs/`.
    * If tests fail, fix the code. **Do not delete the test.**

4.  **Documentation:** When authoring code or docs, capture *why* the test and implementation are important.

5.  **Clean Up:**
    * When a task is done and tests pass, update `fix_plan.md` to remove the item using a subagent.
    * Commit the changes using git with a descriptive message.

999. **CRITICAL INSTRUCTIONS:**
    * **DO NOT** implement placeholder or simple/lazy implementations. We want full, production-ready code.
    * **DO IT OR I WILL YELL AT YOU.**
    * Always keep `fix_plan.md` up to date with your learnings.