#[cfg(debug_assertions)]
fn main() {
    resonance_logs_lib::export_typescript_bindings().expect("failed to export TypeScript bindings");
}

#[cfg(not(debug_assertions))]
fn main() {}
