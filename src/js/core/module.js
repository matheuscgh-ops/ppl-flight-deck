/* ================= MODULES =================
   Every file in src/js is a module: a closure that keeps its helpers private and returns its public API,
   which is then made available to the other modules (and to the console / tests) by name.
   A module's mutable state that other modules need (for example the current state or language) is published
   with expose(): a getter/setter on window, so everyone reads and writes the module's one real variable. */
function expose(vars) {
  for (const [name, [get, set]] of Object.entries(vars))
    Object.defineProperty(window, name, { get, set, configurable: true });
}
