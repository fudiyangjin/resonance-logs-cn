// https://doc.rust-lang.org/reference/items/modules.html#module-source-filenames
// Preferred way is to name modules with their subfolder name now (no longer mod.rs)
pub mod game_connections;
pub mod npcap;
pub mod opcodes;
pub mod packet_capture;
mod packet_process;
pub mod parser;
pub mod reassembler;
pub mod utils;
