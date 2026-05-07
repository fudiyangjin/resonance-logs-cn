use std::io;
use std::path::{Path, PathBuf};

const PARSER_DATA_DIR: &str = "parser-data";

pub fn locate_file(relative_path: impl AsRef<Path>) -> Option<PathBuf> {
    let relative_path = relative_path.as_ref();
    if relative_path.is_absolute() && relative_path.exists() {
        return Some(relative_path.to_path_buf());
    }

    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let repo_root = manifest_dir.parent().unwrap_or(&manifest_dir);
    let mut candidates = vec![
        repo_root.join(PARSER_DATA_DIR).join(relative_path),
        manifest_dir
            .join("..")
            .join(PARSER_DATA_DIR)
            .join(relative_path),
    ];

    if let Ok(current_dir) = std::env::current_dir() {
        candidates.push(current_dir.join(PARSER_DATA_DIR).join(relative_path));
        candidates.push(
            current_dir
                .join("..")
                .join(PARSER_DATA_DIR)
                .join(relative_path),
        );
    }

    if let Ok(mut exe_dir) = std::env::current_exe() {
        exe_dir.pop();
        candidates.push(exe_dir.join(PARSER_DATA_DIR).join(relative_path));
        candidates.push(
            exe_dir
                .join("resources")
                .join(PARSER_DATA_DIR)
                .join(relative_path),
        );
        if let Some(parent) = exe_dir.parent() {
            candidates.push(parent.join(PARSER_DATA_DIR).join(relative_path));
            candidates.push(
                parent
                    .join("resources")
                    .join(PARSER_DATA_DIR)
                    .join(relative_path),
            );
        }
    }

    candidates.into_iter().find(|path| path.exists())
}

pub fn read_to_string(relative_path: impl AsRef<Path>) -> io::Result<String> {
    let relative_path = relative_path.as_ref();
    let path = locate_file(relative_path).ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::NotFound,
            format!("{} not found in parser data", relative_path.display()),
        )
    })?;

    std::fs::read_to_string(path)
}
