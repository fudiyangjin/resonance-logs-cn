use std::env;
use std::path::{Path, PathBuf};

fn main() {
    // Read version from tauri.conf.json and expose as APP_VERSION environment variable
    let tauri_conf =
        std::fs::read_to_string("tauri.conf.json").expect("Failed to read tauri.conf.json");
    let conf: serde_json::Value =
        serde_json::from_str(&tauri_conf).expect("Failed to parse tauri.conf.json");
    let version = conf["version"]
        .as_str()
        .expect("No version field in tauri.conf.json");
    println!("cargo:rustc-env=APP_VERSION={}", version);

    // Forward API URLs from build environment to compile-time env vars
    if let Ok(url) = env::var("UPLOAD_API_URL") {
        println!("cargo:rustc-env=UPLOAD_API_URL={}", url);
    }
    if let Ok(url) = env::var("TRACKING_API_URL") {
        println!("cargo:rustc-env=TRACKING_API_URL={}", url);
    }

    // Build module_optimizer C++ code
    build_module_optimizer();

    // Use the standard debug_assertions cfg to differentiate dev vs release.
    if cfg!(debug_assertions) {
        println!("DEBUG (dev) BUILD");
        tauri_build::build();
    } else {
        let mut windows = tauri_build::WindowsAttributes::new();
        windows = windows.app_manifest(include_str!("app.manifest"));
        tauri_build::try_build(tauri_build::Attributes::new().windows_attributes(windows))
            .expect("failed to run build script");
    }
}

fn build_module_optimizer() {
    let manifest_dir =
        PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("missing CARGO_MANIFEST_DIR"));
    let cpp_dir = manifest_dir.join("src/module_optimizer/cpp");

    // Check if cpp directory exists
    if !cpp_dir.exists() {
        println!(
            "cargo:warning=C++ directory not found: {:?}, skipping module_optimizer build",
            cpp_dir
        );
        return;
    }

    let cccl_root = find_cccl_root();
    let cuda_lib_dir = compile_cuda(&cpp_dir, cccl_root.as_deref());
    let use_cuda = cuda_lib_dir.is_some();
    let use_opencl = detect_opencl();

    println!("cargo:warning=CUDA enabled: {}", use_cuda);
    println!("cargo:warning=OpenCL detected: {}", use_opencl);

    // Build C++ source files list
    let mut cpp_sources = vec![
        cpp_dir.join("module_optimizer.cpp"),
        cpp_dir.join("ffi_bridge.cpp"),
    ];

    if use_cuda {
        println!("cargo:rustc-cfg=feature=\"cuda\"");
    }

    // Add OpenCL source file if available
    if use_opencl {
        println!("cargo:rustc-cfg=feature=\"opencl\"");
        cpp_sources.push(cpp_dir.join("module_optimizer_opencl.cpp"));
    }

    // Use cxx-build to compile
    let mut build = cxx_build::bridge("src/module_optimizer/bridge.rs");

    build
        .files(&cpp_sources)
        .include(&cpp_dir)
        .std("c++17")
        .flag_if_supported("/utf-8")
        .flag_if_supported("/EHsc")
        .flag_if_supported("/bigobj")
        .flag_if_supported("/MD")
        .flag_if_supported("-O2");

    // CUDA configuration
    if use_cuda {
        build.define("USE_CUDA", None);

        if let Some(lib_dir) = cuda_lib_dir {
            println!(
                "cargo:warning=Linking CUDA static library from: {}",
                lib_dir.display()
            );
            println!("cargo:rustc-link-search=native={}", lib_dir.display());
        }

        println!("cargo:rustc-link-lib=static=module_optimizer_cuda");
        emit_cuda_runtime_links();
    }

    // OpenCL configuration
    if use_opencl {
        build.define("USE_OPENCL", None);

        if let Some(opencl_path) = find_opencl() {
            build.include(opencl_path.join("include"));
            println!(
                "cargo:rustc-link-search=native={}",
                opencl_path.join("lib/x64").display()
            );
        }
        println!("cargo:rustc-link-lib=OpenCL");
    }

    build.compile("module_optimizer_cpp");

    // Rerun if changed
    println!("cargo:rerun-if-changed=src/module_optimizer/bridge.rs");
    println!("cargo:rerun-if-changed=src/module_optimizer/cpp/");
    println!("cargo:rerun-if-env-changed=CUDA_HOME");
    println!("cargo:rerun-if-env-changed=CUDA_PATH");
    println!("cargo:rerun-if-env-changed=OPENCL_HOME");
    println!("cargo:rerun-if-env-changed=CCCL_ROOT");
    println!("cargo:rerun-if-env-changed=CMAKE_CUDA_ARCHITECTURES");
}

fn detect_opencl() -> bool {
    find_opencl().is_some()
}

fn candidate_cuda_homes() -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    for key in ["CUDA_HOME", "CUDA_PATH"] {
        if let Some(path) = env::var_os(key) {
            candidates.push(PathBuf::from(path));
        }
    }

    if cfg!(target_os = "windows") {
        let root = PathBuf::from(r"C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA");
        if let Ok(entries) = std::fs::read_dir(root) {
            let mut version_dirs: Vec<_> = entries
                .flatten()
                .map(|entry| entry.path())
                .filter(|path| path.is_dir())
                .collect();
            version_dirs.sort_by(|left, right| right.file_name().cmp(&left.file_name()));
            candidates.extend(version_dirs);
        }
    }

    candidates
}

fn find_cuda_home() -> Option<PathBuf> {
    for path in candidate_cuda_homes() {
        if path.join("include").exists() {
            return Some(path);
        }
    }

    None
}

fn find_cuda_lib_dir(cuda_home: &Path) -> Option<PathBuf> {
    for candidate in [cuda_home.join("lib/x64"), cuda_home.join("lib")] {
        if candidate.exists() {
            return Some(candidate);
        }
    }

    None
}

fn find_opencl() -> Option<PathBuf> {
    if let Some(cuda_home) = find_cuda_home() {
        let opencl_lib = cuda_home.join("lib/x64/OpenCL.lib");

        if opencl_lib.exists() {
            return Some(cuda_home);
        }
    }

    if let Ok(opencl_home) = env::var("OPENCL_HOME") {
        let p = PathBuf::from(&opencl_home);
        let opencl_lib = p.join("lib/x64/OpenCL.lib");

        if opencl_lib.exists() {
            return Some(p);
        }
    }

    None
}

fn find_cccl_root() -> Option<PathBuf> {
    let cccl_root = env::var_os("CCCL_ROOT").map(PathBuf::from)?;

    let required_dirs = [
        cccl_root.join("cub"),
        cccl_root.join("thrust"),
        cccl_root.join("libcudacxx/include"),
    ];

    if required_dirs.iter().all(|dir| dir.exists()) {
        println!("cargo:warning=Using CCCL from: {}", cccl_root.display());
        Some(cccl_root)
    } else {
        println!(
            "cargo:warning=CCCL_ROOT is set but missing required directories under {}",
            cccl_root.display()
        );
        None
    }
}

fn compile_cuda(cpp_dir: &Path, cccl_root: Option<&Path>) -> Option<PathBuf> {
    let cuda_file = cpp_dir.join("module_optimizer_cuda.cu");

    if !cuda_file.exists() {
        println!("cargo:warning=CUDA source file not found: {:?}", cuda_file);
        return None;
    }

    let Some(cccl_root) = cccl_root else {
        println!("cargo:warning=CCCL_ROOT is not configured, skipping CUDA build");
        return None;
    };

    let cuda_architectures =
        env::var("CMAKE_CUDA_ARCHITECTURES").unwrap_or_else(|_| "75;86;89;120".to_string());
    let build_result = std::panic::catch_unwind(|| {
        let mut config = cmake::Config::new(cpp_dir);
        config
            // cxx-build is configured with /MD and optimization flags in every Cargo profile,
            // so the CUDA static library must use a matching MSVC runtime configuration.
            .profile("Release")
            .define("CMAKE_CUDA_ARCHITECTURES", cuda_architectures.as_str())
            .define("CCCL_ROOT", cccl_root);
        config.build()
    });

    let dst = match build_result {
        Ok(dst) => dst,
        Err(_) => {
            println!("cargo:warning=CMake CUDA build failed, falling back to CPU version");
            return None;
        }
    };

    for lib_dir in [dst.join("lib")] {
        if lib_dir.exists() {
            println!("cargo:warning=CUDA compilation successful");
            return Some(lib_dir);
        }
    }

    println!(
        "cargo:warning=CMake CUDA build completed but no library directory was found under {}",
        dst.display()
    );
    None
}

fn emit_cuda_runtime_links() {
    if let Some(cuda_home) = find_cuda_home() {
        if let Some(lib_dir) = find_cuda_lib_dir(&cuda_home) {
            println!(
                "cargo:warning=Linking CUDA runtime from: {}",
                lib_dir.display()
            );
            println!("cargo:rustc-link-search=native={}", lib_dir.display());
        }
    }

    println!("cargo:rustc-link-lib=cudart_static");
    println!("cargo:rustc-link-lib=cuda");
}
